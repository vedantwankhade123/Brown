const { exec } = require('child_process');
const si = require('systeminformation');

/**
 * Executes a PowerShell command and returns the output.
 * @param {string} command - PowerShell script string.
 * @returns {Promise<string>} Command output.
 */
function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -Command "${command}"`, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve(stdout.trim());
    });
  });
}

function isDedicatedGpuController(gpu = {}) {
  const vendor = String(gpu.vendor || '').toLowerCase();
  const model = String(gpu.model || gpu.name || '').toLowerCase();
  const text = `${vendor} ${model}`;

  if (!text.trim()) return false;
  if (/(microsoft basic|remote display|virtual|vmware|virtualbox|parallels)/i.test(text)) return false;

  const knownDedicatedVendor = /(nvidia|advanced micro devices|amd|radeon|geforce|rtx|gtx|quadro|tesla|arc)/i.test(text);
  const knownIntegrated = /(intel.*uhd|intel.*iris|intel.*hd graphics|integrated|apu)/i.test(text);

  return knownDedicatedVendor && !knownIntegrated;
}

function parseVramGB(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (numeric > 1024 * 1024) return numeric / (1024 * 1024 * 1024);
  return numeric / 1024;
}

let _cachedHardwareProfile = null;
let _cachedHardwareTimestamp = 0;
const HARDWARE_CACHE_TTL_MS = 60000;

/**
 * Profiles the host system's hardware configurations.
 * Retrieves total RAM, CPU threads, and GPU details.
 * Falls back to PowerShell if systeminformation fails.
 * 
 * @param {boolean} [forceRefresh=false]
 * @returns {Promise<{totalRamGB: number, cpuThreads: number, gpus: Array<string>}>}
 */
async function profileHardware(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && _cachedHardwareProfile && (now - _cachedHardwareTimestamp < HARDWARE_CACHE_TTL_MS)) {
    return _cachedHardwareProfile;
  }

  let totalRamGB = 0;
  let cpuThreads = 0;
  let gpus = [];
  let gpuDetails = [];

  try {
    const memInfo = await si.mem();
    totalRamGB = memInfo.total / (1024 * 1024 * 1024);
  } catch (err) {
    // Fallback to PowerShell
    try {
      const psRam = await runPowerShell('(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory');
      if (psRam) {
        totalRamGB = parseInt(psRam, 10) / (1024 * 1024 * 1024);
      }
    } catch (fallbackErr) {
      totalRamGB = 8; // Safest low fallback
    }
  }

  try {
    const cpuInfo = await si.cpu();
    cpuThreads = cpuInfo.cores; // Or cpuInfo.threads if hyperthreading
  } catch (err) {
    try {
      const psCores = await runPowerShell('(Get-CimInstance Win32_Processor).NumberOfLogicalProcessors');
      if (psCores) {
        cpuThreads = parseInt(psCores, 10);
      }
    } catch (fallbackErr) {
      cpuThreads = 4; // Safest low fallback
    }
  }

  try {
    const gpuInfo = await si.graphics();
    if (gpuInfo && gpuInfo.controllers && gpuInfo.controllers.length > 0) {
      gpuDetails = gpuInfo.controllers.map(g => {
        const vramGB = parseVramGB(g.vram);
        return {
          vendor: g.vendor || '',
          model: g.model || '',
          vramGB: parseFloat(vramGB.toFixed(2)),
          dedicated: isDedicatedGpuController(g)
        };
      });
      gpus = gpuDetails.map(g => `${g.vendor} ${g.model} (${g.vramGB} GB VRAM)`);
    }
  } catch (err) {
    try {
      const psGpu = await runPowerShell('(Get-CimInstance Win32_VideoController).Name');
      if (psGpu) {
        gpus = psGpu.split('\n').map(name => name.trim()).filter(Boolean);
        gpuDetails = gpus.map(name => ({
          vendor: '',
          model: name,
          vramGB: 0,
          dedicated: isDedicatedGpuController({ model: name })
        }));
      }
    } catch (fallbackErr) {
      gpus = ['Generic Display Adapter'];
      gpuDetails = [{ vendor: '', model: 'Generic Display Adapter', vramGB: 0, dedicated: false }];
    }
  }

  // Hybrid laptops/desktops: systeminformation can miss the discrete GPU when
  // the integrated GPU is driving the display. Merge Win32_VideoController so
  // an NVIDIA/AMD card is still detected and used for Ollama offload.
  if (!gpuDetails.some(g => g.dedicated)) {
    try {
      const psGpuJson = await runPowerShell("Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress");
      const parsed = JSON.parse(psGpuJson || '[]');
      const controllers = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of controllers) {
        const name = String(item.Name || '').trim();
        if (!name) continue;
        const alreadyKnown = gpuDetails.some(g =>
          String(g.model || '').toLowerCase() === name.toLowerCase() ||
          `${g.vendor} ${g.model}`.toLowerCase().includes(name.toLowerCase())
        );
        if (alreadyKnown) continue;
        const detail = {
          vendor: '',
          model: name,
          vramGB: parseFloat((Number(item.AdapterRAM || 0) / (1024 ** 3)).toFixed(2)),
          dedicated: isDedicatedGpuController({ model: name })
        };
        gpuDetails.push(detail);
        gpus.push(`${name} (${detail.vramGB} GB VRAM)`);
      }
    } catch (e) {}
  }

  const dedicatedGpu = gpuDetails.find(g => g.dedicated) || null;

  const result = {
    totalRamGB: parseFloat(totalRamGB.toFixed(2)),
    cpuThreads: cpuThreads || 4,
    gpus,
    gpuDetails,
    hasDedicatedGpu: Boolean(dedicatedGpu),
    dedicatedGpu
  };

  _cachedHardwareProfile = result;
  _cachedHardwareTimestamp = Date.now();

  return result;
}

const fs = require('fs');
const path = require('path');

function resolveOllamaCliExecutable() {
  const userLocal = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
  const candidates = [
    path.join(userLocal, 'Programs', 'Ollama', 'ollama.exe'),
    'C:\\Program Files\\Ollama\\ollama.exe',
    'C:\\Program Files (x86)\\Ollama\\ollama.exe',
    'ollama.exe'
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return 'ollama';
}

function scanOllamaManifestsDir(manifestsDir) {
  const models = [];
  if (!manifestsDir || !fs.existsSync(manifestsDir)) return models;

  function walk(currentDir, parts = []) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, [...parts, entry.name]);
        } else if (entry.isFile()) {
          const tag = entry.name;
          let modelName = '';
          if (parts.length >= 3 && parts[0] === 'registry.ollama.ai' && parts[1] === 'library') {
            modelName = parts.slice(2).join('/') + (tag === 'latest' ? ':latest' : `:${tag}`);
          } else if (parts.length >= 2 && parts[0] === 'hf.co') {
            modelName = `hf.co/${parts.slice(1).join('/')}${tag === 'latest' ? '' : `:${tag}`}`;
          } else if (parts.length >= 2) {
            modelName = `${parts.slice(1).join('/')}:${tag}`;
          } else if (parts.length === 1) {
            modelName = `${parts[0]}:${tag}`;
          }
          if (modelName) {
            let size = 0;
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              const parsed = JSON.parse(content);
              if (Array.isArray(parsed.layers)) {
                size = parsed.layers.reduce((acc, l) => acc + (l.size || 0), 0);
              }
            } catch {}
            models.push({ name: modelName, size });
          }
        }
      }
    } catch {}
  }

  walk(manifestsDir);
  return models;
}

/**
 * Queries the local Ollama backend on 127.0.0.1:11434, the CLI, and local manifest storage to list installed weights.
 * @returns {Promise<Array<{name: string, size: number}>>} Array of installed models.
 */
async function queryLocalOllamaModels() {
  const modelMap = new Map();

  // Tier 1: Query running Ollama HTTP API (authoritative source of truth when live)
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.models)) {
        for (const m of data.models) {
          if (m && m.name) {
            modelMap.set(m.name.toLowerCase(), {
              name: m.name,
              size: m.size || 0,
              modified_at: m.modified_at,
              digest: m.digest,
              details: m.details
            });
          }
        }
        // When the live daemon responds, this is the exact, authoritative list of usable models.
        return Array.from(modelMap.values());
      }
    }
  } catch (err) {}

  // Tier 2: Fallback to CLI when HTTP daemon is starting or on non-standard port
  try {
    const { exec: cpExec } = require('child_process');
    const cliExe = resolveOllamaCliExecutable();
    const cmd = cliExe.includes(' ') ? `"${cliExe}" list` : `${cliExe} list`;
    const stdout = await new Promise((resolve) => {
      cpExec(cmd, { windowsHide: true, timeout: 3000 }, (err, stdout) => {
        if (err) resolve('');
        else resolve(stdout || '');
      });
    });

    const lines = (stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of lines.slice(1)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 1 && parts[0] && !parts[0].toLowerCase().startsWith('name')) {
        const name = parts[0];
        if (!modelMap.has(name.toLowerCase())) {
          modelMap.set(name.toLowerCase(), { name, size: 0 });
        }
      }
    }
    if (modelMap.size > 0) {
      return Array.from(modelMap.values());
    }
  } catch (e) {}

  // Tier 3: Cold-start disk manifest scan when daemon and CLI are completely offline
  try {
    const userHome = process.env.USERPROFILE || process.env.HOME || 'C:\\Users\\vedan';
    const userLocal = process.env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local');
    
    let candidateManifestDirs = [
      path.join(userHome, '.ollama', 'models', 'manifests'),
      path.join(userLocal, 'Ollama', 'models', 'manifests')
    ];

    try {
      const { getOllamaModelsDir } = require('./paths');
      const customModelsDir = getOllamaModelsDir();
      if (customModelsDir) {
        candidateManifestDirs.unshift(path.join(customModelsDir, 'manifests'));
      }
    } catch {}

    for (const mDir of candidateManifestDirs) {
      if (fs.existsSync(mDir)) {
        const diskModels = scanOllamaManifestsDir(mDir);
        for (const dm of diskModels) {
          if (!modelMap.has(dm.name.toLowerCase())) {
            modelMap.set(dm.name.toLowerCase(), dm);
          }
        }
      }
    }
  } catch (e) {}

  return Array.from(modelMap.values());
}

/**
 * Returns a model recommendation based on hardware parameters.
 * @param {number} totalRamGB - Total physical memory in GB.
 * @returns {string} Suggested model string ('phi4' or 'llama3').
 */
function getModelRecommendation(totalRamGB) {
  if (totalRamGB < 16) {
    return 'phi4'; // 3B parameter model
  } else {
    return 'llama3'; // 8B parameter model
  }
}

module.exports = {
  profileHardware,
  queryLocalOllamaModels,
  getModelRecommendation
};
