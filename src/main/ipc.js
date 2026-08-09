const { ipcMain, exec, app, shell, dialog } = require('electron');
const { exec: cpExec } = require('child_process');
const path = require('path');
const fs = require('fs');

const { verifyAndResolvePath, isPathBlacklisted, isCommandBlacklisted } = require('./security');
const { profileHardware, queryLocalOllamaModels, getModelRecommendation } = require('./hardware');
const { launchWindowsSandbox } = require('./sandbox');

// Active security mode state
let activeSecurityMode = 'Adaptive'; // Default to Adaptive Auto Mode for smooth computer task execution
let pendingPermissions = new Map(); // Store pending human-in-the-loop validation promises

// Keep reference to the main window
let mainWindow = null;

let cachedGeoLocation = null;
let cachedGeoLocationAt = 0;
const GEO_LOCATION_TTL_MS = 30 * 60 * 1000;

async function resolveGeoLocation() {
  if (cachedGeoLocation && Date.now() - cachedGeoLocationAt < GEO_LOCATION_TTL_MS) {
    return cachedGeoLocation;
  }

  // Multi-provider fallback cascade for maximum reliability
  const providers = [
    {
      url: 'https://ipwho.is/',
      parse: (d) => (d && d.success) ? {
        city: d.city || '',
        region: d.region || '',
        country: d.country || '',
        countryCode: d.country_code || '',
        timezone: d.timezone ? d.timezone.id : '',
        latitude: d.latitude,
        longitude: d.longitude
      } : null
    },
    {
      url: 'https://ipinfo.io/json',
      parse: (d) => (d && (d.city || d.country)) ? {
        city: d.city || '',
        region: d.region || '',
        country: d.country || '',
        countryCode: d.country || '',
        timezone: d.timezone || '',
        latitude: d.loc ? parseFloat(d.loc.split(',')[0]) : null,
        longitude: d.loc ? parseFloat(d.loc.split(',')[1]) : null
      } : null
    },
    {
      url: 'https://freeipapi.com/api/json',
      parse: (d) => (d && (d.cityName || d.countryName)) ? {
        city: d.cityName || '',
        region: d.regionName || '',
        country: d.countryName || '',
        countryCode: d.countryCode || '',
        timezone: d.timeZone || '',
        latitude: d.latitude,
        longitude: d.longitude
      } : null
    },
    {
      url: 'http://ip-api.com/json/?fields=status,country,countryCode,regionName,city,timezone,lat,lon',
      parse: (d) => (d && d.status === 'success') ? {
        city: d.city || '',
        region: d.regionName || '',
        country: d.country || '',
        countryCode: d.countryCode || '',
        timezone: d.timezone || '',
        latitude: d.lat,
        longitude: d.lon
      } : null
    }
  ];

  for (const provider of providers) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const res = await fetch(provider.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (res.ok) {
        const raw = await res.json();
        const parsed = provider.parse(raw);
        if (parsed) {
          cachedGeoLocation = parsed;
          cachedGeoLocationAt = Date.now();
          return cachedGeoLocation;
        }
      }
    } catch (e) {
      // Continue to next provider
    }
  }

  // OS System TimeZone & Locale Fallback
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const parts = tz ? tz.split('/') : [];
    const cityFallback = parts.length > 1 ? parts[parts.length - 1].replace(/_/g, ' ') : '';
    const regionFallback = parts.length > 0 ? parts[0].replace(/_/g, ' ') : '';

    cachedGeoLocation = {
      city: cityFallback,
      region: regionFallback,
      country: '',
      countryCode: '',
      timezone: tz,
      latitude: null,
      longitude: null
    };
    cachedGeoLocationAt = Date.now();
    return cachedGeoLocation;
  } catch (err) {
    // Ignore error
  }

  return cachedGeoLocation || null;
}

function buildDateTimeSnapshot(now = new Date()) {
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const weekStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = weekStart.getUTCDay() || 7;
  weekStart.setUTCDate(weekStart.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(weekStart.getUTCFullYear(), 0, 1));
  const isoWeek = Math.ceil((((weekStart - yearStart) / 86400000) + 1) / 7);

  return {
    iso: now.toISOString(),
    localDate: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    localTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
    utcTime: now.toUTCString(),
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
    month: now.toLocaleDateString('en-US', { month: 'long' }),
    year: now.getFullYear(),
    dayOfMonth: now.getDate(),
    dayOfYear,
    isoWeek,
    unixTimestamp: Math.floor(now.getTime() / 1000)
  };
}

function setMainWindow(win) {
  mainWindow = win;
}

