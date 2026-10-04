/**
 * Privacy-first desktop diagnostic logs.
 *
 * Captures unhandled main-process exceptions and renderer-reported crashes,
 * caches a SANITIZED payload on disk (device/system specs, app version,
 * timestamp, stack trace only — never prompts, chat history, or credentials),
 * and uploads it over HTTPS to the Brown website Firestore backend
 * (appErrorLogs mailbox doc). Server-side security rules rate-limit uploads to
 * one per device per 60 seconds; we mirror that cooldown locally.
 */
const https = require('https');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { profileHardware } = require('./hardware');

const FIRESTORE_PROJECT = 'ultron-da7a0';
const COLLECTION = 'appErrorLogs';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT}/databases/(default)/documents/${COLLECTION}`;

const MAX_CACHED_LOGS = 20;
const MAX_MESSAGE_LEN = 500;
const MAX_STACK_LEN = 8000;
const SEND_COOLDOWN_MS = 60000;

let cacheDir = null;
function dir() {
  if (!cacheDir) {
    cacheDir = app.getPath('userData');
    try { fs.mkdirSync(cacheDir, { recursive: true }); } catch (_) {}
  }
  return cacheDir;
}
const logsFile = () => path.join(dir(), 'diagnostic-logs.json');
const metaFile = () => path.join(dir(), 'diagnostic-meta.json');
const deviceFile = () => path.join(dir(), 'diagnostic-device.json');

function readJson(file, fallback) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}
function writeJson(file, value) {
  try { fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8'); } catch (_) {}
}

function getDiagnosticsDeviceId() {
  const stored = readJson(deviceFile(), null);
  if (stored && typeof stored.deviceId === 'string' && stored.deviceId.length >= 8) {
    return stored.deviceId;
  }
  const rand = Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 12);
  const deviceId = `win_${Date.now().toString(36)}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  writeJson(deviceFile(), { deviceId, createdAt: new Date().toISOString() });
  return deviceId;
}

function truncate(value, max) {
  const str = String(value == null ? '' : value);
  return str.length > max ? `${str.slice(0, max)}…` : str;
}

function sanitizeMessage(err) {
  if (err && typeof err === 'object') {
    return truncate(err.message || err.error || err.reason || JSON.stringify(err), MAX_MESSAGE_LEN);
  }
  return truncate(err, MAX_MESSAGE_LEN);
}
function sanitizeStack(err) {
  const stack = err && typeof err === 'object' ? (err.stack || err.errorStack) : undefined;
  return truncate(stack || 'No stack trace available', MAX_STACK_LEN);
}

function appVersion() {
  try { return typeof app.getVersion === 'function' ? app.getVersion() : 'unknown'; }
  catch (_) { return 'unknown'; }
}

/** Record one sanitized error into the on-disk cache. Safe to call from anywhere. */
function captureError(err, source = 'main') {
  try {
    const logs = readJson(logsFile(), []);
    const list = Array.isArray(logs) ? logs : [];
    const entry = {
      message: sanitizeMessage(err),
      stack: sanitizeStack(err),
      timestamp: new Date().toISOString(),
      appVersion: appVersion(),
      source: ['main', 'renderer', 'preload', 'manual'].includes(source) ? source : 'main',
    };
    list.unshift(entry);
    writeJson(logsFile(), list.slice(0, MAX_CACHED_LOGS));
  } catch (_) {
    // Diagnostics must never throw.
  }
}

function listErrors() {
  const logs = readJson(logsFile(), []);
  return Array.isArray(logs) ? logs : [];
}
function countErrors() {
  return listErrors().length;
}
function clearErrors() {
  try { fs.writeFileSync(logsFile(), '[]', 'utf8'); } catch (_) {}
}

