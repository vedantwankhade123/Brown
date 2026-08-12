const path = require('path');
const fs = require('fs');

const VOICE_MODEL_ID = 'Xenova/whisper-tiny.en';
const VOICE_MODEL_KEY = 'voice-whisper-tiny';
const VOICE_MODEL_LABEL = 'Whisper Tiny (English)';
const VOICE_MODEL_SIZE_EST = '~40 MB';
const WHISPER_MIN_MODEL_BYTES = 30 * 1024 * 1024;

let transcriberPromise = null;
let transformersPromise = null;
let downloadInProgress = false;
let downloadCancelled = false;

async function loadTransformers() {
  if (!transformersPromise) {
    transformersPromise = import('@xenova/transformers');
  }
  return transformersPromise;
}

function getWhisperCacheDir() {
  try {
    const { getOllamaModelsDir } = require('./paths');
    return path.join(getOllamaModelsDir(), 'whisper-cache');
  } catch (e) {
    const fallback = path.join(process.cwd(), 'Ultron-local', 'models', 'whisper-cache');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
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

function isValidWhisperOnnxFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size >= WHISPER_MIN_MODEL_BYTES;
  } catch (e) {
    return false;
  }
}

function findWhisperModelOnnxPath() {
  const cacheDir = getWhisperCacheDir();
  const preferred = walkDir(cacheDir, (filePath) => /model_quantized\.onnx$/i.test(filePath));
  const validPreferred = preferred.find((fp) => isValidWhisperOnnxFile(fp));
  if (validPreferred) return validPreferred;
  const anyOnnx = walkDir(cacheDir, (filePath) => /\.onnx$/i.test(filePath));
  return anyOnnx.find((fp) => isValidWhisperOnnxFile(fp)) || null;
}

function isVoiceModelInstalled() {
  if (downloadInProgress) return false;
  return Boolean(findWhisperModelOnnxPath());
}

function getVoiceModelStatus() {
  const cacheDir = getWhisperCacheDir();
  const installed = isVoiceModelInstalled();
  let cacheBytes = 0;
  if (fs.existsSync(cacheDir)) {
    for (const filePath of walkDir(cacheDir, () => true)) {
      try {
        cacheBytes += fs.statSync(filePath).size;
      } catch (e) { /* ignore */ }
    }
  }
  return {
    modelKey: VOICE_MODEL_KEY,
    modelId: VOICE_MODEL_ID,
    label: VOICE_MODEL_LABEL,
    sizeEstimate: VOICE_MODEL_SIZE_EST,
    installed,
    downloading: downloadInProgress,
    cacheDir,
    cacheSize: formatBytes(cacheBytes),
    cacheBytes
  };
}

async function configureTransformersEnv(onProgress) {
  const { env } = await loadTransformers();
  const cacheDir = getWhisperCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  env.cacheDir = cacheDir;
  env.allowLocalModels = true;
  env.useBrowserCache = false;
  env.backends.onnx.wasm.numThreads = 1;
  try {
    require('onnxruntime-node');
  } catch (e) {
    console.warn('[voice-stt] onnxruntime-node unavailable — install it for faster offline STT.');
  }
  env.progress_callback = onProgress || null;
  return env;
}

async function getTranscriber(onProgress) {
  if (!transcriberPromise) {
    await configureTransformersEnv(onProgress);
    const { pipeline } = await loadTransformers();
    transcriberPromise = pipeline('automatic-speech-recognition', VOICE_MODEL_ID);
  }
  return transcriberPromise;
}

async function downloadVoiceModel(sendProgress) {
  if (downloadInProgress) {
    return { success: false, error: 'Voice model download already in progress.' };
  }

  downloadInProgress = true;
  downloadCancelled = false;

  const emit = (payload) => {
    if (typeof sendProgress === 'function') sendProgress(payload);
  };

  emit({ phase: 'download', percent: 0, status: 'Preparing download…' });

  let envRef = null;
  try {
    envRef = await configureTransformersEnv((data) => {
      if (downloadCancelled) return;
      if (!data) return;

      if (data.status === 'initiate') {
        emit({
          phase: 'download',
          percent: 0,
          status: `Fetching ${data.file || data.name || 'model files'}…`
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
          status: `Downloading ${data.file || data.name || 'model'}…`
        });
        return;
      }

      if (data.status === 'done' || data.status === 'ready') {
        emit({
          phase: 'download',
          percent: 100,
          status: 'Finalizing voice model…'
        });
      }
    });

    transcriberPromise = null;
    await getTranscriber();

    if (downloadCancelled) {
      clearWhisperCacheDir();
      return { success: false, cancelled: true, error: 'Download cancelled.' };
    }

    if (!findWhisperModelOnnxPath()) {
      clearWhisperCacheDir();
      return {
        success: false,
        error: 'Voice model download finished but files are incomplete. Please retry the download.'
      };
    }

    emit({ phase: 'complete', percent: 100, status: 'Voice model ready.' });
    return { success: true, installed: true };
  } catch (err) {
    transcriberPromise = null;
    clearWhisperCacheDir();
    if (downloadCancelled) {
      return { success: false, cancelled: true, error: 'Download cancelled.' };
    }
    console.error('[voice-stt] Voice model download failed:', err);
    return { success: false, error: err.message || 'Voice model download failed.' };
  } finally {
    downloadInProgress = false;
    if (envRef) envRef.progress_callback = null;
  }
}

