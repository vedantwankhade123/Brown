(function (root) {
  'use strict';
  // Per-request execution evidence ledger (Phase 1).
  // Records metadata about how a request was handled so Brown can tell
  // "the model wrote text" apart from "the requested task actually completed".
  // PRIVACY: this ledger never stores prompt or response content. Every recorder
  // accepts structured metadata only. Mirrors the local-diagnostics convention
  // (content excluded by default; only safe summaries leave the module).

  const STATES = ['received', 'interpreted', 'context-prepared', 'model-running', 'tool-running', 'validating', 'completed', 'needs-user-input', 'failed', 'cancelled'];
  const TERMINAL = ['completed', 'failed', 'cancelled'];
  const OUTCOMES = ['success', 'clarify', 'unavailable', 'failed', 'cancelled'];
  const ALLOWED = {
    'received': ['interpreted', 'needs-user-input', 'failed', 'cancelled'],
    'interpreted': ['context-prepared', 'model-running', 'tool-running', 'validating', 'needs-user-input', 'failed', 'cancelled'],
    'context-prepared': ['model-running', 'tool-running', 'validating', 'needs-user-input', 'failed', 'cancelled'],
    'model-running': ['tool-running', 'validating', 'model-running', 'context-prepared', 'needs-user-input', 'failed', 'cancelled'],
    'tool-running': ['model-running', 'tool-running', 'validating', 'context-prepared', 'needs-user-input', 'failed', 'cancelled'],
    'validating': ['completed', 'model-running', 'tool-running', 'needs-user-input', 'failed', 'cancelled'],
    'needs-user-input': ['cancelled', 'failed'],
    'completed': [], 'failed': [], 'cancelled': []
  };

  let sequence = 0;
  const nextId = prefix => `${prefix || 'req'}-${Date.now().toString(36)}-${(++sequence).toString(36)}`;
  const num = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const short = (value, limit = 200) => String(value == null ? '' : value).slice(0, limit);

  function createLedger({ requestId, sessionId = null, provider = null, model = null, interpreterModel = null, now = () => Date.now() } = {}) {
    const createdAt = now();
    const record = {
      requestId: requestId || nextId('req'),
      sessionId,
      provider,
      model,
      interpreterModel,
      state: 'received',
      outcome: null,
      skills: [],
      tools: [],
      generation: {},
      contextBudget: { limit: null, source: null, allocations: [], history: { admitted: 0, omitted: 0, excerpted: 0 } },
      taint: { tainted: false, suspicious: false, untrustedClasses: [], approvalRequiredFor: [] },
      retries: [],
      toolCalls: [],
      validation: { checks: [], outcome: null },
      error: null,
      history: [{ state: 'received', at: now() }],
      timings: { createdAt, firstTokenAt: null, finishedAt: null }
    };
    let finished = false;

    function setState(state, reason) {
      if (!STATES.includes(state)) throw Error('Unknown ledger state: ' + state);
      if (finished && state !== record.state) throw Error('Ledger already finished; cannot move to ' + state);
      if (state === record.state) return record.state;
      if (!ALLOWED[record.state].includes(state)) throw Error('Invalid ledger transition: ' + record.state + ' → ' + state);
      record.state = state;
      record.history.push({ state, at: now(), reason: reason ? short(reason, 120) : undefined });
      if (TERMINAL.includes(state)) {
        finished = true;
        record.timings.finishedAt = now();
        if (!record.outcome) record.outcome = state === 'completed' ? 'success' : state;
      }
      return state;
    }

    const ledger = {
      get record() { return record; },
      get state() { return record.state; },
      get finished() { return finished; },
      setState,
      // Interpretation result — metadata only, never the prompt text.
      interpreted({ capability, intent, output, status, knowledge, deliverables, confidence, language, script } = {}) {
        record.interpretation = {
          capability: short(capability, 40), intent: short(intent, 40), output: short(output, 40),
          status: short(status, 20), knowledge: short(knowledge, 20),
          deliverables: Array.isArray(deliverables) ? deliverables.slice(0, 8).map(item => short(item, 40)) : [],
          confidence: num(confidence, 0), language: short(language, 40), script: short(script, 40)
        };
        return setState('interpreted');
      },
      model({ provider, model, interpreterModel } = {}) {
        if (provider != null) record.provider = short(provider, 40);
        if (model != null) record.model = short(model, 120);
        if (interpreterModel != null) record.interpreterModel = short(interpreterModel, 120);
      },
      generation(settings = {}) {
        record.generation = {
          numCtx: num(settings.numCtx, null) || null,
          maxTokens: num(settings.maxTokens, null) || null,
          temperature: num(settings.temperature, null) === null ? null : num(settings.temperature),
          thinking: settings.thinking === undefined ? null : String(settings.thinking).slice(0, 40),
          constrained: Boolean(settings.constrained)
        };
      },
      skills(list = []) {
        record.skills = (Array.isArray(list) ? list : []).slice(0, 12).map(skill => ({ id: short(skill.id || skill, 60), name: short(skill.name, 80) }));
      },
      // Selected tools/capabilities with their risk level (Phase 3 registry feeds this).
      tools(list = []) {
        record.tools = (Array.isArray(list) ? list : []).slice(0, 20).map(tool => ({ id: short(tool.id || tool, 60), risk: short(tool.risk, 24) }));
      },
      // Context budget: limit, whether it came from real model metadata or a
      // conservative fallback, a traceable include/omit reason per section, and
      // metadata-only counts of which conversation turns were admitted or dropped
      // (never the turn content itself).
      contextBudget({ limit, source, allocations, historyTrace } = {}) {
        if (limit != null) record.contextBudget.limit = num(limit, null);
        if (source != null) record.contextBudget.source = short(source, 20);
        if (Array.isArray(allocations)) {
          record.contextBudget.allocations = allocations.slice(0, 40).map(item => ({
            section: short(item.section, 40),
            chars: num(item.chars, 0),
            included: Boolean(item.included),
            reason: short(item.reason, 160)
          }));
        }
        if (Array.isArray(historyTrace)) {
          let admitted = 0, omitted = 0, excerpted = 0;
          for (const entry of historyTrace) {
            if (entry && entry.included) { admitted++; if (entry.excerpted) excerpted++; }
            else omitted++;
          }
          record.contextBudget.history = { admitted, omitted, excerpted };
        }
      },
      retry({ kind, reason } = {}) {
        record.retries.push({ kind: short(kind, 24), reason: short(reason, 160), at: now() });
      },
      // Untrusted-content taint (Phase 6). Accepts the metadata-only summary from a
      // trust-boundary taint scope: whether untrusted content entered the request, whether
      // an injection shape was seen, which content classes were involved, and which action
      // risks now require explicit approval. Never stores the content itself.
      untrustedContent({ tainted, suspicious, untrustedClasses, approvalRequiredFor } = {}) {
        if (tainted != null) record.taint.tainted = Boolean(tainted);
        if (suspicious != null) record.taint.suspicious = Boolean(suspicious);
        if (Array.isArray(untrustedClasses)) {
          record.taint.untrustedClasses = [...new Set(untrustedClasses.map(c => short(c, 40)))].slice(0, 8);
        }
        if (Array.isArray(approvalRequiredFor)) {
          record.taint.approvalRequiredFor = [...new Set(approvalRequiredFor.map(r => short(r, 24)))].slice(0, 8);
        }
      },
      // Tool invocation — summary metadata only (no result content).
      toolCall({ tool, risk, status, durationMs, code, summary } = {}) {
        const startedAt = now();
        record.toolCalls.push({
          tool: short(tool, 60), risk: short(risk, 24), status: short(status, 20),
          durationMs: num(durationMs, now() - startedAt), code: code ? short(code, 40) : null,
          summary: short(summary, 200)
        });
      },
      firstToken() { if (record.timings.firstTokenAt == null) record.timings.firstTokenAt = now(); },
      // Validation checks and the overall verdict.
      validation({ checks, outcome } = {}) {
        if (Array.isArray(checks)) {
          record.validation.checks = checks.slice(0, 40).map(check => ({
            name: short(check.name, 60), passed: Boolean(check.passed), issue: check.issue ? short(check.issue, 200) : null
          }));
        }
        if (outcome != null) record.validation.outcome = short(outcome, 20);
      },
      // A failure with an actionable code + user-facing recovery suggestion.
      fail({ code, message, recovery } = {}) {
        record.error = { code: short(code || 'ERROR', 40), message: short(message, 240), recovery: short(recovery, 240) };
        record.outcome = 'failed';
        return setState('failed');
      },
      needsInput({ reason, clarification } = {}) {
        record.error = null;
        record.needsInput = { reason: short(reason, 120), hasClarification: Boolean(clarification) };
        record.outcome = 'clarify';
        return setState('needs-user-input');
      },
      unavailable({ reason } = {}) {
        record.needsInput = { reason: short(reason, 120), unavailable: true };
        record.outcome = 'unavailable';
        return setState('needs-user-input');
      },
      cancel() { record.outcome = 'cancelled'; return setState('cancelled'); },
      // Completed is only legitimate when the deliverable was verified. A model
      // saying "done" is not completion for file/tool/structured-output work, so
      // callers must pass the validation verdict that justified completion.
      complete({ validationOutcome } = {}) {
        if (validationOutcome != null) record.validation.outcome = short(validationOutcome, 20);
        record.outcome = 'success';
        return setState('completed');
      },
      setOutcome(outcome) { if (OUTCOMES.includes(outcome)) record.outcome = outcome; },
      // Safe summary for the UI / diagnostics. Contains no prompt or response text.
      summary() {
        const totalAllocated = record.contextBudget.allocations.reduce((sum, item) => sum + (item.included ? item.chars : 0), 0);
        return {
          requestId: record.requestId,
          sessionId: record.sessionId,
          state: record.state,
          outcome: record.outcome,
          provider: record.provider,
          model: record.model,
          capability: record.interpretation?.capability || null,
          intent: record.interpretation?.intent || null,
          deliverables: record.interpretation?.deliverables || [],
          skillIds: record.skills.map(skill => skill.id),
          tools: record.tools.map(tool => ({ id: tool.id, risk: tool.risk })),
          retries: record.retries.length,
          toolCalls: record.toolCalls.map(call => ({ tool: call.tool, status: call.status, code: call.code })),
          validationOutcome: record.validation.outcome,
          validationIssues: record.validation.checks.filter(check => !check.passed && check.issue).map(check => check.issue),
          contextBudget: { limit: record.contextBudget.limit, source: record.contextBudget.source, allocatedChars: totalAllocated, history: record.contextBudget.history },
          taint: { tainted: record.taint.tainted, suspicious: record.taint.suspicious, untrustedClasses: record.taint.untrustedClasses, approvalRequiredFor: record.taint.approvalRequiredFor },
          errorCode: record.error?.code || null,
          recovery: record.error?.recovery || null,
          needsInput: record.needsInput || null,
          durationMs: (record.timings.finishedAt || now()) - record.timings.createdAt,
          timeToFirstTokenMs: record.timings.firstTokenAt ? record.timings.firstTokenAt - record.timings.createdAt : null,
          privacy: { includesConversation: false, rawConfigurationIncluded: false }
        };
      }
    };
    return ledger;
  }

  const api = { createLedger, STATES, TERMINAL, OUTCOMES, ALLOWED, nextId };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownExecutionLedger = api;
})(typeof window === 'undefined' ? globalThis : window);
