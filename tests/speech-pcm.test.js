const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
let Processor;
const events = [];
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/speech-pcm-worklet.js'), 'utf8'), {
  sampleRate: 100,
  AudioWorkletProcessor: class { constructor() { this.port = { postMessage: event => events.push(event) }; } },
  registerProcessor: (_name, value) => { Processor = value; }
});
function push(p, values) { p.port.onmessage({ data: { type: 'push', samples: Float32Array.from(values) } }); }
function render(p, count) { const output = new Float32Array(count); p.process([], [[output]]); return Array.from(output); }
const player = new Processor();
push(player, Array(160).fill(1));
assert.deepEqual(render(player, 8), Array(8).fill(1), 'first phrase starts without waiting for another inference');
push(player, Array(160).fill(2));
const output = render(player, 200);
assert.deepEqual(output, [...Array(152).fill(1), ...Array(48).fill(2)], 'no zero frame inserted at chunk boundary');
assert.equal(events.filter(e => e.type === 'playing').length, 1);
render(player, 112);
assert.equal(events.filter(e => e.type === 'underrun').length, 1);
push(player, [3, 3]);
assert.deepEqual(render(player, 4), [3, 3, 0, 0], 'resume immediately after underrun');
player.port.onmessage({ data: { type: 'end' } });
assert.deepEqual(render(player, 4), [0, 0, 0, 0], 'finish after the short tail has played');
assert.equal(events.filter(e => e.type === 'done').length, 1);
const short = new Processor();
push(short, [4, 5]);
short.port.onmessage({ data: { type: 'end' } });
assert.deepEqual(render(short, 4), [4, 5, 0, 0], 'single-chunk passages do not wait forever');
const root = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/speech-pcm-player.js'), 'utf8'), {
  window: root, document: { currentScript: { src: 'file:///speech-pcm-player.js' } }, URL
});
const silence = new Float32Array(1800);
silence.fill(0.1, 300, 1300);
const trimmed = root.BrownSpeechPcmPlayer.trimSilence(silence, 1000);
assert.equal(trimmed.length, 1150, 'remove excessive edge silence while retaining onset and tail padding');
assert.equal(trimmed[49], 0);
assert(trimmed[50] > 0, 'first phoneme remains intact');
assert(trimmed[1049] > 0, 'last phoneme remains intact');
assert.equal(trimmed[1050], 0, 'retain 100ms sentence pause');
assert.equal(root.BrownSpeechPcmPlayer.trimSilence(new Float32Array(100), 1000).length, 100, 'silent chunks remain valid');
console.log('PASS: immediate first-chunk playback and underrun recovery, contiguous boundaries and conservative silence trimming.');
