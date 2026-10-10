/**
 * LAN pairing bridge for Brown Desktop <-> Brown Mobile.
 * HTTP on 0.0.0.0:49200+ (WhatsApp-style pairing code + real scannable QR).
 */
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, powerSaveBlocker } = require('electron');
const companionCrypto = require('./companion-crypto');
const { Readable } = require('stream');
let relayClient = null;
const encryptedRequests = new Map();
const phoneActivity = new Map();
// Runtime-only: restarting either application starts a fresh connection session.
const phoneSessions = new Map();
const phoneModelRequests = new Map();
const disconnectedSessions = new Map();
function disconnectPairedDevice(identifier) {
  const record = (loadConfig().mobilePairTokens || []).find(t => !t.revoked && [t.id, t.token, companionCrypto.hash(t.token).slice(0, 16)].includes(identifier));
  if (!record) return { success: false, error: 'Paired device not found' };
  for (const controller of phoneModelRequests.get(record.token) || []) controller.abort();
  disconnectedSessions.set(record.token, phoneSessions.get(record.token) || '');
  phoneActivity.delete(companionCrypto.hash(record.token).slice(0, 16));
  notifyRenderer('mobile-paired-devices-updated', {});
  return { success: true };
}
const desktopJobs = new Map();
function getDeviceActivity() {
  return getSyncInfo().activeDevices.map(device => {
    const activity = phoneActivity.get(device.id);
    const fresh = activity && Date.now() - activity.updatedAt < 12000;
    if (activity && !fresh) phoneActivity.delete(device.id);
    return { ...device, usingDesktop: device.isConnected && (desktopJobs.get(device.id)?.count || 0) > 0,
      desktopModel: desktopJobs.get(device.id)?.model || '',
      activity: fresh && getConnectionSettings().enabled && device.preferences.livePreview ? activity : null };
  });
}

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

let awakeBlockerId = null;
function getConnectionSettings() {
  const config = loadConfig();
  return { enabled: config.mobileConnectionEnabled !== false, keepAwake: config.mobileKeepAwake === true,
    directUrl: config.mobileDirectUrl || '', relayUrl: config.mobileRelayUrl || '' };
}
function applyConnectionPower(settings) {
  if (settings.enabled && settings.keepAwake && awakeBlockerId === null) {
    awakeBlockerId = powerSaveBlocker.start('prevent-app-suspension');
  } else if ((!settings.enabled || !settings.keepAwake) && awakeBlockerId !== null) {
    powerSaveBlocker.stop(awakeBlockerId);
    awakeBlockerId = null;
  }
}
function setConnectionSettings(settings) {
  if (!settings || typeof settings.enabled !== 'boolean' || typeof settings.keepAwake !== 'boolean') {
    throw new Error('Invalid connection settings');
  }
  const current = getConnectionSettings();
  saveConfigPatch({ mobileConnectionEnabled: settings.enabled, mobileKeepAwake: settings.keepAwake,
    mobileDirectUrl: companionCrypto.endpoint(settings.directUrl ?? current.directUrl),
    mobileRelayUrl: companionCrypto.endpoint(settings.relayUrl ?? current.relayUrl, true) });
  if (!settings.enabled) { denyPendingPair(); resolveChatConsent(false); }
  applyConnectionPower(settings);
  restartRelay();
  return { success: true, ...getConnectionSettings() };
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
  const maxAge = rec.secureCompanion ? Infinity : 45 * 24 * 60 * 60 * 1000;
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

async function saveConversationsStore(store) {
  const file = conversationsFile();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.promises.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8');
  await fs.promises.rename(tmp, file);
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
      syncOrigin: session.syncOrigin || 'desktop',
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

async function mergeIncomingSessions(incoming) {
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
        syncOrigin: session.syncOrigin === 'desktop' ? 'both' : 'mobile',
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
    existing.syncOrigin = 'both';
    existing.updatedAt = new Date().toISOString();
  }
  await saveConversationsStore(store);
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
    companion: companionInfo(),
    ollama: 'http://127.0.0.1:11434',
  };
}

