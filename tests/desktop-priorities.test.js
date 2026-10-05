const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { PassThrough } = require('stream');
const { EventEmitter } = require('events');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

(async () => {
  const window = {};
  vm.runInNewContext(read('src/agent/agent-loop-guard.js'), { window });
  const guard = window.UltronLoopGuard;
  guard.configure({ warnBeforeBlock: false });
  for (let i = 0; i < 12; i++) {
    assert.equal(guard.checkCall({ type: 'EXECUTE', command: `command-${i}` }).blocked, false);
  }
  guard.reset();
  for (let i = 0; i < 3; i++) assert.equal(guard.checkCall({ type: 'EXECUTE', command: 'same' }).blocked, false);
  assert.equal(guard.checkCall({ command: 'same', type: 'EXECUTE' }).blocked, true);
  assert.notEqual(guard.serializeToolCall({ text: 'a'.repeat(120) + 'b' }), guard.serializeToolCall({ text: 'a'.repeat(120) + 'c' }));
  guard.reset(); guard.configure({ warnBeforeBlock: true });
  for (let i = 0; i < 3; i++) guard.checkCall({ type: 'EXECUTE', command: 'same' });
  assert.equal(guard.checkCall({ type: 'EXECUTE', command: 'same' }).warned, true);
  assert.equal(guard.checkCall({ type: 'EXECUTE', command: 'same' }).blocked, true);

  const renderer = read('src/renderer/renderer.js');
  const metricsSource = renderer.slice(renderer.indexOf('async function refreshLiveMetrics()'), renderer.indexOf('\ndocument.addEventListener(\'visibilitychange\'', renderer.indexOf('async function refreshLiveMetrics()')));
  let releaseMetrics, calls = 0;
  const metrics = { document: { hidden: false }, _liveMetricsPending: false, statRamLive: {}, statCpuLive: {}, window: { ultronAPI: { getLiveMetrics: () => { calls++; return new Promise(resolve => { releaseMetrics = resolve; }); } } } };
  vm.createContext(metrics); vm.runInContext(metricsSource, metrics);
  const first = metrics.refreshLiveMetrics();
  await metrics.refreshLiveMetrics(); assert.equal(calls, 1);
  releaseMetrics({ success: true, memoryUsedPct: 20, freeMemoryGB: 8, cpuLoadPct: 5 }); await first;
  assert.equal(metrics._liveMetricsPending, false);
  metrics.document.hidden = true; await metrics.refreshLiveMetrics(); assert.equal(calls, 1);

  const setupSource = renderer.slice(renderer.indexOf('  async function finishOnboarding()'), renderer.indexOf('  // Pre-fill existing user info'));
  const stored = new Map(); let hidden = false, saveFails = true;
  const setup = { Date, Error, window: { localStorage: { setItem: (k, v) => stored.set(k, v) }, ultronAPI: { saveSetupStatus: async () => ({ success: !saveFails, error: 'Disk full' }) } }, onboardingScreen: { classList: { add: () => { hidden = true; } } }, loadAccountDetails: async () => {}, updateWelcomeGreeting() {}, logTrace() {} };
  vm.createContext(setup); vm.runInContext(setupSource, setup);
  await assert.rejects(setup.finishOnboarding(), /Disk full/);
  assert.equal(stored.has('ultron-setup-completed'), false); assert.equal(hidden, false);
  saveFails = false; await setup.finishOnboarding(); assert.equal(stored.get('ultron-setup-completed'), 'true'); assert.equal(hidden, true);

  const stopStart = renderer.indexOf('    // 1. Abort fetch controller', renderer.indexOf('// Stop / cancel generation button'));
  const stopSource = renderer.slice(stopStart, renderer.indexOf('    // 5. Stop active thinking widget', stopStart));
  const events = [];
  vm.runInNewContext(stopSource, { Promise, _activeAbortController: { abort: () => events.push('abort') }, _activeStreamReader: { cancel: () => { events.push('reader'); return new Promise(() => {}); } }, _activeHarnessRunId: 'run', window: { agentHarnessClient: { abortAgent: id => { assert.equal(id, 'run'); events.push('harness'); return Promise.resolve(); } } }, stopTtsSpeech: () => events.push('speech') });
  assert.deepEqual(events, ['abort', 'reader', 'harness', 'speech']);

  const controller = new AbortController();
  let parts = [], initializationCalls = 0;
  const harnessEnv = { module: { exports: {} }, console, Date,
    mockAi: { stepCountIs: () => () => false, streamText: () => ({ fullStream: (async function* () { for (const part of parts) yield part; })() }) },
    require: name => name === './agent-harness-provider' ? { resolveAgentLanguageModel: async () => { initializationCalls++; return { model: {}, provider: 'mock', modelId: 'mock', isOffline: true }; } } : name === './agent-harness-mcp-adapter' ? { buildVercelMcpTools: async () => ({ tools: {}, toolMetadata: new Map() }) } : {} };
  vm.createContext(harnessEnv);
  vm.runInContext(read('src/main/agent-harness-engine.js').replace("await import('ai')", 'mockAi'), harnessEnv);
  const run = harnessEnv.module.exports.streamAgentHarness;
  controller.abort();
  const cancelled = await run({ prompt: 'test', abortSignal: controller.signal });
  assert.equal(cancelled.success, false); assert.equal(cancelled.cancelled, true); assert.equal(initializationCalls, 0);
  parts = [{ type: 'text-delta', text: 'Partial answer' }, { type: 'error', error: new Error('connection lost') }];
  const partial = await run({ prompt: 'test' });
  assert.equal(partial.success, false); assert.equal(partial.text, 'Partial answer'); assert.match(partial.error, /connection lost/);
  parts = [{ type: 'text-delta', text: 'Complete answer' }, { type: 'finish', finishReason: 'stop' }];
  assert.equal((await run({ prompt: 'test' })).success, true);

  // Exercise the real fallback download with a response that terminates mid-stream.
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'brown-download-'));
  let interrupted = true;
  const env = { module: { exports: {} }, console, URL, process, setTimeout, setInterval,
    require: name => name === 'electron-updater' ? { autoUpdater: {} } : name === 'electron' ? { app: { getPath: () => dir }, ipcMain: {}, Notification: {} } : name === 'https' ? { get: (url, options, callback) => {
      const request = new EventEmitter(); request.destroy = () => {};
      process.nextTick(() => {
        const response = new PassThrough(); response.statusCode = 200; response.headers = { 'content-length': '8' };
        callback(response); response.write('MZxx');
        if (interrupted) response.destroy(new Error('connection lost')); else response.end('xxxx');
      }); return request;
    } } : name === './update-install' ? {} : require(name) };
  vm.createContext(env); vm.runInContext(read('src/main/updater.js'), env);
  try {
    await assert.rejects(env.downloadInstallerFallback('https://example.test/setup.exe', '1.2.3'), /connection lost/);
    assert.deepEqual(fs.readdirSync(dir), []);
    interrupted = false;
    const file = await env.downloadInstallerFallback('https://example.test/setup.exe', '1.2.3');
    assert.equal(fs.readFileSync(file, 'utf8'), 'MZxxxxxx');
    assert.equal(fs.existsSync(file + '.part'), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  console.log('PASS: distinct/repeated agent actions, non-blocking stop, setup retry, bounded metrics, interrupted update cleanup and retry');
})().catch(error => { console.error(error); process.exitCode = 1; });
