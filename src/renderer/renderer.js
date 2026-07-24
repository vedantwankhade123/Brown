// Cache DOM elements
const chatMessagesContainer = document.getElementById('chat-messages-container');
const chatInput = document.getElementById('chat-input');
const btnSend = document.getElementById('btn-send');
const btnNewSession = document.getElementById('btn-new-session');
const btnNewChat = document.getElementById('nav-new-chat');
const selectSecurityMode = document.getElementById('select-security-mode');

// Stats DOM references
const statRecommendation = document.getElementById('stat-recommendation');
const statRam = document.getElementById('stat-ram');
const statCpu = document.getElementById('stat-cpu');
const statGpu = document.getElementById('stat-gpu');

// Trace & Checklist references
const traceLogsStream = document.getElementById('trace-logs-stream');
const taskChecklistContainer = document.getElementById('task-checklist-container');

// Permission Modal references
const permissionDialog = document.getElementById('permission-dialog');
const permActionCode = document.getElementById('perm-action-code');
const permOverrideInput = document.getElementById('perm-override-input');
const btnPermAccept = document.getElementById('btn-perm-accept');
const btnPermDeny = document.getElementById('btn-perm-deny');

// Settings Panel references
const settingsModal = document.getElementById('settings-modal');
const btnSettings = document.getElementById('btn-settings');
const btnCloseSettings = document.getElementById('btn-close-settings');
const settingDataDir = document.getElementById('setting-data-dir');

// Custom model dropdown elements
const modelSelectorBtn = document.getElementById('model-selector-btn');
const modelSelectorLabel = document.getElementById('model-selector-label');
const modelDropdown = document.getElementById('model-dropdown');
const modelDropdownList = document.getElementById('model-dropdown-list');
const modelSelectorWrapper = document.getElementById('model-selector-wrapper');

// Settings internal references
const settingsDefaultSecurity = document.getElementById('settings-default-security');
const settingsModelsList = document.getElementById('settings-models-list');
const settingsAppsList = document.getElementById('settings-apps-list');
const ollamaStatusBadge = document.getElementById('ollama-status-badge');
const btnInstallOllama = document.getElementById('btn-install-ollama');
const inputDownloadModel = document.getElementById('input-download-model');
const btnDownloadModel = document.getElementById('btn-download-model');
const downloadProgressText = document.getElementById('download-progress-text');

// Chat title & Right sidebar toggle DOM elements
const activeChatTitle = document.getElementById('active-chat-title');
const btnToggleRightSidebarClose = document.getElementById('btn-toggle-right-sidebar-close');
const btnToggleRightSidebarOpen = document.getElementById('btn-toggle-right-sidebar-open');
const rightSidebar = document.getElementById('analytics-sidebar');
const rightSidebarResizer = document.getElementById('right-sidebar-resizer');

// Search elements
const navSearchChats = document.getElementById('nav-search-chats');
const chatSearchOverlay = document.getElementById('chat-search-overlay');
const chatSearchInput = document.getElementById('chat-search-input');
const chatSearchResults = document.getElementById('chat-search-results');
const btnCloseSearch = document.getElementById('btn-close-search');
const searchSpinner = document.getElementById('search-spinner');

let currentPermissionId = null;
let activeSubgoals = [];
let activeModel = "phi4"; // Default model
let currentSessionId = null;
let installedModelsList = [];
let searchTimeout = null;
let isAwaitingResponse = false;

// Local session storage matrix to support natural language keyword scans
let conversationsStore = {};

function saveConversationsToDisk() {
  const memoryEnabled = window.localStorage.getItem('ultron-memory-enabled') !== 'false';
  if (memoryEnabled) {
    window.ultronAPI.saveConversations(JSON.stringify(conversationsStore));
  }
}

function nowIso() {
  return new Date().toISOString();
}

function isThinkingMarkup(text) {
  return typeof text === 'string' && (text.includes('thinking-container') || text.includes('thinking-dot') || text.includes('web-search-status-wrapper') || text.includes('web-search-shimmer-text') || text.includes('step-exec-card'));
}

function isRichResultMarkup(text) {
  return typeof text === 'string' && text.includes('ultron-search-experience');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getWebSearchCardHtml(query) {
  const cleanQ = (query || '').replace(/["']/g, '').trim();
  const truncated = cleanQ.length > 55 ? cleanQ.substring(0, 52) + '...' : cleanQ;
  return `
    <div class="web-search-status-wrapper">
      <svg class="web-search-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
      <span class="web-search-shimmer-text">Searching live web for "${truncated}"...</span>
    </div>
  `;
}

function getStepExecCardHtml(step, type, target) {
  const cleanTarget = (target || '').substring(0, 45);
  return `
    <div class="step-exec-card">
      <div class="step-exec-spinner"></div>
      <span>Step ${step}: ${type} <span class="step-exec-target">(${cleanTarget})</span>...</span>
    </div>
  `;
}

function formatSidebarTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (isToday) {
    return `Today at ${timeStr}`;
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${timeStr}`;
  }
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `${dateStr} at ${timeStr}`;
}

function normalizeConversationStore(store) {
  let changed = false;
  Object.keys(store).forEach((id) => {
    const session = store[id];
    const fallbackTime = new Date(Number(id.replace('session-', '')) || Date.now()).toISOString();

    if (!session.id) {
      session.id = id;
      changed = true;
    }
    if (!session.createdAt) {
      session.createdAt = fallbackTime;
      changed = true;
    }
    if (!session.updatedAt) {
      session.updatedAt = session.createdAt;
      changed = true;
    }
    if (!Array.isArray(session.messages)) {
      session.messages = [];
      changed = true;
    }

    session.messages.forEach((msg) => {
      if (!msg.createdAt) {
        msg.createdAt = session.updatedAt;
        changed = true;
      }
    });
  });
  return changed;
}

function setSendingState(isSending) {
  isAwaitingResponse = isSending;
  if (btnSend) {
    btnSend.disabled = isSending;
    btnSend.setAttribute('aria-disabled', String(isSending));
    btnSend.title = isSending ? 'Waiting for Ultron to finish responding' : 'Send message';
  }
  if (chatInput) {
    if (isSending) {
      chatInput.setAttribute('disabled', 'true');
      chatInput.disabled = true;
    } else {
      chatInput.removeAttribute('disabled');
      chatInput.disabled = false;
      chatInput.style.pointerEvents = 'auto';
      chatInput.style.opacity = '1';
    }
  }
  if (!isSending && chatInput) {
    // Focus back on input when enabled
    setTimeout(() => {
      try {
        chatInput.focus();
      } catch (e) {}
    }, 50);
  }
}

function renderMessageContent(content, text) {
  if (isThinkingMarkup(text)) {
    content.innerHTML = text;
  } else if (isRichResultMarkup(text)) {
    content.innerHTML = text;
  } else {
    content.innerHTML = window.ultronAPI.parseMarkdown(text || '');
  }
}

function highlightSyntax(code, lang) {
  let esc = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const tokens = [];
  const mask = (str, cls) => {
    const idx = tokens.length;
    tokens.push(`<span class="${cls}">${str}</span>`);
    return `___TOKEN_${idx}___`;
  };

  // Mask Comments
  esc = esc.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#\s*[^\n]*)/g, m => mask(m, 'code-comment'));
  
  // Mask Strings
  esc = esc.replace(/("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`)/g, m => mask(m, 'code-string'));

  // Highlight Keywords
  const keywords = /\b(import|from|def|class|return|if|else|elif|for|while|try|except|with|as|pass|raise|const|let|var|function|async|await|switch|case|break|default|public|private)\b/g;
  esc = esc.replace(keywords, '<span class="code-keyword">$1</span>');

  // Highlight Numbers & Booleans
  esc = esc.replace(/\b(True|False|None|true|false|null|undefined|[0-9]+(?:\.[0-9]+)?)\b/g, '<span class="code-number">$1</span>');

  // Restore masked tokens
  esc = esc.replace(/___TOKEN_(\d+)___/g, (_, i) => tokens[parseInt(i)]);

  return esc;
}

function formatCodeBlocks(containerElement) {
  if (!containerElement) return;

  const pres = containerElement.querySelectorAll('pre');
  pres.forEach((pre) => {
    if (pre.dataset.formatted) return;
    pre.dataset.formatted = "true";

    const codeEl = pre.querySelector('code');
    const rawCode = codeEl ? codeEl.textContent : pre.textContent;

    let lang = 'code';
    if (codeEl && codeEl.className) {
      const match = codeEl.className.match(/language-([a-zA-Z0-9]+)/);
      if (match) lang = match[1].toLowerCase();
    }

    if (codeEl) {
      codeEl.innerHTML = highlightSyntax(rawCode, lang);
    }

    const header = document.createElement('div');
    header.className = 'code-header-bar';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.backgroundColor = '#161719';
    header.style.borderBottom = '1px solid rgba(255, 255, 255, 0.08)';
    header.style.padding = '6px 12px';
    header.style.fontFamily = "'Inter', sans-serif";
    header.style.fontSize = '11px';

    const langBadge = document.createElement('div');
    langBadge.style.display = 'flex';
    langBadge.style.alignItems = 'center';
    langBadge.style.gap = '6px';
    langBadge.style.color = '#94a3b8';
    langBadge.style.fontWeight = '600';
    langBadge.style.textTransform = 'uppercase';
    langBadge.style.letterSpacing = '0.05em';
    langBadge.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
        <polyline points="16 18 22 12 16 6"></polyline>
        <polyline points="8 6 2 12 8 18"></polyline>
      </svg>
      <span>${lang}</span>
    `;

    const btnCopyCode = document.createElement('button');
    btnCopyCode.className = 'btn-copy-code';
    btnCopyCode.style.background = 'transparent';
    btnCopyCode.style.border = 'none';
    btnCopyCode.style.color = '#94a3b8';
    btnCopyCode.style.cursor = 'pointer';
    btnCopyCode.style.display = 'flex';
    btnCopyCode.style.alignItems = 'center';
    btnCopyCode.style.gap = '4px';
    btnCopyCode.style.fontSize = '11px';
    btnCopyCode.style.fontWeight = '500';
    btnCopyCode.style.transition = 'color 0.2s';
    btnCopyCode.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Copy code</span>
    `;

    btnCopyCode.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(rawCode);
      const span = btnCopyCode.querySelector('span');
      if (span) span.textContent = 'Copied!';
      btnCopyCode.style.color = '#34d399';
      setTimeout(() => {
        if (span) span.textContent = 'Copy code';
        btnCopyCode.style.color = '#94a3b8';
      }, 2000);
    });

    header.appendChild(langBadge);
    header.appendChild(btnCopyCode);

    if (pre.parentNode) {
      const codeBox = document.createElement('div');
      codeBox.className = 'code-box-wrapper';
      codeBox.style.margin = '12px 0';
      codeBox.style.borderRadius = '8px';
      codeBox.style.border = '1px solid rgba(255, 255, 255, 0.1)';
      codeBox.style.backgroundColor = '#0d0e10';
      codeBox.style.overflow = 'hidden';

      pre.parentNode.insertBefore(codeBox, pre);
      codeBox.appendChild(header);

      pre.style.margin = '0';
      pre.style.border = 'none';
      pre.style.borderRadius = '0';
      pre.style.padding = '12px 14px';
      pre.style.overflowX = 'auto';
      codeBox.appendChild(pre);
    }
  });
}

async function typeMessageResponse(contentElement, fullText, options = {}) {
  const messageWrapper = contentElement.closest('.message-wrapper') || contentElement.parentNode;
  const actionsDiv = messageWrapper ? messageWrapper.querySelector('.message-actions') : null;
  const btnCopy = actionsDiv ? actionsDiv.querySelector('.btn-copy-msg') : null;

  // Hide message actions while typing / thinking
  if (actionsDiv) actionsDiv.style.display = 'none';

  if (!fullText || fullText.length < 10 || isThinkingMarkup(fullText) || options.instant) {
    renderMessageContent(contentElement, fullText);
    formatCodeBlocks(contentElement);
    
    if (actionsDiv && !isThinkingMarkup(fullText)) {
      actionsDiv.style.display = 'flex';
      if (btnCopy) {
        btnCopy.onclick = (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(fullText);
          const span = btnCopy.querySelector('span');
          if (span) span.textContent = 'Copied!';
          btnCopy.style.color = '#34d399';
          setTimeout(() => {
            if (span) span.textContent = 'Copy';
            btnCopy.style.color = 'var(--text-muted)';
          }, 2000);
        };
      }
    }
    return;
  }

  // Type word by word for super smooth, human-like streaming output
  const words = fullText.split(' ');
  let currentText = '';
  const batchSize = Math.max(1, Math.floor(words.length / 100)); // Smooth adaptive chunking

  for (let i = 0; i < words.length; i += batchSize) {
    currentText += (i === 0 ? '' : ' ') + words.slice(i, i + batchSize).join(' ');
    contentElement.innerHTML = window.ultronAPI.parseMarkdown(currentText + ' ▋');
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    await new Promise(r => setTimeout(r, 16));
  }

  // Render final completed markdown without typing cursor
  renderMessageContent(contentElement, fullText);
  formatCodeBlocks(contentElement);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

  // Reveal Copy button when typing completes
  if (actionsDiv && !isThinkingMarkup(fullText)) {
    actionsDiv.style.display = 'flex';
    if (btnCopy) {
      btnCopy.onclick = (e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(fullText);
        const span = btnCopy.querySelector('span');
        if (span) span.textContent = 'Copied!';
        btnCopy.style.color = '#34d399';
        setTimeout(() => {
          if (span) span.textContent = 'Copy';
          btnCopy.style.color = 'var(--text-muted)';
        }, 2000);
      };
    }
  }
}

function renderChatMessage(sender, text, isAi = false) {
  const chatMain = document.querySelector('.chat-main');
  if (chatMain && chatMain.classList.contains('empty-state')) {
    chatMain.classList.remove('empty-state');
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message flex gap-4 max-w-3xl ${isAi ? 'ai' : 'user'}`;

  const content = document.createElement('div');
  content.className = 'message-content';
  renderMessageContent(content, text);

  if (isAi) {
    const avatar = document.createElement('div');
    avatar.className = 'avatar ai';
    avatar.innerHTML = `<img src="../../Assets/ultron-logo.png" alt="Ultron" />`;
    messageDiv.appendChild(avatar);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';
    wrapper.style.flex = '1';
    wrapper.appendChild(content);
    
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    const isThinking = isThinkingMarkup(text);
    actions.style.display = isThinking ? 'none' : 'flex';
    actions.style.gap = '8px';
    actions.style.marginTop = '6px';
    
    const btnCopy = document.createElement('button');
    btnCopy.className = 'btn-copy-msg';
    btnCopy.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12" style="margin-right: 4px; vertical-align: middle;">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Copy</span>
    `;
    btnCopy.style.background = 'transparent';
    btnCopy.style.border = 'none';
    btnCopy.style.color = 'var(--text-muted)';
    btnCopy.style.cursor = 'pointer';
    btnCopy.style.display = 'flex';
    btnCopy.style.alignItems = 'center';
    btnCopy.style.fontSize = '10px';
    btnCopy.style.padding = '2px 6px';
    btnCopy.style.borderRadius = '4px';
    btnCopy.style.transition = 'color 0.2s, background-color 0.2s';
    
    btnCopy.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text);
      const span = btnCopy.querySelector('span');
      if (span) span.textContent = 'Copied!';
      btnCopy.style.color = '#34d399';
      setTimeout(() => {
        if (span) span.textContent = 'Copy';
        btnCopy.style.color = 'var(--text-muted)';
      }, 2000);
    });
    
    btnCopy.addEventListener('mouseenter', () => {
      btnCopy.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      btnCopy.style.color = 'var(--accent-white)';
    });
    btnCopy.addEventListener('mouseleave', () => {
      btnCopy.style.backgroundColor = 'transparent';
      btnCopy.style.color = 'var(--text-muted)';
    });
    
    actions.appendChild(btnCopy);
    wrapper.appendChild(actions);
    messageDiv.appendChild(wrapper);

    // Format code blocks for static rendered messages
    if (!isThinking) {
      setTimeout(() => formatCodeBlocks(content), 0);
    }
  } else {
    const avatar = document.createElement('div');
    avatar.className = 'avatar user';
    avatar.textContent = getUserInitials();
    messageDiv.appendChild(content);
    messageDiv.appendChild(avatar);
  }

  chatMessagesContainer.appendChild(messageDiv);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  return content;
}

function touchSession(sessionId = currentSessionId) {
  if (sessionId && conversationsStore[sessionId]) {
    conversationsStore[sessionId].updatedAt = nowIso();
  }
}

function makeSessionTitle(prompt) {
  const cleaned = prompt
    .replace(/\s+/g, ' ')
    .replace(/["'`]/g, '')
    .trim();

  if (!cleaned) return 'New chat';

  const title = cleaned
    .split(' ')
    .slice(0, 6)
    .join(' ')
    .replace(/\b\w/g, char => char.toUpperCase());

  return title.length > 30 ? `${title.substring(0, 27)}...` : title;
}

function shouldGenerateAiTitle(prompt) {
  const words = prompt.trim().split(/\s+/).filter(Boolean);
  return prompt.length > 28 && words.length > 4;
}

function isSimpleGreetingPrompt(prompt) {
  return /^(hi|hey|hello|helo|hii|yo|namaste|hey hello|hello hey|hey there|hello there)[\s!.?]*$/i.test(prompt.trim());
}

function rebuildSessionHistoryList() {
  const sessionHistoryList = document.getElementById('session-history-list');
  if (!sessionHistoryList) return;
  sessionHistoryList.innerHTML = '';
  
  Object.keys(conversationsStore)
    .sort((a, b) => new Date(conversationsStore[b].updatedAt || 0) - new Date(conversationsStore[a].updatedAt || 0))
    .forEach(id => {
    const session = conversationsStore[id];
    const item = document.createElement('div');
    item.className = `nav-item font-small${id === currentSessionId ? ' active' : ''}`;
    item.setAttribute('data-session-id', id);
    item.innerHTML = `
      <span class="session-row-text">
        <span class="nav-text text-truncate">${session.title}</span>
        <span class="session-timestamp">${formatSidebarTimestamp(session.updatedAt || session.createdAt)}</span>
      </span>
    `;
    sessionHistoryList.appendChild(item);
  });
}

// Stopwords to filter out during semantic search parses
const stopwords = new Set(['show', 'me', 'the', 'chat', 'about', 'find', 'a', 'an', 'is', 'of', 'to', 'in', 'and', 'for', 'with', 'on', 'at']);

// Connection checking and warning banner UI helper functions
async function checkOnlineStatus() {
  if (!navigator.onLine) return false;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    await fetch('https://ollama.com', { mode: 'no-cors', signal: controller.signal });
    clearTimeout(timeoutId);
    return true;
  } catch (e) {
    return false;
  }
}

async function checkOllamaConnection() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags');
    if (response.ok) {
      return { connected: true };
    }
    return { connected: false, error: `Status ${response.status}` };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

let bannerAutoDismissTimer = null;

function showOllamaBanner(type, message, isDismissible = true, showInstallBtn = false) {
  const banner = document.getElementById('ollama-warning-banner');
  if (!banner) return;
  
  if (bannerAutoDismissTimer) {
    clearTimeout(bannerAutoDismissTimer);
    bannerAutoDismissTimer = null;
  }
  
  banner.className = `notification-banner ${type}`;
  
  const icon = banner.querySelector('.notification-icon');
  if (icon) {
    if (type === 'success') {
      icon.innerHTML = `<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>`;
    } else {
      icon.innerHTML = `<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>`;
    }
  }
  
  const msgEl = banner.querySelector('.notification-message');
  if (msgEl) msgEl.textContent = message;
  
  const installBtn = document.getElementById('btn-banner-download-install');
  if (installBtn) {
    if (showInstallBtn) {
      installBtn.classList.remove('hidden');
    } else {
      installBtn.classList.add('hidden');
    }
  }
  
  const closeBtn = document.getElementById('btn-banner-close');
  if (closeBtn) {
    if (isDismissible) {
      closeBtn.classList.remove('hidden');
    } else {
      closeBtn.classList.add('hidden');
    }
  }
  
  banner.classList.remove('hidden');

  // Auto-dismiss success or dismissible banners after 4.5 seconds
  if (type === 'success' || isDismissible) {
    bannerAutoDismissTimer = setTimeout(() => {
      hideOllamaBanner();
    }, 4500);
  }
}

function hideOllamaBanner() {
  if (bannerAutoDismissTimer) {
    clearTimeout(bannerAutoDismissTimer);
    bannerAutoDismissTimer = null;
  }
  const banner = document.getElementById('ollama-warning-banner');
  if (banner) {
    banner.classList.add('hidden');
  }
}

async function checkOllamaStartup() {
  logTrace('Checking Ollama connection status...', 'system');
  const conn = await checkOllamaConnection();
  if (conn.connected) {
    logTrace('Ollama connection verified on boot.', 'system');
    hideOllamaBanner();
    await runOnboardingProfiler();
    renderSettingsModels();
    return;
  }

  logTrace('Ollama not reachable. Checking if installed on machine...', 'system');
  const installCheck = await window.ultronAPI.checkOllamaInstalled();
  if (installCheck.installed) {
    logTrace(`Ollama detected on machine (Source: ${installCheck.source}). Attempting to start service...`, 'system');
    showOllamaBanner('warning', 'Ollama is installed but not running. Attempting to start the service...', false);
    
    const startResult = await window.ultronAPI.startOllamaService(installCheck.path);
    if (startResult.success) {
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const retryConn = await checkOllamaConnection();
        if (retryConn.connected) {
          logTrace('Ollama background service connected successfully.', 'system');
          showOllamaBanner('success', 'Ollama service started and connected successfully!', true);
          await runOnboardingProfiler();
          renderSettingsModels();
          return;
        }
      }
    }
    
    logTrace('Ollama service failed to start or respond in time.', 'system');
    showOllamaBanner('warning', 'Ollama is installed but not running. Please click Connect or launch the Ollama app manually.', true);
  } else {
    logTrace('Ollama is not installed on this system.', 'system');
    showOllamaBanner('warning', 'Ollama is not installed. To run offline AI models, please download or install it.', false, true);
  }
}

