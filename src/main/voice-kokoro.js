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
// Kokoro inference runs in a dedicated utility process, keeping tokenization,
// native model loading and audio conversion away from the window's event loop.

const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_ENGINE_KEY = 'kokoro-engine';
const KOKORO_MARKER = '.kokoro-installed';
/** q8 Kokoro ONNX is ~88–92 MB; reject partial downloads below this threshold. */
const KOKORO_MIN_MODEL_BYTES = 75 * 1024 * 1024;
/** Voices shipped inside the installer — no per-voice download needed. */
const KOKORO_BUNDLED_VOICES = ['af_heart', 'am_michael', 'bm_george', 'bm_lewis'];

let kokoroPromise = null;
let kokoroLoadedDevice = null;
let kokoroDownloadState = { inProgress: false, cancelled: false };
let transformersEnvConfigured = false;
let kokoroModelPathCache;
let kokoroVoiceFilesReady = false;

/** Model layout on disk only changes on install/reset, so the walk is cached. */
function invalidateKokoroModelPathCache() {
  kokoroModelPathCache = undefined;
}

function getKokoroCacheDir() {
  if (process.env.BROWN_KOKORO_WORKER === '1' && process.env.BROWN_KOKORO_CACHE_DIR) {
    return process.env.BROWN_KOKORO_CACHE_DIR;
  }
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
  if (KOKORO_BUNDLED_VOICES.includes(voiceId)) return true;
  return loadInstalledVoices().includes(voiceId);
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
  // Recheck cached files and rescan misses: another process may finish installing
  // the engine after settings first checks it. A cached miss must not require restart.
  if (kokoroModelPathCache && isValidOnnxModelFile(kokoroModelPathCache, KOKORO_MIN_MODEL_BYTES)) return kokoroModelPathCache;
  const cacheDir = getKokoroCacheDir();
  if (!fs.existsSync(cacheDir)) {
    kokoroModelPathCache = null;
    return null;
  }

  // Only accept a complete q8 ONNX (>= ~75 MB). Partial files must not look installed.
  const preferred = walkDir(cacheDir, (fp) => /model_quantized\.onnx$|model_q8\.onnx$|model\.onnx$/i.test(fp));
  const validPreferred = preferred.find((fp) => isValidOnnxModelFile(fp, KOKORO_MIN_MODEL_BYTES));
  if (validPreferred) {
    kokoroModelPathCache = validPreferred;
    return validPreferred;
  }

  const allOnnx = walkDir(cacheDir, (fp) => /\.onnx$/i.test(fp));
  kokoroModelPathCache = allOnnx.find((fp) => isValidOnnxModelFile(fp, KOKORO_MIN_MODEL_BYTES)) || null;
  return kokoroModelPathCache;
}

/**
 * Older builds downloaded into transformers' default .cache or the Whisper
 * STT cache. Copy a complete model into the Kokoro cache if we find one.
 */
function migrateStrayKokoroModel() {
  if (hasCompleteKokoroModel()) return false;

  const searchRoots = [];
  try {
    const transformersPkg = require.resolve('@huggingface/transformers/package.json');
    searchRoots.push(path.join(path.dirname(transformersPkg), '.cache'));
  } catch (e) { /* ignore */ }
  try {
    const { getOllamaModelsDir } = require('./paths');
    searchRoots.push(path.join(getOllamaModelsDir(), 'tts-cache', 'stt-whisper'));
  } catch (e) { /* ignore */ }

  const destRoot = getKokoroCacheDir();
  for (const root of searchRoots) {
    if (!root || !fs.existsSync(root)) continue;
    const matches = walkDir(root, (fp) =>
      /Kokoro/i.test(fp) && /model_quantized\.onnx$|model_q8\.onnx$|model\.onnx$/i.test(fp)
    );
    const source = matches.find((fp) => isValidOnnxModelFile(fp, KOKORO_MIN_MODEL_BYTES));
    if (!source) continue;

    try {
      // HF layout: .../<model-id>/onnx/model_quantized.onnx
      const onnxDir = path.dirname(source);
      const modelRoot = path.dirname(onnxDir);
      const destModelRoot = path.join(destRoot, 'models', path.basename(modelRoot));
      for (const filePath of walkDir(modelRoot, () => true)) {
        const relPath = path.relative(modelRoot, filePath);
        const outPath = path.join(destModelRoot, relPath);
        if (fs.existsSync(outPath)) continue;
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        try { fs.copyFileSync(filePath, outPath); } catch (e) { /* ignore locked */ }
      }
      console.log('[voice-kokoro] migrated stray Kokoro cache from', modelRoot, 'to', destModelRoot);
      invalidateKokoroModelPathCache();
      return hasCompleteKokoroModel();
    } catch (err) {
      console.warn('[voice-kokoro] stray model migrate failed:', err.message);
    }
  }
  return false;
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
  invalidateKokoroModelPathCache();
}

