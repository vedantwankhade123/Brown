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
      repo: 'Brown-Releases',
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

  async function fetchLatestGitHubRelease() {
    try {
      const https = require('https');
      return await new Promise((resolve) => {
        const req = https.get('https://api.github.com/repos/vedantwankhade123/Brown-Releases/releases/latest', {
          headers: { 'User-Agent': 'Brown-AI-Desktop-App' },
          timeout: 8000
        }, (res) => {
          if (res.statusCode !== 200) return resolve(null);
          let raw = '';
          res.on('data', chunk => raw += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(raw));
            } catch (_) {
              resolve(null);
            }
          });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
      });
    } catch (_) {
      return null;
    }
  }

  function compareSemver(v1, v2) {
    const p1 = (v1 || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    const p2 = (v2 || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const a = p1[i] || 0;
      const b = p2[i] || 0;
      if (a > b) return 1;
      if (a < b) return -1;
    }
    return 0;
  }

  async function checkForUpdatesQuietly() {
    try {
      if (app.isPackaged) {
        const result = await autoUpdater.checkForUpdates().catch(() => null);
        const info = result?.updateInfo;
        if (info?.version && compareSemver(info.version, app.getVersion()) > 0) {
          const payload = mapUpdateInfo(info);
          sendToRenderer('update-status', payload);
          return payload;
        }
      }

      // GitHub Releases API check (works packaged & dev)
      const ghRelease = await fetchLatestGitHubRelease();
      if (ghRelease && ghRelease.tag_name) {
        const latestVer = ghRelease.tag_name.replace(/^v/i, '');
        const curVer = app.getVersion() || '1.0.14';
        if (compareSemver(latestVer, curVer) > 0) {
          const exeAsset = ghRelease.assets?.find(a => a.name?.endsWith('.exe')) || ghRelease.assets?.[0];
          const payload = {
            status: 'available',
            version: latestVer,
            releaseDate: ghRelease.published_at,
            releaseNotes: ghRelease.body || 'New features, security updates, and performance improvements.',
            downloadUrl: exeAsset?.browser_download_url || ghRelease.html_url
          };
          sendToRenderer('update-status', payload);
          return payload;
        }
      }

      const payload = { status: 'not-available', version: app.getVersion() || '1.0.14' };
      sendToRenderer('update-status', payload);
      return payload;
    } catch (err) {
      console.warn('[AUTO-UPDATER] Check failed:', err?.message);
      const resObj = {
        status: 'error',
        version: app.getVersion() || '1.0.14',
        error: err?.message || 'Update check failed.'
      };
      sendToRenderer('update-status', resObj);
      return resObj;
    }
  }

  ipcMain.handle('check-for-updates', async () => {
    sendToRenderer('update-status', { status: 'checking' });
    return await checkForUpdatesQuietly();
  });

  ipcMain.handle('download-update', async () => {
    try {
      console.log('[AUTO-UPDATER] Starting update download...');
      if (app.isPackaged) {
        await autoUpdater.downloadUpdate();
        return { status: 'downloading' };
      }
      // Simulate/Trigger download
      sendToRenderer('update-status', { status: 'downloaded', version: app.getVersion() });
      return { status: 'downloaded' };
    } catch (error) {
      console.error('[AUTO-UPDATER] Download failed:', error);
      return { status: 'error', error: error.message };
    }
  });

  ipcMain.handle('restart-and-install', () => {
    console.log('[AUTO-UPDATER] Restarting application to apply update...');
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (_) {
      app.relaunch();
      app.exit(0);
    }
  });

  // Background check on startup and every 30 minutes
  setTimeout(() => {
    checkForUpdatesQuietly().catch(() => {});
  }, 6000);

  setInterval(() => {
    checkForUpdatesQuietly().catch(() => {});
  }, 30 * 60 * 1000);
}

module.exports = { initAutoUpdater };
