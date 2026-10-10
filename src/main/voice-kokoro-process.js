'use strict';

const path = require('path');
function createSpeechProcess(engine = 'kokoro') {
let child = null;
let childCacheDir = null;
let sequence = 0;
let tail = Promise.resolve();
const jobs = new Map();

// A utility process owns its own native ONNX environment. Never put ONNX in
// worker_threads alongside the main process's Whisper/RAG native binding.
function runKokoroJob(method, args, cacheDir, timeoutMs) {
  // Serializing PCM into JSON on the main thread defeats process isolation.
  const key = engine === 'kokoro' ? JSON.stringify([method, args, cacheDir]) : String(++sequence);
  if (jobs.has(key)) return jobs.get(key);
  if (jobs.size >= 4) return Promise.resolve({ success: false, error: 'Speech is busy. Please try again shortly.' });
  const job = tail.then(() => new Promise(resolve => {
    const { app, utilityProcess } = require('electron');
    if (child && childCacheDir !== cacheDir) {
      child.kill();
      child = null;
    }
    if (!child) {
      child = utilityProcess.fork(path.join(__dirname, 'voice-kokoro-worker.js'), [], {
        serviceName: engine === 'whisper' ? 'Brown Transcription' : 'Brown Speech',
        env: { ...process.env, BROWN_SPEECH_ENGINE: engine, BROWN_KOKORO_WORKER: '1', BROWN_KOKORO_CACHE_DIR: cacheDir }
      });
      const owned = child;
      childCacheDir = cacheDir;
      const shutdown = () => { try { owned.kill(); } catch (_) {} };
      app.once('will-quit', shutdown);
      owned.once('exit', () => {
        if (child === owned) child = null;
        app.removeListener('will-quit', shutdown);
      });
    }
    const owned = child;
    const id = ++sequence;
    let timer;
    const finish = result => {
      clearTimeout(timer);
      owned.removeListener('message', onMessage);
      owned.removeListener('exit', onExit);
      resolve(result);
    };
    const onMessage = message => { if (message?.id === id) finish(message.result); };
    const onExit = () => {
      if (child === owned) child = null;
      finish({ success: false, error: 'Speech process stopped. Please try speaking again.' });
    };
    owned.on('message', onMessage);
    owned.once('exit', onExit);
    timer = setTimeout(() => {
      if (child === owned) child = null;
      finish({ success: false, error: 'Speech generation timed out. Please try again.' });
      try { owned.kill(); } catch (_) {}
    }, timeoutMs);
    try { owned.postMessage({ id, method, args }); }
    catch (err) {
      if (child === owned) child = null;
      finish({ success: false, error: err.message });
      try { owned.kill(); } catch (_) {}
    }
  })).catch(err => ({ success: false, error: err.message }));
  jobs.set(key, job);
  tail = job.then(() => {});
  job.finally(() => jobs.delete(key));
  return job;
}
return runKokoroJob;
}

module.exports = { runKokoroJob: createSpeechProcess(), createSpeechProcess };
