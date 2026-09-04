const path = require('path');
const fs = require('fs');
const {
  getKokoroDevicePreference,
  forceKokoroDevice,
  primeOnnxRuntimeNode
} = require('./voice-kokoro-device');

// SAFETY: the native onnxruntime-node binding may only be loaded in ONE JS
// environment per process. Kokoro previously ran in a worker_threads Worker,
// but having native ORT alive in both the main thread and the worker crashes
// V8 with "FATAL ERROR: Cannot create a handle without a HandleScope".
// Kokoro therefore runs on the MAIN thread (like Whisper STT); ORT does its
// math on its own native thread pool, so this does not block the UI.

const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_ENGINE_KEY = 'kokoro-engine';
const KOKORO_MARKER = '.kokoro-installed';
/** q8 Kokoro ONNX is ~88–92 MB; reject partial downloads below this threshold. */
const KOKORO_MIN_MODEL_BYTES = 75 * 1024 * 1024;

let kokoroPromise = null;
let kokoroLoadedDevice = null;
let kokoroDownloadState = { inProgress: false, cancelled: false };
let transformersEnvConfigured = false;

function getKokoroCacheDir() {
  try {
    const { getOllamaModelsDir } = require('./paths');
    const modelsDir = getOllamaModelsDir();
    const cacheDir = path.join(modelsDir, 'tts-cache', KOKORO_ENGINE_KEY);
    fs.mkdirSync(cacheDir, { recursive: true });
    return cacheDir;
  } catch (e) {
    const fallback = path.join(process.cwd(), 'brown-local', 'models', 'tts-cache', KOKORO_ENGINE_KEY);
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function getKokoroDiagnostics() {
  const cacheDir = getKokoroCacheDir();
  let modelsDir = null;
  try {
    modelsDir = require('./paths').getOllamaModelsDir();
  } catch (e) {
    modelsDir = process.env.ULTRON_MODELS_DIR || process.env.OLLAMA_MODELS || null;
  }
  return {
    cacheDir,
    modelsDir,
    device: getKokoroDevicePreference(),
    cacheBytes: getKokoroCacheBytes(),
    modelPath: findKokoroModelOnnxPath()
  };
}

function walkDir(dir, matcher, results = []) {
  if (!dir || !fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkDir(full, matcher, results);
    else if (matcher(full)) results.push(full);
  }
  return results;
}

function getInstalledVoicesPath() {
  return path.join(getKokoroCacheDir(), 'installed-voices.json');
}

function loadInstalledVoices() {
  try {
    const p = getInstalledVoicesPath();
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (Array.isArray(data)) return data;
    }
  } catch (e) { /* ignore */ }
  return [];
}

function markVoiceInstalled(voiceId) {
  try {
    const voices = new Set(loadInstalledVoices());
    voices.add(voiceId);
    fs.mkdirSync(getKokoroCacheDir(), { recursive: true });
    fs.writeFileSync(getInstalledVoicesPath(), JSON.stringify([...voices], null, 2), 'utf8');
  } catch (e) { /* ignore */ }
}

function isKokoroVoiceInstalled(voiceId) {
  if (!isKokoroEngineInstalled()) return false;
  const installed = loadInstalledVoices();
  // If base engine is installed and installed list is empty, default voices are available
  if (installed.length === 0 && (voiceId === 'af_heart' || voiceId === 'am_michael')) {
    return true;
  }
  return installed.includes(voiceId);
}

function isValidOnnxModelFile(filePath, minBytes = 10 * 1024 * 1024) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size >= minBytes;
  } catch (e) {
    return false;
  }
}

function findKokoroModelOnnxPath() {
  const cacheDir = getKokoroCacheDir();
  if (!fs.existsSync(cacheDir)) return null;

  // 1. Direct onnx models in cache
  const preferred = walkDir(cacheDir, (fp) => /model_quantized\.onnx$|model_q8\.onnx$|model\.onnx$/i.test(fp));
  const validPreferred = preferred.find((fp) => isValidOnnxModelFile(fp));
  if (validPreferred) return validPreferred;

  // 2. Any onnx file >= 20MB in cache
  const allOnnx = walkDir(cacheDir, (fp) => /\.onnx$/i.test(fp));
  return allOnnx.find((fp) => isValidOnnxModelFile(fp, 20 * 1024 * 1024)) || null;
}

function getKokoroCacheBytes() {
  const cacheDir = getKokoroCacheDir();
  if (!fs.existsSync(cacheDir)) return 0;
  let total = 0;
  for (const filePath of walkDir(cacheDir, () => true)) {
    try {
      total += fs.statSync(filePath).size;
    } catch (e) { /* ignore */ }
  }
  return total;
}

