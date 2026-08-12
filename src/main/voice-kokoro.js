const path = require('path');
const fs = require('fs');
const { Worker } = require('worker_threads');
const {
  getKokoroDevicePreference,
  forceKokoroDevice,
  primeOnnxRuntimeNode
} = require('./voice-kokoro-device');

const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_ENGINE_KEY = 'kokoro-engine';
const KOKORO_MARKER = '.kokoro-installed';
/** q8 Kokoro ONNX is ~88–92 MB; reject partial downloads below this threshold. */
const KOKORO_MIN_MODEL_BYTES = 75 * 1024 * 1024;

let kokoroPromise = null;
let kokoroDownloadState = { inProgress: false, cancelled: false };
let transformersEnvConfigured = false;
let kokoroWorker = null;
let kokoroWorkerJobId = 0;
const kokoroWorkerJobs = new Map();
let kokoroWorkerChain = Promise.resolve();

function rejectAllWorkerJobs(err) {
  for (const [, job] of kokoroWorkerJobs) {
    clearTimeout(job.timer);
    job.reject(err);
  }
  kokoroWorkerJobs.clear();
}

function terminateKokoroWorker(reason) {
  if (!kokoroWorker) return;
  const worker = kokoroWorker;
  kokoroWorker = null;
  rejectAllWorkerJobs(new Error(reason || 'Kokoro worker terminated.'));
  try {
    worker.terminate();
  } catch (e) {
    /* ignore */
  }
}

function getKokoroWorker() {
  if (!kokoroWorker) {
    kokoroWorker = new Worker(path.join(__dirname, 'voice-kokoro-worker.js'));
    kokoroWorker.on('message', (msg) => {
      const job = kokoroWorkerJobs.get(msg.id);
      if (!job) return;
      kokoroWorkerJobs.delete(msg.id);
      clearTimeout(job.timer);
      if (msg.success) job.resolve(msg.result || msg);
      else job.reject(new Error(msg.error || 'Kokoro worker failed.'));
    });
    kokoroWorker.on('error', (err) => {
      console.error('[voice-kokoro] worker error:', err);
      kokoroWorker = null;
      rejectAllWorkerJobs(err);
    });
    kokoroWorker.on('exit', (code) => {
      if (kokoroWorker) {
        console.warn('[voice-kokoro] worker exited unexpectedly:', code);
        kokoroWorker = null;
        rejectAllWorkerJobs(new Error(`Kokoro worker exited with code ${code}.`));
      }
    });
  }
  return kokoroWorker;
}

function runKokoroWorkerTask(type, payload = {}, timeoutMs = 180000) {
  const execute = () => new Promise((resolve, reject) => {
    const id = ++kokoroWorkerJobId;
    const timer = setTimeout(() => {
      if (!kokoroWorkerJobs.has(id)) return;
      kokoroWorkerJobs.delete(id);
      terminateKokoroWorker('Kokoro synthesis timed out.');
      reject(new Error('Kokoro synthesis timed out.'));
    }, timeoutMs);
    kokoroWorkerJobs.set(id, { resolve, reject, timer });
    try {
      getKokoroWorker().postMessage({
        id,
        type,
        cacheDir: getKokoroCacheDir(),
        ...payload,
        device: payload.device || getKokoroDevicePreference()
      });
    } catch (err) {
      clearTimeout(timer);
      kokoroWorkerJobs.delete(id);
      reject(err);
    }
  });

  const task = kokoroWorkerChain.then(execute, execute);
  kokoroWorkerChain = task.catch(() => {});
  return task;
}

function getKokoroCacheDir() {
  try {
    const { getOllamaModelsDir } = require('./paths');
    return path.join(getOllamaModelsDir(), 'tts-cache', KOKORO_ENGINE_KEY);
  } catch (e) {
    const fallback = path.join(process.cwd(), 'Ultron-local', 'models', 'tts-cache', KOKORO_ENGINE_KEY);
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
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

function isValidOnnxModelFile(filePath, minBytes = KOKORO_MIN_MODEL_BYTES) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size >= minBytes;
  } catch (e) {
    return false;
  }
}

