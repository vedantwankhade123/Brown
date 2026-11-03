(function (root) {
  'use strict';
  // Deterministic context budgeter (Phase 2).
  // Reserves a model's usable context window in a fixed priority order so small local
  // models are not overwhelmed by history, skills, tools or project context. Every
  // section gets a traceable include/omit/truncate reason that feeds the execution
  // ledger. Uses the real model context window when metadata is available and a
  // conservative fallback when it is not.

  // Conservative chars-per-token for mixed multilingual content (Latin ~4, Devanagari/
  // CJK and code are denser). Under-estimating tokens would overflow the window, so we
  // assume fewer chars per token than English to stay safe.
  const CHARS_PER_TOKEN = 3.2;
  // Tokens held back for the model's own answer so the prompt cannot eat the whole window.
  const OUTPUT_RESERVE_TOKENS = 768;
  // Used only when model metadata is unavailable/unverified.
  const FALLBACK_CONTEXT_TOKENS = 4096;
  // Conversation history never takes more than this share of the usable window; the rest
  // stays available for the contract, the request, evidence and skills.
  const MAX_HISTORY_SHARE = 0.5;
  // A required section is never dropped below this many chars before we call it truncated.
  const MIN_REQUIRED_CHARS = 200;

  const hasWindow = value => Number.isFinite(Number(value)) && Number(value) > 0;

  function usable(contextWindowTokens) {
    const verified = hasWindow(contextWindowTokens);
    const tokens = verified ? Number(contextWindowTokens) : FALLBACK_CONTEXT_TOKENS;
    const usableTokens = Math.max(512, tokens - OUTPUT_RESERVE_TOKENS);
    return { tokens, usableTokens, chars: Math.floor(usableTokens * CHARS_PER_TOKEN), source: verified ? 'model' : 'fallback' };
  }

  // Walk sections in priority order, admitting each while it fits. Required sections are
  // truncated to the remaining space rather than dropped; optional sections are omitted
  // with a reason. Returns the allocation list plus the chars left for history.
  function allocate({ contextWindowTokens, sections = [] }) {
    const { chars: limit, source } = usable(contextWindowTokens);
    let remaining = limit;
    const allocations = (Array.isArray(sections) ? sections : []).map(section => {
      const key = String(section.section || section.key || 'unknown');
      const chars = Math.max(0, Math.floor(Number(section.chars) || 0));
      const baseReason = section.reason ? String(section.reason) : '';
      if (chars === 0) return { section: key, chars: 0, included: false, reason: baseReason || 'empty: nothing to inject' };
      if (chars <= remaining) {
        remaining -= chars;
        return { section: key, chars, included: true, reason: baseReason || 'within remaining budget' };
      }
      if (section.required) {
        const keep = Math.min(chars, Math.max(MIN_REQUIRED_CHARS, remaining));
        remaining = Math.max(0, remaining - keep);
        return { section: key, chars: keep, included: true, truncated: true, reason: (baseReason ? baseReason + ' — ' : '') + 'required, truncated to fit the window' };
      }
      return { section: key, chars, included: false, reason: (baseReason ? baseReason + ' — ' : '') + 'omitted: would exceed the remaining window' };
    });
    return { limit, source, allocations, remaining };
  }

  // Char budget for conversation history after higher-priority content is reserved.
  // `reservedChars` is the size of everything that outranks history (contract, latest
  // request, required project/file evidence, selected skill/tool text).
  function historyBudget({ contextWindowTokens, reservedChars = 0 }) {
    const { chars: limit, source } = usable(contextWindowTokens);
    const left = Math.max(0, limit - Math.max(0, Math.floor(Number(reservedChars) || 0)));
    const maxChars = Math.min(left, Math.floor(limit * MAX_HISTORY_SHARE));
    return { maxChars, limit, source, reservedChars: Math.max(0, Math.floor(Number(reservedChars) || 0)) };
  }

  const api = { allocate, historyBudget, usable, CHARS_PER_TOKEN, OUTPUT_RESERVE_TOKENS, FALLBACK_CONTEXT_TOKENS, MAX_HISTORY_SHARE };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownContextBudget = api;
})(typeof window === 'undefined' ? globalThis : window);
