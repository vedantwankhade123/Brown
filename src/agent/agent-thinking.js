/**
 * Ultron AI Thinking & Reasoning Engine
 * Enhances AI responses with structured thinking, capability checking, and autonomous behavior
 * Similar to ChatGPT, Claude, and other modern AI tools
 */
(function () {
  'use strict';

  // Thinking state management
  let thinkingState = {
    enabled: true,
    showThinking: true,
    currentTask: null,
    reasoningChain: [],
    capabilityCheckResults: null
  };

  /**
   * MAIN ENTRY POINT: Process user message with enhanced thinking
   * This wraps the existing agent loop with better reasoning
   */
  async function processWithThinking(userMessage, context = {}) {
    const thinking = {
      intent: null,
      analysis: null,
      capabilities: null,
      plan: null,
      executionSteps: [],
      reasoning: [],
      toolCalls: [],
      verification: null,
      finalResponse: null
    };

    try {
      // Step 1: UNDERSTAND - Analyze what the user wants
      thinking.intent = await analyzeUserIntent(userMessage, context);
      addReasoningStep(thinking, 'intent_analysis', `Understood intent: ${thinking.intent.type}`);

      // Step 2: ANALYZE - Deep dive into the request
      thinking.analysis = await analyzeRequest(userMessage, thinking.intent, context);
      addReasoningStep(thinking, 'request_analysis', `Request type: ${thinking.analysis.category}`);

      // Step 3: CHECK CAPABILITIES - What can I do?
      thinking.capabilities = await checkCapabilities(thinking.analysis, context);
      addReasoningStep(thinking, 'capability_check', `Available capabilities: ${thinking.capabilities.available.join(', ')}`);

      // Step 4: PLAN - How should I approach this?
      if (thinking.analysis.requiresAction) {
        thinking.plan = await createExecutionPlan(thinking.analysis, thinking.capabilities, context);
        addReasoningStep(thinking, 'planning', `Created plan with ${thinking.plan.steps.length} steps`);
      }

      // Step 5: REASON - Think through the approach
      thinking.reasoning = await reasonAboutApproach(thinking);
      addReasoningStep(thinking, 'reasoning', 'Evaluated best approach for the task');

      // Return thinking object for use by agent loop
      return thinking;

    } catch (error) {
      console.error('Thinking engine error:', error);
      thinking.error = error.message;
      return thinking;
    }
  }

  /**
   * INTENT ANALYSIS - Understand what the user really wants
   */
  async function analyzeUserIntent(message, context) {
    const lowerMsg = message.toLowerCase().trim();
    
    const intent = {
      type: 'unknown',
      confidence: 0,
      keywords: [],
      entities: [],
      requiresAction: false,
      requiresTools: false,
      requiresThinking: false,
      complexity: 'simple',
      urgency: 'normal'
    };

    // Detect intent type
    const intentPatterns = [
      { type: 'question', patterns: [/^(what|why|how|when|where|who|which|can you|could you|would you)/i], requiresAction: false },
      { type: 'request', patterns: [/^(please|can you|could you|help me|i need|i want|let's|let me)/i], requiresAction: true },
      { type: 'command', patterns: [/^(open|close|delete|create|write|read|run|execute|search|find|play|stop|start)/i], requiresAction: true },
      { type: 'conversation', patterns: [/^(hi|hello|hey|good morning|good afternoon|good evening)/i], requiresAction: false },
      { type: 'creative', patterns: [/^(write|compose|create|generate|draft|design|build|make)/i], requiresAction: false },
      { type: 'analysis', patterns: [/^(analyze|explain|describe|compare|summarize|review)/i], requiresAction: false },
      { type: 'automation', patterns: [/^(automate|schedule|batch|workflow)/i], requiresAction: true },
      { type: 'code', patterns: [/^(code|program|script|function|debug|fix|refactor)/i], requiresAction: false }
    ];

    for (const { type, patterns, requiresAction } of intentPatterns) {
      for (const pattern of patterns) {
        if (pattern.test(lowerMsg)) {
          intent.type = type;
          intent.requiresAction = requiresAction;
          intent.confidence = 0.8;
          break;
        }
      }
      if (intent.type !== 'unknown') break;
    }

    // Fallback detection based on action verbs
    if (intent.type === 'unknown') {
      const actionVerbs = ['open', 'close', 'start', 'stop', 'run', 'execute', 'delete', 'create', 'write', 'read', 'search', 'find', 'play', 'download', 'upload', 'send', 'move', 'copy', 'rename'];
      const hasActionVerb = actionVerbs.some(verb => lowerMsg.includes(verb));
      if (hasActionVerb) {
        intent.type = 'command';
        intent.requiresAction = true;
        intent.confidence = 0.7;
      } else {
        intent.type = 'question';
        intent.requiresAction = false;
        intent.confidence = 0.6;
      }
    }

    // Detect complexity
    const wordCount = message.split(/\s+/).length;
    const hasMultipleSteps = /then|after that|next|and then|also|additionally|finally/i.test(message);
    const hasConditions = /if|when|unless|while|until|before|after/i.test(message);
    
    if (wordCount > 50 || hasMultipleSteps || hasConditions) {
      intent.complexity = 'complex';
      intent.requiresThinking = true;
    } else if (wordCount > 20 || hasMultipleSteps) {
      intent.complexity = 'moderate';
    }

    // Detect urgency
    if (/urgent|asap|immediately|right now|quickly|hurry/i.test(message)) {
      intent.urgency = 'high';
    } else if (/whenever|no rush|take your time/i.test(message)) {
      intent.urgency = 'low';
    }

    // Extract entities
    intent.entities = extractEntities(message);

    // Determine if tools are needed
    intent.requiresTools = intent.requiresAction && 
      (intent.type === 'command' || intent.type === 'automation' || 
       /open|close|start|run|execute|delete|create|write|search|download|send/i.test(message));

    return intent;
  }

  /**
   * REQUEST ANALYSIS - Deep dive into what's needed
   */
  async function analyzeRequest(message, intent, context) {
    const analysis = {
      category: 'general',
      subCategory: null,
      requiresAction: intent.requiresAction,
      requiresTools: intent.requiresTools,
      requiresScreenCapture: false,
      requiresWebSearch: false,
      requiresFileSystem: false,
      requiresAppInteraction: false,
      requiresMCP: false,
      riskLevel: 'low',
      estimatedSteps: 1,
      potentialIssues: [],
      alternativeApproaches: [],
      recommendedModel: null,
      contextNeeded: []
    };

    const lowerMsg = message.toLowerCase();

    // Categorize request
    if (intent.type === 'conversation' || intent.type === 'question') {
      analysis.category = 'conversational';
      analysis.requiresAction = false;
      analysis.requiresTools = false;
    } else if (intent.type === 'creative') {
      analysis.category = 'content-generation';
      analysis.requiresAction = false;
      analysis.requiresTools = false;
    } else if (intent.type === 'analysis') {
      analysis.category = 'analysis';
      analysis.requiresAction = false;
      analysis.requiresTools = false;
    } else if (intent.type === 'code') {
      analysis.category = 'coding';
      analysis.requiresAction = false;
      analysis.requiresTools = false;
    } else if (lowerMsg.includes('open') || lowerMsg.includes('launch') || lowerMsg.includes('start')) {
      analysis.category = 'app-control';
      analysis.subCategory = 'open-app';
      analysis.requiresAppInteraction = true;
      analysis.requiresAction = true;
    } else if (lowerMsg.includes('search') || lowerMsg.includes('find') || lowerMsg.includes('look up')) {
      analysis.category = 'web-interaction';
      analysis.subCategory = 'search';
      analysis.requiresWebSearch = true;
      analysis.requiresAction = true;
    } else if (lowerMsg.includes('file') || lowerMsg.includes('document') || lowerMsg.includes('folder')) {
      analysis.category = 'file-operations';
      analysis.requiresFileSystem = true;
      analysis.requiresAction = true;
    } else if (lowerMsg.includes('browser') || lowerMsg.includes('website') || lowerMsg.includes('web page')) {
      analysis.category = 'web-interaction';
      analysis.requiresWebSearch = true;
      analysis.requiresAction = true;
    } else if (lowerMsg.includes('automate') || lowerMsg.includes('schedule')) {
      analysis.category = 'automation';
      analysis.subCategory = 'workflow';
      analysis.requiresAction = true;
      analysis.requiresThinking = true;
    }

    // Detect if screen capture is needed
    if (/click|button|menu|dialog|window|screen|ui|interface|see|look at|check if/i.test(message)) {
      analysis.requiresScreenCapture = true;
    }

    // Detect if MCP tools would help
    if (analysis.requiresAppInteraction || analysis.requiresFileSystem) {
      analysis.requiresMCP = true;
    }

    // Estimate steps
    const stepIndicators = (message.match(/then|after that|next|and|also/gi) || []).length;
    analysis.estimatedSteps = Math.max(1, stepIndicators + 1);

    // Assess risk level
    if (/delete|remove|format|wipe|uninstall|drop/i.test(message)) {
      analysis.riskLevel = 'high';
      analysis.potentialIssues.push('Destructive operation detected');
    } else if (/send|upload|share|publish|email/i.test(message)) {
      analysis.riskLevel = 'medium';
      analysis.potentialIssues.push('External communication involved');
    } else if (/install|download|execute|run/i.test(message)) {
      analysis.riskLevel = 'medium';
      analysis.potentialIssues.push('Code execution involved');
    }

    // Determine best model for the task
    analysis.recommendedModel = recommendModel(analysis, intent);

    // Identify context needed
    if (analysis.requiresAppInteraction) {
      analysis.contextNeeded.push('current-applications');
    }
    if (analysis.requiresFileSystem) {
      analysis.contextNeeded.push('file-system');
    }
    if (analysis.requiresScreenCapture) {
      analysis.contextNeeded.push('screen-state');
    }

    return analysis;
  }

  /**
   * CAPABILITY CHECK - What can I actually do?
   */
  async function checkCapabilities(analysis, context) {
    const capabilities = {
      available: [],
      unavailable: [],
      checks: {},
      limitations: [],
      recommendations: []
    };

    // Check model availability
    const modelAvailable = window.UltronMultiProviderHub && typeof window.UltronMultiProviderHub.queryProvider === 'function';
    capabilities.checks.modelInference = modelAvailable;
    if (modelAvailable) {
      capabilities.available.push('ai-inference');
    } else {
      capabilities.unavailable.push('ai-inference');
      capabilities.limitations.push('AI model inference not available');
    }

    // Check tool execution
    const toolsAvailable = window.UltronAgentExecutor && typeof window.UltronAgentExecutor.executeAgentToolCall === 'function';
    capabilities.checks.toolExecution = toolsAvailable;
    if (toolsAvailable) {
      capabilities.available.push('tool-execution');
    } else {
      capabilities.unavailable.push('tool-execution');
    }

    // Check MCP availability
    const mcpAvailable = window.UltronMcpTools && await window.UltronMcpTools.isMcpAvailable();
    capabilities.checks.mcpIntegration = mcpAvailable;
    if (mcpAvailable) {
      capabilities.available.push('mcp-tools');
    }

    // Check screen capture
    const screenCaptureAvailable = context.canCaptureScreen !== false;
    capabilities.checks.screenCapture = screenCaptureAvailable;
    if (screenCaptureAvailable && analysis.requiresScreenCapture) {
      capabilities.available.push('screen-capture');
    }

    // Check web search
    const webSearchAvailable = window.localStorage.getItem('ultron-web-search-enabled') !== 'false';
    capabilities.checks.webSearch = webSearchAvailable;
    if (webSearchAvailable && analysis.requiresWebSearch) {
      capabilities.available.push('web-search');
    }

    // Check file system access
    const fileSystemAvailable = window.ultronAPI && typeof window.ultronAPI.readFile === 'function';
    capabilities.checks.fileSystem = fileSystemAvailable;
    if (fileSystemAvailable && analysis.requiresFileSystem) {
      capabilities.available.push('file-operations');
    }

    // Check app control
    const appControlAvailable = window.ultronAPI && typeof window.ultronAPI.appAction === 'function';
    capabilities.checks.appControl = appControlAvailable;
    if (appControlAvailable && analysis.requiresAppInteraction) {
      capabilities.available.push('app-control');
    }

    // Check skills
    const skillsAvailable = window.UltronAgentSkills && typeof window.UltronAgentSkills.getSkill === 'function';
    capabilities.checks.skills = skillsAvailable;
    if (skillsAvailable) {
      capabilities.available.push('agent-skills');
    }

    // Generate recommendations based on capability gaps
    if (analysis.requiresAction && !toolsAvailable) {
      capabilities.recommendations.push('Tool execution unavailable - can only provide conversational response');
    }
    if (analysis.requiresScreenCapture && !screenCaptureAvailable) {
      capabilities.recommendations.push('Screen capture unavailable - will need to ask user for visual context');
    }
    if (analysis.requiresWebSearch && !webSearchAvailable) {
      capabilities.recommendations.push('Web search disabled - cannot fetch online information');
    }

    return capabilities;
  }

  /**
   * EXECUTION PLANNING - Create a detailed plan
   */
  async function createExecutionPlan(analysis, capabilities, context) {
    const plan = {
      id: generatePlanId(),
      steps: [],
      estimatedTime: 0,
      riskLevel: analysis.riskLevel,
      fallbackPlans: [],
      verificationRequired: false
    };

    // For non-action requests, no plan needed
    if (!analysis.requiresAction) {
      plan.steps.push({
        id: 1,
        type: 'respond',
        description: 'Generate direct response',
        estimatedTime: 2,
        required: true
      });
      return plan;
    }

    // Build step plan based on category
    let stepId = 1;

    // Context gathering steps
    if (analysis.contextNeeded.length > 0) {
      for (const ctx of analysis.contextNeeded) {
        plan.steps.push({
          id: stepId++,
          type: 'gather-context',
          subtype: ctx,
          description: `Gather ${ctx} context`,
          required: true
        });
      }
    }

    // Action-specific steps
    switch (analysis.category) {
      case 'app-control':
        plan.steps.push({
          id: stepId++,
          type: 'tool-call',
          tool: 'OPEN_APP',
          description: 'Open the requested application',
          required: true
        });
        if (analysis.requiresScreenCapture) {
          plan.steps.push({
            id: stepId++,
            type: 'observe',
            description: 'Verify application opened successfully',
            required: true
          });
        }
        break;

      case 'web-interaction':
        if (analysis.requiresWebSearch) {
          plan.steps.push({
            id: stepId++,
            type: 'tool-call',
            tool: 'SEARCH',
            description: 'Perform web search',
            required: true
          });
          plan.steps.push({
            id: stepId++,
            type: 'process',
            description: 'Analyze and synthesize search results',
            required: true
          });
        }
        break;

      case 'file-operations':
        plan.steps.push({
          id: stepId++,
          type: 'tool-call',
          tool: 'FILE_OPERATION',
          description: 'Execute file operation',
          required: true,
          verification: true
        });
        break;

      case 'automation':
        plan.steps.push({
          id: stepId++,
          type: 'plan',
          description: 'Create automation workflow',
          required: true
        });
        plan.steps.push({
          id: stepId++,
          type: 'execute',
          description: 'Execute automation steps',
          required: true
        });
        break;

      default:
        // Generic action plan
        plan.steps.push({
          id: stepId++,
          type: 'execute',
          description: 'Execute required actions',
          required: true
        });
    }

    // Verification step for high-risk operations
    if (analysis.riskLevel === 'high' || plan.steps.some(s => s.verification)) {
      plan.steps.push({
        id: stepId++,
        type: 'verify',
        description: 'Verify operation completed successfully',
        required: true
      });
      plan.verificationRequired = true;
    }

    // Final response step
    plan.steps.push({
      id: stepId,
      type: 'respond',
      description: 'Provide final response to user',
      required: true
    });

    // Create fallback plans
    if (capabilities.unavailable.length > 0) {
      plan.fallbackPlans.push({
        condition: 'tools-unavailable',
        action: 'provide-instructions',
        description: 'Provide step-by-step instructions for user to execute manually'
      });
    }

    return plan;
  }

  /**
   * REASONING - Think through the best approach
   */
  async function reasonAboutApproach(thinking) {
    const reasoning = {
      primaryApproach: null,
      alternatives: [],
      considerations: [],
      risks: [],
      optimizations: []
    };

    const { intent, analysis, capabilities, plan } = thinking;

    // Determine primary approach
    if (!analysis.requiresAction) {
      reasoning.primaryApproach = 'direct-response';
      reasoning.considerations.push('Direct conversational response - no tools needed');
    } else if (capabilities.available.includes('tool-execution')) {
      reasoning.primaryApproach = 'tool-assisted';
      reasoning.considerations.push('Will use available tools to complete the task');
    } else {
      reasoning.primaryApproach = 'instructional';
      reasoning.considerations.push('Tools unavailable - will provide instructions');
    }

    // Consider alternatives
    if (analysis.requiresAppInteraction) {
      if (capabilities.available.includes('mcp-tools')) {
        reasoning.alternatives.push({
          approach: 'use-mcp',
          description: 'Use MCP tools for more reliable app interaction',
          priority: 'preferred'
        });
      }
      if (capabilities.available.includes('screen-capture')) {
        reasoning.alternatives.push({
          approach: 'visual-verification',
          description: 'Use screen capture to verify actions',
          priority: 'recommended'
        });
      }
    }

    // Identify risks
    if (analysis.riskLevel === 'high') {
      reasoning.risks.push({
        level: 'high',
        description: 'Destructive operation detected - will request confirmation',
        mitigation: 'Ask for explicit user permission before proceeding'
      });
    }

    if (capabilities.unavailable.length > 0) {
      reasoning.risks.push({
        level: 'medium',
        description: 'Some capabilities unavailable: ' + capabilities.unavailable.join(', '),
        mitigation: 'Will work around limitations or ask user for help'
      });
    }

    // Suggest optimizations
    if (plan && plan.steps.length > 3) {
      reasoning.optimizations.push({
        type: 'parallel-execution',
        description: 'Some steps could be executed in parallel to save time'
      });
    }

    if (analysis.estimatedSteps > 1 && capabilities.available.includes('agent-skills')) {
      reasoning.optimizations.push({
        type: 'skill-reuse',
        description: 'Check if an existing skill can handle this task pattern'
      });
    }

    return reasoning;
  }

  /**
   * THINKING DISPLAY - Generate human-readable thinking process
   */
  function formatThinkingForDisplay(thinking) {
    if (!thinkingState.showThinking) {
      return null;
    }

    const parts = [];

    // Intent
    if (thinking.intent) {
      parts.push(`**Understanding your request:** ${formatIntent(thinking.intent)}`);
    }

    // Analysis
    if (thinking.analysis && thinking.analysis.requiresAction) {
      parts.push(`**Task category:** ${thinking.analysis.category}`);
      if (thinking.analysis.estimatedSteps > 1) {
        parts.push(`**Complexity:** ${thinking.analysis.complexity} (${thinking.analysis.estimatedSteps} steps estimated)`);
      }
    }

    // Capabilities
    if (thinking.capabilities && thinking.capabilities.limitations.length > 0) {
      parts.push(`**Limitations detected:** ${thinking.capabilities.limitations.join(', ')}`);
    }

    // Plan
    if (thinking.plan && thinking.plan.steps.length > 1) {
      parts.push(`**Plan:** ${thinking.plan.steps.filter(s => s.type !== 'respond').map(s => s.description).join(' → ')}`);
    }

    // Reasoning
    if (thinking.reasoning && thinking.reasoning.primaryApproach) {
      parts.push(`**Approach:** ${formatApproach(thinking.reasoning.primaryApproach)}`);
    }

    return parts.length > 0 ? parts.join('\n\n') : null;
  }

  /**
   * HELPER FUNCTIONS
   */
  function addReasoningStep(thinking, phase, description) {
    thinking.reasoningChain.push({
      phase,
      description,
      timestamp: Date.now()
    });
  }

  function extractEntities(message) {
    const entities = [];
    
    // Extract quoted strings
    const quoted = message.match(/"([^"]+)"|'([^']+)'/g);
    if (quoted) {
      entities.push(...quoted.map(q => ({ type: 'quoted-string', value: q.replace(/["']/g, '') })));
    }

    // Extract file paths (Windows)
    const paths = message.match(/[A-Za-z]:\\[^\s]+/g);
    if (paths) {
      entities.push(...paths.map(p => ({ type: 'file-path', value: p })));
    }

    // Extract URLs
    const urls = message.match(/https?:\/\/[^\s]+/g);
    if (urls) {
      entities.push(...urls.map(u => ({ type: 'url', value: u })));
    }

    // Extract app names (common patterns)
    const appPatterns = /\b(notepad|chrome|edge|firefox|word|excel|powerpoint|outlook|calculator|paint|vs code|visual studio|spotify|discord|whatsapp|telegram|slack|zoom|teams)\b/gi;
    const apps = message.match(appPatterns);
    if (apps) {
      entities.push(...apps.map(a => ({ type: 'application', value: a })));
    }

    return entities;
  }

  function recommendModel(analysis, intent) {
    // Simple model recommendation logic
    if (intent.complexity === 'complex') {
      return 'reasoning-model'; // DeepSeek-R1, o1, etc.
    }
    if (analysis.category === 'coding') {
      return 'coding-model'; // Claude, GPT-4o
    }
    if (analysis.category === 'creative') {
      return 'creative-model'; // Gemini, Claude
    }
    return 'general-model'; // Default fast model
  }

  function generatePlanId() {
    return `plan-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  function formatIntent(intent) {
    const typeMap = {
      'question': 'You\'re asking a question',
      'request': 'You\'re making a request',
      'command': 'You\'re giving a command',
      'conversation': 'You want to have a conversation',
      'creative': 'You want me to create something',
      'analysis': 'You want me to analyze something',
      'automation': 'You want to automate a task',
      'code': 'You need help with coding',
      'unknown': 'I\'m analyzing your request'
    };
    return typeMap[intent.type] || 'I\'m processing your request';
  }

  function formatApproach(approach) {
    const approachMap = {
      'direct-response': 'I\'ll respond directly without using tools',
      'tool-assisted': 'I\'ll use available tools to complete your request',
      'instructional': 'I\'ll provide step-by-step instructions'
    };
    return approachMap[approach] || approach;
  }

  /**
   * PUBLIC API
   */
  window.UltronThinkingEngine = {
    processWithThinking,
    analyzeUserIntent,
    analyzeRequest,
    checkCapabilities,
    createExecutionPlan,
    reasonAboutApproach,
    formatThinkingForDisplay,
    
    // State management
    enable: () => { thinkingState.enabled = true; },
    disable: () => { thinkingState.enabled = false; },
    showThinking: (show) => { thinkingState.showThinking = show; },
    isEnabled: () => thinkingState.enabled,
    
    // Getters
    getThinkingState: () => ({ ...thinkingState }),
    getCurrentTask: () => thinkingState.currentTask
  };

})();
