const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const GEMINI_TTS_MODEL = 'gemini-2.5-flash-preview-tts';

function getGeminiConfigPath() {
  return path.join(app.getPath('userData'), 'ultron-config.json');
}

function loadGeminiApiKey() {
  try {
    const configPath = getGeminiConfigPath();
    if (!fs.existsSync(configPath)) return '';
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return String(config.geminiApiKey || '').trim();
  } catch (e) {
    return '';
  }
}

function isGeminiCloudAvailable(apiKey = null) {
  const key = String(apiKey || loadGeminiApiKey() || '').trim();
  return Boolean(key);
}

function pcmToWavBuffer(pcmBuffer, sampleRate = 24000, channels = 1, bitDepth = 16) {
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * (bitDepth / 8), 28);
  buffer.writeUInt16LE(channels * (bitDepth / 8), 32);
  buffer.writeUInt16LE(bitDepth, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, 44);
  return buffer;
}

function extractAudioFromGeminiResponse(json) {
  const parts = json?.candidates?.[0]?.content?.parts || [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (!inline?.data) continue;
    const mime = String(inline.mimeType || inline.mime_type || '').toLowerCase();
    const raw = Buffer.from(inline.data, 'base64');
    if (mime.includes('wav')) {
      return { buffer: raw, mimeType: 'audio/wav', sampleRate: 24000 };
    }
    if (mime.includes('mp3') || mime.includes('mpeg')) {
      return { buffer: raw, mimeType: 'audio/mpeg', sampleRate: 24000 };
    }
    if (mime.includes('pcm') || mime.includes('l16') || mime.includes('raw')) {
      const rateMatch = mime.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      return {
        buffer: pcmToWavBuffer(raw, sampleRate),
        mimeType: 'audio/wav',
        sampleRate
      };
    }
    return { buffer: raw, mimeType: mime || 'audio/wav', sampleRate: 24000 };
  }
  return null;
}

async function synthesizeGeminiCloudSpeech(text, options = {}) {
  const apiKey = options.apiKey || loadGeminiApiKey();
  if (!apiKey) {
    return {
      success: false,
      error: 'Gemini API key required. Add your key in Settings → Connectors → Google Gemini.',
      needsApiKey: true
    };
  }

  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return { success: false, error: 'No text to speak.' };

  let model = options.geminiModel || GEMINI_TTS_MODEL;
  // Map friendly model keys to API model endpoints
  if (model === 'gemini-2.5-flash-native-audio' || model === 'gemini-3.5-live-translate') {
    model = 'gemini-2.5-flash-preview-tts';
  } else if (model === 'gemini-3-flash-live') {
    model = 'gemini-2.0-flash-exp';
  }

  const voiceName = options.voiceName || 'Kore';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const isTranslate = options.geminiModel === 'gemini-3.5-live-translate' || /translate/i.test(options.geminiModel || '');
  const requestBody = {
    contents: [{
      parts: [{ text: cleaned.slice(0, 500) }]
    }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        }
      }
    }
  };

  if (isTranslate) {
    requestBody.systemInstruction = {
      parts: [{ text: 'You are Gemini Live Translate. Translate and speak the provided content fluently and naturally.' }]
    };
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error?.message || `Gemini voice API error (${res.status})`;
      return { success: false, error: msg };
    }

    const audio = extractAudioFromGeminiResponse(json);
    if (!audio?.buffer?.length) {
      return { success: false, error: 'Gemini returned no audio. Check your API key quota.' };
    }

    return {
      success: true,
      wavBase64: audio.buffer.toString('base64'),
      sampleRate: audio.sampleRate || 24000,
      mimeType: audio.mimeType || 'audio/wav',
      engine: 'gemini-cloud',
      voiceName,
      model
    };
  } catch (err) {
    console.error('[voice-gemini-cloud] synthesize error:', err);
    return { success: false, error: err.message || 'Gemini cloud voice failed.' };
  }
}

module.exports = {
  GEMINI_TTS_MODEL,
  loadGeminiApiKey,
  isGeminiCloudAvailable,
  synthesizeGeminiCloudSpeech
};
