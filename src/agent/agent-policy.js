/**
 * Security mode policy for agent tool execution.
 */

const DESTRUCTIVE_COMMAND_RE = /\b(rm\s|del\s|remove-item|format\s|shutdown|restart-computer|cipher\s+\/w|reg\s+delete|mkfs|rd\s+\/s|dism\s)/i;
const READONLY_COMMAND_RE = /^\s*(dir|echo|type|where|whoami|ver|ipconfig|tasklist|hostname|set\s|date\s+\/t|time\s+\/t|node\s+--version|npm\s+(list|ls)|git\s+(status|log|diff))\b/i;
const SYSTEM_PATH_RE = /(?:^|\\|\/)(?:windows|system32|syswow64|program files|program files \(x86\)|programdata|boot|recovery)(?:\\|\/|$)/i;
const PASSWORD_CONTEXT_RE = /password|passwd|credential|otp|2fa|pin\b/i;

function getCurrentSecurityMode() {
  const select = document.getElementById('select-security-mode');
  return (select && select.value) || 'Adaptive';
}

function isDestructiveToolCall(toolCall) {
  if (!toolCall) return false;
  if (toolCall.type === 'WRITE_FILE') return true;
  if (toolCall.type === 'EXECUTE') {
    return DESTRUCTIVE_COMMAND_RE.test(String(toolCall.target || ''));
  }
  if (toolCall.type === 'APP_ACTION') {
    const action = String(toolCall.action || '').toUpperCase();
    return ['TYPE_TEXT', 'HOTKEY'].includes(action);
  }
  return false;
}

function isInteractiveAppAction(toolCall) {
  if (toolCall.type !== 'APP_ACTION') return false;
  const action = String(toolCall.action || '').toUpperCase();
  return ['OPEN_APP', 'FOCUS_APP', 'OPEN_URL', 'OPEN_FILE', 'TYPE_TEXT', 'HOTKEY', 'CLICK', 'DOUBLE_CLICK', 'SCROLL'].includes(action);
}

