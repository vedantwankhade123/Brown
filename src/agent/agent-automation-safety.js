/**
 * Vayu-style automation safety — block secrets/shell text before TYPE_TEXT.
 */
(function () {
  const SECRET_RE = /\b(password|passwd|api[_-]?key|secret|token|bearer|credential|otp|2fa|private[_-]?key|ssh-rsa|-----BEGIN)\b/i;
  const SHELL_RE = /\b(rm\s+-rf|del\s+\/|format\s+|shutdown|restart-computer|invoke-expression|iex\b|curl\s+.+\|\s*(iex|bash)|powershell\s+-enc|reg\s+delete|mkfs)\b/i;
  const PASSWORD_LIKE = /^[^\s]{8,}$/;

  function looksSecret(text) {
    const t = String(text || '');
    if (!t.trim()) return false;
    if (SECRET_RE.test(t)) return true;
    if (/\b(pass(word)?|pwd)\s*[:=]\s*\S+/i.test(t)) return true;
    return false;
  }

  function looksLikeShell(text) {
    const t = String(text || '');
    if (!t.trim()) return false;
    if (SHELL_RE.test(t)) return true;
    if (/^[A-Z]:\\/.test(t) && /\s(&&|\|\|)\s/.test(t)) return true;
    return false;
  }

  function validateAutomationAction(toolCall) {
    if (!toolCall) return { allowed: true };
    const action = String(toolCall.action || '').toUpperCase();
    const text = toolCall.text || toolCall.content || toolCall.target || '';

    if (toolCall.type === 'EXECUTE' && looksLikeShell(toolCall.target || text)) {
      return {
        allowed: false,
        message: 'That command looks destructive or unsafe. Ultron blocked it.',
        errorCode: 'AUTOMATION_BLOCKED'
      };
    }

    if (action === 'TYPE_TEXT' || toolCall.type === 'EXECUTE') {
      if (looksSecret(text)) {
        return {
          allowed: false,
          message: 'That text looks like a password or secret. Ultron will not type credentials.',
          errorCode: 'SECRET_BLOCKED'
        };
      }
      if (action === 'TYPE_TEXT' && looksLikeShell(text)) {
        return {
          allowed: false,
          message: 'That text looks like a shell command. Ultron will not type commands for execution.',
          errorCode: 'SHELL_TEXT_BLOCKED'
        };
      }
    }

    return { allowed: true };
  }

  window.UltronAutomationSafety = {
    looksSecret,
    looksLikeShell,
    validateAutomationAction
  };
})();
