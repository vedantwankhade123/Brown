const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const STORAGE_CONFIG_NAME = 'storage-config.json';
const LEGACY_CONFIG_NAME = 'config.json';

/** Dev: Ultron-local | Production: Ultron-AI */
function getUltronFolderName() {
  return app.isPackaged ? 'Ultron-AI' : 'Ultron-local';
}

/** Electron app binary folder (not user data). */
function getInstallRoot() {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  }
  return process.cwd();
}

function ensureDir(dirPath) {
  if (!dirPath) return false;
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    const testFile = path.join(dirPath, '.permcheck');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return true;
  } catch (e) {
    return false;
  }
}

function driveRootFrom(anyPath) {
  if (!anyPath) return null;
  const root = path.parse(anyPath).root;
  return root && root.length >= 2 ? root.replace(/\\$/, '') : null;
}

/**
 * Default unified data root:
 * - Dev: D:\Ultron-local (fallback {repo}\Ultron-local)
 * - Production: {installDrive}\Ultron-AI
 */
function getDefaultUltronRoot() {
  const folderName = getUltronFolderName();

  if (!app.isPackaged) {
    const dRoot = path.join('D:\\', folderName);
    if (ensureDir(dRoot)) return dRoot;
    const repoRoot = path.join(process.cwd(), folderName);
    if (ensureDir(repoRoot)) return repoRoot;
  }

  const exePath = app.getPath('exe');
  const drive = driveRootFrom(exePath);
  if (drive) {
    const root = path.join(`${drive}\\`, folderName);
    if (ensureDir(root)) return root;
  }

  const fallback = path.join(getInstallRoot(), folderName);
  ensureDir(fallback);
  return fallback;
}

/** Production: {ollamaDrive}\Ultron-AI beside Ollama install drive. */
function getUltronRootBesideOllama(ollamaExePath) {
  const drive = driveRootFrom(ollamaExePath);
  if (!drive) return getDefaultUltronRoot();
  const root = path.join(`${drive}\\`, getUltronFolderName());
  ensureDir(root);
  return root;
}

function getStorageConfigPath(ultronRoot) {
  const root = ultronRoot || getDefaultUltronRoot();
  const configDir = path.join(root, 'data');
  ensureDir(configDir);
  return path.join(configDir, STORAGE_CONFIG_NAME);
}

function readStorageConfigFile() {
  const defaultRoot = getDefaultUltronRoot();
  const configPath = getStorageConfigPath(defaultRoot);
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.warn('[STORAGE] Failed to read storage-config.json:', e.message);
    }
  }

  // Legacy: old install-relative or AppData config.json
  const legacyCandidates = [
    path.join(getInstallRoot(), 'data', LEGACY_CONFIG_NAME),
    path.join(process.env.LOCALAPPDATA || '', 'UltronDataDev', 'data', LEGACY_CONFIG_NAME),
    path.join(process.env.LOCALAPPDATA || '', 'UltronData', 'data', LEGACY_CONFIG_NAME)
  ];
  for (const legacyPath of legacyCandidates) {
    if (!fs.existsSync(legacyPath)) continue;
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      if (legacy.customDataDir || legacy.agentDataDir) {
        return {
          ultronRoot: legacy.ultronRoot,
          agentDataDir: legacy.agentDataDir || legacy.customDataDir,
          connectorsDir: legacy.connectorsDir || legacy.customConnectorsDir,
          modelsDir: legacy.modelsDir
        };
      }
    } catch (e) { /* ignore */ }
  }

  return {};
}