function cancelVoiceModelDownload() {
  if (!downloadInProgress) {
    return { success: false, error: 'No voice model download in progress.' };
  }
  downloadCancelled = true;
  transcriberPromise = null;
  setTimeout(() => {
    if (!downloadInProgress) clearWhisperCacheDir();
  }, 500);
  return { success: true, cancelled: true };
}

function deleteVoiceModel() {
  if (downloadInProgress) {
    return { success: false, error: 'Cannot remove voice model while downloading.' };
  }
  clearWhisperCacheDir();
  return { success: true };
}

function clearWhisperCacheDir() {
  transcriberPromise = null;
  transformersPromise = null;
  const cacheDir = getWhisperCacheDir();
  try {
    if (fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true, force: true });
    fs.mkdirSync(cacheDir, { recursive: true });
  } catch (err) {
    console.warn('[voice-stt] could not reset whisper cache:', err.message);
  }
}

function decodeWavBufferToFloat32(wavBuffer) {
  const buffer = Buffer.isBuffer(wavBuffer) ? wavBuffer : Buffer.from(wavBuffer);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Invalid WAV audio data.');
  }

  let offset = 12;
  let sampleRate = 16000;
  let numChannels = 1;
  let bitsPerSample = 16;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ') {
      numChannels = buffer.readUInt16LE(chunkStart + 2);
      sampleRate = buffer.readUInt32LE(chunkStart + 4);
      bitsPerSample = buffer.readUInt16LE(chunkStart + 14);
    } else if (chunkId === 'data') {
      dataOffset = chunkStart;
      dataSize = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (dataOffset < 0 || bitsPerSample !== 16) {
    throw new Error('Unsupported WAV format for transcription.');
  }

  const sampleCount = Math.floor(dataSize / (bitsPerSample / 8) / numChannels);
  const float32 = new Float32Array(sampleCount);
  let writeIndex = 0;

  for (let i = 0; i < sampleCount; i++) {
    let mixed = 0;
    for (let ch = 0; ch < numChannels; ch++) {
      const sampleOffset = dataOffset + (i * numChannels + ch) * 2;
      mixed += buffer.readInt16LE(sampleOffset) / 32768;
    }
    float32[writeIndex++] = mixed / numChannels;
  }

  return { float32, sampleRate };
}

async function runWhisperTranscription(input, sampleRate = 16000) {
  const transcriber = await getTranscriber();
  const payload = typeof input === 'string'
    ? input
    : { raw: input, sampling_rate: sampleRate };
  return transcriber(payload, {
    language: 'english',
    task: 'transcribe',
    chunk_length_s: 30,
    stride_length_s: 5
  });
}

/**
 * Transcribe a WAV file sent as base64 (preferred — compact IPC payload).
 */
async function transcribeAudioWavBase64(wavBase64) {
  if (!wavBase64) {
    return { success: false, error: 'No audio data provided.' };
  }

  try {
    const wavBuffer = Buffer.from(wavBase64, 'base64');
    const { float32, sampleRate } = decodeWavBufferToFloat32(wavBuffer);
    if (!float32.length) {
      return { success: false, error: 'No speech detected in the recording.' };
    }
    const result = await runWhisperTranscription(float32, sampleRate);
    const text = String(result?.text || '').trim();
    return {
      success: Boolean(text),
      text,
      engine: 'whisper-tiny.en',
      error: text ? '' : 'No speech detected in the recording.'
    };
  } catch (err) {
    console.error('[voice-stt] WAV transcription failed:', err);
    const needsDownload = !isVoiceModelInstalled();
    return {
      success: false,
      error: needsDownload
        ? 'Voice model not installed. Download it from Settings → Agent Sounds.'
        : (err.message || 'Local transcription failed.'),
      needsDownload
    };
  }
}

/**
 * Transcribe mono PCM audio (Float32, 16 kHz recommended).
 * @param {number[]|Float32Array} audioSamples
 * @param {number} sampleRate
 */
async function transcribeAudioFloat32(audioSamples, sampleRate = 16000) {
  if (!audioSamples || !audioSamples.length) {
    return { success: false, error: 'No audio samples provided.' };
  }

  try {
    const float32 = audioSamples instanceof Float32Array
      ? audioSamples
      : Float32Array.from(audioSamples);

    const result = await runWhisperTranscription(float32, sampleRate);
    const text = String(result?.text || '').trim();
    return {
      success: Boolean(text),
      text,
      engine: 'whisper-tiny.en',
      error: text ? '' : 'No speech detected in the recording.'
    };
  } catch (err) {
    console.error('[voice-stt] Local transcription failed:', err);
    const needsDownload = !isVoiceModelInstalled();
    return {
      success: false,
      error: needsDownload
        ? 'Voice model not installed. Download it from Settings → Agent Sounds.'
        : (err.message || 'Local transcription failed.'),
      needsDownload
    };
  }
}

module.exports = {
  VOICE_MODEL_KEY,
  VOICE_MODEL_ID,
  VOICE_MODEL_LABEL,
  getVoiceModelStatus,
  downloadVoiceModel,
  cancelVoiceModelDownload,
  deleteVoiceModel,
  isVoiceModelInstalled,
  transcribeAudioWavBase64,
  transcribeAudioFloat32
};
