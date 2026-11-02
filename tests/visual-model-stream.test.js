const assert = require('node:assert/strict');
const { generate, createGenerator, recoveryModel } = require('../src/renderer/visual-model-stream');
const bytes = text => new TextEncoder().encode(text);
const defaults = { model: 'local', system: 'schema rules', user: 'draw', format: {}, startupMs: 200, idleMs: 100, totalMs: 1000 };
function fetchStream(produce) {
  return async (_url, options) => new Response(new ReadableStream({ start(controller) {
    options.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
    produce(controller, options);
  } }));
}
(async () => {
  let progress = 0;
  const result = await generate({ ...defaults, onProgress: () => progress++, fetchImpl: fetchStream((c, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.stream, true); assert.equal(body.think, false);
    const text = bytes(JSON.stringify({ message: { content: 'α diagram' } }) + '\n' + JSON.stringify({ message: { content: ' complete' }, done: true }));
    const unicode = text.indexOf(206);
    c.enqueue(text.slice(0, unicode + 1)); c.enqueue(text.slice(unicode + 1)); c.close();
  }) });
  assert.equal(result, 'α diagram complete'); assert.equal(progress, 1);
  // Continuous tokens outlive the initial budget instead of being timed out.
  let timer;
  const active = await generate({ ...defaults, startupMs: 80, idleMs: 150, fetchImpl: fetchStream(c => {
    let count = 0;
    c.enqueue(bytes(JSON.stringify({ message: { content: 'x' } }) + '\n'));
    timer = setInterval(() => {
      count++;
      c.enqueue(bytes(JSON.stringify({ message: { content: 'x' }, done: count === 5 }) + '\n'));
      if(count === 5) { clearInterval(timer); c.close(); }
    }, 30);
  }) });
  assert.equal(active, 'xxxxxx');
  await assert.rejects(generate({ ...defaults, startupMs: 10, fetchImpl: fetchStream(() => {}) }), /did not start responding/);
  await assert.rejects(generate({ ...defaults, idleMs: 10, fetchImpl: fetchStream(c => c.enqueue(bytes('{"message":{"content":"x"}}\n'))) }), /stopped responding/);
  await assert.rejects(generate({ ...defaults, totalMs: 10, fetchImpl: fetchStream(() => {}) }), /generation time limit/);
  const cancel = new AbortController();
  const pending = generate({ ...defaults, signal: cancel.signal, fetchImpl: fetchStream(() => {}) });
  cancel.abort(); await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(generate({ ...defaults, fetchImpl: fetchStream(c => {c.enqueue(bytes('{"message":{"content":"partial"}}\n')); c.close();}) }), /before generation completed/);
  await assert.rejects(generate({ ...defaults, fetchImpl: fetchStream(c => {c.enqueue(bytes('{"error":"out of memory"}\n'));c.close();}) }), /out of memory/);
  await assert.rejects(generate({ ...defaults, fetchImpl: fetchStream(c => {c.enqueue(bytes('{"done":true}\n'));c.close();}) }), { code: 'EMPTY_OUTPUT' });
  const models = [{ name: 'gemma4', size: 9000 }, { name: 'qwen:0.5b', size: 400 }, { name: 'phi3', size: 2000 }, { name: 'llava', size: 4000 }, { name: 'remote:cloud', size: 1 }];
  assert.equal(recoveryModel(models, 'gemma4'), 'phi3');
  let calls = [], recoveries = 0;
  const retry = createGenerator({ model: 'gemma4', models, onRecovery: () => recoveries++, complete: async options => {
    calls.push(options.model);
    if (options.model === 'gemma4') throw Object.assign(new Error('slow'), { code: 'MODEL_TIMEOUT' });
    return 'valid';
  } });
  assert.equal(await retry('s','u',{}), 'valid');
  assert.equal(await retry('s','repair',{}), 'valid');
  assert.deepEqual(calls, ['gemma4','phi3','phi3']); assert.equal(recoveries, 1);
  calls = [];
  const bounded = createGenerator({ model: 'gemma4', models, complete: async options => {
    calls.push(options.model); throw Object.assign(new Error('empty'), { code: 'EMPTY_OUTPUT' });
  } });
  await assert.rejects(bounded('s','u',{}));
  assert.deepEqual(calls, ['gemma4','phi3']);
  const budgets = [];
  const truncated = createGenerator({ model: 'gemma4', models, complete: async options => {
    budgets.push([options.model, options.maxTokens]);
    if (options.maxTokens === 2048) throw Object.assign(new Error('length'), { code: 'OUTPUT_LIMIT' });
    return 'complete';
  } });
  assert.equal(await truncated('s','u',{}), 'complete');
  assert.equal(await truncated('s','repair',{}), 'complete');
  assert.deepEqual(budgets, [['gemma4',2048],['gemma4',3072],['gemma4',3072]]);
  let cancelledCalls = 0;
  const cancelled = createGenerator({ model:'gemma4', models, complete: async () => { cancelledCalls++; throw new DOMException('Cancelled','AbortError'); } });
  await assert.rejects(cancelled('s','u',{}), {name:'AbortError'}); assert.equal(cancelledCalls,1);
  console.log('PASS: local visual streaming, split Unicode/JSON, active generation, load/idle/total deadlines, cancellation and incomplete/error responses.');
})().catch(error => { console.error(error); process.exitCode = 1; });
