// Resolves the desktop release version/tag and stages `.release-notes.md`.
// Runs in CI (see .github/workflows/release.yml) and writes outputs to GITHUB_ENV.
const fs = require('fs');
const { execSync } = require('child_process');

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function exportEnv(key, value) {
  const file = process.env.GITHUB_ENV;
  if (!file) fail('GITHUB_ENV is not set; run this inside GitHub Actions.');
  fs.appendFileSync(file, `${key}=${value}\n`, 'utf8');
}

const pkgPath = 'package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

const inputVersion = (process.env.INPUT_VERSION || '').trim();
const inputTag = (process.env.INPUT_TAG || '').trim();

let targetVersion = pkg.version;
if (inputVersion) {
  let v = inputVersion.replace(/^v/, '');
  if (!/^\d+\.\d+\.\d+/.test(v) && /^\d+\.\d+$/.test(v)) v += '.0';
  if (!/^\d+\.\d+\.\d+/.test(v)) fail(`Unusable version input: "${inputVersion}"`);
  console.log(`Updating package.json version to ${v}`);
  pkg.version = v;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  targetVersion = v;
}

let releaseTag;
if (inputTag) {
  releaseTag = inputTag.startsWith('v') ? inputTag : `v${inputTag}`;
} else if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME) {
  releaseTag = process.env.GITHUB_REF_NAME;
} else if (/^\d+\.\d+\.0$/.test(targetVersion)) {
  releaseTag = `v${targetVersion.replace(/\.0$/, '')}`;
} else {
  releaseTag = `v${targetVersion}`;
}

const marketingVersion = releaseTag.replace(/^v/, '');

console.log(`Package Version: ${targetVersion}`);
console.log(`Release Tag: ${releaseTag}`);
console.log(`Marketing Version: ${marketingVersion}`);

exportEnv('TARGET_VERSION', targetVersion);
exportEnv('RELEASE_TAG', releaseTag);
exportEnv('MARKETING_VERSION', marketingVersion);

const notes = '.release-notes.md';
const candidates = [
  `.release-notes-v${marketingVersion}.md`,
  `.release-notes-v${targetVersion}.md`,
];

const source = candidates.find((c) => fs.existsSync(c));
if (source) {
  if (source !== notes) fs.copyFileSync(source, notes);
  console.log(`Using notes from ${source}`);
} else {
  const lines = execSync('git log -n 10 --oneline --no-merges', { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const body = [
    `# Brown AI Desktop v${marketingVersion}`,
    '',
    '## Downloads (Windows)',
    `- **Setup Installer**: \`Brown-AI-Setup-v${marketingVersion}.exe\` (Recommended)`,
    `- **Portable Edition**: \`Brown-AI-v${marketingVersion}.exe\``,
    '- **Direct Latest Link**: [`Brown-AI-Setup.exe`](https://github.com/vedantwankhade123/Brown/releases/latest/download/Brown-AI-Setup.exe)',
    '',
    '## Recent Changes',
    ...lines,
    '',
  ].join('\n');
  fs.writeFileSync(notes, body, 'utf8');
  console.log(`Generated ${notes} from git history`);
}
