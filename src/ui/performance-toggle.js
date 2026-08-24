/**
 * Performance Mode Toggle UI
 * Allows users to switch between CPU, GPU, and Auto performance modes
 */
(function () {
  'use strict';

  const PERFORMANCE_MODES = {
    AUTO: 'auto',
    GPU: 'gpu',
    CPU: 'cpu'
  };

  const MODE_CONFIG = {
    [PERFORMANCE_MODES.AUTO]: {
      id: 'auto',
      label: 'Auto',
      title: 'Performance Mode: Auto (Adaptive)',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="3"/><path d="M12 1v6m0 6v6m11-7h-6m-6 0H1"/></svg>`,
      tag: 'Recommended',
      color: '#38bdf8'
    },
    [PERFORMANCE_MODES.GPU]: {
      id: 'gpu',
      label: 'GPU',
      title: 'Performance Mode: GPU Priority',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`,
      tag: 'Maximum Speed',
      color: '#34d399'
    },
    [PERFORMANCE_MODES.CPU]: {
      id: 'cpu',
      label: 'CPU',
      title: 'Performance Mode: CPU Only',
      icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/></svg>`,
      tag: 'Safe & Low Power',
      color: '#fbbf24'
    }
  };

  let currentMode = PERFORMANCE_MODES.AUTO;
  let btnToggle = null;
  let dropdownMenu = null;
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
      if (mode === PERFORMANCE_MODES.GPU) {
        window.UltronGPUConfig.enable();
      } else if (mode === PERFORMANCE_MODES.CPU) {
        window.UltronGPUConfig.disable();
      } else {
        window.UltronGPUConfig.enable();
      }
    }

    // Update UI
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
    btnToggle = btnToggle || document.getElementById('btn-performance-mode');
    dropdownMenu = dropdownMenu || document.getElementById('performance-mode-dropdown');

    const config = MODE_CONFIG[currentMode] || MODE_CONFIG[PERFORMANCE_MODES.AUTO];

    if (btnToggle) {
      btnToggle.setAttribute('data-mode', config.id);
      btnToggle.title = config.title;

      const iconEl = document.getElementById('performance-mode-icon');
      if (iconEl) iconEl.innerHTML = config.icon;

      const labelEl = document.getElementById('performance-mode-label');
      if (labelEl) labelEl.textContent = config.label;
    }

    if (dropdownMenu) {
      const options = dropdownMenu.querySelectorAll('.perf-option-item');
      options.forEach(opt => {
        const mode = opt.getAttribute('data-mode');
        if (mode === currentMode) {
          opt.classList.add('active');
        } else {
          opt.classList.remove('active');
        }
      });
    }
  }

  /**
   * UPDATE SYSTEM TELEMETRY IN DROPDOWN
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
   * DROPDOWN CONTROLS
   */
  function openDropdown() {
    if (!dropdownMenu) dropdownMenu = document.getElementById('performance-mode-dropdown');
    if (!btnToggle) btnToggle = document.getElementById('btn-performance-mode');
    if (!dropdownMenu) return;

    dropdownMenu.classList.remove('hidden');
    if (btnToggle) btnToggle.setAttribute('aria-expanded', 'true');
    updateTelemetry();
  }

  function closeDropdown() {
    if (!dropdownMenu) dropdownMenu = document.getElementById('performance-mode-dropdown');
    if (!btnToggle) btnToggle = document.getElementById('btn-performance-mode');
    if (!dropdownMenu) return;

    dropdownMenu.classList.add('hidden');
    if (btnToggle) btnToggle.setAttribute('aria-expanded', 'false');
  }

  function toggleDropdown() {
    if (!dropdownMenu) dropdownMenu = document.getElementById('performance-mode-dropdown');
    if (dropdownMenu && !dropdownMenu.classList.contains('hidden')) {
      closeDropdown();
    } else {
      openDropdown();
    }
  }

  /**
   * SETUP EVENT LISTENERS
   */
  function setupEventListeners() {
    btnToggle = document.getElementById('btn-performance-mode');
    dropdownMenu = document.getElementById('performance-mode-dropdown');

    if (btnToggle) {
      btnToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleDropdown();
      });
    }

    if (dropdownMenu) {
      const options = dropdownMenu.querySelectorAll('.perf-option-item');
      options.forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const mode = opt.getAttribute('data-mode');
          if (mode) {
            setPerformanceMode(mode);
            closeDropdown();
          }
        });
      });
    }

    document.addEventListener('click', (e) => {
      const wrapper = document.getElementById('performance-toggle-wrapper');
      if (wrapper && !wrapper.contains(e.target)) {
        closeDropdown();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDropdown();
      }
    });
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
    open: openDropdown,
    close: closeDropdown,
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