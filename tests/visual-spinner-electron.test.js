const { app, BrowserWindow } = require('electron');
const path = require('path');
app.whenReady().then(async () => {
  const window = new BrowserWindow({ show: false, webPreferences: { offscreen: true, backgroundThrottling: false } });
  try {
    await window.loadFile(path.join(__dirname, 'fixtures/visual-spinner.html'));
    window.webContents.debugger.attach('1.3');
    for (const value of ['no-preference', 'reduce']) {
      await window.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value }] });
      const result = await window.webContents.executeJavaScript(`(async () => {
        const spinner = document.querySelector('.visual-loading-spinner');
        const style = getComputedStyle(spinner);
        const first = style.transform;
        await new Promise(resolve => setTimeout(resolve, 230));
        return { first, last: getComputedStyle(spinner).transform, animation: style.animationName, state: style.animationPlayState, shimmer: getComputedStyle(document.querySelector('.visual-loading-text')).animationName };
      })()`);
      if (result.first === result.last || result.animation !== 'brown-visual-spin' || result.state !== 'running') throw new Error(value + ': spinner is static: ' + JSON.stringify(result));
      if (result.shimmer !== 'tsmSweep') throw new Error('Visual shimmer is missing.');
    }
    console.log('PASS: actual CSS spinner rotates and text shimmers under normal and reduced motion.');
    window.destroy(); app.exit(0);
  } catch (error) { console.error(error); window.destroy(); app.exit(1); }
});