async function startOllamaInstallFlow(buttonElement) {
  const originalText = buttonElement.textContent;
  buttonElement.disabled = true;
  buttonElement.textContent = 'Checking...';
  
  logTrace('Initiating Ollama installation check...', 'system');
  
  const installCheck = await window.ultronAPI.checkOllamaInstalled();
  if (installCheck.installed) {
    logTrace('Ollama is already installed on this machine. Connecting...', 'system');
    buttonElement.textContent = 'Starting service...';
    showOllamaBanner('warning', 'Ollama is already installed. Starting service...', false);
    
    const startResult = await window.ultronAPI.startOllamaService(installCheck.path);
    if (startResult.success) {
      for (let i = 0; i < 5; i++) {
        buttonElement.textContent = `Connecting (${i+1}s)...`;
        await new Promise(r => setTimeout(r, 1000));
        const retryConn = await checkOllamaConnection();
        if (retryConn.connected) {
          logTrace('Ollama service started and connected successfully.', 'system');
          showOllamaBanner('success', 'Ollama connected successfully!', true);
          buttonElement.disabled = false;
          buttonElement.textContent = 'Connected';
          runOnboardingProfiler();
          return;
        }
      }
    }
    
    logTrace('Failed to start Ollama background service automatically.', 'system');
    showOllamaBanner('warning', 'Ollama is installed but not running. Please launch the Ollama app manually.', true);
    buttonElement.disabled = false;
    buttonElement.textContent = originalText;
    return;
  }
  
  buttonElement.textContent = 'Verifying connection...';
  const online = await checkOnlineStatus();
  if (!online) {
    logTrace('Ollama installation aborted: User is offline.', 'system');
    showOllamaBanner('warning', 'Internet Connection Required: You are offline. Please connect to the internet to install Ollama.', true, true);
    buttonElement.disabled = false;
    buttonElement.textContent = originalText;
    
    settingsModal.classList.remove('hidden');
    const modelTab = document.querySelector('.settings-tab-btn[data-tab="models"]');
    if (modelTab) modelTab.click();
    return;
  }
  
  buttonElement.textContent = 'Installing...';
  logTrace('Downloading and installing Ollama via winget...', 'system');
  showOllamaBanner('warning', 'Downloading and installing Ollama via winget. This may take a few minutes...', false);
  
  const result = await window.ultronAPI.installOllama();
  if (result.success) {
    logTrace('winget Ollama installation command executed successfully.', 'system');
    showOllamaBanner('warning', 'Ollama installation spawned. Checking connection...', false);
    
    for (let i = 0; i < 15; i++) {
      buttonElement.textContent = `Connecting (${i+1}s)...`;
      await new Promise(r => setTimeout(r, 1500));
      const retryConn = await checkOllamaConnection();
      if (retryConn.connected) {
        logTrace('Ollama installed and connected successfully!', 'system');
        showOllamaBanner('success', 'Ollama installed and connected successfully!', true);
        buttonElement.disabled = false;
        buttonElement.textContent = 'Installed';
        runOnboardingProfiler();
        return;
      }
    }
    
    showOllamaBanner('warning', 'Ollama installed. If it is not running, please start it manually from your Start Menu.', true);
    buttonElement.disabled = false;
    buttonElement.textContent = 'Installed (Reboot recommended)';
  } else {
    logTrace(`Ollama installation failed: ${result.error}`, 'system');
    showOllamaBanner('warning', `Ollama installation failed: ${result.error}. Please install it manually from ollama.com.`, true, true);
    buttonElement.disabled = false;
    buttonElement.textContent = originalText;
  }
}

async function refreshOllamaStatus() {
  const refreshBtn = document.getElementById('btn-refresh-ollama');
  if (refreshBtn) {
    refreshBtn.style.pointerEvents = 'none';
    const svg = refreshBtn.querySelector('svg');
    if (svg) svg.classList.add('animate-spin');
  }

  logTrace('Checking Ollama status and connectivity...', 'system');
  const conn = await checkOllamaConnection();
  const connTitle = document.getElementById('ollama-connector-title');
  
  if (conn.connected) {
    if (connTitle) connTitle.textContent = 'Ollama';
    ollamaStatusBadge.textContent = 'Connected';
    ollamaStatusBadge.className = 'badge-active';
    ollamaStatusBadge.style.backgroundColor = '';
    ollamaStatusBadge.style.color = '';
    ollamaStatusBadge.style.border = '';
    
    btnInstallOllama.classList.add('hidden');
    hideOllamaBanner();
    
    // Refresh models list
    await runOnboardingProfiler();
    renderSettingsModels();
  } else {
    if (connTitle) connTitle.textContent = 'Connect Ollama';
    // If not connected, check if installed
    const installCheck = await window.ultronAPI.checkOllamaInstalled();
    if (installCheck.installed) {
      ollamaStatusBadge.textContent = 'Installed (Not Connected)';
      ollamaStatusBadge.className = 'badge-inactive';
      ollamaStatusBadge.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
      ollamaStatusBadge.style.color = '#fbbf24';
      ollamaStatusBadge.style.border = '1px solid rgba(245, 158, 11, 0.3)';
      
      btnInstallOllama.textContent = 'Connect';
      btnInstallOllama.classList.remove('hidden');
      
      showOllamaBanner('warning', 'Ollama is installed but not running. Please click Connect or launch the Ollama app manually.', true);
    } else {
      ollamaStatusBadge.textContent = 'Not Detected';
      ollamaStatusBadge.className = 'badge-inactive';
      ollamaStatusBadge.style.backgroundColor = '';
      ollamaStatusBadge.style.color = '';
      ollamaStatusBadge.style.border = '';
      
      btnInstallOllama.textContent = 'Download & Install Ollama';
      btnInstallOllama.classList.remove('hidden');
    }
    
    settingsModelsList.innerHTML = `<div class="text-xs text-muted p-2">No offline model weights found. Please make sure Ollama is connected.</div>`;
  }

  if (refreshBtn) {
    refreshBtn.style.pointerEvents = '';
    const svg = refreshBtn.querySelector('svg');
    if (svg) svg.classList.remove('animate-spin');
  }
}

// Trace Logger utility
function logTrace(message, type = 'local') {
  const line = document.createElement('div');
  line.className = `trace-line text-xs py-0.5 ${type === 'system' ? 'trace-sys' : ''}`;
  
  const timestamp = new Date().toLocaleTimeString();
  line.textContent = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
  
  traceLogsStream.appendChild(line);
  traceLogsStream.scrollTop = traceLogsStream.scrollHeight;
}

// Checklist rendering manager
function renderChecklist(tasks) {
  taskChecklistContainer.innerHTML = '';
  tasks.forEach((task) => {
    const node = document.createElement('div');
    node.className = `task-node flex items-start gap-2 text-xs transition-all ${task.completed ? 'completed' : ''}`;
    
    node.innerHTML = `
      <div class="task-check">
        ${task.completed ? '✓' : ''}
      </div>
      <span class="task-text">${task.text}</span>
    `;
    taskChecklistContainer.appendChild(node);
  });
}

// Append Message to Chat Container and save in conversationsStore
function appendChatMessage(sender, text, isAi = false, options = {}) {
  const content = options.skipRender ? null : renderChatMessage(sender, text, isAi);

  // Save message to current session inside conversationsStore
  if (!options.skipSave && currentSessionId && conversationsStore[currentSessionId]) {
    conversationsStore[currentSessionId].messages.push({ sender, text, isAi, createdAt: nowIso() });
    touchSession();
    rebuildSessionHistoryList();
    saveConversationsToDisk();
  }
  
  return content;
}

// Cached system environment context (refreshed periodically)
let _cachedSystemEnv = null;
let _cachedSystemEnvAt = 0;
const SYSTEM_ENV_TTL_MS = 30 * 60 * 1000;
let _learnedTaskMemory = []; // Self-learning: stores task outcome summaries

async function getSystemContext(forceRefresh = false) {
  if (!forceRefresh && _cachedSystemEnv && Date.now() - _cachedSystemEnvAt < SYSTEM_ENV_TTL_MS) {
    return _cachedSystemEnv;
  }
  try {
    _cachedSystemEnv = await window.ultronAPI.getSystemEnvironment();
    _cachedSystemEnvAt = Date.now();
  } catch (e) {
    _cachedSystemEnv = {
      platform: 'win32', username: 'vedan', homeDir: 'C:\\Users\\vedan',
      drives: [{ letter: 'C:' }],
      keyDirectories: { desktop: 'C:\\Users\\vedan\\Desktop', documents: 'C:\\Users\\vedan\\Documents', downloads: 'C:\\Users\\vedan\\Downloads' },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local',
      locale: 'en-US',
      region: {},
      geoLocation: null
    };
    _cachedSystemEnvAt = Date.now();
  }
  return _cachedSystemEnv;
}

function buildRealtimeContext(sysEnv = {}) {
  const now = new Date();
  const tz = sysEnv.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  const utcOffsetMinutes = -now.getTimezoneOffset();
  const utcOffsetLabel = `${utcOffsetMinutes >= 0 ? '+' : '-'}${String(Math.floor(Math.abs(utcOffsetMinutes) / 60)).padStart(2, '0')}:${String(Math.abs(utcOffsetMinutes) % 60).padStart(2, '0')}`;
  const geo = sysEnv.geoLocation || {};
  const region = sysEnv.region || {};
  const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
  const locationParts = [geo.city, geo.region, geo.country || region.country].filter(Boolean);
  const locationLabel = locationParts.length > 0 ? locationParts.join(', ') : (region.country || 'Unknown location');

  return {
    dateLabel: now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    timeLabel: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }),
    timeZone: tz,
    utcOffsetLabel,
    utcTimeLabel: now.toUTCString(),
    year: now.getFullYear(),
    month: now.toLocaleDateString('en-US', { month: 'long' }),
    dayOfWeek: now.toLocaleDateString('en-US', { weekday: 'long' }),
    dayOfMonth: now.getDate(),
    dayOfYear,
    isoTimestamp: now.toISOString(),
    unixTimestamp: Math.floor(now.getTime() / 1000),
    locationLabel,
    countryCode: geo.countryCode || region.countryCode || '',
    locale: sysEnv.locale || 'en-US'
  };
}

