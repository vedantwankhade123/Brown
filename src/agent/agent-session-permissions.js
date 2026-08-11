/**
 * Session-scoped permission grants (Sir Thaddeus / Monaw-style).
 */
(function () {
  const SESSION_KEY = 'ultron-session-permission-grants';
  let _memoryGrants = new Map();

  function grantKey(toolCall) {
    const caps = window.UltronAgentCapabilities;
    const group = caps && caps.getToolCapabilityGroup ? caps.getToolCapabilityGroup(toolCall) : null;
    if (group) return `cap:${group}`;
    return `tool:${toolCall.type}:${String(toolCall.action || '').toUpperCase()}`;
  }

  function loadPersistedGrants() {
    try {
      const raw = window.sessionStorage.getItem(SESSION_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        _memoryGrants = new Map(Object.entries(obj));
      }
    } catch (e) {}
  }

  function persistGrants() {
    try {
      const obj = Object.fromEntries(_memoryGrants);
      window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  function hasSessionGrant(toolCall) {
    return _memoryGrants.has(grantKey(toolCall));
  }

  function grantSession(toolCall) {
    _memoryGrants.set(grantKey(toolCall), Date.now());
    persistGrants();
  }

  function revokeSession(toolCall) {
    _memoryGrants.delete(grantKey(toolCall));
    persistGrants();
  }

  function clearAllSessionGrants() {
    _memoryGrants.clear();
    try {
      window.sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {}
  }

  loadPersistedGrants();

  window.UltronSessionPermissions = {
    hasSessionGrant,
    grantSession,
    revokeSession,
    clearAllSessionGrants,
    grantKey
  };
})();
