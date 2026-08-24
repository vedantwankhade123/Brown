/**
 * GPU Configuration for Ultron AI
 * Prioritizes GPU acceleration for all local AI models
 */
(function () {
  'use strict';

  // GPU Configuration
  const GPU_CONFIG = {
    enabled: true,
    autoDetect: true,
    priority: 'gpu-first',  // 'gpu-first', 'cpu-first', 'balanced'
    
    // Ollama specific
    ollama: {
      num_gpu: 999,  // Load all layers on GPU
      use_mmap: true,
      f16_kv: true,
      low_vram: false,
      num_batch: 512,
      num_ctx: 4096
    },
    
    // LM Studio specific
    lmstudio: {
      ngl: 999,  // Number of GPU layers
      use_mlock: false,
      n_batch: 512,
      n_ctx: 4096
    },
    
    // General settings
    general: {
      preferGPU: true,
      fallbackToCPU: true,
      memoryThreshold: 0.9  // Use up to 90% of available GPU memory
    }
  };

  /**
   * Detect available GPU
   */
  async function detectGPU() {
    const gpuInfo = {
      available: false,
      vendor: 'unknown',
      model: 'unknown',
      vram: 0,
      driver: 'unknown'
    };

    try {
      // Try WebGPU detection first (modern browsers)
      if ('gpu' in navigator) {
        const adapter = await navigator.gpu.requestAdapter();
        if (adapter) {
          const info = await adapter.requestAdapterInfo();
          gpuInfo.available = true;
          gpuInfo.vendor = info.vendor || 'unknown';
          gpuInfo.model = info.architecture || 'unknown';
          console.log('[GPU Config] WebGPU detected:', gpuInfo);
          return gpuInfo;
        }
      }

      // Fallback: Try WebGL detection
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuInfo.available = true;
          gpuInfo.vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          gpuInfo.model = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          console.log('[GPU Config] WebGL GPU detected:', gpuInfo);
        }
      }

      // Check via IPC if running in Electron
      if (window.ultronAPI && typeof window.ultronAPI.getSystemInfo === 'function') {
        const sysInfo = await window.ultronAPI.getSystemInfo();
        if (sysInfo && sysInfo.gpu) {
          gpuInfo.available = true;
          gpuInfo.vendor = sysInfo.gpu.vendor || gpuInfo.vendor;
          gpuInfo.model = sysInfo.gpu.model || gpuInfo.model;
          gpuInfo.vram = sysInfo.gpu.vram || 0;
          console.log('[GPU Config] System GPU info:', gpuInfo);
        }
      }

    } catch (error) {
      console.warn('[GPU Config] GPU detection failed:', error);
    }

    return gpuInfo;
  }

  /**
   * Get Ollama GPU parameters
   */
  function getOllamaGPUParams() {
    if (!GPU_CONFIG.enabled) {
      return { num_gpu: 0 };
    }

    return {
      num_gpu: GPU_CONFIG.ollama.num_gpu,
      use_mmap: GPU_CONFIG.ollama.use_mmap,
      f16_kv: GPU_CONFIG.ollama.f16_kv,
      low_vram: GPU_CONFIG.ollama.low_vram,
      num_batch: GPU_CONFIG.ollama.num_batch,
      num_ctx: GPU_CONFIG.ollama.num_ctx
    };
  }

  /**
   * Get LM Studio GPU parameters
   */
  function getLMStudioGPUParams() {
    if (!GPU_CONFIG.enabled) {
      return { ngl: 0 };
    }

    return {
      ngl: GPU_CONFIG.lmstudio.ngl,
      use_mlock: GPU_CONFIG.lmstudio.use_mlock,
      n_batch: GPU_CONFIG.lmstudio.n_batch,
      n_ctx: GPU_CONFIG.lmstudio.n_ctx
    };
  }

  /**
   * Check if GPU should be used
   */
  async function shouldUseGPU() {
    if (!GPU_CONFIG.enabled) return false;

    const gpuInfo = await detectGPU();
    return gpuInfo.available;
  }

  /**
   * Configure GPU for provider
   */
  async function configureGPUForProvider(provider, model) {
    const useGPU = await shouldUseGPU();
    
    if (!useGPU) {
      console.log('[GPU Config] GPU not available, using CPU');
      return null;
    }

    let gpuParams = null;

    switch (provider.toLowerCase()) {
      case 'ollama':
        gpuParams = getOllamaGPUParams();
        console.log('[GPU Config] Ollama GPU params:', gpuParams);
        break;

      case 'lmstudio':
      case 'custom':
        gpuParams = getLMStudioGPUParams();
        console.log('[GPU Config] LM Studio GPU params:', gpuParams);
        break;

      default:
        console.log('[GPU Config] Cloud provider, GPU config not applicable');
    }

    return gpuParams;
  }

  /**
   * Save GPU preference
   */
  function saveGPUPreference(enabled) {
    try {
      window.localStorage.setItem('ultron-gpu-enabled', enabled.toString());
      GPU_CONFIG.enabled = enabled;
      console.log('[GPU Config] GPU preference saved:', enabled);
    } catch (error) {
      console.error('[GPU Config] Failed to save preference:', error);
    }
  }

  /**
   * Load GPU preference
   */
  function loadGPUPreference() {
    try {
      const saved = window.localStorage.getItem('ultron-gpu-enabled');
      if (saved !== null) {
        GPU_CONFIG.enabled = saved === 'true';
        console.log('[GPU Config] GPU preference loaded:', GPU_CONFIG.enabled);
      }
    } catch (error) {
      console.error('[GPU Config] Failed to load preference:', error);
    }
  }

  /**
   * Initialize GPU configuration
   */
  async function initialize() {
    console.log('[GPU Config] Initializing GPU configuration...');
    
    // Load user preference
    loadGPUPreference();

    // Auto-detect GPU
    if (GPU_CONFIG.autoDetect) {
      const gpuInfo = await detectGPU();
      
      if (gpuInfo.available) {
        console.log('[GPU Config] ✓ GPU detected and enabled');
        console.log(`[GPU Config] Vendor: ${gpuInfo.vendor}`);
        console.log(`[GPU Config] Model: ${gpuInfo.model}`);
        if (gpuInfo.vram) {
          console.log(`[GPU Config] VRAM: ${gpuInfo.vram} MB`);
        }
      } else {
        console.log('[GPU Config] ⚠ No GPU detected, using CPU');
      }

      // Store GPU info globally
      window.UltronGPUInfo = gpuInfo;
    }

    console.log('[GPU Config] ✓ Initialization complete');
  }

  // Public API
  window.UltronGPUConfig = {
    initialize,
    detectGPU,
    shouldUseGPU,
    configureGPUForProvider,
    getOllamaGPUParams,
    getLMStudioGPUParams,
    saveGPUPreference,
    loadGPUPreference,
    
    // Getters/Setters
    isEnabled: () => GPU_CONFIG.enabled,
    enable: () => { GPU_CONFIG.enabled = true; saveGPUPreference(true); },
    disable: () => { GPU_CONFIG.enabled = false; saveGPUPreference(false); },
    getConfig: () => ({ ...GPU_CONFIG }),
    setConfig: (config) => Object.assign(GPU_CONFIG, config)
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
