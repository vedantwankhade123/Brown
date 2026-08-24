/**
 * Ultron Memory Manager
 * Prevents memory leaks and manages resources to stop freezing/lagging
 */
(function () {
  'use strict';

  // Track active resources
  const resources = {
    intervals: new Set(),
    timeouts: new Set(),
    listeners: new Map(),
    abortControllers: new Set(),
    streams: new Set()
  };

  // Performance monitoring
  const perf = {
    lastCleanup: Date.now(),
    cleanupInterval: 30000, // Clean every 30 seconds
    messageCount: 0,
    maxMessages: 100, // Keep only last 100 messages in DOM
    enabled: true
  };

  /**
   * SMART CLEANUP - Prevents memory leaks
   */
  function cleanup() {
    console.log('[Memory Manager] Running cleanup...');
    
    // Clean old abort controllers
    resources.abortControllers.forEach(ctrl => {
      if (ctrl && ctrl.signal && ctrl.signal.aborted) {
        resources.abortControllers.delete(ctrl);
      }
    });

    // Clean old streams
    resources.streams.forEach(stream => {
      try {
        if (stream && stream.locked === false) {
          stream.cancel();
          resources.streams.delete(stream);
        }
      } catch (e) {
        resources.streams.delete(stream);
      }
    });

    // Clean chat messages - keep only last 100
    cleanupOldMessages();

    // Clean localStorage if too large
    cleanupLocalStorage();

    // Force garbage collection hint
    if (window.gc) {
      window.gc();
    }

    perf.lastCleanup = Date.now();
    console.log('[Memory Manager] ✓ Cleanup complete');
  }

  /**
   * CLEAN OLD MESSAGES - Prevent DOM bloat
   */
  function cleanupOldMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    const messages = container.querySelectorAll('.message, .message-assistant, .message-user');
    if (messages.length > perf.maxMessages) {
      const toRemove = messages.length - perf.maxMessages;
      console.log(`[Memory Manager] Removing ${toRemove} old messages`);
      
      for (let i = 0; i < toRemove; i++) {
        if (messages[i]) {
          messages[i].remove();
        }
      }
    }
  }

  /**
   * CLEAN LOCALSTORAGE - Prevent storage overflow
   */
  function cleanupLocalStorage() {
    try {
      // Check storage size
      let totalSize = 0;
      for (let key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          totalSize += localStorage[key].length + key.length;
        }
      }

      // If over 4MB, clean old data
      if (totalSize > 4 * 1024 * 1024) {
        console.log('[Memory Manager] localStorage too large, cleaning...');
        
        // Remove old conversation history (keep only last 10)
        const conversations = JSON.parse(localStorage.getItem('ultron-conversations') || '[]');
        if (conversations.length > 10) {
          localStorage.setItem('ultron-conversations', JSON.stringify(conversations.slice(-10)));
        }

        // Remove old logs
        localStorage.removeItem('ultron-old-logs');
        localStorage.removeItem('ultron-debug-logs');
      }
    } catch (error) {
      console.warn('[Memory Manager] localStorage cleanup failed:', error);
    }
  }

  /**
   * REGISTER INTERVAL - Track for cleanup
   */
  function registerInterval(id) {
    resources.intervals.add(id);
    return id;
  }

  /**
   * REGISTER TIMEOUT - Track for cleanup
   */
  function registerTimeout(id) {
    resources.timeouts.add(id);
    return id;
  }

  /**
   * CLEAR ALL INTERVALS - Emergency cleanup
   */
  function clearAllIntervals() {
    resources.intervals.forEach(id => clearInterval(id));
    resources.intervals.clear();
  }

  /**
   * CLEAR ALL TIMEOUTS - Emergency cleanup
   */
  function clearAllTimeouts() {
    resources.timeouts.forEach(id => clearTimeout(id));
    resources.timeouts.clear();
  }

  /**
   * REGISTER EVENT LISTENER - Track for removal
   */
  function registerListener(element, event, handler) {
    const key = `${element.id || 'unknown'}-${event}`;
    if (!resources.listeners.has(key)) {
      resources.listeners.set(key, []);
    }
    resources.listeners.get(key).push({ element, event, handler });
    element.addEventListener(event, handler);
  }

  /**
   * REMOVE ALL LISTENERS - Cleanup
   */
  function removeAllListeners() {
    resources.listeners.forEach((listeners, key) => {
      listeners.forEach(({ element, event, handler }) => {
        try {
          element.removeEventListener(event, handler);
        } catch (e) {
          // Element might be removed already
        }
      });
    });
    resources.listeners.clear();
  }

  /**
   * REGISTER ABORT CONTROLLER
   */
  function registerAbortController(controller) {
    resources.abortControllers.add(controller);
    return controller;
  }

  /**
   * ABORT ALL REQUESTS - Stop all pending operations
   */
  function abortAllRequests() {
    resources.abortControllers.forEach(ctrl => {
      try {
        if (ctrl && !ctrl.signal.aborted) {
          ctrl.abort();
        }
      } catch (e) {
        console.warn('[Memory Manager] Failed to abort controller:', e);
      }
    });
    resources.abortControllers.clear();
  }

  /**
   * REGISTER STREAM
   */
  function registerStream(stream) {
    resources.streams.add(stream);
    return stream;
  }

  /**
   * RESET APP - Full cleanup and restart
   */
  function resetApp() {
    console.log('[Memory Manager] Full app reset initiated...');
    
    // Abort all pending operations
    abortAllRequests();
    
    // Clear all timers
    clearAllIntervals();
    clearAllTimeouts();
    
    // Remove event listeners
    removeAllListeners();
    
    // Clean DOM
    cleanupOldMessages();
    
    // Clear some localStorage
    try {
      localStorage.removeItem('ultron-temp-data');
      localStorage.removeItem('ultron-cache');
    } catch (e) {}
    
    console.log('[Memory Manager] ✓ App reset complete');
  }

  /**
   * CHECK MEMORY USAGE
   */
  function checkMemoryUsage() {
    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize;
      const limit = performance.memory.jsHeapSizeLimit;
      const percentage = (used / limit) * 100;
      
      console.log(`[Memory Manager] Memory usage: ${(used / 1024 / 1024).toFixed(2)}MB / ${(limit / 1024 / 1024).toFixed(2)}MB (${percentage.toFixed(1)}%)`);
      
      // If over 80%, trigger cleanup
      if (percentage > 80) {
        console.warn('[Memory Manager] High memory usage detected, cleaning up...');
        cleanup();
      }
      
      return { used, limit, percentage };
    }
    return null;
  }

  /**
   * MONITOR PERFORMANCE
   */
  function startPerformanceMonitoring() {
    // Periodic cleanup
    const cleanupInterval = setInterval(() => {
      if (perf.enabled) {
        cleanup();
        checkMemoryUsage();
      }
    }, perf.cleanupInterval);

    registerInterval(cleanupInterval);

    // Monitor long tasks
    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              console.warn(`[Memory Manager] Long task detected: ${entry.name} (${entry.duration.toFixed(2)}ms)`);
            }
          }
        });
        observer.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        console.log('[Memory Manager] Long task monitoring not available');
      }
    }

    console.log('[Memory Manager] ✓ Performance monitoring started');
  }

  /**
   * OPTIMIZE RESPONSE RENDERING - Prevent UI freezing
   */
  function optimizeResponseRendering() {
    // Use requestAnimationFrame for DOM updates
    window.requestIdleCallback = window.requestIdleCallback || function(cb) {
      const start = Date.now();
      return setTimeout(function() {
        cb({
          didTimeout: false,
          timeRemaining: function() {
            return Math.max(0, 50.0 - (Date.now() - start));
          }
        });
      }, 1);
    };
  }

  /**
   * DEBOUNCE - Prevent excessive function calls
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * THROTTLE - Limit function execution rate
   */
  function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }

  /**
   * INITIALIZE MEMORY MANAGER
   */
  function initialize() {
    console.log('[Memory Manager] Initializing...');
    
    // Start monitoring
    startPerformanceMonitoring();
    
    // Optimize rendering
    optimizeResponseRendering();
    
    // Cleanup on visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        console.log('[Memory Manager] App hidden, running cleanup...');
        cleanup();
      }
    });

    // Emergency cleanup on memory warning (if supported)
    if ('onmemorywarning' in window) {
      window.addEventListener('memorywarning', () => {
        console.warn('[Memory Manager] Memory warning received!');
        cleanup();
      });
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      abortAllRequests();
      clearAllIntervals();
      clearAllTimeouts();
    });

    console.log('[Memory Manager] ✓ Initialized successfully');
  }

  // PUBLIC API
  window.UltronMemoryManager = {
    initialize,
    cleanup,
    resetApp,
    checkMemoryUsage,
    
    // Resource management
    registerInterval,
    registerTimeout,
    registerListener,
    registerAbortController,
    registerStream,
    
    // Cleanup functions
    clearAllIntervals,
    clearAllTimeouts,
    removeAllListeners,
    abortAllRequests,
    cleanupOldMessages,
    
    // Utilities
    debounce,
    throttle,
    
    // Configuration
    setMaxMessages: (max) => { perf.maxMessages = max; },
    setCleanupInterval: (ms) => { perf.cleanupInterval = ms; },
    enable: () => { perf.enabled = true; },
    disable: () => { perf.enabled = false; },
    
    // Status
    getStatus: () => ({
      ...perf,
      intervals: resources.intervals.size,
      timeouts: resources.timeouts.size,
      listeners: resources.listeners.size,
      abortControllers: resources.abortControllers.size,
      streams: resources.streams.size
    })
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
