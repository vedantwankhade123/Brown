/**
 * Ultron AI Response Formatter
 * Provides structured, ChatGPT/Claude-like response formatting with
 * thinking steps, progress indicators, and autonomous behavior display
 */
(function () {
  'use strict';

  // Response formatting configuration
  const CONFIG = {
    showThinking: true,
    showProgress: true,
    showSteps: true,
    showTools: false, // Hide tool JSON by default
    maxThinkingLength: 500,
    progressUpdateInterval: 800,
    enableMarkdown: true
  };

  /**
   * MAIN FORMATTER: Create a beautifully formatted AI response
   */
  function formatAgentResponse(response, context = {}) {
    const {
      thinking = null,
      toolCalls = [],
      executionSteps = [],
      verification = null,
      isComplete = true,
      isStreaming = false
    } = context;

    let formattedResponse = '';

    // 1. THINKING PHASE - Show reasoning process (like Claude's thinking)
    if (CONFIG.showThinking && thinking && !isSimpleResponse(response, thinking)) {
      formattedResponse += formatThinkingSection(thinking);
    }

    // 2. PROGRESS INDICATOR - For multi-step tasks
    if (CONFIG.showProgress && executionSteps.length > 0) {
      formattedResponse += formatProgressSection(executionSteps, isComplete);
    }

    // 3. MAIN RESPONSE - The actual answer
    formattedResponse += formatMainResponse(response, thinking);

    // 4. COMPLETION INDICATOR - Show when done
    if (isComplete && executionSteps.length > 0) {
      formattedResponse += formatCompletionSection(verification);
    }

    return formattedResponse;
  }

  /**
   * THINKING SECTION - Show reasoning process (like Claude)
   */
  function formatThinkingSection(thinking) {
    if (!thinking || !thinking.intent) return '';

    const parts = [];
    
    // Thinking header with collapsible section
    parts.push('<details class="thinking-section" open>');
    parts.push('<summary class="thinking-header">💭 <strong>Thinking Process</strong></summary>');
    parts.push('<div class="thinking-content">');

    // Intent understanding
    if (thinking.intent) {
      parts.push(`<div class="thinking-item">`);
      parts.push(`<span class="thinking-label">Understanding:</span>`);
      parts.push(`<span class="thinking-value">${escapeHtml(formatIntentText(thinking.intent))}</span>`);
      parts.push(`</div>`);
    }

    // Analysis
    if (thinking.analysis && thinking.analysis.requiresAction) {
      parts.push(`<div class="thinking-item">`);
      parts.push(`<span class="thinking-label">Task type:</span>`);
      parts.push(`<span class="thinking-value">${escapeHtml(thinking.analysis.category)}</span>`);
      parts.push(`</div>`);

      if (thinking.analysis.estimatedSteps > 1) {
        parts.push(`<div class="thinking-item">`);
        parts.push(`<span class="thinking-label">Complexity:</span>`);
        parts.push(`<span class="thinking-value">${escapeHtml(thinking.analysis.complexity)} (${thinking.analysis.estimatedSteps} steps)</span>`);
        parts.push(`</div>`);
      }
    }

    // Capability check results
    if (thinking.capabilities && thinking.capabilities.limitations.length > 0) {
      parts.push(`<div class="thinking-item">`);
      parts.push(`<span class="thinking-label">Note:</span>`);
      parts.push(`<span class="thinking-value limitation">${escapeHtml(thinking.capabilities.limitations.join('; '))}</span>`);
      parts.push(`</div>`);
    }

    // Plan preview (for multi-step tasks)
    if (thinking.plan && thinking.plan.steps.length > 1) {
      const stepDescriptions = thinking.plan.steps
        .filter(s => s.type !== 'respond')
        .map(s => s.description);
      
      if (stepDescriptions.length > 0) {
        parts.push(`<div class="thinking-item">`);
        parts.push(`<span class="thinking-label">Plan:</span>`);
        parts.push(`<div class="plan-preview">`);
        parts.push(`<ol class="plan-steps">`);
        stepDescriptions.forEach((desc, i) => {
          parts.push(`<li>${escapeHtml(desc)}</li>`);
        });
        parts.push(`</ol>`);
        parts.push(`</div>`);
        parts.push(`</div>`);
      }
    }

    // Reasoning approach
    if (thinking.reasoning && thinking.reasoning.primaryApproach) {
      parts.push(`<div class="thinking-item">`);
      parts.push(`<span class="thinking-label">Approach:</span>`);
      parts.push(`<span class="thinking-value">${escapeHtml(formatApproachText(thinking.reasoning.primaryApproach))}</span>`);
      parts.push(`</div>`);
    }

    parts.push('</div>');
    parts.push('</details>');

    return parts.join('\n');
  }

  /**
   * PROGRESS SECTION - Show execution steps
   */
  function formatProgressSection(steps, isComplete) {
    if (!steps || steps.length === 0) return '';

    const parts = [];
    parts.push('<div class="progress-section">');
    parts.push('<div class="progress-header">📊 <strong>Execution Progress</strong></div>');
    parts.push('<div class="progress-steps">');

    steps.forEach((step, index) => {
      const status = step.status || (index < steps.length - 1 ? 'completed' : (isComplete ? 'completed' : 'in-progress'));
      const icon = getStatusIcon(status);
      const statusClass = status === 'completed' ? 'step-completed' : (status === 'in-progress' ? 'step-active' : 'step-pending');

      parts.push(`<div class="progress-step ${statusClass}">`);
      parts.push(`<span class="step-icon">${icon}</span>`);
      parts.push(`<span class="step-text">${escapeHtml(step.description || step.text || `Step ${index + 1}`)}</span>`);
      if (step.toolName && CONFIG.showTools) {
        parts.push(`<span class="step-tool">[${step.toolName}]</span>`);
      }
      parts.push('</div>');
    });

    parts.push('</div>');
    parts.push('</div>');

    return parts.join('\n');
  }

  /**
   * MAIN RESPONSE - The actual content
   */
  function formatMainResponse(response, thinking) {
    if (!response) return '';

    // Clean up the response
    let cleaned = sanitizeResponse(response);

    // Wrap in appropriate container
    return `<div class="response-main">${formatMarkdown(cleaned)}</div>`;
  }

  /**
   * COMPLETION SECTION - Show verification and completion
   */
  function formatCompletionSection(verification) {
    const parts = [];
    parts.push('<div class="completion-section">');

    if (verification && verification.verified) {
      parts.push('<div class="completion-verified">✅ <strong>Task Completed</strong></div>');
      if (verification.evidence) {
        parts.push(`<div class="completion-evidence">${escapeHtml(verification.evidence)}</div>`);
      }
    } else if (verification && !verification.verified) {
      parts.push('<div class="completion-unverified">⚠️ <strong>Task Completed (unverified)</strong></div>');
    } else {
      parts.push('<div class="completion-default">✅ <strong>Done</strong></div>');
    }

    parts.push('</div>');
    return parts.join('\n');
  }

  /**
   * STREAMING RESPONSE FORMATTER
   */
  function createStreamingFormatter() {
    let buffer = '';
    let thinkingBuffer = '';
    let isThinkingComplete = false;
    let chunks = [];

    return {
      append(chunk) {
        buffer += chunk;
        chunks.push(chunk);
        return this.getCurrentState();
      },

      getCurrentState() {
        return {
          fullText: buffer,
          chunks: chunks,
          isComplete: false
        };
      },

      finalize(thinking = null) {
        return formatAgentResponse(buffer, {
          thinking,
          isComplete: true,
          isStreaming: false
        });
      }
    };
  }

  /**
   * PROGRESS UPDATER - Real-time progress messages
   */
  function createProgressUpdater(container, initialState = {}) {
    let currentStep = 0;
    let steps = initialState.steps || [];
    let message = initialState.message || '';

    return {
      setSteps(newSteps) {
        steps = newSteps;
        return this.render();
      },

      updateStep(index, status, description) {
        if (steps[index]) {
          steps[index].status = status;
          if (description) steps[index].description = description;
        }
        return this.render();
      },

      setMessage(msg) {
        message = msg;
        return this.render();
      },

      render() {
        const parts = [];
        
        if (message) {
          parts.push(`<div class="progress-message">⏳ ${escapeHtml(message)}</div>`);
        }

        if (steps.length > 0) {
          parts.push('<div class="progress-steps-live">');
          steps.forEach((step, i) => {
            const icon = getStatusIcon(step.status || 'pending');
            parts.push(`<div class="progress-step-live">${icon} ${escapeHtml(step.description || step.text)}</div>`);
          });
          parts.push('</div>');
        }

        return parts.join('\n');
      }
    };
  }

  /**
   * RESPONSE TYPE DETECTION
   */
  function detectResponseType(response, thinking) {
    if (!thinking) {
      return 'simple';
    }

    if (thinking.analysis && thinking.analysis.requiresAction) {
      return 'action';
    }

    if (thinking.intent && thinking.intent.type === 'creative') {
      return 'creative';
    }

    if (thinking.intent && thinking.intent.type === 'code') {
      return 'code';
    }

    if (thinking.intent && thinking.intent.type === 'analysis') {
      return 'analysis';
    }

    return 'conversational';
  }

  /**
   * HELPER FUNCTIONS
   */
  function isSimpleResponse(response, thinking) {
    // Don't show thinking for simple conversational responses
    if (!thinking.analysis || !thinking.analysis.requiresAction) {
      return true;
    }
    if (thinking.intent && thinking.intent.type === 'conversation') {
      return true;
    }
    return false;
  }

  function formatIntentText(intent) {
    const typeDescriptions = {
      'question': 'You asked a question',
      'request': 'You made a request',
      'command': 'You gave a command',
      'conversation': 'You started a conversation',
      'creative': 'You want me to create something',
      'analysis': 'You want analysis',
      'automation': 'You want to automate a task',
      'code': 'You need coding help',
      'unknown': 'Analyzing your request'
    };
    return typeDescriptions[intent.type] || 'Processing your request';
  }

  function formatApproachText(approach) {
    const approaches = {
      'direct-response': 'Responding directly',
      'tool-assisted': 'Using tools to complete your request',
      'instructional': 'Providing step-by-step guidance'
    };
    return approaches[approach] || approach;
  }

  function getStatusIcon(status) {
    const icons = {
      'completed': '✅',
      'in-progress': '⏳',
      'pending': '⏸️',
      'failed': '❌',
      'skipped': '⏭️'
    };
    return icons[status] || '•';
  }

  function sanitizeResponse(text) {
    if (!text) return '';
    
    // Remove raw tool JSON
    text = text.replace(/\{[^}]*"tool"[^}]*\}/g, '');
    text = text.replace(/\{[^}]*"type"[^}]*\}/g, '');
    
    // Remove ReAct format artifacts
    text = text.replace(/^Thought:\s*/gm, '');
    text = text.replace(/^Action:\s*\w+\s*$/gm, '');
    text = text.replace(/^Action Input:\s*/gm, '');
    
    // Clean up excessive whitespace
    text = text.replace(/\n{3,}/g, '\n\n');
    
    return text.trim();
  }

  function formatMarkdown(text) {
    if (!CONFIG.enableMarkdown) {
      return escapeHtml(text);
    }

    // Simple markdown formatting (for full markdown, use a library)
    let formatted = text;

    // Bold
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    
    // Italic
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Code blocks
    formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    
    // Inline code
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Links
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
    
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * CSS STYLES for formatted responses
   */
  function getResponseStyles() {
    return `
      <style>
        .thinking-section {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border: 1px solid #2a2a4e;
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 12px;
          font-size: 14px;
        }
        
        .thinking-header {
          cursor: pointer;
          color: #a0a0ff;
          font-size: 14px;
          margin-bottom: 8px;
        }
        
        .thinking-header:hover {
          color: #c0c0ff;
        }
        
        .thinking-content {
          padding-left: 8px;
        }
        
        .thinking-item {
          margin: 8px 0;
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .thinking-label {
          color: #888;
          font-weight: 500;
          min-width: 100px;
        }
        
        .thinking-value {
          color: #ddd;
        }
        
        .thinking-value.limitation {
          color: #ffaa00;
          font-style: italic;
        }
        
        .plan-preview {
          margin-top: 4px;
        }
        
        .plan-steps {
          margin: 0;
          padding-left: 20px;
        }
        
        .plan-steps li {
          margin: 4px 0;
          color: #bbb;
        }
        
        .progress-section {
          background: rgba(30, 30, 50, 0.5);
          border-radius: 8px;
          padding: 12px 16px;
          margin-bottom: 12px;
        }
        
        .progress-header {
          color: #7dd3fc;
          font-size: 14px;
          margin-bottom: 12px;
        }
        
        .progress-steps {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .progress-step {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 4px;
          background: rgba(40, 40, 60, 0.5);
        }
        
        .step-completed {
          opacity: 0.7;
        }
        
        .step-active {
          background: rgba(100, 100, 150, 0.5);
          border-left: 3px solid #7dd3fc;
        }
        
        .step-icon {
          font-size: 16px;
        }
        
        .step-text {
          color: #ccc;
          font-size: 13px;
        }
        
        .step-tool {
          color: #888;
          font-size: 11px;
          margin-left: auto;
        }
        
        .response-main {
          color: #e0e0e0;
          line-height: 1.6;
          font-size: 15px;
        }
        
        .completion-section {
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid rgba(100, 100, 150, 0.3);
        }
        
        .completion-verified {
          color: #4ade80;
          font-size: 14px;
        }
        
        .completion-unverified {
          color: #fbbf24;
          font-size: 14px;
        }
        
        .completion-default {
          color: #4ade80;
          font-size: 14px;
        }
        
        .completion-evidence {
          color: #888;
          font-size: 12px;
          margin-top: 4px;
          font-style: italic;
        }
        
        .progress-message {
          color: #7dd3fc;
          font-size: 14px;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      </style>
    `;
  }

  /**
   * PUBLIC API
   */
  window.UltronResponseFormatter = {
    formatAgentResponse,
    createStreamingFormatter,
    createProgressUpdater,
    detectResponseType,
    sanitizeResponse,
    getResponseStyles,
    
    // Configuration
    configure: (options) => Object.assign(CONFIG, options),
    showThinking: (show) => { CONFIG.showThinking = show; },
    showProgress: (show) => { CONFIG.showProgress = show; },
    showTools: (show) => { CONFIG.showTools = show; }
  };

})();
