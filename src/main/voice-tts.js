const path = require('path');
const fs = require('fs');

const SPEAKER_EMBEDDINGS_URL = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin';

const TTS_MODEL_CATALOG = [
  {
    key: 'kokoro-heart',
    engine: 'kokoro',
    kokoroVoice: 'af_heart',
    sharedEngineKey: 'kokoro-engine',
    label: 'Heart',
    description: 'US female · premium natural tone (best quality)',
    sizeEstimate: '~92 MB',
    previewText: "Hello, I'm Ultron. This is the Heart voice."
  },
  {
    key: 'kokoro-bella',
    engine: 'kokoro',
    kokoroVoice: 'af_bella',
    sharedEngineKey: 'kokoro-engine',
    label: 'Bella',
    description: 'US female · warm conversational tone',
    sizeEstimate: '~92 MB',
    previewText: "Hello, I'm Ultron. This is the Bella voice."
  },
  {
    key: 'kokoro-nicole',
    engine: 'kokoro',
    kokoroVoice: 'af_nicole',
    sharedEngineKey: 'kokoro-engine',
    label: 'Nicole',
    description: 'US female · soft, clear natural speech',
    sizeEstimate: '~92 MB',
    previewText: "Hello, I'm Ultron. This is the Nicole voice."
  },
  {
    key: 'kokoro-fenrir',
    engine: 'kokoro',
    kokoroVoice: 'am_fenrir',
    sharedEngineKey: 'kokoro-engine',
    label: 'Fenrir',
    description: 'US male · confident natural tone',
    sizeEstimate: '~92 MB',
    previewText: "Hello, I'm Ultron. This is the Fenrir voice."
  },
  {
    key: 'kokoro-michael',
    engine: 'kokoro',
    kokoroVoice: 'am_michael',
    sharedEngineKey: 'kokoro-engine',
    label: 'Michael',
    description: 'US male · steady, natural conversational voice',
    sizeEstimate: '~92 MB',
    previewText: "Hello, I'm Ultron. This is the Michael voice."
  },
  {
    key: 'gemini-live-kore',
    engine: 'gemini-cloud',
    geminiModel: 'gemini-2.5-flash-preview-tts',
    voiceName: 'Kore',
    label: 'Gemini Live · Kore',
    description: 'Cloud female · natural live dialog voice',
    sizeEstimate: 'Cloud',
    cloud: true,
    previewText: "Hello, I'm Ultron. This is Gemini Live voice Kore."
  },
  {
    key: 'gemini-live-puck',
    engine: 'gemini-cloud',
    geminiModel: 'gemini-2.5-flash-preview-tts',
    voiceName: 'Puck',
    label: 'Gemini Live · Puck',
    description: 'Cloud male · upbeat conversational voice',
    sizeEstimate: 'Cloud',
    cloud: true,
    previewText: "Hello, I'm Ultron. This is Gemini Live voice Puck."
  },
  {
    key: 'gemini-live-charon',
    engine: 'gemini-cloud',
    geminiModel: 'gemini-2.5-flash-preview-tts',
    voiceName: 'Charon',
    label: 'Gemini Live · Charon',
    description: 'Cloud male · deep informative voice',
    sizeEstimate: 'Cloud',
    cloud: true,
    previewText: "Hello, I'm Ultron. This is Gemini Live voice Charon."
  }
];

const DEFAULT_TTS_MODEL_KEY = 'kokoro-bella';

const synthesizerPromises = new Map();
const downloadState = new Map();
let transformersPromise = null;
let speakerEmbeddingsPromise = null;
let activeModelKey = DEFAULT_TTS_MODEL_KEY;

function getCatalogEntry(modelKey) {
  return TTS_MODEL_CATALOG.find(entry => entry.key === modelKey) || TTS_MODEL_CATALOG[0];
}

function getTtsCacheRoot() {
  try {
    const { getOllamaModelsDir } = require('./paths');
    return path.join(getOllamaModelsDir(), 'tts-cache');
  } catch (e) {
    const fallback = path.join(process.cwd(), 'Ultron-local', 'models', 'tts-cache');
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
      if (parsed?.modelKey && getCatalogEntry(parsed.modelKey)) {
        activeModelKey = parsed.modelKey;
      }
    }
  } catch (e) { /* ignore */ }
  return activeModelKey;
}

function saveActiveModelKey(modelKey) {
  const entry = getCatalogEntry(modelKey);
  if (!entry) return { success: false, error: 'Unknown TTS model.' };
  activeModelKey = entry.key;
  fs.mkdirSync(getTtsCacheRoot(), { recursive: true });
  fs.writeFileSync(getActiveModelConfigPath(), JSON.stringify({ modelKey: activeModelKey }, null, 2));
  return { success: true, modelKey: activeModelKey };
}

