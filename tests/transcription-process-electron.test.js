'use strict';
const { app } = require('electron');
const assert = require('node:assert/strict');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let last = Date.now(), maxDelay = 0, ticks = 0;
  const timer = setInterval(() => {
    const now = Date.now();
    maxDelay = Math.max(maxDelay, now - last);
    last = now; ticks++;
  }, 25);
  try {
    const speech = require(process.env.BROWN_SPEECH_TEST_MODULE || '../src/main/voice-kokoro');
    const whisper = require(process.env.BROWN_WHISPER_TEST_MODULE || '../src/main/voice-whisper');
    const text = 'The first word is pineapple. ' +
      'We are checking that longer recordings keep all their words, including the beginning of the sentence. '.repeat(5) +
      'The final word is elephant.';
    const generated = await speech.synthesizeKokoroSpeech(text, 'bm_george');
    assert.equal(generated.success, true, generated.error);
    const wav = Buffer.from(generated.wavBase64, 'base64');
    const seconds = wav.readUInt32LE(40) / (24000 * 2);
    assert.ok(seconds > 25, 'fixture exercises the old 25-second truncation');
    const result = await whisper.transcribeWhisperWavBuffer(wav);
    assert.equal(result.success, true, result.error);
    assert.match(result.text, /pineapple/i, 'beginning survives long dictation');
    assert.match(result.text, /elephant/i, 'end survives long dictation');
    assert.ok(ticks > 0);
    assert.ok(maxDelay < 500, `main loop blocked for ${maxDelay}ms`);
    console.log(`PASS: ${seconds.toFixed(1)}s real speech preserves first and last words; maximum main-loop interval ${maxDelay}ms`);
    app.quit();
  } catch (err) { console.error(err); app.exit(1); }
  finally { clearInterval(timer); }
});
