/**
 * Ultron Performance Optimizer
 * Fixes lagging, freezing, and unresponsiveness issues
 */
(function () {
  'use strict';

  // Performance configuration
  const config = {
    virtualScrollEnabled: true,
    lazyRenderEnabled: true,
    asyncRenderEnabled: true,
    maxConcurrentRequests: 1,  // Limit to 1 request at a time
    requestQueueEnabled: true,
    responseStreamingEnabled: false,  // Disable streaming to prevent freezing
    debounceDelay: 300,
    throttleDelay: 100
  };

  // Request queue to prevent concurrent overload
  let requestQueue = [];
  let isProcessingRequest = false;

  /**
   * QUEUE REQUEST - Prevent concurrent overload
   */
  async function queueRequest(requestFn) {
    return new Promise((resolve, reject) => {
      requestQueue.push({ requestFn, resolve, reject });
      processQueue();
    });
  }

  /**
   * PROCESS QUEUE - Handle requests one at a time
   */
  async function processQueue() {
    if (isProcessingRequest || requestQueue.length === 0) {
      return;
    }

    isProcessingRequest = true;
    const { requestFn, resolve, reject } = requestQueue.shift();

    try {
      const result = await requestFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      isProcessingRequest = false;
      
      // Process next in queue
      if (requestQueue.length > 0) {
        setTimeout(processQueue, 100); // Small delay between requests
      }
    }
  }

  /**
   * CLEAR REQUEST QUEUE - Emergency stop
   */
  function clearRequestQueue() {
    requestQueue.forEach(({ reject }) => {
      reject(new Error('Request cancelled due to queue clear'));
    });
    requestQueue = [];
    isProcessingRequest = false;
  }

  /**
   * OPTIMIZE ASYNC RENDERING - Prevent UI freezing
   */
  function asyncRender(element, content) {
    if (!config.asyncRenderEnabled) {
      element.innerHTML = content;
      return;
    }

    // Use requestIdleCallback to render during idle time
    requestIdleCallback(() => {
      element.innerHTML = content;
    }, { timeout: 100 });
  }

  /**
   * CHUNK TEXT RENDERING - For long responses
   */
  function renderTextInChunks(element, text, chunkSize = 1000) {
    if (text.length < chunkSize) {
      element.textContent = text;
      return;
    }

    // Clear first
    element.textContent = '';
    
    let index = 0;
    
    function renderChunk() {
      const chunk = text.slice(index, index + chunkSize);
      const textNode = document.createTextNode(chunk);
      element.appendChild(textNode);
      
      index += chunkSize;
      
      if (index < text.length) {
        requestIdleCallback(renderChunk, { timeout: 50 });
      }
    }

    renderChunk();
  }

  /**
   * DEBOUNCED INPUT - Prevent excessive processing
   */
  function createDebouncedInput(inputElement, callback, delay = 300) {
    let timeout;
    
    const debouncedFn = (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => callback(e), delay);
    };

    inputElement.addEventListener('input', debouncedFn);
    
    return () => {
      clearTimeout(timeout);
      inputElement.removeEventListener('input', debouncedFn);
    };
  }

  /**
   * THROTTLED SCROLL - Prevent scroll lag
   */
  function createThrottledScroll(element, callback, delay = 100) {
    let isThrottled = false;
    
    const throttledFn = (e) => {
      if (isThrottled) return;
      
      isThrottled = true;
      callback(e);
      
      setTimeout(() => {
        isThrottled = false;
      }, delay);
    };

    element.addEventListener('scroll', throttledFn, { passive: true });
    
    return () => {
      element.removeEventListener('scroll', throttledFn);
    };
  }

  /**
   * VIRTUAL SCROLLING - For large message lists
   */
  function enableVirtualScrolling(container) {
    if (!config.virtualScrollEnabled) return;

    const messages = Array.from(container.children);
    const itemHeight = 100; // Approximate message height
    const containerHeight = container.clientHeight;
    const visibleCount = Math.ceil(containerHeight / itemHeight) + 2; // Buffer

    let scrollTop = 0;

    function updateVisibleMessages() {
      const startIndex = Math.floor(scrollTop / itemHeight);
      const endIndex = Math.min(startIndex + visibleCount, messages.length);

      messages.forEach((msg, index) => {
        if (index >= startIndex && index < endIndex) {
          msg.style.display = '';
        } else {
          msg.style.display = 'none';
        }
      });
    }

    createThrottledScroll(container, (e) => {
      scrollTop = e.target.scrollTop;
      updateVisibleMessages();
    }, 50);

    updateVisibleMessages();
  }

  /**
   * OPTIMIZE MARKDOWN RENDERING - Prevent freezing on large text
   */
  function optimizeMarkdownRender(text) {
    // Skip heavy markdown parsing for very long text
    if (text.length > 10000) {
      // Simple rendering for large text
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }

    // Full markdown for normal text
    return text; // Use your existing markdown parser
  }

  /**
   * PREVENT EVENT LISTENER LEAKS
   */
  const managedListeners = new WeakMap();

  function addManagedListener(element, event, handler, options) {
    if (!managedListeners.has(element)) {
      managedListeners.set(element, []);
    }

    const listeners = managedListeners.get(element);
    listeners.push({ event, handler, options });
    
    element.addEventListener(event, handler, options);
  }

  function removeManagedListeners(element) {
    const listeners = managedListeners.get(element);
    if (!listeners) return;

    listeners.forEach(({ event, handler, options }) => {
      element.removeEventListener(event, handler, options);
    });

    managedListeners.delete(element);
  }

  /**
   * OPTIMIZE IMAGE LOADING - Lazy load images
   */
  function enableLazyImageLoading() {
    const images = document.querySelectorAll('img[data-src]');
    
    const imageObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          imageObserver.unobserve(img);
        }
      });
    }, {
      rootMargin: '50px'
    });

    images.forEach(img => imageObserver.observe(img));
  }

  /**
   * BATCH DOM UPDATES - Prevent layout thrashing
   */
  class DOMBatcher {
    constructor() {
      this.reads = [];
      this.writes = [];
      this.scheduled = false;
    }

    read(fn) {
      this.reads.push(fn);
      this.schedule();
    }

    write(fn) {
      this.writes.push(fn);
      this.schedule();
    }

    schedule() {
      if (this.scheduled) return;
      
      this.scheduled = true;
      requestAnimationFrame(() => {
        // Do all reads first
        this.reads.forEach(fn => fn());
        this.reads = [];

        // Then all writes
        this.writes.forEach(fn => fn());
        this.writes = [];

        this.scheduled = false;
      });
    }
  }

  const domBatcher = new DOMBatcher();

  /**
   * OPTIMIZE CHAT SCROLLING - Prevent jank
   */
  function optimizeChatScrolling(container) {
    let isScrolling = false;
    let scrollTimeout;

    container.addEventListener('scroll', () => {
      container.classList.add('scrolling');
      isScrolling = true;

      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        container.classList.remove('scrolling');
        isScrolling = false;
      }, 150);
    }, { passive: true });

    return {
      isScrolling: () => isScrolling
    };
  }

  /**
   * REDUCE REFLOWS - Use transform instead of position
   */
  function smoothScrollTo(element, target) {
    const start = element.scrollTop;
    const distance = target - start;
    const duration = 300;
    let startTime;

    function animation(currentTime) {
      if (!startTime) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
      
      // Easing function
      const ease = progress < 0.5
        ? 2 * progress * progress
        : -1 + (4 - 2 * progress) * progress;

      element.scrollTop = start + distance * ease;

      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      }
    }

    requestAnimationFrame(animation);
  }

  /**
   * FPS MONITOR - Detect performance issues
   */
  class FPSMonitor {
    constructor() {
      this.fps = 60;
      this.lastTime = performance.now();
      this.frames = 0;
      this.monitoring = false;
    }

    start() {
      this.monitoring = true;
      this.measure();
    }

    stop() {
      this.monitoring = false;
    }

    measure() {
      if (!this.monitoring) return;

      this.frames++;
      const now = performance.now();
      const delta = now - this.lastTime;

      if (delta >= 1000) {
        this.fps = Math.round((this.frames * 1000) / delta);
        this.frames = 0;
        this.lastTime = now;

        if (this.fps < 30) {
          console.warn(`[Performance] Low FPS detected: ${this.fps}`);
        }
      }

      requestAnimationFrame(() => this.measure());
    }

    getFPS() {
      return this.fps;
    }
  }

  const fpsMonitor = new FPSMonitor();

  /**
   * INITIALIZE PERFORMANCE OPTIMIZER
   */
  function initialize() {
    console.log('[Performance] Initializing optimizer...');

    // Enable lazy image loading
    if (typeof IntersectionObserver !== 'undefined') {
      enableLazyImageLoading();
    }

    // Optimize chat container if exists
    const chatContainer = document.getElementById('chat-messages-container');
    if (chatContainer) {
      optimizeChatScrolling(chatContainer);
      enableVirtualScrolling(chatContainer);
    }

    // Start FPS monitoring in dev mode
    if (localStorage.getItem('ultron-debug') === 'true') {
      fpsMonitor.start();
    }

    // Warn about performance issues
    window.addEventListener('load', () => {
      const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
      if (loadTime > 3000) {
        console.warn(`[Performance] Slow page load: ${loadTime}ms`);
      }
    });

    console.log('[Performance] ✓ Optimizer initialized');
  }

  // PUBLIC API
  window.UltronPerformanceOptimizer = {
    initialize,
    
    // Request management
    queueRequest,
    clearRequestQueue,
    
    // Rendering
    asyncRender,
    renderTextInChunks,
    optimizeMarkdownRender,
    
    // Event optimization
    createDebouncedInput,
    createThrottledScroll,
    addManagedListener,
    removeManagedListeners,
    
    // DOM optimization
    domBatcher,
    smoothScrollTo,
    
    // Monitoring
    fpsMonitor,
    
    // Configuration
    setConfig: (newConfig) => Object.assign(config, newConfig),
    getConfig: () => ({ ...config }),
    
    // Virtual scrolling
    enableVirtualScrolling,
    
    // Lazy loading
    enableLazyImageLoading
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

})();
