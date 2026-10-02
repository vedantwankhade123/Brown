#!/usr/bin/env node
// Upload sequentially over HTTP/1.1, retry transient failures, and verify the
// server's digest before allowing the release pipeline to publish its draft.
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const repo = 'vedantwankhade123/Brown';
const [tag, file] = process.argv.slice(2);
if (!/^v\d+\.\d+\.\d+$/.test(tag || '') || !file) throw new Error('Provide a release tag and asset path.');
const gh = (...args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const name = path.basename(file);
const size = fs.statSync(file).size;
const digest = 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const token = gh('auth', 'token');

function upload(id) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(file, { highWaterMark: 256 * 1024 });
    const request = https.request({
      hostname: 'uploads.github.com',
      path: `/repos/${repo}/releases/${id}/assets?name=${encodeURIComponent(name)}`,
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Brown-Release-Uploader', Accept: 'application/vnd.github+json', 'Content-Type': 'application/octet-stream', 'Content-Length': size },
      ALPNProtocols: ['http/1.1']
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 201) return reject(new Error(`GitHub upload returned HTTP ${response.statusCode}`));
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.setTimeout(60000, () => request.destroy(new Error('Upload connection stalled.')));
    request.on('error', error => { input.destroy(); reject(error); });
    input.on('error', error => request.destroy(error));
    let sent = 0, lastReport = 0;
    input.on('data', chunk => {
      sent += chunk.length;
      if (Date.now() - lastReport > 10000) {
        lastReport = Date.now();
        console.log(`Sending ${name}: ${(sent / size * 100).toFixed(0)}%`);
      }
    });
    input.pipe(request);
  });
}

(async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const metadata = JSON.parse(gh('release', 'view', tag, '--repo', repo, '--json', 'apiUrl,isDraft'));
      if (!metadata.isDraft) throw new Error('Refusing to replace an asset in a published release.');
      const release = JSON.parse(gh('api', metadata.apiUrl));
      const existing = release.assets.find(asset => asset.name === name);
      if (existing?.state === 'uploaded' && existing.size === size && existing.digest === digest) {
        console.log(`Verified existing upload: ${name}`); return;
      }
      if (existing) gh('api', '-X', 'DELETE', existing.url);
      console.log(`Uploading ${name}, attempt ${attempt}`);
      const asset = await upload(release.id);
      if (asset.state !== 'uploaded' || asset.size !== size || asset.digest !== digest) throw new Error('Uploaded asset checksum or size differs from the local build.');
      console.log(`Verified upload: ${name}`); return;
    } catch (error) {
      console.error(`Upload attempt ${attempt}: ${error.message}`);
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
