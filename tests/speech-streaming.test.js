const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('src/renderer/renderer.js', 'utf8');
function load(ctx, name, next) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`\n${next}`, start);
  vm.runInContext(source.slice(source.slice(start - 6, start) === 'async ' ? start - 6 : start, end), ctx);
}
const tick = () => new Promise(setImmediate);
(async () => {
  const state = { generation: 1, queue: ['first', 'second', 'third'], busy: false };
  const generated = [], played = [];
  let finish, idle = 0;
  const ctx = vm.createContext({
    streamingAutoSpeakState: state, window: {}, setTimeout, logTrace() {},
    synthesizeSpeechChunk: async text => { generated.push(text); return { wavBase64: text }; },
    playNeuralAudio: data => { played.push(data); return new Promise(resolve => { finish = resolve; }); },
    markStreamingSpeechStarted() {}, notifyStreamingAutoSpeakIdle: () => idle++,
  });
  load(ctx, 'splitTextForSpeechQueue', 'function getLatestAiMessageText(');
  load(ctx, 'drainStreamingAutoSpeak', 'function beginSpeechPlayback(');
  const text = 'Dr. Smith explains the value 3.14 accurately. ' + 'A long sentence with many words for speech playback. '.repeat(25);
  const chunks = ctx.splitTextForSpeechQueue(text);
  assert.equal(chunks.join(' '), text.trim());
  assert(chunks[0].length <= 64);
  assert(chunks.every(c => c.length <= 160));
  assert(chunks[0].startsWith('Dr. Smith'));
  const drain = ctx.drainStreamingAutoSpeak();
  await tick();
  assert.deepEqual(played, ['first']);
  assert.deepEqual(generated, ['first', 'second'], 'one chunk ahead while first still playing');
  finish(true); await tick();
  assert.deepEqual(played, ['first', 'second']);
  assert.deepEqual(generated, ['first', 'second', 'third']);
  finish(true); await tick(); finish(true); await drain;
  assert.equal(idle, 1);
  assert.equal(state.busy, false);
  state.queue = ['old', 'stale', 'never'];
  const cancelled = ctx.drainStreamingAutoSpeak(); await tick();
  state.generation++;
  state.queue = ['new-session']; state.busy = true;
  finish(false); await cancelled;
  assert.equal(state.busy, true, 'old drain cannot clear new session busy flag');
  assert.deepEqual(state.queue, ['new-session']);
  assert(!played.includes('stale'));
  assert(!generated.includes('never'));
  assert.equal(idle, 1, 'cancelled drain cannot finish new session');
  state.busy = false;
  state.queue = ['pcm-one', 'pcm-two', 'pcm-three'];
  const appended = [];
  let releaseAudio;
  const pcmPlayer = {
    stopped: false,
    async waitForCapacity() {},
    async append(audio) { appended.push(audio.pcm); },
    end() { return new Promise(resolve => { releaseAudio = resolve; }); },
    stop() { this.stopped = true; }
  };
  ctx.window.BrownSpeechPcmPlayer = { create: async () => pcmPlayer };
  ctx.activeSpeechPcmPlayer = null;
  ctx.synthesizeSpeechChunk = async (text, format) => {
    assert.equal(format, 'pcm');
    return { pcm: text, sampleRate: 24000 };
  };
  const continuous = ctx.drainStreamingAutoSpeak();
  await tick();
  assert.deepEqual(appended, ['pcm-one', 'pcm-two', 'pcm-three'], 'producer feeds ahead without waiting for each chunk playback');
  assert.equal(state.busy, true, 'session remains active until audio drains');
  releaseAudio(true);
  await continuous;
  assert.equal(state.busy, false);
  assert.equal(ctx.activeSpeechPcmPlayer, null);
  assert.equal(idle, 2);
  console.log('PASS: bounded chunks preserve text, synthesis overlaps playback, ordering and cancellation remain isolated.');
})().catch(error => { console.error(error); process.exitCode = 1; });
