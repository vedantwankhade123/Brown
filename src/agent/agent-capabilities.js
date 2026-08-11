/**
 * Per-capability permission gates (Off / Ask / Always) — Sir Thaddeus-style.
 */
(function () {
  const STORAGE_PREFIX = 'ultron-cap-';

  const CAPABILITY_GROUPS = {
    file_system: {
      label: 'Files & folders',
      description: 'Read, write, list files on your PC',
      toolTypes: ['READ_FILE', 'WRITE_FILE', 'LIST_DIR']
    },
    shell: {
      label: 'Shell & terminal',
      description: 'Run PowerShell or command-line commands',
      toolTypes: ['EXECUTE']
    },
    app_control: {
      label: 'Apps & UI',
      description: 'Open apps, click, type, hotkeys',
      toolTypes: ['APP_ACTION', 'APP_SEQUENCE']
    },
    screen: {
      label: 'Screen capture',
      description: 'Screenshot and OCR during agent tasks',
      toolTypes: ['CAPTURE_SCREEN']
    },
    web: {
      label: 'Web search & fetch',
      description: 'DuckDuckGo search and page fetch',
      toolTypes: ['SEARCH', 'WEB_FETCH']
    }
  };

  const DEFAULT_MODES = {
    file_system: 'always',
    shell: 'ask',
    app_control: 'always',
    screen: 'ask',
    web: 'always'
  };

  function getCapabilityMode(groupId) {
    const saved = window.localStorage.getItem(`${STORAGE_PREFIX}${groupId}`);
    if (saved === 'off' || saved === 'ask' || saved === 'always') return saved;
    return DEFAULT_MODES[groupId] || 'ask';
  }

  function setCapabilityMode(groupId, mode) {
    if (!CAPABILITY_GROUPS[groupId]) return false;
    if (!['off', 'ask', 'always'].includes(mode)) return false;
    window.localStorage.setItem(`${STORAGE_PREFIX}${groupId}`, mode);
    return true;
  }

  function getAllCapabilityModes() {
    return Object.keys(CAPABILITY_GROUPS).reduce((acc, id) => {
      acc[id] = getCapabilityMode(id);
      return acc;
    }, {});
  }

  function getToolCapabilityGroup(toolCall) {
    if (!toolCall || !toolCall.type) return null;
    const type = String(toolCall.type).toUpperCase();
    for (const [groupId, group] of Object.entries(CAPABILITY_GROUPS)) {
      if (group.toolTypes.includes(type)) return groupId;
    }
    return null;
  }

  /** @returns {'blocked'|true|false} blocked = off, true = ask, false = allow */
  function evaluateCapabilityGate(toolCall) {
    const groupId = getToolCapabilityGroup(toolCall);
    if (!groupId) return false;
    const mode = getCapabilityMode(groupId);
    if (mode === 'off') return 'blocked';
    if (mode === 'always') return false;
    return true;
  }

  function getCapabilityBlockMessage(toolCall) {
    const groupId = getToolCapabilityGroup(toolCall);
    const group = groupId ? CAPABILITY_GROUPS[groupId] : null;
    return group
      ? `${group.label} is disabled in Settings → Permissions. Set it to Ask or Always to allow this action.`
      : 'This capability is disabled in Settings → Permissions.';
  }

  window.UltronAgentCapabilities = {
    CAPABILITY_GROUPS,
    getCapabilityMode,
    setCapabilityMode,
    getAllCapabilityModes,
    getToolCapabilityGroup,
    evaluateCapabilityGate,
    getCapabilityBlockMessage
  };
})();
