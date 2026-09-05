const path = require('path');
const fs = require('fs');

const TTS_MODEL_CATALOG = [
  {
    key: 'kokoro-heart',
    engine: 'kokoro',
    kokoroVoice: 'af_heart',
    sharedEngineKey: 'kokoro-engine',
    label: 'Heart',
    description: 'US female · premium natural tone (best quality)',
    sizeEstimate: '~92 MB',
    previewText: "Hello, I'm Brown. This is the Heart voice."
  },
  {
    key: 'kokoro-michael',
    engine: 'kokoro',
    kokoroVoice: 'am_michael',
    sharedEngineKey: 'kokoro-engine',
    label: 'Michael',
    description: 'US male · steady, natural conversational voice',
    sizeEstimate: '~92 MB',
    previewText: "Hello, I'm Brown. This is the Michael voice."
  },
  {
    key: 'gemini-live-kore',
    engine: 'gemini-cloud',
    label: 'Kore',
    description: 'Cloud voice · natural expressive tone',
    sizeEstimate: 'Cloud',
    previewText: "Hello, I'm Brown. This is the Kore voice."
  }
];

const DEFAULT_TTS_MODEL_KEY = 'kokoro-heart';

const downloadState = new Map();
let activeModelKey = DEFAULT_TTS_MODEL_KEY;

function getCatalogEntry(modelKey) {
  return TTS_MODEL_CATALOG.find(entry => entry.key === modelKey) || TTS_MODEL_CATALOG[0];
}

function getTtsCacheRoot() {
  try {
    const { getOllamaModelsDir } = require('./paths');
    return path.join(getOllamaModelsDir(), 'tts-cache');
  } catch (e) {
    const fallback = path.join(process.cwd(), 'brown-local', 'models', 'tts-cache');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function getModelCacheDir(modelKey) {
  return path.join(getTtsCacheRoot(), modelKey);
}

function getActiveModelConfigPath() {
  return path.join(getTtsCacheRoot(), 'active-tts-model.json');
}

function loadActiveModelKey() {
  try {
    const configPath = getActiveModelConfigPath();
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const entry = parsed?.modelKey ? getCatalogEntry(parsed.modelKey) : null;
      // Live dialog engines are Voice Mode engines, never the TTS voice.
      if (entry && !entry.liveOnly) {
        activeModelKey = entry.key;
      }
    }
  } catch (e) { /* ignore */ }
  return activeModelKey;
}

function saveActiveModelKey(modelKey) {
  const entry = getCatalogEntry(modelKey);
  if (!entry) return { success: false, error: 'Unknown TTS model.' };
  if (entry.liveOnly) {
    return { success: false, error: 'Live dialog engines are used by Voice Mode, not as text-to-speech voices.' };
  }
  activeModelKey = entry.key;
  fs.mkdirSync(getTtsCacheRoot(), { recursive: true });
  fs.writeFileSync(getActiveModelConfigPath(), JSON.stringify({ modelKey: activeModelKey }, null, 2));
  return { success: true, modelKey: activeModelKey };
}

loadActiveModelKey();

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function walkDir(dir, matcher, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(full, matcher, results);
    } else if (matcher(full)) {
      results.push(full);
    }
  }
  return results;
}

function getInstallKey(entry) {
  return entry?.sharedEngineKey || entry?.key;
}

function getCacheDirForEntry(entry) {
  if (entry?.engine === 'kokoro') {
    const { getKokoroCacheDir } = require('./voice-kokoro');
    return getKokoroCacheDir();
  }
  return getModelCacheDir(getInstallKey(entry));
}

function getModelCacheBytes(modelKey) {
  const entry = getCatalogEntry(modelKey);
  if (entry.engine === 'kokoro') {
    const { getKokoroCacheBytes } = require('./voice-kokoro');
    return getKokoroCacheBytes();
  }
  const cacheDir = getCacheDirForEntry(entry);
  let cacheBytes = 0;
  if (!fs.existsSync(cacheDir)) return 0;
  for (const filePath of walkDir(cacheDir, () => true)) {
    try {
      cacheBytes += fs.statSync(filePath).size;
    } catch (e) { /* ignore */ }
  }
  return cacheBytes;
}

