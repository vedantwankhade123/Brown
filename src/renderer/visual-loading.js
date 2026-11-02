(function (root) {
  const visualLanguage = /^(mermaid|chart|geometry|artifact|json-chart|data-chart|gen-ui|widget|generative-ui|interactive-ui|html-widget|flowchart|graph|mindmap|sequencediagram|erdiagram|statediagram|gantt|journey|timeline|sankey|quadrantchart|xychart|requirementdiagram|architecture|packet|block|gitgraph|classdiagram)$/i;
  function diagramLanguage(source, language = '') {
    if (!/^(code|text|plaintext|markdown|md)?$/i.test(language)) return language;
    const value = String(source || '').trimStart();
    if (/^(?:graph|flowchart)\s+(?:TD|TB|LR|RL|BT)\b/i.test(value)
        || /^(?:sequenceDiagram|classDiagram|erDiagram|stateDiagram(?:-v2)?|mindmap|gantt)\s*(?:\r?\n|$)/i.test(value)) return 'mermaid';
    return language;
  }
  // A streaming fence is data in progress, never a finished code example.
  function prepare(text, { streaming = false } = {}) {
    const value = String(text || '');
    const fence = /^\s*```([^\n`]*)\s*$/gm;
    let opening = null, match;
    while ((match = fence.exec(value))) {
      if (opening) opening = null;
      else {
        opening = { index: match.index, language: match[1].trim().toLowerCase() };
        opening.language = diagramLanguage(value.slice(fence.lastIndex), opening.language);
        // Freeze at the first visual, including its trailing explanation. Keeping
        // only the introduction also stops reparsing a growing hidden diagram.
        if (streaming && visualLanguage.test(opening.language)) return { text: value.slice(0, opening.index), pending: true };
      }
    }
    if (!opening || !visualLanguage.test(opening.language)) return { text: value, pending: false };
    return { text: value.slice(0, opening.index), pending: streaming };
  }
  const renders = new WeakMap();
  const clocks=new WeakMap();
  function transitionOut(container){
    if(!container?.querySelectorAll)return;
    for(const canvas of container.querySelectorAll('.visual-preview-placeholder:not(.is-closing)')){
      stopStatus(canvas.parentElement);
      const rect=canvas.getBoundingClientRect();
      if(!canvas.isConnected||!rect.width||!rect.height||root.matchMedia?.('(prefers-reduced-motion: reduce)').matches){canvas.remove();continue;}
      // Keep the existing animated surface alive during replacement. Moving it
      // avoids cloning/restarting its gradient or delaying the completed result.
      Object.assign(canvas.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',zIndex:'1001',pointerEvents:'none'});
      document.body.append(canvas);canvas.classList.add('is-closing');
      let timeout;const finish=()=>{clearTimeout(timeout);canvas.remove();};
      canvas.addEventListener('animationend',event=>{if(event.target===canvas&&event.animationName==='visual-placeholder-exit')finish();});timeout=setTimeout(finish,240);
    }
  }
  function stopStatus(element){const timer=element&&clocks.get(element);if(timer!==undefined){clearInterval(timer);clocks.delete(element);}}
  function decorateStatus(element,{startedAt=Date.now(),preview=true}={}){
    if(!element||element.querySelector('.visual-elapsed'))return;
    const timer=document.createElement('time');timer.className='visual-elapsed';timer.setAttribute('aria-label','Elapsed time');timer.setAttribute('aria-live','off');element.append(timer);
    if(preview){element.classList.add('has-visual-placeholder');const surface=document.createElement('div');surface.className='visual-preview-placeholder';surface.setAttribute('aria-hidden','true');element.append(surface);}
    const update=()=>{const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000));timer.textContent='- '+(seconds>=60?Math.floor(seconds/60)+'m ':'')+(seconds%60)+'s';};update();
    const tick=setInterval(()=>{if(!element.isConnected){stopStatus(element);return;}update();},1000);
    tick.unref?.();clocks.set(element,tick);
  }
  function beginRender(container, anchor) {
    let state = renders.get(container);
    if (!state) { state = { pending: 0, hidden: new Set() }; renders.set(container, state); }
    state.pending++;
    let top = anchor;
    while (top.parentElement && top.parentElement !== container) top = top.parentElement;
    for (let next = top.nextSibling; next; next = next.nextSibling) {
      if (next.nodeType !== 1) continue;
      const code = next.matches('pre') ? next.querySelector('code') : null;
      const language = code?.className?.match(/language-([\w-]+)/)?.[1];
      if (visualLanguage.test(diagramLanguage(code?.textContent, language || '')) || next.matches('.visual-diagram-container, .visual-chart-wrapper, .visual-genui-wrapper')) continue;
      if (!next.hidden) { next.hidden = true; next.setAttribute('data-visual-deferred', ''); state.hidden.add(next); }
    }
    let finished = false;
    return () => {
      if (finished) return;
      finished = true;
      if (--state.pending) return;
      for (const element of state.hidden) { element.hidden = false; element.removeAttribute('data-visual-deferred'); }
      renders.delete(container);
    };
  }
  let bridgeUnavailable = false;
  function requireDiagram(html) {
    if (typeof html !== 'string' || !/<svg\b/i.test(html) || /data-visual-error/.test(html)) throw new Error('The renderer did not produce a valid diagram. Please try again.');
    return html;
  }
  async function renderDiagram(code) {
    if (!bridgeUnavailable && root.ultronAPI?.renderVisualDiagram) {
      try {
        const result = await root.ultronAPI.renderVisualDiagram(code);
        if (!result?.success) throw new Error(result?.error || 'Unable to render this diagram.');
        return requireDiagram(result.html);
      } catch (error) {
        if (!/No handler registered for ['"]?render-visual-diagram/i.test(String(error.message || error))) throw error;
        // A reloaded page can outlive an older main process during development.
        // Preserve diagrams until a full restart enables isolated rendering.
        bridgeUnavailable = true;
      }
    }
    if (root.UltronVisualEngine?.renderMermaidDiagram) return requireDiagram(await root.UltronVisualEngine.renderMermaidDiagram(code));
    throw new Error('The diagram renderer is unavailable. Restart Brown and try again.');
  }
  const api = { prepare, beginRender, diagramLanguage, renderDiagram, decorateStatus, stopStatus, transitionOut };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownVisualLoading = api;
})(typeof window === 'undefined' ? globalThis : window);
