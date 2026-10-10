'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path'), os = require('os'), vm = require('vm'), crypto = require('crypto'), http = require('http');
const wire = require('../src/main/companion-crypto');
const { createRelay } = require('../scripts/companion-relay');
const { CompanionRelayClient } = require('../src/main/companion-relay-client');
const WebSocket = require('ws');
const ts = require('../mobile/node_modules/typescript');
function mobileTransport() {
  const source = fs.readFileSync(path.join(__dirname, '../mobile/src/services/sync/CompanionTransport.ts'), 'utf8');
  const m = { exports: {} };
  const bridge = {
    keyId: async secret => wire.hash(secret).slice(0, 32),
    seal: async (secret, keyId, payload) => JSON.stringify(wire.seal(secret, keyId, crypto.randomBytes(16).toString('hex'), 'request', JSON.parse(payload))),
    open: async (secret, keyId, id, value) => { const envelope = JSON.parse(value); assert.equal(envelope.id, id); assert.equal(envelope.keyId, keyId); return JSON.stringify(wire.open(secret, envelope, 'response')); }
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 } }).outputText,
    { module: m, exports: m.exports, require: () => ({ requireOptionalNativeModule: () => bridge }), URL, AbortController, fetch, WebSocket, setTimeout, clearTimeout, Promise: require('../mobile/node_modules/promise/setimmediate/es6-extensions') });
  return m.exports;
}
test('encryption authenticates payloads, direction and request identity', () => {
  const secret = crypto.randomBytes(32).toString('hex'), id = crypto.randomBytes(16).toString('hex'), keyId = wire.hash(secret).slice(0, 32);
  const e = wire.seal(secret, keyId, id, 'request', { text: 'Private conversation' });
  assert.deepEqual(wire.open(secret, e, 'request'), { text: 'Private conversation' });
  assert.throws(() => wire.open(secret, e, 'response'));
  assert.throws(() => wire.open(secret, { ...e, id: 'a'.repeat(32) }, 'request'));
  assert.throws(() => wire.open(secret, { ...e, data: Buffer.alloc(40).toString('base64') }, 'request'));
  assert.throws(() => wire.endpoint('http://public.example.com'));
  assert.throws(() => wire.endpoint('ws://public.example.com', true));
  assert.throws(() => wire.endpoint('ws://10.attacker.example.com', true));
  assert.equal(mobileTransport().secureEndpoint('ws://10.attacker.example.com', true), null);
});
test('pair once, roam, prefer local then direct then encrypted relay, reject replay and revocation', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'brown-companion-'));
  let network = '10.1.2.5', desktopServer, finishModel;
  const module = { exports: {} };
  const context = {
    module, console, process, Buffer, URL, AbortController, setTimeout, clearTimeout,
    fetch: (...args) => String(args[0]).startsWith('http://127.0.0.1:11434/') ? new Promise(resolve => { finishModel = resolve; }) : fetch(...args),
    require(name) {
      if (name === 'electron') return { app: { getPath: () => folder, getVersion: () => 'test' }, powerSaveBlocker: { start: () => 1, stop() {} } };
      if (name === './paths') return { getUltronRuntimeRoot: () => folder };
      if (name === 'os') return { ...os, networkInterfaces: () => ({ wifi: [{ family: 'IPv4', address: network, internal: false }] }) };
      if (name === 'http') return { ...http, createServer(handler) { desktopServer = http.createServer(handler); return desktopServer; } };
      return require(name.startsWith('./') ? path.join(__dirname, '../src/main', name) : name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/desktop-sync-server.js'), 'utf8'), context);
  const api = module.exports;
  let relay, client;
  try {
    api.startDesktopSyncServer();
    await new Promise(resolve => desktopServer.once('listening', resolve));
    const pair = await api.createDesktopPairCode();
    const qr = JSON.parse(pair.qrPayload);
    const { CompanionTransport } = mobileTransport();
    const transport = new CompanionTransport();
    const desktop = { id: qr.syncId, syncId: qr.syncId, ipAddress: '127.0.0.1', port: api.getSyncInfo().port, companion: qr.companion };
    await transport.select(desktop, qr.companion.bootstrapKey, true);
    const paired = await transport.request(desktop, qr.companion.bootstrapKey, '/pair/verify', { method: 'POST', body: JSON.stringify({ code: pair.code, deviceName: 'Integration Phone' }) }, true);
    assert.equal(paired.status, 200);
    assert.equal(paired.body.profile, undefined, 'pairing alone does not share a profile');
    assert.equal(paired.body.preferences.profileMode, 'separate');
    const secret = paired.body.token;
    desktop.companion = paired.body.desktop.companion;
    network = '192.168.43.2';
    await transport.select(desktop, secret);
    assert.equal(transport.type, 'local');
    const deviceId = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 16);
    const snapshot = { visible: true, title: 'Live phone chat', model: 'Test model', generating: true, messages: [{ id: 'live-1', role: 'user', content: '<script>unsafe</script>' }] };
    assert.equal((await transport.request(desktop, secret, '/sync/activity', { method: 'POST', body: JSON.stringify(snapshot) })).status, 403, 'preview requires phone consent');
    api.updateDevicePreferences(deviceId, { modelAccess: true, voiceAccess: true, profileMode: 'separate', livePreview: true });
    assert.equal(api.getDeviceActivity()[0].preferences.livePreview, false, 'desktop cannot opt phone into live sharing');
    await transport.request(desktop, secret, '/sync/preferences', { method: 'POST', body: JSON.stringify({ modelAccess: true, voiceAccess: true, profileMode: 'separate', livePreview: true }) });
    assert.equal((await transport.request(desktop, secret, '/sync/activity', { method: 'POST', body: JSON.stringify(snapshot) })).status, 200);
    assert.equal(api.getDeviceActivity()[0].activity.messages[0].content, '<script>unsafe</script>', 'content is delivered as data');
    await transport.request(desktop, secret, '/sync/activity', { method: 'POST', body: JSON.stringify({ visible: false }) });
    assert.equal(api.getDeviceActivity()[0].activity, null, 'leaving phone chat clears the preview');
    const modelRequest = transport.request(desktop, secret, '/ollama/chat', { method: 'POST', body: JSON.stringify({ model: 'live-test-model', messages: [] }) });
    for (let i = 0; i < 50 && !finishModel; i++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(api.getDeviceActivity()[0].usingDesktop, true, 'active desktop inference is reported');
    assert.equal(api.getDeviceActivity()[0].desktopModel, 'live-test-model');
    finishModel({ ok: false, json: async () => ({ error: 'Test model unavailable' }) });
    assert.equal((await modelRequest).status, 502);
    assert.equal(api.getDeviceActivity()[0].usingDesktop, false, 'failed inference releases the active indicator');
    api.updateDevicePreferences(deviceId, { modelAccess: false, voiceAccess: false, profileMode: 'separate' });
    assert.equal((await transport.request(desktop, secret, '/ollama/tags')).status, 403, 'desktop model toggle is enforced');
    assert.equal((await transport.request(desktop, secret, '/stt/status')).status, 403, 'desktop voice toggle is enforced');
    assert.equal((await transport.request(desktop, secret, '/profile')).status, 403, 'separate profiles cannot be downloaded');
    api.updateDevicePreferences(deviceId, { modelAccess: true, voiceAccess: true, profileMode: 'shared' });
    let session = (await transport.request(desktop, secret, '/session')).body;
    assert.equal(session.preferences.profileMode, 'separate', 'desktop cannot share the phone profile without phone approval');
    assert.equal(session.transferRequest.action, 'profile');
    const profileRequestId = session.transferRequest.id;
    assert.equal((await transport.request(desktop, secret, '/sync/preferences', { method: 'POST', body: JSON.stringify({ profileMode: 'shared', modelAccess: true, voiceAccess: true }) })).status, 200);
    assert.equal((await transport.request(desktop, secret, '/sync/ack', { method: 'POST', body: JSON.stringify({ id: profileRequestId, success: true }) })).status, 200);
    session = (await transport.request(desktop, secret, '/session')).body;
    assert.equal(session.preferences.profileMode, 'shared');
    assert.equal(session.transferRequest, null);
    api.queueChatTransfer(deviceId, 'merge');
    session = (await transport.request(desktop, secret, '/session')).body;
    assert.equal(session.transferRequest.action, 'merge');
    const incoming = { sessions: [{ id: 'phone-chat', title: 'Phone chat', createdAt: 1, updatedAt: 2, messages: [{ id: 'phone-message', role: 'user', content: 'Imported from my phone', timestamp: 2 }] }] };
    for (let i = 0; i < 2; i++) assert.equal((await transport.request(desktop, secret, '/chats', { method: 'POST', body: JSON.stringify(incoming) })).status, 200);
    const importedStore = JSON.parse(fs.readFileSync(path.join(folder, 'conversations.json'), 'utf8'));
    assert.equal(importedStore['phone-chat'].messages.length, 1, 'repeated transfers deduplicate messages');
    assert.equal(importedStore['phone-chat'].syncOrigin, 'both', 'merged chats retain their shared origin');
    assert.equal((await transport.request(desktop, secret, '/chats')).body.sessions[0].syncOrigin, 'both');
    assert.equal((await transport.request(desktop, secret, '/sync/ack', { method: 'POST', body: JSON.stringify({ id: 'wrong', success: true }) })).status, 409);
    await transport.request(desktop, secret, '/sync/ack', { method: 'POST', body: JSON.stringify({ id: session.transferRequest.id, success: false }) });
    assert.equal(api.getSyncInfo().activeDevices[0].lastTransfer.status, 'declined');
    const body = { ts: Date.now(), path: '/session', method: 'GET' };
    const e = wire.seal(secret, wire.hash(secret).slice(0, 32), crypto.randomBytes(16).toString('hex'), 'request', body);
    const send = async () => fetch(`http://127.0.0.1:${desktop.port}/companion`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e) });
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 401, 'replay denied');
    relay = createRelay();
    await new Promise(resolve => relay.server.listen(0, '127.0.0.1', resolve));
    const owner = crypto.randomBytes(32).toString('hex');
    const relayUrl = `ws://127.0.0.1:${relay.server.address().port}`;
    client = new CompanionRelayClient(relayUrl, owner, async envelope => {
      const result = await fetch(`http://127.0.0.1:${desktop.port}/companion`, { method: 'POST', body: JSON.stringify(envelope) });
      return result.json();
    });
    await new Promise(resolve => client.socket.once('message', resolve));
    const remote = { ...desktop, ipAddress: '', companion: { ...desktop.companion, addresses: [], directUrl: `http://127.0.0.1:${desktop.port}`, relayUrl, relayRoom: wire.hash(owner) } };
    await transport.select(remote, secret);
    assert.equal(transport.type, 'direct', 'direct wins over available relay');
    remote.companion.directUrl = '';
    await transport.select(remote, secret);
    assert.equal(transport.type, 'relay');
    assert.equal((await transport.request(remote, secret, '/session')).body.syncId, desktop.syncId);

    assert.equal(api.disconnectPairedDevice(deviceId).success, true);
    assert.equal(api.listPairedDevices()[0].isConnected, false);
    assert.equal(api.listPairedDevices().length, 1, 'disconnect preserves pairing');
    assert.equal((await transport.request(remote, secret, '/session')).body.disconnected, true);
    assert.equal((await transport.request(remote, secret, '/ollama/tags')).status, 409, 'same session cannot use models');
    const restartedTransport = new (mobileTransport().CompanionTransport)();
    await restartedTransport.select(remote, secret);
    assert.equal((await restartedTransport.request(remote, secret, '/session')).body.disconnected, undefined, 'new mobile runtime reconnects');
    assert.equal((await restartedTransport.request(remote, secret, '/sync/disconnect', { method: 'POST' })).body.success, true);
    assert.equal((await restartedTransport.request(remote, secret, '/session')).body.disconnected, true, 'phone initiated disconnect blocks retries');
    const nextRuntime = new (mobileTransport().CompanionTransport)();
    await nextRuntime.select(remote, secret);
    api.revokePairedDevice(secret);
    await assert.rejects(() => transport.request(desktop, secret, '/session'));
    api.setConnectionSettings({ enabled: false, keepAwake: false });
    assert.equal((await send()).status, 403);
  } finally {
    client?.stop(); relay?.close(); api.stopDesktopSyncServer(); desktopServer?.closeAllConnections();
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
