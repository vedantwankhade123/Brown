const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

function verifyWindowsRelease(file) {
  const target = path.resolve(file);
  if (!fs.statSync(target).isFile()) throw new Error('Installer does not exist.');
  const literal = "'" + target.replace(/'/g, "''") + "'";
  const signature = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `$ErrorActionPreference = 'Stop'; $s = Get-AuthenticodeSignature -LiteralPath ${literal}; [pscustomobject]@{ Status = $s.Status.ToString(); Publisher = $s.SignerCertificate.Subject; Timestamped = ($null -ne $s.TimeStamperCertificate) } | ConvertTo-Json -Compress`
  ], { encoding: 'utf8', windowsHide: true, env: { ...process.env, PSModulePath: path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/Modules') } }).trim());
  if (signature.Status !== 'Valid') throw new Error(`Release signature is ${signature.Status}. Configure trusted Windows code signing before distribution.`);
  if (!signature.Timestamped) throw new Error('Release signature has no timestamp. Rebuild with timestamped code signing.');
  return { file: target, size: fs.statSync(target).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'), ...signature };
}
module.exports = { verifyWindowsRelease };
if (require.main === module) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node scripts/verify-windows-release.cjs <installer.exe>');
    console.log(JSON.stringify(verifyWindowsRelease(process.argv[2]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
