/**
 * Ultron Agent Integration Module
 * Integrates the new thinking, autonomy, and response formatting systems
 * with the existing agent loop for ChatGPT/Claude-like behavior
 */
(function () {
  'use strict';

  // Integration state
  let integrationState = {
    initialized: false,
    thinkingEnabled: false,  // DISABLED by default - only enable for complex tasks
    autonomyEnabled: true,
    formattingEnabled: true,
    enhancedMode: true
  };

  /**
   * INITIALIZE ENHANCED AGENT
   * Call this on app startup to enable the new capabilities
   */
  function initializeEnhancedAgent() {
    if (integrationState.initialized) {
      console.log('[Agent Integration] Already initialized');
      return;
    }

    console.log('[Agent Integration] Initializing enhanced agent capabilities...');

    // Initialize thinking engine
    if (window.UltronThinkingEngine) {
      window.UltronThinkingEngine.enable();
      console.log('[Agent Integration] ✓ Thinking engine enabled');
    } else {
      console.warn('[Agent Integration] ✗ Thinking engine not available');
    }

    // Initialize autonomy engine
    if (window.UltronAutonomyEngine) {
      window.UltronAutonomyEngine.setMode('adaptive');
      console.log('[Agent Integration] ✓ Autonomy engine enabled');
    } else {
      console.warn('[Agent Integration] ✗ Autonomy engine not available');
    }

    // Initialize response formatter
    if (window.UltronResponseFormatter) {
      window.UltronResponseFormatter.configure({
        showThinking: true,
        showProgress: true,
        showTools: false,
        enableMarkdown: true
      });
      console.log('[Agent Integration] ✓ Response formatter enabled');
    } else {
      console.warn('[Agent Integration] ✗ Response formatter not available');
    }

    // Inject response styles
    injectResponseStyles();

    // Hook into agent loop
    hookIntoAgentLoop();

    integrationState.initialized = true;
    console.log('[Agent Integration] ✓ Enhanced agent initialized successfully');

    // Dispatch ready event
    window.dispatchEvent(new CustomEvent('ultron-enhanced-agent-ready', {
      detail: {
        thinking: !!window.UltronThinkingEngine,
        autonomy: !!window.UltronAutonomyEngine,
        formatting: !!window.UltronResponseFormatter
      }
    }));
  }

  /**
   * ENHANCED PROCESSING PIPELINE
   * Wraps the existing agent loop with thinking and autonomy
   * FIXED: Non-blocking thinking process
   */
  async function processWithEnhancedPipeline(userMessage, options = {}) {
    const pipeline = {
      startTime: Date.now(),
      thinking: null,
      autonomousSession: null,
      response: null,
      formattedResponse: null
    };

    try {
      // IMPORTANT: For simple conversational requests, skip thinking entirely
      const intentPreview = quickIntentCheck(userMessage);
      
      // FIX: Always get response first, thinking should not block
      // Get the actual AI response immediately
      const responsePromise = getStandardResponse(userMessage, options);
      
      // Only do thinking analysis for complex/action requests (in background)
      let thinkingPromise = null;
      if (integrationState.thinkingEnabled && 
          window.UltronThinkingEngine && 
          (intentPreview.requiresAction || intentPreview.complex)) {
        thinkingPromise = window.UltronThinkingEngine.processWithThinking(
          userMessage,
          options
        ).catch(err => {
          console.warn('[Agent Integration] Thinking failed, continuing without:', err);
          return null;
        });
      }

      // Wait for response (priority) and thinking (optional)
      const [response, thinking] = await Promise.all([
        responsePromise,
        thinkingPromise || Promise.resolve(null)
      ]);

      pipeline.response = response;
      pipeline.thinking = thinking;

      // Format the response with thinking if available
      if (window.UltronResponseFormatter && integrationState.formattingEnabled) {
        pipeline.formattedResponse = window.UltronResponseFormatter.formatAgentResponse(
          pipeline.response,
          {
            thinking: pipeline.thinking,
            executionSteps: [],
            isComplete: true,
            isSimple: !thinking
          }
        );
      } else {
        pipeline.formattedResponse = pipeline.response;
      }

      pipeline.endTime = Date.now();
      pipeline.duration = pipeline.endTime - pipeline.startTime;

      return pipeline;

    } catch (error) {
      console.error('[Agent Integration] Pipeline error:', error);
      pipeline.error = error.message;
      pipeline.response = `I encountered an error: ${error.message}`;
      pipeline.formattedResponse = pipeline.response;
      return pipeline;
    }
  }

  /**
   * QUICK INTENT CHECK
   * Fast check to determine if we need the full thinking pipeline
   */
  function quickIntentCheck(message) {
    const lowerMsg = message.toLowerCase().trim();
    
    const actionIndicators = [
      'open', 'close', 'start', 'stop', 'run', 'execute',
      'create', 'delete', 'write', 'read', 'search', 'find',
      'download', 'upload', 'send', 'move', 'copy', 'automate'
    ];
    
    const complexityIndicators = [
      'then', 'after that', 'next', 'and then', 'also',
      'multiple', 'several', 'all', 'batch', 'workflow'
    ];

    const hasAction = actionIndicators.some(word => lowerMsg.includes(word));
    const hasComplexity = complexityIndicators.some(word => lowerMsg.includes(word));
    const hasQuestions = /^(what|why|how|when|where|who|which|can you|could you)/i.test(lowerMsg);
    const hasGreetings = /^(hi|hello|hey|good morning|good afternoon|good evening)/i.test(lowerMsg);

    return {
      requiresAction: hasAction && !hasQuestions,
      complex: hasComplexity,
      isConversational: hasGreetings || (hasQuestions && !hasAction)
    };
  }

  /**
   * DETERMINE EXECUTION MODE
   */
  function determineExecutionMode(thinking) {
    if (!thinking || !thinking.analysis) {
      return 'standard';
    }

    // Use autonomous mode for action tasks with low-medium risk
    if (thinking.analysis.requiresAction && 
        thinking.analysis.riskLevel !== 'high' &&
        thinking.capabilities && 
        thinking.capabilities.available.length > 0) {
      return 'autonomous';
    }

    return 'standard';
  }

  /**
   * GET STANDARD RESPONSE
   * Fallback to existing agent loop
   */
  async function getStandardResponse(message, options) {
    // This would call the existing runAgenticLoop or similar function
    // For now, return a placeholder
    if (window.ultronAPI && typeof window.ultronAPI.queryAgent === 'function') {
      return await window.ultronAPI.queryAgent(message, options);
    }
    
    // Fallback
    return "I'm processing your request using the enhanced AI system.";
  }

  /**
   * FORMAT CONVERSATIONAL RESPONSE
   */
  function formatConversationalResponse(response, context) {
    if (window.UltronResponseFormatter) {
      return window.UltronResponseFormatter.formatAgentResponse(response, {
        ...context,
        isComplete: true
      });
    }
    return response;
  }

  /**
   * BUILD RESPONSE FROM AUTONOMOUS SESSION
   */
  function buildResponseFromSession(session) {
    if (!session) return '';

    const parts = [];

    // Summary
    if (session.result && session.result.allCompleted) {
      parts.push('✅ Task completed successfully!');
    } else if (session.aborted) {
      parts.push(`⚠️ Task was stopped: ${session.abortReason}`);
    } else if (session.status === 'failed') {
      parts.push(`❌ Task failed: ${session.error || 'Unknown error'}`);
    }

    // What was done
    if (session.plan && session.plan.steps) {
      const completedSteps = session.plan.steps.filter(s => s.status === 'completed');
      if (completedSteps.length > 0) {
        parts.push('\n**Completed steps:**');
        completedSteps.forEach(step => {
          parts.push(`• ${step.description}`);
          if (step.adapted) {
            parts.push(`  _(Adapted: ${step.adaptationReason})_`);
          }
        });
      }
    }

    // Results
    if (session.result && session.result.results) {
      const meaningfulResults = session.result.results.filter(r => r && r.message);
      if (meaningfulResults.length > 0) {
        parts.push('\n**Results:**');
        meaningfulResults.forEach(r => {
          if (r.message) parts.push(r.message);
        });
      }
    }

    // Verification
    if (session.verification) {
      if (session.verification.verified) {
        parts.push('\n✓ Results verified');
      } else {
        parts.push('\n⚠️ Verification incomplete');
        if (session.verification.issues && session.verification.issues.length > 0) {
          session.verification.issues.forEach(issue => {
            parts.push(`  • ${issue.details}`);
          });
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * EXTRACT EXECUTION STEPS
   */
  function extractExecutionSteps(pipeline) {
    if (pipeline.autonomousSession && pipeline.autonomousSession.plan) {
      return pipeline.autonomousSession.plan.steps.map(step => ({
        description: step.description,
        status: step.status,
        toolName: step.tool
      }));
    }

    if (pipeline.thinking && pipeline.thinking.plan && pipeline.thinking.plan.steps) {
      return pipeline.thinking.plan.steps.map(step => ({
        description: step.description,
        status: 'completed'
      }));
    }

    return [];
  }

  /**
   * EXTRACT VERIFICATION
   */
  function extractVerification(pipeline) {
    if (pipeline.autonomousSession && pipeline.autonomousSession.verification) {
      return pipeline.autonomousSession.verification;
    }
    return null;
  }

  /**
   * INJECT RESPONSE STYLES
   */
  function injectResponseStyles() {
    if (window.UltronResponseFormatter && typeof window.UltronResponseFormatter.getResponseStyles === 'function') {
      const styles = window.UltronResponseFormatter.getResponseStyles();
      const styleElement = document.createElement('div');
      styleElement.innerHTML = styles;
      document.head.appendChild(styleElement.firstElementChild || styleElement);
    }
  }

  /**
   * HOOK INTO AGENT LOOP
   * Integrate with existing agent execution
   */
  function hookIntoAgentLoop() {
    // Listen for agent events
    window.addEventListener('ultron-agent-start', (event) => {
      if (window.UltronThinkingEngine) {
        const thinking = window.UltronThinkingEngine.getThinkingState();
        console.log('[Agent Integration] Agent starting with thinking:', thinking.enabled);
      }
    });

    window.addEventListener('ultron-agent-tool-call', async (event) => {
      if (window.UltronThinkingEngine && event.detail) {
        // Log tool call in reasoning chain
        console.log('[Agent Integration] Tool call:', event.detail.tool || event.detail.type);
      }
    });

    window.addEventListener('ultron-agent-complete', (event) => {
      if (window.UltronAutonomyEngine) {
        const history = window.UltronAutonomyEngine.getDecisionHistory();
        if (history.length > 0) {
          console.log('[Agent Integration] Autonomous decisions made:', history.length);
        }
      }
    });
  }

  /**
   * WRAPPER FOR EXISTING AGENT FUNCTIONS
   * Use this to enhance existing runAgenticLoop without replacing it
   */
  function wrapAgentFunction(originalFunction) {
    return async function enhancedAgentLoop(userMessage, options = {}) {
      // Quick check if enhancement is needed
      const intentCheck = quickIntentCheck(userMessage);
      
      if (!integrationState.enhancedMode || intentCheck.isConversational) {
        // Use original function for simple cases
        return await originalFunction(userMessage, options);
      }

      // Use enhanced pipeline
      const pipeline = await processWithEnhancedPipeline(userMessage, options);
      return pipeline.formattedResponse || pipeline.response;
    };
  }

  /**
   * TOGGLE ENHANCED MODE
   */
  function toggleEnhancedMode(enabled) {
    integrationState.enhancedMode = enabled;
    integrationState.thinkingEnabled = enabled;
    integrationState.autonomyEnabled = enabled;
    integrationState.formattingEnabled = enabled;
    
    if (window.UltronThinkingEngine) {
      if (enabled) {
        window.UltronThinkingEngine.enable();
      } else {
        window.UltronThinkingEngine.disable();
      }
    }

    console.log(`[Agent Integration] Enhanced mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * GET INTEGRATION STATUS
   */
  function getStatus() {
    return {
      ...integrationState,
      thinkingAvailable: !!window.UltronThinkingEngine,
      autonomyAvailable: !!window.UltronAutonomyEngine,
      formattingAvailable: !!window.UltronResponseFormatter
    };
  }

  /**
   * PUBLIC API
   */
  window.UltronAgentIntegration = {
    initialize: initializeEnhancedAgent,
    processWithEnhancedPipeline,
    wrapAgentFunction,
    toggleEnhancedMode,
    getStatus,
    quickIntentCheck,
    
    // State
    isInitialized: () => integrationState.initialized,
    isEnabled: () => integrationState.enhancedMode
  };

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      // Delay to ensure other modules are loaded
      setTimeout(initializeEnhancedAgent, 500);
    });
  } else {
    // DOM already ready
    setTimeout(initializeEnhancedAgent, 500);
  }

})();