function removeIncompleteKokoroCache() {
  kokoroPromise = null;
  kokoroLoadedDevice = null;
  invalidateKokoroModelPathCache();
  kokoroVoiceFilesReady = false;
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
  const cacheDir = getKokoroCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  // Transformers.js v3 does not honor TRANSFORMERS_CACHE / HF_HOME alone —
  // env.cacheDir must be set explicitly (same pattern as Whisper STT).
  // Always re-apply: Whisper (or another caller) may have overwritten the global.
  process.env.TRANSFORMERS_CACHE = cacheDir;
  process.env.HF_HOME = cacheDir;

  const transformers = await import('@huggingface/transformers');
  transformers.env.cacheDir = cacheDir;
  transformers.env.useFSCache = true;
  transformers.env.allowLocalModels = true;
  if ('useBrowserCache' in transformers.env) {
    transformers.env.useBrowserCache = false;
  }

  if (!transformersEnvConfigured) {
    primeOnnxRuntimeNode();
    transformersEnvConfigured = true;
  }
}

/**
 * Load the Kokoro pipeline inside the dedicated speech process.
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
  const pcm = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const s = samples[i];
    pcm[i] = s >= 1 ? 32767 : s <= -1 ? -32768 : (s * 32767) | 0;
  }

  const buffer = Buffer.allocUnsafe(44 + pcm.byteLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + pcm.byteLength, 4);
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
  buffer.writeUInt32LE(pcm.byteLength, 40);
  new Uint8Array(buffer.buffer, buffer.byteOffset + 44, pcm.byteLength).set(
    new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  );
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

let kokoroDownloadPromise = null;

async function runKokoroEngineDownload(sendProgress) {
  kokoroDownloadState = { inProgress: true, cancelled: false };
  const emit = (payload) => {
    if (typeof sendProgress === 'function') sendProgress(payload);
  };

  emit({ phase: 'download', percent: 0, status: 'Preparing Kokoro neural engine…' });
  clearKokoroInstalledMarker();
  // Ensure cache lives under resolved modelsDir (post applyStoragePaths) before HF download.
  const cacheDir = getKokoroCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  // Completed files from earlier attempts are reused by the transformers cache,
  // so a flaky network resumes instead of restarting from zero.

  const onLoadProgress = (data) => {
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
  };

  try {
    const MAX_ATTEMPTS = 3;
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      lastErr = null;
      kokoroPromise = null;
      kokoroLoadedDevice = null;
      invalidateKokoroModelPathCache();
      try {
        await getKokoroTts(onLoadProgress);
      } catch (err) {
        lastErr = err;
      }
      if (!lastErr || kokoroDownloadState.cancelled || hasCompleteKokoroModel()) break;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`[voice-kokoro] download attempt ${attempt} failed, retrying:`, lastErr.message || lastErr);
        emit({
          phase: 'download',
          percent: 2,
          status: `Network hiccup — retrying Kokoro download (attempt ${attempt + 1} of ${MAX_ATTEMPTS})…`
        });
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    }
    // A load error with a complete model on disk still counts as installed;
    // synthesis will surface any real runtime problem.
    if (lastErr && !hasCompleteKokoroModel()) throw lastErr;

    if (kokoroDownloadState.cancelled) {
      return { success: false, cancelled: true, error: 'Download cancelled.' };
    }

    const modelPath = findKokoroModelOnnxPath();
    if (!modelPath || !isValidOnnxModelFile(modelPath, KOKORO_MIN_MODEL_BYTES)) {
      // Recover from older builds that wrote into the wrong transformers cache.
      migrateStrayKokoroModel();
    }
    const verifiedPath = findKokoroModelOnnxPath();
    if (!verifiedPath || !isValidOnnxModelFile(verifiedPath, KOKORO_MIN_MODEL_BYTES)) {
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

function downloadKokoroEngine(sendProgress) {
  // Single shared in-flight download: auto-start, a second card click, or a
  // settings download racing onboarding all await the same attempt.
  if (kokoroDownloadPromise) return kokoroDownloadPromise;
  kokoroDownloadPromise = runKokoroEngineDownload(sendProgress);
  kokoroDownloadPromise.catch(() => {}).then(() => { kokoroDownloadPromise = null; });
  return kokoroDownloadPromise;
}

async function downloadKokoroVoice(voiceId = 'af_heart', sendProgress) {
  if (!isKokoroEngineInstalled()) return { success: false, error: 'Install the shared Kokoro engine first.' };

  try {
    // Warm up and cache this specific voice embedding
    const warm = await synthesizeKokoroSpeech('Hello, voice ready.', voiceId);
    if (!warm.success) {
      return { success: false, error: warm.error || 'Could not initialize this voice. Retry without reinstalling the engine.' };
    }
    markVoiceInstalled(voiceId);
    return { success: true, installed: true, voiceId };
  } catch (err) {
    return { success: false, error: err.message || 'Could not initialize this voice.' };
  }
}

const ONBOARDING_DEFAULT_VOICES = ['bm_george', 'af_heart'];

async function downloadKokoroOnboardingDefaults(sendProgress, voiceIds) {
  const ids = Array.isArray(voiceIds) && voiceIds.length ? voiceIds : ONBOARDING_DEFAULT_VOICES;
  const emit = (payload) => {
    if (typeof sendProgress === 'function') sendProgress(payload);
  };

  emit({ phase: 'download', percent: 10, status: 'Downloading Kokoro neural engine…' });
  const baseResult = await downloadKokoroEngine(sendProgress);
  if (!baseResult.success) return baseResult;

  emit({ phase: 'download', percent: 90, status: 'Setting up neural voices…' });
  for (const id of ids) {
    try {
      await synthesizeKokoroSpeech('Hello', id);
    } catch (e) {
      console.warn(`[voice-kokoro] onboarding voice warmup failed (non-fatal): ${id}`);
    }
    markVoiceInstalled(id);
  }

  emit({ phase: 'complete', percent: 100, status: 'Kokoro neural voices ready.' });
  return { success: true, installed: true, voices: ids };
}

async function warmupKokoroEngine(timeoutMs = 180000) {
  if (process.env.BROWN_KOKORO_WORKER !== '1') {
    return require('./voice-kokoro-process').runKokoroJob('warmupKokoroEngine', [timeoutMs], getKokoroCacheDir(), timeoutMs + 1000);
  }
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

function ensureKokoroVoiceFiles() {
  if (kokoroVoiceFilesReady) return;
  try {
    let voicesSrcDir = null;
    try {
      const kokoroPkg = require.resolve('kokoro-js');
      voicesSrcDir = path.join(path.dirname(kokoroPkg), '..', 'voices');
    } catch (e) { /* ignore */ }

    if (!voicesSrcDir || !fs.existsSync(voicesSrcDir)) {
      kokoroVoiceFilesReady = true;
      return;
    }
    const voiceFiles = fs.readdirSync(voicesSrcDir).filter((f) => f.endsWith('.bin'));
    if (!voiceFiles.length) {
      kokoroVoiceFilesReady = true;
      return;
    }

    const targets = new Set();
    try {
      const cwdRoot = path.parse(process.cwd()).root;
      if (cwdRoot) targets.add(path.join(cwdRoot, 'voices'));
    } catch (e) { /* ignore */ }
    try {
      const dirRoot = path.parse(__dirname).root;
      if (dirRoot) targets.add(path.join(dirRoot, 'voices'));
    } catch (e) { /* ignore */ }
    targets.add(path.join(process.cwd(), 'voices'));
    targets.add(path.join(getKokoroCacheDir(), 'voices'));

    for (const targetDir of targets) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        for (const file of voiceFiles) {
          const dest = path.join(targetDir, file);
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(path.join(voicesSrcDir, file), dest);
          }
        }
      } catch (e) { /* ignore */ }
    }
    kokoroVoiceFilesReady = true;
  } catch (err) {
    console.warn('[voice-kokoro] ensureKokoroVoiceFiles warning:', err.message);
  }
}

