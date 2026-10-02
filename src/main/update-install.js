const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

async function verifyInstaller(file, expected = {}) {
  const stat = await fs.promises.stat(file);
  if (!stat.isFile() || stat.size < 1024 * 1024) throw new Error('Installer is missing or incomplete. Download the update again.');
  if (expected.size && stat.size !== expected.size) throw new Error('Installer size does not match the release. Download it again.');
  const fd = await fs.promises.open(file, 'r');
  const magic = Buffer.alloc(2);
  try { await fd.read(magic, 0, 2, 0); } finally { await fd.close(); }
  if (magic.toString('ascii') !== 'MZ') throw new Error('The download is not a Windows installer.');
  const algorithm = expected.sha512 ? 'sha512' : expected.sha256 ? 'sha256' : null;
  if (!algorithm) throw new Error('Release checksum is missing. Re-check for updates before installing.');
  const hash = crypto.createHash(algorithm);
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  const digest = hash.digest(expected.sha512 ? 'base64' : 'hex');
  if (digest !== (expected.sha512 || expected.sha256)) throw new Error('Installer checksum failed. Download the update again.');
}

function startInstaller(file, installDirectory, spawnProcess = spawn) {
  return new Promise((resolve, reject) => {
    // /D must be last for NSIS. Reuse the current install directory on upgrades.
    const args = ['--updated', '--force-run', '/S', `/D=${installDirectory}`];
    const child = spawnProcess(file, args, { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}
module.exports = { verifyInstaller, startInstaller };
