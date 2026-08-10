const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { setupIpcHandlers, setMainWindow } = require('./ipc');
const { initAutoUpdater } = require('./updater');

// Redirect user data & cache directory to LOCALAPPDATA to prevent Roaming permission locks (0x5)
const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
const dataFolder = app.isPackaged ? 'UltronData' : 'UltronDataDev';
app.setPath('userData', path.join(localAppData, dataFolder));

// Disable GPU and HTTP disk cache locks on Windows
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('disk-cache-size', '1');

function getDefaultDataDirectory() {
  if (app.isPackaged) {
    // Default to 'data' folder inside installation directory chosen by user at setup
    const installDir = path.dirname(app.getPath('exe'));
    const installDataDir = path.join(installDir, 'data');
    try {
      if (!fs.existsSync(installDataDir)) {
        fs.mkdirSync(installDataDir, { recursive: true });
      }
      const testFile = path.join(installDataDir, '.permcheck');
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return installDataDir;
    } catch (e) {
      console.warn('[DATA-DIR] Installation directory not writable; using AppData fallback:', e);
    }
  }
  const fallbackDir = path.join(app.getPath('userData'), 'data');
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return fallbackDir;
}

function initializeDataDirectories() {
  let localAgentDir = getDefaultDataDirectory();

  try {
    const configFile = path.join(localAgentDir, 'config.json');
    
    // Read custom path from config.json if set by user in Settings
    if (fs.existsSync(configFile)) {
      try {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
        if (config.customDataDir && fs.existsSync(config.customDataDir)) {
          localAgentDir = config.customDataDir;
        }
      } catch (e) {
        console.error('Failed to read config.json:', e);
      }
    }
    
    const tempDir = path.join(localAgentDir, 'temp');
    const memoryDir = path.join(localAgentDir, 'memory');
    if (!fs.existsSync(localAgentDir)) {
      fs.mkdirSync(localAgentDir, { recursive: true });
    }
    if (!fs.existsSync(memoryDir)) {
      fs.mkdirSync(memoryDir, { recursive: true });
    }
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  } catch (err) {
    console.error('Error initializing data directories:', err);
    localAgentDir = getDefaultDataDirectory();
  }
  
  // Expose path info to process environment
  process.env.ULTRON_DATA_DIR = localAgentDir;
}

module.exports = { getDefaultDataDirectory };

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    backgroundColor: '#0a0a0c',
    title: 'Ultron AI: Local Windows Autonomous AI Framework',
    icon: path.join(__dirname, '..', '..', 'Assets', 'ultron-logo.png'),
    frame: true, // Native Windows decoration
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

  // Intercept in-page external link clicks to open in default system browser
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL() && (url.startsWith('http://') || url.startsWith('https://'))) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Handle external link clicks in new windows/tabs
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Automatically grant media/microphone recording permissions
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['media', 'audioCapture', 'mediaKeySystem', 'notifications', 'pointerLock'];
    callback(allowed.includes(permission));
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return true;
  });

  // Strip native menus to maintain clean Obsidian UX
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  
  // Set main window in IPC handler
  setMainWindow(mainWindow);

  // Initialize auto-updater service
  initAutoUpdater(mainWindow);
}

app.whenReady().then(() => {
  initializeDataDirectories();
  setupIpcHandlers();
  
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
    app.quit();
  }
});
