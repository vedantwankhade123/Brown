const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const start = source.indexOf('function setOllamaInstallButtonLabel(');
const end = source.indexOf('\nasync function startOllamaInstallFlow', start);
let created = 0;
const env = { document: {
 createElement: () => { created++; return { textContent: '' }; },
 createElementNS: () => { created++; return { setAttribute() {}, innerHTML: '' }; },
} };
vm.createContext(env); vm.runInContext(source.slice(start, end), env);
const status = { id: 'onboard-desc-ollama', dataset: { installing: 'true' }, textContent: '' };
for (const label of ['Checking...', 'Verifying connection...', 'Downloading…', 'Connected']) {
 env.setOllamaInstallButtonLabel(status, label);
 assert.equal(status.textContent, label);
}
assert.equal(created, 0, 'Onboarding status updates must never create another download icon');
const children = [];
const button = { id: 'normal-install-button', dataset: { installing: 'true' },
 replaceChildren: () => children.splice(0), appendChild: node => children.push(node) };
env.setOllamaInstallButtonLabel(button, 'Downloading…');
assert.equal(children.length, 2, 'The normal install button retains its progress icon and label');
console.log('PASS: onboarding status stays text-only during installation; regular install button keeps its progress icon');