function findKokoroModelOnnxPath() {
  const cacheDir = getKokoroCacheDir();
  const preferred = walkDir(cacheDir, (fp) => /model_quantized\.onnx$/i.test(fp));
  const validPreferred = preferred.find((fp) => isValidOnnxModelFile(fp));
  if (validPreferred) return validPreferred;

  const kokoroNamed = walkDir(cacheDir, (fp) => /\.onnx$/i.test(fp) && /kokoro/i.test(fp));
  return kokoroNamed.find((fp) => isValidOnnxModelFile(fp)) || null;
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
  terminateKokoroWorker('Clearing incomplete Kokoro cache.');
  const cacheDir = getKokoroCacheDir();
  try {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch (err) {
    console.warn('[voice-kokoro] could not reset cache dir:', err.message);
  }
}

function isKokoroEngineInstalled() {
  if (kokoroDownloadState.inProgress) return false;
  return Boolean(findKokoroModelOnnxPath());
}

function pruneIncompleteKokoroCacheIfIdle() {
  if (kokoroDownloadState.inProgress) return;
  if (isKokoroEngineInstalled()) return;
  if (getKokoroCacheBytes() > 0) {
    removeIncompleteKokoroCache();
  }
}

function isKokoroDownloading() {
  return kokoroDownloadState.inProgress;
}

async function configureTransformersEnv() {
  const cacheDir = getKokoroCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  process.env.TRANSFORMERS_CACHE = cacheDir;
  process.env.HF_HOME = cacheDir;

  primeOnnxRuntimeNode();
  const transformers = await import('@huggingface/transformers');
  transformers.env.cacheDir = cacheDir;
  transformers.env.useFSCache = true;
  transformers.env.allowLocalModels = true;
  transformersEnvConfigured = true;
  return transformers;
}

async function loadKokoroModule() {
  await configureTransformersEnv();
  return import('kokoro-js');
}

async function getKokoroTts(onProgress) {
  if (!kokoroPromise) {
    kokoroPromise = (async () => {
      await configureTransformersEnv();
      const device = getKokoroDevicePreference();
      const { KokoroTTS } = await loadKokoroModule();
      console.log(`[voice-kokoro] loading Kokoro with device=${device}`);
      return KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: 'q8',
        device,
        progress_callback: onProgress || null
      });
    })();
  }
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
  if (!isKokoroEngineInstalled()) {
    removeIncompleteKokoroCache();
  }

  try {
    kokoroPromise = null;
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
      removeIncompleteKokoroCache();
      return { success: false, cancelled: true, error: 'Download cancelled.' };
    }

    const modelPath = findKokoroModelOnnxPath();
    if (!modelPath) {
      removeIncompleteKokoroCache();
      return {
        success: false,
        error: 'Kokoro download finished but the ONNX model file is incomplete. Please retry the download.'
      };
    }

    emit({ phase: 'download', percent: 96, status: 'Verifying Kokoro engine…' });
    const warmup = await warmupKokoroEngine();
    if (!warmup.success) {
      removeIncompleteKokoroCache();
      return {
        success: false,
        error: warmup.error || 'Kokoro engine verification failed. Please retry the download.'
      };
    }

    writeKokoroInstalledMarker();
    emit({ phase: 'complete', percent: 100, status: 'Kokoro engine ready.' });
    return { success: true, installed: true };
  } catch (err) {
    kokoroPromise = null;
    removeIncompleteKokoroCache();
    if (kokoroDownloadState.cancelled) {
      return { success: false, cancelled: true, error: 'Download cancelled.' };
    }
    console.error('[voice-kokoro] download failed:', err);
    return { success: false, error: err.message || 'Kokoro download failed.' };
  } finally {
    kokoroDownloadState = { inProgress: false, cancelled: false };
  }
}

async function warmupKokoroEngine() {
  if (!isKokoroEngineInstalled()) {
    return { success: false, error: 'Kokoro engine not installed.' };
  }
  try {
    await runKokoroWorkerTask('warmup');
    return { success: true, warmed: true };
  } catch (err) {
    kokoroWorker = null;
    return { success: false, error: err.message || 'Kokoro warmup failed.' };
  }
}

function cancelKokoroDownload() {
  if (!kokoroDownloadState.inProgress) {
    return { success: false, error: 'No Kokoro download in progress.' };
  }
  kokoroDownloadState.cancelled = true;
  kokoroPromise = null;
  setTimeout(() => {
    if (!kokoroDownloadState.inProgress) removeIncompleteKokoroCache();
  }, 500);
  return { success: true, cancelled: true };
}

function deleteKokoroEngine() {
  if (kokoroDownloadState.inProgress) {
    return { success: false, error: 'Cannot remove Kokoro while downloading.' };
  }
  removeIncompleteKokoroCache();
  return { success: true };
}

async function synthesizeKokoroSpeech(text, voiceId = 'af_bella') {
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
    return await runKokoroWorkerTask('synthesize', {
      text: cleaned,
      voiceId,
      device: getKokoroDevicePreference()
    });
  } catch (err) {
    const msg = err.message || '';
    const canRetryCpu = getKokoroDevicePreference() !== 'cpu'
      || /timed out|exited|terminated|GPU|dml|cuda/i.test(msg);

    if (canRetryCpu && getKokoroDevicePreference() !== 'cpu') {
      console.warn('[voice-kokoro] worker failed on GPU path, retrying on CPU:', msg);
      forceKokoroDevice('cpu');
      terminateKokoroWorker('Restarting Kokoro worker on CPU.');
      try {
        return await runKokoroWorkerTask('synthesize', {
          text: cleaned,
          voiceId,
          device: 'cpu'
        });
      } catch (cpuErr) {
        console.error('[voice-kokoro] CPU worker synth failed:', cpuErr.message);
        return { success: false, error: cpuErr.message || 'Kokoro speech synthesis failed.' };
      }
    }

    if (/timed out/i.test(msg)) {
      console.warn('[voice-kokoro] worker timed out, retrying once on fresh CPU worker');
      forceKokoroDevice('cpu');
      try {
        return await runKokoroWorkerTask('synthesize', {
          text: cleaned,
          voiceId,
          device: 'cpu'
        });
      } catch (retryErr) {
        console.error('[voice-kokoro] synthesize retry failed:', retryErr.message);
        return { success: false, error: retryErr.message || 'Kokoro speech synthesis failed.' };
      }
    }

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
  isKokoroEngineInstalled,
  isKokoroDownloading,
  pruneIncompleteKokoroCacheIfIdle,
  downloadKokoroEngine,
  warmupKokoroEngine,
  cancelKokoroDownload,
  deleteKokoroEngine,
  synthesizeKokoroSpeech
};