async function buildHardwareSummary() {
  let cpuThreads = os.cpus()?.length || 0;
  let totalRamGB = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10;
  let gpuName = '';
  let gpuVramGB = 0;
  try {
    const hardware = await profileHardware();
    if (hardware) {
      cpuThreads = hardware.cpuThreads || cpuThreads;
      totalRamGB = hardware.totalRamGB || totalRamGB;
      const details = Array.isArray(hardware.gpuDetails) ? hardware.gpuDetails : [];
      const active = hardware.dedicatedGpu || details[0] || null;
      if (active) {
        gpuName = truncate(active.model || active.name || '', 120);
        gpuVramGB = Number(active.vramGB || 0);
      }
    }
  } catch (_) {
    // Fall back to os-only specs.
  }
  const cpuModel = truncate((os.cpus()?.[0]?.model || '').replace(/\s+/g, ' ').trim(), 120) || 'Unknown CPU';
  const gpuPart = gpuName ? `${gpuName}${gpuVramGB ? ` (${gpuVramGB}GB VRAM)` : ''}` : 'No GPU detected';
  return {
    deviceName: cpuModel,
    hardware: truncate(`${cpuThreads} threads · ${totalRamGB}GB RAM · ${gpuPart}`, 300),
  };
}

function firestoreRequest(method, urlStr, body) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const payload = body ? JSON.stringify(body) : null;
      const req = https.request({
        method,
        hostname: url.hostname,
        path: `${url.pathname}${url.search || ''}`,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Brown-AI-Desktop-App',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: 20000,
      }, (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => resolve({ status: res.statusCode, body: raw }));
      });
      req.on('error', (err) => resolve({ status: 0, body: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }); });
      if (payload) req.write(payload);
      req.end();
    } catch (err) {
      resolve({ status: 0, body: err.message });
    }
  });
}

function str(value) { return { stringValue: String(value) }; }
function logToValue(entry) {
  return {
    mapValue: {
      fields: {
        message: str(entry.message || ''),
        stack: str(entry.stack || ''),
        timestamp: str(entry.timestamp || new Date().toISOString()),
        appVersion: str(entry.appVersion || appVersion()),
        source: str(entry.source || 'main'),
      },
    },
  };
}

/**
 * Upload the cached sanitized logs to Firestore.
 * Returns { status: 'sent'|'empty'|'cooldown'|'error', ... }.
 */
async function sendErrorLogs() {
  const logs = listErrors();
  if (logs.length === 0) return { status: 'empty', count: 0 };

  const meta = readJson(metaFile(), {});
  if (meta.lastSentAt) {
    const elapsed = Date.now() - Number(meta.lastSentAt);
    if (Number.isFinite(elapsed) && elapsed < SEND_COOLDOWN_MS) {
      return { status: 'cooldown', retryInMs: SEND_COOLDOWN_MS - elapsed };
    }
  }

  const deviceId = getDiagnosticsDeviceId();
  const specs = await buildHardwareSummary();
  const payload = {
    fields: {
      platform: str('desktop'),
      appVersion: str(appVersion()),
      deviceName: str(specs.deviceName),
      osName: str(os.type() || 'unknown'),
      osVersion: str(truncate(os.release() || 'unknown', 60)),
      hardware: str(specs.hardware),
      lastSentAt: { timestampValue: new Date().toISOString() },
      logs: { arrayValue: { values: logs.slice(0, MAX_CACHED_LOGS).map(logToValue) } },
    },
  };
  const mask = ['platform', 'appVersion', 'deviceName', 'osName', 'osVersion', 'hardware', 'lastSentAt', 'logs']
    .map((f) => `updateMask.fieldPaths=${f}`)
    .join('&');

  // Update the existing mailbox doc; create it on the first submission.
  let res = await firestoreRequest('PATCH', `${BASE_URL}/${deviceId}?${mask}&currentDocument.exists=true`, payload);
  if (res.status === 404 || res.status === 412) {
    res = await firestoreRequest('POST', `${BASE_URL}?documentId=${encodeURIComponent(deviceId)}`, payload);
  }

  if (res.status === 403) {
    // Server-side rate limit or validation rejection.
    return { status: 'cooldown', retryInMs: SEND_COOLDOWN_MS, detail: truncate(res.body, 160) };
  }
  if (res.status < 200 || res.status >= 300) {
    return { status: 'error', message: `Upload failed (${res.status}) ${truncate(res.body, 160)}` };
  }

  writeJson(metaFile(), { lastSentAt: Date.now(), lastCount: logs.length });
  clearErrors();
  return { status: 'sent', count: logs.length };
}

module.exports = {
  captureError,
  listErrors,
  countErrors,
  clearErrors,
  sendErrorLogs,
  getDiagnosticsDeviceId,
  appVersion,
  SEND_COOLDOWN_MS,
};
