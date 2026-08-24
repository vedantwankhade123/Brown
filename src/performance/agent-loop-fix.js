/**
 * Agent Loop Performance Fix
 * Prevents freezing and unresponsiveness in the agent execution loop
 */
(function () {
  'use strict';

  /**
   * WRAP AGENT LOOP WITH TIMEOUT AND RECOVERY
   */
  function wrapAgentLoopWithTimeout(originalLoopFn) {
    return async function safeAgentLoop(userMessage, options = {}) {
      const timeout = options.timeout || 30000; // 30 second timeout
      const abortController = new AbortController();
      
      // Register with memory manager if available
      if (window.UltronMemoryManager) {
        window.UltronMemoryManager.registerAbortController(abortController);
      }

      const timeoutId = setTimeout(() => {
        console.error('[Agent Loop] Timeout reached, aborting...');
        abortController.abort();
      }, timeout);

      try {
        const result = await Promise.race([
          originalLoopFn(userMessage, { ...options, signal: abortController.signal }),
          new Promise((_, reject) => {
            abortController.signal.addEventListener('abort', () => {
              reject(new Error('Agent loop timeout'));
            });
          })
        ]);

        clearTimeout(timeoutId);
        return result;

      } catch (error) {
        clearTimeout(timeoutId);
        
        if (error.message === 'Agent loop timeout') {
          console.error('[Agent Loop] Execution timeout - forcing recovery');
          return {
            error: true,
            message: "I'm taking too long to respond. Please try again with a simpler request.",
            timeout: true
          };
        }

        throw error;
      }
    };
  }

  /**
   * NON-BLOCKING AGENT EXECUTION
   */
  async function executeAgentNonBlocking(userMessage, options = {}) {
    // Use queue system if available
    if (window.UltronPerformanceOptimizer && window.UltronPerformanceOptimizer.queueRequest) {
      return await window.UltronPerformanceOptimizer.queueRequest(async () => {
        return await executeAgentCore(userMessage, options);
      });
    }

    return await executeAgentCore(userMessage, options);
  }

  /**
   * CORE AGENT EXECUTION
   */
  async function executeAgentCore(userMessage, options = {}) {
    const startTime = Date.now();
    
    try {
      // Check if enhanced mode is available and not stuck
      if (window.UltronAgentIntegration && 
          window.UltronAgentIntegration.isEnabled() &&
          typeof window.UltronAgentIntegration.processWithEnhancedPipeline === 'function') {
        
        console.log('[Agent Loop] Using enhanced pipeline');
        const pipeline = await window.UltronAgentIntegration.processWithEnhancedPipeline(
          userMessage,
          options
        );
        
        return pipeline.formattedResponse || pipeline.response;
      }

      // Fallback to standard execution
      console.log('[Agent Loop] Using standard execution');
      return await executeStandardAgent(userMessage, options);

    } catch (error) {
      console.error('[Agent Loop] Execution error:', error);
      
      // Try emergency fallback
      return await emergencyFallback(userMessage, options);
    } finally {
      const duration = Date.now() - startTime;
      console.log(`[Agent Loop] Execution completed in ${duration}ms`);
    }
  }

  /**
   * STANDARD AGENT EXECUTION (Fallback)
   */
  async function executeStandardAgent(userMessage, options = {}) {
    // Use provider hub directly
    if (window.UltronMultiProviderHub && typeof window.UltronMultiProviderHub.queryProvider === 'function') {
      const model = options.model || window.localStorage.getItem('ultron-active-model') || 'gemini-3.6-flash';
      
      return await window.UltronMultiProviderHub.queryProvider({
        model,
        prompt: userMessage,
        temperature: 0.7,
        maxTokens: 4096,
        signal: options.signal
      });
    }

    throw new Error('No provider available');
  }

  /**
   * EMERGENCY FALLBACK - Always works
   */
  async function emergencyFallback(userMessage, options = {}) {
    console.warn('[Agent Loop] Using emergency fallback');
    
    return `I apologize, but I'm experiencing technical difficulties. Please try:

1. Simplifying your request
2. Restarting the app
3. Checking if Ollama is running (for local models)

Your message: "${userMessage.substring(0, 100)}..."`;
  }

  /**
   * AUTO-RECOVERY SYSTEM
   */
  let failureCount = 0;
  const MAX_FAILURES = 3;

  function trackFailure() {
    failureCount++;
    
    if (failureCount >= MAX_FAILURES) {
      console.error('[Agent Loop] Multiple failures detected, triggering recovery...');
      triggerRecovery();
    }
  }

  function resetFailureCount() {
    failureCount = 0;
  }

  function triggerRecovery() {
    console.log('[Agent Loop] Triggering automatic recovery...');
    
    // Abort all pending requests
    if (window.UltronMemoryManager) {
      window.UltronMemoryManager.abortAllRequests();
    }

    // Clear request queue
    if (window.UltronPerformanceOptimizer) {
      window.UltronPerformanceOptimizer.clearRequestQueue();
    }

    // Reset failure count
    failureCount = 0;

    // Show recovery notification
    if (typeof window.showNotification === 'function') {
      window.showNotification('System recovered from errors. Ready to continue.', 'success');
    }

    console.log('[Agent Loop] ✓ Recovery complete');
  }

  /**
   * HEALTH CHECK
   */
  async function healthCheck() {
    const checks = {
      providerHub: !!window.UltronMultiProviderHub,
      memoryManager: !!window.UltronMemoryManager,
      performanceOptimizer: !!window.UltronPerformanceOptimizer,
      integration: !!window.UltronAgentIntegration,
      gpuConfig: !!window.UltronGPUConfig
    };

    const healthy = Object.values(checks).filter(Boolean).length;
    const total = Object.keys(checks).length;

    console.log(`[Agent Loop] Health: ${healthy}/${total} systems operational`);
    console.log('[Agent Loop] Status:', checks);

    return {
      healthy: healthy === total,
      checks,
      percentage: (healthy / total) * 100
    };
  }

  /**
   * INITIALIZE AGENT LOOP FIXES
   */
  function initialize() {
    console.log('[Agent Loop] Initializing performance fixes...');

    // Wrap existing functions if they exist
    if (typeof window.runAgenticLoop === 'function') {
      const original = window.runAgenticLoop;
      window.runAgenticLoop = wrapAgentLoopWithTimeout(original);
      console.log('[Agent Loop] ✓ Wrapped runAgenticLoop with timeout');
    }

    // Run health check
    healthCheck();

    // Monitor for hangs
    let lastActivity = Date.now();
    setInterval(() => {
      const now = Date.now();
      if (now - lastActivity > 60000) { // No activity for 1 minute
        console.warn('[Agent Loop] No activity detected, system may be hung');
        triggerRecovery();
      }
    }, 30000);

    // Update activity on any user interaction
    ['click', 'keypress', 'touchstart'].forEach(event => {
      document.addEventListener(event, () => {
        lastActivity = Date.now();
      }, { passive: true });
    });

    console.log('[Agent Loop] ✓ Performance fixes initialized');
  }

  // PUBLIC API
  window.UltronAgentLoopFix = {
    initialize,
    executeAgentNonBlocking,
    healthCheck,
    triggerRecovery,
    trackFailure,
    resetFailureCount,
    
    // Status
    getFailureCount: () => failureCount,
    isHealthy: async () => (await healthCheck()).healthy
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    setTimeout(initialize, 1000); // Delay to let other modules load
  }

})();
