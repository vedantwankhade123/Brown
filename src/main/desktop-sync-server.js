/**
 * LAN pairing bridge for Brown Desktop <-> Brown Mobile.
 * HTTP on 0.0.0.0:49200+ (WhatsApp-style pairing code + real scannable QR).
 */
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SYNC_PORT = 49200;
const PORT_FALLBACKS = [SYNC_PORT, 49201, 49202, 49203];
const PAIR_TTL_MS = 120 * 1000;
const PAIR_TTL_S = PAIR_TTL_MS / 1000;
const MAX_VERIFY_ATTEMPTS = 6;
// A code survives regeneration requests, so this budget is tracked per server rather than
// per pendingPair — otherwise POST /pair/request would reset the counter for free.
const MAX_VERIFY_FAILURES_PER_WINDOW = 12;
const VERIFY_FAILURE_WINDOW_MS = 10 * 60 * 1000;
// Chat exports are the largest legitimate payload; anything bigger is not worth buffering.
const MAX_BODY_BYTES = 32 * 1024 * 1024;

let server = null;
let activePort = SYNC_PORT;
let syncId = '';
let pendingPair = null;
let pendingChatConsent = null;
let getMainWindow = () => null;
let verifyFailureWindow = { count: 0, windowStart: 0 };

function configPath() {
  return path.join(app.getPath('userData'), 'ultron-config.json');
}

function loadConfig() {
  try {
    if (fs.existsSync(configPath())) {
      return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    }
  } catch {}
  return {};
}

function saveConfigPatch(patch) {
  const config = { ...loadConfig(), ...patch };
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
  return config;
}

function generateSyncId() {
  const host = (os.hostname() || 'PC').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'PC';
  const n = (crypto.randomBytes(2).readUInt16BE(0) % 9000) + 1000;
  return `BROWN-${host}-${n}`;
}

function generatePairCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return code;
}

function registerVerifyFailure() {
  const now = Date.now();
  if (now - verifyFailureWindow.windowStart > VERIFY_FAILURE_WINDOW_MS) {
    verifyFailureWindow = { count: 0, windowStart: now };
  }
  verifyFailureWindow.count += 1;
  return verifyFailureWindow.count;
}

function pairingLockedOut() {
  return verifyFailureWindow.count >= MAX_VERIFY_FAILURES_PER_WINDOW &&
    Date.now() - verifyFailureWindow.windowStart < VERIFY_FAILURE_WINDOW_MS;
}

