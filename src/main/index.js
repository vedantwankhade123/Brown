const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupIpcHandlers, setMainWindow } = require('./ipc');
const { initAutoUpdater } = require('./updater');
const mcpManager = require('./mcp-manager');
const { applyStoragePaths, getConnectorsRoot } = require('./paths');

// Electron cache/config only — user data lives next to install (see paths.js)
const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const dataFolder = app.isPackaged ? 'UltronData' : 'UltronDataDev';
app.setPath('userData', path.join(localAppData, dataFolder));

// Disable GPU and HTTP disk cache locks on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');

function initializeDataDirectories() {
  applyStoragePaths();
}

module.exports = { getDefaultDataDirectory: () => require('./paths').getDefaultAgentDataDir() };

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    backgroundColor: '#0a0a0c',
    title: 'Ultron AI: Local Windows Autonomous AI Framework',
    icon: path.join(__dirname, '..', '..', 'Assets', 'ultron-logo.png'),
    frame: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL() && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const allowed = ['media', 'audioCapture', 'microphone', 'mediaKeySystem', 'notifications', 'pointerLock'];
    if (permission === 'media' && details?.mediaTypes?.includes('video') && !details?.mediaTypes?.includes('audio')) {
      callback(false);
      return;
    }
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  setMainWindow(mainWindow);
  initAutoUpdater(mainWindow);
}

app.whenReady().then(() => {
  initializeDataDirectories();
  setupIpcHandlers();

  const uvxPath = mcpManager.resolveUvxPath();
  if (uvxPath && !process.env.ULTRON_UVX_PATH) {
    process.env.ULTRON_UVX_PATH = uvxPath;
  }

  const nodePath = mcpManager.resolveNodeExecutable();
  if (nodePath && !process.env.ULTRON_NODE_PATH) {
    process.env.ULTRON_NODE_PATH = nodePath;
  }

  mcpManager.initializeMcp({
    userDataPath: getConnectorsRoot(),
    windowsUiaAutoInstall: false
  }).then((status) => {
    console.log('[MCP] Initialized:', JSON.stringify(status));
  }).catch((err) => {
    console.warn('[MCP] Init failed (native tools still available):', err.message);
  });

  const { session } = require('electron');
  session.defaultSession.on('preload-error', (event, preloadPath, error) => {
    console.error('[PRELOAD ERROR] Path:', preloadPath);
    console.error('[PRELOAD ERROR] Error Stack:', error.stack || error);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    mcpManager.shutdownMcp().finally(() => app.quit());
  }
});
