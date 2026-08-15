const { app, BrowserWindow, shell, nativeTheme } = require('electron');
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

const WINDOW_BG = '#000000';
const TITLE_BAR_COLOR = '#131314';

let mainWindow = null;

function applyWinTitleBarOverlay(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return;
  try {
    win.setTitleBarOverlay({
      color: TITLE_BAR_COLOR,
      symbolColor: '#ffffff',
      height: 32
    });
  } catch (err) {
    console.warn('[window] setTitleBarOverlay failed:', err.message);
  }
}

function createWindow() {
  const isWin32 = process.platform === 'win32';
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: isWin32 ? TITLE_BAR_COLOR : WINDOW_BG,
    title: 'Ultron: Autonomous Local AI Agent',
    icon: path.join(__dirname, '..', '..', 'Assets', isWin32 ? 'ultron-logo.ico' : 'ultron-logo.png'),
    ...(isWin32
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: TITLE_BAR_COLOR,
            symbolColor: '#ffffff',
            height: 32
          }
        }
      : { frame: true }),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    applyWinTitleBarOverlay(mainWindow);
    mainWindow.show();
    mainWindow.focus();
  });

  if (isWin32) {
    mainWindow.on('maximize', () => applyWinTitleBarOverlay(mainWindow));
    mainWindow.on('unmaximize', () => applyWinTitleBarOverlay(mainWindow));
    mainWindow.on('enter-full-screen', () => applyWinTitleBarOverlay(mainWindow));
    mainWindow.on('leave-full-screen', () => applyWinTitleBarOverlay(mainWindow));
    mainWindow.webContents.on('did-finish-load', () => {
      applyWinTitleBarOverlay(mainWindow);
      mainWindow.webContents.executeJavaScript(
        "document.body.classList.add('platform-win32')",
        true
      ).catch(() => {});
    });
  }

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

process.on('uncaughtException', (err) => {
  console.error('[MAIN] Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[MAIN] Unhandled Rejection at:', promise, 'reason:', reason);
});

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[MAIN] Another instance of Ultron is already running. Exiting second instance.');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  try {
    nativeTheme.themeSource = 'dark';
    initializeDataDirectories();
    setupIpcHandlers();
  } catch (err) {
    console.error('[MAIN] Error during early initialization:', err);
  }

  try {
    if (process.platform === 'win32') {
      const { probeNativeSttAvailable } = require('./voice-stt-native');
      probeNativeSttAvailable()
        .then((ok) => console.log('[voice-stt] Windows speech recognition:', ok ? 'ready' : 'unavailable'))
        .catch((err) => console.warn('[voice-stt] Probe failed:', err.message));
    }
  } catch (err) {
    console.warn('[MAIN] Probe native STT failed:', err.message);
  }

  try {
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
  } catch (err) {
    console.warn('[MAIN] MCP initialization error:', err.message);
  }

  try {
    const { session } = require('electron');
    session.defaultSession.on('preload-error', (event, preloadPath, error) => {
      console.error('[PRELOAD ERROR] Path:', preloadPath);
      console.error('[PRELOAD ERROR] Error Stack:', error.stack || error);
    });
  } catch (err) {
    console.warn('[MAIN] Session setup error:', err.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    Promise.race([
      mcpManager.shutdownMcp(),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ]).finally(() => {
      app.quit();
    });
  }
});
