'use strict';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const { renderDiagram } = require('../src/main/visual-render-process');
const planner = require('../src/renderer/visual-planner');
const { example } = require('./visual-planner.test');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const owner = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  try {
    await owner.loadFile(path.join(__dirname, 'fixtures/speech-pcm.html'));
    const html = await renderDiagram('graph TD\nA[Input Program] --> B{Lexical Analysis}\nB -->|Token Stream| C[Token Stream]\nC --> D{Syntax Analysis}\nD --> E[Syntax Tree]', owner.webContents);
    assert.match(html, /<svg/);
    assert.match(html, /Lexical Analysis/);
    const supplied = await planner.generate({ request: 'Draw a horizontal compiler pipeline with lexical analysis, parsing, semantic analysis, intermediate code generation, optimization, and machine code generation.', generate: () => { throw Error('Supplied stages must not use the model'); } });
    const pipelineHtml = await renderDiagram(supplied.match(/```mermaid\n([\s\S]*?)```/)[1], owner.webContents);
    assert.match(pipelineHtml, /<svg/);
    assert.match(pipelineHtml, /lexical analysis/);
    await owner.webContents.executeJavaScript(`document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" href="../../src/renderer/index.css">'); document.body.innerHTML = ${JSON.stringify(pipelineHtml)}; document.body.style.cssText = 'background:#111;color:white;padding:32px;display:block;overflow:auto'; new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))));`);
    await owner.webContents.capturePage().then(image => require('node:fs').writeFileSync(path.join(__dirname, '../tmp/prompt-pipeline-preview.png'), image.toPNG()));
    for (const family of ['flowchart', 'sequence', 'architecture']) {
      const answer = planner.compile(example(family));
      const source = answer.match(/```mermaid\n([\s\S]*?)```/)[1];
      const rendered = await renderDiagram(source, owner.webContents);
      assert.match(rendered, /<svg/, family + ' produces SVG');
      assert(!rendered.includes('data-visual-error'), family + ' retains its rendering family');
      if (family === 'architecture') assert.match(rendered, /System Architecture Diagram/);
      assert.equal(await renderDiagram(source, owner.webContents), rendered, 'verified visuals reuse cached layout');
    }
    const invalid = await renderDiagram('sequenceDiagram\nthis is not valid syntax ###', owner.webContents);
    assert.match(invalid, /data-visual-error/);
    assert(!invalid.includes('native-flowchart'), 'failed sequence diagrams never become flowcharts');
    const worker = BrowserWindow.getAllWindows().find(window => window !== owner);
    assert(worker);
    assert.notEqual(worker.webContents.getOSProcessId(), owner.webContents.getOSProcessId(), 'layout has its own renderer process');
    const chartBody = planner.compile(example('chart')).match(/```chart\n([\s\S]*?)```/)[1];
    const chart = await worker.webContents.executeJavaScript(`window.UltronVisualEngine.renderChart(${JSON.stringify(chartBody)})`);
    assert.match(chart, /<svg/); assert.match(chart, /Horizontal axis: Product/); assert.match(chart, /Vertical axis: Units sold/);
    for(const request of [
      'Create a scatter plot with Study hours on the x-axis and Score on the y-axis. Use these pairs: (1,40), (2,50), (3,55), (4,70), (5,75), (6,85). Do not invent additional observations.',
      'Create a stacked bar chart of quarterly device sales. Q1: Phones 40, Laptops 20. Q2: Phones 50, Laptops 30. Q3: Phones 45, Laptops 35. Include a legend and label the axis Units sold.'
    ]) {
      const answer=await planner.generate({request,generate:()=>{throw Error('Supplied data needs no model');}});
      const body=answer.match(/```chart\n([\s\S]*?)```/)[1];
      const rendered=await worker.webContents.executeJavaScript(`window.UltronVisualEngine.renderChart(${JSON.stringify(body)})`);
      assert.match(rendered,/<svg/);assert(!rendered.includes('could not be rendered'));
      if(request.includes('scatter')) { assert.equal((rendered.match(/<circle /g)||[]).length,6);assert.match(rendered,/Study hours/);assert.match(rendered,/Score/); }
      else { assert.match(rendered,/Phones/);assert.match(rendered,/Laptops/);assert.match(rendered,/Q3/); }
    }
    const browser={family:'sequence',title:'Webpage loading',participants:[{id:'browser',label:'Browser'},{id:'dns',label:'DNS Server'},{id:'web',label:'Web Server'}],messages:[{from:'browser',to:'dns',label:'Resolve hostname'},{from:'dns',to:'browser',label:'Return IP',reply:true},{from:'browser',to:'web',label:'Request page'},{from:'web',to:'browser',label:'Return page',reply:true}]};
    const browserAnswer=await planner.generate({request:'Explain how a browser loads a webpage. First show a sequence diagram involving Browser, DNS Server, and Web Server. Then show a table explaining each message.',generate:async()=>JSON.stringify(browser)});
    assert.match(browserAnswer,/\| Message \| Sender \| Receiver \|/);
    const browserHtml=await renderDiagram(browserAnswer.match(/```mermaid\n([\s\S]*?)```/)[1],owner.webContents);
    for(const name of ['Browser','DNS Server','Web Server'])assert(browserHtml.includes(name));
    await worker.webContents.executeJavaScript(`window.savedDiagramRender = window.UltronVisualEngine.renderMermaidDiagram;
      window.UltronVisualEngine.renderMermaidDiagram = async () => '<svg width="100" height="100"><g class="node"><rect width="50" height="50"/></g><g class="node" transform="translate(10,10)"><rect width="50" height="50"/></g></svg>'; void 0;`);
    await assert.rejects(renderDiagram('flowchart TD\nOverlapA --> OverlapB', owner.webContents), /nodes overlap/);
    await worker.webContents.executeJavaScript('window.UltronVisualEngine.renderMermaidDiagram = window.savedDiagramRender; void 0;');
    const block = worker.webContents.executeJavaScript('(() => { const end = performance.now() + 500; while (performance.now() < end) {} })()');
    const elapsed = await owner.webContents.executeJavaScript('new Promise(resolve => { const start = performance.now(); setTimeout(() => resolve(performance.now() - start), 50); })');
    assert(elapsed < 300, 'chat renderer stays responsive during layout CPU work');
    await block;
    const id = worker.id;
    owner.destroy();
    const deadline = Date.now() + 1000;
    while (BrowserWindow.fromId(id) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
    assert(!BrowserWindow.fromId(id), 'closing the chat cleans up the hidden renderer');
    console.log('PASS: real Mermaid SVG, isolated renderer process, responsive chat and cleanup.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Visual process test timed out'); app.exit(1); }, 25000);
