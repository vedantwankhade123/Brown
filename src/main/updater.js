const { autoUpdater } = require('electron-updater');
const { ipcMain, app } = require('electron');
const https = require('https');

let mainWindowRef = null;

function fetchLatestGitHubRelease() {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/vedantwankhade123/Ultron/releases/latest',
      headers: { 'User-Agent': 'Ultron-AI-App' }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            resolve(JSON.parse(data));
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

/**
 * Initialize auto-updater service with GitHub Releases provider
 * @param {BrowserWindow} mainWindow Reference to main application window
 */
function initAutoUpdater(mainWindow) {
  mainWindowRef = mainWindow;

  // Configure autoUpdater settings
  autoUpdater.autoDownload = false; // Prompt user before downloading
  autoUpdater.autoInstallOnAppQuit = true;

  // Explicitly set GitHub provider feed URL
  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'vedantwankhade123',
      repo: 'Ultron'
    });
  } catch (e) {
    console.error('[AUTO-UPDATER] setFeedURL error:', e);
  }

  // Log updater activity
  autoUpdater.logger = console;

  // 1. Check for updates event handlers
  autoUpdater.on('checking-for-update', () => {
    console.log('[AUTO-UPDATER] Checking for update...');
    sendToRenderer('update-status', { status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AUTO-UPDATER] Update available:', info.version);
    sendToRenderer('update-status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes || 'New features and bug fixes available.'
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AUTO-UPDATER] Up to date (v' + app.getVersion() + ')');
    sendToRenderer('update-status', {
      status: 'not-available',
      version: app.getVersion()
    });
  });

  autoUpdater.on('error', (err) => {
    console.error('[AUTO-UPDATER] Error:', err ? err.message : err);
    sendToRenderer('update-status', {
      status: 'not-available',
      version: app.getVersion()
    });
  });

  // 2. Download progress handler
  autoUpdater.on('download-progress', (progressObj) => {
    sendToRenderer('update-status', {
      status: 'downloading',
      percent: Math.round(progressObj.percent),
      bytesPerSecond: progressObj.bytesPerSecond,
      transferred: progressObj.transferred,
      total: progressObj.total
    });
  });

  // 3. Download complete handler
  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AUTO-UPDATER] Update downloaded:', info.version);
    sendToRenderer('update-status', {
      status: 'downloaded',
      version: info.version
    });
  });

  // Setup IPC channels for Renderer UI to invoke
  ipcMain.handle('check-for-updates', async () => {
    try {
      if (!app.isPackaged) {
        console.log('[AUTO-UPDATER] App running in dev mode; skipping remote check.');
        return { status: 'dev-mode', version: app.getVersion() };
      }

      sendToRenderer('update-status', { status: 'checking' });

      // Direct GitHub API query for maximum reliability
      const latest = await fetchLatestGitHubRelease();
      const currentVersion = app.getVersion();

      if (latest && latest.tag_name) {
        const latestTag = latest.tag_name.replace(/^v/, ''); // e.g. "1.0.3"
        if (latestTag > currentVersion) {
          const resObj = {
            status: 'available',
            version: latestTag,
            releaseNotes: latest.body || 'New features and bug fixes available.'
          };
          sendToRenderer('update-status', resObj);
          return resObj;
        } else {
          const resObj = { status: 'not-available', version: currentVersion };
          sendToRenderer('update-status', resObj);
          return resObj;
        }
      }

      // Fallback check
      await autoUpdater.checkForUpdates();
      return { status: 'not-available', version: currentVersion };
    } catch (error) {
      console.error('[AUTO-UPDATER] Check failed:', error);
      const resObj = { status: 'not-available', version: app.getVersion() };
      sendToRenderer('update-status', resObj);
      return resObj;
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      console.log('[AUTO-UPDATER] Starting update download...');
      return await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('[AUTO-UPDATER] Download failed:', error);
      return { status: 'error', error: error.message };
    }
  });

  ipcMain.handle('restart-and-install', () => {
    console.log('[AUTO-UPDATER] Restarting application to apply update...');
    autoUpdater.quitAndInstall(false, true);
  });

  // Automatically check for updates 10 seconds after launch in production
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.error('[AUTO-UPDATER] Background check failed:', err);
      });
    }, 10000);
  }
}

/**
 * Send status update safely to the renderer window
 */
function sendToRenderer(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, data);
  }
}

module.exports = { initAutoUpdater };
