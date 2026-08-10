/**
 * Persistent agent task memory and workflow templates.
 */
(function () {
  const MEMORY_KEY = 'ultron-agent-task-memory';
  const WORKFLOWS_KEY = 'ultron-agent-workflows';
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
    const p = String(prompt || '').toLowerCase();
    return loadWorkflows().find(w => p.includes(w.name.toLowerCase()) || p.includes(w.id));
  }

  window.UltronAgentMemory = {
    loadTaskMemory,
    saveTaskMemory,
    pushTaskMemory,
    getTaskMemorySnippet,
    loadWorkflows,
    saveWorkflows,
    findWorkflowByPrompt
  };
})();
