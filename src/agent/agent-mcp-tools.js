/**
 * MCP tool bridge for the Ultron agent (modelcontextprotocol/servers + Windows-MCP + mcp-windows UIA).
 */
(function () {
  let _windowsToolsCache = null;
  let _windowsUiaToolsCache = null;

  function isMcpAvailable() {
    return window.ultronAPI && typeof window.ultronAPI.getMcpStatus === 'function';
  }

  async function getMcpStatusCached() {
    if (!isMcpAvailable()) return null;
    try {
      return await window.ultronAPI.getMcpStatus();
    } catch (e) {
      return null;
    }
  }

  async function isWindowsMcpAvailable() {
    const status = await getMcpStatusCached();
    return Boolean(status && status.connected && status.connected.includes('windows'));
  }

  async function isWindowsUiaAvailable() {
    const status = await getMcpStatusCached();
    return Boolean(status && status.connected && status.connected.includes('windows-uia'));
  }

  async function getWindowsToolNames() {
    if (_windowsToolsCache) return _windowsToolsCache;
    const status = await getMcpStatusCached();
    if (!status || !status.tools) return [];
    _windowsToolsCache = status.tools
      .filter(t => t.startsWith('windows:'))
      .map(t => t.replace(/^windows:/, ''));
    return _windowsToolsCache;
  }

  async function getWindowsUiaToolNames() {
    if (_windowsUiaToolsCache) return _windowsUiaToolsCache;
    const status = await getMcpStatusCached();
    if (!status || !status.tools) return [];
    _windowsUiaToolsCache = status.tools
      .filter(t => t.startsWith('windows-uia:'))
      .map(t => t.replace(/^windows-uia:/, ''));
    return _windowsUiaToolsCache;
  }

  function pickTool(tools, candidates) {
    return candidates.find(name => tools.includes(name)) || '';
  }

  async function getMcpToolsSnippet() {
    if (!isMcpAvailable()) return '';
    try {
      const status = await getMcpStatusCached();
      if (!status || !status.tools || !status.tools.length) return '';
      const lines = status.tools.slice(0, 20).map(t => `- ${t}`);
      const uiaHint = status.connected.includes('windows-uia')
        ? '\nWindows UIA MCP (mcp-windows) — prefer ui_find + ui_click + ui_type by element name over pixel coordinates.'
        : '';
      const windowsHint = status.connected.includes('windows')
        ? '\nWindows-MCP (CursorTouch) — App, Type, Click, Snapshot for general desktop automation.'
        : '';
      return `\nMCP TOOLS (optional — connected MCP servers):\n${lines.join('\n')}${uiaHint}${windowsHint}`;
    } catch (e) {
      return '';
    }
  }

  async function mcpCallTool(serverId, toolName, args = {}) {
    if (!window.ultronAPI || !window.ultronAPI.mcpCallTool) {
      return { success: false, error: 'MCP bridge unavailable.' };
    }
    return window.ultronAPI.mcpCallTool({ serverId, toolName, args });
  }

  async function mcpReadFile(filePath) {
    try {
      const result = await mcpCallTool('filesystem', 'read_file', { path: filePath });
      return result && result.success ? result.text : null;
    } catch (e) {
      return null;
    }
  }

  async function fetchPageMarkdown(url) {
    if (!window.ultronAPI || !window.ultronAPI.fetchWebPage) return null;
    try {
      const page = await window.ultronAPI.fetchWebPage(url);
      return page && page.success ? (page.markdown || page.plain) : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeMcpActionResult(toolName, result) {
    if (!result) return null;
    return {
      success: Boolean(result.success),
      message: result.success ? `${toolName} completed via MCP.` : (result.error || `${toolName} failed.`),
      evidence: result.text || '',
      raw: result
    };
  }

  async function mcpWindowsAction(toolName, args = {}) {
    if (!(await isWindowsMcpAvailable())) return null;
    try {
      const result = await mcpCallTool('windows', toolName, args);
      return normalizeMcpActionResult(toolName, result);
    } catch (e) {
      return null;
    }
  }

  async function mcpWindowsUiaAction(toolName, args = {}) {
    if (!(await isWindowsUiaAvailable())) return null;
    try {
      const result = await mcpCallTool('windows-uia', toolName, args);
      return normalizeMcpActionResult(toolName, result);
    } catch (e) {
      return null;
    }
  }

  function elementTarget(toolCall) {
    return String(
      toolCall.elementName
      || toolCall.element
      || toolCall.uiTarget
      || toolCall.target
      || ''
    ).trim();
  }

  function looksLikeElementName(value) {
    const v = String(value || '').trim();
    if (!v || v.length > 120) return false;
    if (/^\d+$/.test(v)) return false;
    if (/^\d+\s*,\s*\d+$/.test(v)) return false;
    return !/^[A-Za-z]:\\/.test(v) && !/^https?:\/\//i.test(v);
  }

  async function tryWindowsUiaForAppAction(toolCall) {
    if (!toolCall || toolCall.type !== 'APP_ACTION') return null;

    let available = await isWindowsUiaAvailable();
    if (!available && window.ultronAPI.installMcpWindowsUia) {
      try {
        const installed = await window.ultronAPI.installMcpWindowsUia();
        if (installed && installed.success) {
          _windowsUiaToolsCache = null;
          available = await isWindowsUiaAvailable();
        }
      } catch (e) { /* ignore */ }
    }
    if (!available) return null;

    const action = String(toolCall.action || '').toUpperCase();
    const tools = await getWindowsUiaToolNames();
    const element = elementTarget(toolCall);
    const findTool = pickTool(tools, ['ui_find', 'UI_Find', 'find']);
    const clickTool = pickTool(tools, ['ui_click', 'UI_Click', 'click']);
    const typeTool = pickTool(tools, ['ui_type', 'UI_Type', 'type']);
    const windowTool = pickTool(tools, ['window_management', 'Window_Management', 'window']);

    if (action === 'TYPE_TEXT' && typeTool) {
      if (element && looksLikeElementName(element) && findTool) {
        await mcpCallTool('windows-uia', findTool, { name: element, query: element, text: element });
      }
      return mcpWindowsUiaAction(typeTool, { text: toolCall.text || '', value: toolCall.text || '' });
    }

    if ((action === 'CLICK' || action === 'DOUBLE_CLICK') && clickTool) {
      const name = looksLikeElementName(element) ? element : looksLikeElementName(toolCall.windowTitle) ? toolCall.windowTitle : '';
      if (name && findTool) {
        await mcpCallTool('windows-uia', findTool, { name, query: name, text: name });
      }
      if (name) {
        return mcpWindowsUiaAction(clickTool, { name, query: name, element: name, double: action === 'DOUBLE_CLICK' });
      }
      if (toolCall.x != null && toolCall.y != null) {
        return mcpWindowsUiaAction(pickTool(tools, ['mouse_control', 'Mouse_Control']) || clickTool, {
          x: toolCall.x,
          y: toolCall.y,
          action: action === 'DOUBLE_CLICK' ? 'double_click' : 'click'
        });
      }
    }

    if ((action === 'OPEN_APP' || action === 'FOCUS_APP') && windowTool) {
      const title = toolCall.appName || toolCall.target || element;
      return mcpWindowsUiaAction(windowTool, {
        action: action === 'FOCUS_APP' ? 'activate' : 'open',
        title,
        name: title
      });
    }

    if (action === 'HOTKEY') {
      const keyboardTool = pickTool(tools, ['keyboard_control', 'Keyboard_Control']);
      if (keyboardTool) {
        return mcpWindowsUiaAction(keyboardTool, {
          keys: toolCall.keys,
          shortcut: toolCall.keys
        });
      }
    }

    return null;
  }

  async function tryWindowsMcpForAppAction(toolCall) {
    if (!toolCall || toolCall.type !== 'APP_ACTION') return null;
    if (!(await isWindowsMcpAvailable())) return null;

    const action = String(toolCall.action || '').toUpperCase();
    const tools = await getWindowsToolNames();
    const has = (name) => tools.includes(name);

    if (action === 'OPEN_APP' && has('App')) {
      return mcpWindowsAction('App', { name: toolCall.appName || toolCall.target, action: 'launch' });
    }
    if (action === 'FOCUS_APP' && has('App')) {
      return mcpWindowsAction('App', { name: toolCall.appName || toolCall.target, action: 'switch' });
    }
    if (action === 'TYPE_TEXT' && has('Type')) {
      return mcpWindowsAction('Type', { text: toolCall.text || '' });
    }
    if (action === 'CLICK' && has('Click') && toolCall.x != null && toolCall.y != null) {
      return mcpWindowsAction('Click', { loc: [toolCall.x, toolCall.y] });
    }
    if (action === 'SCROLL' && has('Scroll')) {
      return mcpWindowsAction('Scroll', { direction: (toolCall.delta || 0) < 0 ? 'down' : 'up', amount: Math.abs(toolCall.delta || 120) });
    }
    if (action === 'HOTKEY' && has('Shortcut')) {
      const keys = String(toolCall.keys || '').replace(/\+/g, '+');
      return mcpWindowsAction('Shortcut', { shortcut: keys });
    }
    if (action === 'WAIT' && has('Wait')) {
      return mcpWindowsAction('Wait', { duration: Math.min(Math.max(Number(toolCall.ms) || 1000, 100), 10000) / 1000 });
    }

    return null;
  }

  window.UltronMcpTools = {
    isMcpAvailable,
    isWindowsMcpAvailable,
    isWindowsUiaAvailable,
    getMcpToolsSnippet,
    mcpReadFile,
    fetchPageMarkdown,
    mcpCallTool,
    mcpWindowsAction,
    mcpWindowsUiaAction,
    tryWindowsUiaForAppAction,
    tryWindowsMcpForAppAction
  };
})();
