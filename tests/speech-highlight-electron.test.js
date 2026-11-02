'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
  try {
    await window.loadFile(path.join(__dirname, 'fixtures/speech-pcm.html'));
    await window.webContents.insertCSS(fs.readFileSync(path.join(__dirname, '../src/renderer/index.css'), 'utf8'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      const content = document.createElement('div');
      content.innerHTML = '<p>Hello <strong>world.</strong> Again friend.</p>';
      content.style.cssText = 'position:absolute;left:40px;top:40px;width:600px;font:18px/28px Segoe UI;color:white';
      document.body.appendChild(content);
      const highlighter = new BrownSpeechHighlight(content);
      const seen = [];
      const original = content.innerHTML;
      const originalHeight = content.getBoundingClientRect().height;
      let overlayError = '';
      let underrun;
      const gap = new Promise(resolve => { underrun = resolve; });
      const player = await BrownSpeechPcmPlayer.create({
        onUnderrun: () => underrun(),
        onProgress: (text, ratio, id) => {
          highlighter.update(text, ratio, id);
          const range = [...(CSS.highlights.get('brown-spoken-word') || [])][0];
          if (range && seen.at(-1) !== range.toString()) seen.push(range.toString());
          const overlay = document.querySelector('.brown-spoken-word-overlay');
          if (overlay) {
            const style = getComputedStyle(overlay);
            if (style.color !== 'rgb(255, 255, 255)' || style.paddingLeft !== '3px' || style.paddingRight !== '3px' || style.borderRadius !== '3px') overlayError = 'Wrong highlight styling';
            if (content.innerHTML !== original || content.getBoundingClientRect().height !== originalHeight) overlayError = 'Highlight shifted or rewrote the message';
          } else overlayError = 'Highlight overlay missing';
        }
      });
      // Silence exercises the actual audio clock without playing a test sound.
      await player.append({ pcm: new Float32Array(12000), sampleRate: 24000 }, { text: 'Hello world.' });
      await gap;
      await new Promise(resolve => setTimeout(resolve, 150));
      const before = seen.join('|');
      await new Promise(resolve => setTimeout(resolve, 150));
      if (seen.join('|') !== before) throw new Error('Highlight advanced while audio was waiting.');
      await player.append({ pcm: new Float32Array(12000), sampleRate: 24000 }, { text: 'Again friend.' });
      await player.end();
      if (seen.join('|') !== 'Hello|world|Again|friend') throw new Error('Incorrect word sequence: ' + seen.join('|'));
      highlighter.clear();
      if (CSS.highlights.has('brown-spoken-word')) throw new Error('Highlight did not clear.');
      if (document.querySelector('.brown-spoken-word-overlay')) throw new Error('Overlay did not clear.');
      if (overlayError) throw new Error(overlayError);
      return seen;
    })()`);
    console.log('PASS: real audio-clock highlight progression, underrun pause and cleanup', result);
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Highlight test timed out'); app.exit(1); }, 15000);
