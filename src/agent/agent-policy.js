/**
 * Security mode policy for agent tool execution.
 */

const DESTRUCTIVE_COMMAND_RE = /\b(rm\s|del\s|remove-item|format\s|shutdown|restart-computer|cipher\s+/w|reg\s+delete|mkfs|rd\s+\/s|dism\s)/i;

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

function requiresPermissionPrompt(mode, toolCall) {
  const resolvedMode = mode || getCurrentSecurityMode();
  const caps = window.UltronAgentCapabilities;
  if (caps && typeof caps.evaluateCapabilityGate === 'function') {
    const gate = caps.evaluateCapabilityGate(toolCall);
    if (gate === 'blocked') return 'blocked';
    if (gate === true && resolvedMode !== 'Trusted') return true;
  }

  if (resolvedMode === 'Trusted') return false;
  if (resolvedMode === 'Review') return true;
  if (resolvedMode === 'Containment') {
    return toolCall.type === 'EXECUTE' || toolCall.type === 'WRITE_FILE';
  }
  if (resolvedMode === 'Adaptive') {
    return isDestructiveToolCall(toolCall) || toolCall.type === 'EXECUTE';
  }
  return false;
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
  buildPermissionSummary
};
