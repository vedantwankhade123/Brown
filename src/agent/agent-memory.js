/**
 * Persistent agent task memory and workflow templates.
 */
(function () {
  const MEMORY_KEY = 'ultron-agent-task-memory';
  const WORKFLOWS_KEY = 'ultron-agent-workflows';
  const APP_STATS_KEY = 'ultron-agent-app-stats';
  const ARTIFACTS_KEY = 'ultron-agent-artifacts';
  const PERMISSION_DECISIONS_KEY = 'ultron-agent-permission-decisions';
  const MAX_MEMORY = 50;
  const MAX_ARTIFACTS_PER_SESSION = 60;

  function loadTaskMemory() {
    try {
      const saved = window.localStorage.getItem(MEMORY_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }

  function saveTaskMemory(entries) {
    try {
      window.localStorage.setItem(MEMORY_KEY, JSON.stringify(entries.slice(-MAX_MEMORY)));
    } catch (e) {}
  }

  function pushTaskMemory(entry) {
    const list = loadTaskMemory();
    list.push({
      ts: Date.now(),
      text: String(entry || '').substring(0, 500)
    });
    saveTaskMemory(list);
    return list;
  }

  function getTaskMemorySnippet(limit = 5) {
    const list = loadTaskMemory();
    if (!list.length) return '';
    return list.slice(-limit).map((item, i) => `${i + 1}. ${item.text}`).join('\n');
  }

  function loadWorkflows() {
    try {
      const saved = window.localStorage.getItem(WORKFLOWS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: 'morning-routine',
        name: 'Morning routine',
        steps: ['OPEN_APP: Outlook', 'OPEN_APP: Google Chrome', 'OPEN_URL: https://calendar.google.com']
      },
      {
        id: 'dev-setup',
        name: 'Dev setup',
        steps: ['OPEN_APP: Visual Studio Code', 'OPEN_APP: Windows Terminal', 'LIST_DIR: .']
      }
    ];
  }

  function saveWorkflows(workflows) {
    try {
      window.localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(workflows));
    } catch (e) {}
  }

  function findWorkflowByPrompt(prompt) {
    const p = String(prompt || '').toLowerCase().trim();
    const runMatch = p.match(/\b(?:run|start|execute|trigger)\s+(?:workflow\s+)?["']?([^"'\n]+?)["']?\s*$/i)
      || p.match(/^\s*(?:run|start|execute|trigger)\s+(?:workflow\s+)?["']?([^"'\n]+?)["']?\s*$/i);
    if (runMatch) {
      const name = runMatch[1].trim();
      return loadWorkflows().find(w =>
        w.name.toLowerCase() === name.toLowerCase() || w.id === name.toLowerCase().replace(/\s+/g, '-')
      ) || null;
    }
    return null;
  }

  function deleteWorkflow(id) {
    const next = loadWorkflows().filter(w => w.id !== id);
    saveWorkflows(next);
    return next;
  }

  function parseWorkflowFromPrompt(prompt) {
    const p = String(prompt || '').trim();
    const saveMatch = p.match(/\b(?:save|create|add)\s+workflow\s+(?:called\s+)?["']?([^"':\n]+?)["']?\s*:\s*(.+)$/i);
    if (!saveMatch) return null;
    const name = saveMatch[1].trim();
    const steps = saveMatch[2].split(/\s*(?:\bthen\b|,|\|)\s*/i).map(s => s.trim()).filter(Boolean);
    if (!name || !steps.length) return null;
    return addWorkflow(name, steps);
  }

  function workflowToAgentPrompt(workflow) {
    if (!workflow) return '';
    return `[Run saved workflow "${workflow.name}"] Execute these steps in order:\n${workflow.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
  }

  function addWorkflow(name, steps) {
    const cleanName = String(name || '').trim();
    const cleanSteps = (Array.isArray(steps) ? steps : []).map(s => String(s || '').trim()).filter(Boolean);
    if (!cleanName || !cleanSteps.length) return null;
    const workflows = loadWorkflows();
    const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const existing = workflows.findIndex(w => w.id === id);
    const workflow = { id, name: cleanName, steps: cleanSteps };
    if (existing >= 0) workflows[existing] = workflow;
    else workflows.push(workflow);
    saveWorkflows(workflows);
    return workflow;
  }

  // Per-app success/failure tracking so the agent learns which launches are reliable
  function loadAppStats() {
    try {
      const saved = window.localStorage.getItem(APP_STATS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  }

  function recordAppOutcome(appName, success) {
    const name = String(appName || '').trim();
    if (!name) return;
    try {
      const stats = loadAppStats();
      const entry = stats[name] || { success: 0, failure: 0, lastUsed: 0 };
      if (success) entry.success++;
      else entry.failure++;
      entry.lastUsed = Date.now();
      stats[name] = entry;
      window.localStorage.setItem(APP_STATS_KEY, JSON.stringify(stats));
    } catch (e) {}
  }

  function getAppStatsSnippet(limit = 5) {
    const stats = loadAppStats();
    const entries = Object.entries(stats)
      .sort((a, b) => (b[1].lastUsed || 0) - (a[1].lastUsed || 0))
      .slice(0, limit);
    if (!entries.length) return '';
    return entries
      .map(([name, s]) => `${name}: ${s.success} ok / ${s.failure} failed`)
      .join('; ');
  }

  // ---------------------------------------------------------------
  // Session artifact/source registry
  // Tracks every file/URL the agent created, wrote, opened or read
  // within a chat session so prompts, chat UI and the sidebar can
  // reference them (and resolve "that file" / "the website" anaphora).
  // ---------------------------------------------------------------
  function basenameOf(path) {
    return String(path || '').split(/[\\/]/).filter(Boolean).pop() || String(path || '');
  }

  function defaultSessionId() {
    try {
      if (typeof window !== 'undefined' && window.currentSessionId) return String(window.currentSessionId);
    } catch (e) {}
    return 'default';
  }

  function loadAllArtifacts() {
    try {
      const saved = window.localStorage.getItem(ARTIFACTS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  }

  function saveAllArtifacts(map) {
    try {
      window.localStorage.setItem(ARTIFACTS_KEY, JSON.stringify(map));
    } catch (e) {}
  }

  function registerArtifact(kind, path, meta = {}) {
    const cleanPath = String(path || '').trim();
    if (!cleanPath) return null;
    const sessionId = meta.sessionId || defaultSessionId();
    const isWeb = /^https?:\/\//i.test(cleanPath);
    const record = {
      id: `art-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      kind: String(kind || (isWeb ? 'web' : 'file')).toLowerCase(),
      path: cleanPath,
      name: meta.name || basenameOf(cleanPath),
      sessionId,
      ts: Date.now(),
      source: meta.source || 'AGENT',
      title: meta.title || '',
      snippet: meta.snippet || ''
    };
    const all = loadAllArtifacts();
    const list = all[sessionId] || [];
    const existingIdx = list.findIndex(a => a.path.toLowerCase() === cleanPath.toLowerCase() && a.kind === record.kind);
    if (existingIdx >= 0) {
      record.id = list[existingIdx].id;
      list[existingIdx] = { ...list[existingIdx], ...record };
    } else {
      list.push(record);
      if (list.length > MAX_ARTIFACTS_PER_SESSION) list.splice(0, list.length - MAX_ARTIFACTS_PER_SESSION);
    }
    all[sessionId] = list;
    saveAllArtifacts(all);
    try {
      window.dispatchEvent(new CustomEvent('ultron:artifacts-updated', { detail: { sessionId, artifact: record } }));
    } catch (e) {}
    return record;
  }

  function getSessionArtifacts(sessionId) {
    const sid = sessionId || defaultSessionId();
    const all = loadAllArtifacts();
    return Array.isArray(all[sid]) ? all[sid] : [];
  }

  // Maps vague references ("that file", "the website", "it", bare names)
  // to the most relevant artifact of the session, or null when nothing fits.
  function resolveArtifactReference(text, sessionId) {
    const p = String(text || '').toLowerCase();
    if (!p.trim()) return null;
    const artifacts = getSessionArtifacts(sessionId);
    if (!artifacts.length) return null;
    const latest = () => artifacts.slice().sort((a, b) => b.ts - a.ts)[0];
    const latestOf = (kinds) => artifacts.filter(a => kinds.includes(a.kind)).sort((a, b) => b.ts - a.ts)[0] || null;

    const webRef = /\b(?:the |that |this )?(?:website|web ?page|webpage|web page|page|url|link|site)\b/i.test(p);
    const fileRef = /\b(?:the |that |this )?(?:file|folder|document|resume|pdf|doc|docx|excel|spreadsheet|image|photo)\b/i.test(p);

    if (webRef && !fileRef) {
      const web = latestOf(['web', 'url']);
      if (web) return web;
      return null;
    }
    if (fileRef && !webRef) {
      const kindMap = {
        resume: 'resume', cv: 'resume', pdf: 'pdf', doc: 'document', docx: 'document',
        document: 'document', excel: 'spreadsheet', spreadsheet: 'spreadsheet',
        image: 'image', photo: 'image', folder: 'folder'
      };
      const wordMatch = p.match(/\b(resume|cv|pdf|docx?|document|excel|spreadsheet|image|photo|folder|file)\b/i);
      const wantedKind = wordMatch ? kindMap[wordMatch[1].toLowerCase()] : '';
      if (wantedKind) {
        const exact = artifacts.filter(a => a.kind === wantedKind).sort((a, b) => b.ts - a.ts)[0];
        if (exact) return exact;
      }
      const fileOnly = latestOf(['file', 'document', 'resume', 'pdf', 'image', 'folder']);
      if (fileOnly) return fileOnly;
      return null;
    }

    // Bare filename or path fragment mentioned anywhere in the text
    let best = null;
    let bestScore = 0;
    for (const art of artifacts) {
      const name = String(art.name || '').toLowerCase();
      if (!name) continue;
      let score = 0;
      if (p.includes(name)) score = name.length;
      else {
        const stem = name.replace(/\.[a-z0-9]{1,5}$/i, '');
        if (stem.length >= 3 && p.includes(stem)) score = stem.length;
      }
      if (score > bestScore) { best = art; bestScore = score; }
    }
    if (best) return best;

    // Pure anaphora ("it", "that", "this one") → most recent artifact
    if (/\b(it|that|this one|the one)\b/i.test(p) && /\b(open|read|analyze|show|check|use|send|edit)\b/i.test(p)) {
      return latest();
    }
    return null;
  }

  function getArtifactsSnippet(sessionId, limit = 8) {
    const artifacts = getSessionArtifacts(sessionId);
    if (!artifacts.length) return '';
    return artifacts.slice(-limit).map(art => {
      const label = art.kind === 'web' ? 'web source' : art.kind;
      return `- [${label}] ${art.name} → ${art.path}`;
    }).join('\n');
  }

  // ---------------------------------------------------------------
  // Permission decision memory
  // "Always allow this category" choices persist across sessions so
  // autonomy grows per user; denials are remembered too.
  // ---------------------------------------------------------------
  function loadPermissionDecisions() {
    try {
      const saved = window.localStorage.getItem(PERMISSION_DECISIONS_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {};
  }

  function savePermissionDecision(category, decision) {
    const cat = String(category || '').trim();
    if (!cat) return;
    const decisions = loadPermissionDecisions();
    decisions[cat] = { decision: decision === 'deny' ? 'deny' : 'always-allow', ts: Date.now() };
    try {
      window.localStorage.setItem(PERMISSION_DECISIONS_KEY, JSON.stringify(decisions));
    } catch (e) {}
  }

  function clearPermissionDecision(category) {
    const decisions = loadPermissionDecisions();
    delete decisions[String(category || '')];
    try {
      window.localStorage.setItem(PERMISSION_DECISIONS_KEY, JSON.stringify(decisions));
    } catch (e) {}
  }

  function hasAlwaysAllow(category) {
    const entry = loadPermissionDecisions()[String(category || '')];
    return Boolean(entry && entry.decision === 'always-allow');
  }

  function hasAlwaysDeny(category) {
    const entry = loadPermissionDecisions()[String(category || '')];
    return Boolean(entry && entry.decision === 'deny');
  }

  window.UltronAgentMemory = {
    loadTaskMemory,
    saveTaskMemory,
    pushTaskMemory,
    getTaskMemorySnippet,
    loadWorkflows,
    saveWorkflows,
    addWorkflow,
    findWorkflowByPrompt,
    deleteWorkflow,
    parseWorkflowFromPrompt,
    workflowToAgentPrompt,
    loadAppStats,
    recordAppOutcome,
    getAppStatsSnippet,
    registerArtifact,
    getSessionArtifacts,
    resolveArtifactReference,
    getArtifactsSnippet,
    loadPermissionDecisions,
    savePermissionDecision,
    clearPermissionDecision,
    hasAlwaysAllow,
    hasAlwaysDeny
  };
})();
