const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');

async function run() {
  const source = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(require.resolve('../src/renderer/index.html'), 'utf8');
  const start = source.indexOf('async function checkAndRunFirstTimeOnboarding()');
  const end = source.indexOf('\nasync function reloadConversationsFromDisk()', start);
  assert(start >= 0 && end > start);
  for (const status of [{ completed: false }, { completed: false, forcedReset: true }, false, { completed: true }]) {
    const { document } = parseHTML(html);
    document.querySelectorAll('input').forEach(input => { input.focus = () => {}; });
    const saved = new Map([
      ['ultron-user-name', 'Old Saved Person'], ['ultron-user-first-name', 'Old'],
      ['ultron-user-last-name', 'Saved Person'], ['ultron-user-email', 'old@example.com'],
      ['ultron-setup-completed', 'true']
    ]);
    const storage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
    const profileWrites = [];
    const input = document.getElementById('onboard-full-name');
    input.value = 'Browser restored name';
    const context = vm.createContext({ document, localStorage: storage, window: { localStorage: storage, ultronAPI: {
      loadSetupStatus: async () => status,
      setSetupTitlebar() {},
      saveUserProfile: async profile => { profileWrites.push(profile); return { success: true }; }
    } }, setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, playOnboardingBrandIntro() {}, loadAccountDetails: async () => {}, updateWelcomeGreeting() {}, logTrace() {} });
    vm.runInContext(source.slice(start, end), context);
    await context.checkAndRunFirstTimeOnboarding();
    if (status.completed) {
      assert(document.getElementById('onboarding-screen').classList.contains('hidden'), 'Completed users keep their existing account');
      assert.equal(profileWrites.length, 0);
      continue;
    }
    assert.equal(input.value, '', 'New setup must not restore a saved or browser-filled name');
    assert.equal(input.autocomplete, 'off');
    assert.equal(saved.get('ultron-user-name'), 'Old Saved Person', 'Opening onboarding must not erase saved account data');
    document.getElementById('btn-onboard-start').onclick();
    assert.equal(input.value, '', 'Get Started must lead to an empty name field');
    await document.getElementById('btn-onboard-next').onclick();
    assert.equal(profileWrites.length, 0, 'Continue with no name must not save the old identity');
    assert(!document.getElementById('onboard-step-1-error').classList.contains('hidden'));
    input.value = 'New Chosen Name';
    await document.getElementById('btn-onboard-next').onclick();
    assert.equal(saved.get('ultron-user-name'), 'New Chosen Name');
    assert.equal(profileWrites[0].fullName, 'New Chosen Name');
    document.getElementById('btn-onboard-back').onclick();
    assert.equal(input.value, 'New Chosen Name', 'Back keeps the name typed during this run');
  }
  console.log('PASS: onboarding starts blank despite saved profiles/browser values; validates entry, saves only typed names, retains in-flow edits and skips completed setup');
}
module.exports = { run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
