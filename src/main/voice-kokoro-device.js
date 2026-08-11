'use strict';

const ALLOWED_DEVICES = new Set(['cpu', 'gpu', 'dml', 'cuda', 'wasm']);

/** Sticky fallback after GPU/DML hangs or fails in this process. */
let forcedDevice = null;

function getKokoroDevicePreference() {
  if (forcedDevice) return forcedDevice;

  const override = String(process.env.ULTRON_KOKORO_DEVICE || '').trim().toLowerCase();
  if (override === '0' || override === 'off') return 'cpu';
  if (override && ALLOWED_DEVICES.has(override)) return override;

  // Prefer CPU in Electron workers — DirectML/CUDA often hangs or crashes
  // onnxruntime-node inside worker_threads. Opt in with ULTRON_KOKORO_DEVICE=gpu.
  return 'cpu';
}

function forceKokoroDevice(device) {
  const next = String(device || '').trim().toLowerCase();
  if (!ALLOWED_DEVICES.has(next)) return getKokoroDevicePreference();
  forcedDevice = next;
  return forcedDevice;
}

function clearForcedKokoroDevice() {
  forcedDevice = null;
}

function primeOnnxRuntimeNode() {
  try {
    require('onnxruntime-node');
    return true;
  } catch (err) {
    console.warn('[voice-kokoro] onnxruntime-node unavailable:', err.message);
    return false;
  }
}

module.exports = {
  getKokoroDevicePreference,
  forceKokoroDevice,
  clearForcedKokoroDevice,
  primeOnnxRuntimeNode
};
