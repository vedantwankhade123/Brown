const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
function checkMath() {
  const assert = (value, message) => { if (!value) throw Error(message); };
  const source = String.raw`Bernoulli's equation:
\[p + \frac{1}{2}\rho v^2 + \rho gh = C\]
where \(\rho\) is density and $v$ is velocity.`;
  const target = document.createElement('div'); document.body.append(target);
  const count = html => { const el = document.createElement('div'); el.innerHTML = html; return el.querySelectorAll('.katex').length; };
  const streaming = renderChatMarkdown(source, { streaming: true });
  renderMessageContent(target, source);
  assert(count(streaming) === 3 && target.querySelectorAll('.katex').length === 3, 'Math changed from streaming to completion');
  assert(target.querySelector('.mfrac'), 'Fraction disappeared');
  let saved = source; for (let i = 0; i < 4; i++) saved = structureReadableMarkdown(saved);
  assert(!saved.includes('class="katex'), 'Cleanup persisted presentation HTML');
  saved = JSON.parse(JSON.stringify({ text: saved })).text; renderMessageContent(target, saved);
  assert(target.querySelectorAll('.katex').length === 3 && target.querySelector('.mfrac'), 'Reload lost the formula');
  renderMessageContent(target, saved); assert(!target.querySelector('.katex .katex'), 'Repeated render nested KaTeX');
  const legacy = window.katex.renderToString(String.raw`p+\frac{1}{2}\rho v^2=C`,{displayMode:true});
  const recovered = structureReadableMarkdown('Earlier answer:\n'+legacy);
  assert(!recovered.includes('class="katex')&&recovered.includes('\\frac'),'Older saved KaTeX source was not recovered');
  assert(count(renderChatMarkdown(recovered))===1,'Older formula failed after reload');
  const code = ['```latex', String.raw`\frac{1}{2} + $x$`, '```'].join('\n');
  assert(count(renderChatMarkdown(code)) === 0, 'Code was typeset');
  assert(count(renderChatMarkdown('Costs $2000 and $50.')) === 0, 'Currency was typeset');
  const table = String.raw`| Variable | Formula |
| --- | --- |
| Density | $\rho$ |`;
  assert(count(renderChatMarkdown(table)) === 1, 'Table math lost');
  const multiline = String.raw`\[
\begin{aligned}a&=b+c\\d&=e\end{aligned}
\]`;
  assert(count(renderChatMarkdown(multiline)) === 1, 'Multiline math lost');
  const broken = renderChatMarkdown(String.raw`$\notARealCommand{x}$`);
  assert(!broken.includes('BROWNMATHPLACEHOLDER') && broken.includes('notARealCommand'), 'Invalid formula did not preserve readable source');
  const oldKatex = window.katex; window.katex = null;
  assert(renderChatMarkdown(String.raw`\(x^2\)`).includes('x^2'), 'Missing library erased formula'); window.katex = oldKatex;
  assert(!renderChatMarkdown('<img src=x onerror="alert(1)">').includes('onerror'), 'Markdown sanitization bypassed');
  assert(!renderChatMarkdown(String.raw`$\href{javascript:alert(1)}{x}$`).includes('href="javascript:'), 'KaTeX trust enabled');
  target.remove(); return true;
}
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1000, height: 750, webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: false, preload: path.resolve('src/preload/preload.js') } });
  try {
    win.webContents.on('console-message', (_event, _level, message) => { if (/Error|Uncaught/.test(message)) console.error(message); });
    win.webContents.session.webRequest.onBeforeRequest((details, done) => done({ cancel: details.resourceType === 'script' }));
    await win.loadFile(path.resolve('src/renderer/index.html'));
    for (const file of ['node_modules/katex/dist/katex.min.js', 'node_modules/katex/dist/contrib/auto-render.min.js']) await win.webContents.executeJavaScript(fs.readFileSync(file, 'utf8') + ';void 0;');
    const source = fs.readFileSync('src/renderer/renderer.js', 'utf8');
    const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const tableStart=source.indexOf('function convertPipeBulletRunsToTableRows(');
    await win.webContents.executeJavaScript(source.slice(tableStart,source.indexOf('\nfunction ',tableStart+1)));
    await win.webContents.executeJavaScript(extract('function dedupeRunawayRepetitions(', 'function highlightSyntax('));
    await win.webContents.executeJavaScript('window._activeThinkingController=null;window.isThinkingMarkup=window.isRichResultMarkup=window.isAgentWidgetMarkup=()=>false;window.formatCodeBlocks=window.wrapMarkdownTables=window.renderMarkdownCallouts=()=>{};void 0;');
    await win.webContents.executeJavaScript(extract('function renderMessageContent(', 'function wrapMarkdownTables('));
    if (!await win.webContents.executeJavaScript('(' + checkMath.toString() + ')()')) throw Error('Math checks failed');
    await win.webContents.executeJavaScript(fs.readFileSync('src/renderer/geometry-diagrams.js','utf8'));
    await win.webContents.executeJavaScript(extract('function formatCodeBlocks(', 'function extractCreatedFilesFromText('));
    const planner=require('../src/renderer/visual-planner');
    const answer=await planner.generate({request:'Explain with a diagram how to find the radius of a circle',generate:async()=>{throw Error('No model should be needed');}});
    await win.webContents.executeJavaScript(`(()=>{
      document.querySelectorAll('#app-splash-screen,.app-skeleton-overlay').forEach(element=>element.remove());
      document.body.style.cssText='opacity:1!important;visibility:visible!important;display:block!important';
      const target=document.createElement('div');target.style.cssText='position:fixed;inset:40px;padding:24px;background:#181818;z-index:2147483647;color:white;overflow:auto';document.body.append(target);
      renderMessageContent(target,${JSON.stringify(answer)});
      if(!target.querySelector('.geometry-diagram circle')||target.querySelector('pre code.language-geometry'))throw Error('Geometry remained a code block');
      if(target.querySelectorAll('.katex').length!==1)throw Error('Geometry explanation lost radius formulas');
      if(!target.textContent.includes('d = 2r'))throw Error('Diameter label missing');
    })()`);
    win.webContents.invalidate();
    await new Promise(resolve=>setTimeout(resolve,300));
    await fs.promises.writeFile(path.resolve('tmp/geometry-radius-preview.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS: real preload sanitizer + KaTeX retain formulas through streaming, completion, repeated cleanup and reload; code, currency, tables, multiline formulas and safe fallbacks.');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
