const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
let calls = 0, rate = 1, model = 'kokoro-george';
const context = vm.createContext({
  window: { ultronAPI: { synthesizeSpeech: async () => { calls++; return { success: true, pcm: new Float32Array([0.1]), sampleRate: 24000 }; } } },
  _ttsChunkCache: new Map(), _ttsChunkJobs: new Map(),
  resolveActiveTtsModelKey: async () => model, getTtsRate: () => rate,
  localStorage: { getItem: () => '' }, setTimeout, clearTimeout, logTrace() {}
});
const start = source.indexOf('async function synthesizeSpeechChunk(');
vm.runInContext(source.slice(start, source.indexOf('\nasync function drainStreamingAutoSpeak(', start)), context);
(async () => {
  const results = await Promise.all([context.synthesizeSpeechChunk('Opening phrase', 'pcm'), context.synthesizeSpeechChunk('Opening phrase', 'pcm')]);
  assert.equal(calls, 1, 'prefetch and Speak share the same in-flight synthesis');
  assert.equal(results[0], results[1]);
  await context.synthesizeSpeechChunk('Opening phrase', 'pcm');
  assert.equal(calls, 1, 'replay reuses cached audio');
  rate = 1.2;
  await context.synthesizeSpeechChunk('Opening phrase', 'pcm');
  assert.equal(calls, 2, 'rate changes invalidate audio');
  model = 'kokoro-heart';
  await context.synthesizeSpeechChunk('Opening phrase', 'pcm');
  assert.equal(calls, 3, 'voice changes invalidate audio');
  for (let i = 0; i < 12; i++) await context.synthesizeSpeechChunk('phrase ' + i, 'pcm');
  assert.equal(context._ttsChunkCache.size, 8, 'audio cache stays bounded');
  assert.equal(context._ttsChunkJobs.size, 0);
  console.log('PASS: speech prefetch deduplication, bounded cache, voice and rate invalidation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
