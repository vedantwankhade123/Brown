const { autoUpdater } = require('electron-updater');
const { ipcMain, app, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

let mainWindowRef = null;
let lastUpdatePayload = null;      // latest known 'available' payload (incl. downloadUrl)
let lastNotifiedVersion = null;    // dedupe native notifications per version
let electronUpdaterHasUpdate = false; // true only when autoUpdater itself found an update
let fallbackInstallerPath = null;  // exe downloaded via the direct-download fallback

function sendToRenderer(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send(channel, data);
  }
}

function notify(title, body) {
  try {
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body, silent: false });
    n.on('click', () => {
      if (mainWindowRef && !mainWindowRef.isDestroyed()) {
        if (mainWindowRef.isMinimized()) mainWindowRef.restore();
        mainWindowRef.show();
        mainWindowRef.focus();
      }
    });
    n.show();
  } catch (_) { /* notifications are best-effort, never break the updater */ }
}

function notifyUpdateAvailable(version) {
  if (lastNotifiedVersion === `avail-${version}`) return;
  lastNotifiedVersion = `avail-${version}`;
  notify(`Brown v${version} is available`, 'Open Brown to update — it takes under a minute.');
}

function notifyUpdateReady(version) {
  if (lastNotifiedVersion === `ready-${version}`) return;
  lastNotifiedVersion = `ready-${version}`;
  notify('Update ready to install', `Brown v${version} downloaded. Restart now to apply it.`);
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

async function fetchLatestGitHubRelease() {
  try {
    return await new Promise((resolve) => {
      const req = https.get('https://api.github.com/repos/vedantwankhade123/Brown/releases/latest', {
        headers: { 'User-Agent': 'Brown-AI-Desktop-App', 'Accept': 'application/vnd.github+json' },
        timeout: 10000
      }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return resolve(null); }
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch (_) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
    });
  } catch (_) {
    return null;
  }
}

function httpsFollow(url, redirectsLeft, onResponse) {
  const req = https.get(url, {
    headers: { 'User-Agent': 'Brown-AI-Desktop-App' },
    timeout: 30000
  }, (res) => {
    const target = res.headers.location;
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && target && redirectsLeft > 0) {
      res.resume();
      httpsFollow(target, redirectsLeft - 1, onResponse);
      return;
    }
    onResponse(res);
  });
  req.on('error', (err) => onResponse(null, err));
  req.on('timeout', () => { req.destroy(new Error('Download timed out')); });
}

/**
 * Fallback installer download: used when electron-updater has no manifest
 * (missing latest.yml) but the GitHub Releases API exposed a Setup exe.
 */
function downloadInstallerFallback(downloadUrl, version) {
  return new Promise((resolve, reject) => {
    const safeVersion = String(version || 'latest').replace(/[^0-9a-zA-Z.\-]/g, '');
    const dest = path.join(app.getPath('temp'), `Brown-Update-v${safeVersion}.exe`);
    if (fs.existsSync(dest)) {
      try { fs.unlinkSync(dest); } catch (_) {}
    }
    const out = fs.createWriteStream(dest);
    httpsFollow(downloadUrl, 6, (res, err) => {
      if (err || !res || res.statusCode !== 200) {
        out.destroy();
        try { fs.unlinkSync(dest); } catch (_) {}
        return reject(new Error(err?.message || `Download failed (HTTP ${res?.statusCode})`));
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let transferred = 0;
      let lastPct = -1;
      res.on('data', (chunk) => {
        transferred += chunk.length;
        if (total) {
          const percent = Math.min(100, Math.round((transferred / total) * 100));
          if (percent !== lastPct) {
            lastPct = percent;
            sendToRenderer('update-status', { status: 'downloading', percent, version });
          }
        }
      });
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(dest); });
      out.on('error', (e) => { try { fs.unlinkSync(dest); } catch (_) {} reject(e); });
      res.on('error', (e) => { try { fs.unlinkSync(dest); } catch (_) {} reject(e); });
    });
  });
}

