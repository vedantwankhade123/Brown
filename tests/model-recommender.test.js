const assert = require('node:assert/strict');
const rec = require('../src/main/model-recommender');

// --- VRAM is actually used, not just RAM (the old bug) -------------------------------
// A device with little RAM but a big dedicated GPU should still be offered a large model
// that fits in VRAM. The RAM-only recommender could never do this.
const gpuOnly = rec.recommendModels({ stats: { totalRamGB: 6, hasDedicatedGpu: true, dedicatedGpu: { vramGB: 12 } }, installedModels: [] });
const phi4 = gpuOnly.sets.betterReasoning.concat(gpuOnly.sets.bestForDevice).find(m => m.family === 'phi4');
assert(phi4 && phi4.gpu === true, 'a 9GB model fits via 12GB VRAM despite only 6GB RAM');
assert.equal(gpuOnly.hardware.vramGB, 12);

// --- Installed models are preferred over an unpulled hardcoded name ------------------
const installed = rec.recommendModels({ stats: { totalRamGB: 8 }, installedModels: [{ name: 'mistral:latest' }] });
assert.equal(installed.best.name, 'mistral:latest', 'recommends the exact installed name');
assert.equal(installed.best.installed, true);
assert.equal(installed.best.pull, false);

// --- Low-RAM, no-GPU device gets a small, fitting model and honest "not recommended" ---
const small = rec.recommendModels({ stats: { totalRamGB: 4 }, installedModels: [] });
assert(small.best.sizeGB <= 3, 'a 4GB device is not pointed at a large model');
assert.equal(small.best.pull, true, 'nothing installed, so the best fit is a pull suggestion');
assert(small.sets.lowMemorySafe.length > 0);
assert(small.sets.lowMemorySafe.every(m => m.sizeGB <= 2));
assert(small.sets.notRecommended.length > 0, 'a small device gets a not-recommended list');
for (const nr of small.sets.notRecommended) {
  assert(/RAM|VRAM/.test(nr.reason), 'not-recommended explains the constraint');
  assert(nr.reason.includes('4 GB RAM'), 'not-recommended states the real device RAM: ' + nr.reason);
}

// --- Recommendation sets are well formed ---------------------------------------------
const capable = rec.recommendModels({ stats: { totalRamGB: 16, hasDedicatedGpu: true, dedicatedGpu: { vramGB: 8 } }, installedModels: [] });
for (const key of ['bestForDevice', 'fastChat', 'betterReasoning', 'vision', 'lowMemorySafe']) {
  assert(Array.isArray(capable.sets[key]), key + ' is an array');
}
assert(capable.sets.betterReasoning.every(m => m.reasoning === true), 'reasoning set only lists reasoning models');
assert(capable.sets.vision.length > 0 && capable.sets.vision.every(m => m.vision === true), 'vision set only lists vision models');
assert(capable.sets.fastChat.every(m => m.tier === 'fast' || m.tier === 'low-memory' || m.sizeGB <= 3));

// --- Back-compatible string contract (renderer.js consumes recommendation as a string) -
assert.equal(typeof rec.getModelRecommendation(4), 'string', 'legacy numeric call still returns a string');
const stats = { totalRamGB: 12, hasDedicatedGpu: true, dedicatedGpu: { vramGB: 8 } };
const models = [{ name: 'qwen2.5:7b' }];
assert.equal(rec.getModelRecommendation(stats, models), rec.recommendModels({ stats, installedModels: models }).best.name);
assert(rec.getModelRecommendation(stats, models).split(':')[0].length > 0, 'name is splittable on ":" for the onboarding matcher');

// --- fitsHardware reasons are honest about why a model does not fit ------------------
const noFit = rec.fitsHardware({ name: 'llama3.1:70b', sizeGB: 40, minRamGB: 48, minVramGB: 24, tier: 'xl' }, { totalRamGB: 8, vramGB: 0, hasDedicatedGpu: false });
assert.equal(noFit.fits, false);
assert(/no dedicated GPU/.test(noFit.reason));

console.log('PASS: VRAM- and installed-aware model recommender — recommendation sets, honest not-recommended reasons, and a back-compatible string contract.');
