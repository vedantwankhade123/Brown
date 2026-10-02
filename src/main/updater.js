const { autoUpdater } = require('electron-updater');
const { ipcMain, app, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { verifyInstaller, startInstaller } = require('./update-install');
let initialized = false;
let checkPromise = null;
let downloadPromise = null;
let installPromise = null;
let downloadedInstaller = null;
let downloadedExpected = null;
let downloadPhase = 'idle';
let lastStatusKey = '';
const notified = new Set();

let mainWindowRef = null;
let lastUpdatePayload = null;      // latest known 'available' payload (incl. downloadUrl)
let electronUpdaterHasUpdate = false; // true only when autoUpdater itself found an update

function sendToRenderer(channel, data) {
  if (data?.status === 'available' && ['downloading', 'downloaded', 'installing'].includes(downloadPhase)) return;
  if (['available', 'downloaded'].includes(data?.status)) {
    const key = `${data.status}-${data.version}`;
    if (lastStatusKey === key) return;
    lastStatusKey = key;
  }
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
  if (notified.has(`avail-${version}`)) return;
  notified.add(`avail-${version}`);
  notify(`Brown v${version} is available`, 'Open Brown to update — it takes under a minute.');
}

function notifyUpdateReady(version) {
  if (notified.has(`ready-${version}`)) return;
  notified.add(`ready-${version}`);
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
    currentVersion: app.getVersion(),
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
    out.on('error', (error) => { try { fs.unlinkSync(dest); } catch (_) {} reject(error); });
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
      res.on('aborted', () => { out.destroy(); reject(new Error('Download interrupted. Please retry.')); });
      out.on('finish', () => {
        out.close(() => {
          if (total && transferred !== total) return reject(new Error('Download incomplete. Please retry.'));
          resolve(dest);
        });
      });
      res.on('error', (e) => { out.destroy(); try { fs.unlinkSync(dest); } catch (_) {} reject(e); });
    });
  });
}

function initAutoUpdater(mainWindow) {
  mainWindowRef = mainWindow;
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;

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
    if (downloadPhase !== 'idle') return;
    console.log('[AUTO-UPDATER] Update available:', info.version);
    electronUpdaterHasUpdate = true;
    lastUpdatePayload = mapUpdateInfo(info);
    downloadedExpected = info.files?.find(file => /\.exe$/i.test(String(file.url))) || info.files?.[0];
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
    downloadedInstaller = info.downloadedFile || autoUpdater.installerPath;
  });

  function checkForUpdatesQuietly() {
    if (checkPromise) return checkPromise;
    if (['downloading', 'downloaded', 'installing'].includes(downloadPhase)) return Promise.resolve({ status: downloadPhase, version: lastUpdatePayload?.version });
    checkPromise = performCheck().finally(() => { checkPromise = null; });
    return checkPromise;
  }

  async function performCheck() {
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
          const exeAsset = ghRelease.assets?.find(a => a.name === 'Brown-AI-Setup.exe')
            || ghRelease.assets?.find(a => /setup.*\.exe$/i.test(a.name || ''));
          if (!exeAsset) throw new Error('The release installer is not ready. Try again later.');
          const payload = {
            status: 'available',
            version: latestVer,
            currentVersion: curVer,
            releaseDate: ghRelease.published_at,
            releaseNotes: ghRelease.body || 'New features, security updates, and performance improvements.',
            downloadUrl: exeAsset.browser_download_url,
            expected: { size: exeAsset.size, sha256: exeAsset.digest?.replace(/^sha256:/, '') }
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
    if (downloadPhase === 'idle') sendToRenderer('update-status', { status: 'checking' });
    return await checkForUpdatesQuietly();
  });

  ipcMain.handle('download-update', () => {
    if (downloadPromise) return downloadPromise;
    downloadPromise = performDownload().finally(() => { downloadPromise = null; });
    return downloadPromise;
  });

  async function performDownload() {
    if (['downloaded', 'installing'].includes(downloadPhase)) return { status: downloadPhase };
    downloadPhase = 'downloading';
    try {
      console.log('[AUTO-UPDATER] Starting update download...');
      if (app.isPackaged && electronUpdaterHasUpdate) {
        const files = await autoUpdater.downloadUpdate();
        downloadedInstaller = files?.find(file => /\.exe$/i.test(file)) || autoUpdater.installerPath;
        await verifyInstaller(downloadedInstaller, downloadedExpected);
        downloadPhase = 'downloaded';
        sendToRenderer('update-status', { status: 'downloaded', version: lastUpdatePayload?.version });
        notifyUpdateReady(lastUpdatePayload?.version);
        return { status: 'downloaded' };
      }
      // Fallback: direct installer download from the release asset URL.
      if (lastUpdatePayload?.downloadUrl && /github/.test(lastUpdatePayload.downloadUrl)) {
        const version = lastUpdatePayload.version;
        sendToRenderer('update-status', { status: 'downloading', percent: 0, version });
        const dest = await downloadInstallerFallback(lastUpdatePayload.downloadUrl, version);
        await verifyInstaller(dest, lastUpdatePayload.expected);
        downloadedInstaller = dest;
        downloadedExpected = lastUpdatePayload.expected;
        downloadPhase = 'downloaded';
        sendToRenderer('update-status', { status: 'downloaded', version });
        notifyUpdateReady(version);
        return { status: 'downloaded' };
      }
      throw new Error('No installer URL available. Re-check for updates and try again.');
    } catch (error) {
      downloadPhase = 'idle';
      downloadedInstaller = null;
      console.error('[AUTO-UPDATER] Download failed:', error);
      sendToRenderer('update-status', {
        status: 'error',
        version: lastUpdatePayload?.version || app.getVersion(),
        error: error.message
      });
      return { status: 'error', error: error.message };
    }
  }

  ipcMain.handle('restart-and-install', () => {
    if (installPromise) return installPromise;
    installPromise = (async () => {
      try {
        if (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE) throw new Error('Use the Setup installer to update this edition of Brown.');
        if (downloadPhase !== 'downloaded' || !downloadedInstaller) throw new Error('Download the update before restarting.');
        await verifyInstaller(downloadedInstaller, downloadedExpected);
        downloadPhase = 'installing';
        await startInstaller(downloadedInstaller, path.dirname(app.getPath('exe')));
        sendToRenderer('update-status', { status: 'installing', version: lastUpdatePayload?.version });
        setTimeout(() => app.exit(0), 500);
        return { status: 'installing' };
      } catch (error) {
        downloadPhase = downloadedInstaller ? 'downloaded' : 'idle';
        sendToRenderer('update-status', { status: 'install-error', error: error.message });
        installPromise = null;
        return { status: 'error', error: error.message };
      }
    })().then(result => {
      if (result.status === 'error') installPromise = null;
      return result;
    });
    return installPromise;
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