function clearKokoroInstalledMarker() {
  const marker = path.join(getKokoroCacheDir(), KOKORO_MARKER);
  try {
    if (fs.existsSync(marker)) fs.unlinkSync(marker);
  } catch (e) { /* ignore */ }
}

function writeKokoroInstalledMarker() {
  const cacheDir = getKokoroCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  const modelPath = findKokoroModelOnnxPath();
  fs.writeFileSync(
    path.join(cacheDir, KOKORO_MARKER),
    JSON.stringify({
      modelId: KOKORO_MODEL_ID,
      modelPath,
      installedAt: new Date().toISOString()
    }, null, 2),
    'utf8'
  );
}

function removeIncompleteKokoroCache() {
  kokoroPromise = null;
  kokoroLoadedDevice = null;
  const cacheDir = getKokoroCacheDir();
  try {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
    }
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch (err) {
    // Windows: a live ORT session can keep files locked. Prune whatever we
    // can so the next attempt starts as clean as possible.
    console.warn('[voice-kokoro] full cache reset failed, pruning files:', err.message);
    for (const filePath of walkDir(cacheDir, () => true)) {
      try { fs.unlinkSync(filePath); } catch (e) { /* still locked */ }
    }
  }
}

function isKokoroEngineInstalled() {
  // Purely disk-based: a complete model on disk IS installed, even while a
  // (re)download is in progress. The download UI uses isKokoroDownloading().
  return Boolean(findKokoroModelOnnxPath());
}

/** True only when the full q8 ONNX model (>= ~75 MB) is present on disk. */
function hasCompleteKokoroModel() {
  const cacheDir = getKokoroCacheDir();
  if (!fs.existsSync(cacheDir)) return false;
  const preferred = walkDir(cacheDir, (fp) => /model_quantized\.onnx$|model_q8\.onnx$|model\.onnx$/i.test(fp));
  return preferred.some((fp) => isValidOnnxModelFile(fp, KOKORO_MIN_MODEL_BYTES));
}

function isKokoroDownloading() {
  return kokoroDownloadState.inProgress;
}

async function configureTransformersEnv() {
  if (transformersEnvConfigured) return;
  const cacheDir = getKokoroCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  process.env.TRANSFORMERS_CACHE = cacheDir;
  process.env.HF_HOME = cacheDir;

  primeOnnxRuntimeNode();
  transformersEnvConfigured = true;
}

/**
 * Load the Kokoro pipeline on the MAIN thread (single ORT environment).
 * Reloads when the requested device changes; falls back from GPU to CPU once.
 */
function getKokoroTts(onProgress) {
  const wanted = getKokoroDevicePreference();
  if (kokoroPromise && kokoroLoadedDevice === wanted) return kokoroPromise;

  kokoroLoadedDevice = wanted;
  kokoroPromise = (async () => {
    await configureTransformersEnv();
    const { KokoroTTS } = await import('kokoro-js');
    console.log(`[voice-kokoro] loading Kokoro with device=${wanted}`);
    try {
      return await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: 'q8',
        device: wanted,
        progress_callback: onProgress || null
      });
    } catch (err) {
      if (wanted !== 'cpu') {
        console.warn('[voice-kokoro] GPU load failed, falling back to CPU:', err.message);
        forceKokoroDevice('cpu');
        kokoroLoadedDevice = 'cpu';
        return KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
          dtype: 'q8',
          device: 'cpu',
          progress_callback: onProgress || null
        });
      }
      throw err;
    }
  })().catch((err) => {
    kokoroPromise = null;
    kokoroLoadedDevice = null;
    throw err;
  });
  return kokoroPromise;
}

function extractKokoroSamples(rawAudio) {
  if (!rawAudio) return new Float32Array(0);
  if (rawAudio instanceof Float32Array) return rawAudio;
  if (rawAudio.audio instanceof Float32Array) return rawAudio.audio;
  if (rawAudio.data instanceof Float32Array) return rawAudio.data;
  if (Array.isArray(rawAudio.audio)) return new Float32Array(rawAudio.audio);
  if (Array.isArray(rawAudio.data)) return new Float32Array(rawAudio.data);
  return new Float32Array(0);
}

