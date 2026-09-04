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
   */
  async function updateTelemetry() {
    const gpuEl = document.getElementById('perf-gpu-telemetry');
    const memEl = document.getElementById('perf-mem-telemetry');

    try {
      if (gpuEl) {
        if (window.ultronAPI && typeof window.ultronAPI.getSystemInfo === 'function') {
          const sysInfo = await window.ultronAPI.getSystemInfo();
          if (sysInfo && sysInfo.gpu) {
            const name = sysInfo.gpu.model || sysInfo.gpu.name || sysInfo.gpu.vendor || 'Integrated Graphics';
            const vram = sysInfo.gpu.vramGB ? ` (${sysInfo.gpu.vramGB} GB)` : '';
            gpuEl.textContent = `${name}${vram}`;
          } else if (sysInfo && Array.isArray(sysInfo.gpus) && sysInfo.gpus.length > 0) {
            gpuEl.textContent = sysInfo.gpus[0];
          } else {
            gpuEl.textContent = 'Auto (DirectX / Vulkan)';
          }
        } else {
          gpuEl.textContent = 'Hardware Acceleration Ready';
        }
      }

      if (memEl) {
        if (window.ultronAPI && typeof window.ultronAPI.getLiveMetrics === 'function') {
          const metrics = await window.ultronAPI.getLiveMetrics();
          if (metrics && metrics.success) {
            memEl.textContent = `${metrics.memoryUsedPct}% used (${metrics.freeMemoryGB} GB free)`;
          } else if (performance.memory) {
            const usedMB = Math.round(performance.memory.usedJSHeapSize / (1024 * 1024));
            memEl.textContent = `${usedMB} MB JS Heap`;
          }
        }
      }
    } catch (e) {
      if (gpuEl) gpuEl.textContent = 'Active';
    }
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
