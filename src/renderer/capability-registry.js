(function (root) {
  'use strict';
  // Brown capability registry (Phase 3).
  //
  // One unified, risk-annotated view of everything Brown can do: chat capabilities
  // (from BrownRequestPipeline.registry), built-in skills (UltronAgentSkills) and
  // permission-gated tool groups (UltronAgentCapabilities). It COMPOSES those sources
  // instead of duplicating them, so the interpreter schema enum (built from
  // request-pipeline.registry) stays stable, and layers Brown-owned risk / permission /
  // context-cost / verification / fallback metadata plus deterministic smallest-set
  // routing on top. Nothing here grants new shell or filesystem autonomy: tool groups
  // remain gated by UltronAgentCapabilities modes, and skills are prompt playbooks that
  // can never activate a tool by themselves.

  const RISK = ['read-only', 'local-write', 'external-write', 'execution'];

  // Risk + permission + verification metadata for the base chat capabilities. ids match
  // request-pipeline.registry exactly. `cost` is the estimated extra context (chars) the
  // capability injects beyond the request itself; pure-generation capabilities add none.
  const CHAT_META = {
    greeting: { risk: 'read-only', cost: 0, verification: 'deterministic social-response check', fallback: 'always available offline' },
    answer: { risk: 'read-only', cost: 0, verification: 'fulfillment judge + deterministic answer validation', fallback: 'always available offline' },
    creative: { risk: 'read-only', cost: 0, verification: 'script/language + repetition validation', fallback: 'always available offline' },
    code: { risk: 'read-only', cost: 0, verification: 'fence + language validation (never executed here)', fallback: 'always available offline' },
    table: { risk: 'read-only', cost: 0, verification: 'Markdown table structure validation', fallback: 'always available offline' },
    documents: { risk: 'read-only', permissions: ['knowledge_rag'], cost: 0, verification: 'citation/evidence presence check', fallback: 'answer from model knowledge when no files are attached' },
    math: { risk: 'read-only', cost: 0, verification: 'rendered-equation + fulfillment validation', fallback: 'always available offline' },
    reminder: { risk: 'local-write', cost: 0, verification: 'timer adapter validates the supplied delay before scheduling', fallback: 'explain how to set the reminder manually when no adapter is present' },
    search: { risk: 'read-only', permissions: ['web'], cost: 0, verification: 'source URLs cited; blocked/missing evidence explained', fallback: 'answer from local knowledge and state that live web evidence was unavailable' },
    action: { risk: 'execution', permissions: ['app_control', 'shell', 'system_control', 'screen'], cost: 0, verification: 'foreground execution session confirms each step', fallback: 'generate content only and state that no computer action was performed' }
  };

  // Permission-group risk, derived from what the group can do (agent-capabilities toolTypes).
  const GROUP_RISK = {
    file_system: 'local-write',
    shell: 'execution',
    app_control: 'execution',
    screen: 'read-only',
    web: 'read-only',
    system_control: 'execution',
    knowledge_rag: 'read-only',
    clipboard: 'local-write'
  };

  const pipeline = () => root.BrownRequestPipeline || null;
  const skillsSource = () => root.UltronAgentSkills || null;
  const capsSource = () => root.UltronAgentCapabilities || null;

  function annotateChat(entry) {
    const meta = CHAT_META[entry.id] || { risk: 'read-only', cost: 0, verification: 'structural validation', fallback: 'always available offline' };
    return {
      id: entry.id, kind: 'capability', name: entry.id, purpose: entry.description,
      output: entry.output, executor: entry.executor, visual: entry.visual || null,
      risk: meta.risk, permissions: meta.permissions || [], cost: meta.cost,
      available: Boolean(entry.available), verification: meta.verification, fallback: meta.fallback
    };
  }

  // Unified catalog for the present environment. Chat capabilities come from the pipeline
  // (enum-stable), skills from the built-in catalog, tool groups from the permission gates.
  function all(environment = {}) {
    const entries = [];
    const pipe = pipeline();
    if (pipe && typeof pipe.registry === 'function') {
      for (const entry of pipe.registry(environment)) entries.push(annotateChat(entry));
    }
    const skills = skillsSource();
    if (skills && typeof skills.listBuiltinSkills === 'function') {
      for (const skill of skills.listBuiltinSkills()) {
        entries.push({
          id: skill.id, kind: 'skill', name: skill.name, purpose: 'Procedural playbook selected by the router; instructions only, never activates a tool by itself.',
          risk: 'read-only', permissions: [], cost: 1200, available: true,
          verification: 'skill completion checks (Phase 4)', fallback: 'ignored when the router does not select it'
        });
      }
    }
    const caps = capsSource();
    if (caps && caps.CAPABILITY_GROUPS) {
      const modes = typeof caps.getAllCapabilityModes === 'function' ? caps.getAllCapabilityModes() : {};
      for (const [id, group] of Object.entries(caps.CAPABILITY_GROUPS)) {
        const mode = modes[id] || 'ask';
        entries.push({
          id: 'tool:' + id, groupId: id, kind: 'tool-group', name: group.label, purpose: group.description,
          risk: GROUP_RISK[id] || 'execution', permissions: [id], cost: 0,
          mode, available: mode !== 'off',
          verification: 'per-capability permission gate (off/ask/always)', fallback: 'blocked with a Settings → Permissions pointer when off'
        });
      }
    }
    return entries;
  }

  function get(id, environment = {}) {
    return all(environment).find(entry => entry.id === id) || null;
  }

  // Why a capability is unusable right now, and the concrete next step. Returns null when
  // the capability is available. Used for actionable "unavailable" messages.
  function explainUnavailable(id, environment = {}) {
    const entry = get(id, environment);
    if (!entry || entry.available) return null;
    if (entry.kind === 'tool-group') {
      const caps = capsSource();
      const reason = entry.mode === 'off'
        ? `${entry.name} is disabled in Settings → Permissions.`
        : `${entry.name} requires approval before use.`;
      return { available: false, reason, nextStep: 'Set it to Ask or Always in Settings → Permissions.' };
    }
    if (id === 'search') return { available: false, reason: 'Web search is turned off for this chat.', nextStep: 'Enable web search, or ask for an answer from your own files and knowledge.' };
    if (id === 'action') return { available: false, reason: 'Computer actions are not enabled for this chat job.', nextStep: 'Enable computer actions in Settings, or ask Brown to generate the content instead.' };
    const blocking = (entry.permissions || []).map(pid => get('tool:' + pid, environment)).filter(g => g && !g.available);
    if (blocking.length) return { available: false, reason: `${entry.name} needs ${blocking.map(g => g.name).join(', ')}, which is disabled.`, nextStep: 'Enable it in Settings → Permissions.' };
    return { available: false, reason: `${entry.name} is not available in this environment.`, nextStep: entry.fallback || 'Ask for a supported output.' };
  }

  // Deterministic smallest-set routing. The interpreted plan already fixes the primary
  // capability; this resolves the intent label, the permission groups that capability
  // actually depends on (never all of them), and the already-selected skills, filtering
  // out anything unusable in the present environment. No model call, no keyword guessing
  // beyond what the interpreter and skill router already did.
  function select({ plan, environment = {}, skills = [] } = {}) {
    const capabilityId = plan?.capability || 'answer';
    const capability = get(capabilityId, environment) || get('answer', environment);
    let intent = 'conversation';
    if (plan?.visual) {
      const family = plan.visualSelection?.family;
      intent = family === 'artifact' ? 'visual-artifact' : family === 'chart' ? 'chart' : 'diagram';
    } else if (['search', 'action', 'reminder', 'documents'].includes(capabilityId)) intent = capabilityId;

    // Smallest tool set: only the permission groups this capability depends on, and only
    // those still enabled. An unavailable capability engages no tools at all. Pure local
    // generation needs no tool group.
    const tools = capability && capability.available
      ? (capability.permissions || [])
          .map(pid => get('tool:' + pid, environment))
          .filter(group => group && group.available)
          .map(group => ({ id: group.groupId, risk: group.risk, mode: group.mode }))
      : [];

    const selectedSkills = (Array.isArray(skills) ? skills : [])
      .map(skill => ({ id: skill.id || skill, risk: 'read-only', cost: skill.cost ?? 1200 }))
      .slice(0, 3);

    return {
      intent, smallestSet: true,
      capability: capability ? { id: capability.id, risk: capability.risk, available: capability.available } : null,
      tools, skills: selectedSkills,
      unavailable: capability && !capability.available ? explainUnavailable(capability.id, environment) : null
    };
  }

  const api = { RISK, all, get, select, explainUnavailable, CHAT_META, GROUP_RISK };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownCapabilityRegistry = api;
})(typeof window === 'undefined' ? globalThis : window);