function launchInstallerAndQuit(exePath) {
  // Spawn detached so the installer survives the app exiting.
  const child = require('child_process').spawn(exePath, [], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => app.exit(0), 400);
}

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
      repo: 'Brown',
      releaseType: 'release'
    });
  } catch (e) {
    console.error('[AUTO-UPDATER] setFeedURL error:', e);
  }

  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AUTO-UPDATER] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AUTO-UPDATER] Update available:', info.version);
    electronUpdaterHasUpdate = true;
    lastUpdatePayload = mapUpdateInfo(info);
    sendToRenderer('update-status', lastUpdatePayload);
    notifyUpdateAvailable(info.version);
  });

  autoUpdater.on('update-not-available', () => {
    electronUpdaterHasUpdate = false;
    console.log('[AUTO-UPDATER] Up to date (v' + app.getVersion() + ')');
  });

  autoUpdater.on('error', (err) => {
    electronUpdaterHasUpdate = false;
    console.error('[AUTO-UPDATER] Error:', err ? err.message : err);
    // Non-fatal: checkForUpdatesQuietly() falls through to the GitHub API path.
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
    sendToRenderer('update-status', { status: 'downloaded', version: info.version });
    notifyUpdateReady(info.version);
  });

  async function checkForUpdatesQuietly() {
    try {
      if (app.isPackaged) {
        const result = await autoUpdater.checkForUpdates().catch(() => null);
        const info = result?.updateInfo;
        if (info?.version && compareSemver(info.version, app.getVersion()) > 0) {
          const payload = mapUpdateInfo(info);
          lastUpdatePayload = payload;
          sendToRenderer('update-status', payload);
          notifyUpdateAvailable(info.version);
          return payload;
        }
      }

      // GitHub Releases API check (works packaged & dev; also covers
      // releases published without latest.yml)
      const ghRelease = await fetchLatestGitHubRelease();
      if (ghRelease && ghRelease.tag_name) {
        const latestVer = ghRelease.tag_name.replace(/^v/i, '');
        const curVer = app.getVersion() || '1.0.1';
        if (compareSemver(latestVer, curVer) > 0) {
          const exeAsset = ghRelease.assets?.find(a => /\.exe$/i.test(a.name || '') && /setup/i.test(a.name))
            || ghRelease.assets?.find(a => /\.exe$/i.test(a.name || ''))
            || ghRelease.assets?.[0];
          const payload = {
            status: 'available',
            version: latestVer,
            releaseDate: ghRelease.published_at,
            releaseNotes: ghRelease.body || 'New features, security updates, and performance improvements.',
            downloadUrl: exeAsset?.browser_download_url || ghRelease.html_url
          };
          lastUpdatePayload = payload;
          sendToRenderer('update-status', payload);
          notifyUpdateAvailable(latestVer);
          return payload;
        }
      }

      const payload = { status: 'not-available', version: app.getVersion() || '1.0.1' };
      sendToRenderer('update-status', payload);
      return payload;
    } catch (err) {
      console.warn('[AUTO-UPDATER] Check failed:', err?.message);
      const resObj = {
        status: 'error',
        version: app.getVersion() || '1.0.1',
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
      if (app.isPackaged && electronUpdaterHasUpdate) {
        await autoUpdater.downloadUpdate();
        return { status: 'downloading' };
      }
      // Fallback: direct installer download from the release asset URL.
      if (lastUpdatePayload?.downloadUrl && /github/.test(lastUpdatePayload.downloadUrl)) {
        const version = lastUpdatePayload.version;
        sendToRenderer('update-status', { status: 'downloading', percent: 0, version });
        const dest = await downloadInstallerFallback(lastUpdatePayload.downloadUrl, version);
        fallbackInstallerPath = dest;
        sendToRenderer('update-status', { status: 'downloaded', version });
        notifyUpdateReady(version);
        return { status: 'downloaded' };
      }
      throw new Error('No installer URL available. Re-check for updates and try again.');
    } catch (error) {
      console.error('[AUTO-UPDATER] Download failed:', error);
      sendToRenderer('update-status', {
        status: 'error',
        version: lastUpdatePayload?.version || app.getVersion(),
        error: error.message
      });
      return { status: 'error', error: error.message };
    }
  });

  ipcMain.handle('restart-and-install', () => {
    console.log('[AUTO-UPDATER] Restarting application to apply update...');
    try {
      if (fallbackInstallerPath && fs.existsSync(fallbackInstallerPath)) {
        launchInstallerAndQuit(fallbackInstallerPath);
        return;
      }
      autoUpdater.quitAndInstall(false, true);
    } catch (_) {
      if (fallbackInstallerPath && fs.existsSync(fallbackInstallerPath)) {
        launchInstallerAndQuit(fallbackInstallerPath);
        return;
      }
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
