// Verify the public update feed and optionally exercise the real fallback download.
// Never installs an update or modifies the user's application profile.
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const vm = require('vm');
const assert = require('assert/strict');
const { EventEmitter } = require('events');
const { verifyInstaller } = require('../src/main/update-install');
const version = require('../package.json').version;
function get(url, remaining = 6) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Brown-Release-Verification' }, timeout: 30000 }, response => {
      if (response.headers.location && remaining > 0) {
        response.resume(); get(new URL(response.headers.location, url).href, remaining - 1).then(resolve, reject); return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`HTTP ${response.statusCode}: ${url}`)); return; }
      const chunks = []; response.on('data', chunk => chunks.push(chunk)); response.on('end', () => resolve(Buffer.concat(chunks))); response.on('error', reject);
    });
    request.on('error', reject); request.on('timeout', () => request.destroy(new Error('Release request timed out')));
  });
}
(async () => {
  const root = 'https://github.com/vedantwankhade123/Brown/releases/latest/download/';
  const release = JSON.parse(await get('https://api.github.com/repos/vedantwankhade123/Brown/releases/latest'));
  assert.equal(release.tag_name, `v${version}`);
  for (const name of ['Brown-AI-Setup.exe', 'Brown-AI-Portable.exe', 'latest.yml', `Brown-AI-Setup-v${version}.exe`, `Brown-AI-v${version}.exe`]) assert(release.assets.some(asset => asset.name === name && asset.state === 'uploaded'), `Missing ${name}`);
  const manifest = require('js-yaml').load((await get(root + 'latest.yml')).toString());
  assert.equal(manifest.version, version); assert.equal(manifest.path, 'Brown-AI-Setup.exe');
  assert.equal(manifest.files[0].url, manifest.path);
  const local = path.resolve(process.argv.find(arg => arg.startsWith('--installer='))?.slice(12) || `dist-desktop-v${version}/Brown-AI-Setup.exe`);
  await verifyInstaller(local, manifest.files[0]);
  console.log(`PASS: public v${version} release, stable/versioned assets and live manifest match local installer`);
  if (!process.argv.includes('--download')) return;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'brown-live-updater-'));
  const handlers = new Map(); const updater = new EventEmitter(); updater.setFeedURL = () => {};
  let previousPercent = -10;
  const electron = { app: { isPackaged: false, getVersion: () => '1.0.7', getPath: () => profile }, ipcMain: { handle: (name, handler) => handlers.set(name, handler) }, Notification: class { static isSupported() { return false; } } };
  const context = { module: { exports: {} }, console, process: { platform: 'win32', env: {} }, URL, setTimeout: () => {}, setInterval: () => {}, require: name => name === 'electron' ? electron : name === 'electron-updater' ? { autoUpdater: updater } : name === './update-install' ? require('../src/main/update-install') : require(name) };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/main/updater.js'), 'utf8'), context);
  context.module.exports.initAutoUpdater({ isDestroyed: () => false, webContents: { send: (_channel, payload) => { if (payload.status === 'downloading' && payload.percent >= previousPercent + 10) { previousPercent = payload.percent; console.log(`Live updater download: ${payload.percent}%`); } } } });
  const found = await handlers.get('check-for-updates')(); assert.equal(found.status, 'available'); assert.equal(found.version, version);
  const result = await handlers.get('download-update')(); assert.equal(result.status, 'downloaded', result.error);
  await verifyInstaller(path.join(profile, `Brown-Update-v${version}.exe`), manifest.files[0]);
  console.log(`PASS: actual updater discovers v${version}, downloads the public installer and validates its checksum. Installer was not launched. Test download: ${profile}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
