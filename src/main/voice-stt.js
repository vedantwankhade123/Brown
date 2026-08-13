const {
  VOICE_ENGINE_KEY,
  VOICE_ENGINE_LABEL,
  isWindowsPlatform,
  isNativeSttAvailable,
  getNativeSttProbeState,
  probeNativeSttAvailable,
  transcribeWavBuffer
} = require('./voice-stt-native');

const {
  WHISPER_MODEL_ID,
  WHISPER_ENGINE_KEY,
  transcribeWhisperFloat32,
  transcribeWhisperWavBuffer
} = require('./voice-whisper');

const VOICE_MODEL_KEY = 'whisper-local';
const VOICE_MODEL_ID = WHISPER_MODEL_ID;
const VOICE_MODEL_LABEL = 'OpenAI Whisper (Open Source Local)';
const VOICE_MODEL_SIZE_EST = '~39 MB · Fast & Accurate';

function getVoiceModelStatus() {
  const onWindows = isWindowsPlatform();
  const available = true;
  return {
    modelKey: VOICE_MODEL_KEY,
    modelId: VOICE_MODEL_ID,
    label: VOICE_MODEL_LABEL,
    sizeEstimate: VOICE_MODEL_SIZE_EST,
    installed: true,
    available: true,
    downloading: false,
    builtIn: true,
    noDownloadRequired: true,
    engine: 'whisper-local',
    platform: process.platform,
    probed: true,
    cacheSize: 'Local ONNX',
    cacheBytes: 0
  };
}

async function refreshVoiceModelAvailability() {
  return getVoiceModelStatus();
}

async function downloadVoiceModel() {
  return { success: true, installed: true, builtIn: true };
}

function cancelVoiceModelDownload() {
  return { success: false, error: 'Whisper STT model is integrated and ready.' };
}

function deleteVoiceModel() {
  return { success: false, error: 'Whisper STT model is part of the local voice engine.' };
}

function isVoiceModelInstalled() {
  return true;
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

function float32ToWavBuffer(float32, sampleRate = 16000) {
  const numSamples = float32.length;
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

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    buffer.writeInt16LE(sample < 0 ? sample * 0x8000 : sample * 0x7FFF, offset);
    offset += 2;
  }

  return buffer;
}

async function transcribeAudioWavBase64(wavBase64, culture) {
  if (!wavBase64) {
    return { success: false, error: 'No audio data provided.' };
  }

  try {
    const wavBuffer = Buffer.from(wavBase64, 'base64');
    const whisperRes = await transcribeWhisperWavBuffer(wavBuffer);
    if (whisperRes?.success && whisperRes.text) {
      return whisperRes;
    }
    return await transcribeWavBuffer(wavBuffer, culture);
  } catch (err) {
    console.error('[voice-stt] WAV transcription failed:', err);
    return {
      success: false,
      error: err.message || 'Speech recognition failed.',
      engine: VOICE_ENGINE_KEY
    };
  }
}

async function transcribeAudioFloat32(audioSamples, sampleRate = 16000, culture) {
  if (!audioSamples || !audioSamples.length) {
    return { success: false, error: 'No audio samples provided.' };
  }

  // 1. Primary: Fast local OpenAI Whisper ONNX STT (< 300ms, accurate, offline)
  try {
    const whisperRes = await transcribeWhisperFloat32(audioSamples, sampleRate);
    if (whisperRes?.success && whisperRes.text) {
      return whisperRes;
    }
  } catch (wErr) {
    console.warn('[voice-stt] Whisper STT fallback notice:', wErr.message);
  }

  // 2. Fallback: Windows Speech / SAPI 5
  try {
    const float32 = audioSamples instanceof Float32Array
      ? audioSamples
      : Float32Array.from(audioSamples);

    const wavBuffer = float32ToWavBuffer(float32, sampleRate);
    return await transcribeWavBuffer(wavBuffer, culture);
  } catch (err) {
    console.error('[voice-stt] transcription failed:', err);
    return {
      success: false,
      error: err.message || 'Speech recognition failed.',
      engine: VOICE_ENGINE_KEY
    };
  }
}

module.exports = {
  VOICE_MODEL_KEY,
  VOICE_MODEL_ID,
  VOICE_MODEL_LABEL,
  getVoiceModelStatus,
  refreshVoiceModelAvailability,
  probeNativeSttAvailable,
  downloadVoiceModel,
  cancelVoiceModelDownload,
  deleteVoiceModel,
  isVoiceModelInstalled,
  transcribeAudioWavBase64,
  transcribeAudioFloat32
};

