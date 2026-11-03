(function (root) {
  'use strict';
  function intentionalRepetition(request) {
    return /\b(?:repeat|reproduce|print|write)\b[^\n]{0,100}\b\d+\s*(?:times|repetitions|copies)\b/i.test(String(request||''));
  }
  function hasRepetition(value) {
    const text=String(value||'').slice(-4096).normalize('NFC');
    if(text.includes('```'))return false;
    const words=text.match(/[\p{L}\p{M}\p{N}]+/gu)||[];
    for(let tail=0;tail<=1;tail++)for(let size=1;size<=8;size++){
      const end=words.length-tail,unit=words.slice(end-size,end).join(' ');let count=1;
      if(end<size||!unit)continue;
      while(end-(count+1)*size>=0&&words.slice(end-(count+1)*size,end-count*size).join(' ')===unit)count++;
      if(count>=(size===1?16:8)&&count*size>=24)return true;
    }
    // Also catch loops emitted without spaces, including non-Latin scripts.
    const loop=text.trim().match(/(.{1,24})\1{15,}$/u);
    return Boolean(loop&&/[\p{L}\p{N}]/u.test(loop[1])&&loop[0].length>=96);
  }
  // Separate model loading, token inactivity and total budgets. A slow but
  // productive CPU model must not be mistaken for an unresponsive request.
  async function generate({ model, system, user, format, signal, onProgress, onMetrics, onToken, messages, images = [],
    fetchImpl = root.fetch.bind(root), startupMs = 180000, idleMs = 60000, totalMs = 360000, maxTokens = 2048, numCtx = 4096, detectRepetition = false, repeatPenalty = 1.1 }) {
    const controller = new AbortController();
    let reason = '', idleTimer, reader, completed = false;
    const expire = message => { reason = message; controller.abort(); };
    const arm = (ms, message) => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => expire(message), ms);
    };
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    arm(startupMs, 'The local visual model did not start responding. Check that Ollama is running, or choose a smaller installed model.');
    const totalTimer = setTimeout(() => expire('The local visual model reached its generation time limit. Choose a smaller installed model or simplify the diagram.'), totalMs);
    try {
      const request={model,stream:true,think:false,format,keep_alive:'5m',messages:messages||[{role:'system',content:system},{role:'user',content:user,...(images.length?{images:images.map(image=>image.data)}:{})}],options:{temperature:.1,num_predict:maxTokens,num_ctx:numCtx,repeat_penalty:repeatPenalty,repeat_last_n:128}};
      const response=root.BrownLocalInference?await root.BrownLocalInference.chat(request,{fetchImpl,signal:controller.signal,purpose:format?'structured':'answer'}):await fetchImpl('http://127.0.0.1:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify(request)});
      if (!response.ok) {
        const detail = (await response.text()).slice(0, 500);
        const error = new Error('Local visual model returned HTTP ' + response.status + (detail ? ': ' + detail : ''));
        error.code = response.status >= 500 || response.status === 404 ? 'MODEL_UNAVAILABLE' : 'REQUEST_REJECTED';
        throw error;
      }
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', content = '', reported = false;
      function accept(line) {
        if (!line.trim()) return;
        const part = JSON.parse(line);
        if (part.error) { const error = new Error(part.error); error.code = 'MODEL_UNAVAILABLE'; throw error; }
        if (part.message?.content || part.message?.thinking) {
          arm(idleMs, 'The local visual model stopped responding. Try again or choose another installed model.');
          if (!reported) { reported = true; onProgress?.(); }
        }
        content += part.message?.content || '';
        if(detectRepetition&&hasRepetition(content)){const error=new Error('The selected model became stuck repeating its output.');error.code='REPETITIVE_OUTPUT';controller.abort();throw error;}
        if(part.message?.content)onToken?.(content);
        if (part.done) {
          try{root.ultronAPI?.recordLocalDiagnostic?.({model,status:'finished',code:part.done_reason==='length'?'OUTPUT_LIMIT':'OK',loadMs:Number(part.load_duration||0)/1e6,promptMs:Number(part.prompt_eval_duration||0)/1e6,generationMs:Number(part.eval_duration||0)/1e6,tokens:Number(part.eval_count||0)})?.catch?.(()=>{});}catch(_){}
          onMetrics?.({model,loadMs:Number(part.load_duration||0)/1e6,promptMs:Number(part.prompt_eval_duration||0)/1e6,generationMs:Number(part.eval_duration||0)/1e6,tokens:Number(part.eval_count||0)});
          if (part.done_reason === 'length') {
            const error = new Error('The visual specification exceeded the local model output limit. Try a smaller diagram.');
            error.code = 'OUTPUT_LIMIT'; error.partial=content; throw error;
          }
          completed = true;
        }
      }
      while (!completed) {
        const { value, done } = await reader.read();
        if (done) { buffer += decoder.decode(); break; }
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          accept(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1);
        }
      }
      if (buffer.trim()) accept(buffer);
      if (!completed) {const error=new Error('The local model connection ended before generation completed. Please retry.');error.code='INCOMPLETE_OUTPUT';error.partial=content;throw error;}
      if (!content.trim()) {
        const error = new Error('The local visual model finished without a visual specification.');
        error.code = 'EMPTY_OUTPUT'; throw error;
      }
      return content;
    } catch (error) {
      try{root.ultronAPI?.recordLocalDiagnostic?.({model,status:'failed',code:signal?.aborted?'CANCELLED':error.code||'STREAM_ERROR'})?.catch?.(()=>{});}catch(_){}
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (reason) { const failure = new Error(reason); failure.code = 'MODEL_TIMEOUT'; throw failure; }
      throw error;
    } finally {
      clearTimeout(idleTimer); clearTimeout(totalTimer);
      signal?.removeEventListener('abort', cancel);
      if (reader) { try { await reader.cancel(); } catch (_) {} }
    }
  }
  function recoveryModel(models, failed) {
    const original = models.find(item => item.name === failed);
    return models.filter(item => item.name && item.name !== failed && !/(?:-cloud|:cloud)$/i.test(item.name)
      && !/(?:llava|vision|bakllava|moondream|minicpm-v)/i.test(item.name)
      && (!item.capabilities?.length || item.capabilities.includes('completion'))
      && (!original?.size || !item.size || item.size < original.size))
      .map(item => {
        const count = Number(String(item.details?.parameter_size || '').match(/[\d.]+/)?.[0]);
        const tiny = /tinyllama|(?:0\.\d+|1(?:\.\d+)?)b/i.test(item.name) || /M$/i.test(item.details?.parameter_size || '') || count > 0 && count < 2;
        return { ...item, score: (tiny ? 0 : 100) + (/phi[34]|qwen|llama3|gemma|mistral/i.test(item.name) ? 10 : 0) };
      }).sort((a, b) => b.score - a.score || (a.size || Infinity) - (b.size || Infinity))[0]?.name || '';
  }
  // One recovery for the whole visual request, shared across validation repairs.
  // Keep the chosen recovery model on subsequent repairs, without changing chat's model.
  function createGenerator({ model, models = [], onRecovery, complete = generate, ...options }) {
    let currentModel = model, recovered = false, tokenBudget = 2048;
    return async (system, user, format) => {
      const run = maxTokens => complete({ ...options, model: currentModel, system, user, format, maxTokens });
      try { return await run(tokenBudget); }
      catch (error) {
        if (options.signal?.aborted || error.name === 'AbortError' || recovered || error.code === 'REQUEST_REJECTED') throw error;
        const retryable = ['OUTPUT_LIMIT', 'EMPTY_OUTPUT', 'MODEL_TIMEOUT', 'MODEL_UNAVAILABLE'].includes(error.code)
          || /fetch failed|failed to fetch|network|connection|out of memory|stopped responding/i.test(error.message || '');
        if (!retryable) throw error;
        recovered = true;
        const next = error.code === 'OUTPUT_LIMIT' ? currentModel : recoveryModel(models, currentModel) || currentModel;
        onRecovery?.({ from: currentModel, to: next, reason: error.code || 'CONNECTION' });
        currentModel = next;
        tokenBudget = error.code === 'OUTPUT_LIMIT' ? 3072 : 2048;
        return await run(tokenBudget);
      }
    };
  }
  const api = { generate, createGenerator, recoveryModel, hasRepetition, intentionalRepetition };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownVisualModelStream = api;
})(typeof window === 'undefined' ? globalThis : window);
