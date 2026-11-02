'use strict';
// Run with Electron to verify native model inference leaves the main loop free.
const { app } = require('electron');
const assert = require('node:assert/strict');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  let last = Date.now(), maxDelay = 0, ticks = 0;
  const pulse = setInterval(() => {
    const now = Date.now();
    maxDelay = Math.max(maxDelay, now - last);
    last = now;
    ticks++;
  }, 25);
  try {
    const speech = require(process.env.BROWN_SPEECH_TEST_MODULE || '../src/main/voice-kokoro');
    const result = await speech.synthesizeKokoroSpeech('Hello. Brown is ready to speak while the desktop stays responsive.', 'bm_george');
    assert.equal(result.success, true, result.error);
    assert.ok(result.wavBase64.length > 100);
    const pcm = await speech.synthesizeKokoroSpeech('Continuous speech.', 'bm_george', { format: 'pcm' });
    assert.equal(pcm.success, true, pcm.error);
    assert.ok(pcm.pcm instanceof Float32Array, 'binary PCM survives utility-process IPC');
    assert.ok(pcm.pcm.length > 100);
    assert.equal(pcm.sampleRate, 24000);
    assert.equal(pcm.wavBase64, undefined, 'streaming avoids WAV/base64 conversion');
    assert.ok(ticks > 0, 'main event loop continued during inference');
    assert.ok(maxDelay < 500, `main event loop blocked for ${maxDelay}ms`);
    console.log(`PASS: real Kokoro audio; ${ticks} main-loop ticks, maximum interval ${maxDelay}ms`);
    app.quit();
  } catch (err) {
    console.error(err);
    app.exit(1);
  } finally { clearInterval(pulse); }
});
