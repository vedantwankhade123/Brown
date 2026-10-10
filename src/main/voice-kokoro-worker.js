'use strict';

const whisper = process.env.BROWN_SPEECH_ENGINE === 'whisper';
const speech = require(whisper ? './voice-whisper' : './voice-kokoro');
process.parentPort.on('message', async ({ data }) => {
  const { id, method, args } = data;
  try {
    const allowed = whisper ? ['transcribeWhisperFloat32', 'warmupWhisper'] : ['synthesizeKokoroSpeech', 'warmupKokoroEngine'];
    if (!allowed.includes(method)) throw new Error('Unknown speech operation.');
    const result = await speech[method](...args);
    process.parentPort.postMessage({ id, result });
  } catch (err) {
    process.parentPort.postMessage({ id, result: { success: false, error: err.message } });
  }
});
