'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
async function run() {
  const children = [], app = new EventEmitter();
  const context = vm.createContext({ module: { exports: {} }, process: { env: {} }, __dirname,
    setTimeout, clearTimeout, require(name) {
      if (name === 'path') return path;
      if (name === 'electron') return { app, utilityProcess: { fork() {
        const child = new EventEmitter();
        child.requests = [];
        child.postMessage = message => child.requests.push(message);
        child.kill = () => child.emit('exit', 1);
        children.push(child);
        return child;
      } } };
      throw new Error(name);
    }
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../src/main/voice-kokoro-process.js'), 'utf8'), context);
  const { runKokoroJob } = context.module.exports;
  const a = runKokoroJob('synthesizeKokoroSpeech', ['first'], '/cache', 1000);
  assert.equal(a, runKokoroJob('synthesizeKokoroSpeech', ['first'], '/cache', 1000));
  const b = runKokoroJob('synthesizeKokoroSpeech', ['second'], '/cache', 1000);
  await new Promise(setImmediate);
  assert.equal(children.length, 1);
  assert.equal(children[0].requests.length, 1, 'serialize inference');
  children[0].emit('message', { id: children[0].requests[0].id, result: { success: true } });
  assert.equal((await a).success, true);
  await new Promise(setImmediate);
  assert.equal(children[0].requests.length, 2);
  children[0].emit('exit', 1);
  assert.equal((await b).success, false);
  const c = runKokoroJob('synthesizeKokoroSpeech', ['hung'], '/cache', 10);
  assert.equal((await c).success, false);
  const d = runKokoroJob('synthesizeKokoroSpeech', ['retry'], '/cache', 1000);
  await new Promise(setImmediate);
  const latest = children.at(-1);
  latest.emit('message', { id: latest.requests[0].id, result: { success: true } });
  assert.equal((await d).success, true);
  assert.equal(app.listenerCount('will-quit'), 1);
  app.emit('will-quit');
  const source = fs.readFileSync(path.resolve(__dirname, '../src/renderer/renderer.js'), 'utf8');
  let metaCalls = 0;
  const session = { title: 'My custom title', titleLocked: true, messages: [
    { text: 'Explain JavaScript', isAi: false }, { text: 'JavaScript adds interaction to websites.', isAi: true }
  ], aiMeta: { heuristic: true, description: 'Explain JavaScript' } };
  const meta = vm.createContext({ conversationsStore: { a: session }, currentSessionId: 'a',
    isAwaitingResponse: true, window: {}, extractPlainTextFromMessage: text => text,
    renderSessionPanel() {}, touchSession() {}, saveConversationsToDisk() {}, logTrace() {},
    isGenericOrFragmentTitle: () => false, updateSessionTitle() { throw Error('Renamed title overwritten'); },
    async queryOfflineLLM() { metaCalls++; return JSON.stringify({ title: 'JavaScript', description: 'Explains how JavaScript adds interactive behavior to websites.' }); }
  });
  const metaStart = source.indexOf('const _aiSessionMetaInFlight =');
  vm.runInContext(source.slice(metaStart, source.indexOf('\nfunction normalizeConversationStore(', metaStart)), meta);
  await meta.generateAiSessionMeta('a');
  assert.equal(metaCalls, 0, 'summary must wait until answer completes');
  meta.isAwaitingResponse = false;
  await meta.generateAiSessionMeta('a');
  assert.equal(metaCalls, 1, 'renamed sessions still receive summaries');
  assert.match(session.aiMeta.description, /interactive behavior/);
  await meta.generateAiSessionMeta('a');
  assert.equal(metaCalls, 1, 'fresh summary is reused');
  session.messages.push({ text: 'Explain functions', isAi: false }, { text: 'Functions group reusable statements.', isAi: true });
  await meta.generateAiSessionMeta('a');
  assert.equal(metaCalls, 2, 'summary refreshes on the next completed answer');
  let paints = 0, callback;
  const body = { isConnected: true, set innerHTML(value) { paints++; } }, pill = {};
  const ui = vm.createContext({ window: { ultronAPI: { parseMarkdown: text => text } },
    matchMedia: () => ({ matches: false }), requestAnimationFrame: fn => { callback = fn; return 1; },
    cancelAnimationFrame() {}, renderMathFormulasStream: text => text,
    closeIncompleteMarkdown: text => text, escapeHtml: text => text });
  const start = source.indexOf('function createSmoothStreamPainter(');
  vm.runInContext(source.slice(start, source.indexOf('\nfunction createStreamBubblePainter(', start)), ui);
  const painter = ui.createSmoothStreamPainter({ querySelector: selector => selector.includes('stream-body') ? body : pill });
  painter.update('Long response '.repeat(1000));
  for (let ts = 0; ts < 1000; ts += 16) callback(ts);
  assert.ok(paints <= 10);
  body.isConnected = false;
  assert.equal(painter.done(), true);
  const visualContext = vm.createContext({ window: {}, document: {
    readyState: 'loading', addEventListener() {}
  }, setTimeout, console });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../src/renderer/visual-engine.js'), 'utf8'), visualContext);
  for (const graph of ['x'.repeat(12001), 'node\n'.repeat(161), 'a-->b;'.repeat(101)]) {
    const html = await visualContext.window.UltronVisualEngine.renderMermaidDiagram(graph);
    assert.match(html, /too large/, 'oversized graphs skip expensive layout');
  }
  console.log('PASS: speech deduplication, serialization, crash/timeout recovery and bounded streaming');
}
run().catch(err => { console.error(err); process.exitCode = 1; });
