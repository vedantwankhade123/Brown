/**
 * Agent tool execution: policy gates, allowlist, permissions, undo stack.
 */
(function () {
  const _undoStack = [];
  const SENSITIVE_WINDOW_RE = /password|sign.?in|login|bank|paypal|stripe|auth|2fa|otp|credential/i;
  const SENSITIVE_APPS = ['1password', 'lastpass', 'bitwarden', 'keepass'];

  function getPolicy() {
    return window.UltronAgentPolicy || {};
  }

  function getRegistry() {
    return window.UltronAppRegistry || {};
  }

  function getSchema() {
    return window.UltronToolSchema || { normalizeToolResult: (r) => r, toolResultToObservation: (r) => r.message || '' };
  }

  function isAgentToolsEnabled() {
    return window.localStorage.getItem('ultron-agent-tools-enabled') !== 'false';
  }

  function isWebSearchEnabled() {
    return window.localStorage.getItem('ultron-web-search-enabled') !== 'false';
  }

  function pushUndo(record) {
    if (!record) return;
    _undoStack.push(record);
    if (_undoStack.length > 20) _undoStack.shift();
  }

  function peekUndo() {
    return _undoStack.length ? _undoStack[_undoStack.length - 1] : null;
  }

  async function popAndRunUndo() {
    const record = _undoStack.pop();
    if (!record || !window.ultronAPI) return getSchema().normalizeToolResult({ success: false, message: 'Nothing to undo.' });
    try {
      if (record.type === 'restore_file' && window.ultronAPI.restoreFileBackup) {
        const res = await window.ultronAPI.restoreFileBackup(record);
        return getSchema().normalizeToolResult(res);
      }
      if (record.type === 'write_file' && record.path != null) {
        const res = await window.ultronAPI.writeFile(record.path, record.previousContent ?? '');
        return getSchema().normalizeToolResult(res.success
          ? { success: true, message: `Restored previous contents of ${record.path}` }
          : res);
      }
      return getSchema().normalizeToolResult({ success: false, message: 'Unsupported undo action.' });
    } catch (err) {
      return getSchema().normalizeToolResult({ success: false, message: err.message });
    }
  }

  function promptAgentPermission(toolCall) {
    const policy = getPolicy();
    const summary = policy.buildPermissionSummary
      ? policy.buildPermissionSummary(toolCall)
      : `${toolCall.type} ${toolCall.action || toolCall.target || ''}`;

    return new Promise((resolve) => {
      const dialog = document.getElementById('permission-dialog');
      const permActionCode = document.getElementById('perm-action-code');
      const permOverrideInput = document.getElementById('perm-override-input');
      const btnAccept = document.getElementById('btn-perm-accept');
      const btnDeny = document.getElementById('btn-perm-deny');

      if (!dialog || !btnAccept || !btnDeny) {
        resolve({ approved: true });
        return;
      }

      if (permActionCode) permActionCode.textContent = summary;
      if (permOverrideInput) permOverrideInput.value = '';
      dialog.classList.remove('hidden');

      if (typeof playUltronSound === 'function') playUltronSound('permission');
      if (typeof logTrace === 'function') logTrace(`Agent permission: ${summary.substring(0, 80)}`, 'permission');
      if (typeof ensureRightSidebarVisible === 'function') ensureRightSidebarVisible();
      if (typeof expandRightSidebarSection === 'function') expandRightSidebarSection('section-security');

      const cleanup = () => {
        btnAccept.removeEventListener('click', onAccept);
        btnDeny.removeEventListener('click', onDeny);
      };

      const onAccept = () => {
        cleanup();
        dialog.classList.add('hidden');
        resolve({ approved: true, modifiedCommand: permOverrideInput ? permOverrideInput.value.trim() : '' });
      };

      const onDeny = () => {
        cleanup();
        dialog.classList.add('hidden');
        resolve({ approved: false });
      };

      btnAccept.addEventListener('click', onAccept);
      btnDeny.addEventListener('click', onDeny);
    });
  }

  async function resolveAppNameForTool(toolCall) {
    const rawName = toolCall.appName || toolCall.target || '';
    if (!rawName || !window.ultronAPI || !window.ultronAPI.resolveAppName) {
      return { match: null, suggestions: [], ambiguous: false, query: rawName };
    }
    const res = await window.ultronAPI.resolveAppName(rawName);
    if (!res || !res.success) {
      return { match: null, suggestions: res?.suggestions || [], ambiguous: false, query: rawName };
    }
    return {
      match: res.match,
      suggestions: res.suggestions || [],
      ambiguous: Boolean(res.ambiguous),
      query: res.query || rawName,
      alias: res.alias
    };
  }

  function isAppAuthorized(appName, resolvedName) {
    const registry = getRegistry();
    if (registry.isAppNameAuthorized) {
      return registry.isAppNameAuthorized(appName, resolvedName);
    }
    return true;
  }

  async function validateToolCall(toolCall) {
    const policy = getPolicy();
    const mode = policy.getCurrentSecurityMode ? policy.getCurrentSecurityMode() : 'Adaptive';

    if (!isAgentToolsEnabled() && toolCall.type !== 'SEARCH') {
      return getSchema().normalizeToolResult({
        success: false,
        message: 'Agent tools are disabled. Enable them from the + menu.',
        errorCode: 'AGENT_DISABLED'
      });
    }

    if (toolCall.type === 'SEARCH' && !isWebSearchEnabled()) {
      return getSchema().normalizeToolResult({
        success: false,
        message: 'Web search is disabled. Enable it from the + menu.',
        errorCode: 'SEARCH_DISABLED'
      });
    }

    if (policy.requiresAppAuthorization && policy.requiresAppAuthorization(toolCall)) {
      const lookup = await resolveAppNameForTool(toolCall);
      const resolved = lookup.match ? lookup.match.name : (toolCall.appName || toolCall.target);
      if (!isAppAuthorized(toolCall.appName || toolCall.target, resolved)) {
        return getSchema().normalizeToolResult({
          success: false,
          message: `"${resolved || toolCall.appName}" is not in your authorized apps list. Enable it in Settings → Applications.`,
          errorCode: 'APP_NOT_AUTHORIZED',
          suggestions: lookup.suggestions
        });
      }
      if (lookup.ambiguous && lookup.suggestions.length > 1) {
        return getSchema().normalizeToolResult({
          success: false,
          message: `Multiple apps match "${toolCall.appName || toolCall.target}". Please choose one.`,
          errorCode: 'APP_AMBIGUOUS',
          ambiguous: true,
          suggestions: lookup.suggestions
        });
      }
      if (toolCall.action === 'OPEN_APP' && !lookup.match && lookup.suggestions.length) {
        return getSchema().normalizeToolResult({
          success: false,
          message: `App not found: ${toolCall.appName || toolCall.target}. Did you mean: ${lookup.suggestions.slice(0, 3).join(', ')}?`,
          errorCode: 'APP_NOT_FOUND',
          suggestions: lookup.suggestions
        });
      }
      if (lookup.match) {
        toolCall.appName = lookup.match.name;
        toolCall.target = lookup.match.name;
        toolCall.appIcon = lookup.match.icon || '';
      }
    }

    if (policy.requiresPermissionPrompt && policy.requiresPermissionPrompt(mode, toolCall)) {
      const decision = await promptAgentPermission(toolCall);
      if (!decision.approved) {
        return getSchema().normalizeToolResult({
          success: false,
          message: 'Action cancelled — permission denied.',
          errorCode: 'PERMISSION_DENIED'
        });
      }
    }

    return null;
  }

  function isSensitiveCaptureContext(label) {
    const text = String(label || '').toLowerCase();
    if (SENSITIVE_WINDOW_RE.test(text)) return true;
    return SENSITIVE_APPS.some(app => text.includes(app));
  }

  async function executeAgentToolCall(toolCall, options = {}) {
    const schema = getSchema();
    const withTimeout = options.withTimeout || ((promise, ms = 15000) => {
      const timeout = new Promise(resolve => setTimeout(() => resolve({ success: false, error: `Timed out (${ms / 1000}s).` }), ms));
      return Promise.race([promise, timeout]);
    });

    const gate = await validateToolCall(toolCall);
    if (gate) return gate;

    try {
      if (toolCall.type === 'APP_ACTION') {
        const appRes = await withTimeout(window.ultronAPI.appAction(toolCall), 20000);
        const normalized = schema.normalizeToolResult(appRes.success
          ? {
              success: true,
              message: appRes.message || `${toolCall.action} completed.`,
              resolvedApp: appRes.resolvedApp,
              appIcon: appRes.appIcon || toolCall.appIcon || '',
              suggestions: appRes.suggestions
            }
          : { success: false, message: appRes.error || 'App action failed.', suggestions: appRes.suggestions, ambiguous: appRes.ambiguous, errorCode: 'APP_ACTION_FAILED' });
        return normalized;
      }

      if (toolCall.type === 'CAPTURE_SCREEN') {
        if (options.canCaptureScreen === false) {
          return schema.normalizeToolResult({
            success: false,
            message: 'Screen capture is disabled or unavailable.',
            errorCode: 'CAPTURE_DISABLED'
          });
        }
        const label = toolCall.windowTitle || toolCall.target || 'screen';
        if (isSensitiveCaptureContext(label)) {
          return schema.normalizeToolResult({
            success: false,
            message: 'Screen capture blocked — sensitive window detected (login/banking/auth).',
            errorCode: 'CAPTURE_SENSITIVE'
          });
        }
        if (options.captureScreenForAgent) {
          const shot = await options.captureScreenForAgent({
            mode: toolCall.mode || 'screen',
            windowTitle: toolCall.windowTitle,
            label: toolCall.windowTitle || 'screen'
          });
          if (shot) {
            return schema.normalizeToolResult({
              success: true,
              message: `Screen captured (${shot.width}x${shot.height}).`,
              evidence: shot.thumbnailDataUrl || '',
              raw: { shot }
            });
          }
        }
        return schema.normalizeToolResult({ success: false, message: 'Screen capture failed.', errorCode: 'CAPTURE_FAILED' });
      }

      if (toolCall.type === 'EXECUTE') {
        const execRes = await withTimeout(window.ultronAPI.executeAction({ command: toolCall.target }));
        return schema.normalizeToolResult(execRes.success
          ? { success: true, message: 'Command executed.', evidence: execRes.stdout || '', raw: execRes }
          : { success: false, message: execRes.error || 'Command failed.', errorCode: 'EXECUTE_FAILED' });
      }

      if (toolCall.type === 'WRITE_FILE') {
        const writeRes = await withTimeout(window.ultronAPI.writeFile(toolCall.targetPath, toolCall.content));
        if (writeRes.success && writeRes.undo) pushUndo(writeRes.undo);
        return schema.normalizeToolResult(writeRes.success
          ? { success: true, message: `File written and verified at ${writeRes.filePath}`, evidence: writeRes.evidence || writeRes.filePath, undo: writeRes.undo }
          : { success: false, message: writeRes.error || 'Write failed.', errorCode: 'WRITE_FAILED' });
      }

      if (toolCall.type === 'READ_FILE') {
        const readRes = await withTimeout(window.ultronAPI.readFile(toolCall.target));
        return schema.normalizeToolResult(readRes.success
          ? { success: true, message: `Read ${readRes.filePath}`, evidence: readRes.content }
          : { success: false, message: readRes.error || 'Read failed.', errorCode: 'READ_FAILED' });
      }

      if (toolCall.type === 'LIST_DIR') {
        const listRes = await withTimeout(window.ultronAPI.listDir(toolCall.target));
        if (listRes.success) {
          const names = listRes.items.map(i => `${i.isDirectory ? '[DIR]' : '[FILE]'} ${i.name}`).join('\n');
          return schema.normalizeToolResult({ success: true, message: `Listed ${listRes.dirPath}`, evidence: names });
        }
        return schema.normalizeToolResult({ success: false, message: listRes.error || 'List failed.', errorCode: 'LIST_FAILED' });
      }

      return schema.normalizeToolResult({ success: false, message: `Unsupported tool: ${toolCall.type}`, errorCode: 'UNSUPPORTED' });
    } catch (err) {
      return schema.normalizeToolResult({ success: false, message: err.message, errorCode: 'EXCEPTION' });
    }
  }

  window.UltronAgentExecutor = {
    isAgentToolsEnabled,
    isWebSearchEnabled,
    isSensitiveCaptureContext,
    promptAgentPermission,
    resolveAppNameForTool,
    validateToolCall,
    executeAgentToolCall,
    pushUndo,
    peekUndo,
    popAndRunUndo
  };
})();
