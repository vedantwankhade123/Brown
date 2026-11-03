const fs = require('fs');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8' }).trim();
const pause = () => new Promise(r => setTimeout(r, 30000));
async function finish(repo, tag, files, activePid, mobile) {
  while (true) {
    const alive = execFileSync('powershell', ['-NoProfile', '-Command', `if (Get-Process -Id ${activePid} -ErrorAction SilentlyContinue) { 'running' }`], {encoding:'utf8'}).trim();
    if (!alive) break;
    await pause();
  }
  const api = gh('release', 'view', tag, '--repo', repo, '--json', 'apiUrl', '--jq', '.apiUrl');
  let release = JSON.parse(gh('api', api));
  if (!release.draft) throw Error('Release already published; inspect before proceeding.');
  if (mobile) {
    const old = release.assets.find(a => a.name === 'Brown-AI-Mobile-v1.0.5.apk' && a.state === 'uploaded');
    if (old) gh('api', '-X', 'PATCH', old.url, '-f', 'name=Brown-AI-Mobile.apk');
  }
  for (const file of files) execFileSync('node', [mobile ? 'scripts/upload-mobile-release-local.cjs' : 'scripts/upload-release-asset.js', tag, file], {stdio:'inherit'});
  release = JSON.parse(gh('api', api));
  for (const file of files) {
    const name = require('path').basename(file);
    const hash = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const asset = release.assets.find(a => a.name === name);
    if (!asset || asset.state !== 'uploaded' || asset.size !== fs.statSync(file).size || asset.digest !== hash) throw Error('Asset verification failed: ' + name);
  }
  if (release.assets.length !== files.length) throw Error('Unexpected extra assets; inspect draft.');
  gh('release', 'edit', tag, '--repo', repo, '--draft=false', '--latest');
  if (gh('api', `repos/${repo}/releases/latest`, '--jq', '.tag_name') !== tag) throw Error('Latest release mismatch');
  console.log('Published and verified: ' + repo + ' ' + tag);
}
Promise.allSettled([
  finish('vedantwankhade123/Brown', 'v1.0.1', ['D:/Ultron/dist/Brown-AI-Setup.exe','D:/Ultron/dist/Brown-AI-Portable.exe','D:/Ultron/dist/latest.yml'], 24240, false),
  finish('vedantwankhade123/Brown-Mobile', 'v1.0.5', ['D:/Ultron/mobile/dist/Brown-AI-Mobile.apk'], 2104, true)
]).then(results => { for (const result of results) if (result.status === 'rejected') { console.error(result.reason); process.exitCode = 1; } });
