/**
 * Ultron Context Engine — 8-Layer Context Orchestrator
 * Assembles layered context for LLM prompts with token budgeting.
 * Layers:
 *   1. Current Turn (user prompt + resolved references)
 *   2. Recent Chat History (sliding window)
 *   3. Conversation State (mode, active topic, tracked variables)
 *   4. Rolling Summary (compressed history of older turns)
 *   5. Historical Chat Retrieval (keyword-matched past messages)
 *   6. Durable Memory Vault (cross-session long-term memories)
 *   7. Tool/Search Execution Memory (recent tool calls & search results)
 *   8. Artifact Registry (files, URLs, code created in session)
 */
(function () {
  'use strict';

  // Rough token estimation: ~4 chars per token for English text
  function estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(String(text).length / 4);
  }

  function truncateToTokenBudget(text, maxTokens) {
    if (!text) return '';
    const maxChars = maxTokens * 4;
    if (text.length <= maxChars) return text;
    return text.substring(0, maxChars) + '\n... [truncated to fit context window]';
  }

  function getMemory() {
    return (typeof window !== 'undefined' && window.UltronAgentMemory) || null;
  }

  function getEntityTracker() {
    return (typeof window !== 'undefined' && window.UltronEntityTracker) || null;
  }

  function getProviderHub() {
    return (typeof window !== 'undefined' && window.UltronMultiProviderHub) || null;
  }

  /**
   * Get model context window size. Defaults to 4096 for unknown models.
   */
  function getContextWindowSize(provider, modelId) {
    const hub = getProviderHub();
    if (hub && hub.getModelCapabilities) {
      try {
        const caps = hub.getModelCapabilities(provider, modelId);
        if (caps && caps.contextWindow) return caps.contextWindow;
      } catch (e) {}
    }
    // Sensible defaults by model name heuristics
    const id = String(modelId || '').toLowerCase();
    if (id.includes('llama3.3') || id.includes('70b')) return 32768;
    if (id.includes('llama3') || id.includes('phi4') || id.includes('qwen2.5')) return 8192;
    if (id.includes('gemini') || id.includes('gpt-4') || id.includes('claude')) return 131072;
    if (id.includes('deepseek')) return 32768;
    return 4096;
  }

  /**
   * Build the layered context for an LLM call.
   *
   * @param {Object} opts
   * @param {string} opts.userPrompt - The current user message
   * @param {string} opts.sessionId - Current chat session ID
   * @param {string} [opts.provider] - Model provider (ollama, gemini, etc.)
   * @param {string} [opts.modelId] - Active model identifier
   * @param {string} [opts.currentMode] - Current agent mode (chat, action, search, code)
   * @param {Array}  [opts.recentMessages] - Recent chat messages [{role, content}]
   * @param {number} [opts.maxRecentMessages] - Max recent messages to include (default 10)
   * @returns {Object} { layers, systemContextBlock, userPromptAugmented, totalTokenEstimate, budget }
   */
  function buildContext(opts = {}) {
    const {
      userPrompt = '',
      sessionId,
      provider = 'ollama',
      modelId = '',
      currentMode = 'chat',
      recentMessages = [],
      maxRecentMessages = 10
    } = opts;

    const contextWindow = getContextWindowSize(provider, modelId);
    // Reserve 20% for the model's response, 10% for system prompt overhead
    const usableBudget = Math.floor(contextWindow * 0.70);
    const memory = getMemory();
    const tracker = getEntityTracker();

    const layers = {};
    let totalTokens = 0;

    // Helper to add a layer only if it fits in budget
    function addLayer(name, content, priority, maxBudgetFraction = 0.25) {
      if (!content || !content.trim()) return;
      const layerMaxTokens = Math.floor(usableBudget * maxBudgetFraction);
      const truncated = truncateToTokenBudget(content.trim(), layerMaxTokens);
      const tokens = estimateTokens(truncated);
      if (totalTokens + tokens <= usableBudget) {
        layers[name] = { content: truncated, tokens, priority };
        totalTokens += tokens;
      }
    }

    // ── Layer 1: Current Turn (highest priority) ──
    let augmentedPrompt = userPrompt;
    let resolvedEntities = [];
    let entityExplanations = [];
    if (tracker) {
      try {
        const resolution = tracker.resolveReferences(sessionId, userPrompt);
        if (resolution && resolution.resolved) {
          augmentedPrompt = resolution.augmentedPrompt;
          resolvedEntities = resolution.entities || [];
          entityExplanations = resolution.explanations || [];
        }
      } catch (e) {}
    }
    addLayer('currentTurn', augmentedPrompt, 1, 0.30);

    // ── Layer 2: Recent Chat History ──
    if (Array.isArray(recentMessages) && recentMessages.length > 0) {
      const limited = recentMessages.slice(-maxRecentMessages);
      const historyBlock = limited.map(m => {
        const role = m.role === 'assistant' ? 'Assistant' : 'User';
        const text = String(m.content || '').substring(0, 400);
        return `${role}: ${text}`;
      }).join('\n');
      addLayer('recentChat', `[Recent Conversation]\n${historyBlock}`, 2, 0.25);
    }

    // ── Layer 3: Conversation State ──
    if (memory) {
      try {
        const stateObj = memory.getAllConversationState ? memory.getAllConversationState(sessionId) : {};
        const stateEntries = Object.entries(stateObj);
        if (stateEntries.length > 0) {
          const stateBlock = stateEntries.map(([k, v]) => `- ${k}: ${JSON.stringify(v.value || v)}`).join('\n');
          addLayer('conversationState', `[Conversation State]\n${stateBlock}`, 3, 0.05);
        }
      } catch (e) {}
    }

    // ── Layer 4: Rolling Summary ──
    if (memory && memory.getConversationSummary) {
      try {
        const summary = memory.getConversationSummary(sessionId);
        if (summary && summary.text) {
          addLayer('rollingSummary', `[Conversation Summary (${summary.turnsCovered || '?'} turns)]\n${summary.text}`, 4, 0.15);
        }
      } catch (e) {}
    }

    // ── Layer 5: Historical Chat Retrieval ──
    if (memory && memory.queryHistoricalMessages) {
      try {
        const historical = memory.queryHistoricalMessages(sessionId, userPrompt, 3);
        if (historical.length > 0) {
          const histBlock = historical.map(h => `[Turn ${h.index}] ${h.role}: ${h.text}`).join('\n');
          addLayer('historicalChat', `[Relevant Past Messages]\n${histBlock}`, 5, 0.10);
        }
      } catch (e) {}
    }

    // ── Layer 6: Durable Memory Vault ──
    if (memory && memory.getDurableMemorySnippet) {
      try {
        const durableSnippet = memory.getDurableMemorySnippet(userPrompt, 5);
        if (durableSnippet) {
          addLayer('durableMemory', `[Long-Term Memory]\n${durableSnippet}`, 6, 0.08);
        }
      } catch (e) {}
    }
    // Also include user preferences
    if (memory && memory.getFormattedPreferencesPrompt) {
      try {
        const prefs = memory.getFormattedPreferencesPrompt();
        if (prefs) {
          addLayer('userPreferences', prefs, 6, 0.05);
        }
      } catch (e) {}
    }

    // ── Layer 7: Tool/Search Execution Memory ──
    if (memory) {
      try {
        if (memory.getToolExecutionsSnippet) {
          const toolSnippet = memory.getToolExecutionsSnippet(sessionId, 5);
          if (toolSnippet) {
            addLayer('toolMemory', `[Recent Tool Executions]\n${toolSnippet}`, 7, 0.08);
          }
        }
        if (memory.getSearchResultsSnippet) {
          const searchSnippet = memory.getSearchResultsSnippet(sessionId, 3);
          if (searchSnippet) {
            addLayer('searchMemory', `[Recent Search Results]\n${searchSnippet}`, 7, 0.08);
          }
        }
      } catch (e) {}
    }

    // ── Layer 8: Artifact Registry ──
    if (memory && memory.getArtifactsSnippet) {
      try {
        const artSnippet = memory.getArtifactsSnippet(sessionId, 8);
        if (artSnippet) {
          addLayer('artifacts', `[Session Artifacts]\n${artSnippet}`, 8, 0.05);
        }
      } catch (e) {}
    }

    // ── Entity Context (appended to system block) ──
    let entityBlock = '';
    if (tracker) {
      try {
        const candidates = tracker.getCandidates(sessionId);
        if (candidates && candidates.length > 0) {
          entityBlock = `\n[Active Candidate List (${candidates.length} items)]\n` +
            candidates.map(c => `#${c.ordinal || '?'} ${c.name} (${c.type})${c.summary ? ': ' + c.summary : ''}`).join('\n');
        }
      } catch (e) {}
    }

    // Assemble the system context block (layers 3-8 go into system prompt)
    const systemParts = [];
    const systemLayerOrder = ['conversationState', 'rollingSummary', 'historicalChat', 'durableMemory', 'userPreferences', 'toolMemory', 'searchMemory', 'artifacts'];
    for (const layerName of systemLayerOrder) {
      if (layers[layerName]) {
        systemParts.push(layers[layerName].content);
      }
    }
    if (entityBlock) systemParts.push(entityBlock);

    return {
      layers,
      systemContextBlock: systemParts.join('\n\n'),
      userPromptAugmented: augmentedPrompt,
      resolvedEntities,
      entityExplanations,
      totalTokenEstimate: totalTokens,
      budget: {
        contextWindow,
        usableBudget,
        used: totalTokens,
        remaining: usableBudget - totalTokens
      }
    };
  }

  /**
   * After receiving an LLM response, extract entities from it and update tracking.
   */
  function processResponse(sessionId, responseText, contextType = 'generic') {
    const tracker = getEntityTracker();
    if (!tracker) return [];
    try {
      return tracker.extractEntitiesFromText(sessionId, responseText, contextType);
    } catch (e) {
      return [];
    }
  }

  /**
   * Generate a rolling summary request prompt for the LLM.
   * Called when conversation gets long enough to need compression.
   */
  function buildSummaryPrompt(messages, existingSummary = '') {
    const msgBlock = messages.map(m => {
      const role = m.isAi || m.role === 'assistant' ? 'Assistant' : 'User';
      return `${role}: ${String(m.text || m.content || '').substring(0, 300)}`;
    }).join('\n');

    const prefix = existingSummary
      ? `Previous summary:\n${existingSummary}\n\nNew messages since summary:\n`
      : 'Summarize this conversation concisely, preserving key facts, decisions, entities mentioned, and user preferences:\n';

    return prefix + msgBlock + '\n\nProvide a concise, factual summary (max 500 words) preserving: names, numbers, decisions, user preferences, and any entities discussed.';
  }

  /**
   * Determine if the conversation is long enough to need a rolling summary update.
   */
  function needsSummaryUpdate(sessionId, messageCount) {
    const memory = getMemory();
    if (!memory || !memory.getConversationSummary) return false;
    const summary = memory.getConversationSummary(sessionId);
    const turnsCovered = summary ? (summary.turnsCovered || 0) : 0;
    // Trigger summary every 8 new messages after initial 12
    return messageCount > 12 && (messageCount - turnsCovered) >= 8;
  }

  const api = {
    buildContext,
    processResponse,
    buildSummaryPrompt,
    needsSummaryUpdate,
    estimateTokens,
    getContextWindowSize
  };

  if (typeof window !== 'undefined') {
    window.UltronContextEngine = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