function isModelInstalled(modelKey) {
  const entry = getCatalogEntry(modelKey);
  if (entry.engine === 'gemini-cloud') {
    const { isGeminiCloudAvailable } = require('./voice-gemini-cloud');
    return isGeminiCloudAvailable();
  }
  if (entry.engine === 'kokoro') {
    const { isKokoroVoiceInstalled } = require('./voice-kokoro');
    return isKokoroVoiceInstalled(entry.kokoroVoice || 'af_heart');
  }
  const cacheDir = getModelCacheDir(getInstallKey(entry));
  const onnxFiles = walkDir(cacheDir, filePath => /\.onnx$/i.test(filePath));
  return onnxFiles.length > 0;
}

function isAnyTtsModelInstalled() {
  return TTS_MODEL_CATALOG.some(entry => isModelInstalled(entry.key));
}

function getDownloadState(modelKey) {
  return downloadState.get(modelKey) || { inProgress: false, cancelled: false };
}

function chunkTextForTts(text, maxLen = 350) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  const chunks = [];
  let buf = '';
  for (const part of parts) {
    const next = `${buf}${part}`.trim();
    if (next.length > maxLen && buf.trim()) {
      chunks.push(buf.trim());
      buf = part;
    } else {
      buf = next;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks.length ? chunks : [cleaned.slice(0, maxLen)];
}

async function synthesizeWithModel(modelKey, text, options = {}) {
  const entry = getCatalogEntry(modelKey);
  const chunks = chunkTextForTts(text);
  if (!chunks.length) {
    return { success: false, error: 'No text to speak.' };
  }
  if (!isModelInstalled(modelKey, options)) {
    return {
      success: false,
      error: `“${entry.label}” is not configured or installed. Select it in Settings → Agent Sounds.`,
      needsDownload: !entry.cloud,
      modelKey
    };
  }

  if (entry.engine === 'kokoro') {
    const { synthesizeKokoroSpeech } = require('./voice-kokoro');
    const result = await synthesizeKokoroSpeech(text, entry.kokoroVoice);
    return {
      ...result,
      modelKey,
      modelLabel: entry.label
    };
  }

  if (entry.engine === 'gemini-cloud') {
    const { synthesizeGeminiCloudSpeech } = require('./voice-gemini-cloud');
    const result = await synthesizeGeminiCloudSpeech(chunks.join(' '), {
      geminiModel: entry.geminiModel,
      voiceName: entry.voiceName,
      apiKey: options.apiKey
    });
    return {
      ...result,
      modelKey,
      modelLabel: entry.label
    };
  }

  return { success: false, error: `Unsupported TTS engine for “${entry.label}”.` };
}

async function synthesizeSpeech(text, modelKey = activeModelKey, options = {}) {
  return synthesizeWithModel(modelKey || activeModelKey, text, options);
}

function getTtsCatalog() {
  return TTS_MODEL_CATALOG.filter(entry => !entry.liveOnly).map(entry => {
    const cacheBytes = entry.cloud ? 0 : getModelCacheBytes(entry.key);
    const state = getDownloadState(entry.key);
    const downloading = Boolean(state.inProgress);
    return {
      key: entry.key,
      engine: entry.engine || 'transformers',
      modelId: entry.modelId || entry.kokoroVoice || entry.voiceName,
      label: entry.label,
      description: entry.description,
      sizeEstimate: entry.sizeEstimate,
      previewText: entry.previewText,
      cloud: Boolean(entry.cloud),
      installed: isModelInstalled(entry.key),
      downloading,
      cacheSize: entry.cloud ? 'Cloud' : formatBytes(cacheBytes),
      cacheBytes,
      isActive: entry.key === activeModelKey
    };
  });
}

function getTtsModelStatus(modelKey = activeModelKey) {
  const entry = getCatalogEntry(modelKey);
  const cacheBytes = getModelCacheBytes(entry.key);
  const state = getDownloadState(entry.key);
  return {
    modelKey: entry.key,
    modelId: entry.modelId,
    label: entry.label,
    sizeEstimate: entry.sizeEstimate,
    installed: isModelInstalled(entry.key),
    downloading: state.inProgress,
    cacheDir: getModelCacheDir(entry.key),
    cacheSize: formatBytes(cacheBytes),
    cacheBytes,
    isActive: entry.key === activeModelKey,
    catalog: getTtsCatalog()
  };
}

async function downloadTtsModel(modelKey = DEFAULT_TTS_MODEL_KEY, sendProgress) {
  const entry = getCatalogEntry(modelKey);

  if (entry.cloud || entry.engine === 'gemini-cloud') {
    return {
      success: false,
      error: 'Cloud voices use your Gemini API key — add it in Settings → Connectors.',
      modelKey: entry.key
    };
  }

  if (entry.engine === 'kokoro') {
    const { downloadKokoroVoice } = require('./voice-kokoro');
    const state = getDownloadState(modelKey);
    if (state.inProgress) {
      return { success: false, error: 'This voice model is already downloading.' };
    }
    downloadState.set(modelKey, { inProgress: true, cancelled: false });
    const result = await downloadKokoroVoice(entry.kokoroVoice || 'af_heart', (payload) => {
      if (typeof sendProgress === 'function') {
        sendProgress({
          modelKey: entry.key,
          modelName: `tts-${entry.key}`,
          ...payload
        });
      }
    });
    downloadState.set(modelKey, { inProgress: false, cancelled: false });
    if (result.success) saveActiveModelKey(entry.key);
    return { ...result, modelKey: entry.key };
  }

  return {
    success: false,
    error: `Unsupported TTS engine for “${entry.label}”.`,
    modelKey: entry.key
  };
}

function cancelTtsModelDownload(modelKey = null) {
  const entry = modelKey ? getCatalogEntry(modelKey) : null;
  if (entry?.engine === 'kokoro') {
    const { cancelKokoroDownload } = require('./voice-kokoro');
    return cancelKokoroDownload();
  }

  if (modelKey) {
    const state = getDownloadState(modelKey);
    if (!state.inProgress) {
      return { success: false, error: 'No download in progress for that model.' };
    }
    downloadState.set(modelKey, { inProgress: false, cancelled: true });
    return { success: true, cancelled: true, modelKey };
  }

  for (const catalogEntry of TTS_MODEL_CATALOG) {
    const state = getDownloadState(catalogEntry.key);
    if (state.inProgress) {
      downloadState.set(catalogEntry.key, { inProgress: false, cancelled: true });
      return { success: true, cancelled: true, modelKey: catalogEntry.key };
    }
  }
  return { success: false, error: 'No neural voice download in progress.' };
}

function deleteTtsModel(modelKey = activeModelKey) {
  const entry = getCatalogEntry(modelKey);
  const state = getDownloadState(entry.key);
  if (state.inProgress) {
    return { success: false, error: 'Cannot remove a voice model while it is downloading.' };
  }

  if (entry.engine === 'kokoro') {
    const { deleteKokoroEngine } = require('./voice-kokoro');
    const result = deleteKokoroEngine();
    if (result.success) {
      if (activeModelKey === entry.key || TTS_MODEL_CATALOG.some(v => v.key === activeModelKey && v.engine === 'kokoro')) {
        const fallback = TTS_MODEL_CATALOG.find(item => item.key !== entry.key && isModelInstalled(item.key));
        saveActiveModelKey(fallback?.key || DEFAULT_TTS_MODEL_KEY);
      }
    }
    return { ...result, modelKey: entry.key };
  }

  const cacheDir = getModelCacheDir(getInstallKey(entry));
  try {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
    fs.mkdirSync(cacheDir, { recursive: true });

    if (activeModelKey === entry.key) {
      const fallback = TTS_MODEL_CATALOG.find(item => item.key !== entry.key && isModelInstalled(item.key));
      if (fallback) saveActiveModelKey(fallback.key);
      else saveActiveModelKey(DEFAULT_TTS_MODEL_KEY);
    }

    return { success: true, modelKey: entry.key };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to remove neural voice model.' };
  }
}

async function warmupTtsEngine(modelKey = activeModelKey) {
  const entry = getCatalogEntry(modelKey);
  if (entry.engine === 'kokoro') {
    const { warmupKokoroEngine } = require('./voice-kokoro');
    return warmupKokoroEngine();
  }
  if (entry.engine === 'gemini-cloud') {
    return { success: true, warmed: true, cloud: true };
  }
  if (!isModelInstalled(entry.key)) {
    return { success: false, error: 'Voice model not installed.' };
  }
  return { success: true, warmed: true };
}

module.exports = {
  TTS_MODEL_KEY: `tts-${DEFAULT_TTS_MODEL_KEY}`,
  TTS_MODEL_CATALOG,
  DEFAULT_TTS_MODEL_KEY,
  getTtsCatalog,
  getTtsModelStatus,
  getActiveTtsModelKey: () => activeModelKey,
  setActiveTtsModelKey: saveActiveModelKey,
  synthesizeSpeech,
  synthesizeWithModel,
  downloadTtsModel,
  cancelTtsModelDownload,
  deleteTtsModel,
  warmupTtsEngine,
  isAnyTtsModelInstalled
};