function normalizeUrlForCompare(url) {
  try {
    const parsed = new URL(String(url).trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    return `${parsed.protocol}//${host}${path}`.toLowerCase();
  } catch (e) {
    return String(url || '').trim().replace(/\/+$/, '').toLowerCase();
  }
}

function stripUnverifiedLinks(text, allowedUrls = []) {
  if (!text || typeof text !== 'string') return '';
  const allowed = new Set(allowedUrls.map(normalizeUrlForCompare).filter(Boolean));
  if (allowed.size === 0) {
    return text
      .replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, '$1')
      .replace(/(?<![(\[])(https?:\/\/[^\s<>)\]"']+)/gi, '');
  }

  const isAllowedUrl = (rawUrl) => {
    const normalized = normalizeUrlForCompare(rawUrl.replace(/[.,;:!?)]+$/g, ''));
    if (allowed.has(normalized)) return true;
    return [...allowed].some((candidate) => normalized.startsWith(candidate) || candidate.startsWith(normalized));
  };

  let cleaned = text.replace(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi, (match, label, url) => (
    isAllowedUrl(url) ? match : label
  ));

  cleaned = cleaned.replace(/(?<![(\[])(https?:\/\/[^\s<>)\]"']+)/gi, (url) => (
    isAllowedUrl(url) ? url : ''
  ));

  return cleaned.replace(/\(\s*\)/g, '').replace(/\s{2,}/g, ' ').trim();
}

function sanitizeResponseText(text, userPrompt = '', options = {}) {
  if (!text || typeof text !== 'string') return '';

  let cleaned = text.trim();

  // 1. Remove third-person meta-preambles (e.g. "Sure! Here's a revised version...", "The user asked...", "Based on web search...")
  cleaned = cleaned.replace(/^(certainly!?|sure!?|of course!?)\s*(here\s+(are|is)\s+(some\s+)?examples?\s+of\s+how\s+(the\s+)?ai\s*(agent\s*)?(can|will)\s+[^:\n]+[:\n]\s*)/gi, '');
  cleaned = cleaned.replace(/^here\s+(are|is)\s+(some\s+)?examples?\s+of\s+how\s+(the\s+)?ai\s*(agent\s*)?(can|will)\s+[^:\n]+[:\n]\s*/gi, '');
  cleaned = cleaned.replace(/^(sure!?|of course!?|certainly!?)\s*(here's|here is|this is)\s*(a revised|an updated|a summary|the summary)?\s*(version of\s*)?(the\s+)?(live\s+)?web\s*sea?r?ch?e?t?\s*(information|results)?\s*(with\s+[^:\n]+?\s+as\s+the\s+main\s+topic)?:?\s*/gi, '');
  cleaned = cleaned.replace(/^(the user's? (question|request|prompt) is|the user asked|based on (the )?(live )?web search( results)?|according to (the )?search results)[^:\n]*[:\n,]\s*/gi, '');
  cleaned = cleaned.replace(/^and the live web sea?r?ch?e?t? results provided are:?\s*/gi, '');
  cleaned = cleaned.replace(/^(web\s+sea?r?ch?e?t?\s+(information|results)):?\s*/gi, '');
  cleaned = cleaned.replace(/^to\s+answer\s+the\s+user'?s?\s+(question|request|prompt)[^:\n]*[:\n]\s*/gi, '');
  cleaned = cleaned.replace(/^to\s+answer\s+your\s+(question|request|prompt)[^:\n]*[:\n]\s*/gi, '');
  cleaned = cleaned.replace(/^here\s+is\s+a\s+(direct|clear|concise|polished)?\s*response\s+[^:\n]*[:\n]\s*/gi, '');
  cleaned = cleaned.replace(/^using\s+standard\s+markdown\s+formatting\s+and\s+polished\s+language:?\s*/gi, '');

  // 2. Aggressive quotes & meta-intro clause cleanup
  const metaPattern = /^\s*(sure!?|here is|here's)?\s*The user's? (question|request) is ["'][^"']+["'],?\s*(and|with)?\s*(the\s+)?(live\s+)?(web\s+)?sea?r?ch?e?t?\s*results?\s*provided\s*are:?\s*/gi;
  cleaned = cleaned.replace(metaPattern, '').trim();
  cleaned = cleaned.replace(/^\s*(sure!?|here is|here's)?\s*to\s+answer\s+[^:\n]+?:\s*/gi, '').trim();

  // 3. Common typo correction in generated web summaries
  cleaned = cleaned.replace(/\bsearcet\b/gi, 'search')
                 .replace(/\bsearche\b/gi, 'search')
                 .replace(/\bcommercce\b/gi, 'commerce')
                 .replace(/\bGurgaoon\b/gi, 'Gurgaon');

  // 4. Fallback for small models repeating verbatim prompt headers
  cleaned = cleaned.replace(/^\s*User Question:\s*["'][^"']+["']\s*/gi, '');
  cleaned = cleaned.replace(/^\s*Live Web Search Information:\s*/gi, '');
  cleaned = cleaned.replace(/^\s*Answer the user's question directly:?\s*/gi, '');

  // 5. Replace template tags
  const userNameEl = document.querySelector('.profile-detail-name');
  const currentUserName = userNameEl ? userNameEl.textContent.trim() : 'User';
  cleaned = cleaned.replace(/\[your_name\]|\[Your Name\]|<your name>|\[Agent Name\]/gi, "Ultron");
  cleaned = cleaned.replace(/\[user_name\]|\[User Name\]|<user name>/gi, currentUserName);

  // 6. Strip invented or unverified hyperlinks from web summaries
  if (options.allowedUrls && options.allowedUrls.length > 0) {
    cleaned = stripUnverifiedLinks(cleaned, options.allowedUrls);
  } else if (options.stripAllLinks) {
    cleaned = stripUnverifiedLinks(cleaned, []);
  }

  // 7. Capitalize first letter if valid text remains
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

function extractPlainTextFromMessage(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // Extract answer text from search experience markup if present
  const answerMatch = cleaned.match(/<div class="search-answer">([\s\S]*?)<\/div>/i);
  if (answerMatch) {
    cleaned = answerMatch[1];
  }

  // Strip HTML tags and entities to recover pure conversational text
  cleaned = cleaned
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned;
}

function fallbackSearchQueryFromPrompt(prompt) {
  let query = (prompt || '').replace(/["'`]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!query) return 'latest updates news';

  // Strip conversational lead-ins
  let cleaned = query
    .replace(/\bwbe\b/gi, 'web')
    .replace(/\bspiderman\b/gi, 'Spider-Man')
    .replace(/^(please\s+)?(can\s+you\s+|could\s+you\s+)?(search|google|look\s+up|find\s+out|find|check)\s+(the\s+)?(web\s+)?(online\s+)?(for\s+)?/i, '')
    .replace(/^(who|what|where|when|why|how)\s+(is|are|was|were|do|does|did|can|should|would)\s+(the\s+)?/i, '')
    .replace(/^(tell\s+me|show\s+me|give\s+me|search\s+for|info\s+on|details\s+on)\s+(about\s+)?/i, '')
    .trim();

  // Smart keyword enrichment for common query formats
  if (/^who\s+(is|was|are)\b/i.test(prompt) && cleaned.split(' ').length <= 4) {
    cleaned = `${cleaned} biography profile background`;
  } else if (/^what\s+(is|are)\b/i.test(prompt) && cleaned.split(' ').length <= 4) {
    cleaned = `${cleaned} overview definition details`;
  }

  return cleaned || query;
}

async function buildWebSearchQuery(userPrompt) {
  const fallback = fallbackSearchQueryFromPrompt(userPrompt);

  const sysEnv = await getSystemContext();
  const realtime = buildRealtimeContext(sysEnv);
  const locationHint = realtime.locationLabel && realtime.locationLabel !== 'Unknown location' ? realtime.locationLabel : '';
  const temporalHint = `${realtime.month} ${realtime.year}`;

  const queryPlannerSystemPrompt = `You are a Search Engine Query Keyword Generator.
Given a user prompt, output ONLY 2 to 5 search engine keywords.
STRICT RULES:
- Output NOTHING EXCEPT the query keywords.
- DO NOT write intro words like "Sure", "Here is", "Below is", "1.", "Query:".
- DO NOT echo instructions or rules.
- DO NOT use conversational phrases like "who is", "tell me about".`;

  const queryPlannerUserPrompt = `User Prompt: "${userPrompt}"\nKeywords:`;

  try {
    const rawAiOutput = await queryOfflineLLM(queryPlannerUserPrompt, [], 'search', queryPlannerSystemPrompt);
    if (rawAiOutput) {
      let planned = rawAiOutput
        .replace(/```[^`]*```/g, '')
        .replace(/^sure,?\s*(here'?s?\s*(an?\s*)?(optimized\s*)?(search\s*)?(engine\s*)?query\s*(for|keywords)?:?)?/gi, '')
        .replace(/^here'?s?\s*(an?\s*)?(optimized\s*)?(search\s*)?(engine\s*)?query\s*(for|keywords)?:?/gi, '')
        .replace(/^(1\.|2\.|3\.|step\s*\d+:?|\*|\-)\s*/gi, '')
        .replace(/^(reconstructed\s+)?search\s+query\s*:?\s*/gi, '')
        .replace(/^(keywords|query|result)\s*:?\s*/gi, '')
        .replace(/^(to\s+convert|the\s+query\s+is)\s*:?\s*/gi, '')
        .replace(/^["'`]|["'`]$/g, '')
        .trim();

      if (planned.includes('\n')) {
        const lines = planned.split('\n').map(l => l.trim()).filter(Boolean);
        planned = lines.find(l => !/^(rules|instructions|1\.|2\.|sure|here|strip|output)/i.test(l)) || lines[lines.length - 1] || '';
        planned = planned.replace(/^["'`]|["'`]$/g, '').replace(/^(keywords|query):?\s*/gi, '').trim();
      }

      if (
        planned &&
        planned.length >= 3 &&
        planned.length <= 100 &&
        !/\b(strip out|conversational words|reconstruction agent|rules:|output only|markdown|explanation)\b/i.test(planned)
      ) {
        logTrace(`AI Search Query Reconstructed: "${planned}" (from prompt: "${userPrompt}")`, 'system');
        return planned;
      }
    }
  } catch (e) {
    logTrace(`Search query AI reconstruction fallback: ${e.message}`, 'system');
  }

  return fallback;
}

function normalizeSearchPayload(payload, query) {
  if (payload && typeof payload === 'object' && Array.isArray(payload.results)) {
    return payload;
  }

  const text = typeof payload === 'string' ? payload : '';
  return {
    success: Boolean(text),
    query,
    results: text ? [{ title: `Results for ${query}`, url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`, source: 'DuckDuckGo', snippet: text }] : [],
    products: [],
    answerContext: text,
    needsClarification: !text,
    clarification: text ? '' : `I could not find reliable web results for "${query}".`
  };
}

function searchContextForLLM(searchPayload) {
  if (!searchPayload) return '';
  if (searchPayload.answerContext) return searchPayload.answerContext;
  return (searchPayload.results || []).map((item, index) => {
    return `[${index + 1}] ${item.title}\nURL: ${item.url}\nSource: ${item.source}\nSnippet: ${item.snippet || 'No snippet available.'}`;
  }).join('\n\n');
}

function shouldAskForSearchClarification(searchPayload) {
  const results = searchPayload && Array.isArray(searchPayload.results) ? searchPayload.results : [];
  const usefulSnippets = results.filter(item => (item.snippet || '').trim().length > 40).length;
  return Boolean(searchPayload && searchPayload.needsClarification) || results.length === 0 || usefulSnippets === 0;
}

function renderSearchExperience(answer, searchPayload) {
  const results = Array.isArray(searchPayload.results) ? searchPayload.results.slice(0, 6) : [];
  const products = Array.isArray(searchPayload.products) ? searchPayload.products.slice(0, 6) : [];
  const answerHtml = window.ultronAPI.parseMarkdown(
    sanitizeResponseText(answer || '', searchPayload.query || '', {
      allowedUrls: results.map(item => item.url).filter(Boolean)
    })
  );

  const productHtml = products.length > 0 ? `
    <div class="search-section">
      <div class="search-section-title">Product Matches</div>
      <div class="product-card-grid">
        ${products.map((item) => {
          let domain = '';
          try {
            const urlObj = new URL(item.url);
            domain = urlObj.hostname.replace(/^www\./, '');
          } catch (e) {
            domain = item.source || 'web';
          }
          const faviconUrl = domain && domain !== 'web' 
            ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`
            : '';

          return `
            <a class="product-result-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHtml(domain)}">
              ${item.image ? `<img class="product-result-image" src="${escapeHtml(item.image)}" alt="" onerror="this.style.display='none';" />` : ''}
              <div class="product-result-body">
                <div class="product-source-header">
                  ${faviconUrl 
                    ? `<img class="product-source-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none';" />` 
                    : `<span class="product-source-icon">🛍️</span>`
                  }
                  <span class="product-source-domain">${escapeHtml(domain || item.source || 'web')}</span>
                </div>
                <div class="product-result-title">${escapeHtml(item.title || 'Product result')}</div>
                ${item.price ? `<div class="product-result-price">${escapeHtml(item.price)}</div>` : ''}
                ${item.snippet ? `<div class="product-result-snippet">${escapeHtml(item.snippet)}</div>` : ''}
              </div>
            </a>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const sourcesHtml = results.length > 0 ? `
    <div class="search-section">
      <div class="search-section-title">Sources</div>
      <div class="source-card-list">
        ${results.map((item) => {
          let domain = '';
          try {
            const urlObj = new URL(item.url);
            domain = urlObj.hostname.replace(/^www\./, '');
          } catch (e) {
            domain = item.source || 'web';
          }
          const faviconUrl = domain && domain !== 'web' 
            ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`
            : '';

          return `
            <a class="source-result-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHtml(domain)}">
              <div class="source-header">
                ${faviconUrl 
                  ? `<img class="source-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';" /><span class="source-favicon-fallback" style="display:none;">🌐</span>` 
                  : `<span class="source-favicon-fallback">🌐</span>`
                }
                <span class="source-domain">${escapeHtml(domain)}</span>
              </div>
              <div class="source-result-title">${escapeHtml(item.title || item.source || 'Web result')}</div>
              <div class="source-meta">Today</div>
            </a>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="ultron-search-experience">
      <div class="search-answer">${answerHtml}</div>
      ${productHtml}
      ${sourcesHtml}
    </div>
  `;
}

/**
 * Intent Classifier — determines what the user actually wants.
 * Returns: 'conversation' | 'action' | 'search' | 'time' | 'system_info' | 'user_identity'
 */
function classifyIntent(prompt) {
  const p = prompt.toLowerCase().trim();

  // 0. User identity queries ("who am i", "my name", "correct my name", "do you know me")
  if (/\b(who am i|my name|what('s|\s+is)\s+my\s+name|do you know me|who i am|correct my name)\b/i.test(p)) {
    return 'user_identity';
  }

  // 1. Explicit Web Search Intent — check FIRST before clock / system rules
  if (p.startsWith('search') || /\b(search|google|look up|find out|iphone|offers|movies|movie|film|trailer|watch|buy|deal|deals|latest|news|current|recent|weather|trending|price|cost|rate|dollar|rupee|currency|exchange|stock|market|crypto|btc|score|vs|compare|comparison|ramayana)\b/i.test(p)) {
    return 'search';
  }

  // 2. Explicit Host Local Time / Date / Calendar / Clock queries ONLY
  const isExplicitClockQuery = /\b(what time is it|what is the time|current time|tell me the time|what'?s the date|what date is it|what is today'?s date|what year is it|what month is it|current date|show time|show clock|what day of the week is it|where am i|my location|what city am i in|what country am i in)\b/i.test(p) || p === 'time' || p === 'date' || p === 'clock';

  if (isExplicitClockQuery && !/\b(file|folder|create|write|delete|code|script|build|run|execute|commit|branch|iphone|movie|search)\b/i.test(p)) {
    return 'time';
  }

  // 3. System info queries
  if (/\b(system info|my (computer|pc|system|ram|cpu|disk|drives|specs)|how much (ram|memory|storage|disk)|what (os|operating system))\b/i.test(p)) {
    return 'system_info';
  }

  // 4. Greeting / casual conversational
  if (/^(hi|hello|hey|good\s*(morning|evening|afternoon|night)|thanks|thank you|how are you|what'?s up|who are you|what can you do|your name)\b/i.test(p) || p.startsWith('hello ') || p.startsWith('hi ') || p.startsWith('hey ')) {
    return 'conversation';
  }

  // 5. General knowledge / opinion / explanation questions
  if (/^(what is|what are|who is|who are|why is|why do|how does|how do|explain|tell me about|define|describe|meaning of|difference between)\b/i.test(p) && !/\b(file|folder|directory|create|make|write|delete|run|execute|install|open|list|show|read)\b/i.test(p)) {
    return 'search';
  }

  // 6. Computer action (file/folder/command/code)
  if (/\b(create|make|write|delete|remove|open|read|list|show files|move|copy|rename|run|execute|install|download|mkdir|folder|directory|file|script|code|program|app)\b/i.test(p)) {
    return 'action';
  }

  // Default: conversational
  return 'conversation';
}

// Offline inference helper querying local servers
async function queryOfflineLLM(prompt, extraMessages = [], intentOverride = null, customSystemPromptOverride = null) {
  // Direct Ollama API generate/chat loop. This keeps context scoped to the active UI session.
  try {
    const memoryEnabled = window.localStorage.getItem('ultron-memory-enabled') !== 'false';
    const userNameEl = document.querySelector('.profile-detail-name');
    const userName = userNameEl ? userNameEl.textContent.trim() : 'Vedant Wankhade';
    const sysEnv = await getSystemContext();
    const realtime = buildRealtimeContext(sysEnv);
    const intent = intentOverride || classifyIntent(prompt);
    const isShortQuery = prompt.length < 60 && !/\b(explain|detail|step by step|comprehensive|essay|code|script|list all)\b/i.test(prompt);

    // Build drives description
    const drivesDesc = (sysEnv.drives || []).map(d => `${d.letter} (${d.description || 'Disk'}, ${d.totalGB || '?'}GB total, ${d.freeGB || '?'}GB free)`).join(', ') || 'C:';
    const dirs = sysEnv.keyDirectories || {};

    // Self-learning memory snippet (last 5 task outcomes)
    const memorySnippet = _learnedTaskMemory.length > 0
      ? `\n\nSELF-LEARNING MEMORY (your past task outcomes for reference):\n${_learnedTaskMemory.slice(-5).map((m, i) => `${i + 1}. ${m}`).join('\n')}`
      : '';

    const systemPrompt = customSystemPromptOverride || `You are Ultron, a warm, highly intelligent, articulate, and engaging AI assistant in a direct 1-on-1 personal conversation with ${userName} (just like Gemini and ChatGPT).

CONVERSATIONAL PERSONA & DIRECT VOICE RULES:
1. ALWAYS speak directly to ${userName} in the first person ("I", "me", "my") addressing ${userName} as "you".
2. STRICTLY FORBIDDEN:
   - NEVER speak in the third person.
   - NEVER refer to yourself as "the AI", "the AI agent", "the assistant", or "this AI".
   - NEVER refer to ${userName} as "the user" or "the user's prompt".
   - NEVER output meta-narrative preambles or lists of hypothetical scenarios (e.g. NEVER write "Here are examples of how the AI agent can make you laugh...", "When the user asks X, the AI will Y...", or "As an AI language model").
3. DIRECT FULFILLMENT:
   - Perform the requested conversational task directly! If ${userName} asks to "make me laugh", "tell a joke", "write a poem", or chat, fulfill it immediately in first person with genuine humor, wit, warmth, and intelligence.
4. SILENT GRAMMAR & TRANSCRIPTION AUTO-CORRECTION:
   - Gracefully interpret and silently auto-correct any grammatical errors, spelling typos, or speech-to-text transcription mistakes in ${userName}'s input without mentioning them.

REAL-TIME CONTEXT:
- Local Date & Time: ${realtime.dateLabel}, ${realtime.timeLabel} (${realtime.timeZone})
- Target Answer Style: ${isShortQuery ? 'Crisp & Concise (2-3 sentences max)' : 'Structured & Comprehensive'}

${intent === 'action' || intent === 'search' ? `HOST SYSTEM ENVIRONMENT & TOOLS:
- Operating System: Windows ${sysEnv.osVersion || '10/11'} (${sysEnv.arch || 'x64'})
- Home Directory: ${sysEnv.homeDir || 'C:\\Users\\vedan'}
- Available Drives: ${drivesDesc}

AVAILABLE TOOLS (use ONLY when performing actions):
- EXECUTE: <command>  — Runs a PowerShell/CMD command
- WRITE_FILE: <filepath> | <content>  — Creates/writes a file
- READ_FILE: <filepath>  — Reads file contents
- LIST_DIR: <dirpath>  — Lists directory contents
- SEARCH: <query>  — Searches the web for live information` : ''}${memorySnippet}`;

    let finalUserPrompt = prompt;
    if (/\b(table|tabular|difference between|vs|comparison)\b/i.test(prompt) && !/\b(html\s+code|css\s+code|write\s+code)\b/i.test(prompt)) {
      finalUserPrompt = `${prompt}\n\n[Formatting Instruction: Respond using standard Markdown table syntax (| Header 1 | Header 2 |). DO NOT write HTML/CSS code.]`;
    }
    
    let bodyData;
    let endpoint = '/api/generate';
    const activeTemp = intent === 'conversation' ? 0.7 : 0.2;
    
    if (memoryEnabled && currentSessionId && conversationsStore[currentSessionId]) {
      // Sliding window memory (last 10 messages for rich context)
      const recentMsgs = conversationsStore[currentSessionId].messages
        .filter(m => !isThinkingMarkup(m.text))
        .slice(-10);
      
      const chatMessages = [
        {
          role: 'system',
          content: systemPrompt
        }
      ];
      
      recentMsgs.forEach(m => {
        const textContent = extractPlainTextFromMessage(m.text);
        if (textContent) {
          chatMessages.push({
            role: m.isAi ? 'assistant' : 'user',
            content: textContent
          });
        }
      });
      
      // Append extra observation messages from agent loop
      if (Array.isArray(extraMessages) && extraMessages.length > 0) {
        extraMessages.forEach(msg => chatMessages.push(msg));
      }
      
      // Add current user prompt if not already in history
      if (chatMessages.length === 1 || chatMessages[chatMessages.length - 1].content !== finalUserPrompt) {
        chatMessages.push({ role: 'user', content: finalUserPrompt });
      }
      
      logTrace(`Sending chat payload to local LLM with ${chatMessages.length - 1} messages...`, 'system');
      
      bodyData = {
        model: activeModel,
        messages: chatMessages,
        stream: false,
        options: {
          num_ctx: 4096,      // Context length
          num_predict: 512,   // Prediction length limit
          temperature: activeTemp
        }
      };
      endpoint = '/api/chat';
    } else {
      // Memory disabled: single prompt mode
      bodyData = {
        model: activeModel,
        prompt: finalUserPrompt,
        system: systemPrompt,
        stream: false,
        options: {
          num_ctx: 2048,
          num_predict: 512,
          temperature: activeTemp
        }
      };
    }

    const response = await fetch(`http://127.0.0.1:11434${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData)
    });
    if (response.ok) {
      const data = await response.json();
      let text = endpoint === '/api/chat' ? data.message.content : data.response;
      
      // Filter out model disclaimer responses that deny computer access capabilities
      if (text && (text.includes("I do not have access") || text.includes("As an AI language model") || text.includes("unable to access your operating system") || text.includes("don't have access") || text.includes("I cannot access") || text.includes("I'm unable to"))) {
        logTrace("Model output disclaimer detected and suppressed.", "system");
        return ""; // Return empty string so Fallback Intent Steerer takes over
      }
      return sanitizeResponseText(text, prompt);
    } else {
      logTrace(`Local LLM response HTTP error: ${response.status}`, 'error');
      return '';
    }
  } catch (e) {
    logTrace(`Local LLM offline loop exception: ${e.message}`, 'error');
    return '';
  }
}

// Populate custom model dropdown without duplicates
function populateModelSelectors(models, recommendation) {
  if (modelDropdownList) {
    modelDropdownList.innerHTML = '';
  }

  // Bind search toggle icon button
  const btnToggleSearch = document.getElementById('btn-toggle-model-search');
  const searchWrapper = document.getElementById('model-dropdown-search-wrapper');
  if (btnToggleSearch && searchWrapper && !btnToggleSearch.dataset.bound) {
    btnToggleSearch.dataset.bound = "true";
    btnToggleSearch.addEventListener('click', (e) => {
      e.stopPropagation();
      searchWrapper.classList.toggle('hidden');
      if (!searchWrapper.classList.contains('hidden')) {
        const searchInput = document.getElementById('model-dropdown-search');
        if (searchInput) searchInput.focus();
      }
    });
  }

  const searchInput = document.getElementById('model-dropdown-search');
  if (searchInput) {
    searchInput.value = '';
    // Ensure we stop propagation to keep the dropdown open while typing and clicking
    if (!searchInput.dataset.bound) {
      searchInput.dataset.bound = "true";
      searchInput.addEventListener('click', (e) => e.stopPropagation());
      searchInput.addEventListener('keydown', (e) => e.stopPropagation());
      searchInput.addEventListener('input', () => {
        const query = searchInput.value.toLowerCase().trim();
        modelDropdownList.querySelectorAll('.model-dropdown-item').forEach(item => {
          if (item.classList.contains('search-more-item')) return;
          const text = item.textContent.toLowerCase();
          if (text.includes(query)) {
            item.style.display = 'flex';
          } else {
            item.style.display = 'none';
          }
        });
      });
    }
  }
  
  // Bind bottom Download Models button
  const btnDownloadModels = document.getElementById('btn-dropdown-download-models');
  if (btnDownloadModels && !btnDownloadModels.dataset.bound) {
    btnDownloadModels.dataset.bound = "true";
    btnDownloadModels.addEventListener('click', (e) => {
      e.stopPropagation();
      modelDropdown.classList.add('hidden');
      modelSelectorWrapper.classList.remove('open');
      
      // Open settings and go to Models tab
      const modelsTab = document.querySelector('.settings-tab-btn[data-tab="models"]');
      if (modelsTab) modelsTab.click();
      settingsModal.classList.remove('hidden');
    });
  }

  // Deduplicate models by name
  const uniqueModels = [];
  const seenNames = new Set();
  (models || []).forEach(m => {
    const name = typeof m === 'string' ? m.trim() : (m && m.name ? m.name.trim() : '');
    if (name && !seenNames.has(name)) {
      seenNames.add(name);
      uniqueModels.push(typeof m === 'object' ? m : { name });
    }
  });

  if (uniqueModels.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'model-dropdown-empty';
    emptyDiv.innerHTML = 'No models found.<br><a id="add-models-link">Add models in Settings</a>';
    modelDropdownList.appendChild(emptyDiv);
    modelSelectorLabel.textContent = 'No Models';
    
    // Bind settings link
    setTimeout(() => {
      const link = document.getElementById('add-models-link');
      if (link) link.addEventListener('click', () => {
        modelDropdown.classList.add('hidden');
        modelSelectorWrapper.classList.remove('open');
        settingsModal.classList.remove('hidden');
      });
    }, 0);
    return;
  }
  
  uniqueModels.forEach(model => {
    const item = document.createElement('div');
    item.className = `model-dropdown-item${model.name === activeModel ? ' active' : ''}`;
    
    let badgeText = 'LOCAL';
    if (model.name.includes(':')) {
      badgeText = model.name.split(':')[1].toUpperCase();
    }

    item.innerHTML = `
      <span class="model-name-text">${model.name}</span>
      <span class="model-badge">${badgeText}</span>
    `;
    item.addEventListener('click', () => {
      activeModel = model.name;
      modelSelectorLabel.textContent = model.name;
      // Update active state
      modelDropdownList.querySelectorAll('.model-dropdown-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      // Close dropdown
      modelDropdown.classList.add('hidden');
      modelSelectorWrapper.classList.remove('open');
      logTrace(`Chat context model shifted to: "${activeModel}"`, 'local');
    });
    modelDropdownList.appendChild(item);
  });
  
  modelSelectorLabel.textContent = activeModel;
}

// Onboarding Hardware Profiler
async function runOnboardingProfiler() {
  logTrace('Initializing hardware diagnostics...', 'system');
  
  const result = await window.ultronAPI.profileSystem();
  if (result.success) {
    const { stats, recommendation, installedModels } = result;
    
    installedModelsList = installedModels;
    
    // Bind to Right Sidebar Card UI
    statRam.textContent = `${stats.totalRamGB} GB`;
    statCpu.textContent = `${stats.cpuThreads} Threads`;
    statGpu.textContent = stats.gpus[0] || 'Unknown GPU';
    statRecommendation.textContent = `${recommendation.toUpperCase()} (Quantized)`;
    
    // Set active model to recommended if installed, else fallback to first installed model
    const hasRecommended = installedModels.some(m => m.name.toLowerCase().includes(recommendation.toLowerCase()) || recommendation.toLowerCase().includes(m.name.toLowerCase()));
    if (hasRecommended) {
      activeModel = recommendation;
    } else if (installedModels.length > 0) {
      activeModel = installedModels[0].name;
    } else {
      activeModel = recommendation; // Fallback if none are installed
    }
    
    logTrace(`Onboarding Profiler: Total RAM resolved as ${stats.totalRamGB} GB`, 'system');
    logTrace(`Onboarding Profiler: Suggesting local model footprint: ${recommendation}`, 'system');
    logTrace(`Ollama binds returned ${installedModels.length} offline model weights.`, 'system');
    
    // Set settings data directory
    window.localStorage.setItem('ultron-data-dir', `C:\\Users\\${stats.cpuThreads > 0 ? 'vedan' : 'user'}\\AppData\\Roaming\\LocalAgent`);
    
    // Populate dropdown
    populateModelSelectors(installedModels, recommendation);
    renderOllamaCatalog();
    
    activeSubgoals = [
      { text: 'Profile host CPU, GPU, and RAM parameters', completed: true },
      { text: 'Establish Ollama API local binding: 127.0.0.1:11434', completed: true },
      { text: `Allocate local execution memory model settings (${recommendation})`, completed: true },
      { text: 'Awaiting local prompt commands', completed: false }
    ];
    renderChecklist(activeSubgoals);
  } else {
    logTrace(`Hardware profiling failed: ${result.error}`, 'system');
  }
}

// Bind security settings selector
async function syncSecurityMode() {
  const currentMode = await window.ultronAPI.getSecurityMode();
  selectSecurityMode.value = currentMode;
  settingsDefaultSecurity.value = currentMode;
  logTrace(`Security Boundary synchronization completed: Mode is "${currentMode}"`, 'system');
}

selectSecurityMode.addEventListener('change', async (e) => {
  const selectedMode = e.target.value;
  const result = await window.ultronAPI.setSecurityMode(selectedMode);
  if (result.success) {
    settingsDefaultSecurity.value = selectedMode;
    logTrace(`Security boundary changed to: "${selectedMode}" Mode`, 'system');
  } else {
    logTrace(`Failed to alter security boundary settings: ${result.error}`, 'system');
  }
});

settingsDefaultSecurity.addEventListener('change', async (e) => {
  const selectedMode = e.target.value;
  const result = await window.ultronAPI.setSecurityMode(selectedMode);
  if (result.success) {
    selectSecurityMode.value = selectedMode;
    logTrace(`Default security boundary changed via settings: "${selectedMode}" Mode`, 'system');
  } else {
    logTrace(`Failed to alter security boundary settings: ${result.error}`, 'system');
  }
});

// Custom model dropdown toggle and click-outside close
modelSelectorBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = !modelDropdown.classList.contains('hidden');
  if (isOpen) {
    modelDropdown.classList.add('hidden');
    modelSelectorWrapper.classList.remove('open');
  } else {
    modelDropdown.classList.remove('hidden');
    modelSelectorWrapper.classList.add('open');
  }
});

document.addEventListener('click', (e) => {
  if (modelSelectorWrapper && !modelSelectorWrapper.contains(e.target)) {
    modelDropdown.classList.add('hidden');
    modelSelectorWrapper.classList.remove('open');
  }
});

// Human-in-the-loop validation overlay hooks
window.ultronAPI.onPermissionRequest((request) => {
  currentPermissionId = request.id;
  permActionCode.textContent = request.command;
  permOverrideInput.value = '';
  
  // Show permission panel
  permissionDialog.classList.remove('hidden');
  logTrace(`Execution paused. Action "${request.command.substring(0, 30)}..." requires human permission.`, 'system');
});

// Accept and run action
btnPermAccept.addEventListener('click', () => {
  if (currentPermissionId) {
    const override = permOverrideInput.value.trim();
    window.ultronAPI.sendPermissionResponse({
      id: currentPermissionId,
      approved: true,
      modifiedCommand: override || null
    });
    
    permissionDialog.classList.add('hidden');
    logTrace(`Human verification accepted for ID: ${currentPermissionId}`, 'system');
    currentPermissionId = null;
  }
});

// Deny execution action
btnPermDeny.addEventListener('click', () => {
  if (currentPermissionId) {
    window.ultronAPI.sendPermissionResponse({
      id: currentPermissionId,
      approved: false
    });
    
    permissionDialog.classList.add('hidden');
    logTrace(`Human verification rejected for ID: ${currentPermissionId}`, 'system');
    currentPermissionId = null;
  }
});

// Add dynamic session item to sidebar recents
function addSessionToHistory(title) {
  const sessionHistoryList = document.getElementById('session-history-list');
  if (!sessionHistoryList) return;
  
  // If we already have a session ID, just update its title
  if (currentSessionId) {
    const existing = sessionHistoryList.querySelector(`[data-session-id="${currentSessionId}"]`);
    if (existing) {
      existing.querySelector('.nav-text').textContent = title;
      if (conversationsStore[currentSessionId]) {
        conversationsStore[currentSessionId].title = title;
        touchSession();
        rebuildSessionHistoryList();
        saveConversationsToDisk();
      }
      return;
    }
  }
  
  currentSessionId = `session-${Date.now()}`;
  
  // Setup inside local conversations memory store
  conversationsStore[currentSessionId] = {
    id: currentSessionId,
    title: title,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: []
  };
  saveConversationsToDisk();
  
  const item = document.createElement('div');
  item.className = 'nav-item font-small active';
  item.setAttribute('data-session-id', currentSessionId);
  item.innerHTML = `
    <span class="session-row-text">
      <span class="nav-text text-truncate">${title}</span>
      <span class="session-timestamp">${formatSidebarTimestamp(conversationsStore[currentSessionId].updatedAt)}</span>
    </span>
  `;
  
  // Remove active highlight from all other history items
  const items = sessionHistoryList.querySelectorAll('.nav-item');
  items.forEach(i => i.classList.remove('active'));
  
  // Insert at the top of the history list
  sessionHistoryList.insertBefore(item, sessionHistoryList.firstChild);
  
  // Update header title
  if (activeChatTitle) activeChatTitle.textContent = title;
}

// Background AI-driven title generation
async function triggerAiTitleGeneration(userPrompt) {
  try {
    const targetSessionId = currentSessionId;
    const summaryPrompt = `You are a summarizer. Generate an extremely concise 2-3 words title summarizing the following user prompt. Do not write 'Title:', do not write any introductory comments, quotes or punctuation, just output the plain summary text: "${userPrompt}"`;
    
    logTrace('Running background summary task on local LLM for title generation...', 'system');
    const llmResponse = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeModel,
        prompt: summaryPrompt,
        stream: false,
        options: {
          num_ctx: 512,
          num_predict: 16,
          temperature: 0.2
        }
      })
    });
    if (!llmResponse.ok) return;

    const data = await llmResponse.json();
    const response = data.response || '';
    
    // Clean up summary string
    let finalTitle = response
      .split('\n')[0]
      .replace(/^title\s*:\s*/i, '')
      .replace(/["'`‘’.“]/g, '')
      .trim();
    if (finalTitle.includes(' - ')) {
      finalTitle = finalTitle.split(' - ')[0].trim();
    }
    if (finalTitle.length > 30) {
      finalTitle = finalTitle.substring(0, 27) + '...';
    }
    if (finalTitle && !finalTitle.toLowerCase().includes('failed') && !finalTitle.toLowerCase().includes('offline')) {
      // Update memory store
      if (conversationsStore[targetSessionId]) {
        conversationsStore[targetSessionId].title = finalTitle;
        touchSession(targetSessionId);
        rebuildSessionHistoryList();
        saveConversationsToDisk();
      }
      
      // Update sidebar DOM item text
      const sidebarItem = document.querySelector(`[data-session-id="${targetSessionId}"] .nav-text`);
      if (sidebarItem) {
        sidebarItem.textContent = finalTitle;
      }
      
      // Update header title if it is still the active session
      if (currentSessionId === targetSessionId && activeChatTitle) {
        activeChatTitle.textContent = finalTitle;
      }
      logTrace(`AI generated session title: "${finalTitle}"`, 'system');
    }
  } catch (err) {
    logTrace(`AI title summary generation failed: ${err.message}`, 'system');
  }
}

// Check for meaningless or gibberish prompts to avoid model hallucinations
function isMeaninglessPrompt(text) {
  const trimmed = text.trim();
  if (!trimmed) return true;
  
  // 1. Check for repetitive single-character strings (e.g. "bbbbbbbbbbbbbbbbbb")
  const plainText = trimmed.replace(/\s+/g, '');
  if (plainText.length >= 5) {
    const firstChar = plainText[0];
    let allSame = true;
    for (let i = 1; i < plainText.length; i++) {
      if (plainText[i] !== firstChar) {
        allSame = false;
        break;
      }
    }
    if (allSame) return true;
  }
  
  // 2. Check for continuous consonant gibberish longer than 8 characters (e.g. "sdfghjkshdflkjsdhf")
  const words = trimmed.split(/\s+/);
  for (const word of words) {
    // If a word is long (8+ letters) and has absolutely no vowels (excluding numbers/punctuation)
    if (word.length > 8 && !/[aeiouyAEIOUY0-9]/i.test(word)) {
      return true;
    }
  }
  
  return false;
}

// Submit prompt logic
async function submitPrompt() {
  if (isAwaitingResponse) return;

  let prompt = chatInput.value.trim();
  
  // Include attached files in prompt if present
  if (attachedFiles.length > 0) {
    const fileListStr = attachedFiles.map(f => `📄 ${f.name} (${(f.size/1024).toFixed(1)} KB)`).join(', ');
    prompt = prompt ? `${prompt}\n\n[Attached Files: ${fileListStr}]` : `[Attached Files: ${fileListStr}]`;
    attachedFiles = [];
    renderAttachmentPreviews();
  }

  if (!prompt) return;

  setSendingState(true);
  
  // Clear input and reset height
  chatInput.value = '';
  chatInput.style.height = 'auto';
  
  // Toggle off search overlay if open
  chatSearchOverlay.classList.add('hidden');
  
  const isFirstMessage = !currentSessionId;
  
  // 1. Add session history item if starting a session
  if (isFirstMessage) {
    addSessionToHistory(makeSessionTitle(prompt));
  }
  
  // 2. Render user message
  appendChatMessage('User', prompt, false);
  logTrace(`Processing user request: "${prompt.substring(0, 40)}..."`, 'local');
  
  try {
    // Check for meaningless/gibberish prompts early
    if (isMeaninglessPrompt(prompt)) {
      const aiBubble = appendChatMessage('Ultron', '<div class="thinking-container">Thinking<div class="thinking-dot-wrapper"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div></div>', true, { skipSave: true });
      await new Promise(resolve => setTimeout(resolve, 500));
      const response = "I received a prompt that appears to consist of repetitive characters or gibberish. Could you please clarify your request or ask a meaningful question? I'm here to help!";
      renderMessageContent(aiBubble, response);
      appendChatMessage('Ultron', response, true, { skipRender: true });
    } else {
      // 3. Classify user intent
      const intent = classifyIntent(prompt);
      logTrace(`Intent classified as: "${intent}" for prompt: "${prompt.substring(0, 40)}..."`, 'system');

      // 4. Setup AI placeholder loading bubble
      const aiBubble = appendChatMessage('Ultron', '<div class="thinking-container">Thinking<div class="thinking-dot-wrapper"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div></div>', true, { skipSave: true });
      
      // Check if Ollama is connected when LLM query is required
      if (intent === 'action' || intent === 'conversation') {
        const conn = await checkOllamaConnection();
        if (!conn.connected) {
          await new Promise(resolve => setTimeout(resolve, 400));
          const offlineMsg = "⚠️ **Local AI Engine Offline / No Model Loaded**\n\nUltron cannot process your request because Ollama is not connected or no local model is currently loaded.\n\n**To resolve this:**\n1. Ensure the Ollama background service is running on your machine.\n2. Click the model dropdown at the top (`No Models`) to select or download a model (e.g. `tinyllama:latest`).\n3. Click **Connect Service** if prompted.";
          renderMessageContent(aiBubble, offlineMsg);
          formatCodeBlocks(aiBubble);
          appendChatMessage('Ultron', offlineMsg, true, { skipRender: true });
          setSendingState(false);
          return;
        }
      }
      
      // 5. Trigger AI Title summary in the background on the first message
      if (isFirstMessage && shouldGenerateAiTitle(prompt)) {
        triggerAiTitleGeneration(prompt);
      }

      if (intent === 'user_identity') {
        const userNameEl = document.querySelector('.profile-detail-name');
        const userName = userNameEl ? userNameEl.textContent.trim() : 'Vedant Wankhade';
        const sysEnv = await getSystemContext();
        const response = `You are **${userName}**! You are logged into this Windows PC as \`${sysEnv.username || 'vedan'}\` on computer **${sysEnv.hostname || 'Ultron-PC'}**. I am Ultron, your local AI assistant!`;
        renderMessageContent(aiBubble, response);
        formatCodeBlocks(aiBubble);
        appendChatMessage('Ultron', response, true, { skipRender: true });

      } else if (intent === 'time') {
        // Direct real-time date/clock/calendar response — no LLM needed
        const sysEnv = await getSystemContext();
        const realtime = buildRealtimeContext(sysEnv);
        const p = prompt.toLowerCase();
        
        let response = '';
        if (/\b(year)\b/i.test(p)) {
          response = `The current year is **${realtime.year}**.`;
        } else if (/\b(month)\b/i.test(p)) {
          response = `The current month is **${realtime.month} ${realtime.year}**.`;
        } else if (/\b(day of (the )?week|what day)\b/i.test(p)) {
          response = `Today is **${realtime.dayOfWeek}**.`;
        } else if (/\b(time|clock)\b/i.test(p) && !/\b(date)\b/i.test(p)) {
          response = `The current time is **${realtime.timeLabel}** (${realtime.timeZone}, UTC${realtime.utcOffsetLabel}).`;
        } else if (/\b(date)\b/i.test(p) && !/\b(time)\b/i.test(p)) {
          response = `Today's date is **${realtime.dateLabel}**.`;
        } else if (/\b(where am i|my location|what city|what country)\b/i.test(p)) {
          response = `Your approximate location is **${realtime.locationLabel}**${realtime.countryCode ? ` (${realtime.countryCode})` : ''}, timezone **${realtime.timeZone}**.`;
        } else {
          response = `📅 **Date:** ${realtime.dateLabel}\n🕒 **Time:** ${realtime.timeLabel} (${realtime.timeZone}, UTC${realtime.utcOffsetLabel})\n📍 **Location:** ${realtime.locationLabel}`;
        }

        renderMessageContent(aiBubble, response);
        formatCodeBlocks(aiBubble);
        appendChatMessage('Ultron', response, true, { skipRender: true });

      } else if (intent === 'system_info') {
        // Direct system info response — use cached env
        const sysEnv = await getSystemContext();
        const drivesStr = (sysEnv.drives || []).map(d => `${d.letter} (${d.totalGB || '?'}GB total, ${d.freeGB || '?'}GB free)`).join(', ');
        const response = `**System Information:**\n- **OS:** Windows ${sysEnv.osVersion || '10/11'} (${sysEnv.arch || 'x64'})\n- **Computer:** ${sysEnv.hostname || 'Unknown'}\n- **User:** ${sysEnv.username || 'vedan'}\n- **CPU:** ${sysEnv.cpuModel || 'Unknown'} (${sysEnv.cpuCores || '?'} cores)\n- **RAM:** ${sysEnv.totalMemoryGB || '?'}GB total, ${sysEnv.freeMemoryGB || '?'}GB free\n- **Drives:** ${drivesStr}\n- **Home:** ${sysEnv.homeDir || 'C:\\Users\\vedan'}`;
        await typeMessageResponse(aiBubble, response);
        appendChatMessage('Ultron', response, true, { skipRender: true });

      } else if (intent === 'conversation') {
        const userNameEl = document.querySelector('.profile-detail-name');
        const userName = userNameEl ? userNameEl.textContent.trim() : 'Vedant';
        
        // Pure conversational response — query local AI model dynamically on the spot
        let response = await queryOfflineLLM(prompt, [], 'conversation');
        if (!response || response.trim() === '' || response.includes('REAL-TIME CONTEXT')) {
          response = `Hello ${userName}! How can I assist you today?`;
        }
        response = response.replace(/\[your_name\]|\[Your Name\]|<your name>|\[Agent Name\]/gi, "Ultron");
        await typeMessageResponse(aiBubble, response);
        appendChatMessage('Ultron', response, true, { skipRender: true });

      } else {
        // Action or Search intent — run the full agentic loop
        await runAgenticLoop(prompt, aiBubble, intent);
      }
    }
  } finally {
    setSendingState(false);
  }
}

function parseAgentToolCall(text, userPrompt = '') {
  if (text && typeof text === 'string') {
    // WRITE_FILE: filepath | content
    const writeMatch = text.match(/WRITE_FILE:\s*([^|]+)\|\s*([\s\S]*)/i);
    if (writeMatch) {
      return {
        type: 'WRITE_FILE',
        targetPath: writeMatch[1].trim(),
        content: writeMatch[2].trim(),
        target: writeMatch[1].trim()
      };
    }

    // READ_FILE: filepath
    const readMatch = text.match(/READ_FILE:\s*([^\n]+)/i);
    if (readMatch) {
      return { type: 'READ_FILE', target: readMatch[1].trim() };
    }

    // LIST_DIR: dirpath
    const listMatch = text.match(/LIST_DIR:\s*([^\n]+)/i);
    if (listMatch) {
      return { type: 'LIST_DIR', target: listMatch[1].trim() };
    }

    // EXECUTE: command
    const execMatch = text.match(/EXECUTE:\s*([^\n]+)/i);
    if (execMatch) {
      return { type: 'EXECUTE', target: execMatch[1].trim() };
    }

    // SEARCH: query
    const searchMatch = text.match(/SEARCH:\s*([^\n]+)/i);
    if (searchMatch) {
      return { type: 'SEARCH', target: searchMatch[1].replace(/["']/g, '').trim() };
    }
  }

  // Fallback Intent Steerer for small offline models (e.g. tinyllama)
  if (userPrompt) {
    return detectFallbackToolCall(userPrompt);
  }

  return null;
}

function detectFallbackToolCall(userPrompt) {
  if (!userPrompt || typeof userPrompt !== 'string') return null;
  const p = userPrompt.toLowerCase().trim();

  // Use cached system environment for dynamic paths
  const dirs = (_cachedSystemEnv && _cachedSystemEnv.keyDirectories) || {};
  const userHome = (_cachedSystemEnv && _cachedSystemEnv.homeDir) || 'C:\\Users\\vedan';
  const desktopDir = dirs.desktop || `${userHome}\\Desktop`;
  const documentsDir = dirs.documents || `${userHome}\\Documents`;
  const downloadsDir = dirs.downloads || `${userHome}\\Downloads`;
  const stopWords = new Set(['for', 'me', 'a', 'the', 'my', 'new', 'some', 'please', 'on', 'in', 'at', 'to', 'it', 'us']);

  // Helper: resolve target location from prompt
  function resolveLocation(defaultPath) {
    if (p.includes('desktop')) return desktopDir;
    if (p.includes('document')) return documentsDir;
    if (p.includes('download')) return downloadsDir;
    return defaultPath;
  }

  // 1. Folder / Directory Creation (Check BEFORE File creation to prevent false keyword matches)
  if (p.includes('folder') || p.includes('directory') || p.includes('mkdir')) {
    let folderName = 'new_folder';
    const folderMatch = userPrompt.match(/(?:folder|directory)\s+["']?(?:named|called)?\s*["']?([a-zA-Z0-9_\-\s.]+?)["']?\s+(?:on|in|at|$)/i) ||
                        userPrompt.match(/(?:folder|directory)\s+([^\s]+)/i);
    if (folderMatch) {
      const candidate = folderMatch[1].trim();
      if (!stopWords.has(candidate.toLowerCase())) folderName = candidate;
    }
    const baseDir = resolveLocation(null);
    let targetPath = baseDir ? `${baseDir}\\${folderName}` : folderName;
    return {
      type: 'EXECUTE',
      target: `mkdir "${targetPath}"`
    };
  }

  // 2. Read / Open File Intent
  if (p.includes('read file') || p.includes('open file') || p.includes('show file') || p.includes('view file') || p.includes('content of')) {
    let filePath = 'sample_testing.txt';
    const fileMatch = userPrompt.match(/(?:file|read|open|show|view)\s+["']?([a-zA-Z0-9_\-\s.\\/:]+?)["']?\s+(?:on|in|at|$)/i);
    if (fileMatch && !stopWords.has(fileMatch[1].toLowerCase().trim())) {
      filePath = fileMatch[1].trim();
    }
    const readBase = resolveLocation(null);
    if (readBase) filePath = `${readBase}\\${filePath}`;
    return { type: 'READ_FILE', target: filePath };
  }

  // 3. Python code creation & execution (e.g. "write a python code that prints fibonacci series and run it")
  if ((p.includes('python') || p.includes('script') || p.includes('code') || p.includes('fibonacci')) && (p.includes('write') || p.includes('create') || p.includes('make') || p.includes('run') || p.includes('execute'))) {
    let scriptPath = 'fibonacci.py';
    const scriptBase = resolveLocation(null);
    if (scriptBase) scriptPath = `${scriptBase}\\fibonacci.py`;

    const pythonCode = `def fibonacci(n):\n    a, b = 0, 1\n    result = []\n    for _ in range(n):\n        result.append(a)\n        a, b = b, a + b\n    return result\n\nif __name__ == "__main__":\n    print("Fibonacci series (first 10 terms):", fibonacci(10))\n`;

    return {
      type: 'WRITE_FILE',
      targetPath: scriptPath,
      content: pythonCode,
      target: scriptPath,
      followUpCommand: `python "${scriptPath}"`
    };
  }

  // 4. Web Search
  if (p.includes('search web') || p.includes('search online') || p.startsWith('search ')) {
    const query = fallbackSearchQueryFromPrompt(userPrompt);
    return { type: 'SEARCH', target: query || userPrompt };
  }

  // 5. Create file / desktop file
  if (p.includes('create') || p.includes('make') || p.includes('write')) {
    if (p.includes('file') || p.includes('document') || p.includes('txt') || p.includes('desktop')) {
      let fileName = 'sample_testing.txt';
      const nameMatch = userPrompt.match(/(?:named|called|file)\s+["']?([a-zA-Z0-9_\-\s.]+?)["']?\s+(?:on|in|at|$)/i) ||
                        userPrompt.match(/(?:named|called)\s+([^\s]+)/i);
      if (nameMatch) {
        const rawName = nameMatch[1].trim();
        if (!stopWords.has(rawName.toLowerCase())) {
          fileName = rawName;
          if (!fileName.includes('.')) fileName += '.txt';
        }
      }

      const fileBase = resolveLocation(null);
      let targetPath = fileBase ? `${fileBase}\\${fileName}` : fileName;
      if (false) {  // resolveLocation already handled
      }

      return {
        type: 'WRITE_FILE',
        targetPath: targetPath,
        content: `Created by Ultron AI Agent on ${new Date().toLocaleString()}`,
        target: targetPath
      };
    }
  }

  // 6. List directory / files
  if (p.includes('list files') || p.includes('list directory') || p.includes('show files') || p.includes('list folder') || p.includes('dir')) {
    let targetDir = '.';
    if (p.includes('desktop')) targetDir = desktopDir;
    return { type: 'LIST_DIR', target: targetDir };
  }

  // 7. Command execution
  if (p.startsWith('run ') || p.startsWith('execute ')) {
    const cmd = userPrompt.replace(/^(run|execute)\s+/i, '').trim();
    return { type: 'EXECUTE', target: cmd };
  }

  return null;
}

async function runAgenticLoop(userPrompt, aiBubble, intent = 'action') {
  let steps = 0;
  const maxSteps = 8;
  let currentPrompt = userPrompt;
  let accumulatedContext = [];
  let isDone = false;
  let finalResponse = '';

  activeSubgoals = [
    { text: `Understand user request: "${userPrompt.substring(0, 35)}..."`, completed: true },
    { text: `Intent: ${intent}`, completed: true },
    { text: 'Executing task pipeline', completed: false }
  ];
  renderChecklist(activeSubgoals);

  // If intent is 'search', immediately do a web search first
  if (intent === 'search') {
    renderMessageContent(aiBubble, getWebSearchCardHtml('Refining search query with AI...'));
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    const searchQuery = await buildWebSearchQuery(userPrompt);

    renderMessageContent(aiBubble, getWebSearchCardHtml(searchQuery));
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    activeSubgoals.push({ text: `Web Search: "${searchQuery.substring(0, 25)}"`, completed: false });
    renderChecklist(activeSubgoals);
    
    let searchResult = null;
    try {
      const rawSearchResult = await window.ultronAPI.searchWeb(searchQuery);
      searchResult = normalizeSearchPayload(rawSearchResult, searchQuery);
      activeSubgoals[activeSubgoals.length - 1].completed = true;
      renderChecklist(activeSubgoals);

      if (shouldAskForSearchClarification(searchResult)) {
        finalResponse = searchResult.clarification || `I searched for "${searchQuery}", but the results were too thin to answer confidently. Can you add a brand, budget, location, or what kind of result you want?`;
      } else {
        const liveContext = searchContextForLLM(searchResult);
        const summarySystemPrompt = `You are Ultron, an intelligent, helpful AI assistant in a direct 1-on-1 conversation.
Use the provided live web information to answer clearly and accurately.

CRITICAL INSTRUCTIONS:
- Start with the answer itself. Do not describe what you are about to do.
- Never say "the user", "the user's question", "to answer", "based on the search results", or similar meta narration.
- Speak directly to the person chatting with you using "you" and "I".
- Synthesize the sources instead of dumping snippets.
- Only use facts present in the provided live information. If the live information is weak or incomplete, say what is missing and ask one concise follow-up question.
- Do NOT include hyperlinks or raw URLs in your answer. Verified source links are shown separately below your answer.
- Keep formatting clean with standard Markdown.
- Silently interpret and auto-correct any grammatical errors, spelling typos, or speech transcription mistakes in the user prompt without mentioning them.`;

        const summaryPrompt = `Original request:
${userPrompt}

Search query used:
${searchQuery}

Live information:
${liveContext}

Write the final answer now.`;

        let summary = await queryOfflineLLM(summaryPrompt, [], 'conversation', summarySystemPrompt);
        if (!summary || summary.trim() === '' || summary.includes('offline model loop failed')) {
          summary = `I found ${searchResult.results.length} live result${searchResult.results.length === 1 ? '' : 's'} for "${searchQuery}". Open the sources below to inspect the original pages.`;
        }

        finalResponse = sanitizeResponseText(summary, userPrompt, {
          allowedUrls: (searchResult.results || []).map(item => item.url).filter(Boolean)
        });
      }
    } catch (e) {
      finalResponse = `Web search failed: ${e.message}. Please try again.`;
    }

    activeSubgoals.push({ text: 'Task completed successfully', completed: true });
    renderChecklist(activeSubgoals);
    const richResponse = typeof searchResult !== 'undefined' && searchResult.results && searchResult.results.length > 0
      ? renderSearchExperience(finalResponse, searchResult)
      : finalResponse;
    await typeMessageResponse(aiBubble, richResponse, { instant: Boolean(isRichResultMarkup(richResponse)) });
    appendChatMessage('Ultron', richResponse, true, { skipRender: true });

    // Self-learning: record task outcome
    _learnedTaskMemory.push(`[SEARCH] Query: "${searchQuery.substring(0, 40)}" -> ${finalResponse.substring(0, 60)}...`);
    if (_learnedTaskMemory.length > 20) _learnedTaskMemory.shift();
    return;
  }

  while (steps < maxSteps && !isDone) {
    steps++;
    logTrace(`Agent Loop Step ${steps}/${maxSteps}...`, 'system');

    // 1. Query LLM for next step/action
    let rawResponse = await queryOfflineLLM(currentPrompt, accumulatedContext, intent);
    if (!rawResponse || typeof rawResponse !== 'string') {
      rawResponse = '';
    }

    rawResponse = rawResponse.replace(/\[your_name\]|\[Your Name\]|<your name>|\[Agent Name\]/gi, "Ultron");

    // 2. Parse for tool calls (with fallback intent steerer for small models like tinyllama)
    const toolCall = parseAgentToolCall(rawResponse, steps === 1 ? userPrompt : '');

    if (!toolCall) {
      // No tool calls: Task complete!
      isDone = true;
      finalResponse = rawResponse || "Task completed successfully.";
      break;
    }

    // 3. Execute tool based on tool type
    logTrace(`Agent Action Step ${steps}: Executing ${toolCall.type} (${toolCall.target.substring(0, 40)}...)`, 'local');
    
    activeSubgoals.push({
      text: `Step ${steps}: ${toolCall.type} "${toolCall.target.substring(0, 25)}"`,
      completed: true
    });
    renderChecklist(activeSubgoals);

    renderMessageContent(aiBubble, getStepExecCardHtml(steps, toolCall.type, toolCall.target));
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    let toolResult = '';
    const withTimeout = (promise, ms = 15000) => {
      const timeout = new Promise(resolve => setTimeout(() => resolve({ success: false, error: `Execution Timed Out (${ms / 1000}s limit reached).` }), ms));
      return Promise.race([promise, timeout]);
    };
    
    if (toolCall.type === 'EXECUTE') {
      const execRes = await withTimeout(window.ultronAPI.executeAction({ command: toolCall.target }));
      if (execRes.success) {
        toolResult = `Command output:\n\`\`\`text\n${execRes.stdout || 'Success (No Output)'}\n\`\`\``;
        if (execRes.stderr) toolResult += `\nStderr:\n\`\`\`text\n${execRes.stderr}\n\`\`\``;
        if (toolCall.target.startsWith('mkdir')) {
          finalResponse = `Folder created successfully on computer at **${toolCall.target.replace('mkdir ', '').replace(/"/g, '')}**.`;
          isDone = true;
        }
      } else {
        toolResult = `Command failed with error: ${execRes.error}`;
        finalResponse = `Failed to execute action: ${execRes.error}`;
        isDone = true;
      }
    } else if (toolCall.type === 'WRITE_FILE') {
      const writeRes = await withTimeout(window.ultronAPI.writeFile(toolCall.targetPath, toolCall.content));
      if (writeRes.success) {
        toolResult = `File written successfully to ${writeRes.filePath}`;
        finalResponse = `File created successfully on computer at **${writeRes.filePath}**.`;
        if (toolCall.followUpCommand) {
          renderMessageContent(aiBubble, getStepExecCardHtml(steps, 'EXECUTE', toolCall.followUpCommand));
          chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
          const execRes = await withTimeout(window.ultronAPI.executeAction({ command: toolCall.followUpCommand }));
          if (execRes.success) {
            toolResult += `\n\nExecution Output:\n\`\`\`text\n${execRes.stdout || 'Success (No Output)'}\n\`\`\``;
            finalResponse += `\n\n**Execution Output:**\n\`\`\`text\n${execRes.stdout || 'Done'}\n\`\`\``;
          }
        }
        isDone = true;
      } else {
        toolResult = `Failed to write file: ${writeRes.error}`;
        finalResponse = `Failed to write file: ${writeRes.error}`;
        isDone = true;
      }
    } else if (toolCall.type === 'READ_FILE') {
      const readRes = await withTimeout(window.ultronAPI.readFile(toolCall.target));
      if (readRes.success) {
        toolResult = `File content of ${readRes.filePath}:\n\`\`\`text\n${readRes.content}\n\`\`\``;
        finalResponse = `**File Content (${readRes.filePath}):**\n\`\`\`text\n${readRes.content}\n\`\`\``;
        isDone = true;
      } else {
        toolResult = `Failed to read file: ${readRes.error}`;
        finalResponse = `Failed to read file: ${readRes.error}`;
        isDone = true;
      }
    } else if (toolCall.type === 'LIST_DIR') {
      const listRes = await withTimeout(window.ultronAPI.listDir(toolCall.target));
      if (listRes.success) {
        const fileNames = listRes.items.map(i => `${i.isDirectory ? '[DIR]' : '[FILE]'} ${i.name}`).join('\n');
        toolResult = `Directory listing for ${listRes.dirPath}:\n\`\`\`text\n${fileNames}\n\`\`\``;
        finalResponse = `**Directory Contents (${listRes.dirPath}):**\n\`\`\`text\n${fileNames}\n\`\`\``;
        isDone = true;
      } else {
        toolResult = `Failed to list directory: ${listRes.error}`;
        finalResponse = `Failed to list directory: ${listRes.error}`;
        isDone = true;
      }
    } else if (toolCall.type === 'SEARCH') {
      const searchTarget = await buildWebSearchQuery(toolCall.target || userPrompt);
      renderMessageContent(aiBubble, getWebSearchCardHtml(searchTarget));
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

      const searchRes = await withTimeout(window.ultronAPI.searchWeb(searchTarget), 20000);
      const searchPayload = normalizeSearchPayload(searchRes, searchTarget);
      toolResult = searchContextForLLM(searchPayload) || `Web search failed.`;
      if (!shouldAskForSearchClarification(searchPayload)) {
        const summarySystemPrompt = `You are Ultron in a direct 1-on-1 conversation.
Use the live information to answer the request naturally.
Never say "the user", "the user's question", "to answer", "based on the search results", or similar meta narration.
Only use facts present in the live information. If details are missing, say what is missing and ask one concise follow-up question.
Do NOT include hyperlinks or raw URLs in your answer. Verified source links are shown separately below your answer.
Start with the answer itself and keep the tone clear, useful, and concise.`;
        const summaryPrompt = `Original request:
${userPrompt}

Search query used:
${searchTarget}

Live information:
${toolResult}

Write the final answer now.`;

        const summary = await queryOfflineLLM(summaryPrompt, [], 'conversation', summarySystemPrompt);
        const answer = sanitizeResponseText(summary || `I found ${searchPayload.results.length} live results for "${searchTarget}".`, userPrompt, {
          allowedUrls: (searchPayload.results || []).map(item => item.url).filter(Boolean)
        });
        finalResponse = renderSearchExperience(answer, searchPayload);
      } else {
        finalResponse = searchPayload.clarification || `I searched for "${searchTarget}", but the results were too thin to answer confidently. Can you add a brand, budget, location, or what kind of result you want?`;
      }
      isDone = true;
    }

    // 4. Append observation to context for self-correction feedback loop
    accumulatedContext.push({ role: 'assistant', content: rawResponse });
    accumulatedContext.push({ role: 'user', content: `[Observation / System Result]:\n${toolResult}\n\nContinue toward completing the user's task.` });
    
    currentPrompt = `[Observation / System Result]:\n${toolResult}\n\nContinue toward completing the user's task.`;
  }

  activeSubgoals.push({ text: 'Task completed successfully', completed: true });
  renderChecklist(activeSubgoals);

  await typeMessageResponse(aiBubble, finalResponse, { instant: isRichResultMarkup(finalResponse) });
  appendChatMessage('Ultron', finalResponse, true, { skipRender: true });

  // Self-learning: record task outcome
  const taskSummary = `[${intent.toUpperCase()}] "${userPrompt.substring(0, 40)}" → ${finalResponse.substring(0, 60).replace(/\n/g, ' ')}...`;
  _learnedTaskMemory.push(taskSummary);
  if (_learnedTaskMemory.length > 20) _learnedTaskMemory.shift();
}

// Load historical conversation session
function loadSession(id, title) {
  const chatMain = document.querySelector('.chat-main');
  
  try {
    if (id && conversationsStore[id]) {
      currentSessionId = id;
      chatMessagesContainer.innerHTML = '';
      
      const savedSession = conversationsStore[id];
      if (savedSession && Array.isArray(savedSession.messages) && savedSession.messages.length > 0) {
        if (chatMain) chatMain.classList.remove('empty-state');
        for (const msg of savedSession.messages) {
          renderChatMessage(msg.sender, msg.text, msg.sender === 'Ultron');
        }
      } else {
        if (chatMain) chatMain.classList.add('empty-state');
        updateWelcomeGreeting();
      }
    }
  } catch (err) {
    logTrace(`Error loading session messages: ${err.message}`, 'system');
  }
  
  if (activeChatTitle) activeChatTitle.textContent = title;
  setSendingState(false);
  
  try {
    const savedSession = conversationsStore[id];
    if (savedSession && Array.isArray(savedSession.messages) && savedSession.messages.length > 0) {
      // Redraw saved conversation history
      savedSession.messages.forEach(msg => {
        renderChatMessage(msg.sender, msg.text, msg.isAi);
      });
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
      
      activeSubgoals = [
        { text: `Loaded chat context: "${title}"`, completed: true },
        { text: 'Awaiting local prompt commands', completed: false }
      ];
    } else {
      // Fallback loading template if empty
      renderChatMessage('Ultron', 'This chat has no saved messages yet.', true);
      activeSubgoals = [
        { text: 'Loaded historical session', completed: true },
        { text: 'Awaiting local prompt commands', completed: false }
      ];
    }
  } catch (err) {
    logTrace(`Error loading session messages: ${err.message}`, 'system');
    renderChatMessage('Ultron', `Failed to load conversation messages: ${err.message}`, true);
  }
  renderChecklist(activeSubgoals);
}

// Promise-based Delete Confirmation Dialog Modal popup
function showDeleteConfirmation(modelName) {
  return new Promise((resolve) => {
    const modal = document.getElementById('delete-confirm-modal');
    const confirmText = document.getElementById('delete-confirm-text');
    const btnConfirm = document.getElementById('btn-delete-confirm');
    const btnCancel = document.getElementById('btn-delete-cancel');
    
    if (!modal || !confirmText || !btnConfirm || !btnCancel) {
      resolve(confirm(`Are you sure you want to delete "${modelName}" model weights?`));
      return;
    }
    
    confirmText.textContent = `Are you sure you want to delete the offline model weights for "${modelName}"? This action cannot be undone.`;
    modal.classList.remove('hidden');
    
    const onConfirm = (e) => {
      e.stopPropagation();
      cleanup();
      resolve(true);
    };
    
    const onCancel = (e) => {
      e.stopPropagation();
      cleanup();
      resolve(false);
    };
    
    const cleanup = () => {
      modal.classList.add('hidden');
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
    };
    
    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
  });
}

// Populate Models Settings list
function renderSettingsModels() {
  settingsModelsList.innerHTML = '';
  
  // 2. Render downloaded models
  if (installedModelsList.length === 0) {
    settingsModelsList.innerHTML = `
      <div style="border: 1px dashed var(--border-color); background: rgba(255,255,255,0.02); border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 8px;">
        <p style="font-size: 13px; color: var(--accent-white); font-weight: 500; margin: 0 0 6px 0;">No local model weights installed yet</p>
        <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 14px 0;">Click below to download <strong>tinyllama</strong> (637 MB) to start chatting offline with Ultron.</p>
        <button id="btn-quick-download-tinyllama" class="btn-primary-sm" style="background-color: #ffffff !important; color: #000000 !important; font-weight: 600; padding: 6px 16px; font-size: 12px; border-radius: 6px; cursor: pointer; border: none;">
          Download tinyllama (637 MB)
        </button>
      </div>
    `;
    
    setTimeout(() => {
      const btnQuick = document.getElementById('btn-quick-download-tinyllama');
      if (btnQuick) {
        btnQuick.addEventListener('click', () => {
          const btnShow = document.getElementById('btn-show-download-fields');
          const inputsRow = document.getElementById('download-inputs-row');
          const inputModel = document.getElementById('input-download-model');
          const btnDownload = document.getElementById('btn-download-model');
          
          if (btnShow) btnShow.style.display = 'none';
          if (inputsRow) inputsRow.classList.remove('hidden');
          if (inputModel) inputModel.value = 'tinyllama';
          if (btnDownload) btnDownload.click();
        });
      }
    }, 0);
    return;
  }
  
  installedModelsList.forEach(model => {
    const item = document.createElement('div');
    item.className = 'model-list-item';
    
    // Check compatibility based on model size or type
    let compatLabel = 'Compatible';
    let compatClass = 'compatible';
    
    if (model.name.includes(activeModel)) {
      compatLabel = 'Recommended';
      compatClass = 'recommended';
    } else if (model.size > 8 * 1024 * 1024 * 1024) { // Larger than 8GB
      compatLabel = 'High Resource (Slow)';
      compatClass = 'incompatible';
    }
    
    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span><strong>${model.name}</strong> (${(model.size / (1024*1024*1024)).toFixed(1)} GB)</span>
          <span class="model-compat-badge ${compatClass}">${compatLabel}</span>
        </div>
        <button class="btn-delete-model btn-icon" data-model="${model.name}" style="background: transparent; border: none; padding: 4px 8px; cursor: pointer; color: #ef4444; font-size: 11px; font-weight: 500; display: flex; align-items: center; gap: 4px; transition: opacity 0.2s;" title="Delete this model">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          Delete
        </button>
      </div>
    `;
    
    // Bind delete button handler
    const btnDelete = item.querySelector('.btn-delete-model');
    if (btnDelete) {
      btnDelete.addEventListener('click', async (e) => {
        e.stopPropagation();
        const modelToDelete = e.currentTarget.getAttribute('data-model');
        const confirmed = await showDeleteConfirmation(modelToDelete);
        if (confirmed) {
          logTrace(`Deleting model weights: "${modelToDelete}"...`, 'system');
          const deleteRes = await window.ultronAPI.deleteModel(modelToDelete);
          if (deleteRes.success) {
            logTrace(`Successfully deleted model "${modelToDelete}" from Ollama.`, 'system');
            alert(`Model "${modelToDelete}" deleted.\n\nTo run this delete command from the CLI, execute:\nollama rm ${modelToDelete}`);
            
            // Refresh models list
            await runOnboardingProfiler();
            renderSettingsModels();
          } else {
            logTrace(`Failed to delete model weights: ${deleteRes.error}`, 'system');
            alert(`Failed to delete model: ${deleteRes.error}`);
          }
        }
      });
    }
    
    settingsModelsList.appendChild(item);
  });
}

// Helper to render high-fidelity brand SVGs for common apps next to names
function getAppIconSvg(appName) {
  const name = appName.toLowerCase();
  if (name.includes('chrome')) {
    return `<svg class="app-icon" viewBox="0 0 24 24" width="18" height="18">
      <circle cx="12" cy="12" r="10" fill="#f4b400"/>
      <path d="M12 2a10 10 0 0 0-8.66 5h8.66l4.33-7.5A10 10 0 0 0 12 2z" fill="#db4437"/>
      <path d="M3.34 7a10 10 0 0 0 .99 10L8.66 9.5H3.34z" fill="#0f9d58"/>
      <path d="M12 22a10 10 0 0 0 8.66-5H12l-4.33 7.5a10 10 0 0 0 4.33.58z" fill="#4285f4"/>
      <circle cx="12" cy="12" r="4" fill="#ffffff"/>
      <circle cx="12" cy="12" r="3" fill="#4285f4"/>
    </svg>`;
  } else if (name.includes('code') || name.includes('visual studio')) {
    return `<svg class="app-icon" viewBox="0 0 24 24" width="18" height="18" fill="#007acc">
      <path d="M23.9 6.5l-5.6-5.4c-.4-.4-1.1-.4-1.5 0L10.3 7.6l-5.4-4c-.4-.3-1-.3-1.4.1L.3 6.5c-.4.4-.4 1.1 0 1.5l5.2 3.8L.3 15.6c-.4.4-.4 1.1 0 1.5l3.2 2.8c.4.4 1 .4 1.4.1l5.4-4 6.5 6.5c.4.4 1.1.4 1.5 0l5.6-5.4c.4-.4.4-1.1 0-1.5V8c.1-.5.1-1.1-.2-1.5zM17 17.5v-11l-6.2 5.5 6.2 5.5z"/>
    </svg>`;
  } else if (name.includes('obsidian')) {
    return `<svg class="app-icon" viewBox="0 0 24 24" width="18" height="18" fill="#8b5cf6">
      <path d="M12 2L4 7l2 11 6 4 6-4 2-11-8-5zM9 9l6 3-3 5-3-8z"/>
    </svg>`;
  } else if (name.includes('git')) {
    return `<svg class="app-icon" viewBox="0 0 24 24" width="18" height="18" fill="#f05032">
      <path d="M23.3 11.2L12.8.7c-.8-.8-2-.8-2.8 0L.7 10.7c-.8.8-.8 2 0 2.8l10.5 10.5c.8.8 2 .8 2.8 0l10.5-10.5c.9-.8.9-2-.2-2.8zM12 18.2c-.7 0-1.2-.5-1.2-1.2 0-.3.1-.6.3-.8l-2.3-2.3c-.2.2-.5.3-.8.3-.7 0-1.2-.5-1.2-1.2s.5-1.2 1.2-1.2c.3 0 .6.1.8.3l2.3-2.3c-.1-.2-.2-.5-.2-.8 0-.7.5-1.2 1.2-1.2s1.2.5 1.2 1.2c0 .5-.3.9-.7 1.1v4.2c.4.2.7.6.7 1.1 0 .7-.5 1.3-1.2 1.3z"/>
    </svg>`;
  } else if (name.includes('python')) {
    return `<svg class="app-icon" viewBox="0 0 24 24" width="18" height="18">
      <path d="M12 2c-3.1 0-4 .9-4 4v2h8V6c0-3.1-.9-4-4-4z" fill="#3776ab"/>
      <path d="M12 22c3.1 0 4-.9 4-4v-2H8v2c0 3.1.9 4 4 4z" fill="#ffd343"/>
      <path d="M8 8H6c-3.1 0-4 .9-4 4s.9 4 4 4h2v-8z" fill="#3776ab"/>
      <path d="M16 8h2c3.1 0 4 .9 4 4s-.9 4-4 4h-2V8z" fill="#ffd343"/>
    </svg>`;
  } else if (name.includes('notepad')) {
    return `<svg class="app-icon" viewBox="0 0 24 24" width="18" height="18">
      <rect x="4" y="4" width="16" height="16" rx="2" ry="2" fill="#0077b6"/>
      <text x="5" y="15" fill="#ffffff" font-size="8" font-weight="bold">N++</text>
    </svg>`;
  } else {
    return `<svg class="app-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9"></line>
      <line x1="9" y1="21" x2="9" y2="9"></line>
    </svg>`;
  }
}

// Populate Apps Settings Checklist list (includes brand SVGs next to names)
async function renderSettingsApps() {
  settingsAppsList.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px; color: var(--text-muted); font-size: 13px;">
      <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20" style="color: #ffffff;">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" fill="none"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" fill="none"></path>
      </svg>
      <span>Scanning local applications...</span>
    </div>
  `;
  const appsSearchInput = document.getElementById('apps-search');
  if (appsSearchInput) appsSearchInput.value = '';
  logTrace('Scanning host application shortcuts...', 'system');
  
  const result = await window.ultronAPI.getInstalledApps();
  settingsAppsList.innerHTML = '';
  
  if (result.success && Array.isArray(result.apps) && result.apps.length > 0) {
    result.apps.forEach(app => {
      const item = document.createElement('div');
      item.className = 'app-list-item';
      
      const isSelected = ['Google Chrome', 'Visual Studio Code', 'Obsidian', 'Git Bash'].includes(app.name);
      
      const iconMarkup = app.icon 
        ? `<img class="app-icon" src="${app.icon}" alt="${app.name}" style="width: 18px; height: 18px; object-fit: contain;">` 
        : getAppIconSvg(app.name);
      
      item.innerHTML = `
        <input type="checkbox" class="app-item-checkbox" id="chk-app-${app.name.replace(/[^a-zA-Z0-9-]/g, '-')}" ${isSelected ? 'checked' : ''}>
        ${iconMarkup}
        <label for="chk-app-${app.name.replace(/[^a-zA-Z0-9-]/g, '-')}">${escapeHtml(app.name)}</label>
      `;

      const chk = item.querySelector('.app-item-checkbox');
      if (chk) {
        chk.addEventListener('change', () => {
          updateMarkAllCheckboxState();
        });
      }

      settingsAppsList.appendChild(item);
    });

    updateMarkAllCheckboxState();
  } else {
    settingsAppsList.innerHTML = `<div class="text-xs text-muted p-4" style="text-align: center;">No local application shortcuts found.</div>`;
  }
}

function updateMarkAllCheckboxState() {
  const chkMarkAllApps = document.getElementById('chk-mark-all-apps');
  if (!chkMarkAllApps || !settingsAppsList) return;
  const allBoxes = settingsAppsList.querySelectorAll('.app-item-checkbox');
  if (allBoxes.length === 0) return;
  const checkedCount = Array.from(allBoxes).filter(b => b.checked).length;
  chkMarkAllApps.checked = checkedCount === allBoxes.length;
}

// Bind Settings Tab Switch Actions
const settingsTabs = document.querySelectorAll('.settings-tab-btn');
settingsTabs.forEach(tab => {
  tab.addEventListener('click', async () => {
    settingsTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    const targetTab = tab.getAttribute('data-tab');
    const panes = document.querySelectorAll('.tab-pane');
    panes.forEach(pane => pane.classList.add('hidden'));
    
    const activePane = document.getElementById(`tab-${targetTab}`);
    if (activePane) {
      activePane.classList.remove('hidden');
    }
    
    // Tab-specific loads
    if (targetTab === 'models') {
      refreshOllamaStatus();
    } else if (targetTab === 'apps') {
      renderSettingsApps();
    } else if (targetTab === 'storage') {
      if (settingMemoryToggle) {
        const isMemoryEnabled = window.localStorage.getItem('ultron-memory-enabled') !== 'false';
        settingMemoryToggle.checked = isMemoryEnabled;
      }
      if (settingDataDir) {
        const storedPath = window.localStorage.getItem('ultron-data-dir');
        if (storedPath) {
          settingDataDir.value = storedPath;
        } else {
          const defaultPath = await window.ultronAPI.getDefaultDataDir();
          settingDataDir.value = defaultPath;
          window.localStorage.setItem('ultron-data-dir', defaultPath);
          await window.ultronAPI.updateDataDir(defaultPath);
        }
      }
      updateMemoryUIState();
    }
  });
});

// Bind refresh button click
const btnRefreshOllama = document.getElementById('btn-refresh-ollama');
if (btnRefreshOllama) {
  btnRefreshOllama.addEventListener('click', async (e) => {
    e.stopPropagation();
    await refreshOllamaStatus();
  });
}

// Bind Ollama silent package install (uses checked flow)
btnInstallOllama.addEventListener('click', async () => {
  await startOllamaInstallFlow(btnInstallOllama);
});

const btnBannerInstall = document.getElementById('btn-banner-download-install');
if (btnBannerInstall) {
  btnBannerInstall.addEventListener('click', async () => {
    await startOllamaInstallFlow(btnBannerInstall);
  });
}

const btnBannerClose = document.getElementById('btn-banner-close');
if (btnBannerClose) {
  btnBannerClose.addEventListener('click', () => {
    hideOllamaBanner();
  });
}

let activeDownloadingModel = null;

// Bind model downloader
btnDownloadModel.addEventListener('click', async () => {
  const modelName = inputDownloadModel.value.trim();
  if (!modelName) return;
  
  activeDownloadingModel = modelName;
  const inputsRow = document.getElementById('download-inputs-row');
  const progressContainer = document.getElementById('download-progress-container');
  const progressStatus = document.getElementById('download-progress-status');
  const progressStats = document.getElementById('download-progress-stats');
  const progressBar = document.getElementById('download-progress-bar');
  const progressSpeed = document.getElementById('download-progress-speed');
  const btnCancelDownload = document.getElementById('btn-cancel-download');
  
  if (btnCancelDownload) {
    btnCancelDownload.disabled = false;
    btnCancelDownload.textContent = 'Cancel';
  }

  const online = await checkOnlineStatus();
  if (!online) {
    logTrace('Model download aborted: User is offline.', 'system');
    showOllamaBanner('warning', 'Offline: Connection required to download model weights.', true);
    activeDownloadingModel = null;
    return;
  }
  
  logTrace(`Triggering background weight pull: "ollama pull ${modelName}"`, 'system');
  
  const btnShowDownload = document.getElementById('btn-show-download-fields');
  if (btnShowDownload) {
    btnShowDownload.style.setProperty('display', 'none', 'important');
    btnShowDownload.classList.add('hidden');
  }
  if (inputsRow) {
    inputsRow.style.setProperty('display', 'none', 'important');
    inputsRow.classList.add('hidden');
  }
  if (progressContainer) {
    progressContainer.style.setProperty('display', 'block', 'important');
    progressContainer.classList.remove('hidden');
    progressStatus.textContent = `Initiating pull for ${modelName}...`;
    progressStats.textContent = `0% (0 MB / 0 MB)`;
    progressBar.style.width = '0%';
    progressSpeed.textContent = 'Speed: --';
  }
  
  // Start real-time progress push listener
  const cleanProgressEvent = window.ultronAPI.onDownloadProgress((data) => {
    if (data.modelName.toLowerCase() === modelName.toLowerCase()) {
      if (progressBar) progressBar.style.width = `${data.percent}%`;
      if (progressStats) {
        progressStats.textContent = `${data.percent}% (${data.downloaded || '0 MB'} / ${data.total || '0 MB'})`;
      }
      if (progressStatus) progressStatus.textContent = `Downloading ${data.modelName}...`;
      if (progressSpeed) {
        progressSpeed.textContent = data.speed ? `Speed: ${data.speed}` : 'Speed: --';
      }
    }
  });
  
  try {
    const result = await window.ultronAPI.downloadModel(modelName);
    if (result.success) {
      logTrace(`Model weights for "${modelName}" pulled successfully!`, 'system');
      alert(`Model weights for "${modelName}" pulled successfully!\n\nTo run this model manually from the command line, run:\nollama run ${modelName}`);
      inputDownloadModel.value = '';
      
      // Refresh profiling and settings list
      await runOnboardingProfiler();
      renderSettingsModels();
    } else if (result.cancelled) {
      logTrace(`Model pull for "${modelName}" was cancelled by user.`, 'system');
    } else {
      logTrace(`Failed to download weights: ${result.error}`, 'system');
      alert(`Failed to download weights: ${result.error}`);
    }
  } catch (err) {
    logTrace(`Download error: ${err.message}`, 'system');
    alert(`Download error: ${err.message}`);
  } finally {
    activeDownloadingModel = null;
    // Unsubscribe from real-time events
    cleanProgressEvent();
    
    // Hide progress bar container and restore initial trigger button
    if (progressContainer) {
      progressContainer.style.setProperty('display', 'none', 'important');
      progressContainer.classList.add('hidden');
    }
    if (btnShowDownload) {
      btnShowDownload.style.setProperty('display', 'flex', 'important');
      btnShowDownload.classList.remove('hidden');
    }
    if (inputsRow) {
      inputsRow.style.setProperty('display', 'none', 'important');
      inputsRow.classList.add('hidden');
    }
  }
});

// Bind cancel download button
const btnCancelDownload = document.getElementById('btn-cancel-download');
if (btnCancelDownload) {
  btnCancelDownload.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!activeDownloadingModel) return;
    logTrace(`Cancelling model download process for "${activeDownloadingModel}"...`, 'system');
    btnCancelDownload.disabled = true;
    btnCancelDownload.textContent = 'Cancelling...';
    try {
      await window.ultronAPI.cancelDownloadModel(activeDownloadingModel);
    } catch (err) {
      console.warn('Cancel download error:', err);
    }
  });
}

// ==========================================
// POPULAR OLLAMA MODELS CATALOG DATA & CONTROLLER
// ==========================================
// ==========================================
// POPULAR OLLAMA MODELS CATALOG DATA & CONTROLLER
// ==========================================
const OLLAMA_POPULAR_MODELS = [
  { name: 'llama3:latest', size: '8B', downloadSize: '4.7 GB', desc: 'Meta flagship open model for general AI tasks' },
  { name: 'mistral:latest', size: '7B', downloadSize: '4.1 GB', desc: 'Fast, high-accuracy general AI model by Mistral AI' },
  { name: 'phi3:latest', size: '3.8B', downloadSize: '2.2 GB', desc: 'Microsoft high-efficiency reasoning & logic model' },
  { name: 'gemma2:latest', size: '9B', downloadSize: '5.4 GB', desc: 'Google state-of-the-art open model with high precision' },
  { name: 'qwen2.5:latest', size: '7B', downloadSize: '4.7 GB', desc: 'Alibaba top-tier reasoning, math, and code model' },
  { name: 'deepseek-r1:latest', size: '7B', downloadSize: '4.7 GB', desc: 'DeepSeek advanced reasoning & chain-of-thought model' },
  { name: 'llava:latest', size: '7B', downloadSize: '4.5 GB', desc: 'Multimodal vision + text model for analyzing images' },
  { name: 'nomic-embed-text:latest', size: '137M', downloadSize: '274 MB', desc: 'High performance text embedding & retrieval model' },
  { name: 'codellama:latest', size: '7B', downloadSize: '3.8 GB', desc: 'Meta specialized model for code generation & debugging' },
  { name: 'tinyllama:latest', size: '1.1B', downloadSize: '637 MB', desc: 'Ultra lightweight model for low resource PCs' },
  { name: 'llama3.2:1b', size: '1B', downloadSize: '1.3 GB', desc: 'Meta ultra-fast 1B model for rapid responses' },
  { name: 'llama3.2:3b', size: '3B', downloadSize: '2.0 GB', desc: 'Meta balanced 3B compact model' },
  { name: 'qwen2:7b', size: '7B', downloadSize: '4.4 GB', desc: 'Alibaba Qwen2 general intelligence model' },
  { name: 'starcoder2:latest', size: '3B', downloadSize: '1.7 GB', desc: 'BigCode high-speed code assistant' },
  { name: 'vicuna:latest', size: '7B', downloadSize: '3.8 GB', desc: 'LMSYS chat & conversation fine-tuned model' },
  { name: 'wizardlm2:latest', size: '7B', downloadSize: '4.1 GB', desc: 'Microsoft WizardLM2 complex reasoning model' },
  { name: 'orca-mini:latest', size: '3B', downloadSize: '1.9 GB', desc: 'Compact reasoning model for lightweight hardware' },
  { name: 'zephyr:latest', size: '7B', downloadSize: '4.1 GB', desc: 'HuggingFace direct preference optimized chat model' },
  { name: 'dolphin-mixtral:latest', size: '8x7B', downloadSize: '26 GB', desc: 'Dolphin uncensored conversational model' }
];

let catalogLimit = 10;

function renderOllamaCatalog(filterQuery = '') {
  const catalogListEl = document.getElementById('ollama-catalog-list');
  const btnLoadMore = document.getElementById('btn-load-more-models');
  if (!catalogListEl) return;

  catalogListEl.innerHTML = '';
  const query = filterQuery.toLowerCase().trim();

  // Filter models if user is typing search query
  let filtered = OLLAMA_POPULAR_MODELS.filter(m => 
    !query || m.name.toLowerCase().includes(query) || m.desc.toLowerCase().includes(query)
  );

  // If user searched for a custom model tag not in standard catalog, add a custom pull card!
  if (query && filtered.length === 0 && !query.includes(' ')) {
    filtered = [{
      name: query,
      size: 'Custom Tag',
      downloadSize: 'Ollama Library',
      desc: `Pull custom model "${query}" directly from Ollama repository`
    }];
  }

  const visible = query ? filtered : filtered.slice(0, catalogLimit);

  if (visible.length === 0) {
    catalogListEl.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); padding: 8px 0; text-align: center;">
        No catalog match for "${escapeHtml(query)}". Type a valid model tag (e.g. <b>gemma:2b</b>) and click <b>Pull Tag</b>.
      </div>
    `;
    if (btnLoadMore) btnLoadMore.style.display = 'none';
    return;
  }

  // Check installed model names
  const installedNames = new Set((installedModelsList || []).map(m => (typeof m === 'string' ? m : m.name).toLowerCase()));

  visible.forEach(model => {
    const isInstalled = installedNames.has(model.name.toLowerCase());

    const card = document.createElement('div');
    card.className = 'catalog-model-card';
    card.innerHTML = `
      <div class="catalog-model-info">
        <div class="catalog-model-title-row">
          <span class="catalog-model-name">${escapeHtml(model.name)}</span>
          <span class="catalog-model-badge">${escapeHtml(model.size)}</span>
          <span class="catalog-model-size-badge">📦 ${escapeHtml(model.downloadSize || 'Est. ~4 GB')}</span>
        </div>
        <div class="catalog-model-desc">${escapeHtml(model.desc)}</div>
      </div>
      ${isInstalled 
        ? `<span class="badge-installed">INSTALLED</span>` 
        : `<button class="btn-catalog-pull" data-model="${escapeHtml(model.name)}">Download</button>`
      }
    `;

    const pullBtn = card.querySelector('.btn-catalog-pull');
    if (pullBtn) {
      pullBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (inputDownloadModel) {
          inputDownloadModel.value = model.name;
          btnDownloadModel.click();
        }
      });
    }

    catalogListEl.appendChild(card);
  });

  if (btnLoadMore) {
    if (!query && catalogLimit < OLLAMA_POPULAR_MODELS.length) {
      btnLoadMore.style.display = 'block';
    } else {
      btnLoadMore.style.display = 'none';
    }
  }
}

// Bind show download fields trigger
const btnShowDownloadFields = document.getElementById('btn-show-download-fields');
if (btnShowDownloadFields) {
  btnShowDownloadFields.addEventListener('click', () => {
    btnShowDownloadFields.style.display = 'none';
    const inputsRow = document.getElementById('download-inputs-row');
    if (inputsRow) {
      inputsRow.classList.remove('hidden');
      catalogLimit = 10;
      renderOllamaCatalog();
      inputDownloadModel.focus();
    }
  });
}

// Bind catalog Load More button
const btnLoadMoreModels = document.getElementById('btn-load-more-models');
if (btnLoadMoreModels) {
  btnLoadMoreModels.addEventListener('click', (e) => {
    e.preventDefault();
    catalogLimit += 10;
    renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');
  });
}

// Bind catalog search input filter
if (inputDownloadModel) {
  inputDownloadModel.addEventListener('input', () => {
    renderOllamaCatalog(inputDownloadModel.value);
  });
}

// Bind Apps search query input
const appsSearchInput = document.getElementById('apps-search');
if (appsSearchInput) {
  appsSearchInput.addEventListener('input', () => {
    const query = appsSearchInput.value.toLowerCase().trim();
    settingsAppsList.querySelectorAll('.app-list-item').forEach(item => {
      const label = item.querySelector('label');
      if (label) {
        const text = label.textContent.toLowerCase();
        if (text.includes(query)) {
          item.style.display = 'flex';
        } else {
          item.style.display = 'none';
        }
      }
    });
  });
}

// Bind Mark All Apps checkbox
const chkMarkAllApps = document.getElementById('chk-mark-all-apps');
const btnMarkAllLabel = document.getElementById('btn-mark-all-apps-label');

function toggleAllAppsSelection(targetState) {
  if (!settingsAppsList) return;
  const appCheckboxes = settingsAppsList.querySelectorAll('.app-item-checkbox');
  appCheckboxes.forEach(chk => {
    chk.checked = targetState;
  });
  if (chkMarkAllApps) chkMarkAllApps.checked = targetState;
}

if (chkMarkAllApps) {
  chkMarkAllApps.addEventListener('change', (e) => {
    e.stopPropagation();
    toggleAllAppsSelection(chkMarkAllApps.checked);
  });
}

if (btnMarkAllLabel) {
  btnMarkAllLabel.addEventListener('click', (e) => {
    if (e.target !== chkMarkAllApps) {
      e.preventDefault();
      if (chkMarkAllApps) {
        chkMarkAllApps.checked = !chkMarkAllApps.checked;
        toggleAllAppsSelection(chkMarkAllApps.checked);
      }
    }
  });
}

// Bind clicks & enter key to send
btnSend.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (isAwaitingResponse) return;
  submitPrompt();
});

// Support Enter to submit, and Shift+Enter to create a new line
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    e.stopPropagation();
    if (isAwaitingResponse) return;
    submitPrompt();
  }
});

// Auto-expand input box height dynamically while typing
// Auto-expand input box height dynamically while typing and on focus/change
const adjustInputHeight = () => {
  chatInput.style.height = '';
  const scrollHeight = chatInput.scrollHeight;
  const newHeight = Math.max(Math.min(scrollHeight, 138), 33);
  chatInput.style.height = `${newHeight}px`;
  logTrace(`Input height recalculated: scrollHeight=${scrollHeight}px, applied=${newHeight}px`, 'system');
};

chatInput.addEventListener('input', adjustInputHeight);
chatInput.addEventListener('change', adjustInputHeight);
chatInput.addEventListener('focus', adjustInputHeight);
chatInput.addEventListener('keyup', adjustInputHeight);

// New Chat Trigger handler
const triggerNewChat = () => {
  chatMessagesContainer.innerHTML = '';
  currentSessionId = null;
  setSendingState(false);
  
  const chatMain = document.querySelector('.chat-main');
  if (chatMain) {
    chatMain.classList.add('empty-state');
  }
  updateWelcomeGreeting();
  
  logTrace('New chat isolation workspace container generated.', 'system');
  activeSubgoals = [
    { text: 'Awaiting local prompt commands', completed: false }
  ];
  renderChecklist(activeSubgoals);
  
  if (activeChatTitle) activeChatTitle.textContent = 'New chat';
  
  // Remove active highlight from all history items
  const sessionHistoryList = document.getElementById('session-history-list');
  if (sessionHistoryList) {
    const items = sessionHistoryList.querySelectorAll('.nav-item');
    items.forEach(i => i.classList.remove('active'));
  }
};

if (btnNewChat) btnNewChat.addEventListener('click', triggerNewChat);
if (btnNewSession) btnNewSession.addEventListener('click', triggerNewChat);

function getUserInitials() {
  const name = window.localStorage.getItem('ultron-user-name') || 'Vedant Wankhade';
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function updateWelcomeGreeting() {
  const welcomeTitle = document.getElementById('welcome-title');
  if (!welcomeTitle) return;
  
  const name = window.localStorage.getItem('ultron-user-name') || 'Vedant Wankhade';
  const firstName = name.split(' ')[0] || 'User';
  
  const hour = new Date().getHours();
  let salutation = 'Good day';
  if (hour < 12) {
    salutation = 'Good morning';
  } else if (hour < 17) {
    salutation = 'Good afternoon';
  } else {
    salutation = 'Good evening';
  }
  
  welcomeTitle.textContent = `${salutation}, ${firstName}`;
}

function loadAccountDetails() {
  const name = window.localStorage.getItem('ultron-user-name') || 'Vedant Wankhade';
  const email = window.localStorage.getItem('ultron-user-email') || 'vedant@example.com';
  
  const accountName = document.getElementById('account-name');
  const accountEmail = document.getElementById('account-email');
  const accountAvatar = document.getElementById('account-avatar');
  const sidebarName = document.querySelector('.profile-name');
  const sidebarAvatar = document.querySelector('.avatar-circle');
  
  const initials = getUserInitials();
  
  if (accountName) accountName.textContent = name;
  if (accountEmail) accountEmail.textContent = email;
  if (accountAvatar) accountAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = name;
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  
  const inputName = document.getElementById('input-account-name');
  const inputEmail = document.getElementById('input-account-email');
  if (inputName) inputName.value = name;
  if (inputEmail) inputEmail.value = email;
}

async function reloadConversationsFromDisk() {
  try {
    const memoryEnabled = window.localStorage.getItem('ultron-memory-enabled') !== 'false';
    if (memoryEnabled) {
      logTrace('Loading agent conversation memory from storage folder...', 'system');
      const loadRes = await window.ultronAPI.loadConversations();
      if (loadRes.success && loadRes.data) {
        const loadedStore = JSON.parse(loadRes.data);
        conversationsStore = loadedStore;
        const migrated = normalizeConversationStore(conversationsStore);
        if (migrated) saveConversationsToDisk();
        rebuildSessionHistoryList();
        logTrace(`Successfully loaded ${Object.keys(loadedStore).length} historical sessions.`, 'system');
      } else {
        conversationsStore = {};
        rebuildSessionHistoryList();
      }
    } else {
      conversationsStore = {};
      rebuildSessionHistoryList();
    }
  } catch (e) {
    logTrace(`Failed to restore conversation history: ${e.message}`, 'system');
  }
}

// ==========================================
// FILE ATTACHMENT CONTROLLER & CAROUSEL PREVIEW
// ==========================================
let attachedFiles = [];

const btnAttach = document.getElementById('btn-attach');
const hiddenFileInput = document.getElementById('hidden-file-input');
const attachmentPreviewBar = document.getElementById('attachment-preview-bar');

if (btnAttach && hiddenFileInput) {
  btnAttach.addEventListener('click', (e) => {
    e.preventDefault();
    hiddenFileInput.click();
  });

  hiddenFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
      Array.from(e.target.files).forEach(file => {
        if (!attachedFiles.some(f => f.name === file.name && f.size === file.size)) {
          attachedFiles.push(file);
        }
      });
      renderAttachmentPreviews();
    }
    hiddenFileInput.value = '';
  });

  // Drag and Drop File Support on Chat Input Pill
  const inputWrapper = document.querySelector('.input-wrapper');
  if (inputWrapper) {
    inputWrapper.addEventListener('dragover', (e) => {
      e.preventDefault();
      inputWrapper.style.borderColor = 'rgba(129, 140, 248, 0.6)';
    });
    inputWrapper.addEventListener('dragleave', (e) => {
      e.preventDefault();
      inputWrapper.style.borderColor = '';
    });
    inputWrapper.addEventListener('drop', (e) => {
      e.preventDefault();
      inputWrapper.style.borderColor = '';
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        Array.from(e.dataTransfer.files).forEach(file => {
          if (!attachedFiles.some(f => f.name === file.name && f.size === file.size)) {
            attachedFiles.push(file);
          }
        });
        renderAttachmentPreviews();
      }
    });
  }
}

function renderAttachmentPreviews() {
  if (!attachmentPreviewBar) return;

  if (attachedFiles.length === 0) {
    attachmentPreviewBar.classList.add('hidden');
    attachmentPreviewBar.innerHTML = '';
    return;
  }

  attachmentPreviewBar.classList.remove('hidden');
  attachmentPreviewBar.innerHTML = '';

  attachedFiles.forEach((file, index) => {
    const ext = file.name.includes('.') ? file.name.split('.').pop().toUpperCase() : 'FILE';
    const sizeKB = (file.size / 1024).toFixed(1);
    
    const pill = document.createElement('div');
    pill.className = 'attachment-pill';
    pill.innerHTML = `
      <span class="attachment-badge">${ext}</span>
      <span class="attachment-name" title="${file.name}">${file.name}</span>
      <span class="attachment-size">${sizeKB} KB</span>
      <button type="button" class="btn-remove-attachment" data-index="${index}" title="Remove attachment">✕</button>
    `;

    pill.querySelector('.btn-remove-attachment').addEventListener('click', (e) => {
      e.stopPropagation();
      attachedFiles.splice(index, 1);
      renderAttachmentPreviews();
    });

    attachmentPreviewBar.appendChild(pill);
  });
}

// ==========================================
// VOICE CAPSULE PILL & SPEECH-TO-TEXT CONTROLLER
// ==========================================
let isRecordingVoice = false;
let mediaStream = null;
let audioContext = null;
let analyserNode = null;
let animFrameId = null;
let speechRecognition = null;
let accumulatedTranscript = '';
let voiceTimerInterval = null;
let voiceStartTime = 0;
let _prevHeights = [];

const btnMic = document.getElementById('btn-mic');
const mainInputPill = document.getElementById('main-input-pill') || document.querySelector('.input-pill');
const voiceRecordingPill = document.getElementById('voice-recording-pill');
const voiceWaveformCanvas = document.getElementById('voice-waveform-canvas');
const voiceRecordingTimer = document.getElementById('voice-recording-timer');
const voiceBtnAdd = document.getElementById('voice-btn-add');
const voiceBtnCancel = document.getElementById('voice-btn-cancel');
const voiceBtnDone = document.getElementById('voice-btn-done');

if (btnMic) {
  btnMic.addEventListener('click', (e) => {
    e.preventDefault();
    if (isRecordingVoice) {
      stopVoiceRecording(true);
    } else {
      startVoiceRecording();
    }
  });
}

if (voiceBtnAdd) {
  voiceBtnAdd.addEventListener('click', (e) => {
    e.preventDefault();
    const hiddenFileInput = document.getElementById('hidden-file-input');
    if (hiddenFileInput) hiddenFileInput.click();
  });
}

if (voiceBtnCancel) {
  voiceBtnCancel.addEventListener('click', (e) => {
    e.preventDefault();
    stopVoiceRecording(false);
  });
}

if (voiceBtnDone) {
  voiceBtnDone.addEventListener('click', (e) => {
    e.preventDefault();
    stopVoiceRecording(true);
  });
}

function updateVoiceTimer() {
  if (!isRecordingVoice || !voiceStartTime) return;
  const elapsedSeconds = Math.floor((Date.now() - voiceStartTime) / 1000);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = String(elapsedSeconds % 60).padStart(2, '0');
  if (voiceRecordingTimer) {
    voiceRecordingTimer.textContent = `${minutes}:${seconds}`;
  }
}

async function startVoiceRecording() {
  try {
    accumulatedTranscript = '';
    isRecordingVoice = true;

    // Hide main prompt pill, show voice capsule pill
    if (mainInputPill) mainInputPill.classList.add('hidden');
    if (voiceRecordingPill) voiceRecordingPill.classList.remove('hidden');

    // Reset and start timer
    voiceStartTime = Date.now();
    if (voiceRecordingTimer) voiceRecordingTimer.textContent = '0:00';
    if (voiceTimerInterval) clearInterval(voiceTimerInterval);
    voiceTimerInterval = setInterval(updateVoiceTimer, 200);

    // Initialize microphone audio stream
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 128;
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyserNode);

    // Draw animated audio level waveform
    drawWaveform();

    // Web Speech API
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRec) {
      speechRecognition = new SpeechRec();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.lang = navigator.language || 'en-US';

      speechRecognition.onresult = (event) => {
        let currentTranscript = '';
        for (let i = 0; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript;
        }
        accumulatedTranscript = currentTranscript;
      };

      speechRecognition.onerror = (err) => {
        console.warn('Speech recognition notice:', err.error);
      };

      // Restart automatically if interrupted while user is still recording
      speechRecognition.onend = () => {
        if (isRecordingVoice && speechRecognition) {
          try { speechRecognition.start(); } catch (e) {}
        }
      };

      speechRecognition.start();
    }
  } catch (err) {
    console.error('Microphone access error:', err);
    alert('Unable to access microphone. Please check system recording permissions.');
    stopVoiceRecording(false);
  }
}

function stopVoiceRecording(saveTranscript = true) {
  isRecordingVoice = false;

  if (voiceTimerInterval) {
    clearInterval(voiceTimerInterval);
    voiceTimerInterval = null;
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  if (audioContext) {
    try { audioContext.close(); } catch (e) {}
    audioContext = null;
  }

  if (speechRecognition) {
    speechRecognition.onend = null;
    try { speechRecognition.stop(); } catch (e) {}
    speechRecognition = null;
  }

  // Restore UI state
  if (voiceRecordingPill) voiceRecordingPill.classList.add('hidden');
  if (mainInputPill) mainInputPill.classList.remove('hidden');

  if (saveTranscript) {
    const textToInsert = (accumulatedTranscript || '').trim();
    if (chatInput) {
      if (textToInsert) {
        const currentVal = chatInput.value ? chatInput.value.trim() : '';
        chatInput.value = currentVal ? `${currentVal} ${textToInsert}` : textToInsert;
      }
      chatInput.focus();
      // Auto expand input height for user review/editing
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
    }
  }

  accumulatedTranscript = '';
}

function drawWaveform() {
  if (!isRecordingVoice || !voiceWaveformCanvas || !analyserNode) return;

  const canvas = voiceWaveformCanvas;
  const canvasCtx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.width;
  const height = rect.height || canvas.height;

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  canvasCtx.scale(dpr, dpr);

  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function renderFrame() {
    if (!isRecordingVoice) return;
    animFrameId = requestAnimationFrame(renderFrame);

    analyserNode.getByteFrequencyData(dataArray);

    canvasCtx.clearRect(0, 0, width, height);

    const pillWidth = 3;
    const pillGap = 3;
    const totalPills = Math.floor(width / (pillWidth + pillGap));
    let x = (width % (pillWidth + pillGap)) / 2;

    if (_prevHeights.length !== totalPills) {
      _prevHeights = new Array(totalPills).fill(3);
    }

    for (let i = 0; i < totalPills; i++) {
      const dataIdx = Math.floor((i / totalPills) * bufferLength);
      const rawAmp = (dataArray[dataIdx] || 0) / 255;
      
      const targetHeight = Math.max(3, rawAmp * (height - 6) + 3);
      _prevHeights[i] += (targetHeight - _prevHeights[i]) * 0.25;
      const pillHeight = _prevHeights[i];
      const y = (height - pillHeight) / 2;

      const opacity = rawAmp > 0.05 ? 0.45 + rawAmp * 0.55 : 0.25;
      canvasCtx.fillStyle = `rgba(255, 255, 255, ${opacity})`;

      canvasCtx.beginPath();
      if (canvasCtx.roundRect) {
        canvasCtx.roundRect(x, y, pillWidth, pillHeight, pillWidth / 2);
      } else {
        canvasCtx.rect(x, y, pillWidth, pillHeight);
      }
      canvasCtx.fill();

      x += pillWidth + pillGap;
    }
  }

  renderFrame();
}

// Guarantee hide of skeleton loader so app NEVER freezes
function hideSkeletonLoader() {
  const skeletonOverlay = document.getElementById('app-skeleton-overlay');
  if (skeletonOverlay) {
    skeletonOverlay.classList.add('hidden');
    skeletonOverlay.style.display = 'none';
    skeletonOverlay.style.pointerEvents = 'none';
  }
}

// Immediate non-blocking boot sequence
async function bootSystem() {
  loadAccountDetails();
  updateWelcomeGreeting();
  setSendingState(false);
  hideSkeletonLoader();

  // Background non-blocking conversation reload
  reloadConversationsFromDisk().catch(err => {
    console.error('Non-blocking conversation reload error:', err);
  });

  // Non-blocking background health check
  checkOllamaStartup().then(() => {
    runOnboardingProfiler();
  }).catch((err) => {
    console.error('Background Ollama startup check error:', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', hideSkeletonLoader);
} else {
  hideSkeletonLoader();
}
bootSystem();
setTimeout(hideSkeletonLoader, 100);
syncSecurityMode();

// Bind left sidebar toggle directly to element
const btnToggleLeftSidebar = document.getElementById('btn-toggle-left-sidebar');
const leftSidebar = document.getElementById('left-sidebar');
if (btnToggleLeftSidebar && leftSidebar) {
  btnToggleLeftSidebar.addEventListener('click', () => {
    leftSidebar.classList.toggle('collapsed');
    logTrace('Left navigation menu width toggled.', 'system');
  });
}

// Bind right sidebar collapsible sections
const rightSections = document.querySelectorAll('.right-section.collapsible');
rightSections.forEach((section) => {
  const header = section.querySelector('.section-header-clickable');
  if (header) {
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      const title = section.querySelector('.section-title').textContent;
      logTrace(`Right panel section "${title}" toggled.`, 'system');
    });
  }
});

// Bind settings modal triggers
const settingMemoryToggle = document.getElementById('setting-memory-toggle');

function updateMemoryUIState() {
  if (!settingMemoryToggle) return;
  const isEnabled = settingMemoryToggle.checked;
  window.localStorage.setItem('ultron-memory-enabled', isEnabled);
  
  if (settingDataDir && btnBrowseStorage) {
    if (isEnabled) {
      settingDataDir.removeAttribute('disabled');
      settingDataDir.style.opacity = '1';
      settingDataDir.style.pointerEvents = 'auto';
      btnBrowseStorage.removeAttribute('disabled');
      btnBrowseStorage.style.opacity = '1';
      btnBrowseStorage.style.pointerEvents = 'auto';
    } else {
      settingDataDir.setAttribute('disabled', 'true');
      settingDataDir.style.opacity = '0.4';
      settingDataDir.style.pointerEvents = 'none';
      btnBrowseStorage.setAttribute('disabled', 'true');
      btnBrowseStorage.style.opacity = '0.4';
      btnBrowseStorage.style.pointerEvents = 'none';
    }
  }
}

if (settingMemoryToggle) {
  settingMemoryToggle.addEventListener('change', updateMemoryUIState);
}

if (btnSettings && settingsModal && btnCloseSettings) {
  btnSettings.addEventListener('click', async () => {
    // Open Account tab by default
    const firstTab = document.querySelector('.settings-tab-btn[data-tab="account"]');
    if (firstTab) firstTab.click();
    
    settingsModal.classList.remove('hidden');
    
    // Initialize Memory Toggle value (default to true)
    if (settingMemoryToggle) {
      const isMemoryEnabled = window.localStorage.getItem('ultron-memory-enabled') !== 'false';
      settingMemoryToggle.checked = isMemoryEnabled;
    }
    
    // Initialize Data Storage Location input path
    if (settingDataDir) {
      const storedPath = window.localStorage.getItem('ultron-data-dir');
      if (storedPath) {
        settingDataDir.value = storedPath;
      } else {
        const defaultPath = await window.ultronAPI.getDefaultDataDir();
        settingDataDir.value = defaultPath;
        window.localStorage.setItem('ultron-data-dir', defaultPath);
        await window.ultronAPI.updateDataDir(defaultPath);
      }
    }
    
    // Restore direct download trigger state
    const btnShowDownload = document.getElementById('btn-show-download-fields');
    const inputsRow = document.getElementById('download-inputs-row');
    if (btnShowDownload) btnShowDownload.style.display = 'flex';
    if (inputsRow) inputsRow.classList.add('hidden');
    
    updateMemoryUIState();
    logTrace('Settings configuration panel opened.', 'system');
  });
  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    logTrace('Settings configuration panel closed.', 'system');
  });
}

// Bind storage location browser selection dialog
const btnBrowseStorage = document.getElementById('btn-browse-storage');
if (btnBrowseStorage && settingDataDir) {
  btnBrowseStorage.addEventListener('click', async () => {
    logTrace('Opening native file directory selection dialog...', 'system');
    const result = await window.ultronAPI.selectDirectory();
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      settingDataDir.value = selectedPath;
      window.localStorage.setItem('ultron-data-dir', selectedPath);
      
      const updateResult = await window.ultronAPI.updateDataDir(selectedPath);
      if (updateResult.success) {
        logTrace(`Agent storage and memory location updated to: "${selectedPath}"`, 'system');
        await reloadConversationsFromDisk();
      } else {
        logTrace(`Failed to write custom storage path to config: ${updateResult.error}`, 'system');
      }
    }
  });
}

// Save manually entered path changes
if (settingDataDir) {
  settingDataDir.addEventListener('change', async () => {
    const customPath = settingDataDir.value.trim();
    if (customPath) {
      window.localStorage.setItem('ultron-data-dir', customPath);
      const updateResult = await window.ultronAPI.updateDataDir(customPath);
      if (updateResult.success) {
        logTrace(`Agent storage and memory location updated manually to: "${customPath}"`, 'system');
        await reloadConversationsFromDisk();
      } else {
        logTrace(`Failed to write manually entered storage path to config: ${updateResult.error}`, 'system');
      }
    }
  });
}

// Reset storage directory to default path
const btnResetStorage = document.getElementById('btn-reset-storage');
if (btnResetStorage && settingDataDir) {
  btnResetStorage.addEventListener('click', async () => {
    logTrace('Resetting agent storage directory to default...', 'system');
    const defaultPath = await window.ultronAPI.getDefaultDataDir();
    settingDataDir.value = defaultPath;
    window.localStorage.setItem('ultron-data-dir', defaultPath);
    const updateResult = await window.ultronAPI.updateDataDir(defaultPath);
    if (updateResult.success) {
      logTrace(`Agent storage and memory location reset to default: "${defaultPath}"`, 'system');
      await reloadConversationsFromDisk();
      alert(`Storage reset and migrated to default path:\n${defaultPath}`);
    } else {
      logTrace(`Failed to reset storage path: ${updateResult.error}`, 'system');
      alert(`Failed to reset storage path: ${updateResult.error}`);
    }
  });
}

// Clear all chats & delete conversations from disk
const btnClearChats = document.getElementById('btn-clear-chats');
if (btnClearChats) {
  btnClearChats.addEventListener('click', async () => {
    const confirmed = confirm('Are you sure you want to permanently clear all chats? This cannot be undone.');
    if (confirmed) {
      logTrace('Clearing all conversation histories...', 'system');
      conversationsStore = {};
      rebuildSessionHistoryList();
      saveConversationsToDisk();
      triggerNewChat();
      logTrace('All conversation history successfully cleared.', 'system');
      alert('All conversations have been cleared.');
    }
  });
}

// Edit account form toggle listeners
const btnToggleEditAccount = document.getElementById('btn-toggle-edit-account');
const btnCancelEditAccount = document.getElementById('btn-cancel-edit-account');
const accountEditForm = document.getElementById('account-edit-form');

if (btnToggleEditAccount && accountEditForm) {
  btnToggleEditAccount.addEventListener('click', () => {
    const isHidden = accountEditForm.classList.contains('hidden');
    if (isHidden) {
      loadAccountDetails();
      accountEditForm.classList.remove('hidden');
    } else {
      accountEditForm.classList.add('hidden');
    }
  });
}

if (btnCancelEditAccount && accountEditForm) {
  btnCancelEditAccount.addEventListener('click', () => {
    accountEditForm.classList.add('hidden');
  });
}

// Save account changes button listener
const btnSaveAccount = document.getElementById('btn-save-account');
if (btnSaveAccount) {
  btnSaveAccount.addEventListener('click', () => {
    const inputName = document.getElementById('input-account-name');
    const inputEmail = document.getElementById('input-account-email');
    if (inputName && inputEmail) {
      const name = inputName.value.trim();
      const email = inputEmail.value.trim();
      if (!name) {
        alert('Please enter your full name.');
        return;
      }
      window.localStorage.setItem('ultron-user-name', name);
      window.localStorage.setItem('ultron-user-email', email || 'user@example.com');
      
      loadAccountDetails();
      updateWelcomeGreeting();
      if (accountEditForm) {
        accountEditForm.classList.add('hidden');
      }
      logTrace(`Local account details updated to: "${name}" (${email || 'no email'})`, 'system');
      alert('Your local account details have been updated successfully.');
    }
  });
}

// Active border focus styling logic for direct download input pill
const downloadPill = document.querySelector('.download-input-pill');
const downloadInput = document.getElementById('input-download-model');
if (downloadPill && downloadInput) {
  downloadInput.addEventListener('focus', () => {
    downloadPill.style.borderColor = 'rgba(255, 255, 255, 0.25)';
  });
  downloadInput.addEventListener('blur', () => {
    downloadPill.style.borderColor = 'rgba(255, 255, 255, 0.1)';
  });
}

// Event delegation for dynamically added recent history sessions
const sessionHistoryList = document.getElementById('session-history-list');
if (sessionHistoryList) {
  sessionHistoryList.addEventListener('click', (e) => {
    const item = e.target.closest('.nav-item');
    if (item) {
      const sessionItems = sessionHistoryList.querySelectorAll('.nav-item');
      sessionItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      const sessionId = item.getAttribute('data-session-id');
      const title = item.querySelector('.nav-text').textContent;
      currentSessionId = sessionId;
      loadSession(sessionId, title);
    }
  });
}

// Bind Right Sidebar Collapsible Panel Open/Close hooks
if (btnToggleRightSidebarClose && btnToggleRightSidebarOpen && rightSidebar && rightSidebarResizer) {
  btnToggleRightSidebarClose.addEventListener('click', () => {
    rightSidebar.classList.add('collapsed');
    rightSidebarResizer.classList.add('resizer-hidden');
    btnToggleRightSidebarOpen.classList.remove('hidden');
    logTrace('System metrics panel collapsed.', 'system');
  });

  btnToggleRightSidebarOpen.addEventListener('click', () => {
    rightSidebar.classList.remove('collapsed');
    rightSidebarResizer.classList.remove('resizer-hidden');
    btnToggleRightSidebarOpen.classList.add('hidden');
    // Restore default proper width so all contents are visible and organized
    rightSidebar.style.width = '340px';
    logTrace('System metrics panel expanded.', 'system');
  });
}

// Bind Draggable Splitter Resizing for Right Sidebar
if (rightSidebarResizer && rightSidebar) {
  let isResizing = false;
  
  rightSidebarResizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    rightSidebar.classList.add('resizing');
    rightSidebarResizer.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    // Calculate new width relative to right viewport border
    const newWidth = window.innerWidth - e.clientX;
    
    // Automatically collapse completely if dragged below 120px
    if (newWidth < 120) {
      rightSidebar.classList.add('collapsed');
      rightSidebarResizer.classList.add('resizer-hidden');
      btnToggleRightSidebarOpen.classList.remove('hidden');
      isResizing = false;
      rightSidebar.classList.remove('resizing');
      rightSidebarResizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      logTrace('System metrics panel collapsed via drag.', 'system');
      return;
    }
    
    // Allow expanding sidebar across almost entire width (leave 80px for left sidebar minimum)
    const maxAllowedWidth = window.innerWidth - 80;
    if (newWidth >= 180 && newWidth < maxAllowedWidth) {
      rightSidebar.style.width = `${newWidth}px`;
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      rightSidebar.classList.remove('resizing');
      rightSidebarResizer.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      logTrace(`Right metrics panel resized to custom width: ${rightSidebar.style.width}`, 'system');
    }
  });
}

// Bind Search Chats Overlay Triggers
if (navSearchChats && chatSearchOverlay && chatSearchInput && btnCloseSearch) {
  navSearchChats.addEventListener('click', () => {
    chatSearchOverlay.classList.toggle('hidden');
    if (!chatSearchOverlay.classList.contains('hidden')) {
      chatSearchInput.focus();
      chatSearchInput.value = '';
      searchSpinner.classList.add('hidden');
      chatSearchResults.classList.add('hidden'); // Hide results list initially
      logTrace('Spotlight search overlay opened.', 'system');
    } else {
      logTrace('Spotlight search overlay closed.', 'system');
    }
  });

  btnCloseSearch.addEventListener('click', () => {
    chatSearchOverlay.classList.add('hidden');
    logTrace('Spotlight search overlay closed.', 'system');
  });

  // Close when clicked elsewhere (outside search container)
  chatSearchOverlay.addEventListener('click', (e) => {
    const container = document.querySelector('.spotlight-search-container');
    if (container && !container.contains(e.target)) {
      chatSearchOverlay.classList.add('hidden');
      logTrace('Spotlight search overlay closed by clicking outside.', 'system');
    }
  });
  
  // Real-time keyword filter searches with debounced loader spinners
  chatSearchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    clearTimeout(searchTimeout);
    
    if (!query) {
      searchSpinner.classList.add('hidden');
      chatSearchResults.classList.add('hidden');
      return;
    }
    
    searchSpinner.classList.remove('hidden');
    chatSearchResults.classList.add('hidden'); // Hide results while indexing/typing
    
    searchTimeout = setTimeout(() => {
      renderSearchResults(query);
      searchSpinner.classList.add('hidden');
    }, 300); // 300ms mock indexing delay
  });
}

// Render Natural Language search matches
function renderSearchResults(query) {
  chatSearchResults.innerHTML = '';
  
  if (!query) {
    chatSearchResults.classList.add('hidden');
    return;
  }
  
  // Clean, tokenize & filter stopwords from natural query
  const queryTokens = query.toLowerCase()
    .split(/\s+/)
    .filter(token => token && !stopwords.has(token));
    
  if (queryTokens.length === 0) {
    chatSearchResults.classList.add('hidden');
    return;
  }
  
  let matches = [];
  
  // Scans local conversationsStore using semantic scoring
  Object.keys(conversationsStore).forEach(id => {
    const conversation = conversationsStore[id];
    let score = 0;
    
    queryTokens.forEach(token => {
      // Title match gives high score weighting
      if (conversation.title.toLowerCase().includes(token)) {
        score += 10;
      }
      
      // Messages content matches
      conversation.messages.forEach(msg => {
        if (msg.text.toLowerCase().includes(token)) {
          score += msg.isAi ? 1 : 3;
        }
      });
    });
    
    if (score > 0) {
      matches.push({ conversation, score });
    }
  });
  
  // Sort matches by relevance score descending
  matches.sort((a, b) => b.score - a.score);
  
  // Open result box to display matches or negative messages
  chatSearchResults.classList.remove('hidden');
  
  if (matches.length === 0) {
    chatSearchResults.innerHTML = `<div class="search-no-results">No matching conversation threads found.</div>`;
    return;
  }
  
  matches.forEach(match => {
    const session = match.conversation;
    
    // Extract last message text as preview snippet
    let preview = 'Empty conversation context';
    if (session.messages.length > 0) {
      const lastMsg = session.messages[session.messages.length - 1];
      preview = `${lastMsg.sender}: ${lastMsg.text.replace(/[\n\r]+/g, ' ').substring(0, 75)}`;
      if (lastMsg.text.length > 75) preview += '...';
    }
    
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.setAttribute('data-target-session', session.id);
    
    item.innerHTML = `
      <span class="search-result-title">${session.title}</span>
      <span class="search-result-preview">${preview}</span>
    `;
    
    // Bind click trigger to load session and hide search
    item.addEventListener('click', () => {
      // Find and set active class in recent list sidebar
      const sidebarItems = document.querySelectorAll('#session-history-list .nav-item');
      sidebarItems.forEach(i => {
        if (i.getAttribute('data-session-id') === session.id) {
          i.classList.add('active');
        } else {
          i.classList.remove('active');
        }
      });
      
      loadSession(session.id, session.title);
      chatSearchOverlay.classList.add('hidden');
    });
    
    chatSearchResults.appendChild(item);
  });
}

// Global external link click interceptor (opens URLs safely in system default browser)
document.body.addEventListener('click', (e) => {
  const link = e.target.closest('a');
  if (link && link.href && (link.href.startsWith('http://') || link.href.startsWith('https://'))) {
    e.preventDefault();
    e.stopPropagation();
    window.ultronAPI.openExternal(link.href);
  }
});
