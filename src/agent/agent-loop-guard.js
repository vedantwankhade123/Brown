/**
 * Agent loop guard — inspired by OpenJarvis LoopGuard.
 * Detects degenerate tool-calling loops (identical repeats, ping-pong patterns).
 */
(function () {
  const DEFAULT_CONFIG = {
    enabled: true,
    maxIdenticalCalls: 3,
    pingPongWindow: 6,
    pollToolBudget: 5,
    searchHopBudget: 4,
    warnBeforeBlock: true
  };

  let _config = { ...DEFAULT_CONFIG };
  const _callCounts = new Map();
  const _toolSequence = [];
  const _perToolCounts = new Map();
  const _warnedCycles = new Set();

  function configure(config = {}) {
    _config = { ...DEFAULT_CONFIG, ...config };
  }

  function reset() {
    _callCounts.clear();
    _toolSequence.length = 0;
    _perToolCounts.clear();
    _warnedCycles.clear();
  }

  function serializeToolCall(toolCall) {
    if (!toolCall) return '';
    const payload = {
      type: toolCall.type,
      action: toolCall.action,
      appName: toolCall.appName,
      target: toolCall.target,
      url: toolCall.url,
      path: toolCall.path || toolCall.targetPath,
      keys: toolCall.keys,
      text: toolCall.text ? String(toolCall.text).slice(0, 120) : undefined
    };
    return JSON.stringify(payload);
  }

  function hashCall(toolCall) {
    const raw = serializeToolCall(toolCall);
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  function toolLabel(toolCall) {
    if (!toolCall) return 'unknown';
    if (toolCall.type === 'APP_ACTION') return String(toolCall.action || 'APP_ACTION').toUpperCase();
    return String(toolCall.type || 'TOOL').toUpperCase();
  }

  function detectPingPong() {
    const seq = _toolSequence.slice(-_config.pingPongWindow);
    if (seq.length < 4) return false;
    for (const period of [2, 3]) {
      if (seq.length >= period * 2) {
        const tail = seq.slice(-period * 2);
        const pattern = tail.slice(0, period);
        if (tail.every((item, i) => item === pattern[i % period])) return true;
      }
    }
    return false;
  }

  function checkCall(toolCall) {
    if (!_config.enabled || !toolCall) {
      return { blocked: false, warned: false, reason: '' };
    }

    const label = toolLabel(toolCall);
    const callHash = hashCall(toolCall);
    const identicalCount = (_callCounts.get(callHash) || 0) + 1;
    _callCounts.set(callHash, identicalCount);

    if (identicalCount > _config.maxIdenticalCalls) {
      const reason = `Identical call to ${label} repeated ${identicalCount} times (max ${_config.maxIdenticalCalls}).`;
      return finalizeVerdict(true, reason);
    }

    const perToolCount = (_perToolCounts.get(label) || 0) + 1;
    _perToolCounts.set(label, perToolCount);
    const budget = (label === 'SEARCH' || label === 'WEB_FETCH')
      ? (_config.searchHopBudget || _config.pollToolBudget)
      : _config.pollToolBudget;
    if (perToolCount > budget) {
      const reason = `Tool ${label} exceeded poll budget (${budget}).`;
      return finalizeVerdict(true, reason);
    }

    _toolSequence.push(label);
    if (_toolSequence.length > _config.pingPongWindow * 2) {
      _toolSequence.splice(0, _toolSequence.length - _config.pingPongWindow * 2);
    }

    if (detectPingPong()) {
      return finalizeVerdict(true, 'Repetitive tool-calling pattern detected (ping-pong).');
    }

    return { blocked: false, warned: false, reason: '' };
  }

  function finalizeVerdict(blocked, reason) {
    if (!blocked || !_config.warnBeforeBlock) {
      return { blocked, warned: false, reason };
    }
    if (!_warnedCycles.has(reason)) {
      _warnedCycles.add(reason);
      return { blocked: false, warned: true, reason };
    }
    return { blocked: true, warned: false, reason };
  }

  function compressContext(messages, maxMessages = 12) {
    if (!Array.isArray(messages) || messages.length <= maxMessages) return messages;
    const head = messages.slice(0, 2);
    const tail = messages.slice(-(maxMessages - 2));
    return [
      ...head,
      { role: 'user', content: '[Earlier agent steps truncated to save context. Continue from the latest observation.]' },
      ...tail
    ];
  }

  window.UltronLoopGuard = {
    configure,
    reset,
    checkCall,
    compressContext,
    serializeToolCall
  };
})();
