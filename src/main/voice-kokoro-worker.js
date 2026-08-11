'use strict';

const { parentPort } = require('worker_threads');
const fs = require('fs');
const { getKokoroDevicePreference, primeOnnxRuntimeNode } = require('./voice-kokoro-device');

const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const MAX_PARTS = 40;
const MAX_PART_LEN = 400;

let kokoroPromise = null;
let kokoroDevice = null;

function extractSamples(seg) {
  if (!seg) return new Float32Array(0);
  if (seg instanceof Float32Array) return seg;
  if (seg.audio instanceof Float32Array) return seg.audio;
  if (seg.data instanceof Float32Array) return seg.data;
  if (Array.isArray(seg.audio)) return new Float32Array(seg.audio);
  if (Array.isArray(seg.data)) return new Float32Array(seg.data);
  return new Float32Array(0);
}

function rawAudioToWavBuffer(samples, sampleRate = 24000) {
  const floatSamples = extractSamples(samples);
  const numSamples = floatSamples.length;
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
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    buffer.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buffer;
}

function mergeSegments(segments) {
  const parts = segments.map(extractSamples);
  const total = parts.reduce((n, data) => n + data.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const data of parts) {
    merged.set(data, offset);
    offset += data.length;
  }
  return merged;
}

function splitTextParts(text, maxLen = MAX_PART_LEN) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];
  const parts = [];
  let rest = cleaned;
  while (rest.length > 0 && parts.length < MAX_PARTS) {
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

function sampleCount(seg) {
  return extractSamples(seg).length;
}

async function loadKokoro(cacheDir, device) {
  fs.mkdirSync(cacheDir, { recursive: true });
  process.env.TRANSFORMERS_CACHE = cacheDir;
  process.env.HF_HOME = cacheDir;
  primeOnnxRuntimeNode();
  const transformers = await import('@huggingface/transformers');
  transformers.env.cacheDir = cacheDir;
  transformers.env.useFSCache = true;
  transformers.env.allowLocalModels = true;
  const { KokoroTTS } = await import('kokoro-js');
  console.log(`[voice-kokoro-worker] loading Kokoro with device=${device}`);
  return KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
    dtype: 'q8',
    device
  });
}

async function configureAndLoadTts(cacheDir, deviceOverride) {
  const wanted = deviceOverride || getKokoroDevicePreference();
  if (kokoroPromise && kokoroDevice === wanted) return kokoroPromise;

  kokoroDevice = wanted;
  kokoroPromise = loadKokoro(cacheDir, wanted).catch((err) => {
    kokoroPromise = null;
    kokoroDevice = null;
    throw err;
  });
  return kokoroPromise;
}

async function generateParts(tts, parts, voice) {
  const segments = [];
  for (const part of parts) {
    const seg = await tts.generate(part, { voice, speed: 1 });
    if (sampleCount(seg) < 1) {
      throw new Error('Kokoro returned empty audio.');
    }
    segments.push(seg);
  }
  return segments;
}

parentPort.on('message', async (msg) => {
  const { id, type, cacheDir, text, voiceId, device } = msg || {};
  const voice = voiceId || 'af_bella';
  try {
    if (type === 'warmup') {
      await configureAndLoadTts(cacheDir, device);
      parentPort.postMessage({ id, success: true, warmed: true, device: kokoroDevice });
      return;
    }

    const parts = splitTextParts(text);
    if (!parts.length) {
      parentPort.postMessage({ id, success: false, error: 'No text to speak.' });
      return;
    }

    let tts;
    try {
      tts = await configureAndLoadTts(cacheDir, device);
    } catch (loadErr) {
      if ((device || getKokoroDevicePreference()) !== 'cpu') {
        console.warn('[voice-kokoro-worker] GPU load failed, falling back to CPU:', loadErr.message);
        kokoroPromise = null;
        kokoroDevice = null;
        tts = await configureAndLoadTts(cacheDir, 'cpu');
      } else {
        throw loadErr;
      }
    }

    let segments;
    try {
      segments = await generateParts(tts, parts, voice);
    } catch (genErr) {
      if (kokoroDevice !== 'cpu') {
        console.warn('[voice-kokoro-worker] GPU generate failed, falling back to CPU:', genErr.message);
        kokoroPromise = null;
        kokoroDevice = null;
        tts = await configureAndLoadTts(cacheDir, 'cpu');
        segments = await generateParts(tts, parts, voice);
      } else {
        throw genErr;
      }
    }

    const merged = mergeSegments(segments);
    const wavBuffer = rawAudioToWavBuffer(merged, 24000);
    parentPort.postMessage({
      id,
      success: true,
      result: {
        success: true,
        wavBase64: wavBuffer.toString('base64'),
        sampleRate: 24000,
        mimeType: 'audio/wav',
        engine: 'kokoro',
        voiceId: voice,
        device: kokoroDevice
      }
    });
  } catch (err) {
    kokoroPromise = null;
    kokoroDevice = null;
    parentPort.postMessage({ id, success: false, error: err.message || 'Kokoro worker failed.' });
  }
});
