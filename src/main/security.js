const path = require('path');

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

/**
 * Normalizes and checks if a path falls into the system blacklists.
 * @param {string} targetPath - The target file system path.
 * @returns {boolean} True if the path is blacklisted, false otherwise.
 */
function isPathBlacklisted(targetPath) {
  if (!targetPath) return false;
  
  // Resolve absolute path and normalize to lowercase Windows backslashes
  const normalized = path.resolve(targetPath).toLowerCase();
  
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
  verifyAndResolvePath
};
