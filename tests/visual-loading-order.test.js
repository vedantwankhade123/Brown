const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const visuals = require('../src/renderer/visual-loading');
const renderer = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
const tick = () => new Promise(setImmediate);
async function waitForRender(ready) {
  const deadline = Date.now() + 2000;
  while (!ready() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert(ready(), 'render callback started');
}
(async () => {
  const answer = 'Sure, here is the diagram.\n```mermaid\nflowchart TD\nA --> B\n```\nThis explains the flow.';
  assert.deepEqual(visuals.prepare(answer, { streaming: true }), { text: 'Sure, here is the diagram.\n', pending: true });
  assert.equal(visuals.prepare(answer).text, answer);
  assert.equal(visuals.diagramLanguage('graph TD\nA --> B', ''), 'mermaid');
  assert.equal(visuals.diagramLanguage('graph TD\nA --> B', 'text'), 'mermaid');
  assert.equal(visuals.diagramLanguage('const graph = "TD";', 'javascript'), 'javascript');
  assert(visuals.prepare('Intro\n```\ngraph TD\nA --> B\n```\nExplanation', { streaming: true }).pending);
  assert.equal(visuals.prepare('```javascript\nconst a = 1;\n```\nPlain explanation.', { streaming: true }).pending, false);
  assert(visuals.prepare('Intro\n```sequenceDiagram\nA->>B: Hi', { streaming: true }).pending);
  const { document } = parseHTML('<html><body><div class="message-content"><p id="intro">Sure, here is the diagram.</p><pre><code class="language-mermaid">flowchart TD\nA --> B</code></pre><p id="tail">This explains the flow.</p></div></body></html>');
  let resolveRender, rejectRender;
  const context = vm.createContext({ document, console, setTimeout, clearTimeout, setInterval, clearInterval,
    requestAnimationFrame: fn => setTimeout(fn, 0),
    window: { BrownVisualLoading: visuals, UltronVisualEngine: {
      renderMermaidDiagram: () => new Promise((resolve, reject) => { resolveRender = resolve; rejectRender = reject; })
    } }
  });
  vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/visual-loading.js'), 'utf8'), context);
  const start = renderer.indexOf('function formatCodeBlocks(');
  vm.runInContext(renderer.slice(start, renderer.indexOf('\nfunction extractCreatedFilesFromText(', start)), context);
  const content = document.querySelector('.message-content');
  context.formatCodeBlocks(content);
  assert(!document.querySelector('#intro').hidden);
  assert(document.querySelector('#tail').hidden, 'explanation stays buffered while diagram renders');
  const spinner = content.querySelector('.visual-loading-spinner');
  context.formatCodeBlocks(content);
  assert.equal(content.querySelector('.visual-loading-spinner'), spinner, 'reformatting preserves the spinner');
  assert(document.querySelector('#tail').hidden);
  await waitForRender(() => resolveRender);
  resolveRender('<svg id="ready"></svg>');
  await tick();
  assert(content.querySelector('#ready'));
  assert(!document.querySelector('#tail').hidden);
  assert(!content.querySelector('.visual-loading-state'));
  // A rejected renderer must settle the loader and reveal the explanation.
  content.innerHTML = '<pre><code>graph TD\nA --> C</code></pre><p id="tail">Explanation</p>';
  rejectRender = null;
  context.formatCodeBlocks(content);
  await waitForRender(() => rejectRender);
  rejectRender(new Error('Diagram failed'));
  await tick();
  assert.equal(content.querySelector('.visual-render-error').textContent, 'Diagram failed');
  assert(!document.querySelector('#tail').hidden);
  assert(!content.querySelector('.visual-loading-spinner'));
  // Streaming updates keep the same spinner and never move trailing prose above it.
  let frame;
  context.requestAnimationFrame = fn => { frame = fn; return 1; };
  context.cancelAnimationFrame = () => {};
  context.matchMedia = () => ({ matches: true });
  context.renderChatMarkdown = context.closeIncompleteMarkdown = context.escapeHtml = text => text;
  context.window.ultronAPI = { parseMarkdown: text => text };
  const painterStart = renderer.indexOf('function createSmoothStreamPainter(');
  vm.runInContext(renderer.slice(painterStart, renderer.indexOf('\nfunction createStreamBubblePainter(', painterStart)), context);
  const streaming = document.createElement('div');
  document.body.appendChild(streaming);
  const painter = context.createSmoothStreamPainter(streaming);
  painter.update(answer);
  frame(100);
  const persistentSpinner = streaming.querySelector('.visual-loading-spinner');
  assert(!streaming.querySelector('.visual-loading-state').hidden);
  assert.equal(streaming.querySelector('.stream-body').textContent.trim(), 'Sure, here is the diagram.');
  painter.update(answer + ' More detail after the diagram.');
  frame(250);
  assert.equal(streaming.querySelector('.visual-loading-spinner'), persistentSpinner);
  assert(!streaming.querySelector('.stream-body').textContent.includes('More detail'));
  console.log('PASS: visual introduction, persistent loader, deferred explanation, success and failure ordering.');
})().catch(error => { console.error(error); process.exitCode = 1; });
