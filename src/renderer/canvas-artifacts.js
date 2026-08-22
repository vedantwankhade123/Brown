/**
 * Ultron Interactive Canvas & Artifacts Split-View Manager
 * Side-by-side workspace for live HTML/CSS/JS sandbox execution, Mermaid.js diagrams, and Markdown documents.
 */
(function () {
  'use strict';

  let _artifacts = [];
  let _activeArtifactId = null;
  let _panelEl = null;
  let _iframeEl = null;
  let _codeContainerEl = null;
  let _markdownContainerEl = null;
  let _consoleLogsEl = null;
  let _isFullscreen = false;

  function init() {
    _panelEl = document.getElementById('canvas-artifacts-panel');
    if (!_panelEl) return;

    _iframeEl = document.getElementById('canvas-sandbox-iframe');
    _codeContainerEl = document.getElementById('canvas-code-view');
    _markdownContainerEl = document.getElementById('canvas-markdown-view');
    _consoleLogsEl = document.getElementById('canvas-console-logs');

    // Wire action buttons
    const btnClose = document.getElementById('btn-canvas-close');
    const btnFullscreen = document.getElementById('btn-canvas-fullscreen');
    const btnRefresh = document.getElementById('btn-canvas-refresh');
    const btnCopy = document.getElementById('btn-canvas-copy');
    const btnDownload = document.getElementById('btn-canvas-download');
    const consoleHeader = document.getElementById('canvas-console-header');

    if (btnClose) btnClose.addEventListener('click', closeCanvas);
    if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);
    if (btnRefresh) btnRefresh.addEventListener('click', refreshSandbox);
    if (btnCopy) btnCopy.addEventListener('click', copyActiveContent);
    if (btnDownload) btnDownload.addEventListener('click', downloadActiveContent);

    if (consoleHeader) {
      consoleHeader.addEventListener('click', () => {
        const drawer = document.getElementById('canvas-console-drawer');
        if (drawer) drawer.classList.toggle('collapsed');
      });
    }

    // Listen for messages from iframe sandbox console
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'ultron-sandbox-log') {
        appendConsoleLog(event.data.level, event.data.message);
      }
    });
  }

  function openArtifact(options = {}) {
    const {
      title = 'Interactive Workspace',
      content = '',
      type = 'html', // 'html' | 'markdown' | 'code' | 'mermaid'
      language = 'html'
    } = options;

    if (!_panelEl) init();
    if (!_panelEl) return;

    const id = `art-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const artifact = { id, title, content, type, language, createdAt: Date.now() };

    _artifacts.push(artifact);
    _activeArtifactId = id;

    _panelEl.classList.remove('hidden');
    renderTabs();
    renderActiveArtifact();
  }

  function closeCanvas() {
    if (_panelEl) _panelEl.classList.add('hidden');
    _isFullscreen = false;
    if (_panelEl) _panelEl.classList.remove('fullscreen');
  }

  function toggleFullscreen() {
    if (!_panelEl) return;
    _isFullscreen = !_isFullscreen;
    _panelEl.classList.toggle('fullscreen', _isFullscreen);
    const icon = document.getElementById('btn-canvas-fullscreen');
    if (icon) {
      icon.title = _isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Canvas';
    }
  }

  function renderTabs() {
    const tabsContainer = document.getElementById('canvas-tabs-bar');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';
    _artifacts.forEach(art => {
      const tab = document.createElement('div');
      tab.className = `canvas-tab ${art.id === _activeArtifactId ? 'active' : ''}`;
      tab.textContent = art.title.length > 22 ? `${art.title.slice(0, 20)}…` : art.title;
      tab.addEventListener('click', () => {
        _activeArtifactId = art.id;
        renderTabs();
        renderActiveArtifact();
      });
      tabsContainer.appendChild(tab);
    });
  }

  function getActiveArtifact() {
    return _artifacts.find(a => a.id === _activeArtifactId) || _artifacts[_artifacts.length - 1];
  }

  function renderActiveArtifact() {
    const art = getActiveArtifact();
    if (!art) return;

    const titleEl = document.getElementById('canvas-title');
    const badgeEl = document.getElementById('canvas-type-badge');
    const iframePane = document.getElementById('canvas-iframe-pane');
    const codePane = document.getElementById('canvas-code-pane');
    const mdPane = document.getElementById('canvas-markdown-pane');
    const consoleDrawer = document.getElementById('canvas-console-drawer');

    if (titleEl) titleEl.textContent = art.title;
    if (badgeEl) badgeEl.textContent = art.type.toUpperCase();

    // Hide all panes first
    if (iframePane) iframePane.classList.add('hidden');
    if (codePane) codePane.classList.add('hidden');
    if (mdPane) mdPane.classList.add('hidden');
    if (consoleDrawer) consoleDrawer.classList.add('hidden');

    if (art.type === 'html' || art.type === 'js' || art.type === 'svg') {
      if (iframePane) iframePane.classList.remove('hidden');
      if (consoleDrawer) consoleDrawer.classList.remove('hidden');
      clearConsole();
      executeSandbox(art.content);
    } else if (art.type === 'markdown' || art.type === 'md') {
      if (mdPane) mdPane.classList.remove('hidden');
      renderMarkdownView(art.content);
    } else if (art.type === 'mermaid') {
      if (mdPane) mdPane.classList.remove('hidden');
      renderMermaidView(art.content);
    } else {
      if (codePane) codePane.classList.remove('hidden');
      renderCodeView(art.content);
    }
  }

  function executeSandbox(rawContent) {
    if (!_iframeEl) return;
    let fullHtml = rawContent || '';

    // If it's pure SVG, wrap in minimal HTML
    if (fullHtml.trim().startsWith('<svg')) {
      fullHtml = `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#1e1e24;">${fullHtml}</body></html>`;
    }

    // If it's HTML without full doctype, wrap with styling and console interceptor
    if (!fullHtml.toLowerCase().includes('<!doctype') && !fullHtml.toLowerCase().includes('<html')) {
      fullHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #ffffff; color: #1f2937; }
  </style>
</head>
<body>
  ${fullHtml}
</body>
</html>`;
    }

    // Inject console interceptor script
    const consoleInterceptor = `
<script>
  (function() {
    function sendLog(level, args) {
      try {
        const msg = Array.from(args).map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        window.parent.postMessage({ type: 'ultron-sandbox-log', level, message: msg }, '*');
      } catch(e) {}
    }
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;
    console.log = function() { sendLog('info', arguments); origLog.apply(console, arguments); };
    console.warn = function() { sendLog('warn', arguments); origWarn.apply(console, arguments); };
    console.error = function() { sendLog('error', arguments); origErr.apply(console, arguments); };
    window.onerror = function(msg, url, line) {
      sendLog('error', [msg + ' (line ' + line + ')']);
    };
  })();
</script>`;

    const finalSrcDoc = fullHtml.replace('<head>', `<head>${consoleInterceptor}`);
    _iframeEl.srcdoc = finalSrcDoc.includes(consoleInterceptor) ? finalSrcDoc : `${consoleInterceptor}${finalSrcDoc}`;
  }

  function refreshSandbox() {
    const art = getActiveArtifact();
    if (art && (art.type === 'html' || art.type === 'js' || art.type === 'svg')) {
      clearConsole();
      executeSandbox(art.content);
    }
  }

  function renderMarkdownView(content) {
    if (!_markdownContainerEl) return;
    if (window.marked && typeof window.marked.parse === 'function') {
      _markdownContainerEl.innerHTML = window.marked.parse(content || '');
    } else {
      _markdownContainerEl.textContent = content || '';
    }
  }

  function renderMermaidView(code) {
    if (!_markdownContainerEl) return;
    _markdownContainerEl.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;">
        <div style="background:#17181f;border:1px solid rgba(255,255,255,0.1);padding:16px;border-radius:8px;width:100%;max-width:700px;overflow:auto;">
          <h4 style="margin-top:0;color:#60a5fa;">Mermaid Architecture Diagram</h4>
          <pre style="color:#a7f3d0;font-family:'JetBrains Mono', monospace;font-size:13px;line-height:1.5;">${escapeHtml(code)}</pre>
        </div>
      </div>
    `;
  }

  function renderCodeView(content) {
    if (!_codeContainerEl) return;
    _codeContainerEl.textContent = content || '';
  }

  function appendConsoleLog(level, message) {
    if (!_consoleLogsEl) return;
    const line = document.createElement('div');
    line.className = `canvas-log-line ${level || 'info'}`;
    const timestamp = new Date().toLocaleTimeString();
    line.textContent = `[${timestamp}] ${message}`;
    _consoleLogsEl.appendChild(line);
    _consoleLogsEl.scrollTop = _consoleLogsEl.scrollHeight;
  }

  function clearConsole() {
    if (_consoleLogsEl) _consoleLogsEl.innerHTML = '';
  }

  function copyActiveContent() {
    const art = getActiveArtifact();
    if (art && art.content) {
      navigator.clipboard.writeText(art.content);
      const btn = document.getElementById('btn-canvas-copy');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<span style="color:#10b981;font-size:11px;">✓</span>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      }
    }
  }

  function downloadActiveContent() {
    const art = getActiveArtifact();
    if (!art) return;
    let ext = '.txt';
    if (art.type === 'html') ext = '.html';
    else if (art.type === 'markdown' || art.type === 'md') ext = '.md';
    else if (art.type === 'js') ext = '.js';
    else if (art.type === 'svg') ext = '.svg';
    else if (art.type === 'mermaid') ext = '.mmd';

    const blob = new Blob([art.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${art.title.replace(/[^a-zA-Z0-9_-]/g, '_')}${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Scan assistant message DOM and attach "Open in Canvas" buttons to code blocks
  function enhanceMessageCodeBlocks(messageElement) {
    if (!messageElement) return;
    const codeBlocks = messageElement.querySelectorAll('pre code, pre');
    codeBlocks.forEach(block => {
      if (block.getAttribute('data-canvas-enhanced')) return;
      block.setAttribute('data-canvas-enhanced', 'true');

      const text = block.textContent || '';
      const isHtml = /<\/?[a-z][\s\S]*>/i.test(text) && !text.includes('<?php');
      const isMermaid = block.classList.contains('language-mermaid') || text.trim().startsWith('graph ') || text.trim().startsWith('flowchart ') || text.trim().startsWith('sequenceDiagram');
      const isSvg = text.trim().startsWith('<svg');

      if (isHtml || isMermaid || isSvg || text.length > 150) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-open-in-canvas';
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>Open in Canvas</span>
        `;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          let type = 'code';
          if (isHtml || isSvg) type = 'html';
          else if (isMermaid) type = 'mermaid';
          openArtifact({
            title: isMermaid ? 'Mermaid Diagram' : (isHtml ? 'Live Preview Sandbox' : 'Code Artifact'),
            content: text,
            type,
            language: type
          });
        });

        const pre = block.tagName === 'PRE' ? block : block.closest('pre');
        if (pre && pre.parentNode) {
          pre.parentNode.insertBefore(btn, pre.nextSibling);
        }
      }
    });
  }

  const api = {
    init,
    openArtifact,
    closeCanvas,
    toggleFullscreen,
    executeSandbox,
    refreshSandbox,
    enhanceMessageCodeBlocks
  };

  if (typeof window !== 'undefined') {
    window.UltronCanvas = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