loadActiveModelKey();

async function loadTransformers() {
  if (!transformersPromise) {
    transformersPromise = import('@xenova/transformers');
  }
  return transformersPromise;
}

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
    const { isKokoroEngineInstalled } = require('./voice-kokoro');
    return isKokoroEngineInstalled();
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

async function configureTransformersEnv(modelKey, onProgress) {
  const { env } = await loadTransformers();
  const cacheDir = getModelCacheDir(modelKey);
  fs.mkdirSync(cacheDir, { recursive: true });
  env.cacheDir = cacheDir;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.backends.onnx.wasm.numThreads = 1;
  try {
    require('onnxruntime-node');
  } catch (e) {
    console.warn('[voice-tts] onnxruntime-node unavailable:', e.message);
  }
  env.progress_callback = onProgress || null;
  return env;
}

async function getSpeakerEmbeddings() {
  if (!speakerEmbeddingsPromise) {
    speakerEmbeddingsPromise = (async () => {
      const sharedDir = path.join(getTtsCacheRoot(), '_shared');
      fs.mkdirSync(sharedDir, { recursive: true });
      const cachePath = path.join(sharedDir, 'speaker_embeddings.bin');
      if (!fs.existsSync(cachePath)) {
        const response = await fetch(SPEAKER_EMBEDDINGS_URL);
        if (!response.ok) {
          throw new Error('Failed to download SpeechT5 speaker embeddings.');
        }
        const arrayBuffer = await response.arrayBuffer();
        fs.writeFileSync(cachePath, Buffer.from(arrayBuffer));
      }
      const { Tensor } = await loadTransformers();
      const data = new Float32Array(fs.readFileSync(cachePath).buffer);
      return new Tensor('float32', data, [1, data.length]);
    })();
  }
  return speakerEmbeddingsPromise;
}

async function getSynthesizer(modelKey, onProgress) {
  const entry = getCatalogEntry(modelKey);
  if (!entry) throw new Error('Unknown neural voice model.');

  if (!synthesizerPromises.has(modelKey)) {
    const promise = (async () => {
      await configureTransformersEnv(modelKey, onProgress);
      const { pipeline } = await loadTransformers();
      return pipeline('text-to-speech', entry.modelId, entry.pipelineOptions || {});
    })();
    synthesizerPromises.set(modelKey, promise);
  }
  return synthesizerPromises.get(modelKey);
}

function float32ToWavBuffer(float32Array, sampleRate = 16000) {
  const samples = float32Array instanceof Float32Array ? float32Array : new Float32Array(float32Array);
  const numSamples = samples.length;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
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

async function synthesizeWithModel(modelKey, text) {
  const entry = getCatalogEntry(modelKey);
  const chunks = chunkTextForTts(text);
  if (!chunks.length) {
    return { success: false, error: 'No text to speak.' };
  }
  if (!isModelInstalled(modelKey)) {
    return {
      success: false,
      error: `“${entry.label}” is not installed. Download it in Settings → Agent Sounds.`,
      needsDownload: true,
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
      voiceName: entry.voiceName
    });
    return {
      ...result,
      modelKey,
      modelLabel: entry.label
    };
  }

  try {
    const synthesizer = await getSynthesizer(modelKey);
    let speakerEmbeddings = null;
    if (entry.needsSpeakerEmbeddings) {
      speakerEmbeddings = await getSpeakerEmbeddings();
    }

    const audioParts = [];
    let sampleRate = 16000;

    for (const chunk of chunks.slice(0, 8)) {
      const synthOptions = speakerEmbeddings ? { speaker_embeddings: speakerEmbeddings } : {};
      const output = await synthesizer(chunk, synthOptions);
      if (!output || !output.audio) continue;
      sampleRate = output.sampling_rate || sampleRate;
      audioParts.push(output.audio);
    }

    if (!audioParts.length) {
      return { success: false, error: 'Speech synthesis produced no audio.' };
    }

    const totalLen = audioParts.reduce((sum, part) => sum + part.length, 0);
    const merged = new Float32Array(totalLen);
    let offset = 0;
    for (const part of audioParts) {
      merged.set(part, offset);
      offset += part.length;
    }

    const wavBuffer = float32ToWavBuffer(merged, sampleRate);
    return {
      success: true,
      wavBase64: wavBuffer.toString('base64'),
      sampleRate,
      mimeType: 'audio/wav',
      modelKey,
      modelLabel: entry.label
    };
  } catch (err) {
    console.error(`[voice-tts] synthesizeSpeech error (${modelKey}):`, err);
    synthesizerPromises.delete(modelKey);
    return { success: false, error: err.message || 'Speech synthesis failed.' };
  }
}

async function synthesizeSpeech(text, modelKey = activeModelKey) {
  return synthesizeWithModel(modelKey || activeModelKey, text);
}

