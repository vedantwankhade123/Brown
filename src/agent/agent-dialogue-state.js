/**
 * Rolling dialogue state (Sir Thaddeus DialogueStateStore pattern).
 */
(function () {
  const STATE_KEY = 'ultron-dialogue-state';

  function loadState() {
    try {
      const raw = window.localStorage.getItem(STATE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {
      topic: '',
      location: '',
      lastUserGoal: '',
      lastTaskOutcome: '',
      lastFilePath: '',
      lastAssistantReply: '',
      rollingSummary: '',
      updatedAt: 0
    };
  }

  function saveState(state) {
    try {
      window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {}
  }

  function updateFromTurn(userPrompt, assistantSnippet = '') {
    const state = loadState();
    const prompt = String(userPrompt || '').trim();
    if (prompt) {
      state.lastUserGoal = prompt.slice(0, 200);
      if (/\b(open|create|write|delete|run|search|find|install|download)\b/i.test(prompt)) {
        state.topic = prompt.slice(0, 120);
      }
      const locMatch = prompt.match(/\b(?:in|at|from|to|on)\s+([A-Z]:\\[^\s,]+|\b(?:desktop|documents|downloads)\b)/i);
      if (locMatch) state.location = locMatch[1];
    }
    if (assistantSnippet) {
      state.lastAssistantReply = String(assistantSnippet).slice(0, 300);
      const prev = state.rollingSummary || '';
      const next = `${prev} ${assistantSnippet}`.trim();
      state.rollingSummary = next.slice(-400);
      const pathMatch = String(assistantSnippet).match(/[A-Z]:\\[^\s<*"']+/i)
        || String(assistantSnippet).match(/\b(desktop|documents|downloads)\b/i);
      if (pathMatch) {
        state.lastFilePath = pathMatch[0];
        state.location = pathMatch[0];
      }
    }
    state.updatedAt = Date.now();
    saveState(state);
    return state;
  }

  function recordTaskOutcome(outcome, details = {}) {
    const state = loadState();
    if (outcome) state.lastTaskOutcome = String(outcome).slice(0, 300);
    if (details.path) {
      state.lastFilePath = details.path;
      state.location = details.path;
    }
    if (details.message) state.lastAssistantReply = String(details.message).slice(0, 300);
    state.updatedAt = Date.now();
    saveState(state);
    return state;
  }

  function getPromptSnippet() {
    const s = loadState();
    const parts = [];
    if (s.topic) parts.push(`Current topic: ${s.topic}`);
    if (s.location) parts.push(`Location context: ${s.location}`);
    if (s.lastFilePath) parts.push(`Last file/path: ${s.lastFilePath}`);
    if (s.lastTaskOutcome) parts.push(`Last task outcome: ${s.lastTaskOutcome}`);
    if (s.lastAssistantReply) parts.push(`Last assistant reply: ${s.lastAssistantReply.slice(0, 160)}`);
    if (s.lastUserGoal && s.lastUserGoal.length > 10) {
      parts.push(`Previous user goal: ${s.lastUserGoal.slice(0, 100)}`);
    }
    if (s.rollingSummary) parts.push(`Recent context: ${s.rollingSummary.slice(-200)}`);
    return parts.length ? `\n[DIALOGUE STATE]\n${parts.join('\n')}` : '';
  }

  function clearState() {
    try {
      window.localStorage.removeItem(STATE_KEY);
    } catch (e) {}
  }

  window.UltronDialogueState = {
    loadState,
    updateFromTurn,
    recordTaskOutcome,
    getPromptSnippet,
    clearState
  };
})();