// ---------------------------------------------------------------
// Risk classifier: every tool call scored low / medium / high from
// tool + target + context. Feeds the mode matrix and the consent UI.
// ---------------------------------------------------------------
function classifyRisk(toolCall) {
  if (!toolCall) return { level: 'low', reason: 'Unknown action', category: 'other' };
  const type = toolCall.type;
  const action = String(toolCall.action || '').toUpperCase();

  if (type === 'EXECUTE') {
    const cmd = String(toolCall.target || toolCall.command || '');
    if (DESTRUCTIVE_COMMAND_RE.test(cmd)) {
      return { level: 'high', reason: 'Destructive shell command (can delete data or change system state)', category: 'EXECUTE_DESTRUCTIVE', blacklisted: true };
    }
    if (READONLY_COMMAND_RE.test(cmd)) {
      return { level: 'medium', reason: 'Read-only shell command', category: 'EXECUTE' };
    }
    return { level: 'high', reason: 'Runs a command on your PC with full local privileges', category: 'EXECUTE' };
  }

  if (type === 'WRITE_FILE') {
    const path = String(toolCall.targetPath || toolCall.path || toolCall.target || '');
    if (SYSTEM_PATH_RE.test(path)) {
      return { level: 'high', reason: `Writes into a protected system location (${path.split(/[\\/]/).slice(0, 3).join('\\')})`, category: 'WRITE_FILE_SYSTEM' };
    }
    return { level: 'low', reason: 'Creates or overwrites a file in your personal folders (undo backup kept)', category: 'WRITE_FILE' };
  }

  if (type === 'APP_ACTION') {
    const appName = String(toolCall.appName || toolCall.target || '');
    if (action === 'TYPE_TEXT') {
      if (PASSWORD_CONTEXT_RE.test(appName) || PASSWORD_CONTEXT_RE.test(String(toolCall.text || ''))) {
        return { level: 'high', reason: 'Typing into a context that looks like a password/credential field', category: 'TYPE_TEXT_SENSITIVE' };
      }
      return { level: 'medium', reason: `Types text into ${appName || 'the focused app'}`, category: 'TYPE_TEXT' };
    }
    if (action === 'HOTKEY') return { level: 'medium', reason: 'Sends keyboard shortcuts to the focused app', category: 'HOTKEY' };
    if (['CLICK', 'DOUBLE_CLICK'].includes(action)) return { level: 'medium', reason: 'Clicks a UI element on screen', category: 'CLICK' };
    if (action === 'OPEN_URL') {
      const url = String(toolCall.url || toolCall.target || '');
      if (/^http:\/\//i.test(url)) return { level: 'medium', reason: 'Opens an insecure (http) URL in the browser', category: 'OPEN_URL' };
      return { level: 'low', reason: 'Opens a URL in the browser', category: 'OPEN_URL' };
    }
    if (['OPEN_APP', 'FOCUS_APP', 'OPEN_FILE', 'SCROLL', 'WAIT'].includes(action)) {
      return { level: 'low', reason: `${action === 'OPEN_APP' ? 'Opens' : action === 'FOCUS_APP' ? 'Focuses' : 'Uses'} ${appName || 'an app'} without modifying data`, category: action };
    }
    return { level: 'medium', reason: 'Interacts with an application UI', category: action || 'APP_ACTION' };
  }

  if (type === 'READ_FILE' || type === 'LIST_DIR') return { level: 'low', reason: 'Read-only access to your files', category: type };
  if (type === 'SEARCH' || type === 'WEB_FETCH') return { level: 'low', reason: 'Read-only web lookup', category: type };
  if (type === 'CAPTURE_SCREEN') return { level: 'low', reason: 'Takes a screenshot for vision analysis (privacy apps excluded)', category: 'CAPTURE_SCREEN' };
  return { level: 'low', reason: 'Read-only operation', category: type || 'other' };
}

function getRiskCategory(toolCall) {
  return classifyRisk(toolCall).category;
}

function requiresPermissionPrompt(mode, toolCall) {
  const resolvedMode = mode || getCurrentSecurityMode();
  const caps = window.UltronAgentCapabilities;
  if (caps && typeof caps.evaluateCapabilityGate === 'function') {
    const gate = caps.evaluateCapabilityGate(toolCall);
    if (gate === 'blocked') return 'blocked';
    if (gate === true && resolvedMode !== 'Trusted') return true;
  }

  const risk = classifyRisk(toolCall);

  // Mode matrix:
  // Trusted     → auto low+medium+high, except blacklisted commands (always confirm)
  // Adaptive    → auto low+medium, prompt on high
  // Review      → auto low, prompt on medium+high
  // Containment → prompt every action
  if (resolvedMode === 'Containment') return true;
  if (risk.blacklisted) return true;
  if (resolvedMode === 'Trusted') return false;
  if (resolvedMode === 'Review') return risk.level === 'medium' || risk.level === 'high';
  // Adaptive (Smart Auto-Approval)
  return risk.level === 'high';
}

function requiresAppAuthorization(toolCall) {
  if (!isInteractiveAppAction(toolCall)) return false;
  const action = String(toolCall.action || '').toUpperCase();
  if (['OPEN_APP', 'FOCUS_APP'].includes(action)) return true;
  if (action === 'OPEN_URL') return false;
  return false;
}

function buildPermissionSummary(toolCall) {
  if (!toolCall) return 'Agent action';
  if (toolCall.type === 'APP_ACTION') {
    return `${toolCall.action}: ${toolCall.appName || toolCall.url || toolCall.path || toolCall.target || ''}`.trim();
  }
  if (toolCall.type === 'WRITE_FILE') return `Write file: ${toolCall.targetPath || toolCall.target}`;
  if (toolCall.type === 'EXECUTE') return `Execute: ${toolCall.target}`;
  if (toolCall.type === 'READ_FILE') return `Read file: ${toolCall.target}`;
  return `${toolCall.type}: ${toolCall.target || ''}`.trim();
}

window.UltronAgentPolicy = {
  getCurrentSecurityMode,
  isDestructiveToolCall,
  isInteractiveAppAction,
  requiresPermissionPrompt,
  requiresAppAuthorization,
  buildPermissionSummary,
  classifyRisk,
  getRiskCategory
};
