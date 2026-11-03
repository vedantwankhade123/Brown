const assert = require('node:assert/strict');
const compareMod = require('../src/renderer/model-compare');
const { compare, SYNTHETIC_PROMPT, defaultValidate, MAX_MODELS } = compareMod;

(async () => {
  // --- Sequential execution (respects memory admission; never runs models in parallel) --
  let active = 0, maxActive = 0;
  const generate = async ({ model, prompt, onToken }) => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(r => setTimeout(r, 5));
    onToken?.('A');
    active--;
    return { text: `Answer from ${model} about "${prompt.slice(0, 8)}" with enough words to be valid.`, metrics: { eval_count: 50, eval_duration_ms: 1000 } };
  };

  const res = await compare({ models: ['a:latest', 'b:latest'], generate });
  assert.equal(maxActive, 1, 'models are measured one at a time');
  assert.equal(res.results.length, 2);
  assert.equal(res.synthetic, true, 'no prompt supplied -> synthetic benchmark');
  assert.equal(res.prompt, SYNTHETIC_PROMPT);
  assert.equal(res.usesPrivateContext, false, 'compare never reads private chat context');
  for (const r of res.results) {
    assert.equal(r.ok, true);
    assert.equal(r.tokenCount, 50, 'token count comes from real metrics when available');
    assert.equal(r.tokensPerSec, 50);
    assert.equal(r.validationOutcome, 'pass');
    assert(r.latencyMs >= 4);
    assert(r.timeToFirstTokenMs != null, 'first-token time is measured');
  }

  // --- Explicit prompt is used and still never marked as private context --------------
  const explicit = await compare({ models: ['a', 'b'], prompt: 'Explain closures briefly.', generate });
  assert.equal(explicit.synthetic, false);
  assert.equal(explicit.prompt, 'Explain closures briefly.');
  assert.equal(explicit.usesPrivateContext, false);

  // --- Model cap and minimum ----------------------------------------------------------
  const capped = await compare({ models: ['a', 'b', 'c', 'd', 'e', 'f'], generate });
  assert.equal(capped.results.length, MAX_MODELS, 'comparison is capped at 4 models');
  await assert.rejects(() => compare({ models: ['only-one'], generate }), /at least two/);

  // --- Honest failure reporting: an output-limit error is recorded, not hidden --------
  const flaky = async ({ model }) => {
    if (model === 'bad') { const e = new Error('hit the cap'); e.code = 'OUTPUT_LIMIT'; throw e; }
    if (model === 'plain') return 'A plain string answer that is long enough to be structurally valid.';
    return { text: 'A perfectly valid answer from the good model.', metrics: { eval_count: 20, eval_duration_ms: 500 } };
  };
  const mixed = await compare({ models: ['good', 'bad', 'plain'], generate: flaky });
  const good = mixed.results.find(r => r.model === 'good');
  const bad = mixed.results.find(r => r.model === 'bad');
  const plain = mixed.results.find(r => r.model === 'plain');
  assert.equal(good.ok, true);
  assert.equal(good.tokenCount, 20);
  assert.equal(good.tokensPerSec, 40, 'speed is computed from the real eval window');
  assert.equal(bad.ok, false);
  assert.equal(bad.outputLimitHit, true);
  assert.equal(bad.validationOutcome, 'failed');
  assert.equal(bad.error.code, 'OUTPUT_LIMIT');
  // A bare-string response (no metrics) still gets an approximate token count.
  assert.equal(plain.ok, true);
  assert(plain.tokenCount > 0, 'metrics-null path approximates tokens');
  assert.equal(plain.validationOutcome, 'pass');

  // --- Cancellation propagates --------------------------------------------------------
  const controller = new AbortController(); controller.abort(new DOMException('Cancelled', 'AbortError'));
  await assert.rejects(() => compare({ models: ['a', 'b'], generate, signal: controller.signal }), error => error.name === 'AbortError');

  // --- Injected validator is honored --------------------------------------------------
  const validated = await compare({ models: ['a', 'b'], generate, validate: () => 'unchecked' });
  assert(validated.results.every(r => r.validationOutcome === 'unchecked'));

  // --- Default structural validator ---------------------------------------------------
  assert.equal(defaultValidate(''), 'fail');
  assert.equal(defaultValidate('short'), 'fail');
  assert.equal(defaultValidate('word '.repeat(3) + 'word word word word word word'), 'fail', 'repetition loop fails');
  assert.equal(defaultValidate('A clear, sufficiently long answer about the topic.'), 'pass');

  console.log('PASS: Compare-Models engine — sequential memory-safe runs, honest latency/speed/validation/error reporting, synthetic-by-default privacy, and cancellation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
