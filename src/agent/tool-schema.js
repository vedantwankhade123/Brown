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

  window.UltronToolSchema = {
    normalizeToolResult,
    toolResultToObservation
  };
})();