function writeStorageConfigFile(patch = {}) {
  const current = readStorageConfigFile();
  const ultronRoot = patch.ultronRoot || current.ultronRoot || getDefaultUltronRoot();
  const configPath = getStorageConfigPath(ultronRoot);
  const next = {
    ultronRoot,
    agentDataDir: patch.agentDataDir || current.agentDataDir || path.join(ultronRoot, 'data'),
    connectorsDir: patch.connectorsDir || current.connectorsDir || path.join(ultronRoot, 'connectors'),
    modelsDir: patch.modelsDir || current.modelsDir || path.join(ultronRoot, 'models')
  };
  fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function isLegacyAppDataPath(dirPath) {
  if (!dirPath || typeof dirPath !== 'string') return false;
  const normalized = dirPath.replace(/\//g, '\\').toLowerCase();
  return normalized.includes('\\appdata\\') && (normalized.includes('ultrondatadev') || normalized.includes('ultrondata'));
}

/** Old generic Ultron folder or other outdated roots — migrate to Ultron-local / Ultron-AI. */
function isLegacyStorageRoot(dirPath) {
  if (!dirPath || isLegacyAppDataPath(dirPath)) return isLegacyAppDataPath(dirPath);
  const normalized = dirPath.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  if (/\\ultron-local$/.test(normalized) || /\\ultron-ai$/.test(normalized)) return false;
  if (/\\ultron$/.test(normalized)) return true;
  return false;
}

function resolveUltronRoot(config = readStorageConfigFile()) {
  const candidate = config.ultronRoot;
  if (candidate && !isLegacyStorageRoot(candidate) && ensureDir(candidate)) {
    return candidate;
  }
  const defaultRoot = getDefaultUltronRoot();
  ensureDir(defaultRoot);
  return defaultRoot;
}

function layoutFromRoot(ultronRoot) {
  return {
    ultronRoot,
    agentDataDir: path.join(ultronRoot, 'data'),
    connectorsDir: path.join(ultronRoot, 'connectors'),
    modelsDir: path.join(ultronRoot, 'models')
  };
}

function resolveAgentDataDir(config = readStorageConfigFile()) {
  const candidate = config.agentDataDir || config.customDataDir;
  if (candidate && !isLegacyAppDataPath(candidate) && ensureDir(candidate)) {
    return candidate;
  }
  const layout = layoutFromRoot(resolveUltronRoot(config));
  ensureDir(layout.agentDataDir);
  return layout.agentDataDir;
}

function resolveConnectorsDir(config = readStorageConfigFile()) {
  const candidate = config.connectorsDir || config.customConnectorsDir;
  if (candidate && !isLegacyAppDataPath(candidate) && ensureDir(candidate)) {
    return candidate;
  }
  const layout = layoutFromRoot(resolveUltronRoot(config));
  ensureDir(layout.connectorsDir);
  return layout.connectorsDir;
}

function resolveModelsDir(config = readStorageConfigFile()) {
  const candidate = config.modelsDir;
  if (candidate && !isLegacyAppDataPath(candidate) && ensureDir(candidate)) {
    return candidate;
  }
  const layout = layoutFromRoot(resolveUltronRoot(config));
  ensureDir(layout.modelsDir);
  return layout.modelsDir;
}

/** Create / refresh the full Ultron folder tree and persist config. */
function ensureUltronStorageLayout(options = {}) {
  let ultronRoot = options.ultronRoot;

  if (!ultronRoot && options.ollamaExePath) {
    ultronRoot = getUltronRootBesideOllama(options.ollamaExePath);
  }
  if (!ultronRoot) {
    ultronRoot = resolveUltronRoot();
  }

  // Dev always uses Ultron-local even when Ollama lives on another drive
  if (!app.isPackaged && !options.respectOllamaDrive) {
    ultronRoot = getDefaultUltronRoot();
  }

  const layout = layoutFromRoot(ultronRoot);
  ensureDir(layout.ultronRoot);
  ensureDir(layout.agentDataDir);
  ensureDir(layout.connectorsDir);
  ensureDir(layout.modelsDir);
  for (const sub of ['memory', 'temp']) {
    ensureDir(path.join(layout.agentDataDir, sub));
  }

  writeStorageConfigFile(layout);

  process.env.ULTRON_ROOT = layout.ultronRoot;
  process.env.ULTRON_DATA_DIR = layout.agentDataDir;
  process.env.ULTRON_CONNECTORS_DIR = layout.connectorsDir;
  process.env.ULTRON_MODELS_DIR = layout.modelsDir;
  process.env.OLLAMA_MODELS = layout.modelsDir;

  return layout;
}

function applyStoragePaths() {
  const config = readStorageConfigFile();
  const patch = {};

  if (config.agentDataDir && isLegacyAppDataPath(config.agentDataDir)) {
    patch.agentDataDir = path.join(getDefaultUltronRoot(), 'data');
  }
  if (config.connectorsDir && isLegacyAppDataPath(config.connectorsDir)) {
    patch.connectorsDir = path.join(getDefaultUltronRoot(), 'connectors');
  }
  if (config.ultronRoot && isLegacyStorageRoot(config.ultronRoot)) {
    patch.ultronRoot = getDefaultUltronRoot();
  }
  if (Object.keys(patch).length) {
    writeStorageConfigFile(patch);
  }

  return ensureUltronStorageLayout();
}

function getUltronRuntimeRoot() {
  return process.env.ULTRON_DATA_DIR || resolveAgentDataDir();
}

function getConnectorsRoot() {
  return process.env.ULTRON_CONNECTORS_DIR || resolveConnectorsDir();
}

function getOllamaModelsDir() {
  if (process.env.ULTRON_MODELS_DIR) return process.env.ULTRON_MODELS_DIR;
  if (process.env.OLLAMA_MODELS) return process.env.OLLAMA_MODELS;
  return resolveModelsDir();
}

function getOllamaInstallPath() {
  const userLocal = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const candidates = [
    path.join(userLocal, 'Programs', 'Ollama', 'ollama.exe'),
    path.join(userLocal, 'Programs', 'Ollama', 'ollama app.exe'),
    'C:\\Program Files\\Ollama\\ollama.exe',
    'C:\\Program Files (x86)\\Ollama\\ollama.exe'
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function getStoragePathsSnapshot() {
  const ultronRoot = process.env.ULTRON_ROOT || resolveUltronRoot();
  const layout = layoutFromRoot(ultronRoot);
  return {
    ultronRoot,
    installRoot: getInstallRoot(),
    storageFolderName: getUltronFolderName(),
    defaultUltronRoot: getDefaultUltronRoot(),
    defaultAgentDataDir: layout.agentDataDir,
    defaultConnectorsDir: layout.connectorsDir,
    defaultModelsDir: layout.modelsDir,
    agentDataDir: getUltronRuntimeRoot(),
    connectorsDir: getConnectorsRoot(),
    modelsDir: getOllamaModelsDir(),
    ollamaModelsDir: getOllamaModelsDir(),
    ollamaInstallPath: getOllamaInstallPath(),
    electronUserData: app.getPath('userData')
  };
}

function updateAgentDataDir(customPath) {
  if (!customPath || !ensureDir(customPath)) {
    throw new Error('Agent storage path is missing or not writable.');
  }
  writeStorageConfigFile({ agentDataDir: customPath });
  process.env.ULTRON_DATA_DIR = customPath;
  for (const sub of ['memory', 'temp']) {
    ensureDir(path.join(customPath, sub));
  }
  return customPath;
}

function updateConnectorsDir(customPath) {
  if (!customPath || !ensureDir(customPath)) {
    throw new Error('Connectors path is missing or not writable.');
  }
  writeStorageConfigFile({ connectorsDir: customPath });
  process.env.ULTRON_CONNECTORS_DIR = customPath;
  return customPath;
}

function updateUltronRoot(customPath) {
  if (!customPath || !ensureDir(customPath)) {
    throw new Error('Ultron folder path is missing or not writable.');
  }
  return ensureUltronStorageLayout({ ultronRoot: customPath });
}

/** Called when Ollama is detected or freshly installed. */
function provisionUltronFolderForOllama(ollamaExePath) {
  if (!ollamaExePath) {
    return ensureUltronStorageLayout();
  }
  if (!app.isPackaged) {
    return ensureUltronStorageLayout({ respectOllamaDrive: false });
  }
  return ensureUltronStorageLayout({ ollamaExePath });
}

function getDefaultAgentDataDir() {
  return path.join(getDefaultUltronRoot(), 'data');
}

function getDefaultConnectorsDir() {
  return path.join(getDefaultUltronRoot(), 'connectors');
}

/** @deprecated */
function getDevProjectDataDir() {
  return getDefaultAgentDataDir();
}

module.exports = {
  getInstallRoot,
  getDefaultUltronRoot,
  getUltronRootBesideOllama,
  getDefaultAgentDataDir,
  getDefaultConnectorsDir,
  getUltronRuntimeRoot,
  getConnectorsRoot,
  getOllamaModelsDir,
  getOllamaInstallPath,
  getStoragePathsSnapshot,
  applyStoragePaths,
  ensureUltronStorageLayout,
  provisionUltronFolderForOllama,
  updateAgentDataDir,
  updateConnectorsDir,
  updateUltronRoot,
  isLegacyAppDataPath,
  isLegacyStorageRoot,
  getUltronFolderName,
  getDevProjectDataDir
};
