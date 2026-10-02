const path = require('path');
const fs = require('fs');

// Blacklisted directories on Windows (case-insensitive checks)
const BLACKLIST_PATTERNS = [
  /^c:\\windows\\/i,
  /^c:\\program files\\/i,
  /^c:\\program files \(x86\)\\/i,
  /^c:\\users\\[^\\]+\\appdata\\local\\microsoft\\windows\\/i
];

// Registry and system environment indicators
const REGISTRY_WRITE_COMMANDS = [/reg\s+add/i, /reg\s+delete/i, /regedit/i];
const ENV_MUTATION_COMMANDS = [/setx/i, /env/i];

// Commands that must reach the human even when the agent claims they are read-only:
// irreversible destruction, script hosts, download-and-run, and persistence. The caller
// controls the `isWrite` flag it sends, so these shapes are matched on command text.
const RISKY_COMMAND_PATTERNS = [
  /\brm\s+(-[a-z]+\s+)*-?[a-z]*[rf]/i,                 // rm -r / -f / -rf
  /\b(rd|rmdir|del|erase)\s+\/[sq]/i,
  /\bremove-item\b[^\n]*(\s-(recurse|force)|\s-(r|f)\b)/i,
  /\b(format|diskpart|mkfs|fdisk)\b/i,
  /\bdd\s+if=/i,
  /\bcipher\s+\/w/i,
  /\bshutdown\b|\brestart-computer\b|\btaskkill\s+\/f\b|\bnet\s+stop\b|\bsc\s+(delete|stop)\b/i,
  /\b(mshta|rundll32|regsvr32|installutil|cscript|wscript)\b/i,
  /\b(powershell|pwsh)\s+(-e(nc)?\b|-windowstyle\s+hidden)/i,
  /\binvoke-expression\b|\biex\b/,
  /\b(curl|wget|certutil|bitsadmin|start-bitstransfer)\b[^\n]*(&&|;|\|\s*(sh|bash|powershell|pwsh))/i,
  /\b(schtasks|new-service|net\s+user|net\s+localgroup)\b/i,
  /\\(startup|start menu)\\|currentversion\\run/i
];

// Download targets come from the model, so loopback, link-local (cloud metadata) and
// raw-address hosts are refused to keep the fetch off the local network.
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Resolves a path the way the OS would open it: reparse points (junctions/symlinks) and 8.3
 * short names both collapse to the real target, so the blacklist cannot be dodged with
 * `C:\Progra~1` or a junction. The plain realpathSync call is not enough on Windows — it
 * follows reparse points but leaves short names alone, so the native variant comes first.
 * @param {string} targetPath
 * @returns {string}
 */
function resolveRealPath(targetPath) {
  const resolved = path.resolve(String(targetPath || ''));
  try {
    return fs.realpathSync.native(resolved);
  } catch (e) {
    try {
      return fs.realpathSync(resolved);
    } catch (e2) {
      return resolved;
    }
  }
}

/**
 * Normalizes and checks if a path falls into the system blacklists.
 * @param {string} targetPath - The target file system path.
 * @returns {boolean} True if the path is blacklisted, false otherwise.
 */
function isPathBlacklisted(targetPath) {
  if (!targetPath) return false;
  
  // Resolve absolute path, follow reparse points, and normalize to lowercase Windows backslashes
  const normalized = resolveRealPath(targetPath).toLowerCase();
  
  for (const pattern of BLACKLIST_PATTERNS) {
    if (pattern.test(normalized)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a command string attempts registry or system environment mutations.
 * @param {string} command - The terminal command to execute.
 * @returns {boolean} True if the command is blocked, false otherwise.
 */
function isCommandBlacklisted(command) {
  if (!command) return false;
  
  for (const regex of REGISTRY_WRITE_COMMANDS) {
    if (regex.test(command)) return true;
  }
  
  for (const regex of ENV_MUTATION_COMMANDS) {
    if (regex.test(command)) return true;
  }
  
  return false;
}

/**
 * Checks if a command matches a shape Adaptive mode should never run silently.
 * @param {string} command - The terminal command about to be executed.
 * @returns {boolean} True if the user must approve it first.
 */
function isRiskyCommand(command) {
  if (!command) return false;
  const text = String(command);
  return RISKY_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * @param {string} rawUrl
 * @returns {boolean} True when the URL is a public http(s) target worth fetching.
 */
function isSafeDownloadUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch (e) {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || !host.includes('.')) return false;
  if (host === 'localhost' || host.endsWith('.local') || host === '::1') return false;
  if (/^fe80/i.test(host) || /^f[cd]/i.test(host)) return false;
  if (IPV4_RE.test(host)) return false;
  return true;
}

/**
 * Resolves a target path, applying mock redirections if PROCESS_ENV_MOCK is active.
 * Throws an error if the path violates the security blacklist.
 * 
 * @param {string} targetPath - The requested destination path.
 * @param {boolean} isWriteOperation - Whether this operation writes/deletes.
 * @returns {string} The safe, resolved path (possibly redirected to mock sandbox).
 */
function verifyAndResolvePath(targetPath, isWriteOperation = true) {
  const normalizedPath = path.resolve(targetPath);

  if (isWriteOperation && isPathBlacklisted(normalizedPath)) {
    throw new Error(`Security Violation: Write operations to path "${normalizedPath}" are strictly blacklisted.`);
  }

  // Handle mock environment redirections
  if (process.env.PROCESS_ENV_MOCK === 'true') {
    const mockRoot = 'C:\\local_agent_sandbox';
    
    // Parse the path to create a relative mapping under the mock directory
    const parsed = path.parse(normalizedPath);
    // Remove the drive letter/root to nest it safely, e.g., D:\Ultron\file.txt -> C:\local_agent_sandbox\Ultron\file.txt
    const relativeSub = normalizedPath.replace(parsed.root, '');
    const redirectedPath = path.join(mockRoot, relativeSub);
    
    return redirectedPath;
  }

  return normalizedPath;
}

module.exports = {
  isPathBlacklisted,
  isCommandBlacklisted,
  isRiskyCommand,
  isSafeDownloadUrl,
  resolveRealPath,
  verifyAndResolvePath
};
