/**
 * LAN pairing bridge for Ultron Desktop <-> Ultron Mobile.
 * HTTP on 0.0.0.0:49200 (WhatsApp-style pairing code).
 */
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const SYNC_PORT = 49200;
const PAIR_TTL_MS = 60 * 1000;

let server = null;
let syncId = '';
let pendingPair = null;
let pendingChatConsent = null;
let getMainWindow = () => null;

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
  return `ULTRON-WIN-${n}`;
}

function generatePairCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += alphabet[crypto.randomInt(alphabet.length)];
  }
  return code;
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

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve({});
      }
    });
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
    name: `${os.hostname() || 'Ultron-PC'} (Ultron Desktop)`,
    version: app.getVersion ? app.getVersion() : '1.0.0',
    port: SYNC_PORT,
    addresses: getLanAddresses(),
    ollama: 'http://127.0.0.1:11434',
  };
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    });
    res.end();
    return;
  }

  const url = new URL(req.url, `http://127.0.0.1:${SYNC_PORT}`);
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'GET' && (route === '/discover' || route === '/health')) {
    json(res, 200, discoverPayload());
    return;
  }

  if (req.method === 'POST' && route === '/pair/request') {
    const body = await readBody(req);
    const requestId = crypto.randomBytes(8).toString('hex');
    const code = generatePairCode();
    pendingPair = {
      requestId,
      code,
      deviceName: body.deviceName || 'Ultron Mobile',
      expiresAt: Date.now() + PAIR_TTL_MS,
    };
    notifyRenderer('mobile-pair-request', {
      requestId,
      code,
      deviceName: pendingPair.deviceName,
      expiresIn: 60,
    }, { focus: true });
    json(res, 200, { ok: true, requestId, expiresIn: 60, syncId });
    return;
  }

  if (req.method === 'POST' && route === '/pair/verify') {
    const body = await readBody(req);
    const code = String(body.code || '').trim().toUpperCase();
    const requestId = String(body.requestId || '');
    if (!pendingPair || pendingPair.requestId !== requestId) {
      json(res, 400, { ok: false, error: 'No active pairing request' });
      return;
    }
    if (Date.now() > pendingPair.expiresAt) {
      pendingPair = null;
      json(res, 400, { ok: false, error: 'Pairing code expired' });
      return;
    }
    if (code !== pendingPair.code) {
      json(res, 401, { ok: false, error: 'Invalid pairing code' });
      return;
    }
    const token = generateToken();
    const tokens = loadConfig().mobilePairTokens || [];
    tokens.push({
      token,
      createdAt: Date.now(),
      deviceName: pendingPair.deviceName,
      lanFingerprint: lanFingerprint(),
    });
    saveConfigPatch({ mobilePairTokens: tokens, ultronSyncId: syncId });
    pendingPair = null;
    notifyRenderer('mobile-pair-complete', { deviceName: body.deviceName || 'Ultron Mobile' });
    json(res, 200, {
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
    json(res, 200, { ok: true });
    return;
  }

  const token = authToken(req);
  const tokenRec = findToken(token);
  const protectedRoute =
    route.startsWith('/ollama') ||
    route.startsWith('/gemini') ||
    route.startsWith('/sync') ||
    route === '/profile' ||
    route === '/chats' ||
    route === '/session';
  if (protectedRoute && !tokenRec) {
    json(res, 401, { ok: false, error: 'Unauthorized', needReauth: true });
    return;
  }

  if (req.method === 'GET' && route === '/session') {
    if (tokenRec.lanFingerprint && !networksOverlap(tokenRec.lanFingerprint)) {
      json(res, 401, { ok: false, needReauth: true, error: 'Network changed' });
      return;
    }
    json(res, 200, {
      ok: true,
      syncId,
      profile: getSyncedProfile(),
      addresses: getLanAddresses(),
    });
    return;
  }

  if (req.method === 'GET' && route === '/profile') {
    json(res, 200, { ok: true, profile: getSyncedProfile() });
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
    json(res, 200, { ok: true, profile: getSyncedProfile() });
    return;
  }

  if (req.method === 'GET' && route === '/chats') {
    const store = loadConversationsStore();
    const sessions = normalizeSessions(store);
    const messageCount = sessions.reduce((n, s) => n + (s.messages ? s.messages.length : 0), 0);
    const consent = await requestChatConsent({
      direction: 'pc-to-phone',
      title: 'Send desktop chats to your phone?',
      detail: `Ultron Mobile wants to copy ${sessions.length} conversation${sessions.length === 1 ? '' : 's'} (${messageCount} messages) from this PC to the phone.`,
      sessionCount: sessions.length,
      messageCount,
    });
    if (!consent.approved) {
      json(res, 403, { ok: false, denied: true, error: consent.error || 'Declined on the PC' });
      return;
    }
    json(res, 200, { ok: true, sessions });
    return;
  }

  if (req.method === 'POST' && route === '/chats') {
    const body = await readBody(req);
    const incoming = Array.isArray(body.sessions) ? body.sessions : [];
    const messageCount = incoming.reduce((n, s) => n + ((s.messages && s.messages.length) || 0), 0);
    const consent = await requestChatConsent({
      direction: 'phone-to-pc',
      title: 'Save phone chats on this PC?',
      detail: `Ultron Mobile wants to export ${incoming.length} conversation${incoming.length === 1 ? '' : 's'} (${messageCount} messages) from the phone onto this workstation.`,
      sessionCount: incoming.length,
      messageCount,
    });
    if (!consent.approved) {
      json(res, 403, { ok: false, denied: true, error: consent.error || 'Declined on the PC' });
      return;
    }
    const merged = mergeIncomingSessions(incoming);
    notifyRenderer('mobile-chats-imported', { merged });
    json(res, 200, { ok: true, merged });
    return;
  }

  if (req.method === 'GET' && route === '/ollama/tags') {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      if (!response.ok) {
        json(res, 502, { ok: false, error: 'Ollama is not running on this PC' });
        return;
      }
      const data = await response.json();
      json(res, 200, { ok: true, models: data.models || [] });
    } catch (err) {
      json(res, 502, { ok: false, error: err.message });
    }
    return;
  }

  if (req.method === 'GET' && route === '/gemini-key') {
    json(res, 200, { ok: true, geminiApiKey: loadConfig().geminiApiKey || '' });
    return;
  }

  if (req.method === 'POST' && route === '/ollama/chat') {
    const body = await readBody(req);
    try {
      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: body.model,
          messages: body.messages || [],
          stream: false,
        }),
      });
      const data = await response.json();
      json(res, response.ok ? 200 : 502, { ok: response.ok, ...data });
    } catch (err) {
      json(res, 502, { ok: false, error: err.message });
    }
    return;
  }

  json(res, 404, { ok: false, error: 'Not found' });
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
      json(res, 500, { ok: false, error: 'Internal error' });
    });
  });

  server.on('error', (err) => {
    console.warn('[desktop-sync] server error:', err.message);
  });

  server.listen(SYNC_PORT, '0.0.0.0', () => {
    console.log(`[desktop-sync] listening on 0.0.0.0:${SYNC_PORT} id=${syncId}`);
  });

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
  const activeDevices = tokens
    .filter(t => !t.revoked)
    .map(t => ({
      id: t.id || t.token?.slice(0, 8),
      tokenPrefix: t.token?.slice(0, 8) || '',
      deviceName: t.deviceName || 'Ultron Mobile',
      createdAt: t.createdAt || Date.now(),
    }));

  return {
    syncId,
    port: SYNC_PORT,
    addresses: getLanAddresses(),
    activeDevices,
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
  const tokens = loadConfig().mobilePairTokens || [];
  return tokens.map(t => ({
    id: t.id || t.token?.slice(0, 8),
    tokenPrefix: t.token?.slice(0, 8) || '',
    deviceName: t.deviceName || 'Ultron Mobile',
    createdAt: t.createdAt || Date.now(),
    revoked: Boolean(t.revoked),
  }));
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

function createDesktopPairCode() {
  const requestId = crypto.randomBytes(8).toString('hex');
  const code = generatePairCode();
  pendingPair = {
    requestId,
    code,
    deviceName: 'Ultron Mobile Companion',
    expiresAt: Date.now() + PAIR_TTL_MS,
  };
  notifyRenderer('mobile-pair-request', {
    requestId,
    code,
    deviceName: pendingPair.deviceName,
    expiresIn: 60,
  });
  return {
    success: true,
    code,
    requestId,
    expiresIn: 60,
    syncId,
    port: SYNC_PORT,
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
  createDesktopPairCode,
  denyPendingPair,
  resolveChatConsent,
};