function clearVerifyFailures() {
  verifyFailureWindow = { count: 0, windowStart: 0 };
}

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function getLanAddresses() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name] || []) {
      const family = iface.family === 'IPv4' || iface.family === 4;
      if (family && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

// A browser page on the LAN could otherwise brute-force the pairing code using the user's
// own browser, so the wildcard CORS grant is limited to local dev origins (expo web).
const LOCAL_ORIGIN_RE = /^https?:\/\/(localhost|127\.0\.0\.1|\d{1,3}(\.\d{1,3}){3})(:\d+)?$/i;

function corsOrigin(req) {
  const origin = String(req.headers.origin || '');
  return LOCAL_ORIGIN_RE.test(origin) ? origin : '';
}

function json(req, res, status, body) {
  const payload = JSON.stringify(body);
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  };
  // A refused upload leaves the client's body unread, so the connection cannot be reused.
  // Closing only after the response flushes is what lets the caller see 413 instead of a
  // connection reset.
  if (status === 413) headers.Connection = 'close';
  const origin = corsOrigin(req);
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let received = 0;
    req.on('data', (c) => {
      received += c.length;
      if (received > MAX_BODY_BYTES) {
        const err = new Error('Request body too large');
        err.code = 'BODY_TOO_LARGE';
        // Stop reading rather than tearing the socket down, so the caller can still answer 413.
        req.pause();
        reject(err);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

function authToken(req) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function lanFingerprint() {
  return getLanAddresses()
    .map((a) => a.split('.').slice(0, 3).join('.'))
    .sort()
    .join('|');
}

function networksOverlap(storedFp) {
  if (!storedFp) return true;
  const now = lanFingerprint().split('|').filter(Boolean);
  const stored = String(storedFp).split('|').filter(Boolean);
  return now.some((prefix) => stored.includes(prefix));
}

function findToken(token) {
  if (!token) return null;
  const tokens = loadConfig().mobilePairTokens || [];
  const rec = tokens.find((t) => t.token === token && !t.revoked);
  if (!rec) return null;
  const maxAge = 45 * 24 * 60 * 60 * 1000;
  if (rec.createdAt && Date.now() - rec.createdAt > maxAge) return null;
  return rec;
}

function isTokenValid(token) {
  return !!findToken(token);
}

function getSyncedProfile() {
  const cfg = loadConfig();
  let username = '';
  try {
    username = os.userInfo().username || '';
  } catch {}
  return {
    displayName: cfg.displayName || cfg.userName || username,
    email: cfg.email || '',
    systemPrompt: cfg.systemPrompt || '',
    geminiApiKey: cfg.geminiApiKey || '',
  };
}

function conversationsFile() {
  try {
    const { getUltronRuntimeRoot } = require('./paths');
    return path.join(getUltronRuntimeRoot(), 'conversations.json');
  } catch {
    return path.join(app.getPath('userData'), 'conversations.json');
  }
}

function loadConversationsStore() {
  try {
    const file = conversationsFile();
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && typeof parsed === 'object') return parsed;
    }
  } catch {}
  return {};
}

function saveConversationsStore(store) {
  const file = conversationsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf8');
}

function toMillis(value) {
  if (!value) return Date.now();
  if (typeof value === 'number') return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function normalizeSessions(store) {
  return Object.keys(store).map((id) => {
    const session = store[id] || {};
    const messages = Array.isArray(session.messages) ? session.messages : [];
    return {
      id: session.id || id,
      title: session.title || 'Desktop chat',
      modelId: session.modelId || 'desktop',
      createdAt: toMillis(session.createdAt),
      updatedAt: toMillis(session.updatedAt),
      messageCount: messages.length,
      lastMessagePreview: (messages[messages.length - 1]?.text || messages[messages.length - 1]?.content || '').slice(0, 80),
      messages: messages.map((msg, index) => ({
        id: msg.id || `${id}_msg_${index}_${msg.createdAt || index}`,
        sessionId: session.id || id,
        role: msg.role || (msg.isAi || msg.sender === 'ai' ? 'assistant' : 'user'),
        content: msg.content || msg.text || '',
        timestamp: toMillis(msg.timestamp || msg.createdAt),
      })),
    };
  });
}

function mergeIncomingSessions(incoming) {
  const store = loadConversationsStore();
  let merged = 0;
  for (const session of incoming || []) {
    if (!session || !session.id) continue;
    const existing = store[session.id];
    const desktopMessages = (session.messages || []).map((msg) => ({
      id: msg.id,
      sender: msg.role === 'assistant' ? 'ai' : 'user',
      isAi: msg.role === 'assistant',
      text: msg.content || msg.text || '',
      createdAt: new Date(toMillis(msg.timestamp)).toISOString(),
    }));
    if (!existing) {
      store[session.id] = {
        id: session.id,
        title: session.title || 'Mobile chat',
        createdAt: new Date(toMillis(session.createdAt)).toISOString(),
        updatedAt: new Date(toMillis(session.updatedAt) || Date.now()).toISOString(),
        messages: desktopMessages,
      };
      merged++;
      continue;
    }
    const seen = new Set(
      (existing.messages || []).map((m) => m.id || `${m.createdAt}|${m.text || m.content || ''}`)
    );
    existing.messages = existing.messages || [];
    for (const msg of desktopMessages) {
      const key = msg.id || `${msg.createdAt}|${msg.text}`;
      if (seen.has(key) || seen.has(`${msg.createdAt}|${msg.text}`)) continue;
      existing.messages.push(msg);
      seen.add(key);
      merged++;
    }
    existing.title = session.title || existing.title;
    existing.updatedAt = new Date().toISOString();
  }
  saveConversationsStore(store);
  return merged;
}

function notifyRenderer(channel, payload, opts = {}) {
  try {
    const win = getMainWindow && getMainWindow();
    if (win && !win.isDestroyed() && win.webContents) {
      if (opts.focus) {
        try {
          if (typeof win.isMinimized === 'function' && win.isMinimized()) win.restore();
          win.show();
          win.focus();
        } catch {}
      }
      win.webContents.send(channel, payload);
    }
  } catch (err) {
    console.warn('[desktop-sync] renderer notify failed:', err.message);
  }
}

function requestChatConsent({ direction, title, detail, sessionCount, messageCount }) {
  return new Promise((resolve) => {
    if (pendingChatConsent) {
      try {
        pendingChatConsent.finish({ approved: false, error: 'Another chat transfer is already waiting on this PC' });
      } catch {}
    }
    const requestId = crypto.randomBytes(8).toString('hex');
    const timer = setTimeout(() => {
      if (pendingChatConsent && pendingChatConsent.requestId === requestId) {
        pendingChatConsent = null;
        notifyRenderer('mobile-chat-consent-dismissed', {});
        resolve({ approved: false, error: 'Timed out waiting for approval on the PC' });
      }
    }, 60 * 1000);
    pendingChatConsent = {
      requestId,
      direction,
      finish: (result) => {
        clearTimeout(timer);
        pendingChatConsent = null;
        resolve(result);
      },
    };
    notifyRenderer('mobile-chat-consent', {
      requestId,
      direction,
      title,
      detail,
      sessionCount: sessionCount || 0,
      messageCount: messageCount || 0,
      expiresIn: 60,
    }, { focus: true });
  });
}

function resolveChatConsent(approved) {
  if (!pendingChatConsent) return false;
  const finish = pendingChatConsent.finish;
  notifyRenderer('mobile-chat-consent-dismissed', {});
  finish({
    approved: !!approved,
    error: approved ? undefined : 'Declined on the PC',
  });
  return true;
}

function discoverPayload() {
  return {
    ok: true,
    syncId,
    name: `${os.hostname() || 'Brown-PC'} (Brown Desktop)`,
    version: app.getVersion ? app.getVersion() : '1.0.0',
    port: activePort,
    addresses: getLanAddresses(),
    ollama: 'http://127.0.0.1:11434',
  };
}

function pairQrPayload(code) {
  const ips = getLanAddresses();
  return JSON.stringify({
    v: 1,
    type: 'brown-pair',
    name: `${os.hostname() || 'Brown-PC'} (Brown Desktop)`,
    ip: ips[0] || '127.0.0.1',
    ips,
    port: activePort,
    code,
    syncId,
  });
}

async function generatePairQrDataUrl(code) {
  try {
    const QRCode = require('qrcode');
    return await QRCode.toDataURL(pairQrPayload(code), {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 480,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch (err) {
    console.warn('[desktop-sync] QR generation failed:', err.message);
    return null;
  }
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    const headers = {};
    const origin = corsOrigin(req);
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin;
      headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
      headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
      headers['Access-Control-Max-Age'] = '600';
      headers['Vary'] = 'Origin';
    }
    res.writeHead(204, headers);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${SYNC_PORT}`);
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && (route === '/discover' || route === '/health')) {
    json(req, res, 200, discoverPayload());
    return;
  }

  if (req.method === 'POST' && (route === '/pair/request' || route === '/pair/init' || route === '/pair/start' || route === '/sync/connect')) {
    if (pairingLockedOut()) {
      json(req, res, 429, { ok: false, error: 'Too many failed pairing attempts — try again in a few minutes' });
      return;
    }
    const body = await readBody(req);
    const clientDevice = (body && (body.deviceName || body.device || body.name)) ? String(body.deviceName || body.device || body.name).trim() : 'Mobile Device';
    // Reuse the live code instead of minting a fresh one, so repeated requests cannot hand
    // an attacker a clean attempt counter.
    if (!pendingPair || Date.now() > pendingPair.expiresAt) {
      pendingPair = {
        requestId: crypto.randomBytes(8).toString('hex'),
        code: generatePairCode(),
        deviceName: clientDevice,
        expiresAt: Date.now() + PAIR_TTL_MS,
        attempts: 0,
      };
    }
    notifyRenderer('mobile-pair-request', {
      requestId: pendingPair.requestId,
      code: pendingPair.code,
      deviceName: pendingPair.deviceName,
      expiresIn: PAIR_TTL_S,
    }, { focus: true });
    json(req, res, 200, {
      ok: true,
      requestId: pendingPair.requestId,
      expiresIn: PAIR_TTL_S,
      syncId,
      deviceName: pendingPair.deviceName,
    });
    return;
  }

  if (req.method === 'POST' && route === '/pair/verify') {
    if (pairingLockedOut()) {
      json(req, res, 429, { ok: false, error: 'Too many failed pairing attempts — try again in a few minutes' });
      return;
    }
    const body = await readBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    const requestId = String(body.requestId || '');
    if (!pendingPair) {
      json(req, res, 400, { ok: false, error: 'No active pairing request' });
      return;
    }
    // QR scans carry only the code; manual pairing carries requestId too.
    if (requestId && pendingPair.requestId !== requestId) {
      json(req, res, 400, { ok: false, error: 'No active pairing request' });
      return;
    }
    if (Date.now() > pendingPair.expiresAt) {
      pendingPair = null;
      json(req, res, 400, { ok: false, error: 'Pairing code expired' });
      return;
    }
    if (code !== pendingPair.code) {
      pendingPair.attempts = (pendingPair.attempts || 0) + 1;
      const total = registerVerifyFailure();
      if (pendingPair.attempts >= MAX_VERIFY_ATTEMPTS || total >= MAX_VERIFY_FAILURES_PER_WINDOW) {
        pendingPair = null;
        notifyRenderer('mobile-pair-dismissed', {});
        json(req, res, 429, { ok: false, error: 'Too many failed attempts — generate a new code on the PC' });
        return;
      }
      json(req, res, 401, { ok: false, error: 'Invalid pairing code' });
      return;
    }
    clearVerifyFailures();
    const token = generateToken();
    const rawTokens = loadConfig().mobilePairTokens || [];
    const clientDevName = (body.deviceName || (pendingPair && pendingPair.deviceName) || 'Brown Mobile').trim();
    const clientPlatform = body.platform || (pendingPair && pendingPair.platform) || 'android';

    // Revoke any previous active tokens for the same device to prevent duplicates
    const updatedTokens = rawTokens.map(t => {
      const matchName = t.deviceName && t.deviceName.trim().toLowerCase() === clientDevName.toLowerCase();
      if (matchName && !t.revoked) {
        return { ...t, revoked: true, revokedAt: Date.now() };
      }
      return t;
    });

    updatedTokens.push({
      token,
      createdAt: Date.now(),
      deviceName: clientDevName,
      platform: clientPlatform,
      lanFingerprint: lanFingerprint(),
    });
    saveConfigPatch({ mobilePairTokens: updatedTokens, ultronSyncId: syncId });
    pendingPair = null;
    notifyRenderer('mobile-pair-complete', { deviceName: clientDevName, platform: clientPlatform });
    json(req, res, 200, {
      ok: true,
      token,
      desktop: { ...discoverPayload(), geminiApiKey: loadConfig().geminiApiKey || '' },
      profile: getSyncedProfile(),
    });
    return;
  }

  if (req.method === 'POST' && route === '/pair/deny') {
    pendingPair = null;
    notifyRenderer('mobile-pair-dismissed', {});
    json(req, res, 200, { ok: true });
    return;
  }

  const token = authToken(req);
  const tokenRec = findToken(token);
  const protectedRoute =
    route.startsWith('/ollama') ||
    route.startsWith('/gemini') ||
    route.startsWith('/sync') ||
    route.startsWith('/stt') ||
    route === '/profile' ||
    route === '/chats' ||
    route === '/session';
  if (protectedRoute && !tokenRec) {
    json(req, res, 401, { ok: false, error: 'Unauthorized', needReauth: true });
    return;
  }

  // The token proves who the device is; the fingerprint proves it is asking from the network
  // it was paired on. Checked on every protected route — a token lifted on one LAN must not
  // work from another. networksOverlap() only needs one /24 in common, so normal roaming is fine.
  if (tokenRec && tokenRec.lanFingerprint && !networksOverlap(tokenRec.lanFingerprint)) {
    json(req, res, 401, { ok: false, needReauth: true, error: 'Network changed' });
    return;
  }

  if (req.method === 'GET' && route === '/session') {
    json(req, res, 200, {
      ok: true,
      syncId,
      profile: getSyncedProfile(),
      addresses: getLanAddresses(),
    });
    return;
  }

  if (req.method === 'GET' && route === '/profile') {
    json(req, res, 200, { ok: true, profile: getSyncedProfile() });
    return;
  }

  if (req.method === 'POST' && route === '/profile') {
    const body = await readBody(req);
    const patch = {};
    if (typeof body.displayName === 'string') patch.displayName = body.displayName;
    if (typeof body.email === 'string') patch.email = body.email;
    if (typeof body.systemPrompt === 'string') patch.systemPrompt = body.systemPrompt;
    if (typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim()) {
      patch.geminiApiKey = body.geminiApiKey.trim();
    }
    saveConfigPatch(patch);
    notifyRenderer('mobile-profile-updated', getSyncedProfile());
    json(req, res, 200, { ok: true, profile: getSyncedProfile() });
    return;
  }

  if (req.method === 'GET' && route === '/chats') {
    const store = loadConversationsStore();
    const sessions = normalizeSessions(store);
    const messageCount = sessions.reduce((n, s) => n + (s.messages ? s.messages.length : 0), 0);
    const consent = await requestChatConsent({
      direction: 'pc-to-phone',
      title: 'Send desktop chats to your phone?',
      detail: `Brown Mobile wants to copy ${sessions.length} conversation${sessions.length === 1 ? '' : 's'} (${messageCount} messages) from this PC to the phone.`,
      sessionCount: sessions.length,
      messageCount,
    });
    if (!consent.approved) {
      json(req, res, 403, { ok: false, denied: true, error: consent.error || 'Declined on the PC' });
      return;
    }
    json(req, res, 200, { ok: true, sessions });
    return;
  }

  if (req.method === 'POST' && route === '/chats') {
    const body = await readBody(req);
    const incoming = Array.isArray(body.sessions) ? body.sessions : [];
    const messageCount = incoming.reduce((n, s) => n + ((s.messages && s.messages.length) || 0), 0);
    const consent = await requestChatConsent({
      direction: 'phone-to-pc',
      title: 'Save phone chats on this PC?',
      detail: `Brown Mobile wants to export ${incoming.length} conversation${incoming.length === 1 ? '' : 's'} (${messageCount} messages) from the phone onto this workstation.`,
      sessionCount: incoming.length,
      messageCount,
    });
    if (!consent.approved) {
      json(req, res, 403, { ok: false, denied: true, error: consent.error || 'Declined on the PC' });
      return;
    }
    const merged = mergeIncomingSessions(incoming);
    notifyRenderer('mobile-chats-imported', { merged });
    json(req, res, 200, { ok: true, merged });
    return;
  }

  if (req.method === 'POST' && (route === '/pair/unpair' || route === '/sync/unpair' || route === '/pair/disconnect' || route === '/sync/disconnect')) {
    if (tokenRec) {
      revokePairedDevice(tokenRec.id || tokenRec.token);
    }
    json(req, res, 200, { ok: true, message: 'Unpaired successfully' });
    return;
  }

  if (req.method === 'GET' && route === '/ollama/tags') {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      if (!response.ok) {
        json(req, res, 502, { ok: false, error: 'Ollama is not running on this PC' });
        return;
      }
      const data = await response.json();
      json(req, res, 200, { ok: true, models: data.models || [] });
    } catch (err) {
      json(req, res, 502, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === 'GET' && route === '/gemini-key') {
    json(req, res, 200, { ok: true, geminiApiKey: loadConfig().geminiApiKey || '' });
    return;
  }

  if (req.method === 'POST' && route === '/ollama/chat') {
    const body = await readBody(req);
    try {
      let response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: body.model,
          messages: body.messages || [],
          stream: false,
          options: { num_ctx: 2048, ...(body.options || {}) },
        }),
      });
      let data = await response.json();

      // If GPU memory allocation failed, retry automatically with CPU offload
      if (!response.ok && data?.error && /allocate|buffer|cuda|out of memory|vram|projector cpu offload/i.test(data.error)) {
        console.warn(`[desktop-sync] GPU allocation failed for ${body.model}, retrying with CPU offload...`);
        try {
          const cpuResponse = await fetch('http://127.0.0.1:11434/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: body.model,
              messages: body.messages || [],
              stream: false,
              options: { num_gpu: 0, num_ctx: 2048 },
            }),
          });
          if (cpuResponse.ok) {
            const cpuData = await cpuResponse.json();
            json(req, res, 200, { ok: true, ...cpuData });
            return;
          }
        } catch {}
      }

      if (!response.ok) {
        let errStr = data?.error || 'Inference failed on desktop';
        if (/allocate|buffer|cuda|out of memory|vram|projector cpu offload/i.test(errStr)) {
          errStr = `PC Out of Memory: Your desktop ran out of GPU/RAM memory while loading "${body.model}". Please choose a lighter model (like Llama 3.2 1B/3B) or free up memory on your PC.`;
        } else if (/not found|try pulling/i.test(errStr)) {
          errStr = `Model "${body.model}" is not installed in Ollama on your PC.`;
        }
        json(req, res, 502, { ok: false, error: errStr });
        return;
      }

      json(req, res, 200, { ok: true, ...data });
    } catch (err) {
      json(req, res, 502, { ok: false, error: `Desktop connection error: ${err.message}` });
    }
    return;
  }

  // Whisper STT proxy — the phone records PCM WAV and borrows the PC's engine.
  if (req.method === 'GET' && route === '/stt/status') {
    try {
      const { isWhisperReady } = require('./voice-whisper');
      json(req, res, 200, { ok: true, ready: isWhisperReady() });
    } catch (err) {
      json(req, res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === 'POST' && route === '/stt/warmup') {
    try {
      const { warmupWhisper } = require('./voice-whisper');
      warmupWhisper().then((r) => {
        if (!r?.success) console.warn('[desktop-sync] whisper warmup failed:', r?.error);
      });
      json(req, res, 200, { ok: true, started: true });
    } catch (err) {
      json(req, res, 500, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === 'POST' && route === '/stt') {
    const body = await readBody(req);
    const b64 = String(body.audio || '');
    if (!b64) {
      json(req, res, 400, { ok: false, error: 'No audio received' });
      return;
    }
    // ~30s of 16kHz mono 16-bit PCM in base64 ≈ 2 MB; reject anything absurd.
    if (b64.length > 8 * 1024 * 1024) {
      json(req, res, 413, { ok: false, error: 'Recording too long (max ~30 seconds)' });
      return;
    }
    try {
      const { transcribeWhisperWavBuffer } = require('./voice-whisper');
      const wav = Buffer.from(b64, 'base64');
      const result = await transcribeWhisperWavBuffer(wav);
      if (result?.success && result.text) {
        json(req, res, 200, { ok: true, text: result.text });
      } else if (result?.busy) {
        json(req, res, 429, { ok: false, error: 'Whisper is busy with another recording — try again in a second' });
      } else {
        json(req, res, 502, { ok: false, error: result?.error || 'Whisper could not transcribe the recording' });
      }
    } catch (err) {
      json(req, res, 502, { ok: false, error: err.message || 'Whisper transcription failed' });
    }
    return;
  }

  json(req, res, 404, { ok: false, error: 'Not found' });
}

function startDesktopSyncServer(opts = {}) {
  getMainWindow = opts.getMainWindow || getMainWindow;
  const stored = loadConfig().ultronSyncId;
  syncId = stored || generateSyncId();
  if (!stored) saveConfigPatch({ ultronSyncId: syncId });

  if (server) return getSyncInfo();

  server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      console.warn('[desktop-sync]', err.message);
      const tooLarge = err && err.code === 'BODY_TOO_LARGE';
      try {
        json(req, res, tooLarge ? 413 : 500, {
          ok: false,
          error: tooLarge ? 'Upload too large' : 'Internal error',
        });
      } catch {}
      if (tooLarge) {
        // The response carries Connection: close, so the socket goes away once it is flushed.
        // Stop the remaining upload from arriving in the meantime.
        req.pause();
      }
    });
  });

  const listenOn = (ports) => {
    const [port, ...rest] = ports;
    // Keep the error and listening handlers paired: the old version called server.close()
    // between attempts, and a bind that completed late then reported a second port as live.
    const onListening = () => {
      server.removeListener('error', onError);
      activePort = port;
      console.log(`[desktop-sync] listening on 0.0.0.0:${port} id=${syncId}`);
    };
    const onError = (err) => {
      server.removeListener('listening', onListening);
      if (err.code === 'EADDRINUSE') {
        if (rest.length > 0) {
          console.warn(`[desktop-sync] port ${port} busy, trying ${rest[0]}...`);
          listenOn(rest);
        } else {
          console.error('[desktop-sync] all sync ports are in use — mobile pairing disabled');
        }
      } else {
        console.warn('[desktop-sync] server error:', err.message);
      }
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  };

  listenOn(PORT_FALLBACKS);

  return getSyncInfo();
}

function stopDesktopSyncServer() {
  if (server) {
    try { server.close(); } catch {}
    server = null;
  }
}

function getSyncInfo() {
  const tokens = loadConfig().mobilePairTokens || [];
  const activeTokens = tokens.filter(t => !t.revoked);
  const revokedTokens = tokens.filter(t => t.revoked);

  // Deduplicate active devices by deviceName (case-insensitive) keeping the newest active token
  const byNameActive = new Map();
  for (const t of activeTokens) {
    const key = (t.deviceName || 'Brown Mobile').trim().toLowerCase();
    const existing = byNameActive.get(key);
    if (!existing || (t.createdAt || 0) > (existing.createdAt || 0)) {
      byNameActive.set(key, t);
    }
  }

  const activeDevices = Array.from(byNameActive.values()).map(t => ({
    id: t.id || t.token?.slice(0, 8),
    tokenPrefix: t.token?.slice(0, 8) || '',
    deviceName: t.deviceName || 'Brown Mobile',
    platform: t.platform || 'android',
    createdAt: t.createdAt || Date.now(),
  }));

  // Deduplicate previous devices by deviceName
  const byNamePrevious = new Map();
  for (const t of revokedTokens) {
    const key = (t.deviceName || 'Brown Mobile').trim().toLowerCase();
    if (!byNameActive.has(key)) {
      const existing = byNamePrevious.get(key);
      const timeVal = t.revokedAt || t.createdAt || 0;
      const existTimeVal = existing ? (existing.revokedAt || existing.createdAt || 0) : 0;
      if (!existing || timeVal > existTimeVal) {
        byNamePrevious.set(key, t);
      }
    }
  }

  const previousDevices = Array.from(byNamePrevious.values()).map(t => ({
    id: t.id || t.token?.slice(0, 8),
    tokenPrefix: t.token?.slice(0, 8) || '',
    deviceName: t.deviceName || 'Brown Mobile',
    platform: t.platform || 'android',
    lastConnectedAt: t.revokedAt || t.createdAt || Date.now(),
  }));

  return {
    syncId,
    port: activePort,
    addresses: getLanAddresses(),
    activeDevices,
    previousDevices,
    pending: pendingPair
      ? {
          requestId: pendingPair.requestId,
          code: pendingPair.code,
          expiresAt: pendingPair.expiresAt,
          deviceName: pendingPair.deviceName
        }
      : null,
  };
}

function listPairedDevices() {
  return getSyncInfo().activeDevices;
}

function clearPreviousDevices() {
  const tokens = loadConfig().mobilePairTokens || [];
  const activeTokens = tokens.filter(t => !t.revoked);
  saveConfigPatch({ mobilePairTokens: activeTokens });
  notifyRenderer('mobile-paired-devices-updated', { devices: activeTokens });
  return { success: true };
}

function revokePairedDevice(idOrPrefix) {
  const tokens = loadConfig().mobilePairTokens || [];
  const updated = tokens.map(t => {
    const match = (t.id && t.id === idOrPrefix) || (t.token && t.token.startsWith(idOrPrefix));
    if (match) {
      return { ...t, revoked: true, revokedAt: Date.now() };
    }
    return t;
  });
  saveConfigPatch({ mobilePairTokens: updated });
  notifyRenderer('mobile-paired-devices-updated', { devices: listPairedDevices() });
  return { success: true, devices: listPairedDevices() };
}

async function createDesktopPairCode() {
  const requestId = crypto.randomBytes(8).toString('hex');
  const code = generatePairCode();
  pendingPair = {
    requestId,
    code,
    deviceName: 'Brown Mobile Companion',
    expiresAt: Date.now() + PAIR_TTL_MS,
    attempts: 0,
  };
  notifyRenderer('mobile-pair-request', {
    requestId,
    code,
    deviceName: pendingPair.deviceName,
    expiresIn: PAIR_TTL_S,
  });
  const qrDataUrl = await generatePairQrDataUrl(code);
  return {
    success: true,
    code,
    requestId,
    qrDataUrl,
    qrPayload: pairQrPayload(code),
    expiresIn: PAIR_TTL_S,
    syncId,
    port: activePort,
    addresses: getLanAddresses(),
  };
}

function denyPendingPair() {
  pendingPair = null;
  notifyRenderer('mobile-pair-dismissed', {});
}

module.exports = {
  SYNC_PORT,
  startDesktopSyncServer,
  stopDesktopSyncServer,
  getSyncInfo,
  listPairedDevices,
  revokePairedDevice,
  clearPreviousDevices,
  createDesktopPairCode,
  denyPendingPair,
  resolveChatConsent,
};
