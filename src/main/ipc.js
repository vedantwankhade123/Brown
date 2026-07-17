const { ipcMain, exec, app, shell } = require('electron');
const { exec: cpExec } = require('child_process');
const path = require('path');
const fs = require('fs');

const { verifyAndResolvePath, isCommandBlacklisted } = require('./security');
const { profileHardware, queryLocalOllamaModels, getModelRecommendation } = require('./hardware');
const { launchWindowsSandbox } = require('./sandbox');

// Active security mode state
let activeSecurityMode = 'Review'; // Default to Review (Human-in-the-Loop)
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

    const child = cpExec(command, { ...options, signal }, (error, stdout, stderr) => {
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
      
      let apps = [
        { name: 'Google Chrome', path: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' },
        { name: 'Visual Studio Code', path: path.join(process.env.USERPROFILE, 'AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe') },
        { name: 'Obsidian', path: path.join(process.env.USERPROFILE, 'AppData\\Local\\Obsidian\\Obsidian.exe') },
        { name: 'Git Bash', path: 'C:\\Program Files\\Git\\git-bash.exe' },
        { name: 'Notepad++', path: 'C:\\Program Files\\Notepad++\\notepad++.exe' },
        { name: 'Python', path: 'C:\\Windows\\py.exe' }
      ];
      
      const scanDir = (dir) => {
        if (!fs.existsSync(dir)) return [];
        let list = [];
        try {
          const items = fs.readdirSync(dir);
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              // Scan nested folder files
              try {
                const subItems = fs.readdirSync(fullPath);
                for (const sub of subItems) {
                  if (sub.endsWith('.lnk')) {
                    list.push({ name: sub.replace('.lnk', ''), path: path.join(fullPath, sub) });
                  }
                }
              } catch (subErr) {}
            } else if (item.endsWith('.lnk')) {
              list.push({ name: item.replace('.lnk', ''), path: fullPath });
            }
          }
        } catch (dirErr) {}
        return list;
      };
      
      const systemLnk = scanDir(startMenuPath);
      const userLnk = scanDir(userStartMenuPath);
      const allLnks = [...systemLnk, ...userLnk];
      
      // Merge by unique name
      const seen = new Set();
      let mergedApps = [];
      
      apps.forEach(appItem => {
        if (fs.existsSync(appItem.path)) {
          seen.add(appItem.name.toLowerCase());
          mergedApps.push(appItem);
        }
      });
      
      allLnks.forEach(lnk => {
        const lowerName = lnk.name.toLowerCase();
        if (!seen.has(lowerName) && !['startup', 'maintenance', 'system tools', 'administrative tools', 'desktop', 'documents', 'downloads'].includes(lowerName)) {
          seen.add(lowerName);
          mergedApps.push({ name: lnk.name, path: lnk.path });
        }
      });
      
      mergedApps.sort((a, b) => a.name.localeCompare(b.name));
      
      // Fetch icons for all resolved apps
      const results = [];
      for (const appItem of mergedApps) {
        try {
          let iconDataUrl = '';
          let resolvePath = appItem.path;
          
          if (resolvePath.endsWith('.lnk')) {
            try {
              const shortcut = shell.readShortcutLink(resolvePath);
              if (shortcut && shortcut.target && fs.existsSync(shortcut.target)) {
                resolvePath = shortcut.target;
              }
            } catch (shortcutErr) {}
          }
          
          if (fs.existsSync(resolvePath)) {
            const nativeImage = await app.getFileIcon(resolvePath, { size: 'normal' });
            iconDataUrl = nativeImage.toDataURL();
          }
          results.push({ name: appItem.name, icon: iconDataUrl });
        } catch (e) {
          results.push({ name: appItem.name, icon: '' });
        }
      }
      
      return { success: true, apps: results };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  // Trigger direct download of Ollama weights
  ipcMain.handle('download-model', async (event, modelName) => {
    try {
      const { exec } = require('child_process');
      return new Promise((resolve) => {
        exec(`ollama pull ${modelName}`, (error, stdout, stderr) => {
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

  // Install Ollama using winget package manager
  ipcMain.handle('install-ollama', async () => {
    try {
      return new Promise((resolve) => {
        const { exec } = require('child_process');
        exec('winget install Ollama', (error, stdout, stderr) => {
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
}

module.exports = {
  setupIpcHandlers,
  setMainWindow
};
