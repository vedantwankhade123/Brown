/**
 * Agent Loop Performance Fix V2
 * Prevents infinite loops, freezing, and unresponsiveness in the agent execution
 */
(function () {
  'use strict';

  const CONFIG = {
    maxTimeout: 30000,          // 30 second max timeout
    maxConcurrentRequests: 3,   // Max concurrent agent requests  
    maxRetries: 2,              // Max retry attempts
    cooldownPeriod: 1000,       // Cooldown between requests
    maxLoopIterations: 5,       // Max iterations before forcing stop
    enableCircuitBreaker: true, // Circuit breaker pattern
    debugMode: false            // Debug logging
  };

  let requestQueue = [];
  let activeRequests = 0;
  let lastRequestTime = 0;
  let circuitBreakerOpen = false;
  let circuitBreakerOpenTime = 0;
  let loopIterationCount = 0;
  let isAgentLoopRunning = false;

  /**
   * LOG SYSTEM
   */
  function log(message, level = 'info') {
    if (!CONFIG.debugMode && level === 'debug') return;
    
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');
    const prefix = `[Agent Loop V2] ${timestamp}`;
    
    switch (level) {
      case 'error':
        console.error(`${prefix} ERROR: ${message}`);
        break;
      case 'warn':
        console.warn(`${prefix} WARN: ${message}`);
        break;
      case 'debug':
        console.log(`${prefix} DEBUG: ${message}`);
        break;
      default:
        console.log(`${prefix} ${message}`);
    }
  }

  /**
   * CIRCUIT BREAKER PATTERN
   */
  function checkCircuitBreaker() {
    if (!CONFIG.enableCircuitBreaker) return true;
    
    if (circuitBreakerOpen) {
      const now = Date.now();
      if (now - circuitBreakerOpenTime > 10000) { // 10 second recovery
        circuitBreakerOpen = false;
        circuitBreakerOpenTime = 0;
        log('Circuit breaker closed - system recovered');
        return true;
      }
      return false;
    }
    return true;
  }

  function openCircuitBreaker(reason) {
    if (!CONFIG.enableCircuitBreaker) return;
    
    circuitBreakerOpen = true;
    circuitBreakerOpenTime = Date.now();
    log(`Circuit breaker opened: ${reason}`, 'warn');
    
    // Reset counters
    loopIterationCount = 0;
    isAgentLoopRunning = false;
    activeRequests = 0;
  }

  /**
   * PREVENT INFINITE LOOPS
   */
  function checkInfiniteLoop() {
    loopIterationCount++;
    
    if (loopIterationCount > CONFIG.maxLoopIterations) {
      openCircuitBreaker('Max loop iterations exceeded');
      throw new Error(`Agent loop stopped: exceeded ${CONFIG.maxLoopIterations} iterations`);
    }
    
    log(`Loop iteration ${loopIterationCount}/${CONFIG.maxLoopIterations}`, 'debug');
  }

  function resetLoopCounter() {
    loopIterationCount = 0;
    log('Loop counter reset', 'debug');
  }

  /**
   * REQUEST QUEUE SYSTEM
   */
  function canProcessRequest() {
    if (!checkCircuitBreaker()) {
      return false;
    }
    
    if (activeRequests >= CONFIG.maxConcurrentRequests) {
      log(`Request blocked: ${activeRequests}/${CONFIG.maxConcurrentRequests} active requests`, 'debug');
      return false;
    }
    
    const now = Date.now();
    if (now - lastRequestTime < CONFIG.cooldownPeriod) {
      log(`Request blocked: cooldown period (${CONFIG.cooldownPeriod}ms)`, 'debug');
      return false;
    }
    
    return true;
  }

  async function processRequest(requestFn, options = {}) {
    if (!canProcessRequest()) {
      throw new Error('Agent busy: too many concurrent requests or system in recovery mode');
    }
    
    activeRequests++;
    lastRequestTime = Date.now();
    
    log(`Processing request (${activeRequests} active)`, 'debug');
    
    try {
      const result = await requestFn(options);
      return result;
    } finally {
      activeRequests--;
      log(`Request completed (${activeRequests} active)`, 'debug');
    }
  }

  /**
   * ENHANCED AGENT LOOP WRAPPER
   */
  function createSafeAgentLoop(originalFunction) {
    return async function safeAgentLoop(userMessage, aiBubble, intent = 'action', imagePayloads = []) {
      // Prevent multiple simultaneous loops
      if (isAgentLoopRunning) {
        log('Agent loop already running, queuing request', 'warn');
        throw new Error('Agent is already processing a request. Please wait.');
      }
      
      // Check circuit breaker
      if (!checkCircuitBreaker()) {
        throw new Error('Agent temporarily unavailable. System is recovering from errors.');
      }
      
      // Check for infinite loop patterns
      checkInfiniteLoop();
      
      isAgentLoopRunning = true;
      const startTime = Date.now();
      
      log(`Starting agent loop: ${intent} - "${userMessage?.substring(0, 50)}..."`);
      
      // Setup timeout
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        log('Agent loop timeout reached', 'warn');
        abortController.abort();
      }, CONFIG.maxTimeout);
      
      try {
        // Process the request with timeout
        const result = await Promise.race([
          processRequest(async () => {
            return await originalFunction.call(this, userMessage, aiBubble, intent, imagePayloads);
          }, { signal: abortController.signal }),
          
          new Promise((_, reject) => {
            abortController.signal.addEventListener('abort', () => {
              reject(new Error('Agent loop timeout'));
            });
          })
        ]);
        
        // Success - reset counters
        resetLoopCounter();
        const duration = Date.now() - startTime;
        log(`Agent loop completed successfully in ${duration}ms`);
        
        return result;
        
      } catch (error) {
        const duration = Date.now() - startTime;
        log(`Agent loop failed after ${duration}ms: ${error.message}`, 'error');
        
        // Handle different error types
        if (error.message.includes('timeout')) {
          openCircuitBreaker('Request timeout');
          return createTimeoutResponse(userMessage);
        }
        
        if (error.message.includes('exceeded') || error.message.includes('iterations')) {
          openCircuitBreaker('Infinite loop detected');
          return createLoopErrorResponse(userMessage);
        }
        
        if (error.message.includes('concurrent') || error.message.includes('busy')) {
          return createBusyResponse(userMessage);
        }
        
        // Generic error
        throw error;
        
      } finally {
        clearTimeout(timeoutId);
        isAgentLoopRunning = false;
      }
    };
  }

  /**
   * ERROR RESPONSE GENERATORS
   */
  function createTimeoutResponse(userMessage) {
    return {
      content: `I apologize, but I'm taking too long to process your request. This might be due to:

• Complex task requiring more time
• System resource constraints  
• Network connectivity issues

Please try:
1. Simplifying your request
2. Breaking it into smaller steps
3. Restarting the application if the issue persists

Your request: "${userMessage?.substring(0, 100)}..."`,
      type: 'timeout',
      recovered: true
    };
  }

  function createLoopErrorResponse(userMessage) {
    return {
      content: `I detected a potential infinite loop in my processing and stopped for safety. This can happen with:

• Overly complex or ambiguous requests
• System errors causing repeated actions
• Conflicting instructions

Please try:
1. Rephrasing your request more specifically
2. Breaking complex tasks into steps
3. Restarting if the problem continues

Your request: "${userMessage?.substring(0, 100)}..."`,
      type: 'loop_error',
      recovered: true
    };
  }

  function createBusyResponse(userMessage) {
    return {
      content: `I'm currently busy processing another request. Please wait a moment and try again.

This happens when:
• Multiple requests are sent quickly
• Previous request is still being processed
• System is recovering from errors

The system will be ready again shortly.`,
      type: 'busy',
      recovered: true
    };
  }

  /**
   * HEALTH MONITORING
   */
  function getSystemHealth() {
    return {
      circuitBreakerOpen,
      activeRequests,
      loopIterationCount,
      maxLoopIterations: CONFIG.maxLoopIterations,
      isAgentLoopRunning,
      lastRequestTime: lastRequestTime ? new Date(lastRequestTime).toISOString() : null,
      timeSinceLastRequest: lastRequestTime ? Date.now() - lastRequestTime : null
    };
  }

  function resetSystem() {
    log('Resetting agent loop system');
    
    circuitBreakerOpen = false;
    circuitBreakerOpenTime = 0;
    loopIterationCount = 0;
    isAgentLoopRunning = false;
    activeRequests = 0;
    requestQueue = [];
    lastRequestTime = 0;
    
    log('System reset complete');
  }

  /**
   * INTEGRATION WITH EXISTING SYSTEMS
   */
  function integrateWithExistingSystems() {
    // Integrate with memory manager
    if (window.UltronMemoryManager) {
      window.UltronMemoryManager.registerAbortController = function(controller) {
        // Enhanced abort controller management
        log('Registered abort controller with memory manager', 'debug');
      };
    }
    
    // Integrate with performance optimizer
    if (window.UltronPerformanceOptimizer) {
      window.UltronPerformanceOptimizer.agentLoopStatus = getSystemHealth;
    }
    
    log('Integrated with existing systems');
  }

  /**
   * INITIALIZE SYSTEM
   */
  function initialize() {
    log('Initializing Agent Loop Fix V2...');
    
    // Check if we're replacing the original agent loop
    if (typeof window.runAgenticLoop === 'function') {
      const originalFunction = window.runAgenticLoop;
      
      // Only wrap if not already wrapped
      if (!originalFunction._ultronWrapped) {
        window.runAgenticLoop = createSafeAgentLoop(originalFunction);
        window.runAgenticLoop._ultronWrapped = true;
        log('✓ Wrapped runAgenticLoop with safety measures');
      } else {
        log('runAgenticLoop already wrapped, skipping');
      }
    } else {
      log('runAgenticLoop function not found, will wrap when available', 'warn');
      
      // Watch for the function to be defined
      const interval = setInterval(() => {
        if (typeof window.runAgenticLoop === 'function' && !window.runAgenticLoop._ultronWrapped) {
          const originalFunction = window.runAgenticLoop;
          window.runAgenticLoop = createSafeAgentLoop(originalFunction);
          window.runAgenticLoop._ultronWrapped = true;
          log('✓ Wrapped runAgenticLoop (delayed)');
          clearInterval(interval);
        }
      }, 1000);
      
      // Stop watching after 10 seconds
      setTimeout(() => clearInterval(interval), 10000);
    }
    
    // Integrate with existing systems
    integrateWithExistingSystems();
    
    // Monitor system health
    setInterval(() => {
      const health = getSystemHealth();
      if (health.activeRequests > 0 || health.isAgentLoopRunning) {
        log(`Health check: ${JSON.stringify(health)}`, 'debug');
      }
    }, 5000);
    
    log('✓ Agent Loop Fix V2 initialized');
  }

  /**
   * PUBLIC API
   */
  window.UltronAgentLoopFixV2 = {
    initialize,
    resetSystem,
    getSystemHealth,
    
    // Configuration
    setConfig: (key, value) => {
      if (CONFIG.hasOwnProperty(key)) {
        CONFIG[key] = value;
        log(`Config updated: ${key} = ${value}`);
      }
    },
    
    getConfig: () => ({ ...CONFIG }),
    
    // Circuit breaker control
    openCircuitBreaker: (reason) => openCircuitBreaker(reason),
    closeCircuitBreaker: () => {
      circuitBreakerOpen = false;
      circuitBreakerOpenTime = 0;
      log('Circuit breaker manually closed');
    },
    
    // Debug mode
    enableDebug: () => {
      CONFIG.debugMode = true;
      log('Debug mode enabled');
    },
    
    disableDebug: () => {
      CONFIG.debugMode = false;
    }
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    // Small delay to let other systems load
    setTimeout(initialize, 500);
  }

  // Listen for page unload to clean up
  window.addEventListener('beforeunload', () => {
    log('Page unloading, cleaning up...');
    resetSystem();
  });

})();