const { BrowserWindow, screen, globalShortcut, ipcMain, app } = require('electron');
const path = require('path');

let floatingWindow = null;
let mainWindowRef = null;
let isPinned = false;

function getOptimalFloatingBounds() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;
    
    // Width and height of the floating container window
    const width = 780;
    const height = 580;
    
    // Center horizontally, anchor snugly above the taskbar
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    // Position bottom of window snugly ~4px above the workArea bottom (taskbar)
    const y = Math.round(workArea.y + workArea.height - height - 4);
    
    return { x, y, width, height };
  } catch (err) {
    return { x: 300, y: 500, width: 760, height: 480 };
  }
}

function getOptimalMiniPillBounds() {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const workArea = primaryDisplay.workArea;
    const width = 216;
    const height = 52;
    const x = Math.round(workArea.x + (workArea.width - width) / 2);
    const y = Math.round(workArea.y + workArea.height - height - 4);
    return { x, y, width, height };
  } catch (err) {
    return { x: 500, y: 700, width: 216, height: 52 };
  }
}

function setFloatingBarMode(miniMode) {
  if (!floatingWindow || floatingWindow.isDestroyed()) return;
  const bounds = miniMode ? getOptimalMiniPillBounds() : getOptimalFloatingBounds();
  floatingWindow.setBounds(bounds);
  if (!miniMode) {
    floatingWindow.focus();
  }
}

function createFloatingBarWindow(mainWindow) {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    return floatingWindow;
  }

  mainWindowRef = mainWindow;
  const bounds = getOptimalFloatingBounds();

  floatingWindow = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  floatingWindow.loadFile(path.join(__dirname, '..', 'renderer', 'floating-bar.html'));

  floatingWindow.on('blur', () => {
    if (!isPinned && floatingWindow && !floatingWindow.isDestroyed() && floatingWindow.isVisible()) {
      showFloatingBar('', true);
    }
  });

  // Re-adjust position if screen metrics change (e.g. resolution / taskbar change)
  screen.on('display-metrics-changed', () => {
    if (floatingWindow && !floatingWindow.isDestroyed()) {
      const newBounds = getOptimalFloatingBounds();
      floatingWindow.setBounds(newBounds);
    }
  });

  // Automatically show mini pill companion widget ONLY when main window is minimized
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.on('minimize', () => {
      showFloatingBar('', true);
    });
    mainWindow.on('restore', () => {
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.hide();
      }
    });
    mainWindow.on('show', () => {
      if (floatingWindow && !floatingWindow.isDestroyed()) {
        floatingWindow.hide();
      }
    });
  }

  registerGlobalShortcuts();

  return floatingWindow;
}

function registerGlobalShortcuts() {
  const candidateShortcuts = [
    'Alt+Q',
    'Alt+Z',
    'CommandOrControl+Space',
    'F12',
    'Alt+U',
    'CommandOrControl+Shift+Space'
  ];
  const registeredShortcuts = [];

  for (const shortcut of candidateShortcuts) {
    try {
      globalShortcut.unregister(shortcut);
    } catch (e) {}

    try {
      const ok = globalShortcut.register(shortcut, () => {
        toggleFloatingBar();
      });
      if (ok) {
        registeredShortcuts.push(shortcut);
      }
    } catch (err) {
      // Ignored if shortcut is reserved by OS
    }
  }

  if (registeredShortcuts.length > 0) {
    console.log(`[FloatingBar] Registered active shortcuts: ${registeredShortcuts.join(' | ')}`);
  } else {
    console.warn('[FloatingBar] Could not register global hotkeys. Floating bar can still be toggled via app UI or IPC.');
  }
}

function showFloatingBar(prefill = '', miniMode = false) {
  if (!floatingWindow || floatingWindow.isDestroyed()) {
    createFloatingBarWindow(mainWindowRef);
  }

  const bounds = miniMode ? getOptimalMiniPillBounds() : getOptimalFloatingBounds();
  floatingWindow.setBounds(bounds);
  floatingWindow.show();
  if (!miniMode) {
    floatingWindow.focus();
  }

  if (floatingWindow.webContents) {
    floatingWindow.webContents.send('floating-bar:activated', { prefill, miniMode });
  }
}

function hideFloatingBar(force = false) {
  if (floatingWindow && !floatingWindow.isDestroyed() && floatingWindow.isVisible()) {
    if (!force) {
      showFloatingBar('', true);
    } else {
      floatingWindow.hide();
    }
  }
}

function toggleFloatingBar() {
  if (!floatingWindow || floatingWindow.isDestroyed()) {
    showFloatingBar();
    return;
  }

  if (floatingWindow.isVisible()) {
    hideFloatingBar();
  } else {
    showFloatingBar();
  }
}

function expandToMainWindow(queryData = {}) {
  hideFloatingBar();

  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    if (mainWindowRef.isMinimized()) mainWindowRef.restore();
    if (!mainWindowRef.isVisible()) mainWindowRef.show();
    mainWindowRef.focus();

    if (mainWindowRef.webContents) {
      mainWindowRef.webContents.send('floating-bar:hand-off', queryData);
    }
  }
}

function setPinnedState(pinned) {
  isPinned = !!pinned;
}

module.exports = {
  createFloatingBarWindow,
  showFloatingBar,
  hideFloatingBar,
  toggleFloatingBar,
  expandToMainWindow,
  setPinnedState,
  setFloatingBarMode,
  getFloatingWindow: () => floatingWindow
};
