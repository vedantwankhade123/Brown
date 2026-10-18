const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/main/updater.js'), 'utf8');
  const handlers = new Map(), opened = [];
  const electron = { app: { getVersion: () => '1.0.1' }, ipcMain: { handle: (name, fn) => handlers.set(name, fn) }, shell: { openExternal: async url => opened.push(url) } };
  const env = { module: { exports: {} }, process: { windowsStore: true }, require: name => name === 'electron' ? electron : name === 'electron-updater' ? { autoUpdater: new Proxy({}, { get() { throw Error('Store edition touched EXE updater'); } }) } : name.startsWith('./') ? {} : require(name) };
  vm.runInNewContext(source, env);
  env.module.exports.initAutoUpdater({});
  for (const channel of ['check-for-updates', 'download-update', 'restart-and-install']) {
    assert.equal((await handlers.get(channel)()).status, 'store-managed');
    assert.equal(opened.length, 0);
  }
  await handlers.get('open-store-updates')();
  assert.deepEqual(opened, ['ms-windows-store://pdp/?ProductId=9PGCR6DSJNCN']);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'brown-store-paths-'));
  try {
    const pathsEnv = { module: { exports: {} }, process: { windowsStore: true }, require: name => name === 'electron' ? { app: { isPackaged: true, getPath: key => { assert.equal(key, 'userData'); return root; } } } : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/paths.js'), 'utf8'), pathsEnv);
    assert.equal(pathsEnv.module.exports.getDefaultUltronRoot(), root);
    assert.equal(pathsEnv.module.exports.getDefaultAgentDataDir(), path.join(root, 'data'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  const config = require('../electron-builder.store.cjs');
  assert.equal(config.extraMetadata.distributionChannel, 'microsoft-store');
  assert.equal(config.publish, null);
  assert.equal(config.appx.identityName, 'BinaryThings.BrownAI');
  console.log('PASS: Store edition cannot invoke EXE updates, opens only its Store product, and stores data outside the immutable install directory');
})().catch(error => { console.error(error); process.exitCode = 1; });
