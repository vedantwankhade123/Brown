/**
 * Re-derives src/renderer/brown-logo-lottie.js from Assets/brown-logo-animation.json.
 * Run after replacing the Lottie source: node scripts/make_logo_lottie_js.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const source = path.join(root, 'Assets', 'brown-logo-animation.json');
const target = path.join(root, 'src', 'renderer', 'brown-logo-lottie.js');

const animation = JSON.parse(fs.readFileSync(source, 'utf8'));
const banner = [
  '/* Derived from Assets/brown-logo-animation.json — the animated Brown mark.',
  '   Regenerate with: node scripts/make_logo_lottie_js.js',
  '   Keep as a JS global: the renderer runs on file://, where fetch() of a local JSON is blocked. */',
].join('\n');

fs.writeFileSync(target, `${banner}\nwindow.BROWN_LOGO_LOTTIE = ${JSON.stringify(animation)};\n`);
console.log(`wrote ${path.relative(root, target)}`);
