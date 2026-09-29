/**
 * Performance Mode Toggle UI
 * Allows users to switch between CPU, GPU, and Auto performance modes
 * from the Advanced Options settings tab
 */
(function () {
  'use strict';

  const PERFORMANCE_MODES = {
    AUTO: 'auto',
    GPU: 'gpu',
    CPU: 'cpu'
  };

  let currentMode = PERFORMANCE_MODES.AUTO;
  let isInitialized = false;

  /**
   * GET CURRENT PERFORMANCE MODE
   */
  function getCurrentMode() {
    try {
      const saved = localStorage.getItem('ultron-performance-mode');
      if (saved && Object.values(PERFORMANCE_MODES).includes(saved)) {
        return saved;
      }
    } catch (e) {}
    return PERFORMANCE_MODES.AUTO;
  }

  /**
   * SET PERFORMANCE MODE
   */
  function setPerformanceMode(mode, triggerEvent = true) {
    if (!Object.values(PERFORMANCE_MODES).includes(mode)) {
      console.warn(`[Performance Toggle] Invalid mode: ${mode}`);
      return false;
    }

    currentMode = mode;

    try {
      localStorage.setItem('ultron-performance-mode', mode);
    } catch (e) {
      console.warn('[Performance Toggle] Could not save mode to localStorage:', e.message);
    }

    // Apply configuration to GPU module if present
    if (window.UltronGPUConfig) {
      if (mode === PERFORMANCE_MODES.CPU) {
        window.UltronGPUConfig.disable();
      } else {
        window.UltronGPUConfig.enable();
      }
    }

    updateToggleUI();

    if (triggerEvent) {
      // Notify other systems
      window.dispatchEvent(new CustomEvent('ultron-performance-mode-changed', {
        detail: { mode, timestamp: Date.now() }
      }));
    }

    console.log(`[Performance Toggle] Switched to ${mode.toUpperCase()} mode.`);
    return true;
  }

  /**
   * UPDATE TOGGLE UI
   */
  function updateToggleUI() {
    document.querySelectorAll('.perf-option-item').forEach(opt => {
      const mode = opt.getAttribute('data-mode');
      opt.classList.toggle('active', mode === currentMode);
    });
  }

  /**
   * UPDATE SYSTEM TELEMETRY
   * Each field is read independently: one failing IPC must not blank the others.
   */
  const TELEMETRY_UNAVAILABLE = 'Not available';
  const GENERIC_GPU_NAMES = ['no gpu detected', 'generic display adapter', 'microsoft basic render driver'];

  // Last resort: the main-process hardware profile can be missing (an older main
  // process still running), but WebGL in this window can name the GPU directly.
  function detectGpuFromWebGL() {
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const raw = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      const parts = raw.replace(/^ANGLE\s*\(/i, '').replace(/\)\s*$/, '').split(',');
      const name = (parts[1] || parts[0] || '')
        .replace(/\(\s*0x[0-9a-fA-F]+\s*\)/g, '')
        .replace(/\b(Direct3D|OpenGL|Metal|vs_|ps_|ShaderModel).*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      return name && !GENERIC_GPU_NAMES.includes(name.toLowerCase()) ? name : null;
    } catch (e) {
      return null;
    }
  }

  async function readGpuTelemetry() {
    const gpuEl = document.getElementById('perf-gpu-telemetry');
    if (!gpuEl) return;

    let sysInfo = null;
    try {
      if (window.ultronAPI && typeof window.ultronAPI.getSystemInfo === 'function') {
        const result = await window.ultronAPI.getSystemInfo();
        sysInfo = result && result.success !== false ? result : null;
      }
    } catch (e) {
      console.warn('[Performance Toggle] get-system-info failed:', e.message);
    }

    const card = (sysInfo && sysInfo.gpu) || {};
    let name = String(card.model || card.name || (sysInfo && sysInfo.gpuName) || '').trim();
    if (GENERIC_GPU_NAMES.includes(name.toLowerCase())) name = '';
    const vramGB = Number(card.vramGB || (sysInfo && sysInfo.gpuVramGB) || 0);
    if (!name) name = detectGpuFromWebGL() || '';

    if (!name) {
      gpuEl.textContent = sysInfo ? TELEMETRY_UNAVAILABLE : 'Restart Brown to detect';
      return;
    }
    gpuEl.textContent = vramGB ? `${name} (${vramGB} GB)` : name;
  }

  async function readMemoryTelemetry() {
    const memEl = document.getElementById('perf-mem-telemetry');
    const cpuEl = document.getElementById('perf-cpu-telemetry');
    try {
      if (!window.ultronAPI || typeof window.ultronAPI.getLiveMetrics !== 'function') {
        throw new Error('no metrics bridge');
      }
      const metrics = await window.ultronAPI.getLiveMetrics();
      if (!metrics || metrics.success !== true) {
        throw new Error((metrics && metrics.error) || 'empty metrics payload');
      }
      if (memEl) {
        memEl.textContent = `${metrics.memoryUsedPct}% used · ${metrics.freeMemoryGB} of ${metrics.totalMemoryGB} GB free`;
      }
      if (cpuEl) {
        cpuEl.textContent = metrics.cpuLoadPct == null
          ? `${metrics.cpuCores} threads`
          : `${metrics.cpuLoadPct}% across ${metrics.cpuCores} threads`;
      }
    } catch (e) {
      console.warn('[Performance Toggle] get-live-metrics failed:', e.message);
      if (memEl) memEl.textContent = TELEMETRY_UNAVAILABLE;
      if (cpuEl) cpuEl.textContent = TELEMETRY_UNAVAILABLE;
    }
  }

  async function updateTelemetry() {
    await Promise.all([readGpuTelemetry(), readMemoryTelemetry()]);
  }

  /**
   * SETUP EVENT LISTENERS
   */
  function setupEventListeners() {
    document.querySelectorAll('.perf-option-item').forEach(opt => {
      opt.addEventListener('click', () => {
        const mode = opt.getAttribute('data-mode');
        if (mode) setPerformanceMode(mode);
      });
    });

    document.querySelector('.settings-tab-btn[data-tab="performance"]')
      ?.addEventListener('click', updateTelemetry);
  }

  /**
   * INITIALIZE PERFORMANCE TOGGLE
   */
  function initialize() {
    if (isInitialized) return;

    currentMode = getCurrentMode();
    setupEventListeners();
    updateToggleUI();
    updateTelemetry();

    isInitialized = true;
    console.log('[Performance Toggle] Initialized with mode:', currentMode.toUpperCase());
  }

  /**
   * PUBLIC API
   */
  window.UltronPerformanceToggle = {
    initialize,
    getCurrentMode: () => currentMode,
    setMode: setPerformanceMode,
    getModes: () => ({ ...PERFORMANCE_MODES }),
    updateTelemetry,
    isInitialized: () => isInitialized
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    setTimeout(initialize, 100);
  }
})();
