const { autoUpdater } = require('electron-updater');
const { ipcMain, app } = require('electron');

let mainWindowRef = null;

function sendToRenderer(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, data);
  }
}

function mapUpdateInfo(info) {
  if (!info) return null;
  const notes = info.releaseNotes;
  const releaseNotes = Array.isArray(notes)
    ? notes.map(entry => entry.note || '').filter(Boolean).join('\n\n')
    : (notes || 'New features and bug fixes available.');
  return {
    status: 'available',
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes
  };
}

/**
 * Initialize auto-updater service with GitHub Releases provider
 * @param {BrowserWindow} mainWindow Reference to main application window
 */
function initAutoUpdater(mainWindow) {
  mainWindowRef = mainWindow;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = true;

  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'vedantwankhade123',
      repo: 'Ultron',
      releaseType: 'release'
    });
  } catch (e) {
    console.error('[AUTO-UPDATER] setFeedURL error:', e);
  }

  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AUTO-UPDATER] Checking for update...');
    sendToRenderer('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AUTO-UPDATER] Update available:', info.version);
    sendToRenderer('update-status', mapUpdateInfo(info));
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AUTO-UPDATER] Up to date (v' + app.getVersion() + ')');
    sendToRenderer('update-status', {
      status: 'not-available',
      version: app.getVersion()
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AUTO-UPDATER] Error:', err ? err.message : err);
    sendToRenderer('update-status', {
      status: 'error',
      version: app.getVersion(),
      error: err?.message || 'Update check failed.'
    });
  });

  autoUpdater.on('download-progress', (progressObj) => {
    sendToRenderer('update-status', {
      status: 'downloading',
      percent: Math.round(progressObj.percent),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AUTO-UPDATER] Update downloaded:', info.version);
    sendToRenderer('update-status', {
      status: 'downloaded',
      version: info.version
    });
  });

  async function checkForUpdatesQuietly() {
    if (!app.isPackaged) return { status: 'dev-mode', version: app.getVersion() };
    const result = await autoUpdater.checkForUpdates();
    const info = result?.updateInfo;
    if (info?.version && info.version !== app.getVersion()) {
      const payload = mapUpdateInfo(info);
      sendToRenderer('update-status', payload);
      return payload;
    }
    const payload = { status: 'not-available', version: app.getVersion() };
    sendToRenderer('update-status', payload);
    return payload;
  }

  ipcMain.handle('check-for-updates', async () => {
    try {
      if (!app.isPackaged) {
        console.log('[AUTO-UPDATER] App running in dev mode; skipping remote check.');
        return { status: 'dev-mode', version: app.getVersion() };
      }
      sendToRenderer('update-status', { status: 'checking' });
      return await checkForUpdatesQuietly();
    } catch (error) {
      console.error('[AUTO-UPDATER] Check failed:', error);
      const resObj = {
        status: 'error',
        version: app.getVersion(),
        error: error.message || 'Update check failed.'
      };
      sendToRenderer('update-status', resObj);
      return resObj;
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      console.log('[AUTO-UPDATER] Starting update download...');
      await autoUpdater.downloadUpdate();
      return { status: 'downloading' };
    } catch (error) {
      console.error('[AUTO-UPDATER] Download failed:', error);
      return { status: 'error', error: error.message };
    }
  });

  ipcMain.handle('restart-and-install', () => {
    console.log('[AUTO-UPDATER] Restarting application to apply update...');
    autoUpdater.quitAndInstall(false, true);
  });

  if (app.isPackaged) {
    setTimeout(() => {
      checkForUpdatesQuietly().catch((err) => {
        console.error('[AUTO-UPDATER] Background check failed:', err);
      });
    }, 10000);
  }
}

module.exports = { initAutoUpdater };
