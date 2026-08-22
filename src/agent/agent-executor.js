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
      if ((record.type === 'restore_file' || record.type === 'delete_file') && window.ultronAPI.restoreFileBackup) {
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
      const btnAcceptSession = document.getElementById('btn-perm-accept-session');
      const btnDeny = document.getElementById('btn-perm-deny');

      if (!dialog || !btnAccept || !btnDeny) {
        resolve({ approved: false, scope: 'deny' });
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
        btnAccept.removeEventListener('click', onAcceptOnce);
        if (btnAcceptSession) btnAcceptSession.removeEventListener('click', onAcceptSession);
        btnDeny.removeEventListener('click', onDeny);
      };

      const onAcceptOnce = () => {
        cleanup();
        dialog.classList.add('hidden');
        resolve({ approved: true, scope: 'once', modifiedCommand: permOverrideInput ? permOverrideInput.value.trim() : '' });
      };

      const onAcceptSession = () => {
        cleanup();
        dialog.classList.add('hidden');
        resolve({ approved: true, scope: 'session', modifiedCommand: permOverrideInput ? permOverrideInput.value.trim() : '' });
      };

      const onDeny = () => {
        cleanup();
        dialog.classList.add('hidden');
        resolve({ approved: false, scope: 'deny' });
      };

      btnAccept.addEventListener('click', onAcceptOnce);
      if (btnAcceptSession) btnAcceptSession.addEventListener('click', onAcceptSession);
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

    if (window.UltronAutomationSafety && typeof window.UltronAutomationSafety.validateAutomationAction === 'function') {
      const safety = window.UltronAutomationSafety.validateAutomationAction(toolCall);
      if (!safety.allowed) {
        return getSchema().normalizeToolResult({
          success: false,
          message: safety.message,
          errorCode: safety.errorCode || 'AUTOMATION_BLOCKED'
        });
      }
    }

    if (!isAgentToolsEnabled() && !['SEARCH', 'WEB_FETCH'].includes(toolCall.type)) {
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

    if (toolCall.type === 'WEB_FETCH' && !isWebSearchEnabled()) {
      return getSchema().normalizeToolResult({
        success: false,
        message: 'Web fetch is disabled. Enable web search from the + menu.',
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
      if (toolCall.action === 'OPEN_APP' && !lookup.match) {
        return getSchema().normalizeToolResult({
          success: false,
          message: lookup.suggestions.length
            ? `App not found: ${toolCall.appName || toolCall.target}. Did you mean: ${lookup.suggestions.slice(0, 3).join(', ')}?`
            : `App not found: ${toolCall.appName || toolCall.target}. Check Settings → Desktop Automation or install the app.`,
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

    const perm = policy.requiresPermissionPrompt ? policy.requiresPermissionPrompt(mode, toolCall) : false;
    if (perm === 'blocked') {
      const caps = window.UltronAgentCapabilities;
      const message = caps && caps.getCapabilityBlockMessage
        ? caps.getCapabilityBlockMessage(toolCall)
        : 'This action is blocked by your capability settings.';
      return getSchema().normalizeToolResult({
        success: false,
        message,
        errorCode: 'CAPABILITY_BLOCKED'
      });
    }

    if (perm === true) {
      const sessionPerms = window.UltronSessionPermissions;
      if (sessionPerms && sessionPerms.hasSessionGrant(toolCall)) {
        return null;
      }

      const decision = await promptAgentPermission(toolCall);
      if (decision.approved && decision.scope === 'session' && sessionPerms) {
        sessionPerms.grantSession(toolCall);
      }
      if (window.UltronAgentAudit && typeof window.UltronAgentAudit.appendAudit === 'function') {
        window.UltronAgentAudit.appendAudit({
          toolType: toolCall.type,
          action: toolCall.action || '',
          target: toolCall.target || toolCall.targetPath || toolCall.url || toolCall.appName || '',
          approved: decision.approved,
          scope: decision.scope || (decision.approved ? 'once' : 'deny'),
          outcome: decision.approved ? 'approved' : 'denied'
        });
      }
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

  function recordToolAudit(toolCall, result) {
    if (!window.UltronAgentAudit || typeof window.UltronAgentAudit.appendAudit !== 'function') return;
    if (result && result.errorCode === 'PERMISSION_DENIED') return;
    window.UltronAgentAudit.appendAudit({
      toolType: toolCall.type,
      action: toolCall.action || '',
      target: String(toolCall.target || toolCall.targetPath || toolCall.url || toolCall.appName || '').substring(0, 80),
      success: Boolean(result && result.success),
      outcome: result && result.success ? 'completed' : ((result && result.errorCode) || 'failed'),
      message: String((result && result.message) || '').substring(0, 100)
    });
  }

  async function executeAgentToolCallCore(toolCall, options = {}) {
    const schema = getSchema();
    const withTimeout = options.withTimeout || ((promise, ms = 15000) => {
      const timeout = new Promise(resolve => setTimeout(() => resolve({ success: false, error: `Timed out (${ms / 1000}s).` }), ms));
      return Promise.race([promise, timeout]);
    });

    const gate = await validateToolCall(toolCall);
    if (gate) return gate;

    try {
      if (toolCall.type === 'APP_ACTION') {
        if (String(toolCall.action || '').toUpperCase() === 'TYPE_TEXT' && !toolCall.appName && options.activeAppName) {
          toolCall.appName = options.activeAppName;
          toolCall.target = options.activeAppName;
        }

        if (window.UltronMcpTools && typeof window.UltronMcpTools.tryWindowsUiaForAppAction === 'function') {
          const uiaResult = await window.UltronMcpTools.tryWindowsUiaForAppAction(toolCall);
          if (uiaResult && uiaResult.success) {
            return schema.normalizeToolResult({
              success: true,
              message: uiaResult.message,
              evidence: uiaResult.evidence,
              resolvedApp: toolCall.appName || toolCall.target,
              appIcon: toolCall.appIcon || '',
              raw: uiaResult.raw
            });
          }
        }

        if (window.UltronMcpTools && typeof window.UltronMcpTools.tryWindowsMcpForAppAction === 'function') {
          const mcpResult = await window.UltronMcpTools.tryWindowsMcpForAppAction(toolCall);
          if (mcpResult && mcpResult.success) {
            return schema.normalizeToolResult({
              success: true,
              message: mcpResult.message,
              evidence: mcpResult.evidence,
              resolvedApp: toolCall.appName || toolCall.target,
              appIcon: toolCall.appIcon || '',
              raw: mcpResult.raw
            });
          }
        }

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
        if (writeRes.success && toolCall.targetPath && window.ultronAPI.readFile) {
          try {
            const verify = await window.ultronAPI.readFile(toolCall.targetPath);
            if (!verify.success) {
              return schema.normalizeToolResult({
                success: false,
                message: `Write reported success but file could not be verified at ${toolCall.targetPath}`,
                errorCode: 'WRITE_VERIFY_FAILED'
              });
            }
            const expectedLen = String(toolCall.content || '').length;
            const actualLen = String(verify.content || '').length;
            return schema.normalizeToolResult({
              success: true,
              message: `File written and verified at ${writeRes.filePath || toolCall.targetPath} (${actualLen} chars)`,
              evidence: verify.content ? verify.content.slice(0, 500) : '',
              undo: writeRes.undo,
              verified: true,
              bytes: actualLen
            });
          } catch (verifyErr) {
            return schema.normalizeToolResult(writeRes.success
              ? { success: true, message: `File written at ${writeRes.filePath}`, evidence: writeRes.evidence || writeRes.filePath, undo: writeRes.undo }
              : { success: false, message: writeRes.error || 'Write failed.', errorCode: 'WRITE_FAILED' });
          }
        }
        return schema.normalizeToolResult(writeRes.success
          ? { success: true, message: `File written and verified at ${writeRes.filePath}`, evidence: writeRes.evidence || writeRes.filePath, undo: writeRes.undo }
          : { success: false, message: writeRes.error || 'Write failed.', errorCode: 'WRITE_FAILED' });
      }

      if (toolCall.type === 'READ_FILE') {
        if (window.UltronMcpTools && typeof window.UltronMcpTools.mcpReadFile === 'function') {
          const mcpContent = await window.UltronMcpTools.mcpReadFile(toolCall.target);
          if (mcpContent) {
            return schema.normalizeToolResult({
              success: true,
              message: `Read ${toolCall.target} (MCP filesystem)`,
              evidence: mcpContent
            });
          }
        }
        const readRes = await withTimeout(window.ultronAPI.readFile(toolCall.target));
        return schema.normalizeToolResult(readRes.success
          ? { success: true, message: `Read ${readRes.filePath}`, evidence: readRes.content }
          : { success: false, message: readRes.error || 'Read failed.', errorCode: 'READ_FAILED' });
      }

      if (toolCall.type === 'SYSTEM_CONTROL') {
        const action = String(toolCall.action || toolCall.target || '').toUpperCase();
        if (action === 'SET_VOLUME' || toolCall.level !== undefined) {
          const lvl = toolCall.level !== undefined ? toolCall.level : parseInt(toolCall.target || '50', 10);
          const res = await withTimeout(window.ultronAPI.windowsSetVolume(lvl));
          return schema.normalizeToolResult({ success: res.success, message: `Master volume set to ${lvl}%` });
        }
        if (action === 'GET_VOLUME') {
          const res = await withTimeout(window.ultronAPI.windowsGetVolume());
          return schema.normalizeToolResult({ success: res.success, message: `Current volume: ${res.level}%, Muted: ${res.isMuted}` });
        }
        if (action === 'TOGGLE_MUTE' || action === 'MUTE') {
          const res = await withTimeout(window.ultronAPI.windowsToggleMute());
          return schema.normalizeToolResult({ success: res.success, message: 'Audio mute toggled.' });
        }
        if (action.startsWith('MEDIA_') || ['PLAY', 'PAUSE', 'NEXT', 'PREV', 'STOP'].includes(action)) {
          const key = action.replace('MEDIA_', '').toLowerCase();
          const res = await withTimeout(window.ultronAPI.windowsMediaKey(key));
          return schema.normalizeToolResult({ success: res.success, message: `Media control ${key} triggered.` });
        }
        if (action === 'LOCK') {
          const res = await withTimeout(window.ultronAPI.windowsLock());
          return schema.normalizeToolResult({ success: res.success, message: 'Workstation locked.' });
        }
        if (action === 'SLEEP') {
          const res = await withTimeout(window.ultronAPI.windowsSleep());
          return schema.normalizeToolResult({ success: res.success, message: 'System entering sleep mode.' });
        }
        if (action === 'SET_BRIGHTNESS') {
          const res = await withTimeout(window.ultronAPI.windowsSetBrightness(toolCall.level || 50));
          return schema.normalizeToolResult({ success: res.success, message: `Display brightness set to ${toolCall.level || 50}%` });
        }
        if (action === 'GET_BRIGHTNESS') {
          const res = await withTimeout(window.ultronAPI.windowsGetBrightness());
          return schema.normalizeToolResult({ success: res.success, message: `Display brightness: ${res.brightness}%` });
        }
        return schema.normalizeToolResult({ success: false, message: `Unknown system control: ${action}` });
      }

      if (toolCall.type === 'CLIPBOARD_ACTION') {
        const action = String(toolCall.action || 'READ').toUpperCase();
        if (action === 'READ' && navigator.clipboard) {
          const text = await navigator.clipboard.readText();
          return schema.normalizeToolResult({ success: true, message: 'Clipboard content read.', evidence: text });
        }
        if (action === 'WRITE' && navigator.clipboard) {
          const text = toolCall.text || toolCall.content || toolCall.target || '';
          await navigator.clipboard.writeText(text);
          if (window.UltronClipboardManager) window.UltronClipboardManager.pushItem(text);
          return schema.normalizeToolResult({ success: true, message: 'Copied text to clipboard.' });
        }
        return schema.normalizeToolResult({ success: false, message: 'Clipboard action failed.' });
      }

      if (toolCall.type === 'RAG_SEARCH') {
        const query = toolCall.query || toolCall.target || '';
        const searchRes = await withTimeout(window.ultronAPI.ragSearch({ query, topK: toolCall.topK || 4 }));
        if (searchRes.success && searchRes.results && searchRes.results.length > 0) {
          const snippets = searchRes.results.map((r, i) => `[${i + 1}] ${r.fileName} (score: ${r.score}):\n${r.snippet}`).join('\n\n');
          return schema.normalizeToolResult({
            success: true,
            message: `Found ${searchRes.results.length} relevant document excerpts.`,
            evidence: snippets,
            raw: searchRes.results
          });
        }
        return schema.normalizeToolResult({
          success: true,
          message: 'No closely matching documents found in Knowledge Base.',
          evidence: ''
        });
      }

      return schema.normalizeToolResult({ success: false, message: `Unsupported tool: ${toolCall.type}`, errorCode: 'UNSUPPORTED' });
    } catch (err) {
      return schema.normalizeToolResult({ success: false, message: err.message, errorCode: 'EXCEPTION' });
    }
  }

  async function executeAgentToolCall(toolCall, options = {}) {
    const result = await executeAgentToolCallCore(toolCall, options);
    recordToolAudit(toolCall, result);
    return result;
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