function getTtsCatalog() {
  const { isKokoroDownloading, pruneIncompleteKokoroCacheIfIdle } = require('./voice-kokoro');
  pruneIncompleteKokoroCacheIfIdle();
  return TTS_MODEL_CATALOG.map(entry => {
    const cacheBytes = entry.cloud ? 0 : getModelCacheBytes(entry.key);
    const state = getDownloadState(entry.key);
    const downloading = entry.cloud
      ? false
      : (entry.engine === 'kokoro' ? isKokoroDownloading() : state.inProgress);
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
    const { downloadKokoroEngine, isKokoroDownloading } = require('./voice-kokoro');
    if (isKokoroDownloading()) {
      return { success: false, error: 'Kokoro engine download already in progress.' };
    }
    downloadState.set(modelKey, { inProgress: true, cancelled: false });
    const result = await downloadKokoroEngine((payload) => {
      if (typeof sendProgress === 'function') {
        sendProgress({
          modelKey: entry.key,
          modelName: 'tts-kokoro-engine',
          ...payload
        });
      }
    });
    downloadState.set(modelKey, { inProgress: false, cancelled: false });
    if (result.success) saveActiveModelKey(entry.key);
    return { ...result, modelKey: entry.key };
  }

  const state = getDownloadState(modelKey);
  if (state.inProgress) {
    return { success: false, error: 'This voice model is already downloading.' };
  }

  downloadState.set(modelKey, { inProgress: true, cancelled: false });
  const emit = (payload) => {
    if (typeof sendProgress === 'function') {
      sendProgress({
        modelKey: entry.key,
        modelName: `tts-${entry.key}`,
        ...payload
      });
    }
  };

  emit({ phase: 'download', percent: 0, status: `Preparing ${entry.label}…` });

  let envRef = null;
  try {
    envRef = await configureTransformersEnv(modelKey, (data) => {
      const current = getDownloadState(modelKey);
      if (current.cancelled || !data) return;

      if (data.status === 'initiate') {
        emit({
          phase: 'download',
          percent: 0,
          status: `Fetching ${data.file || data.name || entry.label}…`
        });
        return;
      }

      if (data.status === 'progress' && data.total) {
        const percent = Math.min(99, Math.round((data.loaded / data.total) * 100));
        emit({
          phase: 'download',
          percent,
          downloaded: formatBytes(data.loaded),
          total: formatBytes(data.total),
          status: `Downloading ${entry.label}…`
        });
        return;
      }

      if (data.status === 'done' || data.status === 'ready') {
        emit({ phase: 'download', percent: 100, status: `Finalizing ${entry.label}…` });
      }
    });

    synthesizerPromises.delete(modelKey);
    await getSynthesizer(modelKey);

    if (entry.needsSpeakerEmbeddings) {
      emit({ phase: 'download', percent: 99, status: 'Loading speaker profile…' });
      await getSpeakerEmbeddings();
    }

    emit({ phase: 'complete', percent: 100, status: `${entry.label} ready.` });
    saveActiveModelKey(entry.key);
    return { success: true, installed: true, modelKey: entry.key };
  } catch (err) {
    synthesizerPromises.delete(modelKey);
    const current = getDownloadState(modelKey);
    if (current.cancelled) {
      return { success: false, cancelled: true, error: 'Download cancelled.' };
    }
    console.error('[voice-tts] download failed:', err);
    return { success: false, error: err.message || 'Neural voice download failed.' };
  } finally {
    downloadState.set(modelKey, { inProgress: false, cancelled: false });
    if (envRef) envRef.progress_callback = null;
  }
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
    synthesizerPromises.delete(modelKey);
    return { success: true, cancelled: true, modelKey };
  }

  for (const entry of TTS_MODEL_CATALOG) {
    const state = getDownloadState(entry.key);
    if (state.inProgress) {
      downloadState.set(entry.key, { inProgress: false, cancelled: true });
      synthesizerPromises.delete(entry.key);
      return { success: true, cancelled: true, modelKey: entry.key };
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
    const remainingKokoro = false;
    if (result.success) {
      if (activeModelKey === entry.key || TTS_MODEL_CATALOG.some(v => v.key === activeModelKey && v.engine === 'kokoro')) {
        const fallback = TTS_MODEL_CATALOG.find(item => item.key !== entry.key && isModelInstalled(item.key));
        saveActiveModelKey(fallback?.key || DEFAULT_TTS_MODEL_KEY);
      }
    }
    return { ...result, modelKey: entry.key };
  }

  synthesizerPromises.delete(entry.key);
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
  try {
    await getSynthesizer(entry.key);
    return { success: true, warmed: true };
  } catch (err) {
    return { success: false, error: err.message || 'TTS warmup failed.' };
  }
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