function rawAudioToWavBuffer(rawAudio, sampleRate = 24000) {
  const samples = extractKokoroSamples(rawAudio);
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

function mergeKokoroAudioSegments(segments) {
  const parts = (segments || []).map(extractKokoroSamples);
  const total = parts.reduce((n, data) => n + data.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const data of parts) {
    merged.set(data, offset);
    offset += data.length;
  }
  return merged;
}

function splitKokoroTextParts(text, maxLen = 400) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];
  const parts = [];
  let rest = cleaned;
  while (rest.length > 0) {
    if (rest.length <= maxLen) {
      parts.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(' ', maxLen);
    if (cut < 80) cut = maxLen;
    parts.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return parts.filter(Boolean);
}

async function downloadKokoroEngine(sendProgress) {
  if (kokoroDownloadState.inProgress) {
    return { success: false, error: 'Kokoro engine download already in progress.' };
  }

  kokoroDownloadState = { inProgress: true, cancelled: false };
  const emit = (payload) => {
    if (typeof sendProgress === 'function') sendProgress(payload);
  };

  emit({ phase: 'download', percent: 0, status: 'Preparing Kokoro neural engine…' });
  clearKokoroInstalledMarker();
  // Ensure cache lives under resolved modelsDir (post applyStoragePaths) before HF download.
  const cacheDir = getKokoroCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  // Never destroy a complete download: only reset when the model is missing
  // or partial.
  if (!hasCompleteKokoroModel()) {
    removeIncompleteKokoroCache();
  }

  try {
    kokoroPromise = null;
    kokoroLoadedDevice = null;
    await getKokoroTts((data) => {
      if (kokoroDownloadState.cancelled || !data) return;
      if (data.status === 'progress' && data.total) {
        const percent = Math.min(95, Math.round((data.loaded / data.total) * 100));
        emit({
          phase: 'download',
          percent,
          downloaded: `${(data.loaded / (1024 * 1024)).toFixed(1)} MB`,
          total: `${(data.total / (1024 * 1024)).toFixed(1)} MB`,
          status: 'Downloading Kokoro engine…'
        });
      } else if (data.status === 'initiate') {
        emit({ phase: 'download', percent: 0, status: `Fetching ${data.file || data.name || 'Kokoro'}…` });
      }
    });

    if (kokoroDownloadState.cancelled) {
      if (!hasCompleteKokoroModel()) removeIncompleteKokoroCache();
      return { success: false, cancelled: true, error: 'Download cancelled.' };
    }

    const modelPath = findKokoroModelOnnxPath();
    if (!modelPath || !isValidOnnxModelFile(modelPath, KOKORO_MIN_MODEL_BYTES)) {
      removeIncompleteKokoroCache();
      const diag = getKokoroDiagnostics();
      console.error('[voice-kokoro] incomplete ONNX after download:', diag);
      return {
        success: false,
        error: 'Kokoro download finished but the ONNX model file is incomplete. Please retry the download.',
        diagnostics: diag
      };
    }

    // The complete model is on disk — persist the install BEFORE any
    // verification so a failed warmup can never delete a good download.
    writeKokoroInstalledMarker();

    emit({ phase: 'download', percent: 96, status: 'Verifying Kokoro engine…' });
    try {
      const warmup = await warmupKokoroEngine(60000);
      if (!warmup.success) {
        console.warn('[voice-kokoro] post-install warmup failed (non-fatal):', warmup.error);
      }
    } catch (warmupErr) {
      console.warn('[voice-kokoro] post-install warmup errored (non-fatal):', warmupErr.message);
    }

    emit({ phase: 'complete', percent: 100, status: 'Kokoro engine ready.' });
    return { success: true, installed: true };
  } catch (err) {
    kokoroPromise = null;
    kokoroLoadedDevice = null;
    if (!hasCompleteKokoroModel()) removeIncompleteKokoroCache();
    if (kokoroDownloadState.cancelled) {
      return { success: false, cancelled: true, error: 'Download cancelled.' };
    }
    const diag = getKokoroDiagnostics();
    console.error('[voice-kokoro] download failed:', err.message || err, diag);
    const baseMsg = err.message || 'Kokoro download failed.';
    return {
      success: false,
      error: `${baseMsg} (device: ${diag.device}, cache: ${diag.cacheDir})`,
      diagnostics: diag
    };
  } finally {
    kokoroDownloadState = { inProgress: false, cancelled: false };
  }
}

async function downloadKokoroVoice(voiceId = 'af_heart', sendProgress) {
  const result = await downloadKokoroEngine(sendProgress);
  if (!result.success) return result;

  try {
    // Warm up and cache this specific voice embedding
    const warm = await synthesizeKokoroSpeech('Hello, voice ready.', voiceId);
    if (!warm.success) {
      console.warn('[voice-kokoro] voice warmup failed (non-fatal):', warm.error);
    }
    markVoiceInstalled(voiceId);
    return { success: true, installed: true, voiceId };
  } catch (err) {
    // Still mark installed if base engine is ready
    markVoiceInstalled(voiceId);
    return { success: true, installed: true, voiceId };
  }
}

async function downloadKokoroOnboardingDefaults(sendProgress) {
  const emit = (payload) => {
    if (typeof sendProgress === 'function') sendProgress(payload);
  };

  emit({ phase: 'download', percent: 10, status: 'Downloading Kokoro neural engine…' });
  const baseResult = await downloadKokoroEngine(sendProgress);
  if (!baseResult.success) return baseResult;

  emit({ phase: 'download', percent: 90, status: 'Setting up Heart & Michael voice models…' });
  try {
    await synthesizeKokoroSpeech('Hello', 'af_heart');
    markVoiceInstalled('af_heart');
  } catch (e) {
    markVoiceInstalled('af_heart');
  }

  try {
    await synthesizeKokoroSpeech('Hello', 'am_michael');
    markVoiceInstalled('am_michael');
  } catch (e) {
    markVoiceInstalled('am_michael');
  }

  emit({ phase: 'complete', percent: 100, status: 'Kokoro neural voices ready (Heart & Michael).' });
  return { success: true, installed: true, voices: ['af_heart', 'am_michael'] };
}

async function warmupKokoroEngine(timeoutMs = 180000) {
  if (!isKokoroEngineInstalled()) {
    return { success: false, error: 'Kokoro engine not installed.' };
  }
  let timer = null;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Kokoro warmup timed out.')), timeoutMs);
    });
    const load = getKokoroTts();
    const tts = await Promise.race([load, timeout]);
    // One tiny utterance warms the ORT session + voice embedding paths.
    await Promise.race([tts.generate('Warm.', { voice: 'af_heart', speed: 1 }), timeout]);
    return { success: true, warmed: true };
  } catch (err) {
    kokoroPromise = null;
    kokoroLoadedDevice = null;
    return { success: false, error: err.message || 'Kokoro warmup failed.' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function cancelKokoroDownload() {
  if (!kokoroDownloadState.inProgress) {
    return { success: false, error: 'No Kokoro download in progress.' };
  }
  kokoroDownloadState.cancelled = true;
  return { success: true, cancelled: true };
}

function deleteKokoroEngine() {
  if (kokoroDownloadState.inProgress) {
    return { success: false, error: 'Cannot remove Kokoro while downloading.' };
  }
  removeIncompleteKokoroCache();
  return { success: true };
}

async function synthesizeKokoroSpeech(text, voiceId = 'af_heart') {
  if (!isKokoroEngineInstalled()) {
    return {
      success: false,
      error: 'Kokoro engine not installed. Download any Kokoro voice in Settings → Agent Sounds.',
      needsDownload: true
    };
  }

  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { success: false, error: 'No text to speak.' };

  try {
    const tts = await getKokoroTts();
    const parts = splitKokoroTextParts(cleaned);
    const segments = [];
    for (const part of parts) {
      const seg = await tts.generate(part, { voice: voiceId, speed: 1 });
      if (extractKokoroSamples(seg).length < 1) {
        throw new Error('Kokoro returned empty audio.');
      }
      segments.push(seg);
    }

    const merged = mergeKokoroAudioSegments(segments);
    const wavBuffer = rawAudioToWavBuffer(merged, 24000);
    return {
      success: true,
      wavBase64: wavBuffer.toString('base64'),
      sampleRate: 24000,
      mimeType: 'audio/wav',
      engine: 'kokoro',
      voiceId,
      device: kokoroLoadedDevice || getKokoroDevicePreference()
    };
  } catch (err) {
    const msg = err.message || '';

    if (/system error number 13|permission denied|Load model from/i.test(msg)) {
      clearKokoroInstalledMarker();
      return {
        success: false,
        error: 'Kokoro model file is corrupted or incomplete. Remove it in Settings → Agent Sounds and download again.',
        needsDownload: true
      };
    }

    console.error('[voice-kokoro] synthesize error:', msg);
    return { success: false, error: msg || 'Kokoro speech synthesis failed.' };
  }
}

module.exports = {
  KOKORO_ENGINE_KEY,
  KOKORO_MODEL_ID,
  getKokoroCacheDir,
  getKokoroCacheBytes,
  getKokoroDiagnostics,
  isKokoroEngineInstalled,
  isKokoroVoiceInstalled,
  markVoiceInstalled,
  isKokoroDownloading,
  downloadKokoroEngine,
  downloadKokoroVoice,
  downloadKokoroOnboardingDefaults,
  warmupKokoroEngine,
  cancelKokoroDownload,
  deleteKokoroEngine,
  synthesizeKokoroSpeech
};
