const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const { setupIpcHandlers, setMainWindow } = require('./ipc');

function initializeDataDirectories() {
  const appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
  const localAgentDir = path.join(appDataPath, 'LocalAgent');
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