function pairQrPayload(code) {
  const ips = getLanAddresses();
  return JSON.stringify({
    v: 2,
    type: 'brown-pair',
    name: `${os.hostname() || 'Brown-PC'} (Brown Desktop)`,
    ip: ips[0] || '127.0.0.1',
    ips,
    port: activePort,
    code,
    syncId,
    companion: { ...companionInfo(), bootstrapKey: pendingPair?.bootstrapKey, keyId: pendingPair?.requestId },
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
  if (!getConnectionSettings().enabled) {
    json(req, res, 403, { ok: false, error: 'Mobile access is disabled on this desktop' });
    return;
  }
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
  if (req.method === 'POST' && route === '/companion') {
    try { json(req, res, 200, await handleEncryptedRequest(await readBody(req))); }
    catch { json(req, res, 401, { ok: false, error: 'Companion authentication failed' }); }
    return;
  }

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
        bootstrapKey: crypto.randomBytes(32).toString('hex'),
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
      secureCompanion: req.secureCompanion === true,
      preferences: { modelAccess: true, voiceAccess: true, profileMode: 'separate' },
      lastSeen: Date.now(),
      createdAt: Date.now(),
      deviceName: clientDevName,
      platform: clientPlatform,
      lanFingerprint: lanFingerprint(),
    });
    saveConfigPatch({ mobilePairTokens: updatedTokens, ultronSyncId: syncId });
    pendingPair = null;
    notifyRenderer('mobile-pair-complete', { deviceName: clientDevName, platform: clientPlatform, id: companionCrypto.hash(token).slice(0, 16) });
    json(req, res, 200, {
      ok: true,
      token,
      desktop: discoverPayload(),
      preferences: { modelAccess: true, voiceAccess: true, profileMode: 'separate' },
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
  if (tokenRec && !req.secureCompanion && tokenRec.lanFingerprint && !networksOverlap(tokenRec.lanFingerprint)) {
    json(req, res, 401, { ok: false, needReauth: true, error: 'Network changed' });
    return;
  }

  if (tokenRec) {
    const session = String(req.headers['x-brown-session'] || '').slice(0, 100);
    if (session) {
      const previous = phoneSessions.get(tokenRec.token);
      if (previous && previous !== session) disconnectedSessions.delete(tokenRec.token);
      phoneSessions.set(tokenRec.token, session);
    }
    if (disconnectedSessions.has(tokenRec.token)) {
      json(req, res, route === '/session' ? 200 : 409, { ok: route === '/session', syncId, disconnected: true, error: 'Disconnected for this session. Reopen either app to reconnect.' });
      return;
    }
  }
  if (req.method === 'POST' && route === '/sync/disconnect') {
    json(req, res, 200, disconnectPairedDevice(tokenRec.token)); return;
  }
  if (req.method === 'GET' && route === '/session') {
    if (Date.now() - (tokenRec.lastSeen || 0) > 10000) patchDevice(tokenRec.token, { lastSeen: Date.now() });
    json(req, res, 200, {
      ok: true,
      syncId,
      profile: devicePreferences(tokenRec).profileMode === 'shared' ? getSyncedProfile() : undefined,
      preferences: devicePreferences(tokenRec),
      transferRequest: tokenRec.transferRequest?.expiresAt > Date.now() ? tokenRec.transferRequest : null,
      addresses: getLanAddresses(),
      companion: companionInfo(),
    });
    return;
  }

  if (req.method === 'POST' && route === '/sync/preferences') {
    const body = await readBody(req);
    json(req, res, 200, updateDevicePreferences(tokenRec.token, body));
    return;
  }
  if (req.method === 'POST' && route === '/sync/ack') {
    const body = await readBody(req);
    if (!tokenRec.transferRequest || tokenRec.transferRequest.expiresAt <= Date.now() || body.id !== tokenRec.transferRequest.id || typeof body.success !== 'boolean') { json(req, res, 409, { error: 'Transfer request expired or invalid' }); return; }
    patchDevice(tokenRec.token, { transferRequest: null, lastTransfer: { status: body.success ? 'completed' : 'declined', ts: Date.now() } });
    json(req, res, 200, { ok: true }); return;
  }
  if (req.method === 'POST' && route === '/sync/activity') {
    const body = await readBody(req);
    const id = companionCrypto.hash(tokenRec.token).slice(0, 16);
    if (!devicePreferences(tokenRec).livePreview) { phoneActivity.delete(id); json(req, res, 403, { error: 'Enable live chat preview on the phone first.' }); return; }
    if (body.visible === false) phoneActivity.delete(id);
    else {
      if (!Array.isArray(body.messages) || body.messages.length > 60 || JSON.stringify(body).length > 200000) { json(req, res, 400, { error: 'Preview is too large' }); return; }
      phoneActivity.set(id, { updatedAt: Date.now(), sessionId: String(body.sessionId || '').slice(0, 200), title: String(body.title || 'New chat').slice(0, 200), model: String(body.model || '').slice(0, 200), generating: body.generating === true,
        messages: body.messages.map(m => ({ id: String(m.id || '').slice(0, 200), role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || ''), isStreaming: m.isStreaming === true, statusLabel: String(m.statusLabel || '').slice(0, 100) })) });
    }
    json(req, res, 200, { ok: true }); return;
  }
  if ((route === '/profile' || route === '/gemini-key') && devicePreferences(tokenRec).profileMode !== 'shared') {
    json(req, res, 403, { ok: false, error: 'Profiles are kept separate. Enable shared profile on both devices to share settings.' }); return;
  }
  if ((route.startsWith('/ollama') && !devicePreferences(tokenRec).modelAccess) || (route.startsWith('/stt') && !devicePreferences(tokenRec).voiceAccess)) {
    json(req, res, 403, { ok: false, error: 'Desktop access is disabled for this phone.' }); return;
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
    const consent = hasRequestedTransfer(tokenRec, 'send') ? { approved: true } : await requestChatConsent({
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
    const consent = hasRequestedTransfer(tokenRec, 'import') ? { approved: true } : await requestChatConsent({
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
    const merged = await mergeIncomingSessions(incoming);
    notifyRenderer('mobile-chats-imported', { merged });
    json(req, res, 200, { ok: true, merged });
    return;
  }

  if (req.method === 'POST' && (route === '/pair/unpair' || route === '/sync/unpair' || route === '/pair/disconnect')) {
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
    const deviceId = companionCrypto.hash(tokenRec.token).slice(0, 16);
    const controller = new AbortController();
    const controllers = phoneModelRequests.get(tokenRec.token) || new Set();
    controllers.add(controller); phoneModelRequests.set(tokenRec.token, controllers);
    const job = desktopJobs.get(deviceId) || { count: 0 };
    desktopJobs.set(deviceId, { count: job.count + 1, model: String(body.model || '') });
    try {
      let response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        signal: controller.signal,
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
        signal: controller.signal,
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
    } finally {
      controllers.delete(controller); if (!controllers.size) phoneModelRequests.delete(tokenRec.token);
      const current = desktopJobs.get(deviceId);
      if (current?.count > 1) desktopJobs.set(deviceId, { ...current, count: current.count - 1 });
      else desktopJobs.delete(deviceId);
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
    const deviceId = companionCrypto.hash(tokenRec.token).slice(0, 16);
    const job = desktopJobs.get(deviceId) || { count: 0 };
    desktopJobs.set(deviceId, { count: job.count + 1, model: 'Voice recognition' });
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
    } finally {
      const current = desktopJobs.get(deviceId);
      if (current?.count > 1) desktopJobs.set(deviceId, { ...current, count: current.count - 1 });
      else desktopJobs.delete(deviceId);
    }
    return;
  }

  json(req, res, 404, { ok: false, error: 'Not found' });
}

function devicePreferences(record) {
  return { modelAccess: record?.preferences?.modelAccess !== false, voiceAccess: record?.preferences?.voiceAccess !== false,
    livePreview: record?.preferences?.livePreview === true,
    profileMode: record?.preferences?.profileMode === 'shared' ? 'shared' : 'separate' };
}
function patchDevice(identifier, patch) {
  const cfg = loadConfig();
  let matched = false;
  const tokens = (cfg.mobilePairTokens || []).map(t => {
    if (t.revoked || ![t.token, t.id, companionCrypto.hash(t.token).slice(0, 16)].includes(identifier)) return t;
    matched = true; return { ...t, ...patch };
  });
  if (!matched) throw Error('Paired phone not found');
  saveConfigPatch({ mobilePairTokens: tokens });
  notifyRenderer('mobile-paired-devices-updated', {});
}
function updateDevicePreferences(identifier, settings) {
  if (typeof settings.modelAccess !== 'boolean' || typeof settings.voiceAccess !== 'boolean' || !['shared', 'separate'].includes(settings.profileMode)) throw Error('Invalid device preferences');
  const record = (loadConfig().mobilePairTokens || []).find(t => !t.revoked && [t.token, t.id, companionCrypto.hash(t.token).slice(0, 16)].includes(identifier));
  if (!record) throw Error('Paired phone not found');
  // Profile sharing needs both ends to opt in. The phone's authenticated request
  // is its consent; desktop-side selection alone does not disclose credentials.
  const preferences = { ...settings, livePreview: identifier === record.token && typeof settings.livePreview === 'boolean' ? settings.livePreview : record.preferences?.livePreview === true, profileMode: settings.profileMode === 'shared' && identifier !== record.token && record.preferences?.profileMode !== 'shared' ? 'separate' : settings.profileMode };
  patchDevice(identifier, { preferences });
  if (settings.profileMode === 'shared' && preferences.profileMode === 'separate') queueChatTransfer(identifier, 'profile');
  return { success: true, ok: true, preferences };
}
function queueChatTransfer(identifier, action) {
  if (!['import', 'send', 'merge', 'profile'].includes(action)) throw Error('Invalid transfer action');
  const record = (loadConfig().mobilePairTokens || []).find(t => !t.revoked && [t.token, t.id, companionCrypto.hash(t.token).slice(0, 16)].includes(identifier));
  if (record?.transferRequest?.expiresAt > Date.now()) throw Error('A request is already waiting for phone approval. Complete it or wait for it to expire.');
  const transferRequest = { id: crypto.randomBytes(16).toString('hex'), action, expiresAt: Date.now() + 300000 };
  patchDevice(identifier, { transferRequest });
  return { success: true, transferRequest };
}
function hasRequestedTransfer(record, direction) {
  const request = record?.transferRequest;
  return request?.expiresAt > Date.now() && [direction, 'merge'].includes(request.action);
}

function companionInfo() {
  const settings = getConnectionSettings();
  const owner = loadConfig().mobileRelayOwner;
  return { v: 2, addresses: getLanAddresses(), directUrl: settings.directUrl,
    relayUrl: settings.relayUrl, relayRoom: owner ? companionCrypto.hash(owner) : '' };
}

function restartRelay() {
  relayClient?.stop(); relayClient = null;
  const settings = getConnectionSettings();
  if (!server || !settings.enabled || !settings.relayUrl) return;
  let owner = loadConfig().mobileRelayOwner;
  if (!owner) { owner = crypto.randomBytes(32).toString('hex'); saveConfigPatch({ mobileRelayOwner: owner }); }
  const { CompanionRelayClient } = require('./companion-relay-client');
  relayClient = new CompanionRelayClient(settings.relayUrl, owner, handleEncryptedRequest);
}

async function handleEncryptedRequest(envelope) {
  if (!getConnectionSettings().enabled) throw Error('Disabled');
  let secret, token;
  if (pendingPair && pendingPair.requestId === envelope.keyId && Date.now() < pendingPair.expiresAt) secret = pendingPair.bootstrapKey;
  else {
    const record = (loadConfig().mobilePairTokens || []).find(t => !t.revoked && companionCrypto.hash(t.token).slice(0, 32) === envelope.keyId);
    if (!record || !findToken(record.token)) throw Error('Revoked');
    secret = token = record.token;
  }
  const payload = companionCrypto.open(secret, envelope, 'request');
  if (!Number.isFinite(payload.ts) || Math.abs(Date.now() - payload.ts) > 300000) throw Error('Expired request');
  for (const [id, ts] of encryptedRequests) if (Date.now() - ts > 300000) encryptedRequests.delete(id);
  const replayId = `${envelope.keyId}:${envelope.id}`;
  if (encryptedRequests.has(replayId) || encryptedRequests.size >= 4096) throw Error('Repeated request');
  encryptedRequests.set(replayId, Date.now());
  if (!['GET', 'POST'].includes(payload.method) || !/^\/(discover|session|profile|chats|gemini-key|sync\/(preferences|ack|activity|disconnect)|ollama\/(tags|chat)|stt(?:\/(warmup|status))?|pair\/(verify|unpair))$/.test(payload.path)) throw Error('Invalid route');
  if (!token && !['/pair/verify', '/discover'].includes(payload.path)) throw Error('Pairing required');
  const req = Readable.from([Buffer.from(payload.body || '{}')]);
  req.method = payload.method; req.url = payload.path; req.secureCompanion = true;
  req.headers = token ? { authorization: `Bearer ${token}`, 'x-brown-session': String(payload.sessionId || '').slice(0, 100) } : {};
  return new Promise((resolve, reject) => {
    let status = 200;
    const res = { writeHead(code) { status = code; }, end(body) {
      try { resolve(companionCrypto.seal(secret, envelope.keyId, envelope.id, 'response', { status, body: JSON.parse(body || '{}') })); } catch (err) { reject(err); }
    } };
    handleRequest(req, res).catch(reject);
  });
}

function startDesktopSyncServer(opts = {}) {
  getMainWindow = opts.getMainWindow || getMainWindow;
  const stored = loadConfig().ultronSyncId;
  syncId = stored || generateSyncId();
  if (!stored) saveConfigPatch({ ultronSyncId: syncId });

  applyConnectionPower(getConnectionSettings());
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
      restartRelay();
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
  relayClient?.stop(); relayClient = null;
  encryptedRequests.clear();
  if (awakeBlockerId !== null) { powerSaveBlocker.stop(awakeBlockerId); awakeBlockerId = null; }
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
    id: t.id || companionCrypto.hash(t.token).slice(0, 16),
    tokenPrefix: t.token?.slice(0, 8) || '',
    deviceName: t.deviceName || 'Brown Mobile',
    platform: t.platform || 'android',
    createdAt: t.createdAt || Date.now(),
    sessionDisconnected: disconnectedSessions.has(t.token),
    isConnected: !disconnectedSessions.has(t.token) && getConnectionSettings().enabled && Date.now() - (t.lastSeen || 0) < 45000,
    preferences: devicePreferences(t),
    transferRequest: t.transferRequest?.expiresAt > Date.now() ? t.transferRequest : null,
    lastTransfer: t.lastTransfer,
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
    const match = (t.id && t.id === idOrPrefix) || (t.token && (t.token.startsWith(idOrPrefix) || companionCrypto.hash(t.token).slice(0, 16) === idOrPrefix));
    if (match) {
      phoneActivity.delete(companionCrypto.hash(t.token).slice(0, 16));
      return { ...t, revoked: true, revokedAt: Date.now() };
    }
    return t;
  });
  saveConfigPatch({ mobilePairTokens: updated });
  notifyRenderer('mobile-paired-devices-updated', { devices: listPairedDevices() });
  return { success: true, devices: listPairedDevices() };
}

async function createDesktopPairCode() {
  if (!getConnectionSettings().enabled) return { success: false, error: 'Enable mobile access before pairing.' };
  const requestId = crypto.randomBytes(8).toString('hex');
  const code = generatePairCode();
  pendingPair = {
    requestId,
    code,
    bootstrapKey: crypto.randomBytes(32).toString('hex'),
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
  getDeviceActivity,
  disconnectPairedDevice,
  updateDevicePreferences,
  queueChatTransfer,
  getConnectionSettings,
  setConnectionSettings,
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
