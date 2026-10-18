const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createUpdateCache } = require('../src/main/update-cache');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'brown-update-test-'));
  try {
    const source = path.join(root, 'source.exe');
    const bytes = Buffer.alloc(1024 * 1024, 7); bytes.write('MZ');
    await fs.writeFile(source, bytes);
    const expected = { size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
    const payload = { version: '2.0.0', releaseNotes: 'Test release' };
    const cacheRoot = path.join(root, 'updates');
    const saved = await createUpdateCache(cacheRoot).save(source, payload, expected);
    await fs.unlink(source);
    const restored = await createUpdateCache(cacheRoot).restore('1.0.0', (a,b) => a.localeCompare(b));
    assert.equal(restored.path, saved.path);
    assert.equal(restored.payload.releaseNotes, payload.releaseNotes);
    assert.equal(await createUpdateCache(cacheRoot).restore('2.0.0', (a,b) => a.localeCompare(b)), null);
    await fs.writeFile(saved.path, Buffer.alloc(bytes.length));
    assert.equal(await createUpdateCache(cacheRoot).restore('1.0.0', (a,b) => a.localeCompare(b)), null);
    await fs.writeFile(path.join(cacheRoot, 'pending.json'), JSON.stringify({ file: '../outside.exe', payload, expected }));
    assert.equal(await createUpdateCache(cacheRoot).restore('1.0.0', (a,b) => a.localeCompare(b)), null);
    console.log('PASS: desktop installer survives source deletion and fresh cache instance, obsolete/corrupt/unsafe files rejected');
  } finally { await fs.rm(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
