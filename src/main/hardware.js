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

/**
 * Profiles the host system's hardware configurations.
 * Retrieves total RAM, CPU threads, and GPU details.
 * Falls back to PowerShell if systeminformation fails.
 * 
 * @returns {Promise<{totalRamGB: number, cpuThreads: number, gpus: Array<string>}>}
 */
async function profileHardware() {
  let totalRamGB = 0;
  let cpuThreads = 0;
  let gpus = [];

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
      gpus = gpuInfo.controllers.map(g => `${g.vendor} ${g.model} (${(g.vram || 0) / 1024} GB VRAM)`);
    }
  } catch (err) {
    try {
      const psGpu = await runPowerShell('(Get-CimInstance Win32_VideoController).Name');
      if (psGpu) {
        gpus = psGpu.split('\n').map(name => name.trim()).filter(Boolean);
      }
    } catch (fallbackErr) {
      gpus = ['Generic Display Adapter'];
    }
  }

  return {
    totalRamGB: parseFloat(totalRamGB.toFixed(2)),
    cpuThreads: cpuThreads || 4,
    gpus
  };
}

/**
 * Queries the local Ollama backend on 127.0.0.1:11434 to list installed weights.
 * @returns {Promise<Array<{name: string, size: number}>>} Array of installed models.
 */
async function queryLocalOllamaModels() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags');
    if (response.ok) {
      const data = await response.json();
      if (data && Array.isArray(data.models) && data.models.length > 0) {
        return data.models;
      }
    }
  } catch (err) {}

  // Fallback CLI query for installed models
  try {
    const { exec: cpExec } = require('child_process');
    const stdout = await new Promise((resolve) => {
      cpExec('ollama list', { windowsHide: true }, (err, stdout) => {
        if (err) resolve('');
        else resolve(stdout || '');
      });
    });

    const lines = (stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
    const models = [];
    for (const line of lines.slice(1)) {
      const parts = line.split(/\s+/);
      if (parts.length >= 1 && parts[0] && !parts[0].toLowerCase().startsWith('name')) {
        models.push({ name: parts[0] });
      }
    }
    return models;
  } catch (e) {
    return [];
  }
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
