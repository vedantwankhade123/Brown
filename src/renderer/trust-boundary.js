(function (root) {
  'use strict';
  // Brown trust boundary (Phase 6, Risk fix 2).
  //
  // Runtime content classes and taint tracking, so trust is enforced by code and not only
  // by prompt text that says "this is data, not instructions". Everything that is not the
  // app's own instruction or the user's own request is UNTRUSTED-for-instructions: it can
  // be summarized and quoted, but it can never become a system instruction, activate a
  // tool, or override an app rule. Once untrusted external content enters a request, a
  // local-write / external-write / execution action requires explicit user approval;
  // read-only actions stay available within the user-approved scope.
  //
  // This module records metadata only — never the content itself — so it is safe for the
  // execution ledger and diagnostics.

  const WRITE_OR_EXECUTE_RISKS = ['local-write', 'external-write', 'execution'];

  // trusted: may steer behavior. canInstruct: may be rendered as a system instruction.
  const CONTENT_CLASSES = [
    { id: 'app-instruction', label: 'Brown app instruction', trusted: true, canInstruct: true },
    { id: 'user-request', label: 'Your request', trusted: true, canInstruct: true },
    { id: 'project-file', label: 'Project / attached file', trusted: false, canInstruct: false },
    { id: 'imported-document', label: 'Imported document', trusted: false, canInstruct: false },
    { id: 'web-search', label: 'Web / search result', trusted: false, canInstruct: false },
    { id: 'tool-output', label: 'Tool output', trusted: false, canInstruct: false },
    { id: 'external-integration', label: 'External integration content', trusted: false, canInstruct: false }
  ];
  const CLASS_BY_ID = CONTENT_CLASSES.reduce((map, entry) => { map[entry.id] = entry; return map; }, {});

  // Map the evidence kinds the executor already tags onto content classes.
  const KIND_TO_CLASS = {
    system: 'app-instruction', instructions: 'app-instruction', contract: 'app-instruction',
    prompt: 'user-request', request: 'user-request', user: 'user-request',
    pinned: 'project-file', attachment: 'project-file', file: 'project-file', project: 'project-file', rag: 'project-file',
    document: 'imported-document', import: 'imported-document', imported: 'imported-document',
    web: 'web-search', search: 'web-search',
    tool: 'tool-output',
    integration: 'external-integration', external: 'external-integration', mcp: 'external-integration'
  };

  // Instruction-override / injection shapes. Matched on untrusted content to flag it; the
  // content is never logged, only the fact that a pattern matched.
  const INJECTION_PATTERNS = [
    /ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|prompts?|rules?|context)/i,
    /disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier|your)\s+(?:instructions?|rules?|system)/i,
    /you\s+are\s+now\b|\bact\s+as\s+(?:the\s+)?system\b|\bnew\s+system\s+prompt\b/i,
    /^\s*system\s*:/im,
    /<\/?\s*(?:system|instructions?|assistant)\s*>/i,
    /\b(?:always\s+allow|grant\s+(?:all|every|any)\s+permissions?|disable\s+(?:safety|permissions?|guards?|approvals?)|bypass\s+(?:safety|permissions?|approvals?))\b/i,
    /\b(?:run|execute)\s+(?:this|the\s+following|without\s+asking)\b.{0,40}\b(?:without\s+(?:asking|confirmation|approval)|no\s+confirmation)\b/i,
    /\b(?:reveal|print|repeat)\s+(?:your|the)\s+(?:system\s+prompt|instructions|hidden\s+rules)\b/i
  ];

  function classify(source) {
    const id = typeof source === 'string' ? source : (source && (source.class || source.kind || source.type)) || '';
    const direct = CLASS_BY_ID[String(id).toLowerCase()];
    if (direct) return direct;
    const mapped = CLASS_BY_ID[KIND_TO_CLASS[String(id).toLowerCase()]];
    return mapped || CLASS_BY_ID['external-integration'];
  }

  // Scan untrusted text for injection shapes. Returns metadata only (which patterns hit),
  // never the matched content.
  function scanContent(text) {
    const value = String(text || '');
    const matches = [];
    for (const pattern of INJECTION_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(value)) matches.push(pattern.source.slice(0, 40));
    }
    return { suspicious: matches.length > 0, matchCount: matches.length, matches };
  }

  // A per-request taint scope. Mark each untrusted source as it enters; the scope then
  // decides whether a write/execute action needs approval.
  function createTaintScope() {
    const sources = [];
    let tainted = false, suspicious = false;
    return {
      mark(source, { text } = {}) {
        const entry = classify(source);
        const scan = text != null ? scanContent(text) : null;
        if (!entry.trusted) { tainted = true; sources.push({ class: entry.id, suspicious: Boolean(scan && scan.suspicious) }); }
        if (scan && scan.suspicious) suspicious = true;
        return { class: entry.id, trusted: entry.trusted, canInstruct: entry.canInstruct, suspicious: Boolean(scan && scan.suspicious) };
      },
      get tainted() { return tainted; },
      get suspicious() { return suspicious; },
      // Read-only never escalates; write/execute escalates only once untrusted content is in.
      requiresApproval(risk) { return tainted && WRITE_OR_EXECUTE_RISKS.includes(risk); },
      sources: () => sources.slice(),
      // Metadata-only summary for the ledger / diagnostics.
      summary() {
        const classes = [...new Set(sources.map(s => s.class))];
        return { tainted, suspicious, untrustedClasses: classes, approvalRequiredFor: tainted ? WRITE_OR_EXECUTE_RISKS.slice() : [], privacy: { includesContent: false } };
      }
    };
  }

  // Single decision point combining the permission mode, the action risk and taint.
  // @returns {'allow'|'ask'|'block'}
  function gateAction({ risk, mode = 'ask', tainted = false, approvalGranted = false } = {}) {
    if (mode === 'off') return 'block';
    if (tainted && !approvalGranted && WRITE_OR_EXECUTE_RISKS.includes(risk)) return 'ask';
    if (mode === 'ask') return 'ask';
    if (mode === 'always') return 'allow';
    return 'ask';
  }

  const api = { CONTENT_CLASSES, WRITE_OR_EXECUTE_RISKS, classify, scanContent, createTaintScope, gateAction };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownTrustBoundary = api;
})(typeof window === 'undefined' ? globalThis : window);
