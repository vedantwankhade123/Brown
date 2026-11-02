'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  try {
    const ipcPath = path.join(__dirname, '../src/main/ipc.js');
    const source = fs.readFileSync(ipcPath, 'utf8');
    const start = source.indexOf('function registerVisualIpcHandlers(');
    const context = vm.createContext({ ipcMain, require: createRequire(ipcPath) });
    vm.runInContext(source.slice(start, source.indexOf('/**', start)), context);
    context.registerVisualIpcHandlers();
    context.registerVisualIpcHandlers();
    const window = new BrowserWindow({ show: false, webPreferences: {
      sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'fixtures/visual-render-preload.cjs')
    } });
    await window.loadFile(path.join(__dirname, 'fixtures/speech-pcm.html'));
    const result = await window.webContents.executeJavaScript('renderVisualTest("flowchart LR\\nA[Input] --> B[Output]")');
    assert.equal(result.success, true, result.error);
    assert.match(result.html, /<svg/);
    const invalid = await window.webContents.executeJavaScript('renderVisualTest("x".repeat(13000))');
    assert.equal(invalid.success, false);
    assert.match(invalid.error, /too large/);
    console.log('PASS: actual sandboxed renderer IPC reaches independent diagram handler and returns SVG or a structured error.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
setTimeout(() => { console.error('Visual IPC test timed out'); app.exit(1); }, 20000);
