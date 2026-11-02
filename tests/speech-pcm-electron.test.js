'use strict';
// Run using Electron. Exercises the actual file:// worklet and audio device rate.
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  try {
    await window.loadFile(path.join(__dirname, 'fixtures/speech-pcm.html'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      let starts = 0;
      const player = await BrownSpeechPcmPlayer.create({ onStart: () => starts++ });
      const rate = player.context.sampleRate;
      await player.append({ pcm: new Float32Array(2400), sampleRate: 24000 });
      const firstDeadline = performance.now() + 1000;
      while (!starts && performance.now() < firstDeadline) await new Promise(resolve => setTimeout(resolve, 10));
      if (starts !== 1) throw new Error('First audio waited for a second chunk.');
      await player.append({ pcm: new Float32Array(2400), sampleRate: 24000 });
      if (player.sentFrames !== Math.round(rate * 0.2)) throw new Error('Incorrect PCM resampling duration.');
      const completed = await player.end();
      if (!completed || starts !== 1) throw new Error('Playback did not complete correctly.');
      const cancelled = await BrownSpeechPcmPlayer.create();
      await cancelled.append({ pcm: new Float32Array(2400), sampleRate: 24000 });
      cancelled.stop();
      if (await cancelled.done) throw new Error('Cancelled playback reported success.');
      const bounded = await BrownSpeechPcmPlayer.create();
      await bounded.append({ pcm: new Float32Array(24000 * 13), sampleRate: 24000 });
      await bounded.waitForCapacity(); // First long chunk must allow the second startup chunk.
      await bounded.append({ pcm: new Float32Array(2400), sampleRate: 24000 });
      const capacity = bounded.waitForCapacity();
      bounded.stop();
      await capacity; // Stop releases a producer waiting for space.
      const single = await BrownSpeechPcmPlayer.create();
      await single.append({ pcm: new Float32Array(2400), sampleRate: 24000 });
      if (!await single.end()) throw new Error('Single chunk failed.');
      return { rate, completed, starts };
    })()`);
    console.log('PASS: actual Electron AudioWorklet loading, PCM resampling, completion and cancellation', result);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Audio test timed out'); app.exit(1); }, 20000);
