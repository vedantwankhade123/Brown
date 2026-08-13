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
      return transformers.pipeline('automatic-speech-recognition', WHISPER_MODEL_ID, {
        dtype: 'fp32',
        device: 'cpu',
        progress_callback: onProgress || null
      });
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

function normalizeAudioPeak(samples) {
  if (!samples || !samples.length) return samples;
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (maxAbs < 0.001) return samples;
  const factor = 0.85 / maxAbs;
  const normalized = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    normalized[i] = samples[i] * factor;
  }
  return normalized;
}

let isWhisperInferring = false;

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
  warmupWhisper
};
