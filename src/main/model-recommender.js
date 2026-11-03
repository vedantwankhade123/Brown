// Brown local-model recommender (Phase 5, Risk fix 1).
//
// Replaces the old RAM-only, hardcoded `phi4`/`llama3` guess with a recommender that uses
// the REAL hardware profile (total RAM, dedicated-GPU VRAM) AND the models actually
// installed. It is a pure, dependency-free module so it can be unit-tested without
// `systeminformation` or a live Ollama daemon: callers pass plain data in.
//
// Sizes are approximate quantized (Q4-class) download footprints used only to judge fit;
// they are not exact and never gate a model the user already has running.

'use strict';

// tier: low-memory < fast < balanced < reasoning < vision < xl (rough capability/size order)
const MODEL_COOKBOOK = [
  { name: 'qwen2.5:0.5b', family: 'qwen2.5', sizeGB: 0.5, minRamGB: 2, minVramGB: 0, tier: 'low-memory', vision: false, reasoning: false, tools: false },
  { name: 'qwen2.5:1.5b', family: 'qwen2.5', sizeGB: 1.0, minRamGB: 3, minVramGB: 0, tier: 'fast', vision: false, reasoning: false, tools: false },
  { name: 'llama3.2:1b', family: 'llama3.2', sizeGB: 1.3, minRamGB: 4, minVramGB: 0, tier: 'fast', vision: false, reasoning: false, tools: false },
  { name: 'gemma2:2b', family: 'gemma2', sizeGB: 1.6, minRamGB: 4, minVramGB: 0, tier: 'fast', vision: false, reasoning: false, tools: false },
  { name: 'phi3:mini', family: 'phi3', sizeGB: 2.3, minRamGB: 4, minVramGB: 0, tier: 'fast', vision: false, reasoning: false, tools: false },
  { name: 'llama3.2:3b', family: 'llama3.2', sizeGB: 2.0, minRamGB: 5, minVramGB: 3, tier: 'balanced', vision: false, reasoning: false, tools: false },
  { name: 'qwen2.5:3b', family: 'qwen2.5', sizeGB: 1.9, minRamGB: 5, minVramGB: 3, tier: 'balanced', vision: false, reasoning: false, tools: false },
  { name: 'mistral:7b', family: 'mistral', sizeGB: 4.1, minRamGB: 7, minVramGB: 6, tier: 'balanced', vision: false, reasoning: false, tools: false },
  { name: 'llama3.1:8b', family: 'llama3.1', sizeGB: 4.7, minRamGB: 8, minVramGB: 6, tier: 'reasoning', vision: false, reasoning: true, tools: true },
  { name: 'qwen2.5:7b', family: 'qwen2.5', sizeGB: 4.7, minRamGB: 8, minVramGB: 6, tier: 'reasoning', vision: false, reasoning: true, tools: true },
  { name: 'gemma2:9b', family: 'gemma2', sizeGB: 5.4, minRamGB: 9, minVramGB: 8, tier: 'reasoning', vision: false, reasoning: true, tools: false },
  { name: 'llava:7b', family: 'llava', sizeGB: 4.7, minRamGB: 8, minVramGB: 6, tier: 'vision', vision: true, reasoning: false, tools: false },
  { name: 'minicpm-v', family: 'minicpm-v', sizeGB: 5.5, minRamGB: 9, minVramGB: 8, tier: 'vision', vision: true, reasoning: false, tools: false },
  { name: 'phi4', family: 'phi4', sizeGB: 9.1, minRamGB: 13, minVramGB: 12, tier: 'reasoning', vision: false, reasoning: true, tools: false },
  { name: 'qwen2.5:14b', family: 'qwen2.5', sizeGB: 9.0, minRamGB: 13, minVramGB: 12, tier: 'reasoning', vision: false, reasoning: true, tools: true },
  { name: 'llama3.1:70b', family: 'llama3.1', sizeGB: 40.0, minRamGB: 48, minVramGB: 24, tier: 'xl', vision: false, reasoning: true, tools: true }
];

const TIER_RANK = { 'low-memory': 0, fast: 1, balanced: 2, reasoning: 3, vision: 3, xl: 4 };

const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Accept either the full hardware `stats` object or a bare RAM number (legacy callers),
// plus the installed-model list, and normalize to plain numbers/arrays.
function normalizeInput(arg, installedModels) {
  let stats = arg;
  let models = installedModels;
  if (typeof arg === 'number') { stats = { totalRamGB: arg }; models = installedModels || []; }
  else if (arg && typeof arg === 'object' && (arg.stats || arg.installedModels)) { stats = arg.stats || arg; models = arg.installedModels || installedModels || []; }
  stats = stats || {};
  const totalRamGB = num(stats.totalRamGB, 0);
  const dedicatedGpu = stats.dedicatedGpu || (Array.isArray(stats.gpuDetails) ? stats.gpuDetails.find(g => g.dedicated) : null) || null;
  const vramGB = num(dedicatedGpu && dedicatedGpu.vramGB, 0);
  const hasDedicatedGpu = Boolean(stats.hasDedicatedGpu != null ? stats.hasDedicatedGpu : dedicatedGpu);
  return { totalRamGB, vramGB, hasDedicatedGpu, installedModels: Array.isArray(models) ? models : [] };
}

