/**
 * Persistent agent task memory and workflow templates.
 */
(function () {
  const MEMORY_KEY = 'ultron-agent-task-memory';
  const WORKFLOWS_KEY = 'ultron-agent-workflows';
  const APP_STATS_KEY = 'ultron-agent-app-stats';
  const MAX_MEMORY = 50;

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
    getAppStatsSnippet
  };
})();
