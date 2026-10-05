#!/usr/bin/env node
// Local release pipeline for the Windows desktop app.
//
// Everything is built and tested on this machine, then tagged and published to GitHub
// Releases. The website links at
// https://github.com/vedantwankhade123/Brown/releases/latest/download/Brown-AI-Setup.exe
// so the version-free alias asset names below are a contract with live users, not a
// preference — a release without them silently breaks the download page.
//
//   node scripts/release-desktop.js --version 1.0.3        prepare, test, build, stage
//   node scripts/release-desktop.js --publish              tag HEAD, push, publish
//
// Between the two steps you review dist/ and install the staged Setup exe yourself.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.resolve(ROOT, argValue('output-dir') || 'dist');
const REPO = 'vedantwankhade123/Brown';

function sh(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: opts.pipe ? 'pipe' : 'inherit', ...opts });
}

function die(message) {
  console.error(`\n[release] ${message}\n`);
  process.exit(1);
}

function arg(name, fallback = '') {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

/** Flag value only when the flag was given with one; a bare flag yields ''. */
function argValue(name) {
  const value = arg(name, '');
  return typeof value === 'string' ? value : '';
}

const publish = !!arg('publish');
const includeOriginalNames = !!arg('include-original-names');
const wantedVersion = argValue('version');

// ----------------------------------------------------------------------------- resolve version
const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

if (process.argv.includes('--version') && !wantedVersion) {
  die('--version needs a value, e.g. --version 1.0.3');
}

if (publish && wantedVersion) die('--version belongs to the prepare step; --publish only verifies.');

if (wantedVersion) {
  const v = wantedVersion.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+$/.test(v)) die(`--version must be major.minor.patch, got "${wantedVersion}"`);
  pkg.version = v;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  console.log(`[release] package.json version -> ${v}`);
}

const version = pkg.version;
const tag = `v${version}`;
console.log(`[release] version ${version}  tag ${tag}  repo ${REPO}`);

// ----------------------------------------------------------------------------- release notes
const notesPath = path.join(ROOT, '.release-notes.md');
const versionedNotes = path.join(ROOT, `.release-notes-v${version}.md`);
if (fs.existsSync(versionedNotes)) {
  fs.copyFileSync(versionedNotes, notesPath);
  console.log(`[release] notes from .release-notes-v${version}.md`);
} else if (!fs.existsSync(notesPath)) {
  const lines = sh('git log -n 12 --oneline --no-merges', { pipe: true }).split('\n').filter(Boolean);
  const body = [
    `# Brown AI Desktop v${version}`,
    '',
    '## Downloads (Windows)',
    `- **Setup Installer** (recommended): \`Brown-AI-Setup.exe\``,
    `- **Portable Edition**: \`Brown-AI-Portable.exe\``,
    `- **This version**: \`Brown-AI-Setup-v${version}.exe\``,
    '',
    '## Changes',
    ...lines.map((l) => `- ${l}`),
    '',
  ].join('\n');
  fs.writeFileSync(notesPath, body, 'utf8');
  console.log('[release] generated .release-notes.md from git history — edit it before --publish');
} else {
  console.log('[release] using the existing .release-notes.md');
}

// ----------------------------------------------------------------------------- prepare
if (!publish) {
  if (!arg('skip-tests')) sh('npm test');
  if (!arg('skip-build')) sh(`npm run dist:ci -- --config.directories.output="${DIST}"`);

  const exes = fs.existsSync(DIST) ? fs.readdirSync(DIST).filter((f) => f.endsWith('.exe')) : [];
  const setup = exes.find((f) => f === `Brown AI Setup v${version}.exe`);
  const portable = exes.find((f) => f === `Brown AI v${version}.exe`);
  if (!setup || !portable) {
    die(`Need both a Setup and a portable exe in dist/, found: ${exes.join(', ') || 'nothing'}`);
  }

  // electron-builder names files with spaces; the release aliases are the stable names.
  const aliases = {
    [`Brown-AI-Setup-v${version}.exe`]: setup,
    [`Brown-AI-v${version}.exe`]: portable,
    'Brown-AI-Setup.exe': setup,
    'Brown-AI-Portable.exe': portable,
  };
  for (const [alias, source] of Object.entries(aliases)) {
    fs.copyFileSync(path.join(DIST, source), path.join(DIST, alias));
  }

  const latestYml = path.join(DIST, 'latest.yml');
  if (!fs.existsSync(latestYml)) die('latest.yml is missing — do not publish an incomplete update.');
  const yaml = require('js-yaml');
  const manifest = yaml.load(fs.readFileSync(latestYml, 'utf8'));
  if (manifest.version !== version) die('latest.yml version does not match the build.');
  const setupHash = require('crypto').createHash('sha512').update(fs.readFileSync(path.join(DIST, setup))).digest('base64');
  manifest.files = [{ url: 'Brown-AI-Setup.exe', sha512: setupHash, size: fs.statSync(path.join(DIST, setup)).size }];
  manifest.path = 'Brown-AI-Setup.exe';
  manifest.sha512 = setupHash;
  fs.writeFileSync(latestYml, yaml.dump(manifest));
  console.log('\n[release] staged assets:');
  for (const alias of Object.keys(aliases)) {
    console.log(`  ${alias}  (${(fs.statSync(path.join(DIST, alias)).size / 1048576).toFixed(1)} MB)`);
  }
  console.log(`  latest.yml ${fs.existsSync(latestYml) ? '(present)' : 'MISSING'}`);
  console.log(`\n[release] source names kept by electron-builder: ${setup} / ${portable}`);
  console.log('[release] commit the package.json version bump and the notes, then run:');
  console.log(`            node scripts/release-desktop.js --publish${includeOriginalNames ? ' --include-original-names' : ''}`);
  process.exit(0);
}

