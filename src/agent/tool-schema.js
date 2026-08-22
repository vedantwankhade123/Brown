/**
 * Standard tool result schema for agent loop + UI.
 */
(function () {
  function normalizeToolResult(raw = {}) {
    const success = Boolean(raw.success);
    return {
      success,
      message: raw.message || raw.error || (success ? 'Done.' : 'Action failed.'),
      evidence: raw.evidence || raw.stdout || raw.content || '',
      nextSuggested: raw.nextSuggested || raw.next || '',
      suggestions: Array.isArray(raw.suggestions) ? raw.suggestions : [],
      ambiguous: Boolean(raw.ambiguous),
      resolvedApp: raw.resolvedApp || raw.app || '',
      appIcon: raw.appIcon || '',
      undo: raw.undo || null,
      errorCode: raw.errorCode || (success ? null : 'TOOL_FAILED'),
      raw
    };
  }

  function toolResultToObservation(result) {
    const normalized = normalizeToolResult(result);
    const parts = [normalized.message];
    if (normalized.evidence) parts.push(String(normalized.evidence).substring(0, 4000));
    if (normalized.nextSuggested) parts.push(`Suggested next: ${normalized.nextSuggested}`);
    if (!normalized.success && normalized.suggestions.length) {
      parts.push(`Suggestions: ${normalized.suggestions.join(', ')}`);
    }
    return parts.join('\n');
  }

  // Remove raw tool-call JSON / tool planning artifacts so they never reach the user.
  function stripToolJsonArtifacts(text) {
    if (!text || typeof text !== 'string') return '';
    let cleaned = text;
    cleaned = cleaned.replace(/```(?:json)?\s*\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?\}\s*```/gi, '');
    cleaned = cleaned.replace(/\{[^{}]*"tool"\s*:\s*"[A-Z_][A-Z0-9_]*"[^{}]*\}/g, '');
    cleaned = cleaned.replace(/^\s*(OPEN_APP|FOCUS_APP|OPEN_URL|OPEN_FILE|WRITE_FILE|READ_FILE|CAPTURE_SCREEN|TYPE_TEXT|HOTKEY|EXECUTE|SEARCH|WEB_FETCH|LIST_DIR|CLICK|DOUBLE_CLICK|SCROLL|WAIT|SYSTEM_CONTROL|CLIPBOARD_ACTION|RAG_SEARCH)\s*:.*$/gmi, '');
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    return cleaned;
  }

  const api = {
    normalizeToolResult,
    toolResultToObservation,
    stripToolJsonArtifacts
  };

  if (typeof window !== 'undefined') {
    window.UltronToolSchema = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
