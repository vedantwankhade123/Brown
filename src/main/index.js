const { app, BrowserWindow, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupIpcHandlers, setMainWindow, reconcileInstallFirstRunMarker, initialWindowSize } = require('./ipc');
const { startDesktopSyncServer, stopDesktopSyncServer } = require('./desktop-sync-server');
const { initAutoUpdater } = require('./updater');
const { createFloatingBarWindow } = require('./floating-bar-window');
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
  // After Fresh wipe of INSTDIR, missing beside-exe marker forces setupCompleted=false
  reconcileInstallFirstRunMarker();
}

module.exports = { getDefaultDataDirectory: () => require('./paths').getDefaultAgentDataDir() };

const WINDOW_BG = '#000000';
const TITLE_BAR_COLOR = '#1B1B1B';
const themeState = require('./theme-state');

let mainWindow = null;

function applyWinTitleBarOverlay(win) {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return;
  try {
    const { color, symbolColor } = themeState.overlayColors();
    win.setTitleBarOverlay({ color, symbolColor, height: 36 });
  } catch (err) {
    console.warn('[window] setTitleBarOverlay failed:', err.message);
  }
}

function resolveWindowIcon() {
  const roots = [
    path.join(__dirname, '..', '..', 'Assets', 'Brand-Assets'),
    path.join(__dirname, '..', '..', 'Assets'),
  ];
  // Rounded black-tile bear reads on both light and dark taskbars; PNG is the fallback.
  const names = ['Brown.ico', 'browny_white.png'];
  for (const dir of roots) {
    for (const name of names) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) return full;
    }
  }
  return undefined;
}

function createWindow() {
  const isWin32 = process.platform === 'win32';
  const initial = initialWindowSize();
  mainWindow = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    ...(initial.onboarding ? { center: true } : null),
    show: false,
    backgroundColor: isWin32 ? TITLE_BAR_COLOR : WINDOW_BG,
    title: 'Brown: Autonomous Local AI Agent',
    icon: resolveWindowIcon(isWin32),
    ...(isWin32
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: TITLE_BAR_COLOR,
            symbolColor: '#ffffff',
            height: 36
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

  // Guarantee main window opens directly on launch
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      applyWinTitleBarOverlay(mainWindow);
      mainWindow.show();
      mainWindow.focus();
    }
  }, 800);

  if (isWin32) {
    mainWindow.on('maximize', () => applyWinTitleBarOverlay(mainWindow));
    mainWindow.on('unmaximize', () => applyWinTitleBarOverlay(mainWindow));
    mainWindow.on('enter-full-screen', () => applyWinTitleBarOverlay(mainWindow));
    mainWindow.on('leave-full-screen', () => applyWinTitleBarOverlay(mainWindow));
    mainWindow.webContents.on('did-finish-load', () => {
      themeState.state.splashDone = false;
      applyWinTitleBarOverlay(mainWindow);
      startSplashWatch();
      mainWindow.webContents.executeJavaScript(
        "document.body.classList.add('platform-win32')",
        true
      ).catch(() => {});
      mainWindow.webContents
        .executeJavaScript("localStorage.getItem('ultron-theme')", true)
        .then((mode) => {
          themeState.state.light = mode === 'light';
          applyWinTitleBarOverlay(mainWindow);
        })
        .catch(() => {});
    });

    // Fallback in case the renderer never reports the splash as dismissed.
    // Polls actual splash visibility instead of using a fixed timer — slow
    // boots can outlast any timer and would flip the overlay white mid-splash.
    let splashWatch = null;
    function startSplashWatch() {
      if (splashWatch) clearInterval(splashWatch);
      splashWatch = setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed()) { clearInterval(splashWatch); splashWatch = null; return; }
        if (themeState.state.splashDone) { clearInterval(splashWatch); splashWatch = null; return; }
        mainWindow.webContents.executeJavaScript(
          "(() => { const s = document.getElementById('app-splash-screen'); return !s || getComputedStyle(s).display === 'none'; })()",
          true
        ).then((gone) => {
          if (gone) {
            clearInterval(splashWatch);
            splashWatch = null;
            themeState.state.splashDone = true;
            applyWinTitleBarOverlay(mainWindow);
          }
        }).catch(() => {
          clearInterval(splashWatch);
          splashWatch = null;
          themeState.state.splashDone = true;
          applyWinTitleBarOverlay(mainWindow);
        });
      }, 2000);
    }
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
  try { require('./error-logs').captureError(err, 'main'); } catch (_) {}
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[MAIN] Unhandled Rejection at:', promise, 'reason:', reason);
  try { require('./error-logs').captureError(reason instanceof Error ? reason : { message: String(reason), stack: reason && reason.stack }, 'main'); } catch (_) {}
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

    if (require('../config/release-features').computerActions) mcpManager.initializeMcp({
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
      try { require('./error-logs').captureError(error, 'preload'); } catch (_) {}
    });
  } catch (err) {
    console.warn('[MAIN] Session setup error:', err.message);
  }

  createWindow();

  try {
    startDesktopSyncServer({ getMainWindow: () => mainWindow });
  } catch (err) {
    console.warn('[MAIN] Desktop sync server failed:', err.message);
  }

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
      try { stopDesktopSyncServer(); } catch {}
      try { require('./voice-stt-live').cleanupLiveStt(); } catch {}
      app.quit();
    });
  }
});

app.on('will-quit', () => {
  try { require('./voice-stt-live').cleanupLiveStt(); } catch {}
});
