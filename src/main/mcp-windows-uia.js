/**
 * sbroenne/mcp-windows — UI Automation MCP (click/type by element name).
 * Downloads standalone server on first use if not present.
 */
const path = require('path');
const fs = require('fs');
const https = require('https');
const { execFile } = require('child_process');

const MCP_WINDOWS_UIA_VERSION = '1.3.18';
const RELEASE_ASSET = `windows-mcp-server-${MCP_WINDOWS_UIA_VERSION}-win-x64.zip`;
const RELEASE_URL = `https://github.com/sbroenne/mcp-windows/releases/download/v${MCP_WINDOWS_UIA_VERSION}/${RELEASE_ASSET}`;

function getInstallDir(userDataPath) {
  const root = userDataPath || process.env.ULTRON_CONNECTORS_DIR
    || process.env.ULTRON_DATA_DIR
    || path.join(process.env.LOCALAPPDATA || '', 'UltronData');
  return path.join(root, 'mcp-windows-uia');
}

function walkForExe(dir, depth = 0) {
  if (!dir || !fs.existsSync(dir) || depth > 4) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return null;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && /\.exe$/i.test(entry.name) && /mcp|windows/i.test(entry.name)) {
      return full;
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = walkForExe(path.join(dir, entry.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function resolveWindowsUiaExecutable(options = {}) {
  const fromEnv = process.env.ULTRON_MCP_WINDOWS_UIA_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  if (options.exePath && fs.existsSync(options.exePath)) return options.exePath;

  const installDir = getInstallDir(options.userDataPath);
  const cached = walkForExe(installDir);
  if (cached) return cached;

  if (options.legacyUserDataPath) {
    const legacyDir = getInstallDir(options.legacyUserDataPath);
    if (legacyDir !== installDir) {
      const legacy = walkForExe(legacyDir);
      if (legacy) return legacy;
    }
  }

  return null;
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    const request = https.get(url, { headers: { 'User-Agent': 'Ultron/1.0' } }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        fs.unlink(destPath, () => {});
        return downloadFile(response.headers.location, destPath, onProgress).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlink(destPath, () => {});
        reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }

      const total = parseInt(response.headers['content-length'] || '0', 10);
      let downloaded = 0;
      let lastTime = Date.now();
      let lastBytes = 0;

      response.on('data', (chunk) => {
        downloaded += chunk.length;
        if (!onProgress) return;

        const now = Date.now();
        const elapsed = (now - lastTime) / 1000;
        let speed = '';
        if (elapsed >= 0.4) {
          speed = `${formatBytes((downloaded - lastBytes) / elapsed)}/s`;
          lastTime = now;
          lastBytes = downloaded;
        }

        const percent = total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0;
        onProgress({ percent, downloaded, total, speed, phase: 'download' });
      });

      response.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
    });
    request.on('error', (err) => {
      file.close();
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

function expandZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    const ps = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`;
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve(destDir);
    });
  });
}

async function ensureWindowsUiaInstalled(options = {}) {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Windows UI Automation MCP is only available on Windows.' };
  }

  const existing = resolveWindowsUiaExecutable(options);
  if (existing) {
    return { success: true, exePath: existing, installed: false };
  }

  const installDir = getInstallDir(options.userDataPath);
  const zipPath = path.join(installDir, RELEASE_ASSET);

  try {
    fs.mkdirSync(installDir, { recursive: true });
    if (!fs.existsSync(zipPath)) {
      await downloadFile(RELEASE_URL, zipPath, options.onProgress);
    }
    if (options.onProgress) {
      options.onProgress({ percent: 100, downloaded: null, total: null, speed: '', phase: 'extract' });
    }
    await expandZip(zipPath, installDir);
    const exePath = resolveWindowsUiaExecutable({ userDataPath: options.userDataPath });
    if (!exePath) {
      return { success: false, error: 'Download completed but server executable was not found in the archive.' };
    }
    return { success: true, exePath, installed: true };
  } catch (err) {
    return { success: false, error: err.message || 'Install failed.' };
  }
}

module.exports = {
  MCP_WINDOWS_UIA_VERSION,
  getInstallDir,
  resolveWindowsUiaExecutable,
  ensureWindowsUiaInstalled
};