// An installed model matches a cookbook entry by exact name or by family prefix.
function installedNameFor(entry, installedModels) {
  const family = entry.family.toLowerCase();
  const exact = installedModels.find(m => String(m.name || '').toLowerCase() === entry.name.toLowerCase());
  if (exact) return exact.name;
  const byFamily = installedModels.find(m => {
    const base = String(m.name || '').toLowerCase().split(':')[0].split('/').pop();
    return base === family;
  });
  return byFamily ? byFamily.name : null;
}

// Does this model run acceptably on this device? GPU offload needs VRAM ~= weights + KV
// headroom; otherwise it falls back to CPU, which needs enough system RAM.
function fitsHardware(entry, hw) {
  const gpuFit = hw.hasDedicatedGpu && hw.vramGB >= entry.minVramGB && entry.minVramGB > 0;
  const cpuFit = hw.totalRamGB >= entry.minRamGB;
  const fits = gpuFit || cpuFit;
  let reason;
  if (fits) reason = gpuFit ? `runs on the dedicated GPU (~${hw.vramGB} GB VRAM)` : `runs on CPU (~${hw.totalRamGB} GB RAM)`;
  else reason = `needs ~${entry.minRamGB} GB RAM or ~${entry.minVramGB} GB VRAM; this device has ${hw.totalRamGB} GB RAM${hw.hasDedicatedGpu ? ` and ${hw.vramGB} GB VRAM` : ' and no dedicated GPU'}`;
  return { fits, gpuFit, cpuFit, reason };
}

// Build the full recommendation result: a single back-compat `best` string plus honest
// recommendation sets. Installed models that fit are always preferred over a fresh pull.
function recommendModels(arg, installedModels) {
  const hw = normalizeInput(arg, installedModels);
  const annotated = MODEL_COOKBOOK.map(entry => {
    const fit = fitsHardware(entry, hw);
    const installedName = installedNameFor(entry, hw.installedModels);
    return { ...entry, ...fit, installed: Boolean(installedName), installedName: installedName || null };
  });

  const fitted = annotated.filter(m => m.fits);
  const installedFitted = fitted.filter(m => m.installed);

  // A capable device (enough VRAM or RAM) can be steered toward reasoning/balanced tiers;
  // a constrained device is steered toward fast/low-memory so chat stays responsive.
  const capable = hw.vramGB >= 8 || hw.totalRamGB >= 16;
  const tierScore = m => TIER_RANK[m.tier] + (m.installed ? 100 : 0) + (m.gpuFit ? 2 : 0) + (capable ? (m.reasoning ? 1 : 0) : (m.tier === 'fast' || m.tier === 'low-memory' ? 1 : 0));

  const rank = list => list.slice().sort((a, b) => tierScore(b) - tierScore(a) || b.sizeGB - a.sizeGB);
  const card = m => ({ name: m.installedName || m.name, family: m.family, sizeGB: m.sizeGB, tier: m.tier, installed: m.installed, gpu: m.gpuFit, vision: m.vision, reasoning: m.reasoning, reason: m.reason });

  const pool = installedFitted.length ? installedFitted : fitted;
  const bestEntry = rank(pool)[0] || rank(annotated.filter(m => m.tier !== 'xl'))[0] || MODEL_COOKBOOK[0];
  const best = { ...card(bestEntry), pull: !bestEntry.installed };

  const sets = {
    bestForDevice: rank(pool).slice(0, 3).map(card),
    fastChat: rank(fitted.filter(m => m.tier === 'fast' || m.tier === 'low-memory' || m.sizeGB <= 3)).slice(0, 3).map(card),
    betterReasoning: rank(fitted.filter(m => m.reasoning)).slice(0, 3).map(card),
    vision: rank(fitted.filter(m => m.vision)).slice(0, 2).map(card),
    lowMemorySafe: rank(annotated.filter(m => m.sizeGB <= 2 && (m.installed || m.fits))).slice(0, 3).map(card),
    notRecommended: annotated.filter(m => !m.fits && m.tier !== 'low-memory').slice(0, 4).map(m => ({ name: m.name, reason: m.reason }))
  };

  return { best, sets, hardware: { totalRamGB: hw.totalRamGB, vramGB: hw.vramGB, hasDedicatedGpu: hw.hasDedicatedGpu }, cookbookSize: MODEL_COOKBOOK.length };
}

// Back-compatible single-string recommendation, now VRAM/installed-aware. Prefers an
// already-installed model that fits so onboarding does not point at an unpulled name.
function getModelRecommendation(arg, installedModels) {
  const result = recommendModels(arg, installedModels);
  return result.best.name;
}

module.exports = { MODEL_COOKBOOK, recommendModels, getModelRecommendation, fitsHardware, normalizeInput };
