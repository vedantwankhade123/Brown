const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { verifyInstaller, startInstaller } = require('../src/main/update-install');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brown-updater-test-'));
  const installer = path.join(dir, 'setup.exe');
  const bytes = Buffer.alloc(1024 * 1024 + 64); bytes.write('MZ');
  fs.writeFileSync(installer, bytes);
  const expected = { size: bytes.length, sha512: crypto.createHash('sha512').update(bytes).digest('base64') };
  await verifyInstaller(installer, expected);
  await assert.rejects(verifyInstaller(installer, { ...expected, size: bytes.length + 1 }), /size/);
  await assert.rejects(verifyInstaller(installer, { ...expected, sha512: 'bad' }), /checksum/);
  await assert.rejects(verifyInstaller(installer), /checksum/);
  fs.writeFileSync(installer, '<html>error</html>');
  await assert.rejects(verifyInstaller(installer, expected), /incomplete/);
  let child, launched = false;
  const pending = startInstaller('C:\\cache\\setup.exe', 'C:\\Users\\Example\\Brown AI', (file, args, options) => {
    assert.equal(args[0], '--updated'); assert(args.includes('--force-run')); assert(args.includes('/S'));
    assert.equal(args.at(-1), '/D=C:\\Users\\Example\\Brown AI');
    assert.equal(options.detached, true); assert.equal(options.windowsHide, true);
    child = new EventEmitter(); child.unref = () => { launched = true; }; return child;
  });
  assert.equal(launched, false); child.emit('spawn'); await pending; assert.equal(launched, true);
  await assert.rejects(startInstaller('missing.exe', 'C:\\Brown', () => {
    const failed = new EventEmitter(); queueMicrotask(() => failed.emit('error', new Error('launch failed'))); return failed;
  }), /launch failed/);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('PASS: installer integrity, truncation, launch confirmation, restart flags and launch failures');
})().catch(error => { console.error(error); process.exitCode = 1; });
