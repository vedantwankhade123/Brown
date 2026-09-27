/**
 * Agent Harness Client
 * Lightweight frontend bridge to the Vercel AI SDK Core + MCP native harness in Electron.
 */
(function () {
  'use strict';

  function isHarnessAvailable() {
    return Boolean(window.ultronAPI && typeof window.ultronAPI.runAgentHarness === 'function');
  }

  /**
   * Stream agent execution via the native Vercel AI SDK + MCP harness
   * @param {Object} options
   * @param {string} options.prompt
   * @param {Array} [options.history]
   * @param {string} [options.systemPrompt]
   * @param {Object} [options.providerConfig]
   * @param {number} [options.maxSteps=10]
   * @param {Function} [options.onTextDelta]
   * @param {Function} [options.onReasoning]
   * @param {Function} [options.onToolCall]
   * @param {Function} [options.onToolResult]
   * @param {Function} [options.onFinish]
   * @param {Function} [options.onError]
   * @returns {Promise<Object>} Final summary
   */
  async function streamAgent({
    prompt,
    runId = `harness_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    browserMode = false,
    history = [],
    systemPrompt,
    providerConfig = {},
    maxSteps = 10,
    onTextDelta = () => {},
    onReasoning = () => {},
    onToolCall = () => {},
    onToolResult = () => {},
    onFinish = () => {},
    onError = () => {}
  } = {}) {
    if (!isHarnessAvailable()) {
      const err = new Error('Native Agent Harness is not available.');
      onError(err);
      throw err;
    }

    const unsubscribe = window.ultronAPI.onAgentHarnessEvent((event) => {
      if (event.runId !== runId) return;

      switch (event.type) {
        case 'text-delta':
          onTextDelta(event.textDelta, event.fullText);
          break;
        case 'reasoning':
          onReasoning(event.textDelta, event.fullReasoning);
          break;
        case 'tool-call':
          onToolCall(event);
          break;
        case 'tool-result':
          onToolResult(event);
          break;
        case 'finish':
          onFinish(event);
          break;
        case 'error':
          onError(event.error);
          break;
      }
    });

    try {
      const result = await window.ultronAPI.runAgentHarness({
        runId,
        browserMode,
        prompt,
        history,
        systemPrompt,
        providerConfig,
        maxSteps
      });
      return result;
    } finally {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
  }

  function abortAgent(runId) {
    if (!isHarnessAvailable()) return Promise.resolve(false);
    return window.ultronAPI.abortAgentHarness({ runId });
  }

  window.agentHarnessClient = {
    isHarnessAvailable,
    streamAgent,
    abortAgent
  };
})();
