/**
 * Ultron Smart AI Clipboard Manager
 * Local clipboard history tracker with semantic AI transforms (Alt+V).
 */
(function () {
  'use strict';

  const MAX_HISTORY = 30;
  const STORAGE_KEY = 'ultron-clipboard-history';
  let _history = [];
  let _lastCopiedText = '';
  let _modalEl = null;

  function loadHistory() {
    try {
      const data = window.localStorage.getItem(STORAGE_KEY);
      if (data) _history = JSON.parse(data);
    } catch {}
    if (!Array.isArray(_history)) _history = [];
  }

  function saveHistory() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(_history.slice(0, MAX_HISTORY)));
    } catch {}
  }

  function pushItem(text) {
    if (!text || typeof text !== 'string') return;
    const clean = text.trim();
    if (!clean || clean.length < 2) return;
    if (clean === _lastCopiedText) return;

    _lastCopiedText = clean;
    // Remove duplicate if already exists
    _history = _history.filter(item => item.text !== clean);
    _history.unshift({
      id: `clip-${Date.now()}`,
      text: clean,
      preview: clean.slice(0, 120),
      timestamp: Date.now(),
      charCount: clean.length,
      lines: clean.split('\n').length
    });
    if (_history.length > MAX_HISTORY) _history = _history.slice(0, MAX_HISTORY);
    saveHistory();
    renderHistoryList();
  }

  function init() {
    loadHistory();

    // Check clipboard on window focus
    window.addEventListener('focus', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          pushItem(text);
        }
      } catch {}
    });

    // Listen for global Alt+V hotkey
    window.addEventListener('keydown', (e) => {
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        toggleModal();
      }
    });

    _modalEl = document.getElementById('clipboard-manager-modal');
    const btnClose = document.getElementById('btn-clipboard-close');
    const btnClear = document.getElementById('btn-clipboard-clear');

    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnClear) {
      btnClear.addEventListener('click', () => {
        _history = [];
        saveHistory();
        renderHistoryList();
      });
    }

    const searchInput = document.getElementById('clipboard-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderHistoryList(e.target.value);
      });
    }
  }

  function toggleModal() {
    if (!_modalEl) _modalEl = document.getElementById('clipboard-manager-modal');
    if (!_modalEl) return;
    const isHidden = _modalEl.classList.contains('hidden');
    if (isHidden) {
      openModal();
    } else {
      closeModal();
    }
  }

  function openModal() {
    if (!_modalEl) _modalEl = document.getElementById('clipboard-manager-modal');
    if (!_modalEl) return;
    _modalEl.classList.remove('hidden');
    renderHistoryList();
    const searchInput = document.getElementById('clipboard-search-input');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  }

  function closeModal() {
    if (_modalEl) _modalEl.classList.add('hidden');
  }

  function renderHistoryList(filterQuery = '') {
    const listEl = document.getElementById('clipboard-history-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const query = (filterQuery || '').toLowerCase().trim();
    const filtered = query
      ? _history.filter(h => h.text.toLowerCase().includes(query))
      : _history;

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 24px; text-align: center; color: #6b7280; font-size: 13px;">
          ${query ? 'No matching clipboard items found.' : 'Clipboard history is empty. Copy text to see it here.'}
        </div>
      `;
      return;
    }

    filtered.forEach(item => {
      const card = document.createElement('div');
      card.className = 'clipboard-item-card';
      const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      card.innerHTML = `
        <div class="clipboard-item-header">
          <span class="clipboard-item-meta">${item.charCount} chars • ${item.lines} lines • ${timeStr}</span>
          <div class="clipboard-item-actions">
            <button type="button" class="btn-clip-action btn-clip-copy" title="Copy to clipboard">📋 Copy</button>
            <button type="button" class="btn-clip-action btn-clip-paste" title="Insert into chat">💬 Insert</button>
          </div>
        </div>
        <div class="clipboard-item-text">${escapeHtml(item.preview)}${item.text.length > 120 ? '...' : ''}</div>
        <div class="clipboard-item-transforms">
          <span class="clip-transform-label">AI Actions:</span>
          <button type="button" class="btn-clip-transform" data-action="summarize">Summarize</button>
          <button type="button" class="btn-clip-transform" data-action="typescript">Convert to TS</button>
          <button type="button" class="btn-clip-transform" data-action="json">Format JSON</button>
          <button type="button" class="btn-clip-transform" data-action="grammar">Fix Grammar</button>
          <button type="button" class="btn-clip-transform" data-action="explain">Explain</button>
        </div>
      `;

      // Copy action
      const btnCopy = card.querySelector('.btn-clip-copy');
      btnCopy.addEventListener('click', (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(item.text);
        btnCopy.textContent = '✓ Copied';
        setTimeout(() => { btnCopy.textContent = '📋 Copy'; }, 1500);
      });

      // Insert action
      const btnInsert = card.querySelector('.btn-clip-paste');
      btnInsert.addEventListener('click', (e) => {
        e.stopPropagation();
        insertTextIntoPrompt(item.text);
        closeModal();
      });

      // AI Transforms
      const transformBtns = card.querySelectorAll('.btn-clip-transform');
      transformBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const act = btn.getAttribute('data-action');
          runClipboardTransform(act, item.text);
          closeModal();
        });
      });

      listEl.appendChild(card);
    });
  }

  function insertTextIntoPrompt(text) {
    const promptInput = document.getElementById('chat-input') || document.querySelector('.chat-input');
    if (promptInput) {
      promptInput.value = (promptInput.value ? `${promptInput.value}\n\n` : '') + text;
      promptInput.focus();
    }
  }

  function runClipboardTransform(action, text) {
    let promptPrefix = '';
    switch (action) {
      case 'summarize':
        promptPrefix = 'Please summarize the following clipboard content concisely:\n\n';
        break;
      case 'typescript':
        promptPrefix = 'Convert this JSON / JavaScript data into clean, strongly-typed TypeScript interfaces:\n\n';
        break;
      case 'json':
        promptPrefix = 'Format and validate this JSON data with clean indentation:\n\n';
        break;
      case 'grammar':
        promptPrefix = 'Fix grammar, improve tone, and polish this text:\n\n';
        break;
      case 'explain':
        promptPrefix = 'Explain this code / technical text in detail:\n\n';
        break;
      default:
        promptPrefix = 'Analyze this content:\n\n';
    }

    const fullPrompt = `${promptPrefix}\`\`\`\n${text}\n\`\`\``;
    insertTextIntoPrompt(fullPrompt);

    // If chat submit function exists, auto-submit or focus
    const btnSend = document.getElementById('btn-send');
    if (btnSend) {
      btnSend.click();
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  const api = {
    init,
    pushItem,
    openModal,
    closeModal,
    toggleModal,
    runClipboardTransform
  };

  if (typeof window !== 'undefined') {
    window.UltronClipboardManager = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
