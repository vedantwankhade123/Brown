const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const STORAGE_CONFIG_NAME = 'storage-config.json';
const LEGACY_CONFIG_NAME = 'config.json';

const isolationWarnings = new Set();
function profileName() { return isStoreEdition() ? 'BrownAIStore' : app.isPackaged ? 'UltronData' : 'UltronDataDev'; }
function canonical(dir) {
  let resolved=path.resolve(dir);
  let probe=resolved;const suffix=[];
  while(true){try{resolved=path.join(fs.realpathSync(probe),...suffix);break;}catch(_){const parent=path.dirname(probe);if(parent===probe)break;suffix.unshift(path.basename(probe));probe=parent;}}
  return resolved.replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();
}
function overlaps(a,b) { const x=canonical(a),y=canonical(b);return x===y||x.startsWith(y+'/')||y.startsWith(x+'/'); }
function foreignStorage(dir) {
  if(!dir)return false;
  const parts=canonical(dir).split('/');
  if(app.isPackaged ? parts.includes('brown-local')||parts.includes('ultrondatadev') : parts.includes('ultrondata')||parts.includes('brownaistore'))return true;
  const base=process.env.LOCALAPPDATA||path.dirname(app.getPath('userData'));
  for(const profile of ['UltronData','UltronDataDev','BrownAIStore']) {
    if(profile===profileName())continue;
    try {const snapshot=JSON.parse(fs.readFileSync(path.join(base,profile,'storage-profile.json'),'utf8'));
      if([snapshot.agentDataDir,snapshot.connectorsDir].filter(Boolean).some(other=>overlaps(dir,other)))return true;
    } catch (_) {}
  }
  return false;
}
function allowedStorage(dir) {
  if(!foreignStorage(dir))return true;
  isolationWarnings.add('A storage path overlaps another Brown environment and was not used: '+dir);
  return false;
}
function assertStorage(dir) { if(!allowedStorage(dir))throw Error('Choose a separate data folder. This path belongs to another Brown environment. Model files can remain shared.'); }
function recordProfile(layout) {
  try {fs.mkdirSync(app.getPath('userData'),{recursive:true});fs.writeFileSync(path.join(app.getPath('userData'),'storage-profile.json'),JSON.stringify({environment:profileName(),agentDataDir:layout.agentDataDir,connectorsDir:layout.connectorsDir}));}
  catch(error){console.warn('[STORAGE] Could not record profile isolation:',error.message);}
}



function isStoreEdition() {
  return !!(process.windowsStore || (typeof app?.getAppPath === 'function' && require(path.join(app.getAppPath(), 'package.json')).distributionChannel === 'microsoft-store'));
}

/** Dev: brown-local | Production: Ultron-AI */
function getUltronFolderName() {
  return app?.isPackaged ? 'Ultron-AI' : 'brown-local';
}