try {
  ensureKokoroVoiceFiles();
} catch (e) { /* ignore */ }

async function synthesizeKokoroSpeech(text, voiceId = 'af_heart', { speed = 1 } = {}) {
  if (process.env.BROWN_KOKORO_WORKER !== '1') {
    const budget = Math.min(180000, 25000 + String(text || '').length * 60);
    return require('./voice-kokoro-process').runKokoroJob('synthesizeKokoroSpeech', [text, voiceId, { speed }], getKokoroCacheDir(), budget + 1000);
  }
  const speechRate = Number.isFinite(Number(speed)) ? Math.max(0.5, Math.min(2, Number(speed))) : 1;
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
    ensureKokoroVoiceFiles();
    const synthPromise = (async () => {
      const tts = await getKokoroTts();
      const parts = splitKokoroTextParts(cleaned);
      const segments = [];
      for (const part of parts) {
        const seg = await tts.generate(part, { voice: voiceId, speed: speechRate });
        if (extractKokoroSamples(seg).length < 1) {
          throw new Error('Kokoro returned empty audio.');
        }
        segments.push(seg);
        // Kokoro runs on the main thread: hand the event loop back between
        // sentences so window input, IPC and timers keep flowing.
        await new Promise((yieldLoop) => setImmediate(yieldLoop));
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
    })();

    // CPU synthesis is slower than the old 5s guess, so the budget scales with
    // the text instead of cutting off long answers mid-sentence.
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Kokoro synthesis timed out.')),
        Math.min(180000, 25000 + cleaned.length * 60)
      );
    });

    try {
      return await Promise.race([synthPromise, timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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
  synthesizeKokoroSpeech,
  ensureKokoroVoiceFiles
};
