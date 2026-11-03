// Run the actual app with a separate, fresh profile for onboarding UI review.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const previewRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'brown-onboarding-preview-'));
process.env.LOCALAPPDATA = previewRoot;
process.chdir(previewRoot);
app.setName('Brown Onboarding Preview');
const previewUserData = path.join(previewRoot, 'UltronDataDev');
fs.mkdirSync(previewUserData, { recursive: true });
app.setPath('userData', previewUserData);
console.log(`[onboarding-preview] Isolated test data: ${previewRoot}`);
// Refresh styling during UI review without resetting the current setup step.
const stylesheet = path.join(__dirname, '../src/renderer/index.css');
const appliedStyles = new WeakMap();
fs.watchFile(stylesheet, { interval: 500 }, async () => {
  const css = fs.readFileSync(stylesheet, 'utf8');
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      const previous = appliedStyles.get(win);
      const current = await win.webContents.insertCSS(css);
      appliedStyles.set(win, current);
      if (previous) await win.webContents.removeInsertedCSS(previous);
    } catch (error) { console.warn('[onboarding-preview] Style refresh:', error.message); }
  }
});
app.on('will-quit', () => fs.unwatchFile(stylesheet));
// This fixture affects only this fresh preview process, never the real installation.
if (process.argv.includes('--missing-setup')) {
  const fixtures = {
    'check-ollama-installed': { installed: false },
    'profile-system': { success: true, installedModels: [] },
    'check-huggingface-connection': { reachable: false },
    'start-ollama-service': { success: false, error: 'Preview: Ollama is missing.' },
    'install-ollama': { success: false, error: 'Preview only: installation is disabled.' },
  };
  const register = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, handler) => register(channel,
    Object.hasOwn(fixtures, channel) ? async () => fixtures[channel] : handler);
  app.on('browser-window-created', (_, win) => {
    win.webContents.session.webRequest.onBeforeRequest({
      urls: ['http://127.0.0.1:11434/*', 'http://localhost:11434/*'],
    }, (_, done) => done({ cancel: true }));
    win.webContents.once('did-finish-load', async () => {
      try {
        const ready = await win.webContents.executeJavaScript(`(async () => {
          for (let i = 0; i < 150; i++) {
            const start = document.getElementById('btn-onboard-start');
            const screen = document.getElementById('onboarding-screen');
            if (start?.onclick && screen && !screen.classList.contains('hidden')) {
              start.click();
              const name = document.getElementById('onboard-full-name');
              name.value = 'Preview User';
              name.dispatchEvent(new Event('input', { bubbles: true }));
              await document.getElementById('btn-onboard-next').onclick();
              await document.getElementById('btn-onboard-next').onclick();
              name.blur();
              return true;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
          }
          return false;
        })()`);
        if (!ready) return;
        await new Promise(resolve => setTimeout(resolve, 1800));
        const state = await win.webContents.executeJavaScript(`({
          ollama: document.getElementById('onboard-desc-ollama')?.textContent,
          huggingFace: document.getElementById('onboard-desc-hf')?.textContent,
          finishVisible: !document.getElementById('btn-onboard-finish')?.classList.contains('hidden'),
          ollamaSelected: document.getElementById('btn-onboard-action-ollama')?.getAttribute('aria-checked'),
          huggingFaceSelected: document.getElementById('btn-onboard-action-hf')?.getAttribute('aria-checked')
        })`);
        console.log('[onboarding-preview] Missing setup state:', JSON.stringify(state));
        const screenshot = path.join(__dirname, '../.codex/desktop-onboarding-missing-setup.png');
        fs.writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
        console.log('[onboarding-preview] Screenshot:', screenshot);
        win.show();
        win.focus();
      } catch (error) { console.error('[onboarding-preview] Fixture failed:', error.message); }
    });
  });
}
require('../src/main/index.js');