/**
 * Helper to execute terminal commands with an AbortController timeout.
 * Capped at 300 seconds to prevent resource exhaustion.
 * 
 * @param {string} command - Command to run.
 * @param {object} options - Execution options.
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function runCommandWithTimeout(command, options = {}) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const { signal } = controller;
    
    const timeout = setTimeout(() => {
      controller.abort();
      reject(new Error('Execution Timeout: Terminal command execution exceeded the 300 second threshold.'));
    }, 300 * 1000); // 300 seconds

    const child = cpExec(command, { windowsHide: true, ...options, signal }, (error, stdout, stderr) => {
      clearTimeout(timeout);
      if (error) {
        if (error.name === 'AbortError') {
          reject(new Error('Execution Timeout: Capped at 300s.'));
        } else {
          reject(error);
        }
      } else {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      }
    });
  });
}

/**
 * Setup IPC handlers for the main Electron process.
 */
function setupIpcHandlers() {
  // Proactively pre-fetch device location in background as soon as main process starts
  resolveGeoLocation().catch(() => {});

  // System Hardware Profiling
  ipcMain.handle('profile-system', async () => {
    try {
      const stats = await profileHardware();
      const recommendation = getModelRecommendation(stats.totalRamGB);
      const installedModels = await queryLocalOllamaModels();
      
      return {
        success: true,
        stats,
        recommendation,
        installedModels
      };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // System Environment Scanner — provides the AI agent full context about the user's computer
  ipcMain.handle('system-environment', async () => {
    const os = require('os');
    const now = new Date();
    const info = {
      platform: os.platform(),
      osVersion: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      homeDir: os.homedir(),
      tempDir: os.tmpdir(),
      locale: Intl.DateTimeFormat().resolvedOptions().locale || 'en-US',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local',
      utcOffsetMinutes: -now.getTimezoneOffset(),
      dateTime: buildDateTimeSnapshot(now),
      totalMemoryGB: (os.totalmem() / (1024 ** 3)).toFixed(1),
      freeMemoryGB: (os.freemem() / (1024 ** 3)).toFixed(1),
      cpuCores: os.cpus().length,
      cpuModel: os.cpus()[0] ? os.cpus()[0].model : 'Unknown',
      drives: [],
      keyDirectories: {},
      region: {},
      geoLocation: null
    };

    try {
      const regionRaw = await new Promise((resolve, reject) => {
        cpExec(
          'powershell -NoProfile -Command "[System.Globalization.RegionInfo]::CurrentRegion | ConvertTo-Json -Compress"',
          { windowsHide: true },
          (err, stdout) => {
            if (err) reject(err);
            else resolve(stdout);
          }
        );
      });
      const region = JSON.parse(String(regionRaw || '').trim());
      info.region = {
        country: region.EnglishName || region.NativeName || '',
        countryCode: region.TwoLetterISORegionName || region.Name || '',
        currency: region.ISOCurrencySymbol || ''
      };
    } catch (e) {
      info.region = { country: '', countryCode: '', currency: '' };
    }

    info.geoLocation = await resolveGeoLocation();

    // Ensure country from Windows Region info if IP Geo is missing country
    if (info.geoLocation && info.region) {
      if (!info.geoLocation.country && info.region.country) {
        info.geoLocation.country = info.region.country;
        info.geoLocation.countryCode = info.region.countryCode;
      }
    }

    // Discover drives (Windows)
    try {
      const drivesRaw = await new Promise((resolve, reject) => {
        cpExec('wmic logicaldisk get name,size,freespace,description /format:csv', { windowsHide: true }, (err, stdout) => {
          if (err) reject(err);
          else resolve(stdout);
        });
      });
      const lines = drivesRaw.split('\n').filter(l => l.trim() && l.includes(','));
      for (const line of lines.slice(1)) {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 4 && parts[3]) {
          info.drives.push({
            letter: parts[3],
            description: parts[1] || 'Local Disk',
            totalGB: parts[4] ? (parseInt(parts[4]) / (1024 ** 3)).toFixed(1) : 'N/A',
            freeGB: parts[2] ? (parseInt(parts[2]) / (1024 ** 3)).toFixed(1) : 'N/A'
          });
        }
      }
    } catch (e) {
      // Fallback: just report C:
      info.drives.push({ letter: 'C:', description: 'Local Disk', totalGB: 'N/A', freeGB: 'N/A' });
    }

    // Map key directories
    const userHome = os.homedir();
    info.keyDirectories = {
      desktop: path.join(userHome, 'Desktop'),
      documents: path.join(userHome, 'Documents'),
      downloads: path.join(userHome, 'Downloads'),
      pictures: path.join(userHome, 'Pictures'),
      videos: path.join(userHome, 'Videos'),
      music: path.join(userHome, 'Music'),
      appData: process.env.APPDATA || path.join(userHome, 'AppData', 'Roaming'),
      programFiles: process.env['ProgramFiles'] || 'C:\\Program Files',
      programFilesX86: process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    };

    return info;
  });

  // Settings & Security Mode management
  ipcMain.handle('get-security-mode', () => activeSecurityMode);
  ipcMain.handle('set-security-mode', (event, mode) => {
    if (['Review', 'Containment', 'Adaptive', 'Trusted'].includes(mode)) {
      activeSecurityMode = mode;
      return { success: true, mode: activeSecurityMode };
    }
    return { success: false, error: 'Invalid security mode' };
  });

  // Sandbox Launcher Hook
  ipcMain.handle('launch-sandbox', async (event, hostPath) => {
    try {
      const appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
      const localAgentTemp = path.join(appDataPath, 'LocalAgent', 'temp');
      
      const safeHostPath = verifyAndResolvePath(hostPath, true);
      const result = await launchWindowsSandbox(safeHostPath, localAgentTemp);
      return { success: true, message: result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get Installed Apps list (scans Windows registry or program shortcuts)
  ipcMain.handle('get-installed-apps', async () => {
    try {
      const startMenuPath = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs';
      const userStartMenuPath = path.join(
        process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming'),
        'Microsoft\\Windows\\Start Menu\\Programs'
      );
      
      let defaultApps = [
        { name: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
        { name: 'Visual Studio Code', path: path.join(process.env.USERPROFILE, 'AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe') },
        { name: 'Obsidian', path: path.join(process.env.USERPROFILE, 'AppData\\Local\\Obsidian\\Obsidian.exe') },
        { name: 'Git Bash', path: 'C:\\Program Files\\Git\\git-bash.exe' },
        { name: 'Notepad++', path: 'C:\\Program Files\\Notepad++\\notepad++.exe' },
        { name: 'Command Prompt', path: 'C:\\Windows\\System32\\cmd.exe' },
        { name: 'PowerShell', path: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' },
        { name: 'Python', path: 'C:\\Windows\\py.exe' }
      ];
      
      const scanDir = (dir) => {
        if (!fs.existsSync(dir)) return [];
        let list = [];
        try {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            try {
              const stat = fs.statSync(fullPath);
              if (stat.isDirectory()) {
                try {
                  const subItems = fs.readdirSync(fullPath);
                  for (const sub of subItems) {
                    if (sub.toLowerCase().endsWith('.lnk')) {
                      list.push({ name: sub.replace(/\.lnk$/i, ''), path: path.join(fullPath, sub) });
                    }
                  }
                } catch (subErr) {}
              } else if (item.toLowerCase().endsWith('.lnk')) {
                list.push({ name: item.replace(/\.lnk$/i, ''), path: fullPath });
              }
            } catch (statErr) {}
          }
        } catch (dirErr) {}
        return list;
      };
      
      const systemLnk = scanDir(startMenuPath);
      const userLnk = scanDir(userStartMenuPath);
      const allLnks = [...systemLnk, ...userLnk];
      
      const seen = new Set();
      let mergedApps = [];
      
      defaultApps.forEach(appItem => {
        if (fs.existsSync(appItem.path)) {
          seen.add(appItem.name.toLowerCase());
          mergedApps.push(appItem);
        }
      });
      
      allLnks.forEach(lnk => {
        const lowerName = lnk.name.toLowerCase();
        if (!seen.has(lowerName) && !['startup', 'maintenance', 'system tools', 'administrative tools', 'desktop', 'documents', 'downloads', 'uninstall'].some(k => lowerName.includes(k))) {
          seen.add(lowerName);
          mergedApps.push({ name: lnk.name, path: lnk.path });
        }
      });
      
      mergedApps.sort((a, b) => a.name.localeCompare(b.name));
      
      // Parallel icon loading for ALL apps to retrieve real native application logos
      const results = await Promise.all(
        mergedApps.map(async (appItem) => {
          let iconDataUrl = '';
          try {
            let targetPath = appItem.path;
            
            // Resolve shortcut link target if ends with .lnk
            if (targetPath.toLowerCase().endsWith('.lnk')) {
              try {
                const shortcut = shell.readShortcutLink(targetPath);
                if (shortcut && shortcut.target && fs.existsSync(shortcut.target)) {
                  targetPath = shortcut.target;
                }
              } catch (shortcutErr) {}
            }
            
            // Forcefully extract real native brand icon PNG data URL
            if (fs.existsSync(targetPath)) {
              const nativeImg = await app.getFileIcon(targetPath, { size: 'normal' });
              if (nativeImg && !nativeImg.isEmpty()) {
                iconDataUrl = nativeImg.toDataURL();
              }
            }
            
            // Fallback: If targetPath image was empty, try extracting icon from the .lnk shortcut file directly
            if (!iconDataUrl && fs.existsSync(appItem.path)) {
              const lnkImg = await app.getFileIcon(appItem.path, { size: 'normal' });
              if (lnkImg && !lnkImg.isEmpty()) {
                iconDataUrl = lnkImg.toDataURL();
              }
            }
          } catch (e) {
            console.error(`Failed to load native icon for ${appItem.name}:`, e);
          }
          return { name: appItem.name, icon: iconDataUrl };
        })
      );
      
      return { success: true, apps: results };
    } catch (err) {
      return { success: false, error: err.message, apps: [] };
    }
  });

  // Active pull process registry
  const activePullProcesses = new Map();

  // Trigger direct download of Ollama weights with real-time progress events
  ipcMain.handle('download-model', async (event, modelName) => {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const child = spawn('ollama', ['pull', modelName], { windowsHide: true });
      
      activePullProcesses.set(modelName.toLowerCase(), child);
      let lastPercent = 0;
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        const text = data.toString();
        parseAndSendProgress(text);
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        parseAndSendProgress(text);
      });

      function parseAndSendProgress(text) {
        const lines = text.split(/[\r\n]+/);
        for (const line of lines) {
          if (!line.trim()) continue;
          if (line.includes('pulling')) {
            const percentMatch = line.match(/([0-9]+)%/);
            const bytesMatch = line.match(/([0-9.]+\s*[KMGT]B)\/([0-9.]+\s*[KMGT]B)/i);
            const speedMatch = line.match(/([0-9.]+\s*[KMGT]B\/s)/i);
            
            if (percentMatch) {
              lastPercent = parseInt(percentMatch[1]);
            }
            
            event.sender.send('download-progress', {
              modelName,
              percent: percentMatch ? parseInt(percentMatch[1]) : lastPercent,
              downloaded: bytesMatch ? bytesMatch[1].trim() : '',
              total: bytesMatch ? bytesMatch[2].trim() : '',
              speed: speedMatch ? speedMatch[1].trim() : ''
            });
          } else if (line.includes('Error')) {
            errorOutput += line + ' ';
          }
        }
      }

      child.on('close', (code) => {
        activePullProcesses.delete(modelName.toLowerCase());
        if (code === 0) {
          resolve({ success: true });
        } else if (child.killed) {
          resolve({ success: false, error: 'Download cancelled by user', cancelled: true });
        } else {
          resolve({ success: false, error: errorOutput.trim() || `Process exited with code ${code}` });
        }
      });
    });
  });

  // Cancel an ongoing model weight download
  ipcMain.handle('cancel-download-model', async (event, modelName) => {
    const key = (modelName || '').toLowerCase();
    const child = activePullProcesses.get(key) || Array.from(activePullProcesses.values())[0];
    if (child) {
      try {
        child.kill('SIGKILL');
        const { exec } = require('child_process');
        exec(`taskkill /F /PID ${child.pid} /T`, { windowsHide: true }, () => {});
      } catch (e) {}
      activePullProcesses.delete(key);
      return { success: true, cancelled: true };
    }
    return { success: false, error: 'No active pull process found' };
  });

  // Delete local model weights
  ipcMain.handle('delete-model', async (event, modelName) => {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec(`ollama rm ${modelName}`, { windowsHide: true }, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: stderr || error.message });
          } else {
            resolve({ success: true });
          }
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Check if Ollama is installed on the user's computer
  ipcMain.handle('check-ollama-installed', async () => {
    try {
      // 1. Check default installation paths on Windows first (fastest, no CLI spawn)
      const userLocal = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
      const defaultPaths = [
        path.join(userLocal, 'Programs', 'Ollama', 'ollama app.exe'),
        path.join(userLocal, 'Programs', 'Ollama', 'ollama.exe'),
        'C:\\Program Files\\Ollama\\ollama.exe',
        'C:\\Program Files (x86)\\Ollama\\ollama.exe'
      ];

      for (const p of defaultPaths) {
        if (fs.existsSync(p)) {
          return { installed: true, source: 'filepath', path: p };
        }
      }

      // 2. Fallback check if in PATH by executing a silent version check
      const checkPath = () => {
        return new Promise((resolve) => {
          const { exec } = require('child_process');
          exec('ollama --version', { windowsHide: true }, (error) => {
            resolve(!error);
          });
        });
      };

      const inPath = await checkPath();
      if (inPath) {
        return { installed: true, source: 'path' };
      }

      return { installed: false };
    } catch (err) {
      return { installed: false, error: err.message };
    }
  });

  // Start the Ollama background server (headless mode with 0 terminal or GUI windows)
  ipcMain.handle('start-ollama-service', async (event, exePath) => {
    try {
      const { exec } = require('child_process');
      const userLocal = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Local');
      const ollamaCliExe = path.join(userLocal, 'Programs', 'Ollama', 'ollama.exe');
      
      let targetExe = 'ollama';
      if (fs.existsSync(ollamaCliExe)) {
        targetExe = `"${ollamaCliExe}"`;
      } else if (exePath && fs.existsSync(exePath) && !exePath.toLowerCase().endsWith('ollama app.exe')) {
        targetExe = `"${exePath}"`;
      }

      // Launch headless serve process using PowerShell WindowStyle Hidden for 0 terminal/GUI windows
      const psCmd = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath ${targetExe} -ArgumentList 'serve' -WindowStyle Hidden"`;

      return new Promise((resolve) => {
        exec(psCmd, { windowsHide: true }, (error) => {
          if (error) {
            // Fallback to direct background exec
            exec(`${targetExe} serve`, { windowsHide: true }, () => {});
          }
          resolve({ success: true });
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Persistent Gemini API Key Storage across app restarts
  ipcMain.handle('save-gemini-key', async (event, key) => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      let config = {};
      if (fs.existsSync(configPath)) {
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf8')); } catch (e) {}
      }
      config.geminiApiKey = key || '';
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('load-gemini-key', async () => {
    try {
      const configPath = path.join(app.getPath('userData'), 'ultron-config.json');
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        return config.geminiApiKey || '';
      }
      return '';
    } catch (err) {
      return '';
    }
  });

  // Install Ollama using winget package manager
  ipcMain.handle('install-ollama', async () => {
    try {
      return new Promise((resolve) => {
        const { exec } = require('child_process');
        exec('winget install Ollama --accept-package-agreements --accept-source-agreements', { windowsHide: true }, (error, stdout, stderr) => {
          if (error) {
            resolve({ success: false, error: stderr || error.message });
          } else {
            resolve({ success: true, stdout });
          }
        });
      });
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Select local directory using native folder picker
  ipcMain.handle('select-directory', async () => {
    if (!mainWindow) return { canceled: true };
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result;
  });

  // Update persistent agent memory data directory
  ipcMain.handle('update-data-dir', async (event, customPath) => {
    try {
      const appDataPath = process.env.APPDATA || path.join(process.env.USERPROFILE, 'AppData', 'Roaming');
      const defaultDir = path.join(appDataPath, 'LocalAgent');
      const configFile = path.join(defaultDir, 'config.json');
      
      const oldPath = process.env.ULTRON_DATA_DIR;
      
      if (!fs.existsSync(defaultDir)) {
        fs.mkdirSync(defaultDir, { recursive: true });
      }
      
      // Write custom path configuration
      fs.writeFileSync(configFile, JSON.stringify({ customDataDir: customPath }, null, 2), 'utf8');
      
      // Update environment variable
      process.env.ULTRON_DATA_DIR = customPath;
      
      // Create path directories if needed
      const tempDir = path.join(customPath, 'temp');
      if (!fs.existsSync(customPath)) {
        fs.mkdirSync(customPath, { recursive: true });
      }
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Migrate conversations.json from old path to new path if it exists
      if (oldPath && oldPath !== customPath) {
        const oldFile = path.join(oldPath, 'conversations.json');
        const newFile = path.join(customPath, 'conversations.json');
        if (fs.existsSync(oldFile)) {
          fs.copyFileSync(oldFile, newFile);
        }
      }
      
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Get default app memory data directory location
  ipcMain.handle('get-default-data-dir', () => {
    return path.join(app.getPath('userData'), 'memory');
  });

  // Save conversation history to local data directory path
  ipcMain.handle('save-conversations', async (event, dataStr) => {
    try {
      const dataDir = process.env.ULTRON_DATA_DIR;
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const filePath = path.join(dataDir, 'conversations.json');
      fs.writeFileSync(filePath, dataStr, 'utf8');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Load conversation history from local data directory path
  ipcMain.handle('load-conversations', async () => {
    try {
      const dataDir = process.env.ULTRON_DATA_DIR;
      const filePath = path.join(dataDir, 'conversations.json');
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf8');
        return { success: true, data };
      }
      return { success: true, data: '{}' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // User input response from the Review Mode floating overlay
  ipcMain.on('permission-response', (event, { id, approved, modifiedCommand }) => {
    const pending = pendingPermissions.get(id);
    if (pending) {
      pendingPermissions.delete(id);
      pending.resolve({ approved, modifiedCommand });
    }
  });

  // Main task execution entry point
  ipcMain.handle('execute-action', async (event, { command, targetPath, isWrite }) => {
    try {
      // 1. Hard-coded Blacklist check
      if (isCommandBlacklisted(command)) {
        return { success: false, error: 'Security Block: Direct registry changes and environment path manipulations are forbidden.' };
      }

      let safePath = targetPath;
      if (targetPath) {
        // Will throw an error if path is blacklisted
        safePath = verifyAndResolvePath(targetPath, isWrite);
      }

      // 2. Security Mode Routing
      const needsReview = 
        activeSecurityMode === 'Review' || 
        (activeSecurityMode === 'Adaptive' && (isWrite || isCommandBlacklisted(command) || command.includes('rm ') || command.includes('del ')));

      if (needsReview) {
        // Trigger Human-in-the-Loop Overlay Pause State
        const id = `perm-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        const userDecision = await new Promise((resolve) => {
          pendingPermissions.set(id, { resolve });
          if (mainWindow) {
            mainWindow.webContents.send('request-permission', {
              id,
              command,
              targetPath: safePath || 'None'
            });
          } else {
            resolve({ approved: false });
          }
        });

        if (!userDecision.approved) {
          return { success: false, error: 'Execution Rejected: Permission denied by user.' };
        }

        if (userDecision.modifiedCommand) {
          command = userDecision.modifiedCommand;
        }
      }

      // 3. Containment Sandbox Routing
      if (activeSecurityMode === 'Containment') {
        // Redirection to sandboxed path
        const sandboxDir = 'C:\\local_agent_sandbox';
        if (!fs.existsSync(sandboxDir)) {
          fs.mkdirSync(sandboxDir, { recursive: true });
        }
        
        // Execute command mapped to local sandbox environment
        const result = await runCommandWithTimeout(command, { cwd: sandboxDir });
        return { success: true, stdout: result.stdout, stderr: result.stderr, sandboxed: true };
      }

      // 4. Native standard execution
      const runOpts = safePath && fs.existsSync(safePath) ? { cwd: safePath } : {};
      const result = await runCommandWithTimeout(command, runOpts);
      return { success: true, stdout: result.stdout, stderr: result.stderr };

    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Read local file contents
  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (isPathBlacklisted(resolvedPath)) {
        return { success: false, error: `Access Denied: Path "${resolvedPath}" is restricted by safety policy.` };
      }
      if (!fs.existsSync(resolvedPath)) {
        return { success: false, error: `File not found: ${resolvedPath}` };
      }
      const content = fs.readFileSync(resolvedPath, 'utf8');
      return { success: true, content, filePath: resolvedPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Write content to a local file
  ipcMain.handle('write-file', async (event, { filePath, content }) => {
    try {
      const resolvedPath = path.resolve(filePath);
      if (isPathBlacklisted(resolvedPath)) {
        return { success: false, error: `Access Denied: Writing to "${resolvedPath}" is restricted by safety policy.` };
      }
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(resolvedPath, content, 'utf8');
      return { success: true, filePath: resolvedPath };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // List directory contents
  ipcMain.handle('list-dir', async (event, dirPath) => {
    try {
      const targetDir = dirPath ? path.resolve(dirPath) : process.cwd();
      if (isPathBlacklisted(targetDir)) {
        return { success: false, error: `Access Denied: Path "${targetDir}" is restricted by safety policy.` };
      }
      if (!fs.existsSync(targetDir)) {
        return { success: false, error: `Directory not found: ${targetDir}` };
      }
      const items = fs.readdirSync(targetDir, { withFileTypes: true }).map(item => ({
        name: item.name,
        isDirectory: item.isDirectory(),
        isFile: item.isFile()
      }));
      return { success: true, dirPath: targetDir, items };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Open URL in default system browser
  ipcMain.handle('open-external', async (event, url) => {
    try {
      if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        if (!host || host === 'localhost' || host.endsWith('.local') || host.includes('duckduckgo.com')) {
          return { success: false, error: 'Blocked URL host.' };
        }
        await shell.openExternal(url);
        return { success: true };
      }
      return { success: false, error: 'Invalid URL scheme.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Decode HTML entities in web search snippets
  function decodeHTMLEntities(text) {
    if (!text) return '';
    return text
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/');
  }

  function stripTags(html) {
    return decodeHTMLEntities((html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
  }

  function buildWikipediaUrl(title) {
    if (!title) return '';
    const slug = String(title).trim().replace(/ /g, '_');
    const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(slug).replace(/%20/g, '_')}`;
    return isValidResultUrl(wikiUrl) ? wikiUrl : '';
  }

  function normalizeDdgUrl(rawUrl) {
    if (!rawUrl) return '';
    const decoded = decodeHTMLEntities(String(rawUrl).trim());
    try {
      const url = new URL(decoded, 'https://duckduckgo.com');
      const uddg = url.searchParams.get('uddg');
      if (uddg) {
        const target = decodeURIComponent(uddg);
        return isValidResultUrl(target) ? target : '';
      }
      if (/duckduckgo\.com$/i.test(url.hostname) || url.hostname.endsWith('.duckduckgo.com')) {
        return '';
      }
      return isValidResultUrl(url.href) ? url.href : '';
    } catch (e) {
      return '';
    }
  }

  function getHostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '');
    } catch (e) {
      return 'web';
    }
  }

  function normalizeAbsoluteUrl(rawUrl, baseUrl = '') {
    if (!rawUrl) return '';
    const decoded = decodeHTMLEntities(String(rawUrl).trim());
    if (/^(javascript|data|mailto|tel):/i.test(decoded)) return '';
    try {
      return new URL(decoded, baseUrl || undefined).href;
    } catch (e) {
      return '';
    }
  }

  function isValidResultUrl(url) {
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) return false;

      const host = parsed.hostname.toLowerCase();
      if (!host || !host.includes('.') || host === 'localhost' || host.endsWith('.local')) return false;
      if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return false;

      const blockedHosts = new Set([
        'duckduckgo.com',
        'www.duckduckgo.com',
        'google.com',
        'www.google.com',
        'bing.com',
        'www.bing.com',
        'search.yahoo.com',
        'search.brave.com',
        'example.com',
        'www.example.com',
        'example.org',
        'www.example.org',
        'example.net',
        'www.example.net',
        'localhost',
        '127.0.0.1'
      ]);
      if (blockedHosts.has(host)) return false;
      if (host.includes('duckduckgo.com')) return false;

      if ((host === 'google.com' || host === 'www.google.com') && parsed.pathname === '/search') return false;
      if ((host === 'bing.com' || host === 'www.bing.com') && parsed.pathname === '/search') return false;

      if (parsed.pathname === '/' && parsed.searchParams.has('q')) return false;

      return true;
    } catch (e) {
      return false;
    }
  }

  async function verifyUrl(url) {
    if (!isValidResultUrl(url)) return { ok: false, status: 0, finalUrl: '' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    };

    try {
      let res = await fetch(url, { method: 'HEAD', headers, redirect: 'follow', signal: controller.signal });
      if (!res.ok || [401, 403, 405, 404, 501].includes(res.status)) {
        res = await fetch(url, {
          method: 'GET',
          headers: { ...headers, Range: 'bytes=0-4096' },
          redirect: 'follow',
          signal: controller.signal
        });
      }

      clearTimeout(timeout);
      const finalUrl = res.url || url;
      if (!isValidResultUrl(finalUrl)) {
        return { ok: false, status: res.status, finalUrl: '' };
      }

      const ok = res.status >= 200 && res.status < 400;
      return {
        ok,
        status: res.status,
        finalUrl
      };
    } catch (e) {
      clearTimeout(timeout);
      return { ok: false, status: 0, finalUrl: '' };
    }
  }

  function isShoppingQuery(query) {
    return /\b(best|top|buy|price|under|cheap|deal|deals|sale|shop|shopping|product|products|shoes|sneakers|phone|laptop|headphones|earbuds|watch|camera|bag)\b/i.test(query || '');
  }

  function extractPrice(text) {
    const match = (text || '').match(/(?:₹|Rs\.?|INR|\$|USD|€|£)\s?[0-9][0-9,]*(?:\.[0-9]{1,2})?/i);
    return match ? match[0] : '';
  }

  function uniqueResults(results) {
    const seen = new Set();
    return results.filter((item) => {
      if (!item || !item.url) return false;
      if (!isValidResultUrl(item.url)) return false;
      const key = item.url.replace(/[#?].*$/, '').toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async function fetchPagePreview(url) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) return null;
      const html = await res.text();
      const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
        || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)?.[1];
      const image = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1] || '';
      return {
        title: stripTags(title || ''),
        description: stripTags(description || ''),
        image: normalizeAbsoluteUrl(image, url)
      };
    } catch (e) {
      return null;
    }
  }

  // Robust multi-source Web Search handler (DuckDuckGo API + Wiki API + DDG Organic POST)
  ipcMain.handle('search-web', async (event, query) => {
    let cleanQuery = query ? query.replace(/["']/g, '').trim() : '';
    // Strip common prompt prefixes
    cleanQuery = cleanQuery
      .replace(/\bwbe\b/gi, 'web')
      .replace(/\bspiderman\b/gi, 'Spider-Man')
      .replace(/^(please\s+)?(can\s+you\s+|could\s+you\s+)?(search\s+(web\s+for|online\s+for|for)?|look\s+up|google|find\s+out|find)\s+/i, '')
      .replace(/^(tell\s+me|show\s+me|give\s+me)\s+(about\s+)?/i, '')
      .trim();
    if (!cleanQuery) {
      return { success: false, query: '', results: [], products: [], answerContext: '', needsClarification: true, clarification: 'Please provide a valid web search query.' };
    }

    const resultBlocks = [];

    // 1. Query DuckDuckGo Instant Answer JSON API
    try {
      const ddgApiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(ddgApiUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.AbstractText && data.AbstractURL && isValidResultUrl(data.AbstractURL)) {
          resultBlocks.push({
            title: data.Heading || cleanQuery,
            url: data.AbstractURL,
            snippet: decodeHTMLEntities(data.AbstractText),
            source: getHostname(data.AbstractURL)
          });
        } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
          data.RelatedTopics
            .flatMap(t => t.Topics || [t])
            .filter(t => t.Text && t.FirstURL && isValidResultUrl(t.FirstURL))
            .slice(0, 4)
            .forEach((topic) => {
              resultBlocks.push({
                title: topic.Text.split(' - ')[0] || cleanQuery,
                url: topic.FirstURL,
                snippet: decodeHTMLEntities(topic.Text),
                source: getHostname(topic.FirstURL)
              });
            });
        }
      }
    } catch (e) {
      console.error('DDG API error:', e.message);
    }

    // 2. Query Wikipedia API for facts/overview
    try {
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(cleanQuery)}&format=json&origin=*`;
      const wikiRes = await fetch(wikiUrl);
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const pages = wikiData.query ? wikiData.query.pages : null;
        if (pages) {
          const pageId = Object.keys(pages)[0];
          if (pageId !== '-1' && pages[pageId].extract) {
            const wikiText = pages[pageId].extract.substring(0, 450);
            const wikiUrl = buildWikipediaUrl(pages[pageId].title);
            if (wikiUrl) {
              resultBlocks.push({
                title: `Wikipedia: ${pages[pageId].title}`,
                url: wikiUrl,
                snippet: `${decodeHTMLEntities(wikiText)}...`,
                source: 'wikipedia.org'
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Wikipedia API error:', e.message);
    }

    // 3. Fallback / Organic: DuckDuckGo HTML Search POST
    if (resultBlocks.length < 6) {
      try {
        const ddgHtmlUrl = `https://html.duckduckgo.com/html/`;
        const res = await fetch(ddgHtmlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          body: `q=${encodeURIComponent(cleanQuery)}`
        });
        if (res.ok) {
          const html = await res.text();
          const beforeOrganicCount = resultBlocks.length;
          const matches = html.matchAll(/<div class="result[\s\S]*?<\/div>\s*<\/div>/g);
          for (const match of matches) {
            const block = match[0];
            const titleMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
            const snippetMatch = block.match(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i) || block.match(/<div class="result__snippet"[^>]*>([\s\S]*?)<\/div>/i);
            if (!titleMatch) continue;
            const url = normalizeDdgUrl(titleMatch[1]);
            const title = stripTags(titleMatch[2]);
            const snippetText = stripTags(snippetMatch ? snippetMatch[1] : '');
            // Filter out junk/SEO aggregator boilerplates
            if (title && url && isValidResultUrl(url) && resultBlocks.length < 10 && !snippetText.toLowerCase().includes('stopwatch timer countdown') && !snippetText.toLowerCase().includes('calculator')) {
              resultBlocks.push({
                title,
                url,
                snippet: snippetText,
                source: getHostname(url)
              });
            }
          }
          if (resultBlocks.length === beforeOrganicCount) {
            const titleMatches = [...html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
            const snippetMatches = [...html.matchAll(/<(?:a|div)[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi)];
            titleMatches.slice(0, 8).forEach((titleMatch, index) => {
              const url = normalizeDdgUrl(titleMatch[1]);
              const title = stripTags(titleMatch[2]);
              const snippetText = stripTags(snippetMatches[index] ? snippetMatches[index][1] : '');
              if (title && url && isValidResultUrl(url) && resultBlocks.length < 10) {
                resultBlocks.push({
                  title,
                  url,
                  snippet: snippetText,
                  source: getHostname(url)
                });
              }
            });
          }
        }
      } catch (e) {
        console.error('DDG HTML error:', e.message);
      }
    }

    const candidateResults = uniqueResults(resultBlocks).slice(0, 10);
    const verifiedResults = [];
    const verifications = await Promise.all(candidateResults.map(item => verifyUrl(item.url)));
    candidateResults.forEach((item, index) => {
      const verification = verifications[index];
      if (!verification.ok) return;
      verifiedResults.push({
        ...item,
        url: verification.finalUrl || item.url,
        source: getHostname(verification.finalUrl || item.url),
        status: verification.status,
        verified: true
      });
    });

    const results = verifiedResults.slice(0, 8);

    const previewTargets = results.slice(0, 4);
    const previews = await Promise.all(previewTargets.map(item => fetchPagePreview(item.url)));
    previews.forEach((preview, index) => {
      if (!preview) return;
      if (preview.title && preview.title.length > results[index].title.length) results[index].title = preview.title;
      if (preview.description && preview.description.length > results[index].snippet.length) results[index].snippet = preview.description;
      if (preview.image) results[index].image = preview.image;
    });

    const shopping = isShoppingQuery(cleanQuery);
    const products = shopping
      ? results
          .filter(item => item.title && item.url)
          .slice(0, 6)
          .map((item) => ({
            title: item.title,
            url: item.url,
            source: item.source,
            snippet: item.snippet,
            price: extractPrice(`${item.title} ${item.snippet}`),
            image: item.image || ''
          }))
      : [];

    const answerContext = results.map((item, index) => {
      return `[${index + 1}] ${item.title}\nURL: ${item.url}\nSource: ${item.source}\nSnippet: ${item.snippet || 'No snippet available.'}`;
    }).join('\n\n');

    if (results.length === 0) {
      return {
        success: true,
        query: cleanQuery,
        results: [],
        products: [],
        answerContext: '',
        needsClarification: true,
        clarification: `I could not find reliable web results for "${cleanQuery}". Try adding a brand, location, budget, or date range.`
      };
    }

    return {
      success: true,
      query: cleanQuery,
      results,
      products,
      answerContext,
      needsClarification: results.length < 2,
      clarification: results.length < 2 ? `I only found one useful result for "${cleanQuery}". A little more detail would help me search better.` : ''
    };
  });
}

module.exports = {
  setupIpcHandlers,
  setMainWindow
};