/** Electron app binary folder (not user data). */
function getInstallRoot() {
  if (app?.isPackaged && typeof app?.getPath === 'function') {
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
    const testFile = path.join(dirPath, `.permcheck-${process.pid}-${Math.random().toString(36).slice(2)}`);
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
 * - Production: %LOCALAPPDATA%\UltronData
 * - Dev: {repo}\brown-local
 */
function getDefaultUltronRoot() {
  // Store installation directories are immutable and change with package updates.
  if (isStoreEdition()) {
    const root = app.getPath('userData');
    if (!ensureDir(root)) throw new Error('Brown could not create its Store app data folder.');
    return root;
  }
  const folderName = getUltronFolderName();

  if (!app?.isPackaged) {
    const repoRoot = path.join(process.cwd(), folderName);
    if (ensureDir(repoRoot)) return repoRoot;
  }

  // 1. Primary: Use the installation folder chosen by the user at setup time (e.g. D:\Ultron AI)
  const installRoot = getInstallRoot();
  if (installRoot && allowedStorage(path.join(installRoot, 'data')) && ensureDir(installRoot)) {
    return installRoot;
  }

  // 2. Fallback: Safe standard User Data location (%LOCALAPPDATA%\UltronData)
  try {
    if (typeof app?.getPath === 'function') {
      const userPath = app.getPath('userData');
      if (userPath && ensureDir(userPath)) {
        return userPath;
      }
    }
  } catch (e) {
    // app.getPath may not be initialized in early tests
  }

  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const fallback = path.join(localAppData, app?.isPackaged ? 'UltronData' : 'UltronDataDev');
  ensureDir(fallback);
  return fallback;
}

/** Production: Unified storage directory. */
function getUltronRootBesideOllama(ollamaExePath) {
  return getDefaultUltronRoot();
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
    path.join(app.getPath('userData'), 'data', LEGACY_CONFIG_NAME)
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

/** Old generic Ultron folder or other outdated roots — migrate to brown-local / Ultron-AI. */
function isLegacyStorageRoot(dirPath) {
  if (!dirPath || isLegacyAppDataPath(dirPath)) return isLegacyAppDataPath(dirPath);
  const normalized = dirPath.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  if (/\\brown-local$/.test(normalized) || /\\ultron-ai$/.test(normalized)) return false;
  if (/\\ultron-local$/.test(normalized) || /\\ultron$/.test(normalized)) return true;
  return false;
}

function resolveUltronRoot(config = readStorageConfigFile()) {
  const candidate = config.ultronRoot;
  if (candidate && allowedStorage(path.join(candidate,'data')) && !isLegacyStorageRoot(candidate) && ensureDir(candidate)) {
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
  if (candidate && allowedStorage(candidate) && !isLegacyAppDataPath(candidate) && ensureDir(candidate)) {
    return candidate;
  }
  const layout = layoutFromRoot(resolveUltronRoot(config));
  ensureDir(layout.agentDataDir);
  return layout.agentDataDir;
}

function resolveConnectorsDir(config = readStorageConfigFile()) {
  const candidate = config.connectorsDir || config.customConnectorsDir;
  if (candidate && allowedStorage(candidate) && !isLegacyAppDataPath(candidate) && ensureDir(candidate)) {
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
  if (!ensureDir(layout.modelsDir)) throw new Error(`Brown cannot create or write to the models folder: ${layout.modelsDir}`);
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

  // Dev always uses brown-local even when Ollama lives on another drive
  if (!app.isPackaged && !options.respectOllamaDrive) {
    ultronRoot = getDefaultUltronRoot();
  }

  const layout = layoutFromRoot(ultronRoot);
  assertStorage(layout.agentDataDir);assertStorage(layout.connectorsDir);
  for (const dir of [layout.ultronRoot, layout.agentDataDir, layout.connectorsDir, layout.modelsDir]) {
    if (!ensureDir(dir)) throw new Error(`Brown cannot create or write to the storage folder: ${dir}`);
  }
  for (const sub of ['memory', 'temp']) {
    const dir = path.join(layout.agentDataDir, sub);
    if (!ensureDir(dir)) throw new Error(`Brown cannot create or write to the storage folder: ${dir}`);
  }

  assertStorage(layout.agentDataDir);assertStorage(layout.connectorsDir);
  writeStorageConfigFile(layout);
  recordProfile(layout);

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
  const inherited=process.env.ULTRON_DATA_DIR;
  return inherited&&allowedStorage(inherited)?inherited:resolveAgentDataDir();
}

function getConnectorsRoot() {
  const inherited=process.env.ULTRON_CONNECTORS_DIR;
  return inherited&&allowedStorage(inherited)?inherited:resolveConnectorsDir();
}

function getOllamaModelsDir() {
  const configured = process.env.ULTRON_MODELS_DIR || process.env.OLLAMA_MODELS;
  if (configured && ensureDir(configured)) return configured;
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
  const inherited=process.env.ULTRON_ROOT;
  const ultronRoot = inherited&&allowedStorage(path.join(inherited,'data'))?inherited:resolveUltronRoot();
  const layout = layoutFromRoot(ultronRoot);
  return {
    environment:profileName(),
    isolationWarnings:[...isolationWarnings],
    runtimeEndpoint:'http://127.0.0.1:11434',
    runtimeModelDirectoryVerified:false,
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
    electronUserData: typeof app?.getPath === 'function' ? app.getPath('userData') : path.join(process.env.LOCALAPPDATA || '', 'UltronDataDev')
  };
}

function updateAgentDataDir(customPath) {
  assertStorage(customPath);
  if (!customPath || !ensureDir(customPath)) {
    throw new Error('Agent storage path is missing or not writable.');
  }
  writeStorageConfigFile({ agentDataDir: customPath });
  process.env.ULTRON_DATA_DIR = customPath;
  recordProfile({agentDataDir:customPath,connectorsDir:getConnectorsRoot()});
  for (const sub of ['memory', 'temp']) {
    ensureDir(path.join(customPath, sub));
  }
  return customPath;
}

function updateConnectorsDir(customPath) {
  assertStorage(customPath);
  if (!customPath || !ensureDir(customPath)) {
    throw new Error('Connectors path is missing or not writable.');
  }
  writeStorageConfigFile({ connectorsDir: customPath });
  process.env.ULTRON_CONNECTORS_DIR = customPath;
  recordProfile({agentDataDir:getUltronRuntimeRoot(),connectorsDir:customPath});
  return customPath;
}

function updateUltronRoot(customPath) {
  assertStorage(path.join(customPath||'', 'data'));
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
  isStoreEdition,
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
