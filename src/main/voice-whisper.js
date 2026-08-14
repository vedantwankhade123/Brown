'use strict';

const path = require('path');
const fs = require('fs');

const WHISPER_MODEL_ID = 'Xenova/whisper-tiny.en';
const WHISPER_ENGINE_KEY = 'whisper-local';

let whisperPipelinePromise = null;

function getSttCacheDir() {
  try {
    const { getOllamaModelsDir } = require('./paths');
    return path.join(getOllamaModelsDir(), 'tts-cache', 'stt-whisper');
  } catch (e) {
    const fallback = path.join(process.cwd(), 'Ultron-local', 'models', 'tts-cache', 'stt-whisper');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

function primeOnnxRuntime() {
  try {
    require('onnxruntime-node');
    return true;
  } catch (e) {
    console.warn('[voice-whisper] onnxruntime-node notice:', e.message);
    return false;
  }
}

async function getWhisperTranscriber(onProgress) {
  if (!whisperPipelinePromise) {
    whisperPipelinePromise = (async () => {
      const cacheDir = getSttCacheDir();
      fs.mkdirSync(cacheDir, { recursive: true });

      primeOnnxRuntime();
      const transformers = await import('@huggingface/transformers');
      transformers.env.cacheDir = cacheDir;
      transformers.env.useFSCache = true;
      transformers.env.allowLocalModels = true;
      transformers.env.backends.onnx.wasm.numThreads = 1;

      console.log(`[voice-whisper] initializing local Whisper STT (${WHISPER_MODEL_ID})...`);
      const pipeline = await transformers.pipeline('automatic-speech-recognition', WHISPER_MODEL_ID, {
        dtype: 'fp32',
        device: 'cpu',
        progress_callback: onProgress || null
      });
      whisperReady = true;
      return pipeline;
    })().catch((err) => {
      whisperPipelinePromise = null;
      throw err;
    });
  }
  return whisperPipelinePromise;
}

function cleanWhisperText(rawText) {
  if (!rawText) return '';
  let text = String(rawText || '')
    .replace(/\[(BLANK_AUDIO|MUSIC|NOISE|LAUGHTER|SILENCE|APPLAUSE)\]/gi, '')
    .replace(/<\|.*?\|>/g, '')
    .trim();
  if (/^[\s.,!?-]+$/.test(text)) return '';
  return text;
}

function resampleFloat32To16k(samples, sourceRate = 16000) {
  if (!samples || !samples.length) return new Float32Array(0);
  const src = samples instanceof Float32Array ? samples : Float32Array.from(samples);
  if (Math.round(sourceRate) === 16000) return src;

  const ratio = sourceRate / 16000;
  const newLength = Math.floor(src.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const srcIndex = i * ratio;
    const indexLow = Math.floor(srcIndex);
    const indexHigh = Math.min(srcIndex + 1, src.length - 1);
    const weight = srcIndex - indexLow;
    result[i] = src[indexLow] * (1 - weight) + src[indexHigh] * weight;
  }
  return result;
}

function decodeWavBufferToFloat32(wavBuffer) {
  const buffer = Buffer.isBuffer(wavBuffer) ? wavBuffer : Buffer.from(wavBuffer);
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
    throw new Error('Invalid WAV audio header.');
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
    throw new Error('Unsupported WAV encoding for Whisper transcription.');
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

  return { float32: resampleFloat32To16k(float32, sampleRate), sampleRate: 16000 };
}

function getRms(samples, start = 0, end = samples?.length || 0) {
  if (!samples || end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / (end - start));
}

function estimateNoiseFloor(samples, sampleRate = 16000) {
  if (!samples || !samples.length) return 0.003;
  const frameSize = Math.max(160, Math.floor(sampleRate * 0.02));
  const levels = [];
  for (let offset = 0; offset + frameSize <= samples.length; offset += frameSize) {
    levels.push(getRms(samples, offset, offset + frameSize));
  }
  if (!levels.length) return getRms(samples);
  levels.sort((a, b) => a - b);
  return Math.max(0.002, levels[Math.floor(levels.length * 0.2)] || 0.002);
}

function trimSilence(samples, sampleRate = 16000) {
  if (!samples || !samples.length) return samples;
  const frameSize = Math.max(160, Math.floor(sampleRate * 0.02));
  const threshold = Math.max(0.002, estimateNoiseFloor(samples, sampleRate) * 1.5);
  let firstFrame = -1;
  let lastFrame = -1;
  let frameIndex = 0;
  for (let offset = 0; offset + frameSize <= samples.length; offset += frameSize, frameIndex++) {
    if (getRms(samples, offset, offset + frameSize) >= threshold) {
      if (firstFrame < 0) firstFrame = frameIndex;
      lastFrame = frameIndex;
    }
  }
  if (firstFrame < 0) return samples;
  const pad = Math.floor(sampleRate * 0.12);
  const start = Math.max(0, firstFrame * frameSize - pad);
  const end = Math.min(samples.length, (lastFrame + 1) * frameSize + pad);
  return samples.subarray(start, end);
}

function getSpeechStats(samples, sampleRate = 16000) {
  if (!samples || !samples.length) {
    return { speechRatio: 0, peak: 0, rms: 0 };
  }
  const frameSize = Math.max(160, Math.floor(sampleRate * 0.025));
  const threshold = Math.max(0.002, estimateNoiseFloor(samples, sampleRate) * 1.5);
  let speechFrames = 0;
  let totalFrames = 0;
  let peak = 0;
  for (let offset = 0; offset + frameSize <= samples.length; offset += frameSize) {
    const rms = getRms(samples, offset, offset + frameSize);
    if (rms >= threshold) speechFrames++;
    totalFrames++;
    for (let i = offset; i < offset + frameSize; i++) {
      const abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
  }
  return {
    speechRatio: totalFrames ? speechFrames / totalFrames : 0,
    peak,
    rms: getRms(samples)
  };
}

function normalizeAudioPeak(samples) {
  if (!samples || !samples.length) return samples;
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (maxAbs < 0.001) return samples;
  const factor = Math.min(8, 0.85 / maxAbs);
  const normalized = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const value = samples[i] * factor;
    normalized[i] = Math.abs(value) < 0.0005 ? 0 : value;
  }
  return normalized;
}

let isWhisperInferring = false;
let whisperReady = false;

function isWhisperReady() {
  return whisperReady;
}

async function transcribeWhisperFloat32(audioSamples, sampleRate = 16000) {
  if (!audioSamples || !audioSamples.length) {
    return { success: false, error: 'No audio samples provided.', engine: WHISPER_ENGINE_KEY };
  }

  if (isWhisperInferring) {
    return { success: false, error: 'Whisper engine busy.', engine: WHISPER_ENGINE_KEY, busy: true };
  }

  isWhisperInferring = true;
  try {
    let samples16k = resampleFloat32To16k(audioSamples, sampleRate);
    if (samples16k.length < 800) {
      return { success: false, error: 'Recording too short.', engine: WHISPER_ENGINE_KEY };
    }
    samples16k = trimSilence(samples16k, 16000);
    const speechStats = getSpeechStats(samples16k, 16000);
    if (speechStats.peak < 0.005 || speechStats.rms < 0.0008) {
      return { success: false, error: 'No clear speech detected.', engine: WHISPER_ENGINE_KEY };
    }

    const max16kSamples = 16000 * 25;
    if (samples16k.length > max16kSamples) {
      samples16k = samples16k.subarray(samples16k.length - max16kSamples);
    }
    samples16k = normalizeAudioPeak(samples16k);

    const transcriber = await getWhisperTranscriber();
    const isEnglishOnly = WHISPER_MODEL_ID.endsWith('.en');
    const options = { return_timestamps: false, chunk_length_s: 30, stride_length_s: 5 };
    if (!isEnglishOnly) {
      options.language = 'english';
      options.task = 'transcribe';
    }
    const result = await transcriber(samples16k, options);

    const text = cleanWhisperText(result?.text);
    return {
      success: Boolean(text),
      text,
      engine: WHISPER_ENGINE_KEY,
      error: text ? '' : 'No speech recognized.'
    };
  } catch (err) {
    console.error('[voice-whisper] transcription failed:', err);
    return {
      success: false,
      error: err.message || 'Whisper transcription failed.',
      engine: WHISPER_ENGINE_KEY
    };
  } finally {
    isWhisperInferring = false;
  }
}

async function transcribeWhisperWavBuffer(wavBuffer) {
  try {
    const decoded = decodeWavBufferToFloat32(wavBuffer);
    return await transcribeWhisperFloat32(decoded.float32, 16000);
  } catch (err) {
    console.error('[voice-whisper] WAV transcription failed:', err);
    return {
      success: false,
      error: err.message || 'Whisper WAV transcription failed.',
      engine: WHISPER_ENGINE_KEY
    };
  }
}

async function warmupWhisper() {
  try {
    await getWhisperTranscriber();
    return { success: true, warmed: true };
  } catch (err) {
    return { success: false, error: err.message || 'Whisper warmup failed.' };
  }
}

module.exports = {
  WHISPER_MODEL_ID,
  WHISPER_ENGINE_KEY,
  transcribeWhisperFloat32,
  transcribeWhisperWavBuffer,
  warmupWhisper,
  isWhisperReady
};
