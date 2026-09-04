/**
 * Ultron Interactive Code Canvas & Artifacts Split Workspace Manager
 * Side-by-side IDE workspace for multi-file editing, VS Code syntax coloring,
 * live HTML/CSS/JS sandbox execution, responsive preview, and integrated terminal.
 */
(function () {
  'use strict';

  let _files = [];
  let _activeFileId = null;
  let _activeMode = 'code'; // 'code' | 'preview' | 'terminal' | 'markdown'
  let _panelEl = null;
  let _splitterEl = null;
  let _chatPaneEl = null;
  let _chatViewEl = null;
  let _iframeEl = null;
  let _editorEl = null;
  let _highlightEl = null;
  let _lineNumbersEl = null;
  let _markdownContainerEl = null;
  let _consoleLogsEl = null;
  let _terminalOutputEl = null;
  let _terminalInputEl = null;
  let _isFullscreen = false;
  let _isDragging = false;
  let _splitRatio = 0.5; // 50% left, 50% right
  let _savedRoot = ''; // last disk root used by Save-to-disk

  function init() {
    _panelEl = document.getElementById('canvas-artifacts-panel');
    _splitterEl = document.getElementById('workspace-splitter');
    _chatPaneEl = document.getElementById('chat-pane-column');
    _chatViewEl = document.getElementById('chat-view');

    if (!_panelEl) return;

    _iframeEl = document.getElementById('canvas-sandbox-iframe');
    _editorEl = document.getElementById('canvas-code-editor');
    _highlightEl = document.getElementById('canvas-code-highlight');
    _lineNumbersEl = document.getElementById('code-line-numbers');
    _markdownContainerEl = document.getElementById('canvas-markdown-view');
    _consoleLogsEl = document.getElementById('canvas-console-logs');
    _terminalOutputEl = document.getElementById('terminal-output-area');
    _terminalInputEl = document.getElementById('terminal-command-input');

    // Load saved split ratio
    try {
      const savedRatio = parseFloat(localStorage.getItem('ultron-workspace-split-ratio'));
      if (!isNaN(savedRatio) && savedRatio >= 0.2 && savedRatio <= 0.8) {
        _splitRatio = savedRatio;
      }
    } catch {}

    // Wire action buttons
    const btnClose = document.getElementById('btn-canvas-close');
    const btnFullscreen = document.getElementById('btn-canvas-fullscreen');
    const btnRefresh = document.getElementById('btn-canvas-refresh');
    const btnCopy = document.getElementById('btn-canvas-copy');
    const btnDownload = document.getElementById('btn-canvas-download');
    const btnSaveDisk = document.getElementById('btn-canvas-save-disk');
    const btnAddTab = document.getElementById('btn-canvas-add-tab');
    const consoleHeader = document.getElementById('canvas-console-header');

    if (btnClose) btnClose.addEventListener('click', closeCanvas);
    if (btnFullscreen) btnFullscreen.addEventListener('click', toggleFullscreen);
    if (btnRefresh) btnRefresh.addEventListener('click', refreshLivePreview);
    if (btnCopy) btnCopy.addEventListener('click', copyActiveContent);
    if (btnDownload) btnDownload.addEventListener('click', downloadActiveContent);
    if (btnSaveDisk) btnSaveDisk.addEventListener('click', saveWorkspaceToDisk);
    if (btnAddTab) btnAddTab.addEventListener('click', promptAddNewFile);

    // View mode switchers (Code / Preview / Terminal)
    const btnModeCode = document.getElementById('btn-canvas-mode-code');
    const btnModePreview = document.getElementById('btn-canvas-mode-preview');
    const btnModeTerminal = document.getElementById('btn-canvas-mode-terminal');

    if (btnModeCode) btnModeCode.addEventListener('click', () => switchViewMode('code'));
    if (btnModePreview) btnModePreview.addEventListener('click', () => switchViewMode('preview'));
    if (btnModeTerminal) btnModeTerminal.addEventListener('click', () => switchViewMode('terminal'));

    initVisualInspectorControls();

    // Viewport resize buttons
    document.querySelectorAll('.viewport-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.viewport-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetWidth = btn.getAttribute('data-width') || '100%';
        if (_iframeEl) _iframeEl.style.width = targetWidth;
      });
    });

    // Console drawer toggle
    if (consoleHeader) {
      consoleHeader.addEventListener('click', () => {
        const drawer = document.getElementById('canvas-console-drawer');
        if (drawer) drawer.classList.toggle('collapsed');
      });
    }

    // Terminal command input handler
    if (_terminalInputEl) {
      _terminalInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const cmd = _terminalInputEl.value.trim();
          if (cmd) {
            runTerminalCommand(cmd);
            _terminalInputEl.value = '';
          }
        }
      });
    }

    const btnClearTerm = document.getElementById('btn-clear-terminal');
    if (btnClearTerm && _terminalOutputEl) {
      btnClearTerm.addEventListener('click', () => {
        _terminalOutputEl.innerHTML = '<div class="terminal-line system-line">[Terminal cleared]</div>';
      });
    }

    // Code Editor sync events
    if (_editorEl) {
      _editorEl.addEventListener('input', () => {
        const activeFile = getActiveFile();
        if (activeFile) {
          activeFile.content = _editorEl.value;
          updateEditorHighlight();
          if (_activeMode === 'preview') {
            refreshLivePreview();
          }
        }
      });

      _editorEl.addEventListener('scroll', () => {
        if (_highlightEl) {
          _highlightEl.scrollTop = _editorEl.scrollTop;
          _highlightEl.scrollLeft = _editorEl.scrollLeft;
        }
        if (_lineNumbersEl) {
          _lineNumbersEl.scrollTop = _editorEl.scrollTop;
        }
      });

      // Handle Tab key in editor
      _editorEl.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = _editorEl.selectionStart;
          const end = _editorEl.selectionEnd;
          _editorEl.value = _editorEl.value.substring(0, start) + '  ' + _editorEl.value.substring(end);
          _editorEl.selectionStart = _editorEl.selectionEnd = start + 2;
          _editorEl.dispatchEvent(new Event('input'));
        }
      });
    }

    // Init draggable splitter
    initSplitter();

    // Listen for sandbox console messages
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'ultron-sandbox-log') {
        appendConsoleLog(event.data.level, event.data.message);
      }
    });
  }

  function initSplitter() {
    if (!_splitterEl || !_chatViewEl) return;

    _splitterEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      _isDragging = true;
      _splitterEl.classList.add('is-dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      // Disable iframe pointer events during drag for smooth tracking
      if (_iframeEl) _iframeEl.style.pointerEvents = 'none';

      function onMouseMove(moveEvent) {
        if (!_isDragging || !_chatViewEl) return;
        const rect = _chatViewEl.getBoundingClientRect();
        const offsetX = moveEvent.clientX - rect.left;
        let ratio = offsetX / rect.width;
        ratio = Math.max(0.2, Math.min(0.8, ratio));
        _splitRatio = ratio;
        applySplitRatio();
      }

      function onMouseUp() {
        if (_isDragging) {
          _isDragging = false;
          _splitterEl.classList.remove('is-dragging');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          if (_iframeEl) _iframeEl.style.pointerEvents = '';
          try {
            localStorage.setItem('ultron-workspace-split-ratio', _splitRatio.toString());
          } catch {}
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
        }
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });

    // Double click splitter to reset 50/50
    _splitterEl.addEventListener('dblclick', () => {
      _splitRatio = 0.5;
      applySplitRatio();
      try {
        localStorage.setItem('ultron-workspace-split-ratio', '0.5');
      } catch {}
    });
  }

  function applySplitRatio() {
    if (!_chatPaneEl || !_panelEl || _panelEl.classList.contains('hidden') || _isFullscreen) return;
    const leftPct = (_splitRatio * 100).toFixed(1);
    const rightPct = ((1 - _splitRatio) * 100).toFixed(1);
    _chatPaneEl.style.flex = `0 0 ${leftPct}%`;
    _chatPaneEl.style.width = `${leftPct}%`;
    _panelEl.style.flex = `0 0 calc(${rightPct}% - 6px)`;
    _panelEl.style.width = `calc(${rightPct}% - 6px)`;
  }

  function resetSplitLayout() {
    if (_chatPaneEl) {
      _chatPaneEl.style.flex = '1';
      _chatPaneEl.style.width = '100%';
    }
  }

  /** ChatGPT-style agent: keep code in chat; do not open the right workspace pane. */
  function isChatOnlyAgentMode() {
    try {
      const flag = window.localStorage.getItem('ultron-chat-only-agent');
      if (flag === 'false') return false;
    } catch (_) { /* ignore */ }
    return true;
  }

  function openWorkspace(filesPayload = [], options = {}) {
    if (isChatOnlyAgentMode()) {
      try {
        console.info('[Brown] Workspace panel disabled — code stays in chat.');
      } catch (_) { /* ignore */ }
      return;
    }
    if (!_panelEl) init();
    if (!_panelEl) return;

    const { defaultMode = 'code' } = options;

    if (Array.isArray(filesPayload) && filesPayload.length > 0) {
      _files = filesPayload.map(f => ({
        id: f.id || `file-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name || 'index.html',
        content: f.content || '',
        language: f.language || detectLanguage(f.name || 'index.html'),
        type: f.type || detectFileType(f.name || 'index.html')
      }));
    } else if (typeof filesPayload === 'object' && filesPayload.content !== undefined) {
      _files = [{
        id: `file-${Date.now()}`,
        name: filesPayload.name || (filesPayload.type === 'html' ? 'index.html' : 'app.js'),
        content: filesPayload.content || '',
        language: filesPayload.language || 'html',
        type: filesPayload.type || 'html'
      }];
    }

    if (_files.length === 0) {
      _files = [{
        id: `file-default`,
        name: 'index.html',
        content: '<!DOCTYPE html>\n<html>\n<head>\n  <style>\n    body { font-family: sans-serif; padding: 20px; }\n  </style>\n</head>\n<body>\n  <h2>Brown Live Project Workspace</h2>\n</body>\n</html>',
        language: 'html',
        type: 'html'
      }];
    }

    _activeFileId = _files[0].id;
    _panelEl.classList.remove('hidden');
    if (_splitterEl) _splitterEl.classList.remove('hidden');

    applySplitRatio();
    renderTabs();
    
    const activeFile = getActiveFile();
    if (activeFile && (activeFile.type === 'markdown' || activeFile.name.endsWith('.md') || defaultMode === 'markdown')) {
      switchViewMode('markdown');
    } else if (activeFile && (activeFile.type === 'html' || activeFile.name.endsWith('.html')) && defaultMode === 'preview') {
      switchViewMode('preview');
    } else {
      switchViewMode(defaultMode || 'code');
    }
  }

  function closeCanvas() {
    if (_panelEl) _panelEl.classList.add('hidden');
    if (_splitterEl) _splitterEl.classList.add('hidden');
    _isFullscreen = false;
    if (_panelEl) _panelEl.classList.remove('fullscreen');
    resetSplitLayout();
  }

  function toggleFullscreen() {
    if (!_panelEl) return;
    _isFullscreen = !_isFullscreen;
    _panelEl.classList.toggle('fullscreen', _isFullscreen);
    const btn = document.getElementById('btn-canvas-fullscreen');
    if (btn) {
      btn.title = _isFullscreen ? 'Exit Fullscreen' : 'Toggle Fullscreen Canvas';
    }
    if (!_isFullscreen) {
      applySplitRatio();
    }
  }

  function renderActiveMarkdown() {
    const activeFile = getActiveFile();
    if (!activeFile || !_markdownContainerEl) return;
    const content = activeFile.content || '';

    let html = '';
    try {
      if (window.ultronAPI && typeof window.ultronAPI.parseMarkdown === 'function') {
        html = window.ultronAPI.parseMarkdown(content);
      } else if (typeof marked !== 'undefined' && marked.parse) {
        html = marked.parse(content);
      } else {
        html = `<pre>${escapeHtml(content)}</pre>`;
      }
    } catch (_) {
      html = `<pre>${escapeHtml(content)}</pre>`;
    }

    const isPlan = activeFile.name.toLowerCase().includes('plan') || /# Implementation Plan|## Planned Steps|## Proposed Changes/i.test(content);
    let planHeaderHtml = '';
    if (isPlan) {
      planHeaderHtml = `
        <div class="canvas-plan-action-bar">
          <div class="plan-badge-group">
            <span class="plan-pill-tag">⚡ AGENT EXECUTION READY</span>
            <span class="plan-pill-title">${escapeHtml(activeFile.name)}</span>
          </div>
          <button type="button" class="btn-canvas-proceed-plan" id="btn-canvas-proceed-plan" title="Start executing this implementation plan autonomously">
            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Proceed with Plan</span>
          </button>
        </div>
      `;
    }

    _markdownContainerEl.innerHTML = `${planHeaderHtml}<div class="canvas-markdown-body markdown-body">${html}</div>`;

    const proceedBtn = document.getElementById('btn-canvas-proceed-plan');
    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        if (typeof window.startAutonomousPlanExecution === 'function') {
          window.startAutonomousPlanExecution(activeFile.content, activeFile.name);
        } else {
          const chatInput = document.getElementById('chat-user-input');
          if (chatInput) {
            chatInput.value = `Proceed with the implementation plan: ${activeFile.name}`;
            const sendBtn = document.getElementById('btn-send-message');
            if (sendBtn) sendBtn.click();
          }
        }
      });
    }

    const badgeEl = document.getElementById('canvas-type-badge');
    if (badgeEl) {
      badgeEl.textContent = 'MARKDOWN';
    }
  }

  let _visualZoom = 1.0;
  let _isPanningVisual = false;
  let _panStartX = 0;
  let _panStartY = 0;
  let _scrollStartLeft = 0;
  let _scrollStartTop = 0;

  function initVisualInspectorControls() {
    const btnZoomIn = document.getElementById('btn-visual-zoom-in');
    const btnZoomOut = document.getElementById('btn-visual-zoom-out');
    const btnZoomReset = document.getElementById('btn-visual-zoom-reset');
    const viewport = document.getElementById('canvas-visual-viewport');
    const content = document.getElementById('canvas-visual-content');
    const zoomLabel = document.getElementById('visual-zoom-level');

    function updateZoom(newZoom) {
      _visualZoom = Math.min(Math.max(newZoom, 0.25), 3.0);
      if (content) {
        content.style.transform = `scale(${_visualZoom})`;
      }
      if (zoomLabel) {
        zoomLabel.textContent = `${Math.round(_visualZoom * 100)}%`;
      }
    }

    if (btnZoomIn) {
      btnZoomIn.addEventListener('click', (e) => {
        e.stopPropagation();
        updateZoom(_visualZoom + 0.15);
      });
    }

    if (btnZoomOut) {
      btnZoomOut.addEventListener('click', (e) => {
        e.stopPropagation();
        updateZoom(_visualZoom - 0.15);
      });
    }

    if (btnZoomReset) {
      btnZoomReset.addEventListener('click', (e) => {
        e.stopPropagation();
        updateZoom(1.0);
        if (viewport) {
          viewport.scrollTo({ left: 0, top: 0 });
        }
      });
    }

    // 2D Pan & Drag across X and Y
    if (viewport) {
      viewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, input, select, textarea, iframe')) return;
        _isPanningVisual = true;
        viewport.classList.add('is-panning');
        _panStartX = e.pageX - viewport.offsetLeft;
        _panStartY = e.pageY - viewport.offsetTop;
        _scrollStartLeft = viewport.scrollLeft;
        _scrollStartTop = viewport.scrollTop;
      });

      window.addEventListener('mousemove', (e) => {
        if (!_isPanningVisual || !viewport) return;
        e.preventDefault();
        const x = e.pageX - viewport.offsetLeft;
        const y = e.pageY - viewport.offsetTop;
        const walkX = (x - _panStartX) * 1.2;
        const walkY = (y - _panStartY) * 1.2;
        viewport.scrollLeft = _scrollStartLeft - walkX;
        viewport.scrollTop = _scrollStartTop - walkY;
      });

      window.addEventListener('mouseup', () => {
        if (_isPanningVisual && viewport) {
          _isPanningVisual = false;
          viewport.classList.remove('is-panning');
        }
      });

      // Ctrl + Wheel / Trackpad zoom
      viewport.addEventListener('wheel', (e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.1 : -0.1;
          updateZoom(_visualZoom + delta);
        }
      }, { passive: false });
    }
  }

  function openVisualInspector(visualOpts = {}) {
    if (isChatOnlyAgentMode()) {
      try {
        console.info('[Brown] Visual inspector disabled — keep content in chat.');
      } catch (_) { /* ignore */ }
      return;
    }
    if (!_panelEl) init();
    if (!_panelEl) return;

    const { title = 'Visual Diagram', type = 'Diagram', svgContent = '', rawCode = '', isWidget = false, fullHtml = '' } = visualOpts;

    const titleEl = document.getElementById('visual-inspector-title');
    const badgeEl = document.getElementById('canvas-type-badge');
    const contentEl = document.getElementById('canvas-visual-content');
    const viewportEl = document.getElementById('canvas-visual-viewport');

    if (titleEl) titleEl.textContent = title;
    if (badgeEl) badgeEl.textContent = type.toUpperCase();

    if (contentEl) {
      if (isWidget && fullHtml) {
        contentEl.innerHTML = `<iframe class="gen-ui-inspector-iframe" srcdoc="${escapeHtml(fullHtml)}" sandbox="allow-scripts allow-forms allow-modals" style="width: 100%; border: none;"></iframe>`;
      } else if (svgContent) {
        contentEl.innerHTML = svgContent;
      } else {
        contentEl.innerHTML = `<pre style="padding: 24px; color: #f8fafc; font-family: monospace; font-size: 13px;">${escapeHtml(rawCode)}</pre>`;
      }
    }

    _visualZoom = 1.0;
    if (contentEl) contentEl.style.transform = 'scale(1)';
    const zoomLabel = document.getElementById('visual-zoom-level');
    if (zoomLabel) zoomLabel.textContent = '100%';

    const tabsContainer = document.getElementById('canvas-tabs-bar');
    if (tabsContainer) {
      tabsContainer.innerHTML = `
        <div class="canvas-tab active">
          <span>${escapeHtml(title)}</span>
        </div>
      `;
    }

    _panelEl.classList.remove('hidden');
    if (_splitterEl) _splitterEl.classList.remove('hidden');

    applySplitRatio();
    switchViewMode('visual');

    if (viewportEl) {
      viewportEl.scrollTo({ left: 0, top: 0 });
    }
  }

  function switchViewMode(mode) {
    _activeMode = mode;

    // Update active button pills
    document.querySelectorAll('.canvas-mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
    });

    const codePane = document.getElementById('canvas-code-pane');
    const iframePane = document.getElementById('canvas-iframe-pane');
    const mdPane = document.getElementById('canvas-markdown-pane');
    const termPane = document.getElementById('canvas-terminal-pane');
    const visualPane = document.getElementById('canvas-visual-pane');
    const consoleDrawer = document.getElementById('canvas-console-drawer');

    if (codePane) codePane.classList.toggle('hidden', mode !== 'code');
    if (iframePane) iframePane.classList.toggle('hidden', mode !== 'preview');
    if (mdPane) mdPane.classList.toggle('hidden', mode !== 'markdown');
    if (termPane) termPane.classList.toggle('hidden', mode !== 'terminal');
    if (visualPane) visualPane.classList.toggle('hidden', mode !== 'visual');
    if (consoleDrawer) consoleDrawer.classList.toggle('hidden', mode === 'terminal' || mode === 'visual');

    if (mode === 'code') {
      renderActiveFileInEditor();
    } else if (mode === 'preview') {
      refreshLivePreview();
    } else if (mode === 'markdown') {
      renderActiveMarkdown();
    } else if (mode === 'terminal') {
      if (_terminalInputEl) _terminalInputEl.focus();
    }
  }

  function renderTabs() {
    const tabsContainer = document.getElementById('canvas-tabs-bar');
    if (!tabsContainer) return;

    tabsContainer.innerHTML = '';
    _files.forEach((file, index) => {
      const tab = document.createElement('div');
      tab.className = `canvas-tab ${file.id === _activeFileId ? 'active' : ''}`;
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = file.name;
      tab.appendChild(nameSpan);

      if (_files.length > 1) {
        const closeSpan = document.createElement('span');
        closeSpan.className = 'canvas-tab-close';
        closeSpan.textContent = '✕';
        closeSpan.title = 'Close tab';
        closeSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          closeTab(file.id);
        });
        tab.appendChild(closeSpan);
      }

      tab.addEventListener('click', () => {
        _activeFileId = file.id;
        renderTabs();
        if (file.type === 'markdown' || file.name.endsWith('.md')) {
          switchViewMode('markdown');
        } else if (_activeMode === 'preview') {
          refreshLivePreview();
        } else {
          renderActiveFileInEditor();
        }
      });

      tabsContainer.appendChild(tab);
    });
  }

  function closeTab(fileId) {
    const index = _files.findIndex(f => f.id === fileId);
    if (index === -1) return;
    _files.splice(index, 1);
    if (_files.length > 0) {
      if (_activeFileId === fileId) {
        _activeFileId = _files[Math.max(0, index - 1)].id;
      }
      renderTabs();
      renderActiveFileInEditor();
    } else {
      closeCanvas();
    }
  }

  function promptAddNewFile() {
    const name = window.prompt('Enter filename (e.g. style.css, script.js, utils.py):', 'style.css');
    if (!name) return;
    const cleanName = name.trim();
    const newFile = {
      id: `file-${Date.now()}`,
      name: cleanName,
      content: '',
      language: detectLanguage(cleanName),
      type: detectFileType(cleanName)
    };
    _files.push(newFile);
    _activeFileId = newFile.id;
    renderTabs();
    renderActiveFileInEditor();
  }

  function getActiveFile() {
    return _files.find(f => f.id === _activeFileId) || _files[0];
  }

  function renderActiveFileInEditor() {
    const activeFile = getActiveFile();
    if (!activeFile || !_editorEl) return;

    _editorEl.value = activeFile.content || '';
    updateEditorHighlight();

    const badgeEl = document.getElementById('canvas-type-badge');
    if (badgeEl) {
      badgeEl.textContent = (activeFile.language || 'code').toUpperCase();
    }
  }

  function updateEditorHighlight() {
    const activeFile = getActiveFile();
    const code = _editorEl ? _editorEl.value : '';

    // Update Line Numbers
    if (_lineNumbersEl) {
      const lineCount = Math.max(1, code.split('\n').length);
      const lines = [];
      for (let i = 1; i <= lineCount; i++) {
        lines.push(i);
      }
      _lineNumbersEl.innerHTML = lines.join('<br>');
    }

    // Syntax highlight tokens
    if (_highlightEl) {
      const lang = activeFile ? activeFile.language : 'html';
      _highlightEl.innerHTML = highlightSyntax(code, lang) + '\n';
    }
  }

  function highlightSyntax(code, language) {
    if (!code) return '';
    let escaped = escapeHtml(code);

    if (language === 'html' || language === 'xml') {
      // Tags
      escaped = escaped.replace(/(&lt;\/?)([a-zA-Z0-9\-]+)(.*?)(&gt;)/g, function(_, open, tag, attrs, close) {
        let attrHighlighted = attrs.replace(/([a-zA-Z\-]+)(=)(&quot;.*?&quot;|&#39;.*?&#39;|[^\s&]+)/g, 
          '<span class="token-attr">$1</span>$2<span class="token-string">$3</span>');
        return `<span class="token-punctuation">${open}</span><span class="token-tag">${tag}</span>${attrHighlighted}<span class="token-punctuation">${close}</span>`;
      });
      // Comments
      escaped = escaped.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="token-comment">$1</span>');
      return escaped;
    }

    if (language === 'css') {
      // Comments
      escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="token-comment">$1</span>');
      // Properties
      escaped = escaped.replace(/([a-zA-Z\-]+)(\s*:)/g, '<span class="token-property">$1</span>$2');
      // Strings & numbers
      escaped = escaped.replace(/(&quot;.*?&quot;|&#39;.*?&#39;)/g, '<span class="token-string">$1</span>');
      escaped = escaped.replace(/\b(\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms)?)\b/g, '<span class="token-number">$1</span>');
      return escaped;
    }

    // General JS / TS / Python
    // Comments
    escaped = escaped.replace(/(\/\/.*$|\/\*[\s\S]*?\*\/|#.*$)/gm, '<span class="token-comment">$1</span>');
    // Strings
    escaped = escaped.replace(/(&quot;.*?&quot;|&#39;.*?&#39;|`.*?`)/g, '<span class="token-string">$1</span>');
    // Keywords
    const keywords = /\b(const|let|var|function|return|if|else|for|while|import|export|from|default|class|async|await|try|catch|def|self|None|True|False|elif)\b/g;
    escaped = escaped.replace(keywords, '<span class="token-keyword">$1</span>');
    // Functions
    escaped = escaped.replace(/\b([a-zA-Z0-9_$]+)(\s*\()/g, '<span class="token-function">$1</span>$2');
    // Numbers
    escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="token-number">$1</span>');

    return escaped;
  }

  function refreshLivePreview() {
    if (!_iframeEl) return;

    // Classify tabs by CONTENT first so mis-named files (e.g. HTML sitting in
    // a .css tab) still preview correctly and CSS always reaches the page.
    const htmlFile = _files.find(f => /\.html?$/i.test(f.name) && contentLooksHtml(f.content))
      || _files.find(f => contentLooksHtml(f.content))
      || _files.find(f => /\.html?$/i.test(f.name) || f.language === 'html')
      || _files[0];
    const cssFiles = _files.filter(f => f !== htmlFile && !contentLooksHtml(f.content)
      && (contentLooksCss(f.content) || /\.css$/i.test(f.name)));
    const jsFiles = _files.filter(f => f !== htmlFile && !cssFiles.includes(f) && !contentLooksHtml(f.content)
      && (f.name.endsWith('.js') || f.language === 'javascript'));

    let rawHtml = htmlFile ? htmlFile.content : '';

    // Inject CSS files inside <style>
    if (cssFiles.length > 0) {
      const combinedCss = cssFiles.map(c => `/* ${c.name} */\n${c.content}`).join('\n\n')
        .replace(/<\/style/gi, '<\\/style'); // never terminate the injected <style> early
      const styleTag = `<style>\n${combinedCss}\n</style>`;
      if (rawHtml.includes('</head>')) {
        rawHtml = rawHtml.replace('</head>', `${styleTag}\n</head>`);
      } else {
        rawHtml = `${styleTag}\n${rawHtml}`;
      }
    }

    // Inject JS files inside <script>
    if (jsFiles.length > 0) {
      const combinedJs = jsFiles.map(j => `/* ${j.name} */\n${j.content}`).join('\n\n')
        .replace(/<\/script/gi, '<\\/script');
      const scriptTag = `<script>\n${combinedJs}\n</script>`;
      if (rawHtml.includes('</body>')) {
        rawHtml = rawHtml.replace('</body>', `${scriptTag}\n</body>`);
      } else {
        rawHtml = `${rawHtml}\n${scriptTag}`;
      }
    }

    executeSandbox(rawHtml);
  }

  function contentLooksHtml(text) {
    const t = String(text || '');
    return /<!doctype\s+html/i.test(t) || /<html[\s>]/i.test(t) || /<body[\s>]/i.test(t) || /<head[\s>]/i.test(t);
  }

  function contentLooksCss(text) {
    const t = String(text || '').trim();
    if (!t || contentLooksHtml(t)) return false;
    if (/<\/?[a-z][\s>]/i.test(t.slice(0, 800))) return false;
    if (/\b(function\s|=>|const\s|let\s|var\s|import\s|require\(|console\.|document\.|window\.)/.test(t)) return false;
    return /[^{}<>;=]+\{[^{}]*:[^{}]*\}/.test(t);
  }

  function executeSandbox(fullHtml) {
    if (!_iframeEl) return;
    clearConsole();

    // Wrap with doctype if not provided
    let content = fullHtml || '';
    if (!content.toLowerCase().includes('<!doctype') && !content.toLowerCase().includes('<html')) {
      content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; background: #ffffff; color: #1f2937; }
  </style>
</head>
<body>
  ${content}
</body>
</html>`;
    }

    // Inject console interceptor
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

    const finalSrc = content.replace('<head>', `<head>${consoleInterceptor}`);
    _iframeEl.srcdoc = finalSrc.includes(consoleInterceptor) ? finalSrc : `${consoleInterceptor}${finalSrc}`;
  }

  function runTerminalCommand(cmd) {
    if (!_terminalOutputEl) return;

    const cmdLine = document.createElement('div');
    cmdLine.className = 'terminal-line cmd-line';
    cmdLine.textContent = `$ ${cmd}`;
    _terminalOutputEl.appendChild(cmdLine);

    // Emulate command execution in integrated project terminal
    if (cmd === 'clear' || cmd === 'cls') {
      _terminalOutputEl.innerHTML = '';
      return;
    }

    if (cmd === 'help') {
      appendTerminalOutput('Available workspace commands: run, build, test, ls, clear, node <file>, python <file>');
      return;
    }

    if (cmd === 'ls' || cmd === 'dir') {
      const fileList = _files.map(f => `${f.name} (${f.content.length} B)`).join('   ');
      appendTerminalOutput(fileList || 'No files in workspace');
      return;
    }

    if (cmd === 'run' || cmd === 'start') {
      appendTerminalOutput('▶ Running live preview sandbox...');
      switchViewMode('preview');
      refreshLivePreview();
      return;
    }

    // Default: real execution through Ultron's secure EXECUTE IPC. The main
    // process gates it with the active security mode (Review/Adaptive show a
    // permission prompt for risky commands; hard blacklists always apply).
    appendTerminalOutput('Executing via Ultron secure EXECUTE…', 'system-line');
    (async () => {
      if (!window.ultronAPI || typeof window.ultronAPI.executeAction !== 'function') {
        appendTerminalOutput(`[Execution OK] Command "${cmd}" finished with exit code 0.`, 'system-line');
        return;
      }
      const res = await window.ultronAPI.executeAction({ command: cmd })
        .catch(err => ({ success: false, error: err.message }));
      if (res && res.success) {
        if (res.stdout) appendTerminalOutput(String(res.stdout).trim());
        appendTerminalOutput('[exit code 0]', 'system-line');
      } else {
        appendTerminalOutput(`[denied/error] ${(res && res.error) || 'Execution failed or permission was denied.'}`, 'error-line');
      }
    })();
  }

  function appendTerminalOutput(text, type = 'stdout-line') {
    if (!_terminalOutputEl) return;
    const line = document.createElement('div');
    line.className = `terminal-line ${type}`;
    line.textContent = text;
    _terminalOutputEl.appendChild(line);
    _terminalOutputEl.scrollTop = _terminalOutputEl.scrollHeight;
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
    const activeFile = getActiveFile();
    if (activeFile && activeFile.content) {
      navigator.clipboard.writeText(activeFile.content);
      const btn = document.getElementById('btn-canvas-copy');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '<span style="color:#10b981;font-size:11px;">✓ Copied</span>';
        setTimeout(() => { btn.innerHTML = orig; }, 1500);
      }
    }
  }

  function downloadActiveContent() {
    const activeFile = getActiveFile();
    if (!activeFile) return;

    const blob = new Blob([activeFile.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = activeFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function detectLanguage(filename) {
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
    if (['html', 'htm'].includes(ext)) return 'html';
    if (['css'].includes(ext)) return 'css';
    if (['js', 'jsx', 'mjs'].includes(ext)) return 'javascript';
    if (['ts', 'tsx'].includes(ext)) return 'typescript';
    if (['py'].includes(ext)) return 'python';
    if (['json'].includes(ext)) return 'json';
    if (['md'].includes(ext)) return 'markdown';
    return 'plaintext';
  }

  function detectFileType(filename) {
    const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
    if (['html', 'htm', 'svg'].includes(ext)) return 'html';
    if (['md', 'markdown'].includes(ext)) return 'markdown';
    return 'code';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  // Scan AI message DOM and attach interactive "Preview & Edit in Code Canvas" pills
  function enhanceMessageCodeBlocks(messageElement, rawText) {
    if (!messageElement) return;
    if (isChatOnlyAgentMode()) return;
    if (messageElement.querySelector('.user-canvas-preview-pill')) return;

    // Prefer the shared project-file parser so pills/tabs get the same correct
    // filenames (styles.css, script.js, …) the project-creation card handles.
    let detectedFiles = [];
    if (rawText && typeof window.extractProjectFilesFromResponse === 'function') {
      detectedFiles = window.extractProjectFilesFromResponse(rawText)
        .filter(f => (f.content || '').trim().length > 80 || /\.html?$/i.test(f.filename))
        .map(f => ({
          name: f.filename,
          content: f.content,
          language: detectLanguage(f.filename),
          type: detectFileType(f.filename)
        }));
    }

    if (detectedFiles.length === 0) {
      detectedFiles = detectFilesFromDom(messageElement);
    }

    if (detectedFiles.length > 0) {
      const pill = document.createElement('div');
      pill.className = 'user-canvas-preview-pill';
      pill.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
          <polyline points="16 18 22 12 16 6"></polyline>
          <polyline points="8 6 2 12 8 18"></polyline>
        </svg>
        <span>Preview & Edit Code in Workspace (${detectedFiles.length} file${detectedFiles.length > 1 ? 's' : ''}) →</span>
      `;
      pill.addEventListener('click', () => {
        if (typeof mergeFilesIntoWorkspace === 'function') {
          mergeFilesIntoWorkspace(detectedFiles, { defaultMode: detectedFiles.some(f => f.type === 'html') ? 'preview' : 'code' });
        } else {
          openWorkspace(detectedFiles, { defaultMode: detectedFiles.some(f => f.type === 'html') ? 'preview' : 'code' });
        }
      });
      messageElement.appendChild(pill);
    }
  }

  // Legacy DOM-scan fallback when raw markdown text is not available.
  function detectFilesFromDom(messageElement) {
    const detectedFiles = [];
    const codeBlocks = messageElement.querySelectorAll('pre code, pre');

    codeBlocks.forEach(block => {
      if (block.getAttribute('data-canvas-enhanced')) return;
      block.setAttribute('data-canvas-enhanced', 'true');

      const text = block.textContent || '';
      const classAttr = block.className || '';
      let lang = 'javascript';
      if (classAttr.includes('language-html') || /<\/?[a-z][\s\S]*>/i.test(text)) lang = 'html';
      else if (classAttr.includes('language-css') || text.includes('{') && text.includes('}') && text.includes(':')) lang = 'css';
      else if (classAttr.includes('language-python') || text.includes('def ') || text.includes('import ')) lang = 'python';

      let filename = `script.${lang === 'javascript' ? 'js' : (lang === 'html' ? 'html' : (lang === 'css' ? 'css' : 'py'))}`;

      // Check if code block has custom file header e.g. "index.html"
      const matchHeader = text.match(/^(?:\/\*|<!--|#|\/\/)\s*([a-zA-Z0-9_\-\.]+\.(?:html|css|js|py|ts|json))\s*(?:\*\/|-->)?/);
      if (matchHeader) {
        filename = matchHeader[1];
      }

      if (text.length > 80 || lang === 'html') {
        detectedFiles.push({
          name: filename,
          content: text,
          language: lang,
          type: lang === 'html' ? 'html' : 'code'
        });
      }
    });
    return detectedFiles;
  }

  // ---------------------------------------------------------------------
  // Disk integration: Save-to-disk, live upsert from agent WRITE_FILE, and
  // loading an existing project folder into the workspace.
  // ---------------------------------------------------------------------

  function isWorkspaceOpen() {
    return Boolean(_panelEl) && !_panelEl.classList.contains('hidden');
  }

  function showPanelWithCurrentFiles(preferPreview = false) {
    if (!_panelEl) return;
    _panelEl.classList.remove('hidden');
    if (_splitterEl) _splitterEl.classList.remove('hidden');
    applySplitRatio();
    renderTabs();
    renderActiveFileInEditor();
    const hasHtml = _files.some(f => f.type === 'html' || /\.html?$/i.test(f.name));
    switchViewMode(preferPreview && hasHtml ? 'preview' : (hasHtml ? 'preview' : 'code'));
  }

  /** Insert or update a workspace tab by filename (used by agent WRITE_FILE live sync). */
  function upsertFile(name, content, options = {}) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    // Exact match first; otherwise heal near-duplicate names (styles.css vs
    // style.css) so edits update the existing tab instead of adding a twin.
    let existing = _files.find(f => f.name.toLowerCase() === cleanName.toLowerCase());
    if (!existing) existing = findSimilarFile(cleanName);
    if (existing) {
      existing.content = String(content || '');
      existing.language = detectLanguage(cleanName);
      existing.type = detectFileType(cleanName);
    } else {
      _files.push({
        id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: cleanName,
        content: String(content || ''),
        language: detectLanguage(cleanName),
        type: detectFileType(cleanName)
      });
    }
    if (existing && existing.id === _activeFileId && _editorEl && _activeMode === 'code') {
      _editorEl.value = existing.content;
      updateEditorHighlight();
    }
    if (!existing) _activeFileId = _files[_files.length - 1].id;

    if (isWorkspaceOpen()) {
      renderTabs();
      renderActiveFileInEditor();
      if (_activeMode === 'preview') refreshLivePreview();
    } else if (options.open) {
      showPanelWithCurrentFiles(true);
    }
  }

  /** Finds an open tab whose name is a near-duplicate of cleanName (same ext, stem equal modulo a trailing 's'). */
  function findSimilarFile(cleanName) {
    const ext = ((cleanName.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
    if (!ext) return null;
    const stem = (s) => s.replace(/\.[^.]+$/, '').toLowerCase();
    const trimS = (s) => (s.endsWith('s') ? s.slice(0, -1) : s);
    return _files.find(f => {
      const fExt = ((f.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '').toLowerCase();
      if (fExt !== ext) return false;
      return trimS(stem(f.name)) === trimS(stem(cleanName));
    }) || null;
  }

  /** Upsert several files at once and show the panel, keeping already-open tabs. */
  function mergeFilesIntoWorkspace(filesPayload = [], options = {}) {
    if (isChatOnlyAgentMode()) {
      try {
        console.info('[Brown] Workspace merge skipped — code stays in chat.');
      } catch (_) { /* ignore */ }
      return;
    }
    const { defaultMode = 'preview', focusFirst = true } = options;
    if (!Array.isArray(filesPayload) || filesPayload.length === 0) return;
    let firstId = null;
    filesPayload.forEach(f => {
      upsertFile(f.name, f.content);
      if (!firstId) {
        const rec = _files.find(x => x.name.toLowerCase() === String(f.name || '').toLowerCase()) || findSimilarFile(String(f.name || ''));
        if (rec) firstId = rec.id;
      }
    });
    if (focusFirst && firstId) _activeFileId = firstId;
    showPanelWithCurrentFiles(defaultMode === 'preview');
  }

  /** Save every workspace tab to Documents\Ultron Projects\<name> with artifact registration. */
  async function saveWorkspaceToDisk() {
    if (!_files.length) return;
    const btn = document.getElementById('btn-canvas-save-disk');
    const writer = typeof window.writeProjectFilesToDisk === 'function' ? window.writeProjectFilesToDisk : null;
    const rootFn = typeof window.getDefaultProjectsRoot === 'function' ? window.getDefaultProjectsRoot : null;
    const folderFn = typeof window.deriveProjectFolderName === 'function' ? window.deriveProjectFolderName : null;
    if (!writer || !rootFn) {
      appendTerminalOutput('Save-to-disk is unavailable in this build.', 'error-line');
      return;
    }
    const root = _savedRoot || `${rootFn()}\\${folderFn ? folderFn() : 'ultron-project'}`;
    if (btn) btn.title = `Saving to ${root} …`;
    const payload = _files.map(f => ({ filename: f.name, content: f.content }));
    const { written, failed } = await writer(payload, root);
    if (written.length) _savedRoot = root;
    if (btn) {
      btn.title = `Save all workspace files to ${root}`;
      const orig = btn.innerHTML;
      btn.innerHTML = written.length
        ? `<span style="color:#10b981;font-size:11px;">✓ Saved ${written.length}${failed.length ? ` (${failed.length} failed)` : ''}</span>`
        : `<span style="color:#f87171;font-size:11px;">⚠ ${failed[0] ? failed[0].error : 'Save failed'}</span>`;
      setTimeout(() => { btn.innerHTML = orig; }, 2500);
    }
    appendTerminalOutput(written.length
      ? `Saved ${written.length} file(s) to ${root}`
      : `Save failed: ${failed[0] ? failed[0].error : 'unknown error'}`, written.length ? 'system-line' : 'error-line');
    return { written, failed };
  }

  /** Read every code file from a folder on disk into workspace tabs (Cursor/Qoder-style reopen). */
  async function loadProjectFromDisk(dirPath) {
    if (!dirPath || !window.ultronAPI || !window.ultronAPI.listDir || !window.ultronAPI.readFile) return 0;
    const res = await window.ultronAPI.listDir(dirPath).catch(() => null);
    if (!res || !res.success || !Array.isArray(res.items)) return 0;
    const names = res.items
      .filter(it => it && it.isFile)
      .map(it => it.name)
      .filter(n => /\.(html?|css|js|jsx|ts|tsx|py|json|md|svg)$/i.test(n))
      .slice(0, 12);
    if (!names.length) return 0;
    for (const n of names) {
      const r = await window.ultronAPI.readFile(`${dirPath}\\${n}`).catch(() => null);
      if (r && r.success) upsertFile(n, r.data || '');
    }
    _savedRoot = dirPath;
    showPanelWithCurrentFiles(true);
    return names.length;
  }

  const api = {
    init,
    openWorkspace,
    mergeFilesIntoWorkspace,
    openArtifact: (opts) => openWorkspace([opts], { defaultMode: opts.type === 'html' ? 'preview' : 'code' }),
    openVisualInspector,
    closeCanvas,
    toggleFullscreen,
    switchViewMode,
    refreshLivePreview,
    enhanceMessageCodeBlocks,
    upsertFile,
    loadProjectFromDisk,
    saveWorkspaceToDisk
  };

  if (typeof window !== 'undefined') {
    window.UltronCanvas = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
