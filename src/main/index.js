const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupIpcHandlers, setMainWindow } = require('./ipc');

function initializeDataDirectories() {
  const appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  const systemConfigDir = path.join(appDataPath, 'LocalAgent');
  const configFile = path.join(systemConfigDir, 'config.json');
  
  let localAgentDir = path.join(app.getAppPath(), 'memory');
  
  if (!fs.existsSync(systemConfigDir)) {
    fs.mkdirSync(systemConfigDir, { recursive: true });
  }
  
  // Read custom path from config.json if it exists
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
  if (!fs.existsSync(localAgentDir)) {
    fs.mkdirSync(localAgentDir, { recursive: true });
  }
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Expose path info to process environment
  process.env.ULTRON_DATA_DIR = localAgentDir;
}

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Ultron: Local Windows Autonomous AI Agent',
    icon: path.join(__dirname, '..', '..', 'Assets', 'ultron-logo.png'),
    frame: true, // Native Windows decoration
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
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

  // Strip native menus to maintain clean Obsidian UX
  mainWindow.setMenuBarVisibility(false);

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  
  // Set main window in IPC handler
  setMainWindow(mainWindow);
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
