const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'brown-connection-test-'));
  const events = [];
  let handler;
  const exports = {};
  const context = {
    module: { exports }, exports, console, Buffer, URL, setTimeout, clearTimeout,
    require(name) {
      if (name === 'electron') return { app: { getPath: () => directory }, powerSaveBlocker: { start: type => { events.push(['start', type]); return 7; }, stop: id => events.push(['stop', id]) } };
      if (name === 'http') return { createServer(callback) { handler = callback; return { on() {}, once() {}, listen() {}, close() {} }; } };
      if (name.startsWith('./')) return require(path.join(__dirname, '../src/main', name));
      return require(name);
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/desktop-sync-server.js'), 'utf8'), context);
  return { api: context.module.exports, events, request: (...args) => handler(...args), cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) };
}
test('connection settings persist and sleep blocker follows enabled access', () => {
  const s = setup();
  try {
    assert.equal(s.api.getConnectionSettings().enabled, true);
    s.api.setConnectionSettings({ enabled: true, keepAwake: true });
    s.api.setConnectionSettings({ enabled: true, keepAwake: true });
    assert.equal(s.events.length, 1);
    s.api.setConnectionSettings({ enabled: false, keepAwake: true });
    assert.equal(s.events[1][0], 'stop');
    assert.equal(s.api.getConnectionSettings().enabled, false);
    s.api.setConnectionSettings({ enabled: true, keepAwake: true });
    assert.equal(s.events[2][0], 'start');
    s.api.stopDesktopSyncServer();
    assert.equal(s.events[3][0], 'stop');
    assert.throws(() => s.api.setConnectionSettings({ enabled: 'yes', keepAwake: false }));
  } finally { s.cleanup(); }
});
test('disabled access rejects network requests and new pair codes', async () => {
  const s = setup();
  try {
    s.api.startDesktopSyncServer();
    s.api.setConnectionSettings({ enabled: false, keepAwake: false });
    let status, body;
    s.request({ method: 'GET', url: '/health', headers: {} }, { writeHead(code) { status = code; }, end(value) { body = JSON.parse(value); } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(status, 403);
    assert.equal(body.ok, false);
    assert.equal((await s.api.createDesktopPairCode()).success, false);
  } finally { s.api.stopDesktopSyncServer(); s.cleanup(); }
});

