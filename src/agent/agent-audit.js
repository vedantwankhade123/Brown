/**
 * Local audit log for agent tool calls and permission decisions (Vayu-style).
 */
(function () {
  const AUDIT_KEY = 'ultron-agent-audit-log';
  const MAX_ENTRIES = 250;

  function loadAuditLog() {
    try {
      const saved = window.localStorage.getItem(AUDIT_KEY);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [];
  }

  function saveAuditLog(entries) {
    try {
      window.localStorage.setItem(AUDIT_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
    } catch (e) {}
  }

  function appendAudit(entry) {
    const list = loadAuditLog();
    list.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      ...entry
    });
    saveAuditLog(list);
    return list;
  }

  function clearAuditLog() {
    try {
      window.localStorage.removeItem(AUDIT_KEY);
    } catch (e) {}
  }

  function getAuditLog(limit = 50) {
    return loadAuditLog().slice(-limit).reverse();
  }

  function formatAuditSummary(entry) {
    const tool = entry.toolType || 'UNKNOWN';
    const action = entry.action ? ` ${entry.action}` : '';
    const target = entry.target ? `: ${String(entry.target).substring(0, 60)}` : '';
    return `${tool}${action}${target}`.trim();
  }

  window.UltronAgentAudit = {
    appendAudit,
    getAuditLog,
    clearAuditLog,
    formatAuditSummary,
    loadAuditLog
  };
})();
