const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, width: 600, height: 240, webPreferences: { backgroundThrottling: false } });
  try {
    await window.loadFile(path.join(__dirname, 'fixtures/speech-pcm.html'));
    await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, '../src/renderer/message-copy.js'), 'utf8'));
    const result = await window.webContents.executeJavaScript(`(async () => {
      const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '../../src/renderer/index.css'; document.head.append(css); await new Promise(resolve => css.onload = resolve);
      document.body.style.cssText = 'display:block;background:#111;color:white;padding:32px;font-family:Arial';
      document.body.innerHTML = '<p>Hello! How can I help you today?</p><button class="btn-copy-msg message-action-btn"></button>';
      window.ultronAPI = { copyText: async text => { window.copiedText = text; return { success: true }; } };
      const button = document.querySelector('button');
      BrownMessageCopy.bind(button, () => 'Hello! How can I help you today?');
      button.click(); await new Promise(resolve => setTimeout(resolve, 50));
      return { copied: window.copiedText, label: button.getAttribute('aria-label'), stroke: getComputedStyle(button.querySelector('svg')).stroke, width: button.getBoundingClientRect().width };
    })()`);
    assert.equal(result.copied, 'Hello! How can I help you today?');
    assert.equal(result.label, 'Copied'); assert.equal(result.stroke, 'rgb(34, 197, 94)');
    assert(result.width > 20);
    await window.webContents.capturePage().then(image => fs.writeFileSync(path.join(__dirname, '../tmp/message-copy-tick-preview.png'), image.toPNG()));
    await new Promise(resolve => setTimeout(resolve, 2100));
    assert.equal(await window.webContents.executeJavaScript("document.querySelector('button').getAttribute('aria-label')"), 'Copy message');
    console.log('PASS: real button click copies the full message, displays a green tick and restores the icon after two seconds.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
