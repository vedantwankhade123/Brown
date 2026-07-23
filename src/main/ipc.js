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
    const info = {
      platform: os.platform(),
      osVersion: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      username: os.userInfo().username,
      homeDir: os.homedir(),
      tempDir: os.tmpdir(),
      totalMemoryGB: (os.totalmem() / (1024 ** 3)).toFixed(1),
      freeMemoryGB: (os.freemem() / (1024 ** 3)).toFixed(1),
      cpuCores: os.cpus().length,
      cpuModel: os.cpus()[0] ? os.cpus()[0].model : 'Unknown',
      drives: [],
      keyDirectories: {}
    };

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

  // Trigger direct download of Ollama weights with real-time progress events
  ipcMain.handle('download-model', async (event, modelName) => {
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const child = spawn('ollama', ['pull', modelName], { windowsHide: true });
      
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
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: errorOutput.trim() || `Process exited with code ${code}` });
        }
      });
    });
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
    return path.join(app.getAppPath(), 'memory');
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

  // Robust multi-source Web Search handler (DuckDuckGo API + Wiki API + DDG Organic POST)
  ipcMain.handle('search-web', async (event, query) => {
    let cleanQuery = query ? query.replace(/["']/g, '').trim() : '';
    // Strip common prompt prefixes
    cleanQuery = cleanQuery.replace(/^(search\s+(web\s+for|online\s+for|for)?|look\s+up|google|find\s+out|find)\s+/i, '').trim();
    if (!cleanQuery) return "Please provide a valid web search query.";

    const results = [];

    // 1. Query DuckDuckGo Instant Answer JSON API
    try {
      const ddgApiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
      const res = await fetch(ddgApiUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.AbstractText) {
          results.push(`**${data.Heading || cleanQuery}**\n${decodeHTMLEntities(data.AbstractText)}\nSource: ${data.AbstractURL || 'DuckDuckGo Knowledge Graph'}`);
        } else if (data.RelatedTopics && data.RelatedTopics.length > 0) {
          const snippets = data.RelatedTopics.slice(0, 3).filter(t => t.Text).map(t => `- ${decodeHTMLEntities(t.Text)}`);
          if (snippets.length > 0) {
            results.push(`**Overview for "${cleanQuery}":**\n${snippets.join('\n')}`);
          }
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
            const wikiText = pages[pageId].extract.substring(0, 400);
            results.push(`**Wikipedia (${pages[pageId].title}):**\n${decodeHTMLEntities(wikiText)}...\n[Read more on Wikipedia](https://en.wikipedia.org/wiki/${encodeURIComponent(pages[pageId].title)})`);
          }
        }
      }
    } catch (e) {
      console.error('Wikipedia API error:', e.message);
    }

    // 3. Fallback / Organic: DuckDuckGo HTML Search POST
    if (results.length < 2) {
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
          const matches = html.matchAll(/<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g);
          const snippets = [];
          for (const match of matches) {
            let snippetText = decodeHTMLEntities(match[1].replace(/<[^>]*>/g, '').trim());
            // Filter out junk/SEO aggregator boilerplates
            if (snippetText && snippets.length < 4 && !snippetText.toLowerCase().includes('stopwatch timer countdown') && !snippetText.toLowerCase().includes('calculator')) {
              snippets.push(`- ${snippetText}`);
            }
          }
          if (snippets.length > 0) {
            results.push(`**Web Search Snippets:**\n${snippets.join('\n\n')}`);
          }
        }
      } catch (e) {
        console.error('DDG HTML error:', e.message);
      }
    }

    if (results.length === 0) {
      return `No web results found for "${cleanQuery}". Try rephrasing your search query.`;
    }

    return results.join('\n\n---\n\n');
  });
}

module.exports = {
  setupIpcHandlers,
  setMainWindow
};