// ----------------------------------------------------------------------------- publish
// The tag must point at a commit whose own package.json declares this version, otherwise the
// release is unbuildable from what is on GitHub.
if (sh('git status --porcelain -- package.json', { pipe: true }).trim()) {
  die('package.json has uncommitted changes — commit the version bump before publishing');
}
const committedVersion = JSON.parse(sh('git show HEAD:package.json', { pipe: true })).version;
if (committedVersion !== version) {
  die(`HEAD declares ${committedVersion} but package.json says ${version} — commit the bump first`);
}
const dirty = sh('git status --porcelain', { pipe: true }).trim();
if (dirty) console.log(`[release] NOTE: these files are uncommitted, so they are in the build but not in the tag:\n${dirty}`);

const exes = fs.readdirSync(DIST).filter((f) => f.endsWith('.exe'));
const setup = exes.find((f) => f === `Brown AI Setup v${version}.exe`);
if (!setup) die(`no Setup exe in dist/ — run the prepare step first`);

const upload = [
  path.join(DIST, 'Brown-AI-Setup.exe'),
  path.join(DIST, 'Brown-AI-Portable.exe'),
  path.join(DIST, `Brown-AI-Setup-v${version}.exe`),
  path.join(DIST, `Brown-AI-v${version}.exe`),
];
if (fs.existsSync(path.join(DIST, 'latest.yml'))) upload.push(path.join(DIST, 'latest.yml'));
if (includeOriginalNames) upload.push(path.join(DIST, setup));
for (const f of upload) if (!fs.existsSync(f)) die(`expected asset is missing: ${path.basename(f)}`);
const manifest = require('js-yaml').load(fs.readFileSync(path.join(DIST, 'latest.yml'), 'utf8'));
const installerFile = path.join(DIST, manifest.path || '');
if (manifest.version !== version || !upload.includes(installerFile)) die('Update manifest must reference an uploaded installer for this version.');
const installerHash = require('crypto').createHash('sha512').update(fs.readFileSync(installerFile)).digest('base64');
if (manifest.sha512 !== installerHash || manifest.files?.[0]?.sha512 !== installerHash || manifest.files?.[0]?.size !== fs.statSync(installerFile).size) die('Installer and update manifest do not match. Prepare the release again.');

sh(`gh api repos/${REPO} > NUL`); // fails early with a readable auth error

const tags = sh('git tag -l', { pipe: true }).split('\n');
if (tags.includes(tag)) {
  if (sh(`git rev-parse "${tag}^{commit}"`, { pipe: true }).trim() !== sh('git rev-parse HEAD', { pipe: true }).trim()) die('Existing tag does not point at this commit. Do not overwrite a released version.');
  console.log(`[release] tag ${tag} already exists locally — pushing it as-is`);
} else {
  sh(`git tag -a ${tag} -m "Brown AI Desktop ${tag}"`);
}
sh(`git push origin ${tag}`);

const exists = sh(`gh release view ${tag} --json assets > NUL 2>&1 && echo yes || echo no`, { pipe: true }).trim() === 'yes';
if (exists) {
  if (sh(`gh release view ${tag} --json isDraft --jq .isDraft`, { pipe: true }).trim() !== 'true') die('This version is already published. Use a new version rather than replacing live update files.');
} else {
  sh(`gh release create ${tag} --draft --verify-tag --title "Brown AI Desktop v${version}" --notes-file .release-notes.md`);
}
for (const file of upload) {
  sh(`node "${path.join(__dirname, 'upload-release-asset.js')}" ${tag} "${file}"`);
}
// Draft releases are visible to their owner through the release ID endpoint,
// but GitHub's public tag endpoint returns 404 until publication.
const releaseApiUrl = sh(`gh release view ${tag} --json apiUrl --jq .apiUrl`, { pipe: true }).trim();
const releaseAssets = JSON.parse(sh(`gh api "${releaseApiUrl}"`, { pipe: true })).assets;
for (const file of upload) {
  const asset = releaseAssets.find(asset => asset.name === path.basename(file));
  const sha256 = require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (!asset || asset.state !== 'uploaded' || asset.size !== fs.statSync(file).size || asset.digest !== `sha256:${sha256}`) die(`Release asset failed verification: ${path.basename(file)}. The release remains a draft.`);
}
sh(`gh release edit ${tag} --draft=false --latest --title "Brown AI Desktop v${version}" --notes-file .release-notes.md`);

// Prove the user-facing link actually resolves instead of assuming the upload worked.
const resolved = sh(
  `gh api repos/${REPO}/releases/latest --jq .tag_name`,
  { pipe: true }
).trim();
console.log(`\n[release] published. releases/latest now points at ${resolved}`);
for (const f of upload) {
  const name = path.basename(f);
  const ok = sh(`gh release view ${tag} --json assets --jq .assets[].name`, { pipe: true }).includes(name);
  console.log(`  ${ok ? 'ok  ' : 'MISS'} ${name}`);
}
console.log(`\n  website link: https://github.com/${REPO}/releases/latest/download/Brown-AI-Setup.exe`);
