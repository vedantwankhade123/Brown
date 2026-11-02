const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require.resolve('../src/renderer/visual-loading.js'), 'utf8');
(async () => {
  let calls = 0, rendered = 0;
  const root = { ultronAPI: { renderVisualDiagram: async () => { calls++; throw new Error("Error invoking remote method 'render-visual-diagram': Error: No handler registered for 'render-visual-diagram'"); } },
    UltronVisualEngine: { renderMermaidDiagram: async () => { rendered++; return '<svg></svg>'; } } };
  vm.runInNewContext(code, { window: root });
  assert.equal(await root.BrownVisualLoading.renderDiagram('graph TD\nA-->B'), '<svg></svg>');
  assert.equal(await root.BrownVisualLoading.renderDiagram('graph TD\nA-->C'), '<svg></svg>');
  assert.equal(calls, 1, 'avoid repeatedly invoking a missing handler');
  assert.equal(rendered, 2, 'valid diagrams remain available locally');
  const broken = { ultronAPI: { renderVisualDiagram: async () => ({ success: false, error: 'Diagram nodes overlap' }) },
    UltronVisualEngine: { renderMermaidDiagram: async () => { throw Error('must not hide genuine layout failures'); } } };
  vm.runInNewContext(code, { window: broken });
  await assert.rejects(broken.BrownVisualLoading.renderDiagram('graph TD'), /nodes overlap/);
  for (const html of ['', '<div></div>', '<div data-visual-error>Invalid syntax</div>']) {
    const empty = { ultronAPI: { renderVisualDiagram: async () => ({ success: true, html }) } };
    vm.runInNewContext(code, { window: empty });
    await assert.rejects(empty.BrownVisualLoading.renderDiagram('graph TD'), /did not produce a valid diagram/, 'empty success must not become a blank result');
  }
  const ipc = fs.readFileSync(require.resolve('../src/main/ipc.js'), 'utf8');
  const start = ipc.indexOf('function registerVisualIpcHandlers(');
  const handlers = new Map();
  const context = vm.createContext({ ipcMain: { handle: (name, handler) => { assert(!handlers.has(name)); handlers.set(name, handler); } } });
  vm.runInContext(ipc.slice(start, ipc.indexOf('/**', start)), context);
  context.registerVisualIpcHandlers(); context.registerVisualIpcHandlers();
  assert(handlers.has('render-visual-diagram'));
  const setup = ipc.slice(ipc.indexOf('function setupIpcHandlers()'), ipc.indexOf('function setupIpcHandlers()') + 300);
  assert(setup.indexOf('registerVisualIpcHandlers()') < setup.indexOf('registerAudioIpcHandlers()'));
  console.log('PASS: independent visual IPC registration, stale-main local fallback and genuine error preservation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
