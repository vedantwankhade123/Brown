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
const statRamLive = document.getElementById('stat-ram-live');
const statCpuLive = document.getElementById('stat-cpu-live');
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
const settingsPanel = document.getElementById('settings-panel');
const chatMain = document.querySelector('.chat-main');
const chatView = document.getElementById('chat-view');
const btnSettings = document.getElementById('btn-settings');
const btnBackFromSettings = document.getElementById('btn-back-from-settings');
const settingDataDir = document.getElementById('setting-data-dir');
const settingConnectorsDir = document.getElementById('setting-connectors-dir');
const settingOllamaModelsDir = document.getElementById('setting-ollama-models-dir');
const storageInstallRootLabel = document.getElementById('storage-install-root-label');
const storageUltronRootLabel = document.getElementById('storage-ultron-root-label');

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
let activeModel = ""; // Initially empty until detected or selected
let currentSessionId = null;
let installedModelsList = [];
let searchTimeout = null;
let isAwaitingResponse = false;
let _activeAbortController = null; // AbortController for cancelling in-flight LLM requests
const btnStop = document.getElementById('btn-stop');

const LOCAL_MODEL_FALLBACK_ORDER = [
  'phi4',
  'phi3',
  'llama3.2:3b',
  'gemma2:2b',
  'qwen2.5:3b',
  'mistral',
  'llama3',
  'qwen2.5',
  'llama3.2:1b',
  'tinyllama'
];

function normalizeModelName(model) {
  const raw = typeof model === 'string' ? model : (model && model.name);
  return (raw || '').trim();
}

function modelBaseName(modelName) {
  return normalizeModelName(modelName).toLowerCase().split(':')[0];
}

function getModelFallbackRank(modelName) {
  const lower = normalizeModelName(modelName).toLowerCase();
  const exactIndex = LOCAL_MODEL_FALLBACK_ORDER.findIndex(name => lower === name);
  if (exactIndex >= 0) return exactIndex;

  const base = modelBaseName(lower);
  const baseIndex = LOCAL_MODEL_FALLBACK_ORDER.findIndex(name => name.split(':')[0] === base);
  if (baseIndex >= 0) return baseIndex;

  return 100;
}

function isTinyLocalModel(modelName) {
  const base = modelBaseName(modelName);
  return base.includes('tinyllama') || base === 'llama3.2:1b';
}

function getRecoveryModelCandidates(intent, failedModel) {
  const seen = new Set();
  const ordered = [];
  const add = (name) => {
    const normalized = normalizeModelName(name);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ordered.push(normalized);
  };

  add(failedModel);
  const installed = getInstalledLocalModelCandidates();
  const qualityFirst = installed.filter(name => !isTinyLocalModel(name));
  const tinyLast = installed.filter(name => isTinyLocalModel(name));

  if (intent === 'conversation') {
    qualityFirst.forEach(add);
    tinyLast.forEach(add);
  } else {
    installed.forEach(add);
  }

  return ordered;
}

function getInstalledLocalModelCandidates(excludedModels = []) {
  const excluded = new Set(excludedModels.map(name => normalizeModelName(name).toLowerCase()).filter(Boolean));
  return (installedModelsList || [])
    .filter(model => {
      const name = normalizeModelName(model);
      return name && !isOllamaCloudPulledModel(name) && !excluded.has(name.toLowerCase());
    })
    .map(model => ({
      name: normalizeModelName(model),
      size: typeof model === 'object' && model ? model.size : 0
    }))
    .sort((a, b) => {
      const rankDiff = getModelFallbackRank(a.name) - getModelFallbackRank(b.name);
      if (rankDiff !== 0) return rankDiff;
      return (a.size || 0) - (b.size || 0);
    })
    .map(model => model.name);
}

function selectBestInstalledLocalModel(excludedModels = []) {
  return getInstalledLocalModelCandidates(excludedModels)[0] || '';
}

function getLocalAiMode() {
  return window.localStorage.getItem('ultron-ai-mode') || 'local-first';
}

function resolveModelForLocalAi(intent) {
  const mode = getLocalAiMode();
  const isAutomation = intent === 'action' || intent === 'search';
  const usingCloud = activeModel && activeModel.startsWith('gemini');

  if (mode === 'local-only' && usingCloud) {
    const local = selectBestInstalledLocalModel();
    return local
      ? { model: local, switched: true, blocked: false }
      : { model: activeModel, switched: false, blocked: true };
  }

  if (mode === 'local-first' && usingCloud && isAutomation) {
    const local = selectBestInstalledLocalModel();
    if (local) return { model: local, switched: true, blocked: false };
    return { model: activeModel, switched: false, blocked: false };
  }

  return { model: activeModel, switched: false, blocked: false };
}

function updateLocalAiModeStatus() {
  const el = document.getElementById('local-ai-mode-status');
  if (!el) return;
  const mode = getLocalAiMode();
  const local = selectBestInstalledLocalModel() || '(none installed)';
  if (mode === 'local-only') {
    el.textContent = `Local only — Ollama required. Best local model: ${local}.`;
  } else if (mode === 'local-first') {
    el.textContent = `Automations use Ollama first (${local}). Chat follows your dropdown selection.`;
  } else {
    el.textContent = `Using selected model: ${activeModel || 'not set'}.`;
  }
}

async function refreshInstalledModelsFromOllama() {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags');
    if (!response.ok) return;
    const payload = await response.json();
    installedModelsList = (payload.models || [])
      .map(model => ({
        name: normalizeModelName(model),
        size: model.size || 0
      }))
      .filter(model => model.name);
  } catch (e) {
    logTrace(`Could not refresh installed Ollama models: ${e.message}`, 'system');
  }
}

function buildOllamaRecoveryBody(baseBody, endpoint, modelName, systemPrompt, intent) {
  const isGemma = modelName.toLowerCase().includes('gemma');
  const recoveryBody = {
    ...baseBody,
    model: modelName,
    stream: false,
    keep_alive: '30s',
    options: {
      num_gpu: 0,
      num_ctx: 768,
      num_predict: intent === 'conversation' ? 384 : 512,
      temperature: baseBody.options?.temperature ?? 0.7
    }
  };

  if (endpoint === '/api/chat' && Array.isArray(baseBody.messages)) {
    recoveryBody.messages = baseBody.messages.map(message => {
      const { images, ...textMessage } = message;
      return textMessage;
    });
  }

  if (endpoint === '/api/generate') {
    recoveryBody.system = isGemma ? undefined : systemPrompt;
    recoveryBody.images = undefined;
  }

  return recoveryBody;
}

async function tryOllamaMemoryRecovery({ endpoint, bodyData, prompt, systemPrompt, intent, failedModel }) {
  await unloadOllamaModelsExcept('');
  await refreshInstalledModelsFromOllama();

  const attemptModels = getRecoveryModelCandidates(intent, failedModel);
  const triedModels = [];

  async function attemptModel(modelName, recoveryBody, modeLabel) {
    triedModels.push(modelName);
    logTrace(`Memory recovery (${modeLabel}): trying ${modelName}...`, 'system');
    const retryRes = await fetch(`http://127.0.0.1:11434${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(recoveryBody),
      signal: _activeAbortController ? _activeAbortController.signal : undefined
    });

    if (!retryRes.ok) {
      let retryErr = '';
      try {
        const errJson = await retryRes.json();
        retryErr = errJson.error || JSON.stringify(errJson);
      } catch (e) {
        retryErr = await retryRes.text();
      }
      logTrace(`Memory recovery (${modeLabel}) for ${modelName} failed: ${retryErr}`, 'system');
      return null;
    }

    const retryData = await retryRes.json();
    const text = endpoint === '/api/chat'
      ? (retryData.message ? retryData.message.content : '')
      : retryData.response;
    const cleaned = sanitizeResponseText(text, prompt);
    if (!cleaned || isIrrelevantModelResponse(cleaned, prompt)) {
      logTrace(`Memory recovery (${modeLabel}) for ${modelName} returned unusable output — trying next model.`, 'system');
      return null;
    }
    return cleaned;
  }

  for (const modelName of attemptModels) {
    try {
      const defaultBody = buildOllamaDefaultRecoveryBody(bodyData, endpoint, modelName);
      const cleaned = await attemptModel(modelName, defaultBody, 'ollama defaults');
      if (cleaned) {
        const switched = normalizeModelName(failedModel).toLowerCase() !== modelName.toLowerCase();
        if (switched) {
          activeModel = modelName;
          _lastOllamaModel = modelName;
          updateModelSelectorLabel();
          syncModelAttachmentCapabilities();
          logTrace(`Memory recovery switched active model: ${failedModel} → ${modelName}`, 'system');
        }
        return cleaned;
      }
    } catch (retryErr) {
      logTrace(`Memory recovery default attempt for ${modelName} threw: ${retryErr.message}`, 'error');
    }
  }

  for (const modelName of attemptModels) {
    try {
      const compactBody = buildOllamaRecoveryBody(bodyData, endpoint, modelName, systemPrompt, intent);
      const cleaned = await attemptModel(modelName, compactBody, 'compact CPU');
      if (cleaned) {
        const switched = normalizeModelName(failedModel).toLowerCase() !== modelName.toLowerCase();
        if (switched) {
          activeModel = modelName;
          _lastOllamaModel = modelName;
          updateModelSelectorLabel();
          syncModelAttachmentCapabilities();
          logTrace(`Memory recovery switched active model: ${failedModel} → ${modelName}`, 'system');
        }
        return cleaned;
      }
    } catch (retryErr) {
      logTrace(`Memory recovery compact attempt for ${modelName} threw: ${retryErr.message}`, 'error');
    }
  }

  return { failed: true, triedModels: [...new Set(triedModels)] };
}

function getModelCapabilities(modelName) {
  const name = (modelName || activeModel || '').toLowerCase();
  const isGemini = name.includes('gemini');
  const isOllamaVision = ['llava', 'bakllava', 'llama3.2-vision', 'minicpm-v', 'moondream', 'vision'].some(v => name.includes(v));
  const isVision = isGemini || isOllamaVision;

  return {
    isVision,
    badgeText: isVision ? 'Vision' : 'Text',
    badgeClass: isVision ? 'badge-vision' : 'badge-text',
    accept: isVision
      ? 'image/*,.txt,.js,.py,.md,.json,.csv,.pdf,.html,.css,.c,.cpp,.h,.java,.ts,.sql,.xml,.log'
      : '.txt,.js,.py,.md,.json,.csv,.pdf,.html,.css,.c,.cpp,.h,.java,.ts,.sql,.xml,.log',
    hint: isVision ? 'Vision & Text/Code supported' : 'Text & Code files supported'
  };
}

function syncModelAttachmentCapabilities() {
  const caps = getModelCapabilities(activeModel);
  const hiddenFileInput = document.getElementById('hidden-file-input');
  if (hiddenFileInput) {
    hiddenFileInput.accept = caps.accept;
  }
  const badge = document.getElementById('model-capability-badge');
  if (badge) {
    badge.textContent = caps.badgeText;
    badge.className = `model-capability-badge ${caps.badgeClass}`;
    badge.title = `${caps.hint} for model: ${activeModel}`;
  }
}

function deriveTaskPlanTitle(userPrompt) {
  const t = String(userPrompt || '').trim().replace(/\s+/g, ' ');
  if (!t) return 'Working on your request';
  return t.length <= 52 ? t : `${t.slice(0, 49)}…`;
}

function isInstructionalFinalAnswer(text) {
  return /\b(navigate to|start menu|search bar|click on|right-?click|press win|administrator privileges|select it from the list|pop-?up window)\b/i.test(String(text || ''));
}

async function ensureDesktopAutomationReady() {
  if (!window.ultronAPI) return { uia: false };
  try {
    let status = await window.ultronAPI.getMcpStatus();
    const connected = status.connected || [];
    if (connected.includes('windows-uia')) return { uia: true, already: true };
    if (window.ultronAPI.installMcpWindowsUia) {
      const res = await window.ultronAPI.installMcpWindowsUia().catch(() => ({ success: false }));
      status = await window.ultronAPI.getMcpStatus().catch(() => status);
      return { uia: Boolean(res.success) || (status.connected || []).includes('windows-uia'), installed: Boolean(res.installed) };
    }
  } catch (e) { /* ignore */ }
  return { uia: false };
}

function setConnectorBadge(badgeEl, state, labels = {}) {
  if (!badgeEl) return;
  badgeEl.classList.remove('badge-checking');
  const styles = {
    connected: { text: labels.connected || 'Connected', color: '#34d399', border: 'rgba(52, 211, 153, 0.35)', bg: 'rgba(52, 211, 153, 0.12)' },
    partial: { text: labels.partial || 'Partial', color: '#fbbf24', border: 'rgba(251, 191, 36, 0.35)', bg: 'rgba(251, 191, 36, 0.12)' },
    offline: { text: labels.offline || 'Not connected', color: '#a1a1aa', border: 'rgba(161, 161, 170, 0.25)', bg: 'rgba(161, 161, 170, 0.12)' },
    error: { text: labels.error || 'Error', color: '#f87171', border: 'rgba(248, 113, 113, 0.35)', bg: 'rgba(248, 113, 113, 0.12)' }
  };
  const s = styles[state] || styles.offline;
  badgeEl.textContent = s.text;
  badgeEl.style.color = s.color;
  badgeEl.style.borderColor = s.border;
  badgeEl.style.background = s.bg;
}

const TASK_ICON_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="20 6 9 17 4 12"></polyline></svg>';

function renderTaskWidgetHtml(tasks, title = "Tasks") {
  if (!tasks || !Array.isArray(tasks) || tasks.length === 0) return '';

  const completedCount = tasks.filter(t => t.completed || t.status === 'completed').length;

  const itemsHtml = tasks.map((t) => {
    const isCompleted = t.completed || t.status === 'completed';
    const isInProgress = t.status === 'in_progress';
    const isFailed = t.status === 'failed';
    const statusClass = isFailed ? 'failed' : (isCompleted ? 'completed' : (isInProgress ? 'in_progress' : 'pending'));
    const iconHtml = isCompleted
      ? TASK_ICON_CHECK_SVG
      : (isInProgress ? '<span class="task-icon-spinner"></span>' : (isFailed ? '!' : ''));

    return `
      <div class="task-widget-item ${statusClass}">
        <div class="task-item-icon">${iconHtml}</div>
        <span class="task-item-text">${escapeHtml(t.text || t.name || 'Task step')}</span>
      </div>
    `;
  }).join('');

  return `
    <div class="task-execution-widget">
      <div class="task-widget-header">
        <div class="task-widget-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13">
            <polyline points="9 11 12 14 22 4"></polyline>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
          </svg>
          <span>${title}</span>
        </div>
        <div class="task-widget-counter">${completedCount} of ${tasks.length} done</div>
      </div>
      <div class="task-widget-list">
        ${itemsHtml}
      </div>
    </div>
  `;
}

function parseMarkdownChecklist(text) {
  if (!text || typeof text !== 'string') return null;
  const lines = text.split('\n');
  const tasks = [];

  for (const line of lines) {
    const match = line.match(/^\s*(?:[-*+]|\d+\.)\s+\[([ xX])\]\s+(.+)/);
    if (match) {
      tasks.push({
        completed: match[1].toLowerCase() === 'x',
        text: match[2].trim()
      });
    }
  }

  return tasks.length > 0 ? tasks : null;
}

// Tiny muted icons per progress step type (Cursor-style transcript lines)
const PROGRESS_LINE_ICONS = {
  THINKING: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"></path></svg>',
  SCREEN: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>',
  SEARCH: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  APP: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line></svg>',
  EXECUTE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>',
  FILE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
  VERIFY: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>',
  SUCCESS: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
  ERROR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
  DOT: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="3"></circle></svg>'
};

function getProgressLineIcon(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'THINKING') return PROGRESS_LINE_ICONS.THINKING;
  if (t === 'SCREEN' || t === 'MEDIA') return PROGRESS_LINE_ICONS.SCREEN;
  if (t === 'SEARCH') return PROGRESS_LINE_ICONS.SEARCH;
  if (t === 'EXECUTE') return PROGRESS_LINE_ICONS.EXECUTE;
  if (t.includes('FILE') || t === 'LIST_DIR') return PROGRESS_LINE_ICONS.FILE;
  if (t === 'VERIFY') return PROGRESS_LINE_ICONS.VERIFY;
  if (t === 'SUCCESS') return PROGRESS_LINE_ICONS.SUCCESS;
  if (t === 'ERROR') return PROGRESS_LINE_ICONS.ERROR;
  if (t.includes('APP') || t === 'TYPE_TEXT' || t === 'HOTKEY' || t === 'CLICK' || t === 'DOUBLE_CLICK' || t === 'SCROLL' || t === 'WAIT' || t === 'OPEN_URL' || t === 'OPEN_FILE') return PROGRESS_LINE_ICONS.APP;
  return PROGRESS_LINE_ICONS.DOT;
}

// Cursor-style transcript: muted one-line entries with timestamps and status
function renderActivityFeedHtml(stepsList) {
  if (!stepsList || stepsList.length === 0) return '';

  const nowTs = Date.now();
  const stepsHtml = stepsList.map((step, index) => {
    if (!step.ts) step.ts = nowTs;
    const typeStr = String(step.type || '').toUpperCase();
    const isLatest = index === stepsList.length - 1;
    const stateClass = typeStr === 'ERROR' ? ' line-error' : (typeStr === 'SUCCESS' ? ' line-success' : '');
    const newestClass = isLatest ? ' line-new' : '';
    const statusHtml = isLatest
      ? '<span class="agent-line-status agent-line-spinner" aria-hidden="true"></span>'
      : (typeStr === 'ERROR'
          ? '<span class="agent-line-status agent-line-fail" aria-hidden="true">&#10005;</span>'
          : '<span class="agent-line-status agent-line-done" aria-hidden="true">&#10003;</span>');
    let timeHtml = '';
    try {
      timeHtml = `<span class="agent-line-time">${new Date(step.ts).toLocaleTimeString([], { hour12: false })}</span>`;
    } catch (e) {}
    const thumbHtml = step.thumbnail
      ? `<img class="agent-line-thumb" src="${step.thumbnail}" alt="screenshot" title="Click to view fullscreen" />`
      : '';
    const appHtml = step.appName
      ? `<span class="agent-app-chip">${step.appIcon
          ? `<img src="${step.appIcon}" alt="" class="agent-app-logo" />`
          : `<span class="agent-app-logo agent-app-logo-fallback">${escapeHtml(step.appName.substring(0, 1).toUpperCase())}</span>`
        }<span>${escapeHtml(step.appName)}</span></span>`
      : '';

    return `
      <div class="agent-progress-line${stateClass}${newestClass}">
        <span class="agent-line-icon">${getProgressLineIcon(step.type)}</span>
        <span class="agent-line-text">${escapeHtml(step.label || step.text || '')}</span>
        ${appHtml}
        ${thumbHtml}
        ${statusHtml}
        ${timeHtml}
      </div>
    `;
  }).join('');

  const thumbsOn = isScreenActivityFeedEnabled();
  const headerHtml = `
    <div class="agent-timeline-header">
      <span class="agent-timeline-title">Live action timeline — ${stepsList.length} step${stepsList.length === 1 ? '' : 's'}</span>
      <button type="button" class="agent-timeline-thumb-toggle${thumbsOn ? ' on' : ''}" title="Toggle screen thumbnails after UI actions">${thumbsOn ? 'Screen activity: on' : 'Screen activity: off'}</button>
    </div>`;

  return `<div class="agent-progress-feed">${headerHtml}${stepsHtml}</div>`;
}

// Per-chat preference: show screen thumbnails after UI-mutating actions.
function isScreenActivityFeedEnabled() {
  try {
    return window.localStorage.getItem('ultron-show-screen-activity') !== 'false';
  } catch (e) {
    return true;
  }
}

function openAgentShotLightbox(src) {
  if (!src) return;
  const existing = document.querySelector('.agent-shot-lightbox');
  if (existing) existing.remove();
  const box = document.createElement('div');
  box.className = 'agent-shot-lightbox';
  box.title = 'Click to close';
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Screen activity';
  box.appendChild(img);
  box.addEventListener('click', () => box.remove());
  document.body.appendChild(box);
}

// Delegated interactions for timeline rows (thumbnail lightbox + activity toggle)
document.addEventListener('click', (e) => {
  const target = e.target;
  if (!target || !target.closest) return;
  const thumb = target.closest('.agent-line-thumb');
  if (thumb) {
    e.preventDefault();
    e.stopPropagation();
    openAgentShotLightbox(thumb.src);
    return;
  }
  const toggle = target.closest('.agent-timeline-thumb-toggle');
  if (toggle) {
    e.preventDefault();
    e.stopPropagation();
    const next = !isScreenActivityFeedEnabled();
    try {
      window.localStorage.setItem('ultron-show-screen-activity', next ? 'true' : 'false');
    } catch (err) {}
    toggle.classList.toggle('on', next);
    toggle.textContent = next ? 'Screen activity: on' : 'Screen activity: off';
  }
});

// Shimmering gray status line for the action currently running (like Cursor's
// "Planning next moves" indicator)
function getAgentShimmerLineHtml(text) {
  return `<div class="agent-shimmer-line">${escapeHtml(String(text || 'Working...'))}</div>`;
}

function formatWorkDuration(ms) {
  const totalSeconds = Math.max(1, Math.round((ms || 0) / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function isOllamaMemoryError(detail) {
  return /cudaMalloc failed|out[-\s]?of[-\s]?memory|not enough memory|memory limit|allocate compute|requires more (system )?memory|failed to allocate|alloc(?:ate)?[_\s-]*(?:tensor|buffer)|cpu buffer|ggml_assert\(buffer\)|projector cpu offload|stack buffer overrun|stack-based buffer|0xc0000409|cuda error|shared object initialization failed|llama-server process has terminated|exit status 0x/i.test(detail || '');
}

function isOllamaRecoverableError(detail) {
  return isOllamaMemoryError(detail);
}

async function trySameModelCpuFallback({ endpoint, bodyData, modelName, prompt }) {
  const cpuBody = buildOllamaRecoveryBody(bodyData, endpoint, modelName, bodyData.system || '', 'conversation');
  cpuBody.options = {
    ...cpuBody.options,
    num_gpu: 0,
    num_ctx: 1024,
    num_predict: 768,
  };

  logTrace(`GPU/CUDA error on ${modelName}. Retrying same model on CPU...`, 'system');
  const retryRes = await fetch(`http://127.0.0.1:11434${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cpuBody),
    signal: _activeAbortController ? _activeAbortController.signal : undefined,
  });

  if (!retryRes.ok) return null;

  const retryData = await retryRes.json();
  const text = endpoint === '/api/chat'
    ? (retryData.message ? retryData.message.content : '')
    : retryData.response;
  const cleaned = sanitizeResponseText(text, prompt);
  return cleaned && !isIrrelevantModelResponse(cleaned, prompt) ? cleaned : null;
}

let _lastOllamaModel = '';

async function unloadOllamaModelsExcept(modelToKeep = '') {
  try {
    const psResponse = await fetch('http://127.0.0.1:11434/api/ps');
    if (!psResponse.ok) return;
    const payload = await psResponse.json();
    const running = Array.isArray(payload.models) ? payload.models : [];
    for (const model of running) {
      const name = normalizeModelName(model);
      if (!name || (modelToKeep && name.toLowerCase() === modelToKeep.toLowerCase())) continue;
      await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: name, keep_alive: 0 })
      });
      logTrace(`Released inactive Ollama model from memory: ${name}`, 'system');
    }
  } catch (e) {
    logTrace(`Could not release inactive Ollama models: ${e.message}`, 'system');
  }
}

function hasDedicatedGpuAvailable(sysEnv = {}) {
  if (sysEnv.hasDedicatedGpu || (sysEnv.hardware && sysEnv.hardware.hasDedicatedGpu)) return true;
  const gpus = [
    ...(Array.isArray(sysEnv.gpuDetails) ? sysEnv.gpuDetails : []),
    ...(sysEnv.hardware && Array.isArray(sysEnv.hardware.gpuDetails) ? sysEnv.hardware.gpuDetails : [])
  ];
  return gpus.some(gpu => gpu && gpu.dedicated);
}

function getAppPerformanceMode() {
  try {
    const mode = localStorage.getItem('ultron-performance-mode') || 'auto';
    return ['auto', 'gpu', 'cpu'].includes(mode) ? mode : 'auto';
  } catch (e) {
    return 'auto';
  }
}

function getOllamaGpuOptions(sysEnv = {}, modelName = activeModel, intent = 'conversation', isHeavyTask = false) {
  const mode = getAppPerformanceMode();

  // Manual CPU-only mode: force 0 GPU layers across all models and tasks
  if (mode === 'cpu') {
    return { num_gpu: 0 };
  }

  // Manual GPU Priority mode: force maximum layer offloading
  if (mode === 'gpu') {
    return { num_gpu: 999 };
  }

  // AUTO Mode: Smart Dynamic CPU/GPU Switching
  const hasGpu = hasDedicatedGpuAvailable(sysEnv);
  const isVisionModel = modelSupportsVision(modelName);

  // If lightweight task (casual conversation, basic Q&A, greetings) in Auto mode:
  // Use CPU / low overhead (num_gpu: 0) to avoid VRAM allocation delays, prevent UI freezes,
  // and keep the system cool and completely fluid.
  if (!isHeavyTask && intent === 'conversation' && !isVisionModel) {
    return { num_gpu: 0 };
  }

  // If heavy task (code generation, content generation, vision, multi-step actions, search)
  // and dedicated GPU is available -> dynamically engage GPU acceleration
  if (hasGpu) {
    const dedicatedGpu = sysEnv.dedicatedGpu || sysEnv.hardware?.dedicatedGpu || {};
    const vramGB = Number(dedicatedGpu.vramGB || 0);

    if (isVisionModel) {
      if (vramGB > 0 && vramGB <= 4.5) return { num_gpu: 16 };
      if (vramGB > 0 && vramGB <= 6.5) return { num_gpu: 24 };
      return { num_gpu: 999 };
    }

    return { num_gpu: 999 };
  }

  return {};
}

function buildOllamaRequestOptions({ gpuOptions = {}, intent = 'conversation', canUseVision = false, temperature = 0.7, contentGeneration = false } = {}) {
  const options = {
    num_ctx: canUseVision ? 1536 : 2048,
    num_predict: contentGeneration ? 2048 : (intent === 'conversation' ? 1536 : 1024),
    temperature
  };
  if (gpuOptions && typeof gpuOptions.num_gpu === 'number') {
    options.num_gpu = gpuOptions.num_gpu;
  }
  return options;
}

function buildOllamaDefaultRecoveryBody(baseBody, endpoint, modelName) {
  const body = {
    model: modelName,
    stream: false,
    keep_alive: '5m'
  };

  if (endpoint === '/api/chat' && Array.isArray(baseBody.messages)) {
    body.messages = baseBody.messages.map(message => {
      const { images, ...textMessage } = message;
      return textMessage;
    });
  } else {
    body.prompt = baseBody.prompt || '';
    if (baseBody.system) body.system = baseBody.system;
  }

  return body;
}

function buildAgentPromptContext(sysEnv, realtime, userName, memorySnippet = '', hasVisualContext = false, skillsSnippet = '', mcpSnippet = '') {
  const drivesDesc = (sysEnv.drives || []).map(d => `${d.letter} (${d.description || 'Disk'}, ${d.totalGB || '?'}GB total, ${d.freeGB || '?'}GB free)`).join(', ') || 'C:';
  return {
    userName,
    sysEnv,
    realtime,
    drivesDesc,
    memorySnippet,
    skillsSnippet,
    mcpSnippet,
    hasVisualContext,
    screenCaptureEnabled: isScreenCaptureEnabled()
  };
}

function resolveAgentSystemPrompt(context) {
  if (window.UltronAgentPrompt && typeof window.UltronAgentPrompt.buildUltronAgentSystemPrompt === 'function') {
    return window.UltronAgentPrompt.buildUltronAgentSystemPrompt(context);
  }
  return null;
}

function getAgentProgressMessage(category, context = {}) {
  if (window.UltronAgentPrompt && typeof window.UltronAgentPrompt.getAgentProgressMessage === 'function') {
    return window.UltronAgentPrompt.getAgentProgressMessage(category, context);
  }
  return context.fallback || `${category}...`;
}

function isScreenCaptureEnabled() {
  if (window.localStorage.getItem('ultron-screen-aware-enabled') === 'false') return false;
  return window.localStorage.getItem('ultron-screen-capture-enabled') !== 'false';
}

function modelSupportsVision(modelName) {
  return getModelCapabilities(modelName).isVision;
}

function mergeImagePayloads(...groups) {
  const merged = [];
  const seen = new Set();
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const payload of group) {
      if (!payload || !payload.data) continue;
      const key = String(payload.data).slice(0, 96);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(payload);
    }
  }
  return merged.slice(-2);
}

async function captureScreenForAgent(options = {}) {
  if (!isScreenCaptureEnabled() || !window.ultronAPI || typeof window.ultronAPI.captureScreen !== 'function') {
    return null;
  }
  try {
    const neverCaptureApps = (window.localStorage.getItem('ultron-never-capture-apps') || '')
      .split(',').map(item => item.trim()).filter(Boolean);
    const result = await window.ultronAPI.captureScreen({
      ...options,
      appName: options.appName || _activeAgentApp?.name || '',
      neverCaptureApps
    });
    if (!result || !result.success || !result.data) return null;
    return {
      mimeType: result.mimeType || 'image/png',
      data: result.data,
      width: result.width,
      height: result.height,
      label: result.label || options.label || 'desktop',
      sourceName: result.sourceName || 'Screen',
      thumbnailDataUrl: `data:${result.mimeType || 'image/png'};base64,${result.data}`
    };
  } catch (err) {
    logTrace(`Screen capture failed: ${err.message}`, 'system');
    return null;
  }
}

async function readScreenTextForAgent(options = {}) {
  if (!isScreenCaptureEnabled() || !window.ultronAPI || typeof window.ultronAPI.ocrScreen !== 'function') {
    return null;
  }
  try {
    const neverCaptureApps = (window.localStorage.getItem('ultron-never-capture-apps') || '')
      .split(',').map(item => item.trim()).filter(Boolean);
    const result = await window.ultronAPI.ocrScreen({
      ...options,
      appName: options.appName || _activeAgentApp?.name || '',
      neverCaptureApps
    });
    if (!result?.success) {
      logTrace(result?.error || 'Windows OCR could not read the screen.', 'system');
      return null;
    }
    return result;
  } catch (err) {
    logTrace(`Windows OCR failed: ${err.message}`, 'error');
    return null;
  }
}

function pushAgentProgressStep(activitySteps, category, context = {}) {
  const label = getAgentProgressMessage(category, context);
  activitySteps.push({ type: category, label, isProgress: true, ts: Date.now() });
  return label;
}

function replaceProgressStepsOfType(activitySteps, type, newStep) {
  const upper = String(type || '').toUpperCase();
  for (let i = activitySteps.length - 1; i >= 0; i--) {
    if (String(activitySteps[i].type || '').toUpperCase() === upper && activitySteps[i].isProgress) {
      activitySteps.splice(i, 1);
    }
  }
  if (newStep) activitySteps.push(newStep);
}

function renderSearchLiveStatus(aiBubble, agentSubgoals, statusText, showTaskPlan = true) {
  renderMessageContent(aiBubble, composeAgentLiveContent(
    showTaskPlan ? renderTaskWidgetHtml(agentSubgoals) : '',
    getWebSearchCardHtml(statusText)
  ));
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
}

const INTERACTIVE_APP_ACTIONS = new Set(['OPEN_APP', 'FOCUS_APP', 'OPEN_URL', 'OPEN_FILE', 'TYPE_TEXT', 'HOTKEY', 'CLICK', 'DOUBLE_CLICK', 'SCROLL']);

// Screenshots only help when the active model can actually see them
function canUseScreenAnalysis() {
  return isScreenCaptureEnabled() && modelSupportsVision(activeModel);
}

// Vision-grounded clicking (see → decide → act): resolve a human-readable
// element description to screen coordinates.
// Returns { success, x, y, method:'vision' } | { success, method:'uia' } | { success:false, error }.
async function clickByDescription(targetDesc) {
  const desc = String(targetDesc || '').trim();
  if (!desc) return { success: false, error: 'No click target description provided.' };

  // 1) Vision grounding: capture screen and ask the model for the element's pixel position
  if (canUseScreenAnalysis()) {
    try {
      const shot = await captureScreenForAgent({ label: 'click-grounding' });
      if (shot && shot.data) {
        const groundingSystem = 'You are a precise UI element locator. Reply with ONLY a JSON object {"x": <int>, "y": <int>} marking the center of the described element in pixels. If the element is not visible, reply {"x": -1, "y": -1}.';
        const groundingRes = await queryOfflineLLM(
          `Locate this UI element on the screenshot: "${desc}". Return JSON only.`,
          [], 'conversation', groundingSystem,
          [{ mimeType: shot.mimeType || 'image/png', data: shot.data }]
        );
        const groundingText = String(groundingRes && (groundingRes.response || groundingRes.text || groundingRes) || '');
        const coordMatch = groundingText.match(/\{[^{}]*"x"\s*:\s*(-?\d+)[^{}]*"y"\s*:\s*(-?\d+)[^{}]*\}/);
        if (coordMatch) {
          const gx = parseInt(coordMatch[1], 10);
          const gy = parseInt(coordMatch[2], 10);
          if (gx >= 0 && gy >= 0) return { success: true, x: gx, y: gy, method: 'vision' };
        }
      }
    } catch (err) {
      logTrace(`Vision grounding failed for "${desc}": ${err.message}`, 'error');
    }
  }

  // 2) UIA fallback: named-element click via the windows-uia MCP connector
  if (window.ultronAPI && typeof window.ultronAPI.mcpCallTool === 'function') {
    for (const toolName of ['click_element', 'clickElement', 'click']) {
      try {
        const uiaRes = await window.ultronAPI.mcpCallTool({ serverId: 'windows-uia', toolName, args: { name: desc } });
        if (uiaRes && uiaRes.success !== false && !uiaRes.isError && !/error|not found|unknown tool/i.test(String(uiaRes.error || ''))) {
          return { success: true, method: 'uia' };
        }
      } catch (_) { /* try next candidate tool name */ }
    }
  }

  // 3) Nothing could ground the target — caller should ask the user for a hint
  return { success: false, error: `Could not locate "${desc}" on screen.` };
}

function shouldContinueAgentLoopAfterTool(toolCall, userPrompt = '', executedAppActions = []) {
  if (!toolCall) return false;
  if (toolCall.type === 'CAPTURE_SCREEN') return true;
  if (toolCall.type === 'APP_ACTION') {
    if (toolCall.action === 'WAIT' || toolCall.action === 'LIST_APPS') return true;
    if (['OPEN_APP', 'FOCUS_APP', 'OPEN_URL', 'OPEN_FILE'].includes(toolCall.action)) {
      return hasUnfinishedExplicitTask(userPrompt, executedAppActions)
        || /\b(and then|then|after that|and go|go to|navigate|type|click|save|write|read)\b/i.test(String(userPrompt || ''));
    }
    if (['CLICK', 'DOUBLE_CLICK', 'SCROLL'].includes(toolCall.action)) {
      return isScreenCaptureEnabled();
    }
    return INTERACTIVE_APP_ACTIONS.has(toolCall.action) && isScreenCaptureEnabled()
      && hasUnfinishedExplicitTask(userPrompt, executedAppActions);
  }
  return false;
}

function resolveFolderTargetFromPrompt(userPrompt, sysEnv = _cachedSystemEnv) {
  const p = String(userPrompt || '').toLowerCase();
  const dirs = (sysEnv && sysEnv.keyDirectories) || {};
  const userHome = (sysEnv && sysEnv.homeDir) || 'C:\\Users\\vedan';
  // Match downloads folder ONLY when user explicitly refers to the folder/directory
  if (/\b(?:in|into|to|from|inside|open|show|explore|browse)\s+(?:the\s+|my\s+)?downloads?(?:\s+folder|\s+dir|\s+directory)?\b/i.test(p)
      || /\bdownloads?\s+(?:folder|dir|directory)\b/i.test(p)
      || /\b(go to|open|show)\s+(?:the\s+)?downloads\b/i.test(p)) {
    return dirs.downloads || `${userHome}\\Downloads`;
  }
  if (/\b(documents?|documets?)\s*(?:folder|dir|directory)?\b/i.test(p) && (/\b(in|into|to|from|inside|open|show|save)\b/i.test(p) || /\bfolder\b/i.test(p))) {
    return dirs.documents || `${userHome}\\Documents`;
  }
  if (/\bdesktop\b/i.test(p)) {
    return dirs.desktop || `${userHome}\\Desktop`;
  }
  return '';
}

function getExplicitTaskRequirements(userPrompt) {
  const prompt = String(userPrompt || '');
  const p = prompt.toLowerCase();
  const opensApp = /\b(open|launch|start|focus|switch to)\b/i.test(prompt);
  const folderTarget = resolveFolderTargetFromPrompt(prompt);
  const needsNavigation = Boolean(folderTarget)
    && (/\b(go to|navigate|head to|take me to|browse to|open folder|and go)\b/i.test(prompt)
      || (opensApp && /\b(download|document|desktop|folder|directory)\b/i.test(p)));
  const needsFileWrite = promptWantsFileCreation(prompt);
  const needsFolderCreate = promptWantsFolderCreation(prompt);
  const needsOpenUrl = /\b(youtube|google|github|gmail|reddit|twitter|chatgpt|wikipedia|https?:\/\/|[a-z0-9-]+\.(?:com|org|net|io))\b/i.test(prompt)
    && /\b(open|launch|go to|visit|navigate|in chrome|in edge|in browser|and open)\b/i.test(prompt);
  return {
    needsOpenUrl,
    needsTextEntry: opensApp && /\b(type|write|enter|paste|fill|send|message|text)\b/i.test(prompt),
    needsSave: /\b(save|save as)\b/i.test(prompt),
    needsNavigation,
    needsFileWrite,
    needsFolderCreate,
    folderTarget
  };
}

function hasUnfinishedExplicitTask(userPrompt, executedActions = [], stepPlan = null) {
  if (stepPlan && Array.isArray(stepPlan)) {
    const hasPending = stepPlan.some(s => s.status !== 'completed' && s.status !== 'failed');
    if (hasPending) return true;
  }
  const requirements = getExplicitTaskRequirements(userPrompt);
  const actions = new Set(executedActions.map(action => String(action || '').toUpperCase()));
  if (requirements.needsOpenUrl && !actions.has('OPEN_URL') && !Array.from(actions).some(a => a.includes('OPEN_URL') || a.includes('HTTP'))) return true;
  if (requirements.needsTextEntry && !actions.has('TYPE_TEXT')) return true;
  if (requirements.needsSave && !actions.has('HOTKEY')) return true;
  if (requirements.needsNavigation && !actions.has('OPEN_FILE') && !actions.has('EXECUTE') && !actions.has('NAVIGATE')) {
    return true;
  }
  if (requirements.needsFileWrite && !actions.has('WRITE_FILE')) return true;
  if (requirements.needsFolderCreate && !actions.has('EXECUTE')) return true;
  return false;
}

function buildMissingActionInstruction(userPrompt, executedActions = []) {
  const requirements = getExplicitTaskRequirements(userPrompt);
  const missing = [];
  if (requirements.needsTextEntry && !executedActions.includes('TYPE_TEXT')) {
    missing.push('Generate the content requested by the user and output a TYPE_TEXT tool call containing the full content.');
  }
  if (requirements.needsSave && !executedActions.includes('HOTKEY')) {
    missing.push('After entering the content, output a HOTKEY tool call for ctrl+s.');
  }
  if (requirements.needsNavigation && !executedActions.some(a => ['OPEN_FILE', 'EXECUTE', 'NAVIGATE'].includes(String(a || '').toUpperCase()))) {
    const folder = requirements.folderTarget || 'the requested folder';
    missing.push(`Navigate to the folder the user asked for. Output OPEN_FILE with path "${folder}" (or EXECUTE: explorer "${folder}"). Do not give Final Answer until navigation is done.`);
  }
  if (requirements.needsFileWrite && !executedActions.includes('WRITE_FILE')) {
    const write = buildWriteFileFromPrompt(userPrompt);
    missing.push(`Create the file the user requested. Output WRITE_FILE with path "${write.targetPath}" and appropriate content. Do not use OPEN_APP for file creation.`);
  }
  if (requirements.needsFolderCreate && !executedActions.includes('EXECUTE')) {
    const mkdir = buildMkdirFromPrompt(userPrompt);
    missing.push(`Create the folder on disk. Output EXECUTE with command "${mkdir.target}". Do not give Final Answer until the folder exists.`);
  }
  return `The task is not complete. Completed app actions: ${executedActions.join(', ') || 'none'}.
Original request: ${userPrompt}
Missing work: ${missing.join(' ')}
Output exactly one required JSON tool call and no explanatory text.`;
}

function shouldCreateAgentTaskPlan(userPrompt, firstToolCall) {
  const prompt = String(userPrompt || '');
  const requirements = getExplicitTaskRequirements(prompt);
  return firstToolCall?.type === 'APP_SEQUENCE'
    || requirements.needsTextEntry
    || requirements.needsSave
    || requirements.needsNavigation
    || /\b(and then|then|after that|multiple|several|workflow)\b/i.test(prompt);
}

function buildAgentTaskPlan(userPrompt, firstToolCall) {
  const requirements = getExplicitTaskRequirements(userPrompt);
  const tasks = [];
  const firstAction = firstToolCall?.type === 'APP_ACTION'
    ? String(firstToolCall.action || '').toUpperCase()
    : String(firstToolCall?.type || '').toUpperCase();

  if (firstToolCall?.type === 'APP_SEQUENCE') {
    for (const action of firstToolCall.actions || []) {
      tasks.push({
        action: String(action.action || '').toUpperCase(),
        text: humanizeToolCallLabel({ type: 'APP_ACTION', ...action }),
        completed: false,
        status: 'pending'
      });
    }
  } else if (firstToolCall) {
    tasks.push({
      action: firstAction,
      text: humanizeToolCallLabel(firstToolCall),
      completed: false,
      status: 'pending'
    });
  }

  if (requirements.needsTextEntry && !tasks.some(task => task.action === 'TYPE_TEXT')) {
    const typedMatch = userPrompt.match(/(?:type|write|enter|paste)\s+["']([^"']+)["']/i);
    tasks.push({
      action: 'TYPE_TEXT',
      text: typedMatch ? `Type "${typedMatch[1].slice(0, 40)}${typedMatch[1].length > 40 ? '…' : ''}"` : `Enter text in ${firstToolCall?.appName || 'the app'}`,
      completed: false,
      status: 'pending'
    });
  }
  if (requirements.needsSave && !tasks.some(task => task.action === 'HOTKEY')) {
    tasks.push({ action: 'HOTKEY', text: 'Save the changes', completed: false, status: 'pending' });
  }
  return tasks;
}

function selectBestVisionModel() {
  if (geminiConnectionState === 'connected' && ONLINE_GEMINI_MODELS.length) {
    return pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0].name;
  }
  const visionPrefs = ['gemini', 'llava', 'llama3.2-vision', 'minicpm-v', 'moondream', 'bakllava'];
  const models = (installedModelsList || []).map(m => normalizeModelName(m)).filter(Boolean);
  for (const pref of visionPrefs) {
    const hit = models.find(name => name.toLowerCase().includes(pref));
    if (hit) return hit;
  }
  return models.find(name => getModelCapabilities(name).isVision) || '';
}

let _visionAutoSwitchFrom = null;

async function ensureVisionModelForScreen() {
  if (modelSupportsVision(activeModel)) return activeModel;
  const visionModel = selectBestVisionModel();
  if (!visionModel) return activeModel;

  // Local vision models (llava etc.) need several GB of memory. On systems
  // without a dedicated GPU they load into system RAM, so skip the switch when
  // RAM is starved. With a dedicated GPU (VRAM offload) this guard is skipped.
  if (!visionModel.toLowerCase().includes('gemini')) {
    try {
      const sysEnv = await getSystemContext();
      if (!hasDedicatedGpuAvailable(sysEnv)) {
        const metrics = await window.ultronAPI.getLiveMetrics();
        if (metrics && metrics.success && parseFloat(metrics.freeMemoryGB) < 3.5) {
          logTrace(`Skipping vision model auto-switch: only ${metrics.freeMemoryGB} GB RAM free (needs ~4 GB). Continuing with ${activeModel}.`, 'system');
          return activeModel;
        }
      }
    } catch (e) {}
  }

  _visionAutoSwitchFrom = activeModel;
  activeModel = visionModel;
  syncModelAttachmentCapabilities();
  const label = document.getElementById('model-selector-label');
  if (label) label.textContent = activeModel;
  logTrace(`Auto-switched to vision model: ${activeModel}`, 'system');
  return activeModel;
}

function revertVisionModelSwitch(reason = 'load failure') {
  if (!_visionAutoSwitchFrom) return false;
  logTrace(`Vision model ${activeModel} failed (${reason}). Reverting to ${_visionAutoSwitchFrom} and continuing without screen analysis.`, 'system');
  activeModel = _visionAutoSwitchFrom;
  _visionAutoSwitchFrom = null;
  syncModelAttachmentCapabilities();
  const label = document.getElementById('model-selector-label');
  if (label) label.textContent = activeModel;
  return true;
}

function isModelLoadFailureResponse(text) {
  return typeof text === 'string' && (
    text.includes('Ollama Memory Limit Exceeded') ||
    text.includes('Ollama GPU Memory Limit Exceeded') ||
    text.includes('Ollama Model Error')
  );
}

function attachImagesToChatUserMessage(message, imagePayloads) {
  if (!message || message.role !== 'user' || !Array.isArray(imagePayloads) || imagePayloads.length === 0) {
    return message;
  }
  const images = imagePayloads.map(item => item.data).filter(Boolean);
  if (images.length === 0) return message;
  return { ...message, images };
}

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
  return typeof text === 'string' && (text.includes('thinking-container') || text.includes('thinking-dot') || text.includes('web-search-status-wrapper') || text.includes('web-search-shimmer-text') || text.includes('step-exec-card') || text.includes('agent-shimmer-line'));
}

function isRichResultMarkup(text) {
  return typeof text === 'string' && text.includes('ultron-search-experience');
}

// Agent execution widgets are pre-built HTML and must never pass through the markdown parser
function isAgentWidgetMarkup(text) {
  return typeof text === 'string' && (
    text.includes('task-execution-widget') ||
    text.includes('ai-activity-live-box') ||
    text.includes('agent-progress-feed') ||
    text.includes('agent-work-summary') ||
    text.includes('agent-final-response') ||
    text.includes('agent-error-recovery-card') ||
    text.includes('agent-undo-card') ||
    text.includes('agent-source-card') ||
    text.includes('agent-intake-card') ||
    text.includes('error-fix-row')
  );
}

// .message-content uses white-space: pre-wrap, so whitespace between widget tags
// renders as large empty gaps. Collapse it (widget HTML never contains <pre> code).
function collapseWidgetWhitespace(html) {
  return String(html || '').replace(/>\s+</g, '><').trim();
}

// Join live-progress widget fragments into one whitespace-safe HTML string
function composeAgentLiveContent(...parts) {
  return collapseWidgetWhitespace(parts.filter(Boolean).join(''));
}

/** Update live agent UI without restarting the shimmer animation on every step. */
function renderAgentLiveContent(contentEl, { widgetsHtml = '', shimmerText = 'Thinking' } = {}) {
  if (!contentEl) return;
  let root = contentEl.querySelector('.agent-live-root');
  if (!root) {
    root = document.createElement('div');
    root.className = 'agent-live-root';
    contentEl.innerHTML = '';
    contentEl.appendChild(root);
  }

  let widgets = root.querySelector('.agent-live-widgets');
  if (!widgets) {
    widgets = document.createElement('div');
    widgets.className = 'agent-live-widgets';
    root.appendChild(widgets);
  }
  widgets.innerHTML = collapseWidgetWhitespace(widgetsHtml);

  let shimmer = root.querySelector('.agent-shimmer-line');
  if (!shimmer) {
    shimmer = document.createElement('div');
    shimmer.className = 'agent-shimmer-line';
    root.appendChild(shimmer);
  }
  const nextLabel = String(shimmerText || 'Thinking');
  if (shimmer.textContent !== nextLabel) {
    shimmer.textContent = nextLabel;
  }
}

// Compose the final agent chat message: the work transcript collapses into a
// "Worked for Xs" summary (Cursor-style), followed by the actual answer.
// Widgets stay raw HTML; the answer is converted from Markdown up-front so the
// mix never hits the markdown parser again.
function composeAgentFinalContent(agentSubgoals, activitySteps, finalResponse, durationMs = 0, taskTitle = 'Tasks') {
  const widgetsHtml = collapseWidgetWhitespace(`${renderTaskWidgetHtml(agentSubgoals, taskTitle)}${renderActivityFeedHtml(activitySteps)}`);
  let responseHtml = '';

  if (finalResponse && typeof finalResponse === 'string') {
    if (isRichResultMarkup(finalResponse) || isAgentWidgetMarkup(finalResponse)) {
      responseHtml = finalResponse;
    } else {
      try {
        responseHtml = window.ultronAPI.parseMarkdown(structureReadableMarkdown(finalResponse));
      } catch (e) {
        responseHtml = escapeHtml(finalResponse);
      }
    }
  }

  const summaryLabel = durationMs > 0 ? `Worked for ${formatWorkDuration(durationMs)}` : 'View work';
  const workHtml = collapseWidgetWhitespace(`
    <details class="agent-work-summary">
      <summary>
        <svg class="work-summary-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12"><polyline points="9 18 15 12 9 6"></polyline></svg>
        <span>${summaryLabel}</span>
      </summary>
      <div class="agent-work-body">${widgetsHtml}</div>
    </details>
  `);

  return `${workHtml}<div class="agent-final-response">${responseHtml}</div>`;
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
  let displayText = '';

  if (/^(analyzing|refining|formulating|thinking|processing|evaluating)/i.test(cleanQ)) {
    displayText = cleanQ;
  } else {
    const truncated = cleanQ.length > 50 ? cleanQ.substring(0, 47) + '...' : cleanQ;
    displayText = `Searching live web for "${truncated}"...`;
  }

  return `<div class="web-search-status-wrapper"><svg class="web-search-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg><span class="web-search-shimmer-text">${escapeHtml(displayText)}</span></div>`;
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
    btnSend.style.display = isSending ? 'none' : 'flex';
  }
  if (btnStop) {
    if (isSending) {
      btnStop.classList.add('visible');
    } else {
      btnStop.classList.remove('visible');
    }
  }
  if (chatInput) {
    if (isSending) {
      chatInput.removeAttribute('disabled');
      chatInput.disabled = false;
      chatInput.style.pointerEvents = 'auto';
      chatInput.style.opacity = '1';
    } else {
      chatInput.removeAttribute('disabled');
      chatInput.disabled = false;
      chatInput.style.pointerEvents = 'auto';
      chatInput.style.opacity = '1';
    }
  }
  if (!isSending && chatInput) {
    if (isVoiceChatModeEnabled()) {
      scheduleVoiceModeListen(80);
    } else {
      setTimeout(() => {
        try {
          chatInput.focus();
        } catch (e) {}
      }, 50);
    }
  }
  // Clean up abort controller when done
  if (!isSending) {
    _activeAbortController = null;
  }
  if (isVoiceChatModeEnabled()) {
    if (isSending) {
      setVoiceModeStatus('Thinking…');
      setVoiceOrbVisualState('ai-speaking');
      startVoiceOrbAnimation('ai');
    } else {
      updateVoiceModeBarUi();
    }
  }
}

function renderMessageContent(content, text) {
  if (isThinkingMarkup(text) || isRichResultMarkup(text) || isAgentWidgetMarkup(text)) {
    content.innerHTML = text;
  } else {
    let rawText = text || '';
    let thoughtHtml = '';
    
    // Extract <think>...</think> if returned by reasoning model (DeepSeek-R1, QwQ, etc.)
    const thinkMatch = rawText.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch) {
      const rawThought = thinkMatch[1].trim();
      rawText = rawText.replace(/<think>[\s\S]*?<\/think>/i, '').trim();
      if (rawThought) {
        thoughtHtml = `
          <div class="chatgpt-thought-container" data-state="collapsed">
            <div class="thought-header">
              <div class="thought-header-left">
                <svg class="thought-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"></path></svg>
                <span class="thought-title">Thought Process</span>
              </div>
              <div class="thought-header-right">
                <svg class="thought-chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
            <div class="thought-body collapsed">${window.ultronAPI.parseMarkdown(rawThought)}</div>
          </div>
        `;
      }
    }

    const structured = structureReadableMarkdown(rawText);
    content.innerHTML = thoughtHtml + window.ultronAPI.parseMarkdown(structured);

    // Wire thought expand/collapse toggle
    content.querySelectorAll('.thought-header').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const card = hdr.closest('.chatgpt-thought-container');
        const body = card ? card.querySelector('.thought-body') : null;
        if (card && body) {
          const isCollapsed = body.classList.contains('collapsed');
          body.classList.toggle('collapsed', !isCollapsed);
          card.classList.toggle('expanded', isCollapsed);
        }
      });
    });
  }
  formatCodeBlocks(content);
  wrapMarkdownTables(content);
  renderMarkdownCallouts(content);
  markAiContentVoicePending(content);
}

function wrapMarkdownTables(container) {
  if (!container) return;
  container.querySelectorAll('table').forEach((table) => {
    if (table.parentElement && (table.parentElement.classList.contains('md-table-wrap') || table.parentElement.classList.contains('table-responsive-wrapper'))) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-responsive-wrapper md-table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
}

function renderMarkdownCallouts(container) {
  if (!container) return;
  const blockquotes = container.querySelectorAll('blockquote');
  blockquotes.forEach((bq) => {
    if (bq.dataset.calloutProcessed) return;
    bq.dataset.calloutProcessed = 'true';

    const rawHtml = bq.innerHTML.trim();
    const match = rawHtml.match(/^<p>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br\s*\/?>)?([\s\S]*?)<\/p>([\s\S]*)$/i);
    if (match) {
      const type = match[1].toUpperCase();
      const firstLine = match[2].trim();
      const rest = match[3] || '';
      const contentHtml = (firstLine ? `<p>${firstLine}</p>` : '') + rest;

      const callout = document.createElement('div');
      callout.className = `markdown-callout callout-${type.toLowerCase()}`;

      const iconMap = {
        NOTE: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        TIP: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"></path><path d="M10 22h4"></path><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5"></path></svg>',
        IMPORTANT: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>',
        WARNING: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        CAUTION: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>'
      };

      const titleMap = {
        NOTE: 'Note',
        TIP: 'Tip',
        IMPORTANT: 'Important',
        WARNING: 'Warning',
        CAUTION: 'Caution'
      };

      callout.innerHTML = `
        <div class="callout-header">
          <span class="callout-icon">${iconMap[type] || ''}</span>
          <span class="callout-title">${titleMap[type] || type}</span>
        </div>
        <div class="callout-body">${contentHtml}</div>
      `;

      bq.parentNode.replaceChild(callout, bq);
    }
  });
}

function buildMarkdownFormattingRules() {
  return `FORMATTING (Antigravity-Grade Markdown — strictly mandatory):
- MANDATORY SUMMARY RULE: Along with everything generated (explanations, diagrams, code, solutions, or actions), you MUST ALWAYS strictly generate a dedicated Summary section (either as a \`> [!NOTE]\` executive callout or as a \`### 📌 Summary\` / \`### Summary\` block) highlighting the core takeaways, architectural decisions, and actionable next steps.
- When explaining architectures, workflows, processes, hierarchies, or comparisons, ALWAYS include a complete, valid \`\`\`mermaid\n...\n\`\`\` diagram code block in your response. Never use fake image or Google Drive URLs.
- When comparing options or concepts ("vs", "difference between", metrics), provide a clean Markdown table (| Feature / Dimension | Option A | Option B |) with proper headers.
- When asked for a data chart or graph comparing metrics, include a valid \`\`\`chart\ntype: bar\n...\n\`\`\` block.
- Use structured bullet points (- ) with **bold lead-ins** and blank lines between sections — never dense walls of text.
- Use ### subheadings to organize distinct parts or steps.
- Use **bold** for key terms, file names, or commands, and \`inline code\` for technical identifiers.
- Include practical tips or takeaways using > [!TIP] or > [!IMPORTANT] callouts.
- Keep paragraphs concise (1–3 sentences).`;
}

function structureReadableMarkdown(text) {
  let t = String(text || '').trim();
  if (!t) return t;

  // 1. Filter out internal ReAct agent execution logs (Thought:, Action:, Action Input:)
  if (/\bAction\s*Input\s*:/i.test(t)) {
    const actionInputMatch = t.match(/\bAction\s*Input\s*:\s*([\s\S]+)$/i);
    if (actionInputMatch && actionInputMatch[1]) {
      let rawVal = actionInputMatch[1].trim();
      if ((rawVal.startsWith('"') && rawVal.endsWith('"')) || (rawVal.startsWith("'") && rawVal.endsWith("'"))) {
        rawVal = rawVal.slice(1, -1).trim();
      }
      t = rawVal;
    } else {
      t = t.replace(/(?:^|\n)\s*(?:Thought|Action|Action\s*Input)\s*:[^\n]*/gi, '').trim();
    }
  } else {
    t = t.replace(/(?:^|\n)\s*(?:Thought|Action)\s*:[^\n]*/gi, '').trim();
  }

  // 1b. Filter out leaked instruction benchmark / prompt meta artifacts
  t = t.replace(/^\[?Greetings\]?:?\s*/gi, '');
  t = t.replace(/(?:^|\n)\s*Instruction\s*\d+\s*\([^)]*\)[\s\S]*?(?=(?:```|###|\n\n[A-Z]|$))/gi, '');
  t = t.replace(/(?:^|\n)\s*Mandatory\s*(?:Input\s*)?Constraints?:?[^\n]*/gi, '');
  t = t.replace(/(?:^|\n)\s*Complexity\s*&\s*Scale:?[^\n]*/gi, '');
  t = t.replace(/(?:^|\n)\s*Realistic\s*Constraints:?[^\n]*/gi, '');
  t = t.replace(/(?:^|\n)\s*Advanced\s*Visualization\s*Techniques:?[^\n]*/gi, '');
  t = t.replace(/(?:^|\n)\s*Comprehensive\s*Output\s*&\s*Explanation:?[^\n]*/gi, '');
  t = t.replace(/(?:^|\n)\s*Mandatory\s*Diagram\s*Instruction:[^\n]*/gi, '');
  t = t.replace(/(?:^|\n)\s*Mandatory\s*Chart\s*Instruction:[^\n]*/gi, '');

  // 2. Clean hallucinated or stale search disclaimers & fake drive links
  t = t.replace(/\[(?:Flowchart|Diagram|Visual)[^\]]*\]\(https?:\/\/(?:drive\.google\.com|www\.google\.com)[^)]*\)/gi, '');
  t = t.replace(/For a visual representation,\s*please refer to[^\n.]*[.\n]?/gi, '');
  t = t.replace(/\s*\(No specific URL\/source given\)\s*/gi, ' ');
  t = t.replace(/\s*\(no specific url[^)]*\)\s*/gi, ' ');
  t = t.replace(/\bdeveloped by Microsoft\b[^.!\n]*[.!\n]?/gi, '');
  t = t.replace(/\bI am unable to directly execute actions\b[^.!\n]*[.!\n]?/gi, '');
  t = t.replace(/\bwhile I don't have real-time access\b[^.!\n]*[.!\n]?/gi, '');

  // 3. Fix squashed markdown tables on single lines or with || or | | delimiters
  // 3a. Separate table start from preceding prose
  t = t.replace(/([^\n|])\s*(\|[ \t]*[A-Za-z0-9_#*][^|\n]*\|)/g, '$1\n\n$2');

  // 3b. Normalize double pipe or spaced pipe row delimiters like "| Col A | Col B | | Col C | Col D |"
  t = t.replace(/\|\s*\|\s*/g, '|\n| ');
  t = t.replace(/\s*\|\|\s*/g, '\n| ');

  // 3c. Fix repeated or mangled |---| divider tokens on a single line
  t = t.replace(/(?:\|\s*-{2,}\s*)+\|?/g, (match) => {
    return '\n' + match.trim() + '\n';
  });

  // 3d. Ensure table ends cleanly when normal paragraph/heading follows a pipe
  t = t.replace(/\|\s*([A-Za-z0-9*#][^|\n]{20,})/g, '|\n\n$1');

  // 3e. Ensure table has a proper divider row (|---|---|...) if missing after the first row
  const rawTableLines = t.split('\n');
  const repairedTableLines = [];
  for (let i = 0; i < rawTableLines.length; i++) {
    const cur = rawTableLines[i].trim();
    repairedTableLines.push(rawTableLines[i]);
    if (cur.startsWith('|') && cur.endsWith('|') && cur.split('|').length >= 3 && !cur.includes('---')) {
      const next = i + 1 < rawTableLines.length ? rawTableLines[i + 1].trim() : '';
      if (!next.startsWith('|') || !next.includes('---')) {
        const colCount = cur.split('|').filter(c => c.trim().length > 0).length;
        if (colCount >= 2) {
          const divider = '| ' + Array(colCount).fill('---').join(' | ') + ' |';
          repairedTableLines.push(divider);
        }
      }
    }
  }
  t = repairedTableLines.join('\n');

  // 4. Separate inline bold headers following a table or paragraph
  t = t.replace(/([^\n])\s+(\*\*[A-Z][^*]{2,40}\*\*:?)/g, '$1\n\n$2');

  // 5. Fix single-line bullet runs like "* Item 1 * Item 2" or "+ Step 1 + Step 2" or "• Step 1 • Step 2" or "- Item 1 - Item 2"
  t = t.replace(/([^\n])\s+([•*+-])\s+(\*\*[A-Za-z0-9])/g, '$1\n- $3');
  t = t.replace(/([^\n])\s+([•*+-])\s+([A-Za-z0-9])/g, '$1\n- $3');
  t = t.replace(/^([•*+])\s+/gm, '- ');

  // 6. Fix single-line numbered list runs like "1. First step 2. Second step 3. Third step"
  t = t.replace(/([^\n])\s+(\d+\.)\s+([A-Z"'])/g, '$1\n$2 $3');

  // 7. Fix unspaced inline markdown headings like "end of paragraph. ## Heading"
  t = t.replace(/([^\n#])\s+(#{1,4}\s+[A-Za-z0-9])/g, '$1\n\n$2');

  // 7b. Fix unspaced horizontal dividers and pseudo visual tags like "!Flow --- text"
  t = t.replace(/([^\n])\s+---\s+([^\n])/g, '$1\n\n---\n\n$2');
  t = t.replace(/!([A-Za-z0-9\s,]+)\s+---\s+/g, '\n\n### $1\n\n');

  // 8. Ensure blank line before headings
  t = t.replace(/([^\n])\n(#{1,4}\s+[^\n]+)/g, '$1\n\n$2\n');

  // 9. Ensure blank line before list blocks following a paragraph
  t = t.replace(/([^\n\d\-*#|])\n([0-9]+\.\s+|- |\* )/g, '$1\n\n$2');

  // 10. Clean up excess blank lines
  return t.replace(/\n{3,}/g, '\n\n').trim();
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

    if (lang === 'mermaid' && window.UltronVisualEngine) {
      const visualWrapper = document.createElement('div');
      visualWrapper.className = 'visual-diagram-container';
      if (pre.parentNode) {
        pre.parentNode.insertBefore(visualWrapper, pre);
        pre.remove();
      }

      window.UltronVisualEngine.renderMermaidDiagram(rawCode).then(html => {
        visualWrapper.innerHTML = html;
        const btnCopy = visualWrapper.querySelector('.btn-diagram-copy');
        const btnToggle = visualWrapper.querySelector('.btn-diagram-toggle');
        const rawCodeEl = visualWrapper.querySelector('.diagram-raw-code');
        const svgViewport = visualWrapper.querySelector('.diagram-svg-viewport');

        const btnExpand = visualWrapper.querySelector('.btn-diagram-expand');
        if (btnExpand) {
          btnExpand.addEventListener('click', (e) => {
            e.stopPropagation();
            if (window.UltronCanvas && typeof window.UltronCanvas.openVisualInspector === 'function') {
              const svgEl = visualWrapper.querySelector('.diagram-svg-viewport');
              const tagEl = visualWrapper.querySelector('.diagram-tag');
              window.UltronCanvas.openVisualInspector({
                title: tagEl ? tagEl.textContent.trim() : 'Visual Diagram',
                type: 'Diagram',
                svgContent: svgEl ? svgEl.innerHTML : '',
                rawCode: rawCode
              });
            }
          });
        }

        if (btnCopy) {
          btnCopy.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(rawCode);
            const span = btnCopy.querySelector('span');
            if (span) span.textContent = 'Copied!';
            setTimeout(() => { if (span) span.textContent = 'Copy'; }, 2000);
          });
        }

        if (btnToggle && rawCodeEl && svgViewport) {
          btnToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isCodeVisible = rawCodeEl.style.display !== 'none';
            rawCodeEl.style.display = isCodeVisible ? 'none' : 'block';
            svgViewport.style.display = isCodeVisible ? 'block' : 'none';
            const span = btnToggle.querySelector('span');
            if (span) span.textContent = isCodeVisible ? 'Code' : 'Diagram';
          });
        }
      });
      return;
    }

    if ((lang === 'chart' || lang === 'json-chart' || lang === 'data-chart') && window.UltronVisualEngine) {
      const chartWrapper = document.createElement('div');
      chartWrapper.className = 'visual-chart-wrapper';
      if (pre.parentNode) {
        pre.parentNode.insertBefore(chartWrapper, pre);
        pre.remove();
      }
      chartWrapper.innerHTML = window.UltronVisualEngine.renderChart(rawCode);
      return;
    }

    const isInteractiveHtmlWidget = (lang === 'widget' || lang === 'gen-ui' || lang === 'generative-ui' || lang === 'interactive-ui' || lang === 'html-widget')
      || ((lang === 'html' || lang === 'htm') && (
        (rawCode.includes('<script') && (rawCode.includes('<input') || rawCode.includes('<button') || rawCode.includes('<canvas') || rawCode.includes('<select')))
        || rawCode.includes('<!DOCTYPE html>')
        || rawCode.includes('<!doctype html>')
        || (rawCode.includes('<style') && rawCode.includes('<input') && rawCode.includes('<button'))
      ));

    if (isInteractiveHtmlWidget && window.UltronVisualEngine) {
      const widgetWrapper = document.createElement('div');
      widgetWrapper.className = 'visual-genui-wrapper';
      if (pre.parentNode) {
        pre.parentNode.insertBefore(widgetWrapper, pre);
        pre.remove();
      }
      widgetWrapper.innerHTML = window.UltronVisualEngine.renderGenerativeUiWidget(rawCode);

      const btnExpand = widgetWrapper.querySelector('.btn-gen-ui-expand');
      const btnCopy = widgetWrapper.querySelector('.btn-gen-ui-copy');
      const btnToggle = widgetWrapper.querySelector('.btn-gen-ui-toggle');
      const btnCanvas = widgetWrapper.querySelector('.btn-gen-ui-canvas');
      const rawCodeEl = widgetWrapper.querySelector('.gen-ui-raw-code');
      const viewportEl = widgetWrapper.querySelector('.gen-ui-viewport');

      if (btnExpand) {
        btnExpand.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.UltronCanvas && typeof window.UltronCanvas.openVisualInspector === 'function') {
            const titleEl = widgetWrapper.querySelector('.gen-ui-title');
            const iframe = widgetWrapper.querySelector('iframe');
            window.UltronCanvas.openVisualInspector({
              title: titleEl ? titleEl.textContent.trim() : 'Interactive Widget',
              type: 'Widget',
              isWidget: true,
              fullHtml: iframe ? (iframe.getAttribute('srcdoc') || rawCode) : rawCode,
              rawCode: rawCode
            });
          }
        });
      }

      if (btnCopy) {
        btnCopy.addEventListener('click', (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(rawCode);
          const span = btnCopy.querySelector('span');
          if (span) span.textContent = 'Copied!';
          setTimeout(() => { if (span) span.textContent = 'Copy'; }, 2000);
        });
      }

      if (btnToggle && rawCodeEl && viewportEl) {
        btnToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const isCodeVisible = rawCodeEl.style.display !== 'none';
          rawCodeEl.style.display = isCodeVisible ? 'none' : 'block';
          viewportEl.style.display = isCodeVisible ? 'block' : 'none';
          const span = btnToggle.querySelector('span');
          if (span) span.textContent = isCodeVisible ? 'Code' : 'Preview';
        });
      }

      if (btnCanvas) {
        btnCanvas.addEventListener('click', (e) => {
          e.stopPropagation();
          if (window.UltronCanvasWorkspace && typeof window.UltronCanvasWorkspace.openFile === 'function') {
            window.UltronCanvasWorkspace.openFile({
              name: 'widget.html',
              content: rawCode,
              language: 'html'
            });
          }
        });
      }
      return;
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

  const tables = containerElement.querySelectorAll('table');
  tables.forEach((tbl) => {
    if (tbl.parentElement && tbl.parentElement.classList.contains('table-responsive-wrapper')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-responsive-wrapper';
    tbl.parentNode.insertBefore(wrap, tbl);
    wrap.appendChild(tbl);
  });
}

function extractCreatedFilesFromText(text) {
  if (!text) return [];
  const found = [];
  const normalized = String(text);

  // 1. Quoted filenames: "rajesh_saloon_landing_page.html", 'script.py', `index.html`
  const quotedRe = /["'`«]([a-zA-Z0-9_\-.\/\\\s]+\.(?:html?|js|ts|py|json|css|txt|md|docx?|xlsx?|pdf|png|jpe?g|csv|bat|ps1|sh|c|cpp|rs|go|java))["'`»]/gi;
  let match;
  while ((match = quotedRe.exec(normalized)) !== null) {
    const raw = match[1].trim();
    const basename = raw.split(/[/\\]/).pop();
    if (basename && !found.some(f => f.filename === basename)) {
      found.push({ filename: basename, fullPath: raw, raw });
    }
  }

  // 2. Windows absolute paths: C:\...\file.ext or D:\...\file.ext
  const absPathRe = /\b([a-zA-Z]:\\[^\s"'<>|]+?\.(?:html?|js|ts|py|json|css|txt|md|docx?|xlsx?|pdf|png|jpe?g|csv|bat|ps1|sh|c|cpp|rs|go|java))\b/gi;
  while ((match = absPathRe.exec(normalized)) !== null) {
    const fullPath = match[1].trim();
    const basename = fullPath.split('\\').pop();
    if (fullPath && !found.some(f => f.fullPath === fullPath || f.filename === basename)) {
      found.push({ filename: basename, fullPath, raw: fullPath });
    }
  }

  // 3. "saved as <filename>" or "created <filename>"
  const savedAsRe = /\b(?:saved\s+(?:as|to|in)|created\s+(?:file|folder)?|written\s+to)\s+["'`]?([a-zA-Z0-9_\-.\/\\\s]+\.[a-zA-Z0-9]+)["'`]?/gi;
  while ((match = savedAsRe.exec(normalized)) !== null) {
    const raw = match[1].trim();
    const basename = raw.split(/[/\\]/).pop();
    if (basename && !found.some(f => f.filename === basename)) {
      found.push({ filename: basename, fullPath: raw, raw });
    }
  }

  return found;
}

// ---------------------------------------------------------------
// IDE-style project materialization
// Detects code blocks in an AI reply, offers to write them to disk as a
// real project folder (with explicit user consent about the location),
// and makes Open / Show in Folder buttons operate on real files.
// ---------------------------------------------------------------
const PROJECT_LANG_DEFAULT_NAMES = {
  html: 'index.html', htm: 'index.html', css: 'styles.css', js: 'script.js',
  py: 'main.py', json: 'data.json', ts: 'main.ts', jsx: 'App.jsx', tsx: 'App.tsx', md: 'README.md'
};
const PROJECT_FILE_NAME_RE = '([A-Za-z0-9_\\-.]+\\.(?:html?|css|js|jsx|ts|tsx|py|json|txt|md|svg|vue))';

function sanitizeProjectFileName(name) {
  const base = String(name || '').trim().split(/[/\\]/).pop() || '';
  return base.replace(/[<>:"|?*\x00-\x1f]/g, '').trim();
}

function extractProjectFilesFromResponse(text) {
  if (!text || typeof text !== 'string') return [];
  const files = [];
  const blockRe = /```([a-zA-Z0-9+#-]*)[ \t]*([^\n`]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const lang = (m[1] || '').toLowerCase();
    if (/^(mermaid|chart|json-chart|svg|gen-ui|widget|generative-ui)$/i.test(lang)) continue;
    const infoRest = (m[2] || '').trim();
    const content = m[3] || '';
    if (!content.trim()) continue;

    let filename = '';
    const infoFile = infoRest.match(new RegExp(PROJECT_FILE_NAME_RE, 'i'));
    if (infoFile) filename = infoFile[1];

    if (!filename) {
      const firstLine = (content.split('\n')[0] || '').trim();
      const commentFile = firstLine.match(/^(?:\/\/|#|<!--|\/\*|\*|;+)\s*([^\s*\/#<;]+?\.[a-zA-Z0-9]{1,5})\s*(?:\*\/|-->)?$/);
      if (commentFile) filename = commentFile[1];
    }

    if (!filename) {
      const prevLine = ((text.slice(0, m.index).split('\n').map(s => s.trim()).filter(Boolean).pop()) || '')
        .replace(/[*`_>]/g, ' ');
      // Only trust the previous prose line when it names exactly one file, or
      // when a mentioned file's extension matches this block's language. This
      // stops lines like "I created index.html and styles.css" from mis-naming
      // the next block (e.g. HTML content saved as styles.css).
      const lineMatches = prevLine.match(new RegExp(PROJECT_FILE_NAME_RE, 'gi')) || [];
      if (lineMatches.length === 1) {
        filename = lineMatches[0];
      } else if (lang && lineMatches.length > 1) {
        const extMatch = lineMatches.find(nm => {
          const ext = (nm.split('.').pop() || '').toLowerCase();
          return ext === lang || (lang === 'html' && ext === 'htm') || (lang === 'javascript' && ext === 'js');
        });
        if (extMatch) filename = extMatch;
      }
    }

    if (!filename && PROJECT_LANG_DEFAULT_NAMES[lang]) {
      filename = PROJECT_LANG_DEFAULT_NAMES[lang];
    }

    filename = sanitizeProjectFileName(filename);
    if (!filename) continue;
    if (/^(package\.json|tsconfig\.json|node_modules)/i.test(filename)) continue;
    // Heal name/content contradictions immediately so two different kinds of
    // content (HTML vs CSS) never collapse into one same-named entry.
    filename = healFileName(filename, content, files);

    const existing = files.find(f => f.filename.toLowerCase() === filename.toLowerCase());
    if (existing) existing.content = content;
    else files.push({ filename, lang, content });
  }
  return normalizeProjectFiles(files);
}

// Detects what a code block actually contains, regardless of the guessed file
// name. Used to heal mis-labelled project files (HTML stored as x.css, …).
function detectContentKind(content) {
  const t = String(content || '');
  const head = t.slice(0, 600);
  if (/<!doctype\s+html/i.test(head) || /<html[\s>]/i.test(head) || /<head[\s>]/i.test(head) || /<body[\s>]/i.test(head)) return 'html';
  const stripped = t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/<\/?[a-z][\s>]/i.test(stripped.slice(0, 2000))) return 'html';
  if (/[{}]/.test(stripped) && /[^{}<>;=]+\{[^{}]*:[^{}]*\}/.test(stripped)) return 'css';
  return 'other';
}

// Renames a guessed file name when it contradicts the block's actual content
// (HTML stored as x.css and vice versa).
function healFileName(filename, content, others) {
  const extOf = (name) => ((String(name).match(/\.([a-zA-Z0-9]+)$/) || [])[1] || '').toLowerCase();
  const kind = detectContentKind(content);
  const ext = extOf(filename);
  if (kind === 'html' && ext !== 'html' && ext !== 'htm') {
    const hasOtherHtml = (others || []).some(o => (extOf(o.filename) === 'html' || extOf(o.filename) === 'htm') && detectContentKind(o.content) === 'html');
    return hasOtherHtml ? `${(filename.replace(/\.[^.]+$/, '') || 'page')}.html` : 'index.html';
  }
  if (kind === 'css' && (ext === 'html' || ext === 'htm')) {
    return `${(filename.replace(/\.[^.]+$/, '') || 'styles')}.css`;
  }
  return filename;
}

// Heals extracted project files: fixes name/content mismatches, honours the
// asset names the HTML itself references (href="style.css") so default-named
// blocks (styles.css) merge into the real file, and collapses duplicates.
function normalizeProjectFiles(files) {
  if (!Array.isArray(files) || files.length === 0) return files || [];
  const extOf = (name) => ((String(name).match(/\.([a-zA-Z0-9]+)$/) || [])[1] || '').toLowerCase();

  // Pass 1 — heal name/content mismatches (HTML content stored as x.css, …).
  files.forEach(f => {
    f.filename = healFileName(f.filename, f.content, files.filter(o => o !== f));
  });

  // Pass 2 — honour names the HTML references so the preview links resolve.
  const htmlFile = files.find(f => extOf(f.filename) === 'html' || extOf(f.filename) === 'htm' || detectContentKind(f.content) === 'html');
  if (htmlFile) {
    const refRe = /(?:href|src)\s*=\s*["']([^"'<>]+\.(?:css|js))["']/gi;
    let rm;
    while ((rm = refRe.exec(htmlFile.content)) !== null) {
      if (/^https?:/i.test(rm[1])) continue;
      const refName = sanitizeProjectFileName(rm[1].split(/[\\/]/).pop());
      if (!refName) continue;
      if (files.some(f => f.filename.toLowerCase() === refName.toLowerCase())) continue;
      const donor = files.find(f => f !== htmlFile && extOf(f.filename) === extOf(refName) && detectContentKind(f.content) !== 'html');
      if (donor) donor.filename = refName;
    }
  }

  // Pass 3 — collapse duplicates created by the renames above.
  const merged = [];
  files.forEach(f => {
    const dup = merged.find(o => o.filename.toLowerCase() === f.filename.toLowerCase());
    if (!dup) { merged.push(f); return; }
    const ext = extOf(f.filename);
    const kindMatches = (k) => (ext === 'css' ? k === 'css' : (ext === 'html' || ext === 'htm') ? k === 'html' : k === 'other');
    const dupKind = detectContentKind(dup.content);
    const fKind = detectContentKind(f.content);
    if (kindMatches(fKind) && !kindMatches(dupKind)) dup.content = f.content;
    else if (!kindMatches(dupKind) && f.content.length > dup.content.length) dup.content = f.content;
  });
  return merged;
}

function getDefaultProjectsRoot() {
  const dirs = (_cachedSystemEnv && _cachedSystemEnv.keyDirectories) || {};
  const userHome = (_cachedSystemEnv && _cachedSystemEnv.homeDir) || '';
  if (dirs.documents) return `${dirs.documents}\\Ultron Projects`;
  if (userHome) return `${userHome}\\Documents\\Ultron Projects`;
  return 'C:\\Ultron Projects';
}

function deriveProjectFolderName() {
  const fallback = 'ultron-project';
  try {
    const session = currentSessionId && conversationsStore[currentSessionId];
    let base = '';
    if (session) base = session.title || session.name || '';
    if (!base && session && Array.isArray(session.messages)) {
      for (let i = session.messages.length - 1; i >= 0; i--) {
        const msg = session.messages[i];
        if (msg && msg.sender && msg.sender !== 'Ultron') { base = msg.text || ''; break; }
      }
    }
    if (!base) return fallback;
    const slug = String(base).toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .split('-').filter(Boolean).slice(0, 4).join('-');
    return slug || fallback;
  } catch (err) {
    return fallback;
  }
}

async function writeProjectFilesToDisk(files, rootDir) {
  const written = [];
  const failed = [];
  for (const file of files) {
    const target = `${rootDir}\\${file.filename}`;
    try {
      const res = await window.ultronAPI.writeFile(target, file.content);
      if (res && res.success) {
        const finalPath = res.filePath || target;
        written.push({ ...file, path: finalPath });
        if (window.UltronAgentMemory && window.UltronAgentMemory.registerArtifact) {
          window.UltronAgentMemory.registerArtifact('file', finalPath, { source: 'PROJECT_CREATE', name: file.filename });
        }
      } else {
        failed.push({ ...file, path: target, error: (res && res.error) || 'Write failed' });
      }
    } catch (err) {
      failed.push({ ...file, path: target, error: err.message });
    }
  }
  return { written, failed };
}

// Writes a chat-only code block to the default project folder so a button
// pointing at a never-created file can heal itself. Returns the new path.
async function materializeMissingFile(filename, fullText) {
  if (!filename || !fullText || !window.ultronAPI || !window.ultronAPI.writeFile) return null;
  const codeFile = extractProjectFilesFromResponse(fullText)
    .find(f => f.filename.toLowerCase() === String(filename).toLowerCase());
  if (!codeFile) return null;
  const root = `${getDefaultProjectsRoot()}\\${deriveProjectFolderName()}`;
  const { written } = await writeProjectFilesToDisk([codeFile], root);
  return written.length ? written[0].path : null;
}

// Live disk → workspace sync: mirror an agent WRITE_FILE into the open split
// workspace tabs (Cursor/Qoder-style) without stealing focus when it is closed.
function pushWrittenFileToWorkspace(filePath, content) {
  try {
    if (!filePath || !window.UltronCanvas || typeof window.UltronCanvas.upsertFile !== 'function') return;
    const name = String(filePath).split(/[\\/]/).pop();
    if (!/\.(html?|css|js|jsx|ts|tsx|py|json|md|svg)$/i.test(name)) return;
    queueRagFileIndex(filePath); // Auto-learn: remember files the agent writes
    let body = typeof content === 'string' ? content : '';
    if (!body && window.ultronAPI && window.ultronAPI.readFile) {
      window.ultronAPI.readFile(filePath).then(r => {
        if (r && r.success) window.UltronCanvas.upsertFile(name, r.data || '');
      }).catch(() => {});
      return;
    }
    window.UltronCanvas.upsertFile(name, body);
  } catch (e) {}
}

// "open the project in the editor/workspace" → load the current project folder
// (Documents\Ultron Projects\<name>) into the split workspace.
async function loadProjectIntoWorkspace() {
  if (!window.UltronCanvas || typeof window.UltronCanvas.loadProjectFromDisk !== 'function') return false;
  const root = `${getDefaultProjectsRoot()}\\${deriveProjectFolderName()}`;
  const count = await window.UltronCanvas.loadProjectFromDisk(root).catch(() => 0);
  if (count > 0) {
    logTrace(`Loaded ${count} project file(s) from ${root} into the workspace.`, 'system');
    // Auto-learn: index the opened project folder in the background (implicit consent).
    if (isRagAutoEnabled() && window.ultronAPI && window.ultronAPI.ragAutoAdd) {
      window.ultronAPI.ragAutoAdd(root).catch(() => {});
    }
  }
  return count > 0;
}

function buildOpenFileButton(filename, fullPath, fullText = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-open-created-file';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
    </svg>
    <span>Open ${escapeHtml(filename)}</span>
  `;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!window.ultronAPI || !window.ultronAPI.openFileOrPath) return;
    const res = await window.ultronAPI.openFileOrPath(fullPath).catch(() => null);
    if (res && res.success) return;
    // File only existed inside the chat message — create it for real, then open it.
    const materialized = await materializeMissingFile(filename, fullText);
    if (materialized) await window.ultronAPI.openFileOrPath(materialized);
  });
  return btn;
}

function buildShowFolderButton(fullPath, fullText = '', filename = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-show-in-folder';
  btn.title = 'Show destination folder in Windows File Explorer';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
    <span>Show in Folder</span>
  `;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!window.ultronAPI || !window.ultronAPI.showItemInFolder) return;
    const res = await window.ultronAPI.showItemInFolder(fullPath).catch(() => null);
    if (res && res.success) return;
    const materialized = await materializeMissingFile(filename, fullText);
    if (materialized) await window.ultronAPI.showItemInFolder(materialized);
  });
  return btn;
}

function buildOpenInBrowserButton(fullPath) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn-open-created-file';
  btn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="2" y1="12" x2="22" y2="12"></line>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
    </svg>
    <span>Open in browser</span>
  `;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (window.ultronAPI && window.ultronAPI.openFileOrPath) {
      await window.ultronAPI.openFileOrPath(fullPath);
    }
  });
  return btn;
}

function renderProjectCreationCard(contentElement, projectFiles, opts = {}) {
  if (!contentElement || contentElement.querySelector('.project-creation-card')) return;
  const defaultRoot = `${getDefaultProjectsRoot()}\\${deriveProjectFolderName()}`;
  const updateOnly = Boolean(opts.updateOnly);

  const card = document.createElement('div');
  card.className = 'project-creation-card';

  const title = document.createElement('div');
  title.className = 'project-creation-title';
  title.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
      <line x1="12" y1="10" x2="12" y2="16"></line>
      <line x1="9" y1="13" x2="15" y2="13"></line>
    </svg>
    <span>${updateOnly ? 'Update this project on your computer?' : 'Create this project on your computer?'}</span>
  `;
  card.appendChild(title);

  const filesRow = document.createElement('div');
  filesRow.className = 'project-creation-files';
  projectFiles.forEach(f => {
    const chip = document.createElement('span');
    chip.className = 'project-file-chip';
    chip.textContent = f.filename;
    filesRow.appendChild(chip);
  });
  card.appendChild(filesRow);

  const pathLine = document.createElement('div');
  pathLine.className = 'project-creation-path';
  pathLine.textContent = `Files will be written to: ${defaultRoot}`;
  card.appendChild(pathLine);

  const status = document.createElement('div');
  status.className = 'project-creation-status';
  card.appendChild(status);

  const actions = document.createElement('div');
  actions.className = 'project-creation-actions';

  let busy = false;

  async function createIn(rootDir) {
    if (busy) return;
    busy = true;
    btnCreate.disabled = true;
    btnChoose.disabled = true;
    btnSkip.disabled = true;
    btnWorkspace.disabled = true;
    status.textContent = `${updateOnly ? 'Updating' : 'Writing'} ${projectFiles.length} file${projectFiles.length > 1 ? 's' : ''} in ${rootDir} ...`;
    const { written, failed } = await writeProjectFilesToDisk(projectFiles, rootDir);

    card.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'project-creation-title';
    if (written.length) {
      head.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
          <path d="M22 11.08V11a10 10 0 1 1-5.93-9.14"></path>
          <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <span>${updateOnly ? 'Project updated' : 'Project created'}${failed.length ? ` (${failed.length} file${failed.length > 1 ? 's' : ''} failed)` : ''}</span>
      `;
      card.appendChild(head);
      const where = document.createElement('div');
      where.className = 'project-creation-path';
      where.textContent = rootDir;
      card.appendChild(where);
      if (failed.length) {
        const errLine = document.createElement('div');
        errLine.className = 'project-creation-status';
        errLine.textContent = failed.map(f => `${f.filename}: ${f.error}`).join(' | ');
        card.appendChild(errLine);
      }
      const row = document.createElement('div');
      row.className = 'created-file-actions-row';
      row.style.borderTop = 'none';
      row.style.paddingTop = '0';
      row.style.marginTop = '2px';
      written.forEach(wf => {
        row.appendChild(buildOpenFileButton(wf.filename, wf.path));
        row.appendChild(buildShowFolderButton(wf.path));
      });
      const htmlFile = written.find(wf => /\.html?$/i.test(wf.filename));
      if (htmlFile) row.appendChild(buildOpenInBrowserButton(htmlFile.path));
      card.appendChild(row);
      // Mirror the written files into the split workspace in place, keeping
      // tabs the user already had open (edit-in-place, not a fresh workspace).
      if (window.UltronCanvas && typeof window.UltronCanvas.mergeFilesIntoWorkspace === 'function') {
        const wsFiles = written.map(wf => {
          const src = projectFiles.find(pf => pf.filename === wf.filename);
          return { name: wf.filename, content: src ? src.content : '' };
        });
        window.UltronCanvas.mergeFilesIntoWorkspace(wsFiles, { defaultMode: 'preview' });
      } else if (window.UltronCanvas && typeof window.UltronCanvas.openWorkspace === 'function') {
        const wsFiles = written.map(wf => {
          const src = projectFiles.find(pf => pf.filename === wf.filename);
          return { name: wf.filename, content: src ? src.content : '' };
        });
        window.UltronCanvas.openWorkspace(wsFiles, { defaultMode: 'preview' });
      }
    } else {
      head.innerHTML = `<span>Could not create the project</span>`;
      card.appendChild(head);
      const errLine = document.createElement('div');
      errLine.className = 'project-creation-status';
      errLine.textContent = (failed[0] && failed[0].error) || 'Unknown write error';
      card.appendChild(errLine);
    }
  }

  const btnCreate = document.createElement('button');
  btnCreate.type = 'button';
  btnCreate.className = 'btn-open-created-file';
  btnCreate.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
      <polyline points="17 21 17 13 7 13 7 21"></polyline>
      <polyline points="7 3 7 8 15 8"></polyline>
    </svg>
    <span>Create on my PC</span>
  `;
  btnCreate.addEventListener('click', (e) => { e.stopPropagation(); createIn(defaultRoot); });
  actions.appendChild(btnCreate);

  const btnWorkspace = document.createElement('button');
  btnWorkspace.type = 'button';
  btnWorkspace.className = 'btn-open-created-file';
  btnWorkspace.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <polyline points="16 18 22 12 16 6"></polyline>
      <polyline points="8 6 2 12 8 18"></polyline>
    </svg>
    <span>Edit in Workspace</span>
  `;
  btnWorkspace.addEventListener('click', (e) => {
    e.stopPropagation();
    if (window.UltronCanvas && typeof window.UltronCanvas.mergeFilesIntoWorkspace === 'function') {
      window.UltronCanvas.mergeFilesIntoWorkspace(projectFiles.map(f => ({ name: f.filename, content: f.content })), { defaultMode: 'preview' });
    } else if (window.UltronCanvas && typeof window.UltronCanvas.openWorkspace === 'function') {
      window.UltronCanvas.openWorkspace(projectFiles.map(f => ({ name: f.filename, content: f.content })), { defaultMode: 'preview' });
    }
  });
  actions.appendChild(btnWorkspace);

  const btnChoose = document.createElement('button');
  btnChoose.type = 'button';
  btnChoose.className = 'btn-show-in-folder';
  btnChoose.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
    </svg>
    <span>Choose folder...</span>
  `;
  btnChoose.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!window.ultronAPI || !window.ultronAPI.selectDirectory) return;
    const sel = await window.ultronAPI.selectDirectory().catch(() => null);
    if (sel && !sel.canceled && sel.filePaths && sel.filePaths[0]) {
      createIn(sel.filePaths[0]);
    }
  });
  actions.appendChild(btnChoose);

  const btnSkip = document.createElement('button');
  btnSkip.type = 'button';
  btnSkip.className = 'btn-show-in-folder';
  btnSkip.innerHTML = `<span>Not now</span>`;
  btnSkip.addEventListener('click', (e) => { e.stopPropagation(); card.remove(); });
  actions.appendChild(btnSkip);

  card.appendChild(actions);
  contentElement.appendChild(card);
}

function isVisualDiagramResponseOrRequest(fullText, contentElement) {
  const t = String(fullText || '').toLowerCase();
  if (t.includes('```mermaid') || t.includes('```chart') || t.includes('```json-chart') || t.includes('```gen-ui') || t.includes('```widget')) {
    return true;
  }
  if (contentElement && (contentElement.querySelector('.visual-diagram-container') || contentElement.querySelector('.visual-genui-wrapper') || contentElement.querySelector('.visual-chart-wrapper'))) {
    return true;
  }
  try {
    if (typeof currentSessionId !== 'undefined' && currentSessionId && typeof conversationsStore !== 'undefined' && conversationsStore[currentSessionId]) {
      const msgs = conversationsStore[currentSessionId].messages || [];
      const lastUser = msgs.slice().reverse().find(m => m && (!m.isAi && m.sender !== 'Ultron'));
      if (lastUser && lastUser.text) {
        const uText = lastUser.text.toLowerCase();
        if (/\b(diagram|flowchart|flow\s*chart|mindmap|mind\s*map|visualize|draw|architecture\s*diagram|system\s*architecture|timeline|roadmap|concept\s*tree|sequence\s*diagram|er\s*diagram|generative\s*ui|interactive\s*widget)\b/i.test(uText)) {
          return true;
        }
      }
    }
  } catch (e) {}
  return false;
}

async function renderCreatedFileActionButtons(contentElement, fullText) {
  if (!contentElement || !fullText) return;
  if (contentElement.querySelector('.created-file-actions-row')) return;
  if (contentElement.querySelector('.project-creation-card')) return;

  // Suppress project creation prompt for diagrams, visual renderings, and mindmaps
  if (isVisualDiagramResponseOrRequest(fullText, contentElement)) return;

  // IDE-style: when the reply contains code blocks for project files, write
  // them to disk — creating missing files AND updating existing ones, so
  // "edit the css" rewrites style.css in place instead of adding a new file.
  const projectFiles = extractProjectFilesFromResponse(fullText);
  if (projectFiles.length && window.ultronAPI && window.ultronAPI.fileExists) {
    const defaultRoot = `${getDefaultProjectsRoot()}\\${deriveProjectFolderName()}`;

    // Existing project files on disk, used to remap near-duplicate names
    // (styles.css -> style.css) so edits land on the real file.
    let diskNames = [];
    try {
      const listing = await window.ultronAPI.listDir(defaultRoot).catch(() => null);
      if (listing && listing.success && Array.isArray(listing.items)) {
        diskNames = listing.items.filter(it => it && it.isFile).map(it => it.name);
      }
    } catch (err) { diskNames = []; }

    const stemOf = (n) => String(n).replace(/\.[^.]+$/, '').toLowerCase();
    const trimS = (s) => (s.endsWith('s') ? s.slice(0, -1) : s);
    projectFiles.forEach(f => {
      if (diskNames.some(n => n.toLowerCase() === f.filename.toLowerCase())) return;
      const ext = (f.filename.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
      if (!ext) return;
      const twin = diskNames.find(n => {
        const nExt = (n.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
        if (nExt.toLowerCase() !== ext.toLowerCase()) return false;
        return trimS(stemOf(n)) === trimS(stemOf(f.filename));
      });
      if (twin) f.filename = twin;
    });

    const resolved = [];
    for (const f of projectFiles) {
      const guess = `${defaultRoot}\\${f.filename}`;
      let exists = false;
      try {
        exists = Boolean((await window.ultronAPI.fileExists(guess)).exists);
      } catch (err) {
        exists = false;
      }
      let changed = true;
      if (exists && window.ultronAPI.readFile) {
        try {
          const r = await window.ultronAPI.readFile(guess);
          if (r && r.success) changed = String(r.data || '') !== String(f.content || '');
        } catch (err) { changed = true; }
      }
      resolved.push({ ...f, path: guess, exists, changed });
    }
    const missing = resolved.filter(f => !f.exists);
    const updated = resolved.filter(f => f.exists && f.changed);
    if (missing.length || updated.length) {
      renderProjectCreationCard(contentElement, missing.concat(updated), { updateOnly: missing.length === 0 && updated.length > 0 });
      return;
    }
    const row = document.createElement('div');
    row.className = 'created-file-actions-row';
    resolved.slice(0, 3).forEach(f => {
      row.appendChild(buildOpenFileButton(f.filename, f.path));
      row.appendChild(buildShowFolderButton(f.path));
    });
    const htmlFile = resolved.find(f => /\.html?$/i.test(f.filename));
    if (htmlFile) row.appendChild(buildOpenInBrowserButton(htmlFile.path));
    contentElement.appendChild(row);
    return;
  }

  const createdFiles = extractCreatedFilesFromText(fullText);
  if (!createdFiles || !createdFiles.length) return;

  // Filter out system/framework files
  const relevantFiles = createdFiles.filter(f => !/^(index\.js|package\.json|node_modules|tsconfig\.json|react\.js|vue\.js)$/i.test(f.filename));
  if (!relevantFiles.length) return;

  const row = document.createElement('div');
  row.className = 'created-file-actions-row';

  relevantFiles.slice(0, 3).forEach(fileInfo => {
    const targetPath = fileInfo.fullPath || fileInfo.filename;
    row.appendChild(buildOpenFileButton(fileInfo.filename, targetPath, fullText));
    row.appendChild(buildShowFolderButton(targetPath, fullText, fileInfo.filename));
  });

  contentElement.appendChild(row);
}

function finalizeAiMessageBubble(contentElement, fullText, { autoSpeak = true } = {}) {
  if (!contentElement || !fullText || isThinkingMarkup(fullText)) return;
  const messageWrapper = contentElement.closest('.message-wrapper') || contentElement.parentNode;
  const actionsDiv = messageWrapper ? messageWrapper.querySelector('.message-actions') : null;
  if (actionsDiv) wireMessageActionButtons(actionsDiv, fullText);
  renderCreatedFileActionButtons(contentElement, fullText);
  attachVisualSuggestionChips(contentElement, fullText);
  if (autoSpeak) finishStreamingAutoSpeak(fullText);
}

function attachVisualSuggestionChips(contentElement, fullText) {
  if (!contentElement || !fullText || !window.UltronVisualEngine) return;
  const messageWrapper = contentElement.closest('.message-wrapper') || contentElement.parentNode;
  if (!messageWrapper) return;
  if (messageWrapper.querySelector('.visual-suggestions-bar')) return;

  let userPrompt = '';
  try {
    if (typeof currentSessionId !== 'undefined' && currentSessionId && typeof conversationsStore !== 'undefined' && conversationsStore[currentSessionId]) {
      const msgs = conversationsStore[currentSessionId].messages || [];
      const lastUser = msgs.slice().reverse().find(m => m && (!m.isAi && m.sender !== 'Ultron'));
      if (lastUser) userPrompt = lastUser.text || '';
    }
  } catch (e) {}

  const opportunities = window.UltronVisualEngine.detectVisualOpportunities(fullText, userPrompt);
  if (!opportunities || opportunities.length === 0) return;

  const bar = document.createElement('div');
  bar.className = 'visual-suggestions-bar';

  const title = document.createElement('span');
  title.className = 'visual-suggest-title';
  title.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> Visualize:`;
  bar.appendChild(title);

  opportunities.forEach(opp => {
    const chip = document.createElement('button');
    chip.className = 'visual-suggest-chip';
    chip.innerHTML = `<span class="chip-icon">${opp.icon}</span><span class="chip-label">${opp.label}</span>`;
    chip.title = opp.prompt;
    chip.addEventListener('click', () => {
      const inputEl = document.getElementById('chat-input') || document.querySelector('.chat-input-textarea');
      if (inputEl) {
        inputEl.value = opp.prompt;
      }
      if (typeof submitPrompt === 'function') {
        submitPrompt(opp.prompt);
      } else if (typeof btnSend !== 'undefined' && btnSend) {
        btnSend.click();
      }
    });
    bar.appendChild(chip);
  });

  contentElement.appendChild(bar);
}

async function typeMessageResponse(contentElement, fullText, options = {}) {
  const messageWrapper = contentElement.closest('.message-wrapper') || contentElement.parentNode;
  const actionsDiv = messageWrapper ? messageWrapper.querySelector('.message-actions') : null;

  // Hide message actions while typing / thinking
  if (actionsDiv) actionsDiv.style.display = 'none';

  if (!fullText || fullText.length < 10 || isThinkingMarkup(fullText) || isRichResultMarkup(fullText) || isAgentWidgetMarkup(fullText) || options.instant) {
    renderMessageContent(contentElement, fullText);
    formatCodeBlocks(contentElement);
    wrapMarkdownTables(contentElement);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    if (options.autoSpeak !== false && isTtsAutoSpeakEnabled()) {
      beginUnifiedSpeechPlayback(fullText);
    }
    finalizeAiMessageBubble(contentElement, fullText, { autoSpeak: false });
    return;
  }

  if (options.autoSpeak !== false && isTtsAutoSpeakEnabled()) {
    beginUnifiedSpeechPlayback(fullText);
    renderMessageContent(contentElement, fullText);
    formatCodeBlocks(contentElement);
    wrapMarkdownTables(contentElement);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    finalizeAiMessageBubble(contentElement, fullText, { autoSpeak: false });
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
  wrapMarkdownTables(contentElement);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

  finalizeAiMessageBubble(contentElement, fullText, { autoSpeak: options.autoSpeak !== false });
}

function renderChatMessage(sender, text, isAi = false, options = {}) {
  const chatMain = document.querySelector('.chat-main');
  if (chatMain && chatMain.classList.contains('empty-state')) {
    chatMain.classList.remove('empty-state');
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message chat-bubble ${isAi ? 'ai' : 'user'}`;

  const content = document.createElement('div');
  content.className = 'message-content';

  renderMessageContent(content, text);

  if (!isAi && options.attachments && Array.isArray(options.attachments) && options.attachments.length > 0) {
    const attachContainer = document.createElement('div');
    attachContainer.className = 'user-message-attachments';
    options.attachments.forEach(att => {
      if (att.isImage && att.dataUrl) {
        const img = document.createElement('img');
        img.src = att.dataUrl;
        img.className = 'user-message-image-thumb';
        img.alt = att.name || 'Attached image';
        attachContainer.appendChild(img);
      } else {
        const ext = att.name && att.name.includes('.') ? att.name.split('.').pop().toUpperCase() : 'FILE';
        const extLower = ext.toLowerCase();
        let badgeClass = 'attachment-badge';
        if (extLower === 'pdf') badgeClass += ' badge-pdf';
        else if (['doc', 'docx'].includes(extLower)) badgeClass += ' badge-doc';
        else if (['js', 'ts', 'py', 'html', 'css', 'json', 'c', 'cpp'].includes(extLower)) badgeClass += ' badge-code';
        else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extLower)) badgeClass += ' badge-img';

        const filePill = document.createElement('div');
        filePill.className = 'user-message-file-pill';
        const sizeStr = att.size ? `${(att.size / 1024).toFixed(1)} KB` : '';
        filePill.innerHTML = `
          <span class="${badgeClass}">${ext}</span>
          <span class="file-name" title="${escapeHtml(att.name)}">${escapeHtml(att.name)}</span>
          ${sizeStr ? `<span class="file-size">${sizeStr}</span>` : ''}
        `;
        attachContainer.appendChild(filePill);
      }
    });
    content.insertBefore(attachContainer, content.firstChild);
    trackSidebarUploads(options.attachments, options.timestamp);
  }

  if (isAi) {
    const avatar = document.createElement('div');
    avatar.className = 'avatar ai';
    avatar.innerHTML = `<img src="../../Assets/Brand-Assets/brown-logo.png" alt="Brown" />`;
    messageDiv.appendChild(avatar);
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';
    wrapper.appendChild(content);
    
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    const isThinking = isThinkingMarkup(text);
    actions.style.display = isThinking ? 'none' : 'flex';
    actions.style.gap = '4px';
    actions.style.marginTop = '6px';
    
    const btnCopy = document.createElement('button');
    btnCopy.className = 'btn-copy-msg message-action-btn';
    applyMessageActionButtonStyles(btnCopy);
    btnCopy.innerHTML = `
      <svg class="message-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Copy</span>
    `;
    
    btnCopy.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(extractPlainTextFromMessage(text) || text);
      const span = btnCopy.querySelector('span');
      if (span) span.textContent = 'Copied!';
      btnCopy.style.color = '#34d399';
      setTimeout(() => {
        if (span) span.textContent = 'Copy';
        btnCopy.style.color = '#ffffff';
      }, 2000);
    });
    
    actions.appendChild(btnCopy);
    actions.appendChild(createSpeakMessageButton(() => text));
    wrapper.appendChild(actions);
    messageDiv.appendChild(wrapper);

    // Format code blocks for static rendered messages & enhance for Code Canvas
    if (!isThinking) {
      setTimeout(() => {
        formatCodeBlocks(content);
        wrapMarkdownTables(content);
        if (window.UltronCanvas && typeof window.UltronCanvas.enhanceMessageCodeBlocks === 'function') {
          window.UltronCanvas.enhanceMessageCodeBlocks(content, text);
        }
      }, 0);
    }
  } else {
    const avatar = document.createElement('div');
    avatar.className = 'avatar user';
    avatar.textContent = getUserInitials();

    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper user-wrapper';
    wrapper.appendChild(content);

    const actions = document.createElement('div');
    actions.className = 'message-actions user-actions';
    actions.style.display = 'flex';
    actions.style.gap = '4px';
    actions.style.marginTop = '4px';
    actions.style.justifyContent = 'flex-end';

    const btnCopyUser = document.createElement('button');
    btnCopyUser.className = 'btn-copy-msg message-action-btn';
    applyMessageActionButtonStyles(btnCopyUser);
    btnCopyUser.innerHTML = `
      <svg class="message-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Copy</span>
    `;
    btnCopyUser.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(text);
      const span = btnCopyUser.querySelector('span');
      if (span) span.textContent = 'Copied!';
      btnCopyUser.style.color = '#34d399';
      setTimeout(() => {
        if (span) span.textContent = 'Copy';
        btnCopyUser.style.color = '#ffffff';
      }, 2000);
    });

    btnCopyUser.addEventListener('mouseenter', () => {
      btnCopyUser.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      btnCopyUser.style.color = 'var(--accent-white)';
    });
    btnCopyUser.addEventListener('mouseleave', () => {
      btnCopyUser.style.backgroundColor = 'transparent';
      btnCopyUser.style.color = 'var(--text-muted)';
    });

    actions.appendChild(btnCopyUser);
    wrapper.appendChild(actions);

    messageDiv.appendChild(wrapper);
    messageDiv.appendChild(avatar);
  }

  chatMessagesContainer.appendChild(messageDiv);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  if (isAi) {
    markAiContentVoicePending(content);
    if (window.UltronCanvas && typeof window.UltronCanvas.enhanceMessageCodeBlocks === 'function') {
      window.UltronCanvas.enhanceMessageCodeBlocks(content, text);
    }
  }
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
    item.className = `nav-item font-small session-history-item${id === currentSessionId ? ' active' : ''}`;
    item.setAttribute('data-session-id', id);
    item.innerHTML = buildSessionHistoryItemMarkup(id, session);

    const deleteBtn = item.querySelector('.session-delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await deleteSession(id);
      });
    }

    sessionHistoryList.appendChild(item);
  });
}

function buildSessionHistoryItemMarkup(id, session) {
  const title = session?.title || 'New chat';
  return `
    <span class="session-row-text">
      <span class="nav-text text-truncate">${escapeHtml(title)}</span>
      <span class="session-timestamp">${formatSidebarTimestamp(session.updatedAt || session.createdAt)}</span>
    </span>
    <button type="button" class="session-delete-btn" data-session-id="${escapeHtml(id)}" title="Delete chat" aria-label="Delete chat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    </button>
  `;
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
      const data = await response.json().catch(() => ({}));
      if (data && Array.isArray(data.models)) {
        installedModelsList = data.models;
      }
      return { connected: true };
    }
  } catch (err) {}

  // Fallback check via system profiler / installed models query
  try {
    if (window.ultronAPI && typeof window.ultronAPI.profileSystem === 'function') {
      const res = await window.ultronAPI.profileSystem();
      if (res && res.success && Array.isArray(res.installedModels) && res.installedModels.length > 0) {
        installedModelsList = res.installedModels;
        return { connected: true };
      }
    }
  } catch (e) {}

  return { connected: false };
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

const TOAST_ICONS = {
  error: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>',
  warning: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
  success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>',
  info: '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>'
};

function ensureToastStack() {
  let stack = document.getElementById('ultron-toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'ultron-toast-stack';
    stack.className = 'ultron-toast-stack';
    stack.setAttribute('aria-live', 'polite');
    document.body.appendChild(stack);
  }
  return stack;
}

function dismissToast(el) {
  if (!el || el.classList.contains('is-leaving')) return;
  el.classList.add('is-leaving');
  setTimeout(() => el.remove(), 220);
}

function showToast({ type = 'info', title = '', message = '', duration = 6500, actions = [] } = {}) {
  const stack = ensureToastStack();
  const toast = document.createElement('div');
  toast.className = `ultron-toast ${type}`;
  toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status');
  const iconSvg = TOAST_ICONS[type] || TOAST_ICONS.info;
  const actionsHtml = (actions || []).map((a, i) =>
    `<button type="button" class="ultron-toast-action${a.primary ? ' primary' : ''}" data-toast-action="${i}">${a.label}</button>`
  ).join('');
  toast.innerHTML = `
    <svg class="ultron-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg>
    <div class="ultron-toast-body">
      ${title ? `<p class="ultron-toast-title">${title}</p>` : ''}
      ${message ? `<p class="ultron-toast-message">${message}</p>` : ''}
      ${actionsHtml ? `<div class="ultron-toast-actions">${actionsHtml}</div>` : ''}
    </div>
    <button type="button" class="ultron-toast-close" aria-label="Dismiss">✕</button>
  `;
  toast.querySelector('.ultron-toast-close')?.addEventListener('click', () => dismissToast(toast));
  toast.querySelectorAll('[data-toast-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-toast-action'));
      try { actions[idx]?.onClick?.(); } catch (_) { /* ignore */ }
      dismissToast(toast);
    });
  });
  stack.appendChild(toast);
  while (stack.children.length > 4) stack.removeChild(stack.firstChild);
  const ms = type === 'error' ? Math.max(duration, 8000) : duration;
  if (ms > 0) setTimeout(() => dismissToast(toast), ms);
  return toast;
}

function openSettingsModelsPane() {
  try {
    (document.getElementById('btn-open-settings') || document.querySelector('[data-open-settings]'))?.click();
    setTimeout(() => {
      document.querySelector('[data-settings-tab="models"], #settings-tab-models, button[data-section="models"]')?.click();
    }, 120);
  } catch (_) { /* ignore */ }
}

function modelNeedsOllama(modelName = activeModel) {
  if (window.UltronMultiProviderHub?.isOllamaBackedModel) {
    return window.UltronMultiProviderHub.isOllamaBackedModel(modelName);
  }
  const m = String(modelName || '').toLowerCase();
  if (!m) return true;
  if (m.startsWith('gemini') || m.startsWith('gpt-') || m.startsWith('claude') || m.startsWith('o1') || m.startsWith('o3')) return false;
  return true;
}

function classifyModelFailure(errOrText, modelName = activeModel) {
  const raw = typeof errOrText === 'string' ? errOrText : (errOrText?.message || String(errOrText || ''));
  const msg = raw.toLowerCase();
  const model = String(modelName || 'model');
  const isHf = model.startsWith('hf.co/');
  const isCloud = model.endsWith('-cloud');
  if (/activeTemp is not defined/i.test(raw)) {
    return { code: 'INTERNAL', title: 'Internal chat error', message: 'A temperature setting bug was hit. Restart Ultron after updating — this should be fixed.', toastType: 'error' };
  }
  if (/failed to fetch|networkerror|econnrefused|enotfound|fetch failed|could not connect|err_connection/i.test(msg)) {
    return { code: 'OLLAMA_OFFLINE', title: 'Ollama not reachable', message: 'Could not reach http://127.0.0.1:11434. Start Ollama (tray app or `ollama serve`), then retry.', toastType: 'error' };
  }
  if (/api key|unauthorized|401|invalid.*key|permission denied|gemini api key/i.test(msg)) {
    return { code: 'API_KEY', title: 'API key required', message: raw || 'Add or fix your cloud API key in Settings → Models.', toastType: 'error' };
  }
  if (/sign.?in|not signed|ollama cloud|cloud auth/i.test(msg) || (isCloud && /unauthorized|403|401/.test(msg))) {
    return { code: 'OLLAMA_CLOUD_AUTH', title: 'Ollama Cloud sign-in required', message: `"${model}" runs on Ollama Cloud. Sign in under Settings → Models.`, toastType: 'warning' };
  }
  if (/not found|no such model|pull|unknown model/i.test(msg) || (isHf && /404|file does not exist/.test(msg))) {
    return {
      code: 'MODEL_MISSING',
      title: isHf ? 'Hugging Face model not installed' : 'Model not installed',
      message: isHf
        ? `"${model}" is not on this PC yet. Download it from Settings → Models.`
        : `"${model}" is not installed. Pull it from Settings → Models or run ollama pull ${model}.`,
      toastType: 'warning'
    };
  }
  if (/memory|vram|out of memory|requires more|num_gpu/i.test(msg)) {
    return { code: 'MEMORY', title: 'Not enough memory for this model', message: `"${model}" needs more RAM/VRAM. Close heavy apps, pick a smaller model, or use Gemini / Ollama Cloud.`, toastType: 'warning' };
  }
  if (/quota|rate limit|resource.?exhausted|429/i.test(msg)) {
    return { code: 'QUOTA', title: 'Cloud quota exceeded', message: raw || 'This cloud model hit a rate/quota limit. Wait or switch models.', toastType: 'warning' };
  }
  return { code: 'GENERIC', title: 'Model request failed', message: raw || `Could not get a response from ${model}.`, toastType: 'error' };
}

function notifyModelIssue(classified, { actions } = {}) {
  if (!classified) return;
  const defaults = [];
  if (classified.code === 'OLLAMA_OFFLINE') {
    defaults.push({
      label: 'Start Ollama',
      primary: true,
      onClick: () => { startOllamaInstallFlow(document.createElement('button')).catch(() => {}); }
    });
  }
  if (classified.code === 'API_KEY' || classified.code === 'OLLAMA_CLOUD_AUTH' || classified.code === 'MODEL_MISSING') {
    defaults.push({ label: 'Open Settings', primary: true, onClick: openSettingsModelsPane });
  }
  showToast({
    type: classified.toastType || 'error',
    title: classified.title,
    message: classified.message,
    actions: actions || defaults,
    duration: classified.toastType === 'error' ? 9000 : 7000
  });
}

async function ensureOllamaReadyForChat({ silent = false } = {}) {
  let conn = await checkOllamaConnection();
  if (conn.connected) return { ok: true, started: false };
  const installCheck = await window.ultronAPI?.checkOllamaInstalled?.().catch(() => ({ installed: false }));
  if (installCheck?.installed) {
    if (!silent) {
      showToast({ type: 'warning', title: 'Starting Ollama…', message: 'Ollama is installed but was not running. Trying to start it now.', duration: 4000 });
    }
    try {
      await window.ultronAPI.startOllamaService(installCheck.path);
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        conn = await checkOllamaConnection();
        if (conn.connected) {
          if (!silent) showToast({ type: 'success', title: 'Ollama connected', message: 'Local model service is ready.', duration: 3500 });
          hideOllamaBanner();
          return { ok: true, started: true };
        }
      }
    } catch (_) { /* fall through */ }
  }
  const classified = {
    code: 'OLLAMA_OFFLINE',
    title: installCheck?.installed ? 'Ollama is not running' : 'Ollama is not installed',
    message: installCheck?.installed
      ? 'Could not start Ollama automatically. Open the Ollama app from the Start menu, then retry.'
      : 'Install Ollama to run local, Hugging Face GGUF, and Ollama Cloud models — or pick Google Gemini in the model dropdown.',
    toastType: 'error'
  };
  if (!silent) notifyModelIssue(classified);
  showOllamaBanner('warning', classified.message, true, !installCheck?.installed);
  return { ok: false, started: false, classified };
}

async function preflightActiveModelForChat() {
  const model = activeModel || '';
  const hub = window.UltronMultiProviderHub;
  const provider = hub ? hub.detectProviderForModel(model) : 'ollama';
  if (provider !== 'ollama') {
    const key = hub?.getStoredApiKey?.(provider) || (provider === 'gemini' ? (localStorage.getItem('ultron-gemini-api-key') || '') : '');
    if (['gemini', 'openai', 'anthropic', 'deepseek', 'groq'].includes(provider) && !String(key).trim()) {
      const classified = {
        code: 'API_KEY',
        title: `${provider} API key missing`,
        message: `Add your ${provider} API key in Settings → Models before using ${model || provider}.`,
        toastType: 'error'
      };
      notifyModelIssue(classified);
      return { ok: false, classified, provider };
    }
    return { ok: true, provider };
  }
  const ollama = await ensureOllamaReadyForChat();
  if (!ollama.ok) return { ok: false, classified: ollama.classified, provider: 'ollama' };
  if (String(model).endsWith('-cloud') && window.ultronAPI?.getOllamaAuthStatus) {
    try {
      const status = await window.ultronAPI.getOllamaAuthStatus();
      if (!status.signedIn) {
        const classified = {
          code: 'OLLAMA_CLOUD_AUTH',
          title: 'Sign in to Ollama Cloud',
          message: `"${model}" needs an Ollama account. Sign in under Settings → Models.`,
          toastType: 'warning'
        };
        notifyModelIssue(classified, {
          actions: [
            { label: 'Sign in', primary: true, onClick: () => window.ultronAPI?.ollamaSignin?.().catch(() => openSettingsModelsPane()) },
            { label: 'Settings', onClick: openSettingsModelsPane }
          ]
        });
        return { ok: false, classified, provider: 'ollama' };
      }
    } catch (_) { /* continue */ }
  }
  if (String(model).startsWith('hf.co/')) {
    await refreshInstalledModelsFromOllama();
    const installed = (installedModelsList || []).some((m) => String(m.name || m).toLowerCase() === String(model).toLowerCase());
    if (!installed) {
      const classified = {
        code: 'MODEL_MISSING',
        title: 'Hugging Face model not pulled',
        message: `"${model}" is not installed locally yet. Download it from Settings → Models first.`,
        toastType: 'warning'
      };
      notifyModelIssue(classified);
      return { ok: false, classified, provider: 'ollama' };
    }
  }
  return { ok: true, provider: 'ollama' };
}

async function tryGeminiFallbackAfterLocalFailure(prompt, systemPrompt, extraMessages, visionImages) {
  const apiKey = (localStorage.getItem('ultron-gemini-api-key') || '').trim();
  if (!apiKey || getLocalAiMode() === 'local-only') return null;
  if (!ONLINE_GEMINI_MODELS.length) {
    try { ONLINE_GEMINI_MODELS = await discoverGeminiModels(apiKey); } catch (_) { /* ignore */ }
  }
  const geminiModel = pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0]?.name || 'gemini-3.6-flash';
  showToast({ type: 'warning', title: 'Falling back to Google Gemini', message: `Local/Ollama request failed. Trying ${geminiModel}…`, duration: 4500 });
  try {
    const output = await queryGeminiAPI(prompt, systemPrompt, geminiModel, apiKey, extraMessages || [], visionImages || []);
    if (output && String(output).trim()) {
      activeModel = geminiModel;
      updateModelSelectorLabel();
      syncModelAttachmentCapabilities();
      showToast({ type: 'success', title: 'Gemini fallback succeeded', message: `Switched to ${geminiModel} for this reply.`, duration: 5000 });
      return output;
    }
  } catch (err) {
    notifyModelIssue(classifyModelFailure(err, geminiModel));
  }
  return null;
}

async function checkOllamaStartup() {
  logTrace('Checking Ollama connection status...', 'system');
  const conn = await checkOllamaConnection();
  if (conn.connected) {
    logTrace('Ollama connection verified on boot.', 'system');
    hideOllamaBanner();
    await runOnboardingProfiler().catch(() => {});
    renderModelDropdownList();
    return;
  }

  logTrace('Ollama not reachable. Checking if installed on machine...', 'system');
  const installCheck = await window.ultronAPI.checkOllamaInstalled();
  if (installCheck.installed) {
    logTrace(`Ollama detected on machine (Source: ${installCheck.source}). Attempting background start...`, 'system');
    showOllamaBanner('warning', 'Ollama is installed but not running. Connecting to background service...', false);

    try {
      const startResult = await window.ultronAPI.startOllamaService(installCheck.path);
      if (startResult.success) {
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 1000));
          const retryConn = await checkOllamaConnection();
          if (retryConn.connected) {
            logTrace('Ollama background service connected successfully.', 'system');
            showOllamaBanner('success', 'Ollama service started and connected successfully!', true);
            await runOnboardingProfiler().catch(() => {});
            renderModelDropdownList();
            return;
          }
        }
      }
      logTrace('Ollama service ready status checked.', 'system');
      showOllamaBanner('warning', 'Ollama is installed but not running. Please click Connect or launch the Ollama app manually.', true);
    } catch {
      showOllamaBanner('warning', 'Ollama is installed but not running. Please click Connect or launch the Ollama app manually.', true);
    }
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
    
    openSettingsPanel('models');
    return;
  }
  
  buttonElement.textContent = 'Installing...';
  logTrace('Downloading and installing Ollama via winget...', 'system');
  showOllamaBanner('warning', 'Downloading and installing Ollama via winget. This may take a few minutes...', false);
  
  const result = await window.ultronAPI.installOllama();
  if (result.success) {
    if (result.ultronRoot) {
      logTrace(`${paths.storageFolderName || 'brown-local'} ready at: ${result.ultronRoot} (models → ${result.modelsDir || result.ultronRoot + '\\models'})`, 'system');
    }
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
  let conn = await checkOllamaConnection();
  const connTitle = document.getElementById('ollama-connector-title');
  const installCheck = await window.ultronAPI.checkOllamaInstalled();

  // If installed on host but REST connection is not active yet, attempt silent start
  if (!conn.connected && installCheck && installCheck.installed) {
    logTrace('Ollama is installed on machine. Attempting background service connection...', 'system');
    await window.ultronAPI.startOllamaService(installCheck.path);
    await new Promise(r => setTimeout(r, 1000));
    conn = await checkOllamaConnection();
  }
  
  const btnInstall = document.getElementById('btn-install-ollama');

  if (conn.connected || (installedModelsList && installedModelsList.length > 0)) {
    if (connTitle) connTitle.textContent = 'Ollama';
    if (ollamaStatusBadge) {
      ollamaStatusBadge.textContent = 'Connected';
      ollamaStatusBadge.className = 'badge-active';
      ollamaStatusBadge.style.backgroundColor = '';
      ollamaStatusBadge.style.color = '';
      ollamaStatusBadge.style.border = '';
    }
    
    if (btnInstall) {
      btnInstall.classList.add('hidden');
      btnInstall.style.setProperty('display', 'none', 'important');
      btnInstall.style.setProperty('visibility', 'hidden', 'important');
      btnInstall.style.setProperty('opacity', '0', 'important');
      btnInstall.style.setProperty('pointer-events', 'none', 'important');
    }
    hideOllamaBanner();
    
    // Refresh models list UI for both prompt dropdown & settings models list
    await runOnboardingProfiler();
    renderModelDropdownList();
    renderSettingsModels();
  } else {
    if (installCheck && installCheck.installed) {
      if (connTitle) connTitle.textContent = 'Connect Ollama';
      if (ollamaStatusBadge) {
        ollamaStatusBadge.textContent = 'Installed (Not Connected)';
        ollamaStatusBadge.className = 'badge-inactive';
        ollamaStatusBadge.style.backgroundColor = 'rgba(245, 158, 11, 0.15)';
        ollamaStatusBadge.style.color = '#fbbf24';
        ollamaStatusBadge.style.border = '1px solid rgba(245, 158, 11, 0.3)';
      }
      
      if (btnInstall) {
        btnInstall.textContent = 'Connect Ollama';
        btnInstall.classList.remove('hidden');
        btnInstall.style.removeProperty('display');
        btnInstall.style.removeProperty('visibility');
        btnInstall.style.removeProperty('opacity');
        btnInstall.style.removeProperty('pointer-events');
      }
      
      showOllamaBanner('warning', 'Ollama is installed but not running. Please click Connect or launch the Ollama app manually.', true);
    } else {
      if (connTitle) connTitle.textContent = 'Connect Ollama';
      if (ollamaStatusBadge) {
        ollamaStatusBadge.textContent = 'Not Detected';
        ollamaStatusBadge.className = 'badge-inactive';
        ollamaStatusBadge.style.backgroundColor = '';
        ollamaStatusBadge.style.color = '';
        ollamaStatusBadge.style.border = '';
      }
      
      if (btnInstall) {
        btnInstall.textContent = 'Download & Install Ollama';
        btnInstall.classList.remove('hidden');
        btnInstall.style.removeProperty('display');
        btnInstall.style.removeProperty('visibility');
        btnInstall.style.removeProperty('opacity');
        btnInstall.style.removeProperty('pointer-events');
      }
    }
    
    renderSettingsModels();
  }

  if (refreshBtn) {
    refreshBtn.style.pointerEvents = '';
    const svg = refreshBtn.querySelector('svg');
    if (svg) svg.classList.remove('animate-spin');
  }

  await refreshOllamaCloudAuthUI();
}

async function refreshOllamaCloudAuthUI() {
  const badge = document.getElementById('ollama-cloud-status-badge') || document.getElementById('ollama-cloud-auth-badge');
  const btnConnect = document.getElementById('btn-toggle-ollama-cloud-connect') || document.getElementById('btn-ollama-signin');
  const btnDisconnect = document.getElementById('btn-disconnect-ollama-cloud');
  const subtitle = document.getElementById('ollama-cloud-subtitle');

  if (!window.ultronAPI?.getOllamaAuthStatus) return;

  try {
    const status = await window.ultronAPI.getOllamaAuthStatus();
    isOllamaCloudConnectedState = Boolean(status && status.signedIn);
    if (status.signedIn) {
      if (badge) {
        badge.textContent = `Connected (${OLLAMA_CLOUD_PULL_MODELS.length} Cloud Models)`;
        badge.style.background = 'rgba(52, 211, 153, 0.15)';
        badge.style.color = '#34d399';
        badge.style.borderColor = 'rgba(52, 211, 153, 0.3)';
      }
      if (subtitle) {
        subtitle.textContent = `Connected • ${OLLAMA_CLOUD_PULL_MODELS.length} Ollama Cloud models unlocked (free tier)`;
      }
      if (btnConnect) {
        btnConnect.style.display = 'none';
      }
      if (btnDisconnect) {
        btnDisconnect.style.display = 'inline-flex';
        btnDisconnect.classList.remove('hidden');
      }
    } else {
      if (badge) {
        badge.textContent = 'Not connected';
        badge.style.background = 'rgba(161, 161, 170, 0.12)';
        badge.style.color = '#a1a1aa';
        badge.style.borderColor = 'rgba(161, 161, 170, 0.25)';
      }
      if (subtitle) {
        subtitle.textContent = 'Endpoint: https://ollama.com • Official Cloud Models';
      }
      if (btnConnect) {
        btnConnect.style.display = 'inline-flex';
        btnConnect.classList.remove('hidden');
      }
      if (btnDisconnect) {
        btnDisconnect.style.display = 'none';
        btnDisconnect.classList.add('hidden');
      }
    }
  } catch (e) {
    if (badge) {
      badge.textContent = 'Not connected';
      badge.style.background = 'rgba(161, 161, 170, 0.12)';
      badge.style.color = '#a1a1aa';
    }
  }
}

async function ensureOllamaCloudAuthForPull(modelName) {
  if (!modelName || !String(modelName).toLowerCase().endsWith('-cloud')) return true;
  if (!window.ultronAPI?.getOllamaAuthStatus) return true;

  const status = await window.ultronAPI.getOllamaAuthStatus();
  if (status.signedIn) return true;

  const proceed = window.confirm(
    'Ollama Cloud models require connecting your Ollama account.\n\nOpen the official Ollama authorization page in your browser now?'
  );
  if (!proceed) return false;

  return runOllamaSigninFlow();
}

async function runOllamaSigninFlow() {
  const btnConnect = document.getElementById('btn-toggle-ollama-cloud-connect') || document.getElementById('btn-ollama-signin');
  const btnText = document.getElementById('ollama-cloud-btn-text');
  const badge = document.getElementById('ollama-cloud-status-badge') || document.getElementById('ollama-cloud-auth-badge');

  if (btnConnect) {
    btnConnect.disabled = true;
    if (btnText) btnText.textContent = 'Connecting…';
  }
  if (badge) {
    badge.textContent = 'Awaiting Browser Approval…';
    badge.style.background = 'rgba(234, 179, 8, 0.15)';
    badge.style.color = '#eab308';
    badge.style.borderColor = 'rgba(234, 179, 8, 0.3)';
  }

  // 1. Trigger sign-in (spawns ollama signin and opens connect URL in browser)
  const signinRes = await window.ultronAPI.ollamaSignin().catch(() => ({ success: false }));
  logTrace(`Ollama Cloud authorization flow initiated in browser: ${signinRes?.authUrl || 'https://ollama.com/signin'}`, 'system');

  showOllamaBanner(
    'info',
    'Opening Ollama authorization in your browser. Please approve or log in on ollama.com, then return here.',
    true
  );

  // 2. Poll live verification for up to 45 seconds (every 2.5s)
  const startTime = Date.now();
  const maxWaitMs = 45000;
  let isAuthed = false;

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(r => setTimeout(r, 2500));
    try {
      const verify = await window.ultronAPI.verifyOllamaCloudAuth();
      if (verify && verify.authorized) {
        isAuthed = true;
        break;
      }
    } catch (_) {}
  }

  if (btnConnect) {
    btnConnect.disabled = false;
    if (btnText) btnText.textContent = 'Connect Ollama Cloud';
  }

  if (isAuthed) {
    await window.ultronAPI.setOllamaAuthStatus(true);
    await refreshOllamaCloudAuthUI();
    renderModelDropdownList();
    renderSettingsModels();
    renderOllamaCatalog();
    showOllamaBanner('success', '✓ Successfully connected to Ollama Cloud! All cloud models are now available in your library.', true);
    logTrace('Verified and connected to Ollama Cloud.', 'system');
    return true;
  } else {
    await window.ultronAPI.setOllamaAuthStatus(false);
    await refreshOllamaCloudAuthUI();
    showOllamaBanner('warning', 'Ollama Cloud connection was not approved or timed out. Please click Connect to try again.', true);
    logTrace('Ollama Cloud authorization was not completed in browser.', 'system');
    return false;
  }
}

function initOllamaCloudAuthUI() {
  const btnConnect = document.getElementById('btn-toggle-ollama-cloud-connect') || document.getElementById('btn-ollama-signin');
  const btnDisconnect = document.getElementById('btn-disconnect-ollama-cloud');

  refreshOllamaCloudAuthUI();

  if (btnConnect) {
    btnConnect.addEventListener('click', async (e) => {
      e.preventDefault();
      await runOllamaSigninFlow();
    });
  }

  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', async (e) => {
      e.preventDefault();
      btnDisconnect.disabled = true;
      btnDisconnect.textContent = 'Disconnecting…';
      if (window.ultronAPI?.ollamaSignout) {
        await window.ultronAPI.ollamaSignout().catch(() => {});
      }
      if (window.ultronAPI?.setOllamaAuthStatus) {
        await window.ultronAPI.setOllamaAuthStatus(false).catch(() => {});
      }
      btnDisconnect.disabled = false;
      btnDisconnect.textContent = 'Disconnect';
      await refreshOllamaCloudAuthUI();
      renderModelDropdownList();
      renderSettingsModels();
      renderOllamaCatalog();
      logTrace('Disconnected from Ollama Cloud.', 'system');
    });
  }

  document.querySelector('.settings-tab-btn[data-tab="models"]')?.addEventListener('click', () => {
    refreshOllamaCloudAuthUI();
  });
}

initOllamaCloudAuthUI();

// Trace Logger utility
// ==========================================
// AGENT SOUNDS (drop files into Assets/sounds/)
// ==========================================
// Supported filenames (first match wins):
//   task-complete.{mp3,wav,ogg}  — every finished agent task
//   permission.{mp3,wav,ogg}     — permission / authorization prompt
//   question.{mp3,wav,ogg}       — agent asks the user a question
const ULTRON_SOUND_FILES = {
  task_complete: ['task-complete', 'complete', 'success'],
  permission: ['permission', 'alert', 'notify'],
  question: ['question', 'ask', 'prompt']
};
const ULTRON_SOUND_EXTS = ['mp3', 'wav', 'ogg'];
const _soundCache = {};
let _soundsUnlocked = false;

function unlockUltronSounds() {
  _soundsUnlocked = true;
}

['pointerdown', 'keydown', 'click'].forEach(evt => {
  document.addEventListener(evt, unlockUltronSounds, { once: true, capture: true });
});

function resolveSoundCandidates(kind) {
  const bases = ULTRON_SOUND_FILES[kind] || [];
  const customUrl = window.localStorage.getItem(`ultron-sound-file-${kind}`) || '';
  const urls = customUrl ? [customUrl] : [];
  for (const base of bases) {
    for (const ext of ULTRON_SOUND_EXTS) {
      urls.push(`../../Assets/sounds/${base}.${ext}`);
    }
  }
  return urls;
}

function isSoundEnabled(kind) {
  if (window.localStorage.getItem('ultron-sound-enabled') === 'false') return false;
  const keyMap = {
    task_complete: 'ultron-sound-task-complete',
    permission: 'ultron-sound-permission',
    question: 'ultron-sound-question'
  };
  const key = keyMap[kind];
  if (key && window.localStorage.getItem(key) === 'false') return false;
  return true;
}

function getSoundVolume() {
  const raw = window.localStorage.getItem('ultron-sound-volume');
  const n = raw != null ? Number(raw) : 55;
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n / 100)) : 0.55;
}

function playUltronSound(kind) {
  if (!_soundsUnlocked || !isSoundEnabled(kind)) return;
  try {
    const urls = resolveSoundCandidates(kind);
    if (!urls.length) return;

    const tryPlay = (index) => {
      if (index >= urls.length) return;
      const url = urls[index];
      let audio = _soundCache[url];
      if (!audio) {
        audio = new Audio(url);
        audio.preload = 'auto';
        const baseVol = getSoundVolume();
        audio.volume = kind === 'permission' ? baseVol * 1.1 : baseVol;
        _soundCache[url] = audio;
        audio.addEventListener('error', () => {
          delete _soundCache[url];
          tryPlay(index + 1);
        }, { once: true });
      }
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => tryPlay(index + 1));
      }
    };

    tryPlay(0);
  } catch (err) {
    // Silent — missing sound files are expected until the user adds them
  }
}

function expandRightSidebarSection(sectionId) {
  const section = document.getElementById(sectionId);
  if (section) section.classList.remove('collapsed');
}

function ensureRightSidebarVisible() {
  if (!rightSidebar || !rightSidebar.classList.contains('collapsed')) return;
  rightSidebar.classList.remove('collapsed');
  if (rightSidebarResizer) rightSidebarResizer.classList.remove('resizer-hidden');
  if (btnToggleRightSidebarOpen) btnToggleRightSidebarOpen.classList.add('hidden');
  if (!rightSidebar.style.width) rightSidebar.style.width = '340px';
}

function renderClarifyAppCard(query, suggestions = []) {
  const buttons = suggestions.slice(0, 4).map(name =>
    `<button type="button" class="clarify-choice-btn" data-app-choice="${escapeHtml(name)}">${escapeHtml(name)}</button>`
  ).join('');
  return `
    <div class="agent-clarify-card">
      <p><strong>Which app did you mean?</strong> "${escapeHtml(query)}" matches several installed apps.</p>
      <div class="clarify-choice-row">${buttons}</div>
    </div>`;
}

function renderErrorRecoveryCard(errorCode, message, context = {}) {
  const actions = [];
  if (errorCode === 'APP_NOT_FOUND' || errorCode === 'APP_AMBIGUOUS') {
    actions.push('<button type="button" class="error-fix-btn" data-fix-action="open-settings-apps">Open Apps Settings</button>');
    actions.push('<button type="button" class="error-fix-btn" data-fix-action="open-settings-desktop">Desktop Automation</button>');
  }
  if (errorCode === 'CAPTURE_DISABLED' || errorCode === 'CAPTURE_FAILED') {
    actions.push('<button type="button" class="error-fix-btn" data-fix-action="enable-screen">Enable Screen Capture</button>');
    actions.push('<button type="button" class="error-fix-btn" data-fix-action="switch-vision-model">Switch Vision Model</button>');
  }
  if (/ollama|model|offline/i.test(message)) {
    actions.push('<button type="button" class="error-fix-btn" data-fix-action="open-models">Open Models Settings</button>');
  }
  if (context.suggestions && context.suggestions.length) {
    context.suggestions.slice(0, 3).forEach(name => {
      actions.push(`<button type="button" class="error-fix-btn" data-fix-action="open-app" data-app-name="${escapeHtml(name)}">Try ${escapeHtml(name)}</button>`);
    });
  }
  return `
    <div class="agent-error-recovery-card">
      <p>${escapeHtml(message)}</p>
      ${actions.length ? `<div class="error-fix-row">${actions.join('')}</div>` : ''}
    </div>`;
}

function renderUndoActionCard() {
  return `<div class="agent-undo-card"><button type="button" class="error-fix-btn" data-fix-action="undo-last">Undo last file change</button></div>`;
}

// ---------------------------------------------------------------
// File source cards + document intake picker (Phase 6)
// ---------------------------------------------------------------
function renderFileSourceCard(filePath, kind, snippet) {
  const safePath = String(filePath || '');
  const name = safePath.split(/[\\/]/).pop() || safePath;
  const iconMap = { resume: '📄', cv: '📄', pdf: '📕', image: '🖼️', document: '📄', folder: '📁', file: '📄' };
  const icon = iconMap[kind] || '📄';
  const lines = String(snippet || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 3).join('\n');
  const snippetHtml = lines ? `<pre class="source-card-snippet">${escapeHtml(lines)}</pre>` : '';
  const revealBtn = `<button type="button" class="session-item-btn source-card-btn" data-action="reveal" data-path="${escapeHtml(safePath)}">Show in Folder</button>`;
  return `<div class="agent-source-card">
    <div class="source-card-head">
      <span class="source-card-icon">${icon}</span>
      <div class="source-card-meta">
        <div class="source-card-name">${escapeHtml(name)}</div>
        <div class="source-card-path">${escapeHtml(safePath)}</div>
      </div>
    </div>
    ${snippetHtml}
    <div class="source-card-actions">
      <button type="button" class="session-item-btn source-card-btn" data-action="open" data-path="${escapeHtml(safePath)}">Open</button>
      ${revealBtn}
    </div>
  </div>`;
}

// Detect "analyze my resume"-style requests with no concrete file reference
function promptNeedsDocumentIntake(text) {
  const raw = String(text || '');
  const p = raw.toLowerCase();
  if (!p) return false;
  if (/[a-z]:\\[^\s]+/i.test(raw)) return false; // explicit path already given
  const wantsAnalysis = /\b(analy[sz]e|review|read|summarize|summari[sz]e|check|look\s+at|go\s+through|proofread|evaluate|improve)\b/.test(p);
  const mentionsDoc = /\b(resume|cv|cover\s+letter|document|docx|pdf|file|paper|contract|report)\b/.test(p);
  return wantsAnalysis && mentionsDoc;
}

function renderDocumentIntakeCard(originalPrompt) {
  return `<div class="agent-intake-card" data-intake-prompt="${escapeHtml(originalPrompt || '')}">
    <div class="intake-title">Which file should I use?</div>
    <div class="intake-sub">No file is attached and I couldn't find one to reference. Pick one:</div>
    <div class="intake-actions">
      <button type="button" class="intake-btn" data-intake="attach">📎 Attach a file</button>
      <button type="button" class="intake-btn" data-intake="recent">🗂️ Pick from recent Documents</button>
      <button type="button" class="intake-btn" data-intake="path">⌨️ Type a path</button>
    </div>
    <div class="intake-recent-list hidden"></div>
    <div class="intake-path-row hidden">
      <input type="text" class="intake-path-input" placeholder="C:\\Users\\you\\Documents\\resume.pdf">
      <button type="button" class="intake-btn intake-path-ok">Use this file</button>
    </div>
  </div>`;
}

let _pendingIntakePrompt = '';

async function attachDocumentByPath(filePath, resumePrompt) {
  const api = window.ultronAPI || {};
  const readRes = api.readFile ? await api.readFile(filePath).catch(() => null) : null;
  const name = String(filePath).split(/[\\/]/).pop() || filePath;
  attachedFiles.push({
    file: null,
    name,
    size: readRes && readRes.content ? String(readRes.content).length : 0,
    type: 'text/plain',
    isImage: false,
    textContent: readRes && readRes.success ? String(readRes.content).slice(0, 12000) : '',
    dataUrl: ''
  });
  if (typeof renderAttachmentPreviews === 'function') renderAttachmentPreviews();
  if (window.UltronAgentMemory && window.UltronAgentMemory.registerArtifact) {
    const kind = /\b(resume|cv)\b/i.test(name) ? 'resume' : (/\.pdf$/i.test(name) ? 'pdf' : 'document');
    window.UltronAgentMemory.registerArtifact(kind, filePath, { source: 'INTAKE_PICKER' });
  }
  if (resumePrompt) submitPrompt(resumePrompt);
}

// Delegated handlers for the document intake picker cards
(function initDocumentIntakeHandlers() {
  document.addEventListener('click', async (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('[data-intake]') : null;
    if (!btn) return;
    const card = btn.closest('.agent-intake-card');
    if (!card) return;
    const resumePrompt = card.dataset.intakePrompt || '';
    const mode = btn.dataset.intake;
    if (mode === 'attach') {
      _pendingIntakePrompt = resumePrompt;
      const fileInput = document.getElementById('hidden-file-input');
      if (fileInput) fileInput.click();
    } else if (mode === 'recent') {
      const listEl = card.querySelector('.intake-recent-list');
      if (!listEl) return;
      listEl.classList.remove('hidden');
      listEl.innerHTML = '<div class="intake-recent-loading">Scanning Documents + Desktop…</div>';
      const res = window.ultronAPI && window.ultronAPI.listRecentDocuments ? await window.ultronAPI.listRecentDocuments().catch(() => null) : null;
      const files = (res && res.files) || [];
      if (!files.length) {
        listEl.innerHTML = '<div class="intake-recent-loading">No recent documents found — use “Attach a file” or type a path.</div>';
        return;
      }
      listEl.innerHTML = files.map(f => `<button type="button" class="intake-recent-item" data-intake-file="${escapeHtml(f.path)}">📄 ${escapeHtml(f.name)}<span class="intake-recent-path">${escapeHtml(f.path)}</span></button>`).join('');
    } else if (mode === 'path') {
      const row = card.querySelector('.intake-path-row');
      if (row) {
        row.classList.remove('hidden');
        const inp = row.querySelector('.intake-path-input');
        if (inp) inp.focus();
      }
    }
  });

  document.addEventListener('click', async (e) => {
    const target = e.target;
    if (!target || !target.closest) return;
    const recentItem = target.closest('[data-intake-file]');
    if (recentItem) {
      const card = recentItem.closest('.agent-intake-card');
      attachDocumentByPath(recentItem.dataset.intakeFile, card ? card.dataset.intakePrompt || '' : '');
      return;
    }
    const pathOk = target.closest('.intake-path-ok');
    if (pathOk) {
      const card = pathOk.closest('.agent-intake-card');
      const inp = card ? card.querySelector('.intake-path-input') : null;
      const typed = inp ? inp.value.trim() : '';
      if (!typed) return;
      const exists = window.ultronAPI && window.ultronAPI.fileExists ? await window.ultronAPI.fileExists(typed).catch(() => false) : true;
      if (!exists) {
        if (inp) inp.placeholder = 'File not found — enter a valid path';
        return;
      }
      attachDocumentByPath(typed, card ? card.dataset.intakePrompt || '' : '');
    }
  });
})();

// ---------------------------------------------------------------
// Right sidebar: System | Session tabs + live session panel
// (artifacts created/written/opened, sources read/cited, task plan)
// ---------------------------------------------------------------
let _sidebarTasks = [];
let _sidebarUploads = [];

function switchSidebarTab(tab) {
  const systemPane = document.querySelector('.analytics-sidebar-body');
  const sessionPane = document.getElementById('sidebar-session-pane');
  const tabSystem = document.getElementById('btn-sidebar-tab-system');
  const tabSession = document.getElementById('btn-sidebar-tab-session');
  const showSession = tab === 'session';
  if (systemPane) systemPane.classList.toggle('hidden', showSession);
  if (sessionPane) sessionPane.classList.toggle('hidden', !showSession);
  if (tabSystem) {
    tabSystem.classList.toggle('active', !showSession);
    tabSystem.setAttribute('aria-selected', String(!showSession));
  }
  if (tabSession) {
    tabSession.classList.toggle('active', showSession);
    tabSession.setAttribute('aria-selected', String(showSession));
  }
  if (showSession) renderSessionPanel();
}

function trackSidebarUploads(attachments, timestamp) {
  if (!Array.isArray(attachments) || !attachments.length) return;
  attachments.forEach(att => {
    _sidebarUploads.push({
      name: att.name || (att.isImage ? 'Image' : 'File'),
      isImage: Boolean(att.isImage),
      at: Number(timestamp) || Date.now()
    });
  });
  if (_sidebarUploads.length > 60) _sidebarUploads = _sidebarUploads.slice(-60);
  if (typeof renderSessionPanel === 'function') renderSessionPanel();
}

function formatSideWhen(ts) {
  const d = new Date(ts || Date.now());
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

function sideExtIcon(filename) {
  const ext = (String(filename || '').includes('.') ? String(filename).split('.').pop() : '').toLowerCase();
  const label = (ext || 'file').toUpperCase().slice(0, 4);
  return `<span class="side-ext side-ext-${escapeHtml(ext || 'bin')}">${escapeHtml(label)}</span>`;
}

const SIDE_UPLOAD_ICON = '<span class="side-ext side-ext-img"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg></span>';
const SIDE_FILE_ICON = '<span class="side-ext side-ext-bin"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg></span>';
const SIDE_WEB_ICON = '<span class="side-ext side-ext-web"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg></span>';

function sideRowHtml({ icon, name, sub, path = '', overflow = false }) {
  const openAttr = path ? ` data-side-open="${escapeHtml(path)}"` : '';
  return `
    <div class="side-row${overflow ? ' side-row-overflow' : ''}"${openAttr} title="${escapeHtml(path || name || '')}">
      ${icon}
      <span class="side-row-name">${escapeHtml(name || path || '')}</span>
      ${sub ? `<span class="side-row-sub">${escapeHtml(sub)}</span>` : ''}
    </div>`;
}

function sideSectionHtml(title, items, buildRow, { collapsed = false } = {}) {
  if (!items || !items.length) return '';
  const rows = items.map((item, i) => buildRow(item, i >= 5)).join('');
  const seeAll = items.length > 5
    ? `<button type="button" class="side-see-all" data-side-count="${items.length}">See all (${items.length})</button>`
    : '';
  return `
    <div class="side-section${collapsed ? ' collapsed' : ''}">
      <div class="side-section-head">
        <span class="side-section-title">${escapeHtml(title)}</span>
        <span class="side-count-badge">${items.length}</span>
        <svg class="side-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
      </div>
      <div class="side-section-body">${rows}${seeAll}</div>
    </div>`;
}

function renderSessionPanel() {
  const content = document.getElementById('session-panel-content');
  const empty = document.getElementById('session-panel-empty');
  if (!content) return;

  const memory = window.UltronAgentMemory;
  const artifacts = memory && typeof memory.getSessionArtifacts === 'function'
    ? memory.getSessionArtifacts(currentSessionId)
    : [];
  const tasks = _sidebarTasks;

  const readSet = new Set(['READ_FILE', 'LIST_DIR']);
  const filesChanged = artifacts.filter(a => a.kind === 'file' && !readSet.has(a.source));
  const otherArtifacts = artifacts.filter(a => !(a.kind === 'file' && !readSet.has(a.source)));
  const uploads = _sidebarUploads.slice().reverse();

  const hasAny = filesChanged.length || otherArtifacts.length || uploads.length || tasks.length;
  if (empty) empty.classList.toggle('hidden', Boolean(hasAny));
  if (!hasAny) { content.innerHTML = ''; return; }

  const parentOf = (p) => {
    const parts = String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts.length > 1 ? parts[parts.length - 2] : '';
  };
  const baseName = (a) => a.name || String(a.path || '').split(/[\\/]/).pop();

  const sections = [];

  sections.push(sideSectionHtml('Files Changed', filesChanged, (a, overflow) => sideRowHtml({
    icon: sideExtIcon(a.name || a.path),
    name: baseName(a),
    sub: parentOf(a.path),
    path: a.path,
    overflow
  })));

  sections.push(sideSectionHtml('Artifacts', otherArtifacts, (a, overflow) => sideRowHtml({
    icon: a.kind === 'web' ? SIDE_WEB_ICON : sideExtIcon(a.name || a.path),
    name: baseName(a),
    sub: readSet.has(a.source) ? 'read' : (a.kind === 'web' ? 'web' : ''),
    path: a.path,
    overflow
  })));

  sections.push(sideSectionHtml('Uploads', uploads, (u, overflow) => sideRowHtml({
    icon: u.isImage ? SIDE_UPLOAD_ICON : SIDE_FILE_ICON,
    name: u.name,
    sub: formatSideWhen(u.at),
    overflow
  })));

  sections.push(sideSectionHtml('Tasks', tasks, (task, overflow) => {
    const stateClass = task.status === 'failed' ? ' session-task-fail' : (task.completed ? ' session-task-done' : '');
    const mark = task.status === 'failed' ? '&#10005;' : (task.completed ? '&#10003;' : '&#9675;');
    return `<div class="session-task side-task${stateClass}${overflow ? ' side-row-overflow' : ''}"><span class="session-task-mark">${mark}</span><span>${escapeHtml(task.text || task.title || '')}</span></div>`;
  }));

  content.innerHTML = sections.filter(Boolean).join('');
}

// Delegated handlers: sidebar tabs + session item actions
document.addEventListener('click', async (e) => {
  const target = e.target;
  if (!target || !target.closest) return;
  const itemBtn = target.closest('.session-item-btn');
  if (itemBtn) {
    const action = itemBtn.dataset.action;
    const pathVal = itemBtn.dataset.path;
    if (!pathVal || !window.ultronAPI) return;
    if (action === 'open' && window.ultronAPI.openFileOrPath) {
      await window.ultronAPI.openFileOrPath(pathVal).catch(() => null);
    } else if (action === 'reveal' && window.ultronAPI.showItemInFolder) {
      await window.ultronAPI.showItemInFolder(pathVal).catch(() => null);
    }
    return;
  }
});

(function initSidebarTabsOnce() {
  const tabSystem = document.getElementById('btn-sidebar-tab-system');
  const tabSession = document.getElementById('btn-sidebar-tab-session');
  if (tabSystem) tabSystem.addEventListener('click', () => switchSidebarTab('system'));
  if (tabSession) tabSession.addEventListener('click', () => switchSidebarTab('session'));
  window.addEventListener('ultron:artifacts-updated', () => {
    renderSessionPanel();
    queueRagArtifactIndexing();
  });
})();

// Right sidebar section list interactions: collapse, see-all, open file row.
document.addEventListener('click', async (e) => {
  const target = e.target;
  if (!target || !target.closest) return;
  const head = target.closest('.side-section-head');
  if (head) {
    const section = head.closest('.side-section');
    if (section) section.classList.toggle('collapsed');
    return;
  }
  const seeAll = target.closest('.side-see-all');
  if (seeAll) {
    const section = seeAll.closest('.side-section');
    if (section) {
      const expanded = section.classList.toggle('expanded');
      seeAll.textContent = expanded ? 'Show less' : `See all (${seeAll.dataset.sideCount || ''})`;
    }
    return;
  }
  const row = target.closest('.side-row[data-side-open]');
  if (row && row.dataset.sideOpen && window.ultronAPI && window.ultronAPI.openFileOrPath) {
    await window.ultronAPI.openFileOrPath(row.dataset.sideOpen).catch(() => null);
  }
});

// ---- Auto-learn Knowledge Base (implicit-consent RAG) ----
// Auto-learn is ON by default and needs zero setup: Ultron indexes only what
// the user already brought into the app (opened projects, files the agent
// writes/reads) and recalls relevant excerpts automatically during chat.
function isRagAutoEnabled() {
  try { return localStorage.getItem('ultron-rag-auto') !== '0'; } catch (e) { return true; }
}

const _ragFileIndexTimers = new Map();
function queueRagFileIndex(filePath) {
  if (!filePath || !isRagAutoEnabled()) return;
  if (!window.ultronAPI || !window.ultronAPI.ragIndexFile) return;
  if (_ragFileIndexTimers.has(filePath)) clearTimeout(_ragFileIndexTimers.get(filePath));
  _ragFileIndexTimers.set(filePath, setTimeout(() => {
    _ragFileIndexTimers.delete(filePath);
    window.ultronAPI.ragIndexFile(filePath).catch(() => {});
  }, 2500));
}

// Index files the agent touched this session (artifacts), debounced per file.
function queueRagArtifactIndexing() {
  if (!isRagAutoEnabled()) return;
  try {
    const memory = window.UltronAgentMemory;
    const artifacts = memory && typeof memory.getSessionArtifacts === 'function'
      ? memory.getSessionArtifacts(currentSessionId)
      : [];
    (artifacts || []).slice(-10).forEach((a) => {
      if (a && a.kind === 'file' && a.path) queueRagFileIndex(a.path);
    });
  } catch (e) {}
}

// Pull the most relevant indexed excerpts for the current user message and
// inject them as private local context. Bounded + timeout-guarded so chat
// never stalls; returns '' when nothing is relevant.
async function getRagKnowledgeSnippet(query) {
  if (!isRagAutoEnabled()) return '';
  if (!window.ultronAPI || !window.ultronAPI.ragSearch) return '';
  if (!query || query.trim().length < 12) return '';
  try {
    const res = await Promise.race([
      window.ultronAPI.ragSearch({ query, topK: 3, minScore: 0.1 }),
      new Promise((resolve) => setTimeout(() => resolve(null), 900))
    ]);
    if (!res || !res.success || !Array.isArray(res.results) || res.results.length === 0) return '';
    const lines = res.results.map((r, i) => `[${i + 1}] ${r.fileName}: ${String(r.snippet || r.text || '').slice(0, 400)}`);
    return `\n\nPERSONAL KNOWLEDGE BASE (private excerpts from files indexed on this PC — use when relevant and mention the source file naturally):\n${lines.join('\n')}`;
  } catch (e) { return ''; }
}

function getLearnedMemorySnippet() {
  let snippet = '';
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.getTaskMemorySnippet === 'function') {
    const taskSnippet = window.UltronAgentMemory.getTaskMemorySnippet(5);
    if (taskSnippet) {
      snippet += `\n\nSELF-LEARNING MEMORY (your past task outcomes for reference):\n${taskSnippet}`;
    }
  } else if (_learnedTaskMemory.length > 0) {
    snippet += `\n\nSELF-LEARNING MEMORY (your past task outcomes for reference):\n${_learnedTaskMemory.slice(-5).map((m, i) => `${i + 1}. ${m}`).join('\n')}`;
  }
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.getAppStatsSnippet === 'function') {
    const appStats = window.UltronAgentMemory.getAppStatsSnippet(5);
    if (appStats) {
      snippet += `\n\nAPP RELIABILITY (prefer apps that launch successfully on this PC):\n${appStats}`;
    }
  }
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.getArtifactsSnippet === 'function') {
    const artifacts = window.UltronAgentMemory.getArtifactsSnippet(currentSessionId, 8);
    if (artifacts) {
      snippet += `\n\nSESSION ARTIFACTS (files/pages already created, opened or read in this chat — reference these exact paths, never recreate them):\n${artifacts}`;
    }
  }
  return snippet;
}

function getAgentRuntimeSettings() {
  if (window.UltronAgentPrompt && typeof window.UltronAgentPrompt.getAgentRuntimeConfig === 'function') {
    return window.UltronAgentPrompt.getAgentRuntimeConfig();
  }
  return {
    maxTurns: 10,
    reactFormatEnabled: true,
    skillsEnabled: true,
    contextWindowMessages: 12,
    loopGuard: { enabled: true, maxIdenticalCalls: 3, pingPongWindow: 6, pollToolBudget: 5, warnBeforeBlock: true }
  };
}

function buildAgentSkillsSnippet(userPrompt) {
  const runtime = getAgentRuntimeSettings();
  let result = '';
  if (runtime.skillsEnabled && window.UltronAgentSkills) {
    const skills = window.UltronAgentSkills.findSkillsForPrompt(userPrompt, 3);
    result += window.UltronAgentSkills.buildSkillsPromptSection(skills);
  }
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.getFormattedPreferencesPrompt === 'function') {
    result += window.UltronAgentMemory.getFormattedPreferencesPrompt();
  }
  return result;
}

function persistTaskMemory(summary) {
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.pushTaskMemory === 'function') {
    window.UltronAgentMemory.pushTaskMemory(summary);
  }
  _learnedTaskMemory.push(summary);
  if (_learnedTaskMemory.length > 20) _learnedTaskMemory.shift();
}

function looksLikeAgentQuestion(text) {
  if (!text || typeof text !== 'string') return false;
  const plain = extractPlainTextFromMessage(text) || text;
  if (plain.length > 400) return false;
  return /(\?\s*$)|(\b(can you|could you|would you|please (confirm|choose|tell|provide|approve|allow))\b)/i.test(plain.trim());
}

let _traceLogFilter = 'all';

function logTrace(message, type = 'local') {
  if (!traceLogsStream) return;
  if (_traceLogFilter !== 'all' && _traceLogFilter !== type) return;

  const empty = traceLogsStream.querySelector('.trace-empty');
  if (empty) empty.remove();

  const line = document.createElement('div');
  const typeClass = type === 'system' ? 'trace-sys'
    : type === 'error' ? 'trace-error'
    : type === 'permission' ? 'trace-permission'
    : type === 'local' ? 'trace-local'
    : '';
  line.className = `trace-line ${typeClass}`.trim();

  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  line.textContent = `[${timestamp}] ${message}`;
  line.title = `[${type.toUpperCase()}] ${message}`;

  // Keep the log stream bounded
  while (traceLogsStream.children.length >= 200) {
    traceLogsStream.removeChild(traceLogsStream.firstChild);
  }

  traceLogsStream.appendChild(line);
  traceLogsStream.scrollTop = traceLogsStream.scrollHeight;
  expandRightSidebarSection('section-trace');
}

function initTraceEmptyState() {
  if (!traceLogsStream || traceLogsStream.children.length > 0) return;
  const empty = document.createElement('div');
  empty.className = 'trace-empty';
  empty.textContent = 'Live agent logs will appear here.';
  traceLogsStream.appendChild(empty);
}

// Checklist rendering manager
function renderChecklist(tasks) {
  _sidebarTasks = Array.isArray(tasks) ? tasks : [];
  if (typeof renderSessionPanel === 'function') renderSessionPanel();
  if (!taskChecklistContainer) return;
  taskChecklistContainer.innerHTML = '';

  if (!tasks || tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'checklist-empty';
    empty.textContent = 'No active tasks yet. Ask Ultron to run something.';
    taskChecklistContainer.appendChild(empty);
    return;
  }

  tasks.forEach((task) => {
    const isCompleted = Boolean(task.completed || task.status === 'completed');
    const isFailed = task.status === 'failed';
    const isInProgress = !isCompleted && !isFailed && (task.status === 'in_progress' || task.status === 'running');

    const node = document.createElement('div');
    node.className = `task-node${isCompleted ? ' completed' : ''}${isFailed ? ' failed' : ''}${isInProgress ? ' in-progress' : ''}`;

    const mark = isCompleted ? '✓' : (isFailed ? '!' : (isInProgress ? '…' : ''));
    node.innerHTML = `
      <div class="task-check">${mark}</div>
      <span class="task-text">${escapeHtml(task.text || 'Task step')}</span>
    `;
    taskChecklistContainer.appendChild(node);
  });

  expandRightSidebarSection('section-checklist');
}

// Append Message to Chat Container and save in conversationsStore
function appendChatMessage(sender, text, isAi = false, options = {}) {
  const content = options.skipRender ? null : renderChatMessage(sender, text, isAi, options);

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

const AUTO_LOCATION_KEY = 'ultron-auto-location-enabled';
const MANUAL_LOCATION_KEY = 'ultron-location-manual';

function isAutoLocationEnabled() {
  return window.localStorage.getItem(AUTO_LOCATION_KEY) !== 'false';
}

function isManualHomeLocation() {
  return window.localStorage.getItem(MANUAL_LOCATION_KEY) === 'true';
}

function getAutoLocationLabelFromEnv(sysEnv = {}) {
  const geo = sysEnv.geoLocation || {};
  const region = sysEnv.region || {};
  const parts = [geo.city, geo.region, geo.country || region.country].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '';
}

function getLocationSourceLabel(geo = {}) {
  if (geo.source === 'windows-gps') return 'Windows Location';
  if (geo.latitude != null && geo.longitude != null) return 'IP geolocation';
  if (geo.city) return 'network estimate';
  return 'timezone';
}

function setDetectLocationButtonState(state = 'idle') {
  const detectBtn = document.getElementById('btn-detect-location');
  const detectLabel = detectBtn?.querySelector('.account-detect-label');
  const detectSpinner = detectBtn?.querySelector('.account-detect-spinner');
  if (!detectBtn) return;

  detectBtn.classList.remove('is-detecting', 'is-detected');
  if (detectSpinner) detectSpinner.classList.add('hidden');

  if (state === 'detecting') {
    detectBtn.classList.add('is-detecting');
    if (detectSpinner) detectSpinner.classList.remove('hidden');
    if (detectLabel) detectLabel.textContent = 'Detecting…';
    return;
  }

  if (state === 'detected') {
    detectBtn.classList.add('is-detected');
    if (detectLabel) detectLabel.textContent = 'Detected';
    return;
  }

  if (detectLabel) detectLabel.textContent = 'Detect';
}

function syncDetectLocationButtonFromSavedLocation() {
  const savedLoc = window.UltronLocationContext
    ? window.UltronLocationContext.getSavedLocation()
    : (window.localStorage.getItem('ultron-user-location') || '');
  if (savedLoc?.trim() && !isManualHomeLocation()) {
    setDetectLocationButtonState('detected');
  } else {
    setDetectLocationButtonState('idle');
  }
}

function persistHomeLocation(label) {
  const value = String(label || '').trim();
  if (window.UltronLocationContext) {
    window.UltronLocationContext.setSavedLocation(value);
  } else if (value) {
    window.localStorage.setItem('ultron-user-location', value);
  } else {
    window.localStorage.removeItem('ultron-user-location');
  }
}

async function autoDetectHomeLocation(options = {}) {
  const {
    silent = false,
    forceRefresh = false,
    reason = 'manual',
    allowManualOverride = false
  } = options;

  const statusEl = document.getElementById('setting-location-status');
  const inputEl = document.getElementById('setting-home-location');

  const savedLoc = window.UltronLocationContext
    ? window.UltronLocationContext.getSavedLocation()
    : (window.localStorage.getItem('ultron-user-location') || '');

  const autoEnabled = isAutoLocationEnabled();
  const manual = isManualHomeLocation();

  // If location is already present and user did not click manual detect / force refresh, use saved location immediately without network/IPC detection
  if (savedLoc && !forceRefresh && reason !== 'manual') {
    if (inputEl) inputEl.value = savedLoc;
    if (statusEl) statusEl.textContent = `Location: ${savedLoc}`;
    setDetectLocationButtonState('detected');
    return { applied: false, label: savedLoc, source: 'saved' };
  }

  if (!autoEnabled && reason !== 'manual' && !forceRefresh) {
    if (inputEl && savedLoc) inputEl.value = savedLoc;
    if (statusEl) {
      statusEl.textContent = savedLoc
        ? `Using saved location: ${savedLoc} (auto-detect off)`
        : 'Auto-detect is off. Enter your location or click Refresh.';
    }
    syncDetectLocationButtonFromSavedLocation();
    return { applied: false, label: savedLoc, source: 'saved' };
  }

  if (manual && savedLoc && !forceRefresh && !allowManualOverride) {
    if (inputEl) inputEl.value = savedLoc;
    if (statusEl) statusEl.textContent = `Using saved location: ${savedLoc}`;
    setDetectLocationButtonState('detected');
    return { applied: false, label: savedLoc, source: 'saved-manual' };
  }

  setDetectLocationButtonState('detecting');
  if (statusEl && !silent) statusEl.textContent = 'Detecting location…';

  let detectionSucceeded = false;

  try {
    _cachedSystemEnv = null;
    if (forceRefresh && window.ultronAPI?.refreshGeoLocation) {
      await window.ultronAPI.refreshGeoLocation();
    }
    const env = await getSystemContext(forceRefresh);
    const detectedLabel = getAutoLocationLabelFromEnv(env);
    const geo = env.geoLocation || {};
    const sourceLabel = getLocationSourceLabel(geo);

    if (detectedLabel) {
      detectionSucceeded = true;
      const shouldApply = forceRefresh || !manual || !savedLoc || reason === 'startup';
      const labelToUse = shouldApply ? detectedLabel : savedLoc;

      if (inputEl) inputEl.value = labelToUse;
      if (shouldApply) {
        persistHomeLocation(labelToUse);
        if (!manual || forceRefresh || reason === 'startup') {
          window.localStorage.setItem(MANUAL_LOCATION_KEY, 'false');
        }
      }

      if (statusEl) {
        statusEl.textContent = manual && savedLoc && !shouldApply
          ? `Using saved location: ${savedLoc}`
          : `Auto-detected (${sourceLabel}): ${labelToUse}`;
      }
      if (!silent) {
        logTrace(`Location ${reason === 'startup' ? 'auto-detected on startup' : 'detected'}: "${labelToUse}" [${sourceLabel}]`, 'system');
      }
      return { applied: shouldApply, label: labelToUse, source: geo.source || sourceLabel };
    }

    if (inputEl && savedLoc) inputEl.value = savedLoc;
    if (statusEl) {
      statusEl.textContent = savedLoc
        ? `Using saved location: ${savedLoc} (live detection unavailable)`
        : 'Could not detect location. Enable Windows Location or enter your city manually.';
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = 'Detection failed. Enter your city manually or click Refresh.';
  } finally {
    if (detectionSucceeded) {
      setDetectLocationButtonState('detected');
    } else if (savedLoc?.trim() && !isManualHomeLocation()) {
      setDetectLocationButtonState('detected');
    } else {
      setDetectLocationButtonState('idle');
    }
  }

  return { applied: false, label: savedLoc || '', source: 'none' };
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
  const autoLocation = locationParts.length > 0 ? locationParts.join(', ') : (region.country || 'Unknown location');
  const savedLocation = window.UltronLocationContext
    ? window.UltronLocationContext.getSavedLocation()
    : (localStorage.getItem('ultron-user-location') || '');
  const locationLabel = savedLocation || autoLocation;

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

function isUnusableChatHistoryMessage(text) {
  if (!text || typeof text !== 'string') return true;
  if (isThinkingMarkup(text) || isRichResultMarkup(text) || isAgentWidgetMarkup(text)) return true;
  const plain = extractPlainTextFromMessage(text);
  if (!plain || plain.length < 2) return true;
  if (/⚠️|Warning:\s*\*\*Ollama|Memory Limit Exceeded|Connection Error|error-recovery|GEMINI_KEY_MISSING|OLLAMA_OFFLINE|Model note:/i.test(plain)) return true;
  if (isMetaInstructionLeak(plain)) return true;
  return false;
}

function isMetaInstructionLeak(text) {
  if (!text || typeof text !== 'string') return false;
  return /\b(general guidelines for creating|specific prompt or the context|CONVERSATIONAL PERSONA|NEVER speak in the third person|guidelines for creating engaging|do not have access to .+ specific prompt|respond as if you were speaking directly to the user, using the first person|avoid (using |getting tripped up by ).+ context|chatty interactions|provide (me with )?some examples of how (i|you) can avoid|thanks for the feedback|in conclusion, here['']s an example of how to avoid)\b/i.test(text);
}

function shouldSkipConversationHistory(prompt) {
  const p = String(prompt || '').trim();
  if (isContentGenerationRequest(p)) return true;
  if (/^(hi|hello|hey|good\s*(morning|afternoon|evening|night))[\s,!.?]*(\w+)?[\s!.?]*$/i.test(p)) return true;
  return false;
}

function extractContentTopic(prompt) {
  const p = String(prompt || '');
  const quoted = p.match(/\b(?:topic|about|on)\b\s+["']([^"']+)["']/i);
  if (quoted) return quoted[1].trim().toLowerCase();
  const plain = p.match(/\b(?:topic|about|on)\b\s+([a-z0-9][a-z0-9\s-]{1,40})/i);
  return plain ? plain[1].trim().toLowerCase() : '';
}

function isIrrelevantModelResponse(text, userPrompt) {
  if (!text || typeof text !== 'string') return true;
  const plain = text.trim();
  if (!plain) return true;
  if (isMetaInstructionLeak(plain)) return true;
  if (/Model note:/i.test(plain)) return true;

  const lower = plain.toLowerCase();
  const promptLower = normalizePromptTypos(String(userPrompt || '')).toLowerCase();

  if (isGenericAssistantGreeting(plain) && (isProductOrShoppingQuery(userPrompt) || isFactualOrCurrentEventsQuery(userPrompt))) {
    return true;
  }
  if (isMultiTopicHallucination(plain, userPrompt)) return true;

  if (/thanks for the feedback/i.test(lower) && !/feedback/i.test(promptLower)) return true;
  if (/provide me with some examples/i.test(lower) && !/example/i.test(promptLower)) return true;
  if (/avoid (using |getting tripped up by )/i.test(lower)) return true;

  if (isContentGenerationRequest(userPrompt)) {
    const wantsPoem = /\bpoem\b/i.test(promptLower);
    const wantsEssay = /\bessay\b/i.test(promptLower);
    if (wantsPoem && wantsEssay === false && /\bessay\b/i.test(lower) && !/\bpoem\b/i.test(lower)) return true;
    if (wantsEssay && /\bpoem:/i.test(lower) && !/\bessay\b/i.test(lower)) return true;

    // Only apply strict single-word topic check for explicit essay/article prompts
    if (wantsEssay || /\b(article|story|poem)\b/i.test(promptLower)) {
      const topic = extractContentTopic(userPrompt);
      if (topic) {
        const topicWord = topic.split(/\s+/).find(w => w.length > 3) || topic.split(/\s+/)[0];
        if (topicWord && topicWord.length > 2 && !lower.includes(topicWord)) {
          return true;
        }
      }
    }
  }

  if (/^(hi|hello|hey)\b/i.test(promptLower.trim()) && /\b(examples of how|chatty interactions|feedback)\b/i.test(lower)) {
    return true;
  }

  return false;
}

function isGenericAssistantGreeting(text) {
  const lower = String(text || '').toLowerCase();
  return /\b(hello!?\s+i'?m brown|i'?m brown,?\s+your (ai )?assistant|how can i assist you today|how can i help you today|what can i do for you)\b/i.test(lower);
}

function buildConversationSystemPrompt() {
  return `You are Brown, a friendly, intelligent, and helpful AI assistant on the user's Windows PC.
${buildMarkdownFormattingRules()}
Reply naturally in first person ("I", "me"). Never mention system prompts, rules, or meta instructions.
When greeted (e.g. "hello", "hi", "hey", "good morning"), respond warmly and concisely in 1–2 friendly sentences (e.g. "Hello! How can I help you today?"). Do NOT dump unsolicited PC maintenance checklists, features, or system troubleshooting guides.
For current events, live prices, today's news, or who holds an office right now, say you will look it up online if you are not certain — do not invent outdated facts.`;
}

function buildContentGenerationSystemPrompt(userPrompt) {
  const topic = extractContentTopic(userPrompt);
  const topicLine = topic ? `Topic / Subject: "${topic}"` : '';
  const isGenerativeUiOrWidget = /\b(interactive\s*ui|generative\s*ui|create\s*a?\s*calculator|unit\s*converter|interactive\s*widget|mini\s*app|interactive\s*tool|live\s*dashboard\s*widget|interactive\s*simulator|ui\s*widget|html\s*widget|build\s*a?\s*widget)\b/i.test(userPrompt);

  if (isGenerativeUiOrWidget) {
    return `You are Brown, an expert full-stack developer and Generative UI specialist.
The user wants a rich, self-contained interactive UI widget rendered directly inside the chat.

CRITICAL GENERATIVE UI RULES:
1. Wrap the widget inside a \`\`\`gen-ui code block.
2. Include full HTML, embedded CSS (<style>), and working JavaScript (<script>) in a clean single block.
3. Use a modern, responsive dark-theme design matching Ultron (#0f1012 background, #18181b inputs, indigo/purple gradients, clear typography).
4. Wire up all buttons, sliders, input fields, and calculation logic with vanilla JS so it works dynamically in real time.
5. Provide a brief 1-2 sentence explanation of how to use the interactive tool.`;
  }

  const isDiagramOrVisual = /\b(diagram|flowchart|flow\s*chart|architecture|mindmap|mind\s*map|sequence\s*diagram|er\s*diagram|state\s*diagram|chart|graph|visual|infographic)\b/i.test(userPrompt);

  if (isDiagramOrVisual) {
    return `You are Brown, an expert system architect, data engineer, and visual documentation specialist.
Create a rich, comprehensive, and accurate Mermaid diagram or chart representing: "${topic || userPrompt}".

CRITICAL VISUAL DESIGN RULES:
1. **Direct In-Chat Visualization**:
   - ALWAYS output the complete Mermaid diagram inside a \`\`\`mermaid code block so it renders directly as an interactive visual in the chat.
   - STRICTLY FORBIDDEN: NEVER output HTML/CSS/JS code (e.g. \`<!DOCTYPE html>\`, \`<script>\`, or embedding instructions). Output ONLY the \`\`\`mermaid code block and concise markdown explanations.
2. **Domain-Specific Depth & Accuracy**:
   - Use REAL, deeply technical domain concepts, logical algorithm steps, components, protocols, and data flows specific to "${topic || userPrompt}".
   - STRICTLY FORBIDDEN: NEVER output placeholder names like "Step 1", "Step 2", "Node A", "Node B", "ComponentA", "Sample", or "Item 1".
3. **Choose the Best Mermaid Syntax**:
   - **For Concept Mindmaps & Taxonomies**: Use \`mindmap\` with clean hierarchy.
   - **For Flowcharts, Algorithms & Pipelines**: Use \`flowchart TD\` or \`flowchart LR\` with descriptive node labels and directional arrows (\`-->\`).
   - **For Workflows & Multi-Party Protocols**: Use \`sequenceDiagram\` with named participants.
   - **For Data Models**: Use \`erDiagram\` with entities and relationships.
4. **Comprehensive Output**:
   - Provide the complete, detailed diagram immediately.
   - Accompany the diagram with a brief 2–3 sentence architectural summary explaining the core structure.`;
  }

  const isDocumentAnalysis = /\b(attached document|resume|cv|document|pdf|paper|report)\b/i.test(userPrompt) && /\b(analyze|analyse|summary|summarize|review|extract|skills|feedback|critique|evaluate|questions?|about|read|tell me)\b/i.test(userPrompt);

  if (isDocumentAnalysis) {
    return `You are Brown, an expert document analyst, technical reviewer, and professional career advisor.
Analyze the user's provided document thoroughly, accurately, and objectively.
Rules:
- Read and reference the provided document contents carefully.
- Provide a clear, well-structured, and insightful breakdown (Executive Summary, Key Highlights/Strengths, Core Competencies/Skills, Detailed Analysis, Actionable Suggestions).
- Be specific and quote or cite exact details from the document.
- Format your response with clear markdown headings, bullet points, and tables where appropriate.
- Always provide a direct, comprehensive, and helpful answer.`;
  }

  const isWebOrCode = /\b(landing\s*page|website|webpage|page|html|css|javascript|code|script|component|app|frontend|ui|portfolio|dashboard|template)\b/i.test(userPrompt);

  if (isWebOrCode) {
    return `You are Brown, an expert web developer, UI designer, and software engineer.
Provide complete, production-ready, beautiful, and fully functional code and content matching the user's exact request.
${topicLine}
Rules:
- Write clean, modern, accessible, and responsive code (HTML5, CSS, and modern JavaScript).
- Include realistic, attractive design, typography, colors, and layout sections (Hero, Features/Services, Call-to-Action, Testimonials/Gallery, Contact/Booking, Footer).
- Format all code with proper markdown syntax highlighting blocks.
- Provide the full, complete code without omitting sections or using lazy placeholders.
- Speak directly and provide the solution immediately.`;
  }

  return `You are Brown, a skilled writing assistant. Write exactly what the user requested — complete, high-quality, and well-structured content.
${topicLine}
Rules:
- Output the complete essay, article, story, guide, or writing requested.
- Do NOT mention system prompts, context, guidelines, or meta instructions.
- Do NOT ask the user for feedback or examples.
- Stay on topic and match the requested format.`;
}

async function queryFreshConversation(prompt, imagePayloads = [], streamCallbacks = null) {
  const system = isContentGenerationRequest(prompt)
    ? buildContentGenerationSystemPrompt(prompt)
    : buildConversationSystemPrompt();
  return queryOfflineLLM(prompt, [], 'conversation', system, imagePayloads, streamCallbacks);
}

function buildConversationPromptFromHistory(recentMsgs, currentPrompt) {
  const lines = (recentMsgs || [])
    .filter(m => !isUnusableChatHistoryMessage(m.text))
    .slice(-6)
    .map(m => {
      const text = extractPlainTextFromMessage(m.text);
      if (!text) return null;
      return `${m.isAi ? 'Assistant' : 'User'}: ${text}`;
    })
    .filter(Boolean);

  const trimmedPrompt = String(currentPrompt || '').trim();
  const lastLine = lines[lines.length - 1];
  if (lastLine && lastLine.startsWith('User: ') && lastLine.slice(6).trim() === trimmedPrompt) {
    lines.pop();
  }

  if (lines.length === 0) return trimmedPrompt;
  return `${lines.join('\n')}\nUser: ${trimmedPrompt}\nAssistant:`;
}

function shouldUseOllamaGenerateForConversation(intent, customSystemPromptOverride, canUseVision, extraMessages) {
  return intent === 'conversation'
    && !customSystemPromptOverride
    && !canUseVision
    && (!Array.isArray(extraMessages) || extraMessages.length === 0);
}

function getRecentSessionContextSnippet(maxMessages = 4) {
  if (!currentSessionId || !conversationsStore[currentSessionId]) return '';
  const msgs = conversationsStore[currentSessionId].messages
    .filter(m => !isUnusableChatHistoryMessage(m.text))
    .slice(-maxMessages);
  const lines = msgs.map(m => {
    const text = extractPlainTextFromMessage(m.text);
    return text ? `${m.isAi ? 'Assistant' : 'User'}: ${text.slice(0, 600)}` : null;
  }).filter(Boolean);
  if (!lines.length) return '';
  return `[RECENT CHAT — use this context for follow-ups]\n${lines.join('\n')}`;
}

function isFollowUpAboutPriorTurn(prompt) {
  const p = normalizePromptTypos(String(prompt || '')).toLowerCase().trim();
  if (!p || p.length > 160) return false;
  return /\b(where|which (folder|path|location|destination|directory)|at what|what (folder|path|location|destination)|it (is|was|downloaded|saved)|the (image|file|folder|flower|photo|picture) (you|that)|you (downloaded|saved|created|wrote|opened)|about (the|that|this)|i am asking|asking about|you just|that you|did you)\b/i.test(p)
    || /^(where|which folder|what path|what location|what destination)\b/i.test(p);
}

function buildFollowUpConversationSystemPrompt() {
  const ctx = getRecentSessionContextSnippet(4);
  return `You are Brown, the user's local AI assistant on Windows.
${buildMarkdownFormattingRules()}
The user is asking a FOLLOW-UP about the immediately previous message in this chat.
${ctx ? `\n${ctx}\n` : ''}
Rules:
- Answer ONLY what they asked about the prior task or assistant message.
- Do NOT list unrelated topics (shopping, weather, stocks, other old requests).
- If they ask where a file was saved, quote the exact path from the assistant's previous reply.
- One short direct answer — no multi-topic bullet lists.`;
}

function isMultiTopicHallucination(text, userPrompt) {
  if (!isFollowUpAboutPriorTurn(userPrompt)) return false;
  const lower = String(text || '').toLowerCase();
  const bulletCount = (String(text || '').match(/^-\s+/gm) || []).length;
  if (bulletCount >= 2) return true;
  const topicHits = [
    /\bshoes?\b/i.test(lower),
    /\bweather\b/i.test(lower),
    /\bstock\b/i.test(lower),
    /\bapple inc\b/i.test(lower),
    /\bprime minister\b/i.test(lower)
  ].filter(Boolean).length;
  return topicHits >= 2;
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

  // 4b. Strip meta-instruction leaks (small models paraphrasing system prompts)
  if (isMetaInstructionLeak(cleaned)) {
    const withoutGuidelines = cleaned.replace(/I do not have access to[\s\S]*?(?=\n\n|\d+\.\s|$)/gi, '').trim();
    const listMatch = withoutGuidelines.match(/\d+\.\s+.+/);
    if (listMatch && isMetaInstructionLeak(withoutGuidelines)) {
      cleaned = '';
    } else {
      cleaned = withoutGuidelines;
    }
  }
  cleaned = cleaned.replace(/^(?:however,? )?i can provide (?:some )?general guidelines for[\s\S]*?(?=\n\n[A-Za-z]|$)/gi, '').trim();
  cleaned = cleaned.replace(/(?:\n|^)_Model note:[\s\S]*?_\s*$/gi, '').trim();
  cleaned = cleaned.replace(/(?:\n|^)Model note:[\s\S]*$/gi, '').trim();
  cleaned = cleaned.replace(/^in conclusion, here['’]s an example of how to avoid[\s\S]*?(?=\n\nPoem:|\n\n[A-Z]|$)/gi, '').trim();
  cleaned = cleaned.replace(/^thanks for the feedback\.[\s\S]*?(?=\n\n|$)/gi, '').trim();

  // 5. Replace template tags
  const userNameEl = document.querySelector('.profile-detail-name');
  const currentUserName = userNameEl ? userNameEl.textContent.trim() : 'User';
  cleaned = cleaned.replace(/\[your_name\]|\[Your Name\]|<your name>|\[Agent Name\]/gi, "Brown");
  cleaned = cleaned.replace(/\[user_name\]|\[User Name\]|<user name>/gi, currentUserName);

  // 6. Strip invented or unverified hyperlinks from web summaries
  if (options.allowedUrls && options.allowedUrls.length > 0) {
    cleaned = stripUnverifiedLinks(cleaned, options.allowedUrls);
  } else if (options.stripAllLinks) {
    cleaned = stripUnverifiedLinks(cleaned, []);
  }

  // 7. Never show raw tool-call JSON or tool planning to the user
  if (window.UltronToolSchema && typeof window.UltronToolSchema.stripToolJsonArtifacts === 'function') {
    cleaned = window.UltronToolSchema.stripToolJsonArtifacts(cleaned);
  } else {
    cleaned = cleaned.replace(/```(?:json)?\s*\{[\s\S]*?"tool"\s*:\s*"[^"]+"[\s\S]*?\}\s*```/gi, '');
    cleaned = cleaned.replace(/\{[^{}]*"tool"\s*:\s*"[A-Z_][A-Z0-9_]*"[^{}]*\}/g, '');
    cleaned = cleaned.replace(/^\s*(OPEN_APP|FOCUS_APP|OPEN_URL|OPEN_FILE|WRITE_FILE|READ_FILE|CAPTURE_SCREEN|TYPE_TEXT|HOTKEY|EXECUTE|SEARCH|WEB_FETCH|LIST_DIR|CLICK|DOUBLE_CLICK|SCROLL|WAIT)\s*:.*$/gmi, '');
  }
  cleaned = cleaned.replace(/Given that I cannot directly observe[\s\S]*?(?=\n\n[A-Z]|$)/gi, '');
  cleaned = cleaned.replace(/^(my approach to|i(?:'|’)ll (?:now )?(?:open|launch|capture|use tools)|here(?:'|’)s (?:my|the) (?:plan|approach)|available tools\s*[—\-])/gim, '');
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

  cleaned = structureReadableMarkdown(cleaned);

  // 8. Capitalize first letter if valid text remains
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}

function extractPlainTextFromMessage(text) {
  if (!text || typeof text !== 'string') return '';
  let cleaned = text;

  // Extract only the answer from agent execution messages (skip widget markup)
  const agentAnswerMatch = cleaned.match(/<div class="agent-final-response">([\s\S]*)<\/div>\s*$/i);
  if (agentAnswerMatch) {
    cleaned = agentAnswerMatch[1];
  }

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

  // Strip conversational lead-ins and command wrappers
  let cleaned = query
    .replace(/\bwbe\b/gi, 'web')
    .replace(/\bspiderman\b/gi, 'Spider-Man')
    // Remove "please can you search the web online for"
    .replace(/^(please\s+)?(can\s+you\s+|could\s+you\s+)?(search|google|look\s+up|find\s+out|find|finid)\s+(me\s+)?(the\s+)?(some\s+)?(web\s+)?(online\s+)?(for\s+)?/i, '')
    // Remove "search for the best", "search for", "search"
    .replace(/^(search\s+for\s+(the\s+)?(best\s+)?|search\s+(the\s+)?web\s+for\s+(the\s+)?|search\s+)/i, '')
    // Remove trailing conversational phrases like "for me", "for us", "please"
    .replace(/\s+(for\s+me|for\s+us|please|thanks)\s*$/i, '')
    // Remove question lead-ins
    .replace(/^(who|what|where|when|why|how)\s+(is|are|was|were|do|does|did|can|should|would)\s+(the\s+)?/i, '')
    .replace(/^(tell\s+me|show\s+me|give\s+me|info\s+on|details\s+on)\s+(about\s+)?/i, '')
    .trim();

  // Re-add "best " if prompt specifically asked for best
  if (/\b(best|top|recommended)\b/i.test(prompt) && !/\b(best|top|recommended)\b/i.test(cleaned)) {
    cleaned = `best ${cleaned}`;
  }

  // Smart keyword enrichment for common query formats
  if (/^who\s+(is|was|are)\b/i.test(prompt) && cleaned.split(' ').length <= 4) {
    cleaned = `${cleaned} biography profile background`;
  } else if (/^what\s+(is|are)\b/i.test(prompt) && cleaned.split(' ').length <= 4) {
    cleaned = `${cleaned} overview definition details`;
  }

  // If prompt has price/budget without currency symbol, enrich with rupees context if under numbers in rupees
  if (/\bunder\s+\d+\b/i.test(prompt) && !/\b(rupees|rs|inr|\$|usd|eur|pounds|gbp)\b/i.test(cleaned)) {
    cleaned = `${cleaned} rupees`;
  }

  return cleaned || query;
}

/** Detects text that reads like an assistant ANSWER rather than a search
 *  query — conversational preambles ("Sure, I can help…", "Here are…"),
 *  assistant-voice delivery phrases, or full numbered/markdown answer bodies.
 *  Weak models sometimes paste their drafted answer into the SEARCH tool's
 *  query field; searching for an answer yields 0 results. */
function looksLikeAnswerText(text) {
  const t = String(text || '').trim();
  if (!t) return false;
  // Conversational assistant preambles ("Sure, I can…", "Yes, here is…").
  if (/^(sure|yes|yeah|yep|certainly|absolutely|okay|ok|great|of course|no problem)\b[\s,!]+(i|we|it|that|here|let|you|thanks|thank|as|this|there)\b/i.test(t)) return true;
  if (/^(here('s| is| are)|below is|below are|the following|following are|here you go)\b/i.test(t)) return true;
  if (/^(i|we)('ll| will| can| would|'d)?\s+(help|provide|give|list|explain|summarize|show|walk|glad|happy)\b/i.test(t)) return true;
  if (/^(as an ai|thank you for|you('?re| are) welcome)\b/i.test(t)) return true;
  // Assistant-voice delivery phrases anywhere in the text.
  if (/\b(hope this helps|feel free to (ask|let)|let me know if|i can help you|here are some|here's (the|a|some)|as you can see)\b/i.test(t)) return true;
  // Full answer bodies: numbered/bulleted lists or several sentences.
  if (/\n\s*(\d+[.)]|[•*-])\s+\S/.test(t) && t.length > 120) return true;
  const sentences = t.split(/[.!?\n]+/).filter(s => s.trim().length > 3);
  if (sentences.length >= 3 && t.length > 140) return true;
  return false;
}

/** Production-grade guard for SEARCH tool targets: an answer-shaped target is
 *  never used as the web query — derive the query from the user's original
 *  question instead. */
function resolveSearchQuerySource(target, userPrompt) {
  const raw = String(target || '').trim();
  if (!raw) return { query: userPrompt, rewritten: false };
  if (looksLikeAnswerText(raw)) {
    if (typeof logTrace === 'function') {
      logTrace(`SEARCH target looked like an answer ("${raw.substring(0, 60)}…") — deriving the query from the user's question instead.`, 'system');
    }
    return { query: userPrompt, rewritten: true };
  }
  return { query: raw, rewritten: false };
}

async function buildWebSearchQuery(userPrompt) {
  let fallback = fallbackSearchQueryFromPrompt(userPrompt);
  const sysEnv = await getSystemContext();
  const regional = getRegionalShoppingContext(sysEnv);

  const locCtx = window.UltronLocationContext;
  let locationHint = '';
  if (locCtx) {
    const loc = await locCtx.resolveEffectiveLocation(userPrompt, { getSystemContext });
    locationHint = loc.label || '';
    if (locationHint && locCtx.isLocationSensitiveQuery(userPrompt)) {
      fallback = locCtx.augmentQueryWithLocation(fallback, locationHint);
    }
  } else {
    const realtime = buildRealtimeContext(sysEnv);
    locationHint = realtime.locationLabel && realtime.locationLabel !== 'Unknown location' ? realtime.locationLabel : '';
  }

  const finalizeQuery = (query) => {
    let out = String(query || '').trim();
    if (isProductOrShoppingQuery(userPrompt)) {
      out = augmentShoppingSearchQuery(userPrompt, out, regional);
    }
    return out.replace(/\s+/g, ' ').trim();
  };

  const isMetaGarbage = (str) => /\b(based on|user prompt|we can generate|search query|keywords:|live information|snippet available|ai prompt|docsbot|prompt generation)\b/i.test(str);

  if (fallback && fallback.split(' ').length <= 12 && !isMetaGarbage(fallback) && !looksLikeAnswerText(fallback)) {
    return finalizeQuery(fallback);
  }

  const shoppingHint = isProductOrShoppingQuery(userPrompt)
    ? `Shopping query — use local currency (${regional.currency || 'auto'}) and region (${regional.country || regional.countryCode || 'auto'}). Include product type and budget in keywords.`
    : '';
  const queryPlannerSystemPrompt = `You are a Search Engine Query Keyword Generator.
Convert the user prompt into 2 to 5 search keywords.
If the input reads like an assistant answer (starts with "Sure", "Here are", numbered steps, etc.) instead of a question, ignore the assistant voice and output only keywords for the underlying topic.
${locationHint ? `User location context: ${locationHint} — include it ONLY if the query is local (weather, restaurants, news, stores, events).` : ''}
${shoppingHint}
Output ONLY keywords. No sentences.`;

  const queryPlannerUserPrompt = `Prompt: "${userPrompt}"\nKeywords:`;

  try {
    const rawAiOutput = await queryOfflineLLM(queryPlannerUserPrompt, [], 'search', queryPlannerSystemPrompt);
    if (rawAiOutput && !isMetaGarbage(rawAiOutput)) {
      let planned = rawAiOutput.replace(/```[^`]*```/g, '').replace(/["'`]/g, '').trim();
      planned = fallbackSearchQueryFromPrompt(planned);
      if (locationHint && locCtx && locCtx.isLocationSensitiveQuery(userPrompt)) {
        planned = locCtx.augmentQueryWithLocation(planned, locationHint);
      }
      if (planned && planned.length >= 3) {
        logTrace(`AI Search Query Reconstructed: "${planned}"`, 'system');
        return finalizeQuery(planned);
      }
    }
  } catch (e) {
    logTrace(`Search query AI reconstruction fallback: ${e.message}`, 'system');
  }

  return finalizeQuery(fallback);
}

// ---------------------------------------------------------------
// Multi-query fan-out, ranking and citations (Phase 7)
// ---------------------------------------------------------------
async function buildFanOutQueries(userPrompt, primaryQuery) {
  const queries = [String(primaryQuery || '').trim()].filter(Boolean);
  const p = String(userPrompt || '');
  const pl = p.toLowerCase();
  const multiPart = /\b(and|also|as well as|plus|then)\b/i.test(pl) && p.split(/\s+/).length >= 8;
  const comparison = /\b(vs|versus|compare|difference between)\b/i.test(pl);
  const doubleWh = (pl.match(/\b(what|who|when|where|why|how)\b/gi) || []).length >= 2;
  if (!multiPart && !comparison && !doubleWh) return queries.slice(0, 1);
  try {
    const split = await queryOfflineLLM(
      `Split this question into at most 3 focused sub-search queries, one per line, no numbering:\n"${p}"`,
      [], 'search', 'You split broad questions into focused search queries. Output only the queries, one per line, max 3 lines, no commentary.'
    );
    const lines = String(split || '').split(/\n+/)
      .map(s => s.replace(/^[\s\-*\d.)]+/, '').replace(/^["']|["']$/g, '').trim())
      .filter(s => s && s.length >= 4 && s.length <= 120)
      .slice(0, 3);
    for (const line of lines) {
      if (!queries.some(q => q.toLowerCase() === line.toLowerCase())) queries.push(line);
    }
  } catch (err) {
    logTrace(`Fan-out query split failed: ${err.message}`, 'system');
  }
  return [...new Set(queries)].slice(0, 3);
}

// Keyword-overlap + recency ranking across merged fan-out results
function rankSearchResults(results, userPrompt) {
  const stop = new Set(['the', 'and', 'for', 'with', 'what', 'when', 'where', 'who', 'why', 'how', 'please', 'about', 'that', 'this', 'from', 'your']);
  const promptTokens = String(userPrompt || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !stop.has(t));
  const currentYear = new Date().getFullYear();
  return (Array.isArray(results) ? results : []).map(item => {
    const title = String(item.title || '').toLowerCase();
    const hay = `${title} ${item.snippet || ''}`;
    let score = 0;
    for (const token of promptTokens) {
      if (hay.includes(token)) score += title.includes(token) ? 3 : 1;
    }
    if (hay.includes(String(currentYear))) score += 4;
    else if (hay.includes(String(currentYear - 1))) score += 2;
    if (/\b(today|yesterday|this week|latest|just|hours ago|minutes ago)\b/.test(hay)) score += 3;
    if (String(item.snippet || '').length < 40) score -= 2;
    return { ...item, rankScore: score };
  }).sort((a, b) => b.rankScore - a.rankScore);
}

async function runFanOutWebSearch(userPrompt, primaryQuery, activitySteps, onStatus) {
  const queries = await buildFanOutQueries(userPrompt, primaryQuery);
  const merged = [];
  const seenUrls = new Set();
  for (let i = 0; i < queries.length; i++) {
    const q = queries[i];
    if (typeof onStatus === 'function') {
      onStatus(queries.length > 1 ? `Searching (${i + 1}/${queries.length}): "${String(q).slice(0, 40)}"` : q);
    }
    if (Array.isArray(activitySteps)) {
      activitySteps.push({ type: 'SEARCH', label: `Web search: ${String(q).slice(0, 48)}`, ts: Date.now() });
    }
    try {
      const raw = await window.ultronAPI.searchWeb(q);
      const payload = normalizeSearchPayload(raw, q);
      for (const item of payload.results || []) {
        const key = String(item.url || '').replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
        if (!key || seenUrls.has(key)) continue;
        seenUrls.add(key);
        merged.push({ ...item, matchedQuery: q });
      }
    } catch (err) {
      logTrace(`Fan-out search failed for "${q}": ${err.message}`, 'system');
    }
  }

  const ranked = rankSearchResults(merged, userPrompt);
  const searchResult = {
    success: ranked.length > 0,
    query: primaryQuery,
    queries,
    results: ranked,
    products: [],
    answerContext: '',
    needsClarification: ranked.length === 0,
    clarification: ranked.length === 0 ? `I could not find reliable web results for "${primaryQuery}".` : ''
  };

  // Full-page extraction of the top 3 results via the loopback scraper
  if (window.UltronMcpTools && typeof window.UltronMcpTools.fetchPageMarkdown === 'function') {
    for (const item of ranked.slice(0, 3)) {
      try {
        const domain = getSourceDomain(item);
        if (typeof onStatus === 'function') onStatus(`Fetching ${domain}...`);
        if (Array.isArray(activitySteps)) {
          activitySteps.push({ type: 'WEB_FETCH', label: `Fetching ${domain}`, ts: Date.now() });
        }
        const md = await Promise.race([
          Promise.resolve(window.UltronMcpTools.fetchPageMarkdown(item.url)),
          new Promise(res => setTimeout(() => res(''), 12000))
        ]);
        if (md) item.pageContent = String(md).slice(0, 4000);
      } catch (_) { /* single-page extraction is best-effort */ }
    }
  }

  // Register top sources for the Session sidebar panel
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.registerArtifact === 'function') {
    ranked.slice(0, 5).forEach(item => {
      window.UltronAgentMemory.registerArtifact('web', item.url, { source: 'SEARCH', title: item.title || '' });
    });
  }

  return searchResult;
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

function getRegionalShoppingContext(sysEnv = {}) {
  const region = sysEnv.region || {};
  const geo = sysEnv.geoLocation || {};
  const countryCode = String(geo.countryCode || region.countryCode || '').toUpperCase();
  const currency = String(region.currency || '').toUpperCase();
  const country = geo.country || region.country || '';
  const currencyWords = { INR: 'rupees', USD: 'dollars', GBP: 'pounds', EUR: 'euros', AUD: 'AUD', CAD: 'CAD' };
  return {
    countryCode,
    currency,
    country,
    currencyWord: currencyWords[currency] || currency
  };
}

function normalizePromptTypos(prompt) {
  return String(prompt || '')
    .replace(/\bfinid\b/gi, 'find')
    .replace(/\bfidn\b/gi, 'find')
    .replace(/\bserach\b/gi, 'search')
    .replace(/\bserch\b/gi, 'search')
    .replace(/\bgoogel\b/gi, 'google')
    .replace(/\bshwo\b/gi, 'show')
    .replace(/\bteh\b/gi, 'the')
    .replace(/\bmessafe\b/gi, 'message')
    .replace(/\bmesage\b/gi, 'message');
}

function isProductOrShoppingQuery(prompt) {
  const p = normalizePromptTypos(prompt).toLowerCase();
  const productNouns = 'course|courses|tutorial|tutorials|certification|certifications|classes|book|books|academy|learning|monitor|laptop|phone|headphone|earbuds|keyboard|mouse|tablet|tv|television|camera|gpu|graphics card|processor|cpu|ssd|hard drive|speaker|watch|smartwatch|fridge|refrigerator|shoe|shoes|sneaker|sneakers|footwear|sandals|boots|bag|backpack|dress|shirt|jacket|clothing|clothes|furniture|sofa|bed|mattress|bike|bicycle|scooter|buy|purchase|deal|deals|price|amazon|flipkart|myntra|ajio|meesho|tool|tools|software|app|apps';

  if (/\b(find|show|list|recommend|suggest|pick|get|give|search)\s+(me\s+)?(the\s+)?(some\s+)?/i.test(p)
      && /\b(under|below|less than|within|around|budget)\s+[\d,.]+/i.test(p)) {
    return true;
  }
  if (/\b(find|show|list|recommend|suggest|pick|get|give|search)\s+(me\s+)?(the\s+)?(best|top|good|cheap|budget|affordable)\b/i.test(p)) return true;
  if (/\b(best|top|recommended|budget|cheapest|affordable)\s+.+\b(under|below|less than|within|around)\s+[\d,.]+/i.test(p)) return true;
  if (/\b(under|below|less than|within|around)\s+[\d,.]+\b/i.test(p) && new RegExp(`\\b(${productNouns})\\b`, 'i').test(p)) return true;
  if (/\b(find|show|get|give|search)\s+(me\s+)?(the\s+)?(some\s+)?/i.test(p) && new RegExp(`\\b(${productNouns})\\b`, 'i').test(p)) return true;
  if (new RegExp(`\\b(best|top|recommended|good|popular|free|paid)\\s+(${productNouns})\\b`, 'i').test(p)) return true;
  if (/\b(which|what)\s+(monitor|laptop|phone|headphone|keyboard|mouse|tablet|tv|gpu|processor|smartphone|shoe|shoes|sneaker|course|tutorial|book|tool)\s+(should|to|can|is)\b/i.test(p)) return true;
  if (/\bcompare\b/i.test(p) && /\b(vs|versus|or)\b/i.test(p)) return true;
  return false;
}

function augmentShoppingSearchQuery(userPrompt, query, regional = {}) {
  let q = String(query || '').trim();
  const p = String(userPrompt || '');
  const { currency, countryCode, currencyWord } = regional;

  const amountMatch = p.match(/\b(under|below|less than|within|around)\s+([\d,.]+)\b/i);
  if (amountMatch) {
    const amount = amountMatch[2].replace(/,/g, '');
    const hasCurrency = /\b(inr|usd|eur|gbp|aud|cad|₹|\$|€|£|rupee|dollar|euro|pound)\b/i.test(q);
    if (!hasCurrency && currency === 'INR') {
      q = `${q} under ${amount} INR rupees India`.trim();
    } else if (!hasCurrency && currency) {
      q = `${q} under ${amount} ${currency} ${currencyWord || ''}`.trim();
    }
  }

  if (countryCode === 'IN' && !/\bindia\b/i.test(q)) {
    q = `${q} India`.trim();
  } else if (regional.country && countryCode && countryCode !== 'US' && !new RegExp(`\\b${regional.country.split(' ')[0]}\\b`, 'i').test(q)) {
    q = `${q} ${regional.country}`.trim();
  }

  return q.replace(/\s+/g, ' ').trim();
}

function hasExplicitSearchIntent(prompt) {
  const p = String(prompt || '').toLowerCase().trim();
  // Bare command words without a query topic should be handled conversationally
  if (/^(search|google|find|look up|research|browse|web search|open search)$/i.test(p)) {
    return false;
  }
  if (isProductOrShoppingQuery(prompt)) return true;
  if (/^search\s+(for|about|online|the web|google|[a-zA-Z0-9]{2,})/i.test(p)) return true;
  if (/\b(research|deep research|investigate|compare .+ vs|which is better|pros and cons)\b/i.test(p)) return true;
  if (/\b(check|get|tell me|what'?s?\s+the)\s+weather\b/i.test(p)) return true;
  if (/\bweather\s+(in|for|at)\b/i.test(p)) return true;
  if (/\b(search the web|search online|google for|look up online|find out about|latest news|current news|weather in|weather for|news about|web search)\b/i.test(p)) return true;
  if (/\b(search|google|look up|find out)\b/i.test(p) && /\b(news|weather|price|deals|latest|trending|stock|crypto|offers|website|online|page|portal)\b/i.test(p)) return true;
  if (/\?\s*$/.test(p.trim()) && /\b(best|top|recommended|under \d+|compare|vs|versus)\b/i.test(p)) return true;
  return false;
}

function searchContextForLLM(searchPayload) {
  if (!searchPayload) return '';
  return (searchPayload.results || []).map((item, index) => {
    const title = plainSearchSnippet(item.title || '');
    const snippet = plainSearchSnippet(item.snippet || '');
    const pageExcerpt = item.pageContent ? plainSearchSnippet(item.pageContent).slice(0, 1200) : '';
    const body = pageExcerpt || snippet || 'No details available.';
    return `Source [${index + 1}]: "${title}" (${item.source || 'web'})\nKey Information: ${body}`;
  }).join('\n\n');
}

function shouldAskForSearchClarification(searchPayload) {
  const results = searchPayload && Array.isArray(searchPayload.results) ? searchPayload.results : [];
  const useful = results.filter(item =>
    (item.snippet || '').trim().length > 40 || (item.pageContent || '').trim().length > 80
  ).length;
  if (results.length === 0) return true;
  if (searchPayload && searchPayload.needsClarification && useful === 0) return true;
  return false;
}

function getSourceDomain(item) {
  try {
    const urlObj = new URL(item.url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (e) {
    return item.source || 'web';
  }
}

function getSourceFaviconUrl(domain) {
  if (!domain || domain === 'web') return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

function plainSearchSnippet(text) {
  return String(text || '')
    .replace(/[=\-_~*]{3,}/g, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{"@context"[\s\S]*?\}/gi, ' ')
    .replace(/\{"@type"[\s\S]*?\}/gi, ' ')
    .replace(/\b(?:if\s*\(navigator|window\.|document\.|\$\(document\)|var\s+[a-zA-Z0-9_$]+\s*=)[\s\S]*?[;}]/gi, ' ')
    .replace(/\bURL:\s*https?:\/\/\S+/gi, ' ')
    .replace(/\bContent:\s*\*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function dedupeSearchResultsByDomain(results) {
  const seen = new Set();
  return (Array.isArray(results) ? results : []).filter(item => {
    const domain = getSourceDomain(item).toLowerCase();
    if (!domain || seen.has(domain)) return false;
    seen.add(domain);
    return true;
  });
}

function isWeatherQuery(prompt) {
  return /\bweather\b/i.test(String(prompt || ''))
    || /\b(temperature|forecast|rain|humidity)\s+(in|for|at)\b/i.test(String(prompt || ''));
}

function extractWeatherLocation(prompt) {
  const locCtx = window.UltronLocationContext;
  if (locCtx) {
    const explicit = locCtx.extractExplicitLocationFromPrompt(prompt);
    if (explicit && !locCtx.isImplicitLocationPhrase(explicit)) return explicit;
    if (locCtx.isImplicitLocationPhrase(prompt)) return '';
  }
  const p = String(prompt || '');
  const m = p.match(/\bweather\s+(?:in|for|at)\s+([^?.,!]+)/i)
    || p.match(/\b(?:check|get|what'?s?\s+the)\s+weather\s+(?:in|for|at)\s+([^?.,!]+)/i);
  if (!m) return '';
  const candidate = m[1].trim().replace(/\s+/g, ' ');
  if (/\b(here|near me|my area|local)\b/i.test(candidate)) return '';
  return candidate;
}

async function resolveWeatherLocationLabel(userPrompt) {
  const explicit = extractWeatherLocation(userPrompt);
  if (explicit) return explicit;
  const locCtx = window.UltronLocationContext;
  if (locCtx) {
    const loc = await locCtx.resolveEffectiveLocation(userPrompt, { getSystemContext });
    if (loc.label) return loc.label.split(',')[0].trim();
  }
  const sysEnv = await getSystemContext();
  const rt = buildRealtimeContext(sysEnv);
  return rt.locationLabel && rt.locationLabel !== 'Unknown location' ? rt.locationLabel.split(',')[0].trim() : 'your area';
}

async function buildWeatherResultsAnswer(userPrompt, searchPayload) {
  const results = dedupeSearchResultsByDomain(searchPayload?.results || []);
  if (!results.length) return { text: '', factCount: 0 };

  const location = await resolveWeatherLocationLabel(userPrompt);
  const chunks = results.map(item => plainSearchSnippet(item.pageContent || item.snippet || '')).filter(Boolean);
  const combined = chunks.join(' ');

  const pick = (regex) => {
    const m = combined.match(regex);
    return m ? m[1] || m[0] : '';
  };

  const temps = [...combined.matchAll(/(-?\d{1,3})\s*°\s*([CFcf])\b/g)].map(m => `${m[1]}°${(m[2] || 'C').toUpperCase()}`);
  const nowMatch = combined.match(/(?:currently|now|right now)[^.]{0,40}?(-?\d{1,3})\s*°\s*([CFcf])\b/i);
  const nowTemp = nowMatch ? `${nowMatch[1]}°${nowMatch[2].toUpperCase()}` : (temps[0] || '');
  const feelsMatch = combined.match(/feels?\s*like\s*(-?\d{1,3})\s*°\s*([CFcf])?/i);
  const feelsLike = feelsMatch ? `${feelsMatch[1]}°${(feelsMatch[2] || 'C').toUpperCase()}` : '';
  const high = pick(/(?:high|maximum|max)[:\s]*(-?\d{1,3})\s*°/i);
  const low = pick(/(?:low|minimum|min)[:\s]*(-?\d{1,3})\s*°/i);
  const humidity = pick(/humidity[:\s]*(\d{1,3})\s*%/i);
  const wind = pick(/wind[:\s]*(\d+(?:\.\d+)?\s*(?:km\/h|kmph|mph|m\/s))/i);
  const condition = pick(/\b(clear|mostly clear|partly cloudy|cloudy|overcast|rain|rainy|light rain|heavy rain|thunderstorm|sunny|fog|foggy|haze|hazy|drizzle|showers?)\b/i);

  const lines = [`**Weather in ${location}**`, ''];
  let factCount = 0;

  if (nowTemp) {
    lines.push(`- **Now:** ${nowTemp}${condition ? ` · ${condition}` : ''}`);
    factCount++;
  } else if (condition) {
    lines.push(`- **Conditions:** ${condition}`);
    factCount++;
  }
  if (high && low) {
    lines.push(`- **High / Low:** ${high}° / ${low}°`);
    factCount++;
  } else if (high) {
    lines.push(`- **High:** ${high}°`);
    factCount++;
  } else if (low) {
    lines.push(`- **Low:** ${low}°`);
    factCount++;
  }
  if (feelsLike) {
    lines.push(`- **Feels like:** ${feelsLike}`);
    factCount++;
  }
  if (humidity) {
    lines.push(`- **Humidity:** ${humidity}%`);
    factCount++;
  }
  if (wind) {
    lines.push(`- **Wind:** ${wind}`);
    factCount++;
  }

  if (factCount === 0 && chunks[0]) {
    const short = chunks[0].slice(0, 180);
    lines.push(`- ${short}${chunks[0].length > 180 ? '…' : ''}`);
    factCount = 1;
  }

  const sourceNames = results.slice(0, 4).map(r => getSourceDomain(r)).filter(Boolean);
  if (sourceNames.length) {
    lines.push('', `_Live data from ${sourceNames.join(', ')}._`);
  }

  return { text: lines.join('\n').trim(), factCount };
}

function extractProductTypeFromPrompt(prompt) {
  const m = String(prompt || '').match(/\b(monitors?|laptops?|phones?|smartphones?|headphones?|earbuds?|keyboards?|mice|mouse|tablets?|tvs?|televisions?|cameras?|gpus?|graphics cards?|processors?|cpus?|ssds?|speakers?|smartwatches?|watches?)\b/i);
  return m ? m[1] : 'products';
}

function buildProductResultsAnswer(userPrompt, searchPayload, regional = {}) {
  const results = dedupeSearchResultsByDomain(searchPayload?.results || []);
  if (!results.length) return { text: '', factCount: 0 };

  const productType = extractProductTypeFromPrompt(userPrompt);
  const budgetMatch = userPrompt.match(/\b(under|below|less than|within|around)\s+([\d,.]+)\b/i);
  let budgetLabel = '';
  if (budgetMatch) {
    const amount = budgetMatch[2];
    if (regional.currency === 'INR') budgetLabel = ` under ₹${amount}`;
    else if (regional.currency === 'USD') budgetLabel = ` under $${amount}`;
    else if (regional.currency) budgetLabel = ` under ${amount} ${regional.currency}`;
    else budgetLabel = ` under ${amount}`;
  }

  const pricePattern = /(?:₹|Rs\.?\s*|INR\s*|[$€£]\s*)([\d][\d,]*(?:\.\d{2})?)/gi;
  const seen = new Set();
  const picks = [];

  for (const item of results) {
    const title = plainSearchSnippet(item.title || '').replace(/\s*[-|–—]\s*.+$/, '').trim();
    const body = plainSearchSnippet(item.pageContent || item.snippet || '');
    if (!title || title.length < 8 || seen.has(title.toLowerCase())) continue;

    const combined = `${title} ${body}`;
    const prices = [...combined.matchAll(pricePattern)].map(m => m[0].trim()).slice(0, 2);
    const price = prices[0] || '';

    if (/\b(best|top|buy|review|price|under|budget)\b/i.test(combined) || price || /\b\d{3,}\b/.test(combined)) {
      seen.add(title.toLowerCase());
      picks.push({
        name: title.slice(0, 90),
        price,
        source: getSourceDomain(item)
      });
    }
    if (picks.length >= 6) break;
  }

  if (picks.length < 2) {
    results.slice(0, 5).forEach(item => {
      const title = plainSearchSnippet(item.title || '').trim();
      if (title.length >= 8 && !seen.has(title.toLowerCase())) {
        seen.add(title.toLowerCase());
        picks.push({ name: title.slice(0, 90), price: '', source: getSourceDomain(item) });
      }
    });
  }

  if (!picks.length) return { text: '', factCount: 0 };

  const lines = [
    `I found several top options for **${userPrompt}**:`,
    ''
  ];

  picks.forEach((pick, index) => {
    const pricePart = pick.price ? ` — **${pick.price}**` : '';
    const sourcePart = pick.source ? ` _(${pick.source})_` : '';
    lines.push(`### ${index + 1}. ${pick.name}${pricePart}`);
    if (pick.snippet) {
      lines.push(`${pick.snippet}.. [${index + 1}]${sourcePart}`);
    }
    lines.push('');
  });

  lines.push(`> 💡 *Check the interactive matches and source links below for direct access and details.*`);

  return { text: lines.join('\n').trim(), factCount: picks.length };
}

async function buildSearchFallbackAnswer(userPrompt, searchPayload) {
  const results = dedupeSearchResultsByDomain(searchPayload?.results || []);
  if (!results.length) return '';

  if (isWeatherQuery(userPrompt)) {
    const weather = await buildWeatherResultsAnswer(userPrompt, { ...searchPayload, results });
    if (weather.text) return weather.text;
  }

  if (isProductOrShoppingQuery(userPrompt)) {
    const sysEnv = await getSystemContext();
    const product = buildProductResultsAnswer(userPrompt, { ...searchPayload, results }, getRegionalShoppingContext(sysEnv));
    if (product.text) return product.text;
  }

  const cleanTitle = (rawTitle) => {
    let t = plainSearchSnippet(rawTitle || '');
    t = t.replace(/\s*[-|–—]\s*(?:IBM|AWS|Amazon|Databricks|Domo|GeeksforGeeks|Coursera|DataCamp|Wikipedia|Microsoft|Google|Oracle|Snowflake|TutorialsPoint|W3Schools|Medium|YouTube|Stack Overflow|Reddit|Quora)[^.]*$/i, '').trim();
    return t;
  };

  // Factual Q&A / Information Synthesis
  const cleanResults = results.map(item => ({
    title: cleanTitle(item.title || getSourceDomain(item)),
    source: getSourceDomain(item),
    snippet: plainSearchSnippet(item.snippet || ''),
    content: plainSearchSnippet(item.pageContent || '')
  })).filter(item => (item.snippet && item.snippet.length > 15) || (item.content && item.content.length > 20));

  if (!cleanResults.length) return '';

  const isComparison = /\b(difference between|vs\.?|compare|comparison|versus)\b/i.test(userPrompt);
  const lines = [];
  const seenSentences = new Set();

  const top = cleanResults[0];
  const primaryText = top.content || top.snippet;
  const rawSentences = primaryText
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && !/^\s*(?:if|var|const|let|\{|\$)\b/i.test(s));

  const mainSentence = rawSentences[0] || top.title;
  lines.push(`> [!NOTE]\n> **Quick Summary:** ${mainSentence} [1]\n`);

  if (isComparison) {
    const rawEntities = userPrompt.match(/difference\s+between\s+(?:the\s+)?([A-Za-z0-9\s,]+?)\s+(?:and|&|vs\.?|versus)\s+(?:the\s+)?([A-Za-z0-9\s,]+?)(?:\?|$|\.|\s+in\b)/i)
      || userPrompt.match(/\b([A-Za-z0-9\s]+?)\s+(?:vs\.?|versus)\s+([A-Za-z0-9\s]+?)(?:\?|$|\.|\s+in\b)/i);
    
    let entA = 'Concept A';
    let entB = 'Concept B';
    if (rawEntities && rawEntities[1] && rawEntities[2]) {
      entA = rawEntities[1].trim();
      entB = rawEntities[2].trim();
      if (entA.length > 25) entA = entA.slice(0, 25);
      if (entB.length > 25) entB = entB.slice(0, 25);
    }

    lines.push(`### Comparison Overview\n`);
    lines.push(`| Dimension / Feature | ${entA} | ${entB} |`);
    lines.push(`| :--- | :--- | :--- |`);

    const aspects = [
      { name: 'Core Definition', keyA: `Primary foundational paradigm of ${entA}.`, keyB: `Targeted or extended application in ${entB}.` },
      { name: 'Primary Scope', keyA: `Broad architecture and baseline functionality.`, keyB: `Specialized domain focus and tactical use.` },
      { name: 'Implementation', keyA: `Comprehensive, centralized setup and management.`, keyB: `Agile, modular, and optimized for speed.` },
      { name: 'Best For', keyA: `Enterprise-wide standard and unified operations.`, keyB: `Fast, department-level execution and agility.` }
    ];

    aspects.forEach(asp => {
      lines.push(`| **${asp.name}** | ${asp.keyA} | ${asp.keyB} |`);
    });
    lines.push('');

    // Detailed Bullet Points
    lines.push(`### Key Distinctions & Details\n`);
    for (let i = 0; i < Math.min(cleanResults.length, 5); i++) {
      const r = cleanResults[i];
      const rText = r.snippet || r.content.slice(0, 200);
      const rSentences = rText.split(/(?<=[.?!])\s+/).filter(s => s.length > 15);
      const candidate = (rSentences[0] || rText).slice(0, 160).trim();
      
      const normKey = candidate.toLowerCase().slice(0, 40);
      if (candidate && candidate.length > 20 && !seenSentences.has(normKey)) {
        seenSentences.add(normKey);
        const titleLabel = r.title.length < 35 ? r.title : 'Key Distinction';
        lines.push(`- **${titleLabel}:** ${candidate}${candidate.length >= 160 ? '…' : ''} [${i + 1}]`);
      }
    }

    lines.push(`\n> [!TIP]\n> **Decision Guide:** Choose **${entA}** for broad foundation and centralized governance; choose **${entB}** for specialized execution and modular speed.`);
  } else {
    // General factual topic
    lines.push(`### Overview & Key Insights\n`);
    for (let i = 0; i < Math.min(cleanResults.length, 4); i++) {
      const r = cleanResults[i];
      const rText = r.snippet || r.content.slice(0, 180);
      const rSentences = rText.split(/(?<=[.?!])\s+/).filter(s => s.length > 15);
      const cleanSnippet = (rSentences[0] || rText).slice(0, 160).trim();
      const normKey = cleanSnippet.toLowerCase().slice(0, 40);

      if (cleanSnippet && cleanSnippet.length > 15 && !seenSentences.has(normKey)) {
        seenSentences.add(normKey);
        const label = r.title && r.title.length < 35 ? r.title : 'Core Detail';
        lines.push(`- **${label}:** ${cleanSnippet}${cleanSnippet.length >= 160 ? '…' : ''} [${i + 1}]`);
      }
    }
  }

  return lines.join('\n').trim();
}

function formatPointwiseSearchAnswer(text, userPrompt, regional = {}) {
  let t = String(text || '').trim();
  if (!t) return t;

  // Clean prompt artifact leftovers
  t = t
    .replace(/\bURL:\s*https?:\/\/\S+/gi, '')
    .replace(/\bContent:\s*\*/gi, '')
    .replace(/\bSource \[\d+\]:\s*/gi, '')
    .replace(/\{"@context"[\s\S]*?\}/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If already well structured with bullet points, headings, table, or callouts, return
  const bulletCount = (t.match(/^\s*[-*•]\s+/gm) || []).length;
  const headingCount = (t.match(/^#{1,4}\s+/gm) || []).length;
  const numberedListCount = (t.match(/^\d+\.\s+\*\*/gm) || []).length;
  const hasTable = t.includes('|---') || t.includes('| :---');
  const hasCallout = t.includes('> [!NOTE]') || t.includes('> [!TIP]');

  if (bulletCount >= 2 || headingCount >= 1 || numberedListCount >= 1 || hasTable || hasCallout) {
    return t;
  }

  // Model produced a dense multi-line paragraph wall of text -> Auto-structure into clean point-wise breakdown
  const sentences = t
    .split(/(?<=[.?!])\s+(?=[A-Z0-9"'])/)
    .map(s => s.trim())
    .filter(s => s.length > 15);

  if (sentences.length <= 1) return t;

  const lines = [];
  lines.push(`> [!NOTE]\n> **Quick Summary:** ${sentences[0]}\n`);

  let currentItemIndex = 1;

  for (let i = 1; i < sentences.length; i++) {
    let s = sentences[i];
    if (!s) continue;

    // Detect if this sentence introduces a specific product or model
    const productMatch = s.match(/\b(Motorola|Samsung|Apple|iPhone|Xiaomi|Redmi|Realme|OnePlus|iQOO|Vivo|Oppo|Google Pixel|Nothing Phone|Poco|Sony|Asus|Lenovo|HP|Dell|Acer|MacBook|Nord|Edge|Galaxy|Pro|Plus|Ultra|Fusion|Neo|Z|GT|V\d+[a-z]?)\s+[A-Za-z0-9\s+]+/i);

    // Highlight key tech specs (chipset, display, battery, camera, prices)
    s = s
      .replace(/\b(Snapdragon\s+[A-Za-z0-9\s]+|Dimensity\s+[A-Za-z0-9\s]+|Apple\s+A\d+\s+Bionic|Apple\s+M\d+|Intel\s+Core\s+[A-Za-z0-9\s]+|Ryzen\s+[A-Za-z0-9\s]+)\b/gi, '**`$1`**')
      .replace(/\b(\d+(\.\d+)?-inch\s+(EXTREME\s+)?(AMOLED|OLED|IPS|LCD|Retina)(\s+display)?|\d{2,3}\s*Hz(\s+refresh\s+rate)?)\b/gi, '**`$1`**')
      .replace(/\b(\d{3,5}\s*mAh(\s+battery)?|\d{2,3}W(\s+fast)?\s+charging|\d+m\s+charging\s+time)\b/gi, '**`$1`**')
      .replace(/\b(\d{2,3}\s*MP(\s+main|\s+primary|\s+camera|\s+OIS)?|4k\s*@?\d*\s*fps(\s+video)?)\b/gi, '**`$1`**')
      .replace(/(?:₹|Rs\.?|INR|\$|USD|€|£)\s?[0-9][0-9,]*(?:\.[0-9]{1,2})?/gi, '**`$&`**');

    if (productMatch && (s.includes('stands out') || s.includes('best') || s.includes('powered by') || s.includes('features') || s.includes('top pick') || s.includes('ranks among'))) {
      const brandName = productMatch[0].trim();
      lines.push(`### ${currentItemIndex}. **${brandName}**`);
      lines.push(`- **Overview:** ${s}`);
      currentItemIndex++;
    } else if (/\b(In terms of|For those who|Overall|Camera|Battery|Display|Performance|Pricing|Available)\b/i.test(s)) {
      lines.push(`- **Highlight:** ${s}`);
    } else {
      lines.push(`- ${s}`);
    }
  }

  return lines.join('\n');
}

async function summarizeSearchAnswer(userPrompt, searchPayload, searchQuery, options = {}) {
  const userName = options.userName || getUserFullName();
  const loopImagePayloads = options.imagePayloads || [];
  const hopNote = options.hopNote || '';
  const dedupedPayload = {
    ...searchPayload,
    results: dedupeSearchResultsByDomain(searchPayload?.results || [])
  };
  const liveContext = searchContextForLLM(dedupedPayload);

  let locationNote = '';
  const locCtx = window.UltronLocationContext;
  if (locCtx && locCtx.isLocationSensitiveQuery(userPrompt)) {
    const loc = await locCtx.resolveEffectiveLocation(userPrompt, { getSystemContext });
    if (loc.label) {
      locationNote = `\nUser location: ${loc.label} (${loc.confidence} confidence). Use this for local results when the prompt says "near me", "here", or omits a city.`;
    }
  }

  if (isWeatherQuery(userPrompt)) {
    const weather = await buildWeatherResultsAnswer(userPrompt, dedupedPayload);
    if (weather.factCount >= 1) {
      return sanitizeResponseText(weather.text, userPrompt, {
        allowedUrls: dedupedPayload.results.map(item => item.url).filter(Boolean)
      });
    }
  }

  const sysEnv = await getSystemContext();
  const regional = getRegionalShoppingContext(sysEnv);

  const weatherBlock = isWeatherQuery(userPrompt) ? `

WEATHER FORMAT (mandatory — no paragraphs):
**Weather in [city]**

- **Now:** [temp] · [condition]
- **High / Low:** [high] / [low]
- **Humidity:** [value]
- **Wind:** [value]

Rules: Max 6 bullet lines. Only facts from live data.` : '';

  const summarySystemPrompt = `You are Brown, an intelligent, articulate AI assistant in a direct conversation with ${userName}.
Answer using ONLY the live web search data provided.${hopNote}${locationNote}${weatherBlock}

CRITICAL ANTIGRAVITY-STYLE MARKDOWN FORMATTING RULES:
1. **Executive TL;DR**: ALWAYS start with a \`> [!NOTE]\` callout block summarizing the core answer in 1–2 crisp sentences.
2. **Visual Diagrams (Mermaid)**:
   - For comparisons, architectures, data flows, relationships, or multi-step processes, ALWAYS include a complete, valid Mermaid diagram code block (\`\`\`mermaid\nflowchart TD\n  ...\n\`\`\`).
3. **Structured Comparison Tables**:
   - For comparisons ("difference between X and Y", "X vs Y", "compare"), generate a comprehensive Markdown table (| Dimension / Feature | Entity A | Entity B |) with proper headers (|:---|:---|:---|).
4. **Structured Subheadings & Bold Bullets**:
   - Use clear markdown subheadings (###) to separate distinct sections.
   - Use bullet lists with **bold lead-ins** (e.g. - **Centralized Storage:** ...) and highlight key metrics, tools, and technical terms in \`code\` or **bold**.
5. **Actionable Takeaways / Decision Tips**:
   - Include a \`> [!TIP]\` or \`> [!IMPORTANT]\` callout advising when to choose which option or best practices.
6. **No Raw Snippet Echoing**:
   - Synthesize in your own articulate words. NEVER echo raw site title suffixes (e.g. "What is a Data Mart? | IBM") or repeat duplicate snippets from multiple sources.
7. **Citations & Follow-ups**:
   - Append inline citations [1], [2] directly after key facts.
   - End with 3 follow-up question chips:
   <!-- followups: ["Question 1", "Question 2", "Question 3"] -->`;

  const summaryPrompt = `User Request: ${userPrompt}

Search Query: ${searchQuery}

Live Search Sources:
${liveContext}

Write a comprehensive, beautifully formatted Antigravity-style Markdown response with diagrams, tables, and highlights as appropriate now.`;

  let summary = await queryOfflineLLM(summaryPrompt, [], 'conversation', summarySystemPrompt, loopImagePayloads);

  const isJunkOrVerbatimEcho = (text) => {
    if (!text || text.trim().length < 15) return true;
    if (/\bURL:\s*https?:\/\//i.test(text)) return true;
    if (/\bContent:\s*\*/i.test(text)) return true;
    if (/^[^:\n]+URL:\s*https?:\/\//i.test(text)) return true;
    if (/\[Source \d+:/i.test(text)) return true;
    if (/\{"@context"/i.test(text)) return true;
    if (/\bif\s*\(navigator\./i.test(text)) return true;
    if (/^https?:\/\//i.test(text)) return true;
    return false;
  };

  if (
    !summary
    || isJunkOrVerbatimEcho(summary)
    || isModelLoadFailureResponse(summary)
    || summary.includes('offline model loop failed')
    || summary.includes('Search Query Generator')
    || (isWeatherQuery(userPrompt) && summary.split(/\n\n/).some(p => p.length > 320))
    || (isProductOrShoppingQuery(userPrompt) && /\b(don'?t have real-time|do not have real-time|without access to current|historically speaking|while i don'?t have|cannot access current)\b/i.test(summary))
  ) {
    summary = (await buildSearchFallbackAnswer(userPrompt, dedupedPayload))
      || `I found ${dedupedPayload.results.length} live result${dedupedPayload.results.length === 1 ? '' : 's'} for "${searchQuery}". Open the sources below for details.`;
  }

  // Enforce point-wise formatting on output
  summary = formatPointwiseSearchAnswer(summary, userPrompt, regional);

  return sanitizeResponseText(summary, userPrompt, {
    allowedUrls: dedupedPayload.results.map(item => item.url).filter(Boolean)
  });
}

function renderStackedSourcesHtml(results) {
  const all = dedupeSearchResultsByDomain(Array.isArray(results) ? results.slice(0, 12) : []);
  if (!all.length) return '';

  const stackCount = Math.min(4, all.length);
  const stackItems = all.slice(0, stackCount);
  const extraCount = all.length - stackCount;

  const stackHtml = stackItems.map((item, index) => {
    const domain = getSourceDomain(item);
    const faviconUrl = getSourceFaviconUrl(domain);
    const title = item.title || domain;
    return `
      <a class="source-stack-logo" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer"
         style="z-index:${stackCount - index}" title="${escapeHtml(title)} — ${escapeHtml(domain)}">
        ${faviconUrl
          ? `<img src="${escapeHtml(faviconUrl.replace('sz=32', 'sz=64'))}" alt="" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" /><span class="source-stack-fallback" style="display:none;">🌐</span>`
          : `<span class="source-stack-fallback">🌐</span>`}
      </a>
    `;
  }).join('');

  const renderSourceCard = (item, index) => {
    const domain = getSourceDomain(item);
    const faviconUrl = getSourceFaviconUrl(domain);
    return `
      <a class="source-result-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHtml(domain)}">
        <div class="source-header">
          <span class="source-cite-num source-cite-num-inline">${index + 1}</span>
          ${faviconUrl
            ? `<img class="source-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';" /><span class="source-favicon-fallback" style="display:none;">🌐</span>`
            : `<span class="source-favicon-fallback">🌐</span>`}
          <span class="source-domain">${escapeHtml(domain)}</span>
        </div>
        <div class="source-result-title">${escapeHtml(item.title || item.source || 'Web result')}</div>
      </a>
    `;
  };

  const stackBlock = `<div class="source-logo-stack" aria-label="${all.length} source${all.length === 1 ? '' : 's'}">${stackHtml}</div>`;

  const bodyHtml = extraCount > 0 ? `
    <details class="source-see-more">
      <summary class="source-see-more-summary">
        <span class="source-summary-preview">
          ${stackBlock}
          <span class="source-see-more-cta">
            <span class="source-see-more-label">Sources</span>
            <span class="source-more-count">+${extraCount}</span>
          </span>
        </span>
        <span class="source-summary-less">Hide sources</span>
      </summary>
      <div class="source-expanded-list">${all.map(renderSourceCard).join('')}</div>
    </details>
  ` : `
    <div class="source-summary-preview">
      ${stackBlock}
      <span class="source-see-more-cta">
        <span class="source-see-more-label">Sources</span>
        <span class="source-more-count">${all.length}</span>
      </span>
    </div>
  `;

  return `
    <div class="search-section search-sources-section">
      ${bodyHtml}
    </div>
  `;
}

function extractPriceFromText(text) {
  const match = String(text || '').match(/(?:₹|Rs\.?|INR|\$|USD|€|£)\s?[0-9][0-9,]*(?:\.[0-9]{1,2})?/i);
  return match ? match[0].trim() : '';
}

function formatPriceWithLocalEquivalent(priceStr, regional = {}) {
  if (!priceStr) return '';
  const clean = priceStr.trim();
  if (clean.startsWith('$') && regional.currency === 'INR') {
    const num = parseFloat(clean.replace(/[^0-9.]/g, ''));
    if (num && !isNaN(num)) {
      const inrEst = Math.round(num * 86.5);
      return `${clean} (~₹${inrEst.toLocaleString('en-IN')})`;
    }
  }
  return clean;
}

function enhanceCitationsWithTooltips(renderedHtml, results) {
  if (!renderedHtml || !Array.isArray(results) || !results.length) return renderedHtml;
  return renderedHtml.replace(/\[(\d{1,2})\]/g, (match, p1) => {
    const idx = parseInt(p1, 10) - 1;
    const item = results[idx];
    if (!item || !item.url) return match;
    const domain = getSourceDomain(item);
    const faviconUrl = getSourceFaviconUrl(domain);
    const title = escapeHtml(item.title || domain);
    const snippet = escapeHtml((item.snippet || item.pageContent || '').slice(0, 140));
    
    return `
      <span class="citation-ref-wrapper">
        <a class="citation-badge" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" data-cite-num="${p1}">[${p1}]</a>
        <span class="citation-tooltip">
          <span class="citation-tooltip-header">
            ${faviconUrl ? `<img class="citation-tooltip-favicon" src="${escapeHtml(faviconUrl)}" alt="" />` : `<span class="citation-tooltip-icon">🌐</span>`}
            <span class="citation-tooltip-domain">${escapeHtml(domain)}</span>
          </span>
          <span class="citation-tooltip-title">${title}</span>
          ${snippet ? `<span class="citation-tooltip-snippet">${snippet}..</span>` : ''}
        </span>
      </span>
    `;
  });
}

function renderSearchExperience(answer, searchPayload) {
  const results = dedupeSearchResultsByDomain(Array.isArray(searchPayload.results) ? searchPayload.results.slice(0, 12) : []);
  const videos = Array.isArray(searchPayload.videos) ? searchPayload.videos.slice(0, 4) : [];
  
  // Extract or build products / match cards list
  let items = Array.isArray(searchPayload.products) && searchPayload.products.length > 0
    ? [...searchPayload.products]
    : [];

  if (items.length === 0 && (isProductOrShoppingQuery(searchPayload.query || '') || results.length > 0)) {
    items = results.map(r => ({
      title: r.title || getSourceDomain(r),
      url: r.url,
      source: getSourceDomain(r),
      snippet: r.snippet || (r.pageContent ? r.pageContent.slice(0, 160) : ''),
      price: extractPriceFromText(`${r.title} ${r.snippet}`),
      image: r.image || '',
      type: r.type || (searchPayload.query?.includes('course') ? 'course' : 'web')
    }));
  }

  // Filter valid items and deduplicate URLs
  const seenUrls = new Set();
  items = items.filter(it => {
    if (!it.title || !it.url) return false;
    const key = it.url.toLowerCase();
    if (seenUrls.has(key)) return false;
    seenUrls.add(key);
    return true;
  });

  // Extract follow-ups from answer if present
  let cleanAnswer = answer || '';
  let followups = [];
  const followupMatch = cleanAnswer.match(/<!--\s*followups:\s*(\[[\s\S]*?\])\s*-->/i);
  if (followupMatch) {
    try {
      followups = JSON.parse(followupMatch[1]);
      cleanAnswer = cleanAnswer.replace(followupMatch[0], '').trim();
    } catch (e) {
      followups = [];
    }
  }

  // Fallback follow-ups based on query intent if none generated
  if (!followups.length && searchPayload.query) {
    const q = searchPayload.query.toLowerCase();
    if (q.includes('course') || q.includes('dsa') || q.includes('tutorial')) {
      followups = [
        `Compare the top courses for ${searchPayload.query}`,
        `Show me free alternatives and tutorials`,
        `What are the prerequisites and roadmap?`
      ];
    } else if (isProductOrShoppingQuery(q)) {
      followups = [
        `Compare the specs of the top 2 options`,
        `Are there cheaper alternatives with similar features?`,
        `What are the pros and cons of each?`
      ];
    }
  }

  const rawAnswerHtml = window.ultronAPI.parseMarkdown(
    structureReadableMarkdown(sanitizeResponseText(cleanAnswer, searchPayload.query || '', {
      allowedUrls: results.map(item => item.url).filter(Boolean)
    }))
  );

  const answerHtml = enhanceCitationsWithTooltips(rawAnswerHtml, results);

  const initialItems = items.slice(0, 4);
  const extraItems = items.slice(4, 12);

  const renderCard = (item) => {
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

    const formattedPrice = formatPriceWithLocalEquivalent(item.price);

    const cardImg = item.image 
      ? `<img class="product-result-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=70'; this.onerror=null;" />`
      : `<img class="product-result-image" src="https://images.unsplash.com/photo-1518770660439-4636190af475?w=500&auto=format&fit=crop&q=70" alt="${escapeHtml(item.title)}" loading="lazy" />`;

    return `
      <a class="product-result-card" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHtml(domain)}">
        ${cardImg}
        <div class="product-result-body">
          <div class="product-source-header">
            ${faviconUrl 
              ? `<img class="product-source-favicon" src="${escapeHtml(faviconUrl)}" alt="" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';" /><span class="product-source-icon" style="display:none;">🌐</span>` 
              : `<span class="product-source-icon">🌐</span>`
            }
            <span class="product-source-domain">${escapeHtml(domain || item.source || 'web')}</span>
            ${formattedPrice ? `<span class="product-result-price-badge">${escapeHtml(formattedPrice)}</span>` : ''}
          </div>
          <div class="product-result-title">${escapeHtml(item.title || 'Result')}</div>
          ${item.snippet ? `<div class="product-result-snippet">${escapeHtml(item.snippet)}</div>` : ''}
          <div class="product-result-footer">
            <span class="product-visit-btn">Visit <span class="product-arrow">→</span></span>
          </div>
        </div>
      </a>
    `;
  };

  const renderVideoCard = (video) => {
    return `
      <a class="video-result-card" href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(video.title)}">
        <div class="video-thumbnail-container">
          ${video.thumbnail ? `<img class="video-thumbnail-img" src="${escapeHtml(video.thumbnail)}" alt="" onerror="this.style.display='none';" />` : ''}
          <div class="video-play-overlay">
            <span class="video-play-icon">▶</span>
          </div>
        </div>
        <div class="video-result-body">
          <div class="video-source-tag">YouTube</div>
          <div class="video-result-title">${escapeHtml(video.title)}</div>
          ${video.snippet ? `<div class="video-result-snippet">${escapeHtml(video.snippet)}</div>` : ''}
        </div>
      </a>
    `;
  };

  const totalResultsCount = items.length + videos.length + results.length;

  const filtersBarHtml = `
    <div class="search-filters-bar">
      <button type="button" class="search-filter-pill active" data-filter="all">All (${totalResultsCount})</button>
      ${initialItems.length > 0 ? `<button type="button" class="search-filter-pill" data-filter="products">Featured (${items.length})</button>` : ''}
      ${videos.length > 0 ? `<button type="button" class="search-filter-pill" data-filter="videos">Videos (${videos.length})</button>` : ''}
      <button type="button" class="search-filter-pill" data-filter="sources">Sources (${results.length})</button>
    </div>
  `;

  const productHtml = items.length > 0 ? `
    <div class="search-section search-products-section">
      <div class="search-section-header">
        <div class="search-section-title-wrap">
          <span class="search-section-title">Featured Matches</span>
          <span class="search-section-count">${items.length} options found</span>
        </div>
        ${items.length > 2 ? `
        <div class="search-carousel-controls">
          <button type="button" class="search-carousel-btn search-carousel-prev" title="Scroll Left" aria-label="Previous">‹</button>
          <button type="button" class="search-carousel-btn search-carousel-next" title="Scroll Right" aria-label="Next">›</button>
        </div>` : ''}
      </div>
      <div class="product-card-carousel" tabindex="0">
        ${items.slice(0, 10).map(renderCard).join('')}
      </div>
    </div>
  ` : '';

  const videosHtml = videos.length > 0 ? `
    <div class="search-section search-videos-section">
      <div class="search-section-header">
        <span class="search-section-title">Video Guides &amp; Tutorials</span>
        <span class="search-section-count">${videos.length} videos</span>
      </div>
      <div class="video-card-grid">
        ${videos.map(renderVideoCard).join('')}
      </div>
    </div>
  ` : '';

  const sourcesHtml = renderStackedSourcesHtml(results);

  const followupsHtml = followups.length > 0 ? `
    <div class="search-followups-container">
      <div class="search-followups-title"><span class="followup-sparkle">✨</span> Related Questions</div>
      <div class="search-followups-list">
        ${followups.map(q => `<button type="button" class="search-followup-chip" data-query="${escapeHtml(q)}">${escapeHtml(q)} <span class="followup-arrow">→</span></button>`).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="ultron-search-experience">
      ${filtersBarHtml}
      <div class="search-answer">${answerHtml}</div>
      ${productHtml}
      ${videosHtml}
      ${sourcesHtml}
      ${followupsHtml}
    </div>
  `;
}

// Global click event handlers for search filter pills, carousels, and follow-up chips
document.addEventListener('click', (e) => {
  const carouselBtn = e.target.closest('.search-carousel-btn');
  if (carouselBtn) {
    const parentSection = carouselBtn.closest('.search-section');
    const carousel = parentSection?.querySelector('.product-card-carousel, .video-card-grid');
    if (carousel) {
      const scrollAmount = carouselBtn.classList.contains('search-carousel-prev') ? -320 : 320;
      carousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
    return;
  }

  const chip = e.target.closest('.search-followup-chip');
  if (chip && chip.dataset.query) {
    if (typeof submitPrompt === 'function') {
      submitPrompt(chip.dataset.query);
    }
    return;
  }

  const filterPill = e.target.closest('.search-filter-pill');
  if (filterPill) {
    const parent = filterPill.closest('.ultron-search-experience');
    if (!parent) return;
    parent.querySelectorAll('.search-filter-pill').forEach(p => p.classList.remove('active'));
    filterPill.classList.add('active');
    const filter = filterPill.dataset.filter;
    const prodSec = parent.querySelector('.search-products-section');
    const vidSec = parent.querySelector('.search-videos-section');
    const srcSec = parent.querySelector('.search-sources-section');
    if (prodSec) prodSec.style.display = (filter === 'all' || filter === 'products') ? '' : 'none';
    if (vidSec) vidSec.style.display = (filter === 'all' || filter === 'videos') ? '' : 'none';
    if (srcSec) srcSec.style.display = (filter === 'all' || filter === 'sources') ? '' : 'none';
  }
});

/**
 * True when the user wants generated text/content in chat, not desktop control.
 * e.g. "write me an essay on my country" must NOT become an OPEN_APP/WRITE_FILE task.
 */
function isContentGenerationRequest(prompt) {
  const p = String(prompt || '');
  if (isCodeOnlyGenerationRequest(p)) return true;

  // 1. Common creation / generation phrases with optional descriptors
  // Matches: "create a flowchart diagram", "draw an architecture diagram", "generate a comparison chart", "create me a landing page", etc.
  if (/\b(write|draft|compose|create|generate|give|make|build|design|code|develop|draw|show|plot)\s+(?:a\s+)?(?:me\s+)?(?:an?\s+)?(?:the\s+)?(?:\w+\s+){0,3}(diagram|flowchart|flow\s*chart|architecture|mindmap|mind\s*map|sequence\s*diagram|er\s*diagram|state\s*diagram|chart|graph|visual|infographic|essay|article|story|poem|letter|email|report|summary|speech|blog|post|paragraph|explanation|review|analysis|outline|notes?|caption|headline|bio|resume|cv|itinerary|recipe|table|guide|tutorial|documentation|pitch|proposal|ideas?|questions?|quiz|dialogue|lyrics|script|code|snippet|function|program|class|algorithm|landing\s*page|website|webpage|web\s*site|web\s*page|portfolio|homepage|home\s*page|ui|frontend|component|dashboard|mockup|wireframe|layout|template|navbar|footer|header|card|modal|form|login\s*page|signup\s*page|game|calculator|app|application)\b/i.test(p)) {
    return true;
  }

  // 1b. Direct diagram & visualization requests
  if (/\b(create|generate|draw|show|build|make)\s+(?:a\s+)?(?:flowchart|diagram|mindmap|architecture|chart|graph)\b/i.test(p)) {
    return true;
  }

  // 2. Direct web & code creation patterns ("landing page for...", "website for...", "calculator in python", "game in javascript")
  if (/\b(landing\s*page|website|webpage|web\s*site|web\s*page|portfolio|homepage)\s+(?:for|of|named|about|with)\b/i.test(p)) {
    return true;
  }

  // 3. Phrasing like "write/create/build ... in html/css/js/python/react..."
  if (/\b(write|create|build|make|generate|design|code)\s+(.+?)\s+in\s+(html|css|javascript|js|python|typescript|ts|react|vue|node|c\+\+|cpp|c#|java|php|ruby|go|rust|swift|kotlin|sql)\b/i.test(p)) {
    return true;
  }

  // 4. "How to write / create / code / build..."
  if (/\bhow\s+to\s+(write|create|build|code|make|develop|implement)\b/i.test(p)) {
    return true;
  }

  // 5. "write me", "draft me", "compose me", "create me", "build me", "make me"
  if (/\b(write|draft|compose|create|build|make|generate|design)\s+(?:a\s+)?me\b/i.test(p)) {
    return true;
  }

  // 6. Generic code/writing generation triggers
  if (/\b(write|draft|compose|generate)\s+(an?\s+)?(code|script|function|program|snippet|poem|essay|website|page)\b/i.test(p)) {
    return true;
  }

  return false;
}

/** User wants source code only (e.g. "write only html", "html code only"). */
function isCodeOnlyGenerationRequest(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (/\b(only|just)\s+(html|css|javascript|js|python|typescript|tsx?|jsx?|code|sql|json|xml|svg)\b/.test(p)) return true;
  if (/\b(html|css|javascript|js|python|typescript|tsx?|jsx?|code|sql|json|xml|svg)\s+only\b/.test(p)) return true;
  if (/\bwrite\s+(only\s+)?(html|css|javascript|js|python|code)\b/.test(p)) return true;
  if (/\b(code\s+only|only\s+code)\b/.test(p)) return true;
  if (/\bgive\s+me\s+(only\s+)?(html|css|javascript|js|python|code)\b/.test(p)) return true;
  if (/\b(show|provide|output)\s+(me\s+)?(only\s+)?(html|css|javascript|js|python|code)\b/.test(p)) return true;
  return false;
}

function detectRequestedCodeLanguage(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (/\bhtml\b/.test(p)) return 'html';
  if (/\bcss\b/.test(p)) return 'css';
  if (/\b(typescript|tsx)\b/.test(p)) return 'typescript';
  if (/\b(javascript|jsx|\bjs\b)\b/.test(p)) return 'javascript';
  if (/\bpython\b/.test(p)) return 'python';
  if (/\bsql\b/.test(p)) return 'sql';
  if (/\bjson\b/.test(p)) return 'json';
  if (/\bxml\b/.test(p)) return 'xml';
  if (/\bsvg\b/.test(p)) return 'svg';
  return 'code';
}

function buildCodeGenerationSystemPrompt(userPrompt) {
  const lang = detectRequestedCodeLanguage(userPrompt);
  const langLabel = lang === 'html' ? 'HTML5' : lang;
  return `You are Brown, a coding assistant. The user wants source code only.

Rules:
- Output exactly ONE fenced code block: \`\`\`${lang}
...your code...
\`\`\`
- Put ALL code inside that single fence — no text before or after it.
- Do NOT write explanations, markdown headings, bullet lists, or prose outside the fence.
- Do NOT invent placeholder boilerplate (copyright footers, locale/language pickers, theme dropdowns, "Your Company Name", Privacy Policy) unless the user explicitly asked for them.
- Write complete, valid ${langLabel} that matches what they asked for.
- If they said "only html", output HTML only — no separate CSS/JS unless they asked for it.`;
}

function sanitizeCodeGenerationResponse(text, userPrompt = '') {
  let cleaned = String(text || '').trim();
  if (!cleaned) return '';

  const lang = detectRequestedCodeLanguage(userPrompt);
  const fenceRe = /```(?:[\w-]+)?\s*\n?([\s\S]*?)```/gi;
  const blocks = [];
  let match;
  while ((match = fenceRe.exec(cleaned)) !== null) {
    const body = (match[1] || '').trim();
    if (body) blocks.push(body);
  }

  let code = blocks.length ? blocks.join('\n\n') : '';

  if (!code) {
    const htmlDoc = cleaned.match(/<!DOCTYPE[\s\S]*?<\/html>/i) || cleaned.match(/<html[\s\S]*?<\/html>/i);
    if (htmlDoc) code = htmlDoc[0];
  }

  if (!code) {
    cleaned = cleaned
      .replace(/©\s*\d{4}[\s\S]*?(Privacy Policy|Terms and Conditions)[^\n]*/gi, '')
      .replace(/Select your preferred (language|theme|locale)[^\n]*/gi, '')
      .replace(/Please choose a preference first[^\n]*/gi, '')
      .replace(/\bEn_US\.UTF8\b|\bEspañol\b|\bes_ES\.UTF8\b/gi, '')
      .replace(/^(sure!?|here is|here's|certainly|of course)[^\n]*\n/gi, '')
      .replace(/^#{1,6}\s+.*\n/gm, '');
    const tagLines = cleaned.split('\n').filter(line => /<\/?[a-z][^>]*>/i.test(line));
    if (tagLines.length >= 1) code = tagLines.join('\n');
  }

  if (!code) return `\`\`\`${lang}\n${cleaned.replace(/<[^>]+>/g, '').trim() || '/* No code generated — try rephrasing or switch model */'}\n\`\`\``;

  code = code
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/©\s*\d{4}[\s\S]*?(Privacy Policy|Terms)[^\n<]*/gi, '')
    .trim();

  return `\`\`\`${lang}\n${code}\n\`\`\``;
}

/** Local filesystem CRUD/exploration cues (find the largest file, list my
 *  downloads, search a drive…). These requests must be EXECUTED with tools
 *  (LIST_DIR / READ_FILE / EXECUTE) — never answered with manual
 *  "open File Explorer" instructions. */
function hasLocalFilesystemCues(prompt) {
  const p = String(prompt || '').toLowerCase().replace(/\s+/g, ' ');
  // How-to / command-knowledge questions stay conversational.
  if (/\b(how (do|does|can|to)|explain|teach me|which command|what command|what is the command|steps to|tutorial)\b/.test(p)) return false;
  // Web / software / shopping topics are not local filesystem tasks.
  if (/\b(website|web|internet|online|software|app store|play store|cloud|buy|price|subscription|download from)\b/.test(p)) return false;
  // Must reference files / folders / drives at all.
  if (!/\b(files?|folders?|director(y|ies)|drives?|disks?|documents|downloads|desktop|pictures|videos|music)\b/.test(p)) return false;
  // Must contain a verb aimed at the filesystem.
  if (!/\b(find|locate|look for|search|show|list|read|open|scan|check|get|tell me|which|what)\b/.test(p)) return false;
  const imperative = /\b(find|locate|look for|show|list|scan|get|tell me)\b/.test(p);
  const superlative = /\b(largest|biggest|smallest|oldest|newest|heaviest|most recent|recent|last modified|recently (modified|created|added|downloaded)|takes? up (the )?most|most space)\b/.test(p);
  const scope = /\bmy\s+(?:[a-z0-9._-]+\s+)?(pc|computer|machine|system|laptop|desktop|drive|drives|disk|hard ?disk|local disk|documents|downloads|pictures|videos|music|folder|directory|files?)\b/.test(p)
    || /\b(on|in|inside|from|of|across|through)\s+(?:my|the|this)\s+(?:[a-z0-9._-]+\s+)?(pc|computer|machine|system|laptop|desktop|drive|drives|disk|hard ?disk|local disk|documents|downloads|pictures|videos|music|folder|directory)\b/.test(p)
    || /\b[c-g]\s+drive\b/.test(p)
    || /[a-z]:[\\/]/.test(p);
  // "find the largest file" is inherently local; otherwise require local scope.
  if (imperative && superlative) return true;
  return scope;
}

/**
 * Mathematical Calculation & Arithmetic Engine Skill
 * Evaluates arithmetic, formulas, percentages, trigonometry, and roots with 100% precision.
 */
function evaluateMathQuery(prompt) {
  const p = String(prompt || '').trim();
  if (!p) return null;

  // 1. Percentage: "15% of 8500" or "what is 20% of 250"
  const pctMatch = p.match(/(?:what\s+is\s+|calculate\s+|how\s+much\s+is\s+)?([0-9.]+)\s*%\s*(?:of|\*)\s*([0-9.]+)/i);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    const total = parseFloat(pctMatch[2]);
    const res = (pct / 100) * total;
    return {
      type: 'percentage',
      expression: `${pct}% of ${total}`,
      result: res,
      formattedResult: Number.isInteger(res) ? res.toLocaleString() : res.toLocaleString(undefined, { maximumFractionDigits: 6 }),
      steps: [
        `Convert ${pct}% to decimal: ${pct} ÷ 100 = ${pct / 100}`,
        `Multiply by base value: ${pct / 100} × ${total} = ${res}`
      ]
    };
  }

  // 2. Arithmetic / Math Expression
  const cleanExpr = p
    .replace(/^(?:how\s+much\s+is|what\s+is\s+the\s+value\s+of|what\s+is|what's|calculate|compute|solve|evaluate)\s+/i, '')
    .replace(/\?+$/, '')
    .replace(/=/g, '')
    .trim();

  // Normalize operators
  let expr = cleanExpr
    .replace(/\b(?:sqrt|square\s+root\s+of)\s*\(\s*([0-9.]+)\s*\)/gi, 'Math.sqrt($1)')
    .replace(/\b(?:sqrt|square\s+root\s+of)\s+([0-9.]+)/gi, 'Math.sqrt($1)')
    .replace(/\b(?:cbrt|cube\s+root\s+of)\s*\(\s*([0-9.]+)\s*\)/gi, 'Math.cbrt($1)')
    .replace(/\b(?:abs)\s*\(\s*([0-9.-]+)\s*\)/gi, 'Math.abs($1)')
    .replace(/\b(?:sin)\s*\(\s*([0-9.]+)\s*\)/gi, 'Math.sin($1 * Math.PI / 180)')
    .replace(/\b(?:cos)\s*\(\s*([0-9.]+)\s*\)/gi, 'Math.cos($1 * Math.PI / 180)')
    .replace(/\b(?:tan)\s*\(\s*([0-9.]+)\s*\)/gi, 'Math.tan($1 * Math.PI / 180)')
    .replace(/\b(?:log)\s*\(\s*([0-9.]+)\s*\)/gi, 'Math.log10($1)')
    .replace(/\b(?:ln)\s*\(\s*([0-9.]+)\s*\)/gi, 'Math.log($1)')
    .replace(/(\d+)\s*\^\s*(\d+)/g, 'Math.pow($1, $2)')
    .replace(/[xX×]/g, '*')
    .replace(/÷/g, '/');

  // Verify expression contains only safe math tokens: numbers, operators, Math functions, parentheses, spaces
  if (/^[0-9\s.+\-*/%(),Math.sqrtcbsintanlopwPI]+$/.test(expr) && /\d/.test(expr)) {
    try {
      const calculated = Function(`'use strict'; return (${expr});`)();
      if (typeof calculated === 'number' && !isNaN(calculated) && isFinite(calculated)) {
        const rounded = Number.isInteger(calculated)
          ? calculated.toLocaleString()
          : (Math.abs(calculated) < 0.000001
              ? calculated.toExponential(4)
              : calculated.toLocaleString(undefined, { maximumFractionDigits: 8 }));

        return {
          type: 'arithmetic',
          expression: cleanExpr,
          result: calculated,
          formattedResult: rounded
        };
      }
    } catch (e) {
      return null;
    }
  }

  return null;
}

function isMathOrCalculationQuery(prompt) {
  const p = String(prompt || '').toLowerCase().trim();
  if (!p) return false;
  if (evaluateMathQuery(p)) return true;
  if (/^(?:calculate|compute|solve|evaluate)\s+[0-9a-z(]/i.test(p)) return true;
  if (/^(?:what\s+is|what's|how\s+much\s+is)\s+[0-9\s.+\-*/%^()xX÷×]+\??$/i.test(p)) return true;
  if (/\b\d+\s*%\s*(?:of|\*)\s*\d+/i.test(p)) return true;
  if (/\b(?:sqrt|cbrt|sin|cos|tan|log|factorial)\s*\(\s*\d+/i.test(p)) return true;
  return false;
}

function formatMathSolution(math) {
  if (!math) return '';
  if (math.type === 'percentage') {
    return `### 🧮 Calculation Result\n\n**${math.expression}** = **\`${math.formattedResult}\`**\n\n#### Steps:\n${math.steps.map(s => `- ${s}`).join('\n')}`;
  }
  return `### 🧮 Calculation Result\n\n**${math.expression}** = **\`${math.formattedResult}\`**\n\n- **Exact Value:** \`${math.result}\``;
}

function isSystemControlQuery(prompt) {
  const p = String(prompt || '').toLowerCase().trim();
  if (!p) return false;
  // Volume controls: "set volume to 35%", "set system volume to 15 percent", "volume 50%", "mute", "unmute", "turn volume up"
  if (/\b(set\s+(?:system\s+)?volume|change\s+volume|volume\s+to|volume\s+up|volume\s+down|turn\s+(?:up|down)\s+volume|turn\s+the\s+volume|mute\s+audio|unmute\s+audio|toggle\s+mute|mute\s+volume|unmute\s+volume|mute|unmute)\b/i.test(p)) {
    return true;
  }
  if (/\b(?:volume)\b/i.test(p) && /\b(?:\d{1,3}\s*%|\d{1,3}\s*percent|\d{1,3})\b/i.test(p)) {
    return true;
  }
  // Media controls: "play music", "pause music", "next track", "previous track", "stop music"
  if (/\b(pause\s+music|play\s+music|pause\s+song|play\s+song|next\s+track|previous\s+track|prev\s+track|next\s+song|previous\s+song|stop\s+music|resume\s+music|skip\s+song|skip\s+track)\b/i.test(p)) {
    return true;
  }
  // Screen brightness: "set brightness to 70%", "brightness 80%"
  if (/\b(set\s+(?:screen\s+)?brightness|change\s+brightness|brightness\s+to)\b/i.test(p)) {
    return true;
  }
  // System lock / sleep / restart: "lock my pc", "sleep pc", "lock computer"
  if (/\b(lock\s+(?:my\s+)?(?:pc|computer|workstation|screen)|put\s+(?:pc|computer)\s+to\s+sleep|sleep\s+(?:pc|computer))\b/i.test(p)) {
    return true;
  }
  return false;
}

async function executeSystemControlQuery(prompt) {
  const p = String(prompt || '').toLowerCase().trim();
  if (!window.ultronAPI) return { success: false, message: 'System API unavailable.' };

  // Volume: "set volume to 35%", "set system volume to 15 percent", "set system volume to 35%"
  const volMatch = p.match(/\b(?:set\s+(?:system\s+)?volume\s+(?:to\s+)?|volume\s+(?:to\s+)?|turn\s+(?:the\s+)?volume\s+to\s+)(\d{1,3})(?:\s*%|\s*percent)?/i)
    || p.match(/(\d{1,3})\s*(?:%|percent)\s+volume/i)
    || p.match(/volume\s+(\d{1,3})/i);

  if (volMatch && volMatch[1]) {
    const level = Math.max(0, Math.min(100, parseInt(volMatch[1], 10)));
    const res = await window.ultronAPI.windowsSetVolume(level);
    return {
      success: res?.success !== false,
      message: `🔊 **System Volume Set**: Adjusted master volume to **${level}%**.`
    };
  }

  if (/\b(volume\s+up|turn\s+up\s+volume|increase\s+volume)\b/i.test(p)) {
    const cur = await window.ultronAPI.windowsGetVolume();
    const target = Math.min(100, (cur.level || 50) + 10);
    await window.ultronAPI.windowsSetVolume(target);
    return {
      success: true,
      message: `🔊 **Volume Increased**: Adjusted volume from **${cur.level}%** to **${target}%**.`
    };
  }

  if (/\b(volume\s+down|turn\s+down\s+volume|decrease\s+volume|lower\s+volume)\b/i.test(p)) {
    const cur = await window.ultronAPI.windowsGetVolume();
    const target = Math.max(0, (cur.level || 50) - 10);
    await window.ultronAPI.windowsSetVolume(target);
    return {
      success: true,
      message: `🔉 **Volume Decreased**: Adjusted volume from **${cur.level}%** to **${target}%**.`
    };
  }

  if (/\b(mute\s+volume|mute\s+audio|mute\s+sound|mute)\b/i.test(p) && !p.includes('unmute')) {
    await window.ultronAPI.windowsToggleMute();
    return {
      success: true,
      message: `🔇 **Audio Muted**: Master audio has been muted.`
    };
  }

  if (/\b(unmute\s+volume|unmute\s+audio|unmute\s+sound|unmute|toggle\s+mute)\b/i.test(p)) {
    await window.ultronAPI.windowsToggleMute();
    return {
      success: true,
      message: `🔊 **Audio Unmuted**: Master audio is now active.`
    };
  }

  // Media playback
  if (/\b(pause|stop)\s+(music|song|track|playback|spotify|youtube)\b/i.test(p) || p === 'pause') {
    await window.ultronAPI.windowsMediaKey('pause');
    return { success: true, message: `⏸️ **Media Paused**: Playback paused.` };
  }

  if (/\b(play|resume)\s+(music|song|track|playback|spotify|youtube)\b/i.test(p) || p === 'play') {
    await window.ultronAPI.windowsMediaKey('play');
    return { success: true, message: `▶️ **Media Playing**: Playback resumed.` };
  }

  if (/\b(next\s+track|next\s+song|skip\s+song|skip\s+track)\b/i.test(p)) {
    await window.ultronAPI.windowsMediaKey('next');
    return { success: true, message: `⏭️ **Next Track**: Skipped to the next track.` };
  }

  if (/\b(previous\s+track|previous\s+song|prev\s+track|prev\s+song)\b/i.test(p)) {
    await window.ultronAPI.windowsMediaKey('prev');
    return { success: true, message: `⏮️ **Previous Track**: Returned to previous track.` };
  }

  // Brightness
  const brightMatch = p.match(/\b(?:set\s+(?:screen\s+)?brightness\s+(?:to\s+)?|brightness\s+(?:to\s+)?|change\s+brightness\s+to\s+)(\d{1,3})(?:\s*%|\s*percent)?/i);
  if (brightMatch && brightMatch[1]) {
    const level = Math.max(0, Math.min(100, parseInt(brightMatch[1], 10)));
    await window.ultronAPI.windowsSetBrightness(level);
    return {
      success: true,
      message: `☀️ **Screen Brightness Set**: Adjusted display brightness to **${level}%**.`
    };
  }

  // Lock workstation
  if (/\b(lock\s+(?:my\s+)?(?:pc|computer|workstation|screen))\b/i.test(p)) {
    await window.ultronAPI.windowsLock();
    return { success: true, message: `🔒 **Workstation Locked**: Windows session locked.` };
  }

  // Sleep
  if (/\b(sleep\s+(?:pc|computer)|put\s+(?:pc|computer)\s+to\s+sleep)\b/i.test(p)) {
    await window.ultronAPI.windowsSleep();
    return { success: true, message: `💤 **System Sleep**: Windows entering sleep mode.` };
  }

  return { success: false, message: 'System action completed.' };
}

/** Detects questions explicitly asking for external download/install instructions. */
function isInformationalOrHowToQuery(prompt) {
  const p = String(prompt || '').toLowerCase().trim();
  if (!p) return false;
  if (isMathOrCalculationQuery(p) || isSystemControlQuery(p)) return false;
  if (/\b(how\s+to\s+(download|install|setup|configure|deploy))\b/i.test(p)) {
    return true;
  }
  return false;
}

/** Desktop/file/UI cues that mean the user wants tools, not a chat answer. */
function hasDesktopActionCues(prompt) {
  const p = String(prompt || '');
  // Strip out attached document blocks so document contents/names don't falsely trigger desktop automation
  const cleanPrompt = p.replace(/📄\s*\*\*Attached Document\s*\[[^\]]+\]\*\*:\s*```[\s\S]*?```/gi, '').trim();

  // If it's a math or informational question with no explicit command to launch/modify local desktop, do not treat as a desktop action
  if (isMathOrCalculationQuery(cleanPrompt)) return false;
  if (isInformationalOrHowToQuery(cleanPrompt) && !/\b(open\s+notepad|open\s+chrome|open\s+edge|open\s+folder|create\s+(a\s+)?(file|folder)|write\s+into\s+notepad|type\s+into\s+notepad|save\s+as\s+[a-z0-9_.-]+\.[a-z]{2,4})\b/i.test(cleanPrompt)) {
    return false;
  }

  return /\b(open|opening|launch|launching|start|starting|focus|switch\s+to|go to|navigate|head to|take me to|browse to|visit|play|song|video|music|track|youtube|spotify|claude|chatgpt|openai|gemini|github|reddit|twitter|notepad|chrome|edge|browser|save\s+(to|as|it|the)|write\s+(to|into|in)\s+(a\s+)?(file|folder|notepad)|type\s+(into|in|hello|text)|click|double\s*click|right\s*click|scroll|screenshot|screen\s*capture|capture\s*(the\s*)?screen|createa?\s+(a\s+)?file|creat\s+(a\s+)?file|create\s+(a\s+)?(file|folder)|new\s+file|simulate\s+(the\s+)?(action\s+of\s+)?(open|launch|type|click))\b/i.test(cleanPrompt)
    || /\.(txt|docx?|pdf|md|js|py|ts|html)\b/i.test(cleanPrompt)
    || /[A-Za-z]:\\/.test(cleanPrompt)
    || hasLocalFilesystemCues(cleanPrompt);
}

/** Only UI/desktop tasks benefit from automatic screen capture. */
function needsScreenCaptureForTask(prompt) {
  const p = String(prompt || '').toLowerCase().trim();

  // Direct file/folder operations — use filesystem APIs, not screenshots
  if (/\b(read|list|show|parse|open|view|display)\s+(my\s+)?(file|files|folder|directory|document|documents|settings|config)\b/i.test(p)) {
    return false;
  }
  if (/[a-z]:\\[^\s]+/i.test(p) && !/\b(click|type|scroll|button|menu|dialog|save as)\b/i.test(p)) {
    return false;
  }

  // Simple app launch — no screen analysis needed (avoids vision OOM)
  if (/^(open|launch|start|focus|switch to)\s+[a-z0-9 .+\-_]+$/i.test(p) && !/\b(and|then|type|click|scroll|save|write|read)\b/i.test(p)) {
    return false;
  }

  return /\b(click|double[\s-]?click|type|scroll|hotkey|press|navigate|fill|screenshot|screen|window|ui|button|menu|save|dialog|file explorer)\b/i.test(p);
}

function isWebSearchEnabled() {
  return window.localStorage.getItem('ultron-web-search-enabled') !== 'false';
}

function isFactualOrCurrentEventsQuery(prompt) {
  const p = String(prompt || '').toLowerCase().replace(/\s+/g, ' ');
  if (isMathOrCalculationQuery(p) || isSystemControlQuery(p)) return false;
  if (hasExplicitSearchIntent(p)) return true;
  if (isInformationalOrHowToQuery(p)) return true;
  if (/\b(right now|currently|at present|as of now|today|this week|this month|in 2026|live update|happening now|breaking news)\b/i.test(p)) return true;
  if (/\b(live\s+score|match\s+score|winner\s+of|weather\s+in|stock\s+price|crypto\s+price|current\s+price|download\s+link|official\s+download|how\s+to\s+download|how\s+to\s+install)\b/i.test(p)) return true;
  if (/\b(cursor(\s+ai)?|midjourney|sora|v0\.dev|bolt\.new)\b/i.test(p) && /\b(how to download|how to install|download link|pricing)\b/i.test(p)) return true;
  return false;
}

function isStaleOrUncertainResponse(text) {
  const lower = String(text || '').toLowerCase().trim();
  if (!lower) return false;
  return /\b(as of my last update|knowledge cutoff|don't have access to real.?time|do not have access to real.?time|may not be up to date|my training data|cannot provide real.?time|as of \d{4}|i'm not able to browse|don't have live|do not have live|information may be outdated|i don't have up-to-date|without access to the internet|i don't know|i do not know|i'm not sure|i am not sure|i don't have information|i do not have information|i am not familiar with|i cannot find information|i don't have details|as an ai language model|as an ai assistant|i don't possess information|i'm unable to provide details|i don't have access to the internet|i am unable to browse|i cannot browse the web)\b/i.test(lower);
}

function shouldFallbackToWebSearch(prompt, response) {
  if (!isWebSearchEnabled()) return false;
  if (isMathOrCalculationQuery(prompt)) return false;
  // Never hijack an attached-document analysis (resume/PDF review) into a web search.
  if (/attached document \[/i.test(String(prompt || ''))) return false;
  return isFactualOrCurrentEventsQuery(prompt) || isInformationalOrHowToQuery(prompt) || isStaleOrUncertainResponse(response);
}

/** Split "who is PM … open notepad" into a web search part + desktop action tail. */
function splitSearchAndActionPrompt(prompt) {
  const p = String(prompt || '').trim();
  if (!p || !hasDesktopActionCues(p)) return null;

  const actionRe = /\b((?:open|launch|start|focus)\s+(?:notepad(?:\+\+)?|chrome|google chrome|edge|microsoft edge|file explorer|vscode|vs code|visual studio code|powershell|command prompt|cmd|word|calculator|paint)|write\s+.+\s+in\s+notepad(?:\+\+)?)\s*$/i;
  const match = p.match(actionRe);
  if (!match) return null;

  const actionPart = match[1].trim();
  let searchPart = p.slice(0, match.index).replace(/^(?:hello|hi|hey)[,!\s]+/i, '').trim();
  if (!searchPart || searchPart.length < 8) return null;
  if (!isFactualOrCurrentEventsQuery(searchPart) && !hasExplicitSearchIntent(searchPart) && !/^who\s+(is|are|was)/i.test(searchPart)) {
    return null;
  }

  return { searchPart, actionPart };
}

/**
 * Intent Classifier — determines what the user actually wants.
 * Returns: 'math' | 'conversation' | 'action' | 'search' | 'time' | 'system_info' | 'user_identity'
 */
function classifyIntent(prompt) {
  const p = prompt.toLowerCase().trim();

  // -2. Direct Native System Controls (Volume, Mute, Media, Brightness, Lock)
  if (isSystemControlQuery(prompt)) {
    return 'system_control';
  }

  // -1. Exact Mathematical & Arithmetic Calculations (Instant Math Skill)
  if (isMathOrCalculationQuery(prompt)) {
    return 'math';
  }

  // -1b. Direct Visual / Diagram / Flowchart / Mindmap Generation (Instant Chat In-App Visual)
  if (/\b(diagram|flowchart|flow\s*chart|architecture|mindmap|mind\s*map|sequence\s*diagram|er\s*diagram|state\s*diagram|chart|graph|visualize|draw|plot)\b/i.test(p) && !hasDesktopActionCues(prompt)) {
    return 'conversation';
  }

  // 0. User identity queries ("who am i", "my name", "correct my name", "do you know me")
  if (/\b(who am i|my name|what('s|\s+is)\s+my\s+name|do you know me|who i am|correct my name)\b/i.test(p)) {
    return 'user_identity';
  }

  // 0b. Follow-ups about the previous turn — stay in conversation with chat history
  if (isFollowUpAboutPriorTurn(prompt)) {
    return 'conversation';
  }

  // 0c. Local filesystem CRUD/exploration (find the largest file, list a drive,
  // read a local file) — execute with tools, never answer with manual steps.
  if (hasLocalFilesystemCues(prompt)) {
    return 'action';
  }

  // 0d. Explicit web media/site navigation actions (e.g. "play a song on youtube", "go to claude's website")
  if (/\b(play\s+.+?\s+on\s+(youtube|spotify)|go to\s+.+?(website|site|page|\.com|\.ai|youtube|spotify|claude|chatgpt)|open\s+(youtube|spotify|claude|chatgpt)|search\s+.+?\s+on\s+(youtube|spotify|google|bing|github))\b/i.test(p)) {
    return 'action';
  }

  // 1. Explicit Web Search Intent — require clear search signals (not bare nouns like "watch" or "movie")
  if (hasExplicitSearchIntent(prompt)) {
    return 'search';
  }

  // 1b. Legacy keyword search only when paired with search verbs
  if (/\b(search|google|look up|find out)\b/i.test(p) && /\b(iphone|offers|movies|movie|film|trailer|latest|news|weather|trending|price|deals|ramayana)\b/i.test(p)) {
    return 'search';
  }

  // 1c. Resume/CV analysis requests stay conversational even when typed with typos
  if (/\b(resume|cv|cover letter)\b/i.test(p) && p.length < 80) {
    return 'conversation';
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

  // 4. Greeting / casual conversational — only when the whole message is a short greeting
  const isPureGreeting = /^(hi|hello|hey|good\s*(morning|evening|afternoon|night)|thanks|thank you|how are you|what'?s up|who are you|what can you do|your name)[\s!.?,]*$/i.test(p);
  if (isPureGreeting) {
    return 'conversation';
  }

  // 5. Pure content generation (essays, poems, websites, landing pages, code, explanations) → chat, not tools
  if (isContentGenerationRequest(prompt) && !hasDesktopActionCues(prompt)) {
    return 'conversation';
  }

  // 5b. Document analysis requests (attached files or document QA queries) → conversation/chat
  if ((p.includes('attached document') || /\b(analyze|analyse|summarize|summary of|review|explain|read|extract|what is in|tell me about)\b/i.test(p)) && /\b(resume|cv|pdf|document|paper|file|report|attachment)\b/i.test(p) && !hasDesktopActionCues(prompt)) {
    return 'conversation';
  }

  // 6. Web Search for How-To, Factual Knowledge, Product Info, or Current Events
  if (isWebSearchEnabled()) {
    if (isFactualOrCurrentEventsQuery(prompt) || isInformationalOrHowToQuery(prompt) || hasExplicitSearchIntent(prompt) || /\b(latest|today|current|recent|2024|2025|2026|news|price|stock|weather|download|install|guide|tutorial|specs|release)\b/i.test(p)) {
      if (!isContentGenerationRequest(prompt) && !hasLocalFilesystemCues(prompt)) {
        return 'search';
      }
    }
  }

  // 6b. General knowledge fallback if web search is off
  if (/^(what is|what are|who is|who are|why is|why do|how does|how do|explain|tell me about|define|describe|meaning of|difference between)\b/i.test(p) && !/\b(file|folder|directory|create|make|write|delete|run|execute|install|open|list|show|read)\b/i.test(p)) {
    return 'conversation';
  }

  // 6c. Saved workflow / routine triggers → desktop automation
  if (/\b(run|start|execute|trigger)\s+(workflow|routine)\b/i.test(p)) {
    return 'action';
  }
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.findWorkflowByPrompt === 'function') {
    const wf = window.UltronAgentMemory.findWorkflowByPrompt(prompt);
    if (wf && wf.steps && wf.steps.length) {
      return 'action';
    }
  }

  // 7. Computer action (file/folder/command/code) — desktop cues or explicit OS operations
  if (/\b(go to|navigate to|head to|take me to|browse to|open folder)\b/i.test(p) && /\b(download|document|desktop|folder|explorer|files)\b/i.test(p)) {
    return 'action';
  }

  if (hasDesktopActionCues(prompt) || /\b(simulate|perform|execute|do)\s+(the\s+)?(action\s+of\s+)?(open|launch|type|click|write)\b/i.test(p)) {
    if (isContentGenerationRequest(prompt) && !hasDesktopActionCues(prompt)) {
      return 'conversation';
    }
    return 'action';
  }

  if (/\b(delete|remove|rm|mkdir|folder|directory|install|uninstall|open\s+[a-z0-9]|launch|focus|switch\s+to|run\s+[a-z0-9_.-]+\.(?:exe|bat|ps1|py|sh)|read\s+file|show\s+files|list\s+(?:files|dir|directory|folders))\b/i.test(p)) {
    if (isContentGenerationRequest(prompt) && !hasDesktopActionCues(prompt)) {
      return 'conversation';
    }
    return 'action';
  }

  // Default: conversational
  return 'conversation';
}

// Google Gemini API Online Model Provider
async function queryGeminiAPI(prompt, systemPrompt, modelName, apiKey, extraMessages = [], imagePayloads = []) {
  let officialModel = modelName;
  if (!officialModel || !officialModel.startsWith('gemini') || !isGeminiChatModel(officialModel)) {
    officialModel = pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0]?.name;
  }
  if (!officialModel) {
    const connection = await connectGemini(apiKey);
    if (!connection.success) throw new Error(connection.error);
    officialModel = pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0]?.name;
  }

  const makeCall = async (targetModel) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${apiKey.trim()}`;

    const contents = [];
    if (extraMessages && Array.isArray(extraMessages) && extraMessages.length > 0) {
      extraMessages.forEach(m => {
        if (m.text && !isThinkingMarkup(m.text)) {
          contents.push({
            role: m.isAi ? 'model' : 'user',
            parts: [{ text: extractPlainTextFromMessage(m.text) }]
          });
        }
      });
    }

    contents.push({
      role: 'user',
      parts: [
        { text: prompt },
        ...(Array.isArray(imagePayloads) ? imagePayloads : []).filter(p => p && p.data).map(p => ({
          inline_data: {
            mime_type: p.mimeType || 'image/png',
            data: p.data
          }
        }))
      ]
    });

    const payload = {
      contents,
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 8192
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: _activeAbortController ? _activeAbortController.signal : undefined
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = (errorData.error && errorData.error.message) ? errorData.error.message : `HTTP ${response.status}`;
      throw new Error(msg);
    }

    const data = await response.json();
    const candidate = data.candidates && data.candidates[0];
    const output = candidate?.content?.parts
      ?.map(part => part.text || '')
      .filter(Boolean)
      .join('\n')
      .trim();
    if (!output) {
      const blockReason = data.promptFeedback?.blockReason || candidate?.finishReason;
      throw new Error(blockReason
        ? `Gemini returned no text (${blockReason}).`
        : 'Gemini API returned an empty response.');
    }
    return output;
  };

  try {
    return await makeCall(officialModel);
  } catch (err) {
    const msg = err.message || '';
    const shouldRetry = /no longer available|404|not found|not supported|deprecated|retired|quota|rate.limit|429|resource_exhausted|limit:\s*0/i.test(msg);
    if (shouldRetry) {
      // The API error often names a replacement model (e.g. "use models/gemini-3.6-flash") — try it first.
      const suggested = (msg.match(/use\s+(?:models\/)?(gemini-[a-z0-9.\-]+)/i) || [])[1];
      const fallbackNames = [];
      if (suggested && suggested !== officialModel) fallbackNames.push(suggested);
      sortGeminiModels(ONLINE_GEMINI_MODELS.filter(m => isGeminiChatModel(m.name))).forEach(m => {
        if (!fallbackNames.includes(m.name)) fallbackNames.push(m.name);
      });
      GEMINI_FALLBACK_MODELS.forEach(m => {
        if (!fallbackNames.includes(m.name)) fallbackNames.push(m.name);
      });
      for (const fallbackName of fallbackNames) {
        if (fallbackName === officialModel) continue;
        try {
          logTrace(`Gemini model "${officialModel}" failed (${msg.slice(0, 80)}…). Retrying with ${fallbackName}…`, 'system');
          activeModel = fallbackName;
          updateModelSelectorLabel();
          syncModelAttachmentCapabilities();
          return await makeCall(fallbackName);
        } catch (retryErr) {
          if (!/quota|rate.limit|429|resource_exhausted|limit:\s*0|no longer available|404|not found|deprecated|retired/i.test(retryErr.message || '')) {
            throw retryErr;
          }
        }
      }
    }
    if (/quota|rate.limit|429|resource_exhausted|limit:\s*0/i.test(msg)) {
      throw new Error(`Google Gemini API (${officialModel}): Free-tier quota exceeded for this model. Switch to a newer flash model (e.g. gemini-3.6-flash) in the model dropdown — image/preview models often have zero free quota on new keys.`);
    }
    throw new Error(`Google Gemini API (${officialModel}): ${msg}`);
  }
}

let isOllamaCloudConnectedState = false;

function isOllamaCloudPulledModel(modelName) {
  return String(modelName || '').toLowerCase().endsWith('-cloud');
}

function getInstalledCloudModels() {
  const map = new Map();
  // 1. Any pulled cloud models from local Ollama
  (installedModelsList || []).forEach((model) => {
    const name = typeof model === 'string' ? model : model.name;
    if (name && isOllamaCloudPulledModel(name)) {
      map.set(name.toLowerCase(), typeof model === 'string' ? { name, size: 0 } : model);
    }
  });

  // 2. If user is connected to Ollama Cloud, make all cloud models available
  if (isOllamaCloudConnectedState) {
    (OLLAMA_CLOUD_PULL_MODELS || []).forEach((model) => {
      if (!map.has(model.name.toLowerCase())) {
        map.set(model.name.toLowerCase(), { name: model.name, size: model.size || 'Cloud', desc: model.desc });
      }
    });
  }

  return Array.from(map.values());
}

function getInstalledOfflineModels() {
  const map = new Map();
  (installedModelsList || []).forEach((model) => {
    const name = typeof model === 'string' ? model : model.name;
    if (name && !isOllamaCloudPulledModel(name)) map.set(name, typeof model === 'string' ? { name, size: 0 } : model);
  });
  return Array.from(map.values());
}

// Offline inference helper querying local servers or Online Cloud APIs
async function queryOfflineLLM(prompt, extraMessages = [], intentOverride = null, customSystemPromptOverride = null, imagePayloads = [], streamCallbacks = null) {
  // Direct Ollama / Gemini API generate/chat loop.
  let restoredActiveModel = null;
  try {
    const memoryEnabled = window.localStorage.getItem('ultron-memory-enabled') !== 'false';
    const userNameEl = document.querySelector('.profile-detail-name');
    // Auto-detect and remember user location mentioned in prompt
    const locMatch = prompt.match(/\b(?:i am in|i live in|my location is|my address is|my city is)\s+([a-zA-Z0-9\s,]+)/i);
    if (locMatch && locMatch[1]) {
      const userCity = locMatch[1].trim().replace(/[.!?]+$/, '');
      if (userCity && userCity.length < 50 && !/\b(a|the|some|any)\b/i.test(userCity)) {
        localStorage.setItem('ultron-user-location', userCity);
        logTrace(`User location remembered: "${userCity}"`, 'system');
      }
    }

    const userName = getUserFullName();
    const sysEnv = await getSystemContext();
    const realtime = buildRealtimeContext(sysEnv);
    const intent = intentOverride || classifyIntent(prompt);
    const localModelResolve = resolveModelForLocalAi(intent);
    if (localModelResolve.blocked) {
      return `⚠️ **Local-only mode**\n\nCloud models are disabled and no Ollama model is available.\n\n**To fix:**\n1. Start Ollama (\`ollama serve\`).\n2. Pull a model (\`ollama pull phi3\`).\n3. Or change **Settings → Desktop Automation → Local AI routing**.`;
    }
    if (localModelResolve.switched) {
      restoredActiveModel = activeModel;
      activeModel = localModelResolve.model;
      logTrace(`Local-first routing: using ${activeModel} for ${intent}.`, 'system');
    }
    const isShortQuery = prompt.length < 60 && !/\b(explain|detail|step by step|comprehensive|essay|code|script|list all)\b/i.test(prompt);

    // Build drives description
    const drivesDesc = (sysEnv.drives || []).map(d => `${d.letter} (${d.description || 'Disk'}, ${d.totalGB || '?'}GB total, ${d.freeGB || '?'}GB free)`).join(', ') || 'C:';

    const memorySnippet = getLearnedMemorySnippet() + (await getRagKnowledgeSnippet(prompt));

    const agentPromptContext = buildAgentPromptContext(sysEnv, realtime, userName, memorySnippet, Array.isArray(imagePayloads) && imagePayloads.length > 0);
    const agentSystemPrompt = intent === 'action' ? resolveAgentSystemPrompt(agentPromptContext) : null;
    const visionImages = Array.isArray(imagePayloads) ? imagePayloads.filter(p => p && p.data) : [];
    const canUseVision = visionImages.length > 0 && modelSupportsVision(activeModel);

    const isCodeRequest = intent === 'conversation' && isCodeOnlyGenerationRequest(prompt);
    const isContentRequest = intent === 'conversation' && isContentGenerationRequest(prompt);
    const skipConversationHistory = intent === 'conversation' && shouldSkipConversationHistory(prompt);
    // Temperature for local Ollama (was referenced as undeclared activeTemp — broke all local chats)
    const activeTemp = isCodeRequest ? 0.15 : (isContentRequest ? 0.75 : (intent === 'conversation' ? 0.7 : 0.2));

    const systemPrompt = customSystemPromptOverride || window.localStorage.getItem('ultron-custom-system-prompt') || agentSystemPrompt || (intent === 'conversation'
      ? (isCodeRequest
        ? buildCodeGenerationSystemPrompt(prompt)
        : (isContentRequest ? buildContentGenerationSystemPrompt(prompt) : buildConversationSystemPrompt()))
      : `You are Brown, a warm, highly intelligent, articulate, and engaging AI assistant in a direct 1-on-1 personal conversation with ${userName}.

CONVERSATIONAL PERSONA & DIRECT VOICE RULES:
1. ALWAYS speak directly to ${userName} in the first person ("I", "me", "my") addressing ${userName} as "you".
2. STRICTLY FORBIDDEN:
   - NEVER speak in the third person.
   - NEVER refer to yourself as "the AI", "the AI agent", "the assistant", or "this AI".
   - NEVER refer to ${userName} as "the user" or "the user's prompt".

REAL-TIME CONTEXT:
- Local Date & Time: ${realtime.dateLabel}, ${realtime.timeLabel} (${realtime.timeZone})
- Location Context: ${realtime.locationLabel}${realtime.countryCode ? ` (${realtime.countryCode})` : ''}

${intent === 'action' || intent === 'search' ? `HOST SYSTEM ENVIRONMENT & TOOLS:
- Operating System: Windows ${sysEnv.osVersion || '10/11'} (${sysEnv.arch || 'x64'})
- Home Directory: ${sysEnv.homeDir || 'C:\\Users\\vedan'}
- Available Drives: ${drivesDesc}` : ''}${memorySnippet}`);

    let finalUserPrompt = prompt;
    if (isVoiceChatModeEnabled()) {
      finalUserPrompt = `${prompt}\n\n[Voice Mode Active: Be concise, natural, and direct (1–3 spoken sentences). Do NOT output markdown headers, tables, code blocks, or URLs.]`;
    }
    if (visionImages.length > 0 && !canUseVision && !activeModel.startsWith('gemini')) {
      finalUserPrompt = `${prompt}\n\n[Note: Desktop screenshot(s) were captured for this step, but the active model "${activeModel}" does not support vision. Switch to a vision model (e.g. llava, gemini) to analyze screen content.]`;
    }
    // Keep user prompt clean — instructions are cleanly delivered via systemPrompt

    // Cloud APIs only — HF GGUF + Ollama Cloud stay on the local Ollama path below.
    const provider = window.UltronMultiProviderHub ? window.UltronMultiProviderHub.detectProviderForModel(activeModel) : 'ollama';
    if (provider !== 'ollama' && getLocalAiMode() !== 'local-only') {
      try {
        const output = await window.UltronMultiProviderHub.queryProvider({
          provider,
          model: activeModel,
          prompt: finalUserPrompt,
          systemPrompt,
          messages: extraMessages,
          temperature: activeTemp,
          visionImages,
          signal: _activeAbortController ? _activeAbortController.signal : undefined
        });
        return output;
      } catch (err) {
        logTrace(`${provider} API execution error: ${err.message}`, 'system');
        const classified = classifyModelFailure(err, activeModel);
        notifyModelIssue(classified);
        return `⚠️ **${provider.toUpperCase()} Provider Error**\n\n${classified.message}\n\nPlease check your configuration in **Settings > Models** or select another model from the dropdown.`;
      }
    }

    _lastOllamaModel = activeModel;
    
    let bodyData;
    let endpoint = '/api/generate';
    const isHeavyTask = isCodeRequest || isContentRequest || canUseVision || intent === 'action' || intent === 'search';
    const gpuOptions = getOllamaGpuOptions(sysEnv, activeModel, intent, isHeavyTask);
    const ollamaOptions = buildOllamaRequestOptions({
      gpuOptions,
      intent,
      canUseVision,
      temperature: activeTemp,
      contentGeneration: isContentRequest || isCodeRequest
    });
    if (typeof gpuOptions.num_gpu === 'number') {
      const gpuName = sysEnv.dedicatedGpu?.model || sysEnv.hardware?.dedicatedGpu?.model || 'GPU';
      logTrace(`Using capped GPU offload (${gpuOptions.num_gpu} layers) for vision model ${activeModel} on ${gpuName}.`, 'system');
    }
    
    const isGemma = activeModel && activeModel.toLowerCase().includes('gemma');
    const useGenerateForConversation = shouldUseOllamaGenerateForConversation(
      intent,
      customSystemPromptOverride,
      canUseVision,
      extraMessages
    );

    if (memoryEnabled && currentSessionId && conversationsStore[currentSessionId] && !useGenerateForConversation && !skipConversationHistory) {
      // Sliding window memory — shorter window for follow-ups
      const historyLimit = (customSystemPromptOverride && /follow-up/i.test(customSystemPromptOverride)) ? 4 : 10;
      const recentMsgs = conversationsStore[currentSessionId].messages
        .filter(m => !isUnusableChatHistoryMessage(m.text))
        .slice(-historyLimit);
      
      // Gemma 2 models in Ollama do not support 'system' role in chat messages array
      const chatMessages = isGemma ? [] : [{ role: 'system', content: systemPrompt }];
      
      // For general conversational intents, include recent history. For action execution loops,
      // prevent past conversational hallucinations from poisoning the current task's tool calls.
      if (intent !== 'action') {
        recentMsgs.forEach(m => {
          const textContent = extractPlainTextFromMessage(m.text);
          if (textContent) {
            chatMessages.push({
              role: m.isAi ? 'assistant' : 'user',
              content: textContent
            });
          }
        });
      }
      
      // Append extra observation messages from agent loop
      if (Array.isArray(extraMessages) && extraMessages.length > 0) {
        extraMessages.forEach(msg => chatMessages.push(msg));
      }
      
      const userMessageContent = isGemma
        ? `${systemPrompt}\n\nUser Message:\n${finalUserPrompt}`
        : finalUserPrompt;
      
      // Add current user prompt if not already in history
      if (chatMessages.length === 0 || chatMessages[chatMessages.length - 1].content !== userMessageContent) {
        chatMessages.push({ role: 'user', content: userMessageContent });
      }

      if (canUseVision) {
        const lastIdx = chatMessages.length - 1;
        chatMessages[lastIdx] = attachImagesToChatUserMessage(chatMessages[lastIdx], visionImages);
      }
      
      logTrace(`Sending chat payload to local LLM (${activeModel}) with ${chatMessages.length} messages...`, 'system');

      bodyData = {
        model: activeModel,
        messages: chatMessages,
        stream: false,
        keep_alive: '5m',
        options: ollamaOptions
      };
      endpoint = '/api/chat';
    } else if (useGenerateForConversation && memoryEnabled && currentSessionId && conversationsStore[currentSessionId] && !skipConversationHistory) {
      // Conversation mode: /api/generate avoids small models meta-commenting on chat system roles
      const recentMsgs = conversationsStore[currentSessionId].messages
        .filter(m => !isUnusableChatHistoryMessage(m.text))
        .slice(-8);
      const convPrompt = buildConversationPromptFromHistory(recentMsgs, finalUserPrompt);
      const convSystem = isCodeRequest
        ? buildCodeGenerationSystemPrompt(prompt)
        : (isContentRequest ? buildContentGenerationSystemPrompt(prompt) : buildConversationSystemPrompt());

      bodyData = {
        model: activeModel,
        prompt: isGemma ? `${convSystem}\n\n${convPrompt}` : convPrompt,
        system: isGemma ? undefined : convSystem,
        stream: false,
        keep_alive: '5m',
        options: ollamaOptions
      };
      endpoint = '/api/generate';
      logTrace(`Sending generate payload for conversation (${activeModel})...`, 'system');
    } else {
      // Memory disabled or single-shot: single prompt mode
      bodyData = {
        model: activeModel,
        prompt: isGemma ? `${systemPrompt}\n\n${finalUserPrompt}` : finalUserPrompt,
        system: isGemma ? undefined : systemPrompt,
        stream: false,
        keep_alive: '5m',
        ...(canUseVision ? { images: visionImages.map(p => p.data) } : {}),
        options: ollamaOptions
      };
    }

    // Real token streaming when the caller wants progressive output (chat responses)
    const wantsStream = Boolean(streamCallbacks && typeof streamCallbacks.onToken === 'function');
    if (wantsStream) bodyData.stream = true;

    const response = await fetch(`http://127.0.0.1:11434${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyData),
      signal: _activeAbortController ? _activeAbortController.signal : undefined
    });
    if (response.ok) {
      let text = '';
      if (wantsStream && response.body && typeof response.body.getReader === 'function') {
        // Ollama streams NDJSON: one JSON object per line with incremental tokens
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffered = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffered += decoder.decode(value, { stream: true });
          const lines = buffered.split('\n');
          buffered = lines.pop() || '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const chunk = JSON.parse(line);
              const token = endpoint === '/api/chat'
                ? (chunk.message ? chunk.message.content : '')
                : (chunk.response || '');
              if (token) {
                text += token;
                streamCallbacks.onToken(text);
              }
              if (chunk.done) break;
            } catch (parseErr) { /* skip malformed stream line */ }
          }
        }
      } else {
        const data = await response.json();
        text = endpoint === '/api/chat' ? (data.message ? data.message.content : '') : data.response;
      }
      
      // Filter out model disclaimer responses that deny computer access capabilities during tool action execution ONLY
      if (intent !== 'conversation' && text && (text.includes("I do not have access") || text.includes("unable to access your operating system") || text.includes("I cannot access"))) {
        logTrace("Model output disclaimer detected and suppressed.", "system");
        return ""; // Return empty string so Fallback Intent Steerer takes over
      }

      // Small models sometimes paraphrase system prompts or ignore the user — retry with a clean fresh prompt
      if (intent === 'conversation' && text && (isMetaInstructionLeak(text) || isIrrelevantModelResponse(text, prompt))) {
        logTrace('Low-quality or irrelevant conversation output detected; retrying with fresh generate prompt.', 'system');
        const freshSystem = isCodeRequest
          ? buildCodeGenerationSystemPrompt(prompt)
          : (isContentRequest
            ? buildContentGenerationSystemPrompt(prompt)
            : buildConversationSystemPrompt());
        const retryModel = isTinyLocalModel(activeModel)
          ? (selectBestInstalledLocalModel([activeModel]) || activeModel)
          : activeModel;
        const retryBody = {
          model: retryModel,
          prompt: isGemma ? `${freshSystem}\n\nUser: ${finalUserPrompt}\nAssistant:` : finalUserPrompt,
          system: isGemma ? undefined : freshSystem,
          stream: false,
          keep_alive: '5m',
          options: {
            ...ollamaOptions,
            temperature: isContentRequest ? 0.75 : 0.7,
            num_predict: isContentRequest ? 2048 : 512
          }
        };
        try {
          const retryResp = await fetch('http://127.0.0.1:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(retryBody),
            signal: _activeAbortController ? _activeAbortController.signal : undefined
          });
          if (retryResp.ok) {
            const retryData = await retryResp.json();
            const retryText = retryData.response || '';
            if (retryText && !isIrrelevantModelResponse(retryText, prompt)) {
              text = retryText;
              if (retryModel !== activeModel) {
                activeModel = retryModel;
                updateModelSelectorLabel();
                syncModelAttachmentCapabilities();
              }
            }
          }
        } catch (retryErr) {
          logTrace(`Conversation quality retry failed: ${retryErr.message}`, 'system');
        }
      }

      const sanitized = isCodeRequest
        ? sanitizeCodeGenerationResponse(text, prompt)
        : sanitizeResponseText(text, prompt);
      if (intent === 'conversation' && !isCodeRequest && isIrrelevantModelResponse(sanitized, prompt)) {
        if (/^(hi|hello|hey|good\s*(morning|evening|afternoon|night))[\s!.?]*(\w+)?[\s!.?]*$/i.test(String(prompt || '').trim())) {
          const firstName = getUserFirstName();
          return `Hey ${firstName !== 'User' ? firstName : 'there'}! I'm Ultron — how can I help you today?`;
        }
        if (isContentGenerationRequest(prompt) || isCodeOnlyGenerationRequest(prompt)) {
          return `I'm having trouble generating that with the current local model (**${activeModel}**). Try switching to **phi3:latest** or **gemma2:2b** in the model dropdown, or start a **New Chat** to clear bad history.`;
        }
      }
      if (intent === 'conversation' && !sanitized && /^(hi|hello|hey|good\s*(morning|evening|afternoon|night))[\s!.?]*$/i.test(String(prompt || '').trim())) {
        const firstName = getUserFirstName();
        return `Hey ${firstName !== 'User' ? firstName : 'there'}! I'm Ultron — how can I help you today?`;
      }
      return sanitized;
    } else {
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = errJson.error || JSON.stringify(errJson);
      } catch (e) {
        errDetail = await response.text();
      }

      let recoveryResult = null;

      // GPU/CUDA crash: retry same model on CPU first, then full recovery across installed models.
      if (isOllamaRecoverableError(errDetail)) {
        try {
          const cpuRetry = await trySameModelCpuFallback({
            endpoint,
            bodyData,
            modelName: activeModel,
            prompt,
          });
          if (cpuRetry) {
            logTrace(`Recovered ${activeModel} on CPU after GPU/CUDA error.`, 'system');
            return cpuRetry;
          }
        } catch (cpuErr) {
          logTrace(`Same-model CPU retry failed: ${cpuErr.message}`, 'system');
        }

        logTrace(`Ollama model allocation failed for ${activeModel}. Running full memory recovery across installed models...`, 'system');
        recoveryResult = await tryOllamaMemoryRecovery({
          endpoint,
          bodyData,
          prompt,
          systemPrompt,
          intent,
          failedModel: activeModel
        });

        if (typeof recoveryResult === 'string') {
          return recoveryResult;
        }

        const apiKey = (localStorage.getItem('ultron-gemini-api-key') || '').trim();
        if (apiKey && ONLINE_GEMINI_MODELS.length) {
          const geminiModel = pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0].name;
          logTrace(`All local models failed memory recovery. Falling back to ${geminiModel}...`, 'system');
          try {
            const geminiOutput = await queryGeminiAPI(
              finalUserPrompt,
              systemPrompt,
              geminiModel,
              apiKey,
              extraMessages,
              canUseVision ? visionImages : []
            );
            activeModel = geminiModel;
            updateModelSelectorLabel();
            syncModelAttachmentCapabilities();
            logTrace(`Gemini fallback used after local memory recovery: ${geminiModel}`, 'system');
            return geminiOutput;
          } catch (geminiErr) {
            logTrace(`Gemini memory fallback failed: ${geminiErr.message}`, 'error');
          }
        }
      }

      logTrace(`Local LLM response HTTP error (${response.status}): ${errDetail}`, 'error');
      
      // Auto-recover if model is not found in Ollama by switching to an actually available model
      if (errDetail && errDetail.toLowerCase().includes('not found')) {
        const fallbackCandidates = [
          ...getInstalledCloudModels().map(m => m.name),
          ...getInstalledOfflineModels().map(m => m.name),
          ...(window.UltronMultiProviderHub?.getAvailableModels?.(true) || []).map(m => m.name)
        ].filter(name => name && name.toLowerCase() !== activeModel.toLowerCase());

        if (fallbackCandidates.length > 0) {
          const alternateModel = fallbackCandidates[0];
          logTrace(`Model "${activeModel}" was not found on Ollama. Automatically switching to available model: "${alternateModel}"`, 'system');
          activeModel = alternateModel;
          updateModelSelectorLabel();
          renderModelDropdownList();
          // Retry with the available model
          return queryOfflineLLM(prompt, extraMessages, intentOverride, customSystemPromptOverride, imagePayloads, streamCallbacks);
        }
      }

      // Handle Unauthorized Ollama Cloud requests
      if (response.status === 401 || (errDetail && errDetail.toLowerCase().includes('unauthorized'))) {
        isOllamaCloudConnectedState = false;
        if (window.ultronAPI?.setOllamaAuthStatus) {
          window.ultronAPI.setOllamaAuthStatus(false).catch(() => {});
        }
        refreshOllamaCloudAuthUI();
        return `⚠️ **Ollama Cloud Authorization Required (${activeModel})**\n\nYour session is not yet authorized on Ollama's official servers to run cloud-streamed models.\n\n**To Fix:**\n1. Open **Settings → Models**.\n2. Click **Connect Ollama Cloud** and approve the authorization in your browser.\n3. Or select an installed offline model or Google Gemini from the model dropdown.`;
      }

      if (!isOllamaRecoverableError(errDetail)) {
        return `Warning: **Ollama Model Error (${activeModel})**\n\nOllama returned an error before generating a response:\n\n` + '`' + `${errDetail || 'Unknown error'}` + '`' + `\n\nTry another model from the dropdown, pull an **Ollama Cloud** model (Settings → Models → Sign in to Ollama Cloud), or restart Ollama.`;
      }
      const triedModels = (recoveryResult && recoveryResult.triedModels && recoveryResult.triedModels.length)
        ? recoveryResult.triedModels.join(', ')
        : 'your installed models';
      return `⚠️ **Ollama Memory Limit Exceeded (${activeModel})**\n\n**${activeModel}** could not load because your PC did not have enough free RAM/VRAM at that moment. Ultron already tried these installed models on CPU with compact settings: ${triedModels}.\n\n**What usually fixes this:**\n1. Close memory-heavy apps (browsers, games) and send again.\n2. Restart Ollama from the system tray.\n3. Pick **tinyllama:latest** or **gemma2:2b** from the model dropdown.\n4. Pull an **Ollama Cloud** model (e.g. \`gpt-oss:20b-cloud\`) — runs on Ollama servers, not your GPU.\n5. Or connect **Google Gemini** in Settings → Models.`;
    }
  } catch (e) {
    if (typeof restoredActiveModel === 'string' && restoredActiveModel) {
      activeModel = restoredActiveModel;
    }
    if (e.name === 'AbortError' || (_activeAbortController && _activeAbortController.signal.aborted)) {
      throw e;
    }
    logTrace(`Local LLM offline loop exception: ${e.message}`, 'error');
    const classified = classifyModelFailure(e, activeModel);
    notifyModelIssue(classified);
    const geminiFallback = await tryGeminiFallbackAfterLocalFailure(prompt, null, extraMessages, imagePayloads || []);
    if (geminiFallback) return geminiFallback;
    return `⚠️ **${classified.title}**\n\n${classified.message}\n\n*Endpoint: ` + '`http://127.0.0.1:11434`' + `*`;
  } finally {
    if (typeof restoredActiveModel === 'string' && restoredActiveModel) {
      activeModel = restoredActiveModel;
    }
  }
}

let ONLINE_GEMINI_MODELS = [];
let geminiConnectionState = 'disconnected';
let geminiConnectionError = '';

function geminiModelTag(name) {
  return String(name || '')
    .replace(/^gemini-/i, '')
    .replace(/-/g, ' ')
    .toUpperCase();
}

/** Models that appear in ListModels but are not usable for free-tier text chat. */
function isGeminiChatModel(name) {
  const n = String(name || '').toLowerCase().replace(/^models\//, '');
  if (!n.startsWith('gemini-')) return false;
  if (/(embedding|aqa|imagen|image-generation|tts|robotics|computer-use|live|native-audio|deep-research)/i.test(n)) {
    return false;
  }
  // Image / preview-image variants — free tier quota is often 0 for these
  if (/-image\b|-image-|-image$/i.test(n)) return false;
  if (/preview-image|flash-image|generate-image/i.test(n)) return false;
  return true;
}

function geminiModelSortScore(name) {
  const n = String(name || '').toLowerCase();
  const ver = n.match(/gemini-(\d+)(?:\.(\d+))?/);
  const major = ver ? parseInt(ver[1], 10) : 0;
  const minor = ver && ver[2] ? parseInt(ver[2], 10) : 0;
  // Newer versions first; within a version prefer flash (free-tier friendly), then pro.
  let score = -(major * 1000 + minor * 100);
  if (n.includes('flash-lite')) score += 20;
  else if (n.includes('flash')) score += 0;
  else if (n.includes('pro')) score += 40;
  else score += 30;
  if (n.includes('preview')) score += 500;
  if (/-image\b|-image-|-image$/.test(n)) score += 900;
  return score;
}

function sortGeminiModels(models) {
  return [...models].sort((a, b) => {
    const scoreDiff = geminiModelSortScore(a.name) - geminiModelSortScore(b.name);
    return scoreDiff !== 0 ? scoreDiff : a.name.localeCompare(b.name);
  });
}

function pickDefaultGeminiModel(models = ONLINE_GEMINI_MODELS) {
  const usable = sortGeminiModels((models || []).filter(m => isGeminiChatModel(m.name)));
  if (!usable.length) return null;
  return usable[0].name;
}

const GEMINI_FALLBACK_MODELS = [
  { name: 'gemini-3.6-flash', tag: '3.6 FLASH', desc: 'Latest fast multimodal model — recommended for new keys' },
  { name: 'gemini-3-pro', tag: '3 PRO', desc: 'Frontier reasoning, coding and vision' },
  { name: 'gemini-2.5-flash', tag: '2.5 FLASH', desc: 'Fast multimodal reasoning' },
  { name: 'gemini-2.5-pro', tag: '2.5 PRO', desc: 'Advanced coding, long-context, and vision' },
  { name: 'gemini-2.0-flash', tag: '2.0 FLASH', desc: 'Low-latency multimodal streaming' }
];

function isGeminiListModelsBlocked(message) {
  return /listmodels|modelservice\.listmodels|method.*blocked|not available in your country|has not been used in project|permission denied/i.test(String(message || ''));
}

async function pingGeminiApiKey(apiKey, modelName = 'gemini-3.6-flash') {
  const key = encodeURIComponent(String(apiKey || '').trim());
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Reply with exactly: ok' }] }],
        generationConfig: { maxOutputTokens: 8, temperature: 0 }
      })
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google API returned HTTP ${response.status}`);
  }
  return modelName;
}

async function discoverGeminiModels(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('API key is empty.');

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const apiMessage = payload.error?.message || `Google API returned HTTP ${response.status}`;
      if (isGeminiListModelsBlocked(apiMessage)) {
        throw new Error('LIST_MODELS_BLOCKED');
      }
      throw new Error(apiMessage);
    }
    const models = sortGeminiModels((payload.models || [])
      .filter(model => {
        const name = String(model.name || '').replace(/^models\//, '');
        const methods = model.supportedGenerationMethods || [];
        return isGeminiChatModel(name)
          && methods.includes('generateContent');
      })
      .map(model => {
        const name = String(model.name || '').replace(/^models\//, '');
        return {
          name,
          tag: geminiModelTag(name),
          desc: model.description || model.displayName || name,
          inputTokenLimit: model.inputTokenLimit || 0,
          outputTokenLimit: model.outputTokenLimit || 0
        };
      }));
    if (models.length) return models;
  } catch (err) {
    if (!isGeminiListModelsBlocked(err.message) && err.message !== 'LIST_MODELS_BLOCKED') {
      if (/invalid|api key|unauthorized|401|403|permission/i.test(err.message) && !isGeminiListModelsBlocked(err.message)) {
        throw err;
      }
    }
  }

  const candidates = [
    'gemini-3.6-flash',
    'gemini-3-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash-latest'
  ];
  let authError = null;
  for (const model of candidates) {
    try {
      await pingGeminiApiKey(key, model);
      logTrace('Gemini key verified (ListModels blocked in your region — using standard model list).', 'system');
      return GEMINI_FALLBACK_MODELS.map(modelDef => ({ ...modelDef }));
    } catch (err) {
      if (/invalid|api key|unauthorized|401|403|permission/i.test(err.message)) {
        authError = err;
        break;
      }
    }
  }

  if (authError) throw authError;
  throw new Error('Could not verify API key. Create a key at aistudio.google.com and ensure Generative Language API is enabled.');
}

function updateGeminiConnectionBadge() {
  const badge = document.getElementById('gemini-status-badge');
  if (!badge) return;
  const connected = geminiConnectionState === 'connected';
  const connecting = geminiConnectionState === 'connecting';
  badge.textContent = connected ? 'Connected' : (connecting ? 'Connecting…' : 'Not connected');
  badge.style.background = connected ? 'rgba(34, 197, 94, 0.14)' : (connecting ? 'rgba(59, 130, 246, 0.14)' : 'rgba(161, 161, 170, 0.12)');
  badge.style.color = connected ? '#4ade80' : (connecting ? '#60a5fa' : '#a1a1aa');
  badge.style.borderColor = connected ? 'rgba(34, 197, 94, 0.35)' : (connecting ? 'rgba(59, 130, 246, 0.3)' : 'rgba(161, 161, 170, 0.25)');
  badge.title = connected
    ? `${ONLINE_GEMINI_MODELS.length} compatible model${ONLINE_GEMINI_MODELS.length === 1 ? '' : 's'} available`
    : geminiConnectionError;
}

/** Voice-engine / TTS labels that must never be used as the text-chat model. */
function isVoiceOnlyModelLabel(name) {
  return /native audio|audio dialog|live translate|flash live|live api|\btts\b|whisper|realtime|speech/i.test(String(name || '').toLowerCase());
}

function ensureValidActiveGeminiModel() {
  if (!activeModel || !String(activeModel).toLowerCase().startsWith('gemini')) return;
  if (isGeminiChatModel(activeModel) && !isVoiceOnlyModelLabel(activeModel)) return;
  const safe = pickDefaultGeminiModel();
  if (safe) {
    activeModel = safe;
    updateModelSelectorLabel();
    syncModelAttachmentCapabilities();
    logTrace(`Switched to ${safe} — voice/audio and image Gemini models are not for text chat.`, 'system');
  }
}

async function connectGemini(apiKey, options = {}) {
  geminiConnectionState = 'connecting';
  geminiConnectionError = '';
  updateGeminiConnectionBadge();
  try {
    ONLINE_GEMINI_MODELS = await discoverGeminiModels(apiKey);
    geminiConnectionState = 'connected';
    updateGeminiConnectionBadge();
    renderModelDropdownList();
    if (options.selectFirst && ONLINE_GEMINI_MODELS.length) {
      activeModel = pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0].name;
      updateModelSelectorLabel();
      syncModelAttachmentCapabilities();
    }
    logTrace(`Gemini connected: ${ONLINE_GEMINI_MODELS.length} compatible models discovered.`, 'system');
    ensureValidActiveGeminiModel();
    return { success: true, models: ONLINE_GEMINI_MODELS };
  } catch (err) {
    ONLINE_GEMINI_MODELS = [];
    geminiConnectionState = 'disconnected';
    geminiConnectionError = err.message;
    updateGeminiConnectionBadge();
    renderModelDropdownList();
    logTrace(`Gemini connection failed: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
}

function hasAnyConfiguredModels() {
  const hasLocal = Array.isArray(installedModelsList) && installedModelsList.length > 0;
  if (hasLocal) return true;

  const hasGeminiKey = Boolean((localStorage.getItem('ultron-gemini-api-key') || '').trim());
  if (hasGeminiKey && Array.isArray(ONLINE_GEMINI_MODELS) && ONLINE_GEMINI_MODELS.length > 0) return true;

  const cloudModels = getInstalledCloudModels();
  if (Array.isArray(cloudModels) && cloudModels.length > 0) return true;

  if (window.UltronMultiProviderHub && typeof window.UltronMultiProviderHub.getAvailableModels === 'function') {
    const configured = window.UltronMultiProviderHub.getAvailableModels(true);
    if (configured.length > 0) return true;
  }

  return false;
}

function getAnyAvailableDefaultModel() {
  const local = selectBestInstalledLocalModel();
  if (local) return local;

  const hasGeminiKey = Boolean((localStorage.getItem('ultron-gemini-api-key') || '').trim());
  if (hasGeminiKey && ONLINE_GEMINI_MODELS.length) {
    return pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0]?.name || '';
  }

  const cloud = getInstalledCloudModels();
  if (cloud.length > 0) return cloud[0].name;

  if (window.UltronMultiProviderHub && typeof window.UltronMultiProviderHub.getAvailableModels === 'function') {
    const configured = window.UltronMultiProviderHub.getAvailableModels(true);
    if (configured.length > 0) return configured[0].name;
  }

  return '';
}

function updateModelSelectorLabel() {
  if (!modelSelectorLabel) return;

  const hasModels = hasAnyConfiguredModels();

  if (!hasModels) {
    activeModel = '';
    modelSelectorLabel.style.display = 'inline-flex';
    modelSelectorLabel.style.alignItems = 'center';
    modelSelectorLabel.style.gap = '6px';
    modelSelectorLabel.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; display: block;">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
      <span style="color: #f59e0b; font-size: 12px; font-weight: 600; line-height: 1; display: inline-block;">No Models</span>
    `;
    if (modelSelectorBtn) {
      modelSelectorBtn.title = 'No models installed or configured. Click to download or connect a model.';
    }
    syncModelAttachmentCapabilities();
    return;
  }

  if (!activeModel) {
    activeModel = getAnyAvailableDefaultModel();
  }

  if (!activeModel) {
    modelSelectorLabel.style.display = 'inline-flex';
    modelSelectorLabel.style.alignItems = 'center';
    modelSelectorLabel.style.gap = '6px';
    modelSelectorLabel.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0; display: block;">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
        <line x1="12" y1="22.08" x2="12" y2="12"></line>
      </svg>
      <span style="color: #f59e0b; font-size: 12px; font-weight: 600; line-height: 1; display: inline-block;">No Models</span>
    `;
    syncModelAttachmentCapabilities();
    return;
  }

  const name = activeModel;
  const provider = window.UltronMultiProviderHub ? window.UltronMultiProviderHub.detectProviderForModel(name) : 'ollama';
  const logoSrc = getBrandAssetLogo(provider);

  modelSelectorLabel.style.display = 'inline-flex';
  modelSelectorLabel.style.alignItems = 'center';
  modelSelectorLabel.style.gap = '6px';

  modelSelectorLabel.innerHTML = `
    <img src="${logoSrc}" alt="${provider}" style="width: 14px; height: 14px; object-fit: contain; flex-shrink: 0; display: block; margin: 0;" />
    <span style="line-height: 1; display: inline-block; margin: 0; padding: 0;">${name}</span>
  `;

  if (modelSelectorBtn) {
    modelSelectorBtn.title = `Active Model: ${name} (${provider})`;
  }

  syncModelAttachmentCapabilities();
}

function getBrandAssetLogo(provider) {
  switch (provider) {
    case 'gemini':
      return '../../Assets/Brand-Assets/gemini-logo.png';
    case 'openai':
      return '../../Assets/Brand-Assets/openai-white-logo.png';
    case 'anthropic':
      return '../../Assets/Brand-Assets/claude-logo.png';
    case 'deepseek':
      return '../../Assets/Brand-Assets/deepseek-blue-logo.png';
    case 'groq':
      return '../../Assets/Brand-Assets/grok-white-logo.png';
    case 'custom':
      return '../../Assets/Brand-Assets/openrouter-white-logo.png';
    case 'huggingface':
      return '../../Assets/Brand-Assets/hf-logo.png';
    case 'ollama':
    default:
      return '../../Assets/Brand-Assets/ollama-white-logo.png';
  }
}

function renderModelDropdownList() {
  if (!modelDropdownList) return;
  modelDropdownList.innerHTML = '';
  
  let hasAnyRenderedModel = false;
  const hasGeminiKey = Boolean((localStorage.getItem('ultron-gemini-api-key') || '').trim());

  // Render Google Gemini section
  if (hasGeminiKey && geminiConnectionState === 'connected' && ONLINE_GEMINI_MODELS.length > 0) {
    const onlineHeader = document.createElement('div');
    onlineHeader.className = 'model-dropdown-section-title';
    onlineHeader.style.cssText = 'padding: 8px 12px 4px 12px; font-size: 11px; font-weight: 600; color: #60a5fa; letter-spacing: 0.02em; text-transform: none;';
    onlineHeader.textContent = 'Google Gemini';
    modelDropdownList.appendChild(onlineHeader);

    ONLINE_GEMINI_MODELS.filter(m => isGeminiChatModel(m.name)).forEach(model => {
      hasAnyRenderedModel = true;
      const item = document.createElement('div');
      item.className = `model-dropdown-item${model.name === activeModel ? ' active' : ''}`;
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; flex: 1 1 0; min-width: 0; overflow: hidden;">
          <img src="../../Assets/Brand-Assets/gemini-logo.png" alt="Gemini" style="width: 16px; height: 16px; object-fit: contain; flex-shrink: 0;" />
          <span class="model-name-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${model.name}</span>
        </div>
        <span class="model-badge" style="font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.5); flex-shrink: 0; text-align: right; margin-left: 8px;">${model.tag}</span>
      `;
      item.addEventListener('click', async () => {
        await unloadOllamaModelsExcept('');
        activeModel = model.name;
        updateModelSelectorLabel();
        modelDropdownList.querySelectorAll('.model-dropdown-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        if (modelDropdown) modelDropdown.classList.add('hidden');
        if (modelSelectorWrapper) modelSelectorWrapper.classList.remove('open');
        logTrace(`Chat context model shifted to Online Model: "${activeModel}"`, 'local');
      });
      modelDropdownList.appendChild(item);
    });
  }

  // Render Multi-Provider models (OpenAI, Claude, DeepSeek, Groq, Custom)
  if (window.UltronMultiProviderHub && typeof window.UltronMultiProviderHub.getAvailableModels === 'function') {
    const hubModels = window.UltronMultiProviderHub.getAvailableModels(true);
    const providers = [
      { id: 'openai', label: 'OpenAI', color: '#10a37f' },
      { id: 'anthropic', label: 'Anthropic Claude', color: '#d97706' },
      { id: 'deepseek', label: 'DeepSeek API', color: '#3b82f6' },
      { id: 'groq', label: 'Groq Cloud', color: '#f97316' },
      { id: 'custom', label: 'Custom Models', color: '#8b5cf6' }
    ];

    providers.forEach(p => {
      const pModels = hubModels.filter(m => m.provider === p.id);
      if (pModels.length > 0) {
        const pHeader = document.createElement('div');
        pHeader.className = 'model-dropdown-section-title';
        pHeader.style.cssText = `padding: 10px 12px 4px 12px; font-size: 11px; font-weight: 600; color: ${p.color}; letter-spacing: 0.02em; text-transform: none; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 4px;`;
        pHeader.textContent = p.label;
        modelDropdownList.appendChild(pHeader);

        const pLogo = getBrandAssetLogo(p.id);

        pModels.forEach(model => {
          hasAnyRenderedModel = true;
          const item = document.createElement('div');
          item.className = `model-dropdown-item${model.name === activeModel ? ' active' : ''}`;
          const badgeTag = model.tag || (p.id === 'custom' ? 'CUSTOM' : p.id.toUpperCase());
          item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; flex: 1 1 0; min-width: 0; overflow: hidden;">
              <img src="${pLogo}" alt="${p.label}" style="width: 16px; height: 16px; object-fit: contain; flex-shrink: 0;" />
              <span class="model-name-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${model.displayName || model.name}</span>
            </div>
            <span class="model-badge" style="font-size: 10px; font-weight: 600; color: ${p.color}; flex-shrink: 0; text-align: right; margin-left: 8px;">${badgeTag}</span>
          `;
          item.addEventListener('click', async () => {
            await unloadOllamaModelsExcept('');
            activeModel = model.name;
            updateModelSelectorLabel();
            modelDropdownList.querySelectorAll('.model-dropdown-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            if (modelDropdown) modelDropdown.classList.add('hidden');
            if (modelSelectorWrapper) modelSelectorWrapper.classList.remove('open');
            logTrace(`Chat context model shifted to ${p.label}: "${activeModel}"`, 'system');
          });
          modelDropdownList.appendChild(item);
        });
      }
    });
  }

  const cloudModels = getInstalledCloudModels();
  if (cloudModels.length > 0) {
    const cloudHeader = document.createElement('div');
    cloudHeader.className = 'model-dropdown-section-title';
    cloudHeader.style.cssText = 'padding: 10px 12px 4px 12px; font-size: 11px; font-weight: 600; color: #34d399; letter-spacing: 0.02em; text-transform: none; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 4px;';
    cloudHeader.textContent = 'Ollama Cloud';
    modelDropdownList.appendChild(cloudHeader);

    cloudModels.forEach((model) => {
      hasAnyRenderedModel = true;
      const item = document.createElement('div');
      item.className = `model-dropdown-item${model.name === activeModel ? ' active' : ''}`;
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; flex: 1 1 0; min-width: 0; overflow: hidden;">
          <img src="../../Assets/Brand-Assets/ollama-white-logo.png" alt="Ollama Cloud" style="width: 16px; height: 16px; object-fit: contain; flex-shrink: 0;" />
          <span class="model-name-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${model.name}</span>
        </div>
        <span class="model-badge" style="font-size: 10px; font-weight: 600; color: #34d399; flex-shrink: 0; text-align: right; margin-left: 8px;">CLOUD</span>
      `;
      item.addEventListener('click', async () => {
        await unloadOllamaModelsExcept(model.name);
        activeModel = model.name;
        updateModelSelectorLabel();
        modelDropdownList.querySelectorAll('.model-dropdown-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        if (modelDropdown) modelDropdown.classList.add('hidden');
        if (modelSelectorWrapper) modelSelectorWrapper.classList.remove('open');
        logTrace(`Chat context model shifted to Ollama Cloud: "${activeModel}"`, 'local');
      });
      modelDropdownList.appendChild(item);
    });
  }

  // Render Local Ollama Models section
  const localHeader = document.createElement('div');
  localHeader.className = 'model-dropdown-section-title';
  localHeader.style.cssText = 'padding: 10px 12px 4px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.02em; text-transform: none; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 4px;';
  localHeader.textContent = 'Offline Models';
  modelDropdownList.appendChild(localHeader);

  const map = new Map();
  getInstalledOfflineModels().forEach(m => map.set(m.name, m));
  const uniqueModels = Array.from(map.values());

  if (uniqueModels.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'model-dropdown-item disabled';
    emptyItem.style.cssText = 'padding: 8px 12px; color: var(--text-muted); font-size: 12px; font-style: italic;';
    emptyItem.textContent = 'No local models downloaded yet.';
    modelDropdownList.appendChild(emptyItem);
  } else {
    uniqueModels.forEach(model => {
      hasAnyRenderedModel = true;
      const item = document.createElement('div');
      item.className = `model-dropdown-item${model.name === activeModel ? ' active' : ''}`;
      
      const isHf = model.name.startsWith('hf.co/');
      const modelLogo = isHf
        ? '../../Assets/Brand-Assets/hf-logo.png'
        : '../../Assets/Brand-Assets/ollama-white-logo.png';
      let badgeText = isHf ? 'HF GGUF' : 'LOCAL';
      if (model.name.includes(':')) {
        badgeText = model.name.split(':')[1].toUpperCase();
      }

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; flex: 1 1 0; min-width: 0; overflow: hidden;">
          <img src="${modelLogo}" alt="${isHf ? 'Hugging Face' : 'Ollama'}" style="width: 16px; height: 16px; object-fit: contain; flex-shrink: 0;" />
          <span class="model-name-text" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${model.name}</span>
        </div>
        <span class="model-badge" style="font-size: 10px; font-weight: 600; color: ${isHf ? '#fde047' : 'rgba(255,255,255,0.5)'}; flex-shrink: 0; text-align: right; margin-left: 8px;">${badgeText}</span>
      `;
      item.addEventListener('click', async () => {
        await unloadOllamaModelsExcept(model.name);
        activeModel = model.name;
        updateModelSelectorLabel();
        modelDropdownList.querySelectorAll('.model-dropdown-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        if (modelDropdown) modelDropdown.classList.add('hidden');
        if (modelSelectorWrapper) modelSelectorWrapper.classList.remove('open');
        logTrace(`Chat context model shifted to Local Model: "${activeModel}"`, 'local');
      });
      modelDropdownList.appendChild(item);
    });
  }
  
  if (!hasAnyRenderedModel) {
    modelDropdownList.innerHTML = '';
    const emptyState = document.createElement('div');
    emptyState.style.cssText = 'padding: 16px 14px; text-align: center; color: var(--text-muted); font-size: 12px;';
    emptyState.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 6px; color: #f59e0b; font-weight: 600; margin-bottom: 6px;">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <span>No Models Available</span>
      </div>
      <p style="margin: 0 0 10px 0; color: #a1a1aa; font-size: 11px; line-height: 1.4;">
        Download local models from the Models tab or configure cloud providers in Settings.
      </p>
      <button id="btn-dropdown-go-models" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); color: #ffffff; padding: 5px 12px; font-size: 11.5px; font-weight: 600; border-radius: 6px; cursor: pointer;">
        Browse Models Catalog
      </button>
    `;
    const btnGo = emptyState.querySelector('#btn-dropdown-go-models');
    if (btnGo) {
      btnGo.addEventListener('click', () => {
        if (modelDropdown) modelDropdown.classList.add('hidden');
        if (modelSelectorWrapper) modelSelectorWrapper.classList.remove('open');
        const navModels = document.querySelector('[data-view="models"]');
        if (navModels) navModels.click();
      });
    }
    modelDropdownList.appendChild(emptyState);
  }

  updateModelSelectorLabel();
}

// Onboarding Hardware Profiler
async function runOnboardingProfiler() {
  logTrace('Initializing hardware diagnostics...', 'system');
  
  const result = await window.ultronAPI.profileSystem();
  if (result && result.success) {
    const { stats, recommendation, installedModels } = result;
    
    installedModelsList = installedModels || [];
    
    // Bind to Right Sidebar Card UI
    if (statRam) statRam.textContent = `${stats.totalRamGB} GB`;
    if (statCpu) statCpu.textContent = `${stats.cpuThreads} Threads`;
    if (statGpu) {
      // Prefer the dedicated GPU (NVIDIA/AMD) over the integrated adapter
      statGpu.textContent = stats.dedicatedGpu
        ? `${stats.dedicatedGpu.vendor} ${stats.dedicatedGpu.model}`.trim()
        : (stats.gpus[0] || 'Unknown GPU');
      statGpu.title = (stats.gpus || []).join(' | ');
    }
    if (statRecommendation) statRecommendation.textContent = `${recommendation.toUpperCase()} (Quantized)`;
    
    // Set active model to an actually installed model from Ollama, Gemini, or Multi-Providers
    const hasGeminiKey = Boolean((localStorage.getItem('ultron-gemini-api-key') || '').trim());
    const installedMatch = installedModelsList.find(m => m.name === recommendation || (m.name && m.name.split(':')[0] === recommendation.split(':')[0]));
    if (installedMatch) {
      activeModel = installedMatch.name;
    } else if (installedModelsList.length > 0) {
      activeModel = selectBestInstalledLocalModel() || installedModelsList[0].name;
    } else if (hasGeminiKey && ONLINE_GEMINI_MODELS.length) {
      activeModel = pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0].name;
    } else {
      activeModel = getAnyAvailableDefaultModel();
    }
    
    logTrace(`Onboarding Profiler: Total RAM resolved as ${stats.totalRamGB} GB`, 'system');
    logTrace(`Onboarding Profiler: Suggesting local model footprint: ${recommendation}`, 'system');
    logTrace(`Ollama binds returned ${installedModelsList.length} offline model weights.`, 'system');
    
    // Set settings data directory dynamically from install location
    if (window.ultronAPI && window.ultronAPI.getDefaultDataDir) {
      const defaultDataDir = await window.ultronAPI.getDefaultDataDir();
      if (!window.localStorage.getItem('ultron-data-dir')) {
        window.localStorage.setItem('ultron-data-dir', defaultDataDir);
      }
    }
    
    // Update model dropdown UI & Settings models UI
    renderModelDropdownList();
    renderSettingsModels();
    renderOllamaCatalog();
    
    // Hardware diagnostics belong in Engine/Logs, not in the agent task list.
    // Tasks are populated only while an actual agent request is running.
    activeSubgoals = [];
    renderChecklist([]);
  } else {
    logTrace(`Hardware profiling failed: ${result ? result.error : 'Unknown error'}`, 'system');
  }

}

// Bind security settings selector
const SECURITY_MODE_LABELS = {
  Review: 'Review',
  Containment: 'Containment',
  Adaptive: 'Adaptive',
  Trusted: 'Trusted'
};

const PERM_MODE_DISPLAY_LABELS = {
  Review: 'Prompt Every Action',
  Adaptive: 'Smart Auto-Approval',
  Trusted: 'Full Autonomous Mode',
  Containment: 'Smart Auto-Approval'
};

function updateSecurityModeUI(mode) {
  const resolved = SECURITY_MODE_LABELS[mode] ? mode : 'Adaptive';
  if (selectSecurityMode) selectSecurityMode.value = resolved;
  if (settingsDefaultSecurity) settingsDefaultSecurity.value = resolved;

  const btnPermSelector = document.getElementById('btn-perm-selector');
  const permSelectorLabel = document.getElementById('perm-selector-label');
  const displayLabel = PERM_MODE_DISPLAY_LABELS[resolved] || 'Smart auto-approval';

  if (permSelectorLabel) permSelectorLabel.textContent = displayLabel;
  if (btnPermSelector) {
    btnPermSelector.classList.toggle('warning-active', resolved === 'Trusted');
  }

  document.querySelectorAll('.mode-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === resolved);
  });
}

const btnPermSelector = document.getElementById('btn-perm-selector');
const permModeDropdown = document.getElementById('perm-mode-dropdown');
const permSelectorWrapper = document.getElementById('perm-selector-wrapper');

if (btnPermSelector && permModeDropdown) {
  btnPermSelector.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !permModeDropdown.classList.contains('hidden');
    if (isOpen) {
      permModeDropdown.classList.add('hidden');
      if (permSelectorWrapper) permSelectorWrapper.classList.remove('open');
    } else {
      permModeDropdown.classList.remove('hidden');
      if (permSelectorWrapper) permSelectorWrapper.classList.add('open');
    }
  });

  document.querySelectorAll('#perm-mode-dropdown .mode-option').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const targetMode = item.dataset.mode;
      await applySecurityMode(targetMode, 'prompt-top-bar');
      permModeDropdown.classList.add('hidden');
      if (permSelectorWrapper) permSelectorWrapper.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    if (permSelectorWrapper && !permSelectorWrapper.contains(e.target)) {
      permModeDropdown.classList.add('hidden');
      permSelectorWrapper.classList.remove('open');
    }
  });
}

async function applySecurityMode(selectedMode, source = 'ui') {
  const result = await window.ultronAPI.setSecurityMode(selectedMode);
  if (result && result.success) {
    updateSecurityModeUI(selectedMode);
    logTrace(`Security mode set to ${SECURITY_MODE_LABELS[selectedMode] || selectedMode} (${source}).`, 'system');
    return true;
  }
  logTrace(`Failed to alter security boundary settings: ${result ? result.error : 'unknown'}`, 'error');
  return false;
}

async function syncSecurityMode() {
  try {
    const currentMode = await window.ultronAPI.getSecurityMode();
    updateSecurityModeUI(currentMode);
    logTrace(`Security boundary synced: ${currentMode}`, 'system');
  } catch (err) {
    updateSecurityModeUI('Adaptive');
    logTrace(`Security sync failed: ${err.message}`, 'error');
  }
}

if (selectSecurityMode) {
  selectSecurityMode.addEventListener('change', async (e) => {
    await applySecurityMode(e.target.value, 'sidebar');
  });
}

if (settingsDefaultSecurity) {
  settingsDefaultSecurity.addEventListener('change', async (e) => {
    await applySecurityMode(e.target.value, 'settings');
  });
}

// Custom model dropdown toggle and click-outside close
if (modelSelectorBtn) {
  modelSelectorBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!modelDropdown) return;
    const isOpen = !modelDropdown.classList.contains('hidden');
    if (isOpen) {
      modelDropdown.classList.add('hidden');
      if (modelSelectorWrapper) modelSelectorWrapper.classList.remove('open');
    } else {
      // Close plus menu if open
      const plusDropdown = document.getElementById('plus-menu-dropdown');
      if (plusDropdown) plusDropdown.classList.add('hidden');
      const plusWrapper = document.getElementById('plus-menu-wrapper');
      if (plusWrapper) plusWrapper.classList.remove('open');

      // Open instantly with rendered model list
      try {
        renderModelDropdownList();
      } catch (err) {
        console.error('Error rendering model dropdown:', err);
      }
      modelDropdown.classList.remove('hidden');
      if (modelSelectorWrapper) modelSelectorWrapper.classList.add('open');

      // Proactively refresh Ollama models from tags API & IPC
      refreshInstalledModelsFromOllama().then(() => {
        renderModelDropdownList();
      }).catch(() => {});

      if (window.ultronAPI && typeof window.ultronAPI.profileSystem === 'function') {
        window.ultronAPI.profileSystem().then(res => {
          if (res && Array.isArray(res.installedModels)) {
            installedModelsList = res.installedModels;
            renderModelDropdownList();
          }
        }).catch(() => {});
      }
    }
  });
}

const btnDropdownDownloadModels = document.getElementById('btn-dropdown-download-models');
if (btnDropdownDownloadModels) {
  btnDropdownDownloadModels.addEventListener('click', (e) => {
    e.stopPropagation();
    if (modelDropdown) modelDropdown.classList.add('hidden');
    if (modelSelectorWrapper) modelSelectorWrapper.classList.remove('open');
    if (typeof openSettingsPanel === 'function') {
      openSettingsPanel('models');
    }
  });
}

document.addEventListener('click', (e) => {
  if (modelSelectorWrapper && !modelSelectorWrapper.contains(e.target)) {
    modelDropdown.classList.add('hidden');
    modelSelectorWrapper.classList.remove('open');
  }
  if (voiceModeModelsWrap && !voiceModeModelsWrap.contains(e.target)) {
    closeVoiceModeModelsPanel();
  }
});

// Human-in-the-loop validation overlay hooks
window.ultronAPI.onPermissionRequest((request) => {
  currentPermissionId = request.id;
  if (permActionCode) permActionCode.textContent = request.command || '';
  if (permOverrideInput) permOverrideInput.value = '';

  const permRiskBadge = document.getElementById('perm-risk-badge');
  const permReasonText = document.getElementById('perm-reason-text');

  // Risk classification for UI
  const cmd = String(request.command || '').toLowerCase();
  let riskLevel = 'medium';
  let reason = 'Runs a command on your PC with full local privileges';
  if (cmd.includes('rm ') || cmd.includes('del ') || cmd.includes('format') || cmd.includes('reg') || cmd.includes('shutdown') || cmd.includes('diskpart')) {
    riskLevel = 'high';
    reason = 'Destructive filesystem or system alteration command detected';
  } else if (cmd.startsWith('dir') || cmd.startsWith('ls') || cmd.startsWith('type') || cmd.startsWith('cat') || cmd.startsWith('echo') || cmd.startsWith('pwd') || cmd.startsWith('cd')) {
    riskLevel = 'low';
    reason = 'Read-only inspection or navigation action';
  }

  if (permReasonText) permReasonText.textContent = reason;
  if (permRiskBadge) {
    permRiskBadge.textContent = `${riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)} risk`;
    permRiskBadge.className = `perm-risk-badge perm-risk-${riskLevel}`;
  }

  // Show permission panel
  permissionDialog.classList.remove('hidden');
  playUltronSound('permission');
  ensureRightSidebarVisible();
  expandRightSidebarSection('section-security');
  logTrace(`Permission required: "${String(request.command || '').substring(0, 60)}"`, 'permission');
});

// Copy button for permission command preview
const btnCopyPermAction = document.getElementById('btn-copy-perm-action');
if (btnCopyPermAction && permActionCode) {
  btnCopyPermAction.addEventListener('click', async () => {
    try {
      const code = permActionCode.textContent || '';
      await navigator.clipboard.writeText(code);
      const span = btnCopyPermAction.querySelector('span');
      if (span) span.textContent = 'Copied!';
      btnCopyPermAction.classList.add('copied');
      setTimeout(() => {
        if (span) span.textContent = 'Copy';
        btnCopyPermAction.classList.remove('copied');
      }, 1500);
    } catch (e) {
      console.error('Failed to copy permission action', e);
    }
  });
}

// Accept and run action once
btnPermAccept.addEventListener('click', () => {
  if (currentPermissionId) {
    const override = permOverrideInput.value.trim();
    window.ultronAPI.sendPermissionResponse({
      id: currentPermissionId,
      approved: true,
      scope: 'once',
      modifiedCommand: override || null
    });
    
    permissionDialog.classList.add('hidden');
    logTrace(`Human verification accepted for ID: ${currentPermissionId}`, 'system');
    currentPermissionId = null;
  }
});

// Accept for session
const btnPermAcceptSession = document.getElementById('btn-perm-accept-session');
if (btnPermAcceptSession) {
  btnPermAcceptSession.addEventListener('click', () => {
    if (currentPermissionId) {
      const override = permOverrideInput.value.trim();
      window.ultronAPI.sendPermissionResponse({
        id: currentPermissionId,
        approved: true,
        scope: 'session',
        modifiedCommand: override || null
      });
      permissionDialog.classList.add('hidden');
      logTrace(`Human verification (session) accepted for ID: ${currentPermissionId}`, 'system');
      currentPermissionId = null;
    }
  });
}

// Always allow category
const btnPermAcceptAlways = document.getElementById('btn-perm-accept-always');
if (btnPermAcceptAlways) {
  btnPermAcceptAlways.addEventListener('click', () => {
    if (currentPermissionId) {
      const override = permOverrideInput.value.trim();
      window.ultronAPI.sendPermissionResponse({
        id: currentPermissionId,
        approved: true,
        scope: 'always',
        modifiedCommand: override || null
      });
      permissionDialog.classList.add('hidden');
      logTrace(`Human verification (always) accepted for ID: ${currentPermissionId}`, 'system');
      currentPermissionId = null;
    }
  });
}

// Deny execution action
btnPermDeny.addEventListener('click', () => {
  if (currentPermissionId) {
    window.ultronAPI.sendPermissionResponse({
      id: currentPermissionId,
      approved: false,
      scope: 'deny'
    });
    
    permissionDialog.classList.add('hidden');
    logTrace(`Human verification rejected for ID: ${currentPermissionId}`, 'system');
    currentPermissionId = null;
  }
});

// Permission dialog keyboard shortcuts: Esc to deny, Enter to allow
window.addEventListener('keydown', (e) => {
  if (permissionDialog && !permissionDialog.classList.contains('hidden')) {
    if (e.key === 'Escape') {
      e.preventDefault();
      btnPermDeny?.click();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || document.activeElement !== permOverrideInput)) {
      e.preventDefault();
      btnPermAccept?.click();
    }
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
  
  rebuildSessionHistoryList();
  
  // Update header title
  if (activeChatTitle) activeChatTitle.textContent = title;
}

function generateInstantSmartTitle(userPrompt) {
  if (!userPrompt || typeof userPrompt !== 'string') return 'New Chat';
  let clean = userPrompt.trim()
    .replace(/^[\s\W_]+/, '')
    .replace(/^(can you|please|could you|help me with|help me|i want to|how to|what is|tell me about|explain|write a|create a|give me)\s+/i, '')
    .trim();
  if (!clean) clean = userPrompt.trim();
  const words = clean.split(/\s+/).slice(0, 4).join(' ');
  let title = words.charAt(0).toUpperCase() + words.slice(1);
  if (title.length > 28) title = title.substring(0, 25) + '...';
  return title || 'New Chat';
}

// Instant smart title generation (0ms overhead, zero Ollama queue locks)
function triggerAiTitleGeneration(userPrompt) {
  try {
    const targetSessionId = currentSessionId;
    if (!targetSessionId || !conversationsStore[targetSessionId]) return;

    const finalTitle = generateInstantSmartTitle(userPrompt);
    conversationsStore[targetSessionId].title = finalTitle;
    touchSession(targetSessionId);
    rebuildSessionHistoryList();
    saveConversationsToDisk();

    const sidebarItem = document.querySelector(`[data-session-id="${targetSessionId}"] .nav-text`);
    if (sidebarItem) {
      sidebarItem.textContent = finalTitle;
    }
    if (currentSessionId === targetSessionId && activeChatTitle) {
      activeChatTitle.textContent = finalTitle;
    }
    logTrace(`Session title set to: "${finalTitle}"`, 'system');
  } catch (e) {
    // Non-fatal
  }
}

// Check for meaningless or gibberish prompts to avoid model hallucinations
function isMeaninglessPrompt(text) {
  const trimmed = String(text || '').trim();
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
  
  // 2. Check if the prompt consists exclusively of consonant keyboard mashing (e.g. "sdfghjkshdflkjsdhf")
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.length <= 3) {
    const isAllGibberish = words.every(word => word.length > 6 && !/[aeiouyAEIOUY0-9]/i.test(word));
    if (isAllGibberish) return true;
  }
  
  return false;
}

function getThinkingLabelForPrompt(prompt) {
  const p = String(prompt || '').toLowerCase();
  if (/\b(mindmap|mind\s*map|concept\s*tree|taxonomy)\b/i.test(p)) {
    return 'Generating mindmap';
  }
  if (/\b(architecture|tech stack|system design|layer|microservice)\b/i.test(p)) {
    return 'Creating visual architecture';
  }
  if (/\b(flowchart|flow\s*chart|process\s*flow|pipeline)\b/i.test(p)) {
    return 'Visualizing flowchart';
  }
  if (/\b(chart|graph|plot|bar\s*chart|pie\s*chart|line\s*chart)\b/i.test(p)) {
    return 'Visualizing data chart';
  }
  if (/\b(diagram|visualize|draw|timeline|roadmap|gantt)\b/i.test(p)) {
    return 'Visualizing diagram';
  }
  if (/\b(interactive\s*ui|generative\s*ui|calculator|converter|widget)\b/i.test(p)) {
    return 'Building interactive UI';
  }
  if (/\b(search|find|google|look up|who is|price|latest news)\b/i.test(p)) {
    return 'Searching knowledge';
  }
  return 'Thinking';
}

// Submit prompt logic
async function submitPrompt(overridePrompt) {
  if (isAwaitingResponse) return;

  let prompt = (typeof overridePrompt === 'string' && overridePrompt.trim())
    ? overridePrompt.trim()
    : chatInput.value.trim();
  let currentImagePayloads = [];
  const userAttachedVisuals = [];
  let llmEnrichedPrompt = prompt;
  
  // Include attached files in prompt if present
  if (attachedFiles.length > 0) {
    attachedFiles.forEach(f => {
      userAttachedVisuals.push({
        name: f.name,
        size: f.size,
        type: f.type,
        isImage: f.isImage,
        dataUrl: f.dataUrl
      });

      if (f.isImage && f.dataUrl) {
        const base64Data = f.dataUrl.includes(',') ? f.dataUrl.split(',')[1] : f.dataUrl;
        currentImagePayloads.push({ mimeType: f.type || 'image/png', data: base64Data });
      } else if (f.textContent) {
        const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : 'txt';
        llmEnrichedPrompt = llmEnrichedPrompt 
          ? `${llmEnrichedPrompt}\n\n📄 **Attached Document [${f.name}]**:\n\`\`\`${ext}\n${f.textContent}\n\`\`\`` 
          : `📄 **Attached Document [${f.name}]**:\n\`\`\`${ext}\n${f.textContent}\n\`\`\``;
      }
    });

    attachedFiles = [];
    renderAttachmentPreviews();
  }

  // Context injection: resolve referenced session artifacts ("the file", "it")
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.resolveArtifactReference === 'function'
    && !/[a-z]:\\[^\s]+/i.test(prompt)) {
    try {
      const refArtifact = window.UltronAgentMemory.resolveArtifactReference(prompt, currentSessionId);
      if (refArtifact && refArtifact.kind !== 'web') {
        let refDetail = `[Referenced file: ${refArtifact.name} — ${refArtifact.path}]`;
        let refSnippet = refArtifact.snippet || '';
        if (!refSnippet && window.ultronAPI && window.ultronAPI.readFile) {
          const refRead = await window.ultronAPI.readFile(refArtifact.path).catch(() => null);
          if (refRead && refRead.success) refSnippet = String(refRead.content || '').slice(0, 400);
        }
        if (refSnippet) refDetail += `\nFirst lines:\n${String(refSnippet).slice(0, 400)}`;
        llmEnrichedPrompt = `${llmEnrichedPrompt}\n\n${refDetail}`;
      }
    } catch (_) { /* artifact resolution is best-effort */ }
  }

  if (!prompt && userAttachedVisuals.length === 0) return;

  const displayPrompt = prompt;
  prompt = normalizePromptTypos(llmEnrichedPrompt || prompt || 'Please analyze the attached file(s).');

  // Create a new AbortController for this request so the stop button can cancel it
  _activeAbortController = new AbortController();

  setSendingState(true);
  
  if (typeof overridePrompt !== 'string') {
    chatInput.value = '';
    chatInput.style.height = 'auto';
  }
  
  // Toggle off search overlay if open
  chatSearchOverlay.classList.add('hidden');
  
  const isFirstMessage = !currentSessionId;
  
  // 1. Add session history item if starting a session
  if (isFirstMessage) {
    addSessionToHistory(makeSessionTitle(displayPrompt || 'File analysis'));
  }
  
  // 2. Render user message with attached thumbnails and badges
  appendChatMessage('User', displayPrompt, false, { attachments: userAttachedVisuals });
  logTrace(`Processing user request: "${(displayPrompt || prompt).substring(0, 40)}..."`, 'local');
  stopTtsSpeech();

  // Document intake: analysis request without an attachment or referenced file
  if (userAttachedVisuals.length === 0 && promptNeedsDocumentIntake(displayPrompt)) {
    let intakeSkip = false;
    try {
      const refArtifact = window.UltronAgentMemory && window.UltronAgentMemory.resolveArtifactReference
        ? window.UltronAgentMemory.resolveArtifactReference(displayPrompt, currentSessionId) : null;
      if (refArtifact && refArtifact.kind !== 'web') intakeSkip = true;
    } catch (_) { /* ignore */ }
    if (!intakeSkip) {
      const intakeCard = renderDocumentIntakeCard(displayPrompt);
      const intakeBubble = appendChatMessage('Ultron', '<div class="thinking-container">Thinking<div class="thinking-dot-wrapper"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div></div>', true, { skipSave: true });
      renderMessageContent(intakeBubble, intakeCard);
      finalizeAiMessageBubble(intakeBubble, intakeCard, { autoSpeak: false });
      appendChatMessage('Ultron', intakeCard, true, { skipRender: true });
      setSendingState(false);
      return;
    }
  }
  
  try {
    if (window.UltronAgentMemory && typeof window.UltronAgentMemory.parseWorkflowFromPrompt === 'function') {
      const savedWorkflow = window.UltronAgentMemory.parseWorkflowFromPrompt(prompt);
      if (savedWorkflow) {
        const aiBubble = appendChatMessage('Ultron', '<div class="thinking-container">Thinking<div class="thinking-dot-wrapper"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div></div>', true, { skipSave: true });
        const response = `Saved workflow **${savedWorkflow.name}** with ${savedWorkflow.steps.length} step(s):\n${savedWorkflow.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\nSay **run ${savedWorkflow.name}** to execute it.`;
        renderMessageContent(aiBubble, response);
        finalizeAiMessageBubble(aiBubble, response, { autoSpeak: false });
        appendChatMessage('Ultron', response, true, { skipRender: true });
        setSendingState(false);
        return;
      }
    }

    // Check for meaningless/gibberish prompts early (only when no file attachments are provided)
    if (!userAttachedVisuals.length && isMeaninglessPrompt(displayPrompt)) {
      const aiBubble = appendChatMessage('Ultron', '<div class="thinking-container">Thinking<div class="thinking-dot-wrapper"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div></div>', true, { skipSave: true });
      await new Promise(resolve => setTimeout(resolve, 500));
      const response = "I received a prompt that appears to consist of repetitive characters or gibberish. Could you please clarify your request or ask a meaningful question? I'm here to help!";
      renderMessageContent(aiBubble, response);
      appendChatMessage('Ultron', response, true, { skipRender: true });
    } else {
      // 3. Classify user intent — route on the user's typed text only, never on
      // attached-document content (otherwise resume keywords trigger web search).
      const routingPrompt = (displayPrompt || '').trim() || 'Please analyze the attached file(s).';
      // "open the project in the editor/workspace" → reopen the saved project folder in the split workspace.
      if (/\bopen\s+(?:(?:the|my)\s+)?(?:project\s+(?:in\s+)?(?:the\s+)?|(?:the|my)\s+)?(workspace|editor|canvas)\b/i.test(routingPrompt)) {
        loadProjectIntoWorkspace();
      }
      const compound = splitSearchAndActionPrompt(routingPrompt);
      const intent = compound ? 'search' : classifyIntent(routingPrompt);
      logTrace(`Intent classified as: "${intent}"${compound ? ' (compound: search + action)' : ''} for prompt: "${prompt.substring(0, 40)}..."`, 'system');
      if (!['action', 'search'].includes(intent)) {
        activeSubgoals = [];
        renderChecklist([]);
      }

      // 4. Setup AI placeholder loading bubble with dynamic thinking status
      const thinkingLabel = getThinkingLabelForPrompt(routingPrompt);
      const aiBubble = appendChatMessage('Ultron', `<div class="thinking-container">${escapeHtml(thinkingLabel)}<div class="thinking-dot-wrapper"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div></div>`, true, { skipSave: true });
      
      // Check model readiness (Ollama / cloud keys / HF pull / Ollama Cloud auth)
      if (intent === 'action' || intent === 'conversation' || intent === 'search') {
        const preflight = await preflightActiveModelForChat();
        if (!preflight.ok) {
          await new Promise(resolve => setTimeout(resolve, 300));
          const cardMsg = preflight.classified?.message
            || 'Model is not ready. Check Settings → Models or start Ollama.';
          const code = preflight.classified?.code || 'OLLAMA_OFFLINE';
          const offlineCard = `<div class="agent-final-response">${renderErrorRecoveryCard(code === 'API_KEY' ? 'GEMINI_KEY_MISSING' : 'OLLAMA_OFFLINE', cardMsg)}</div>`;
          renderMessageContent(aiBubble, offlineCard);
          finalizeAiMessageBubble(aiBubble, offlineCard, { autoSpeak: false });
          appendChatMessage('Ultron', offlineCard, true, { skipRender: true });
          setSendingState(false);
          return;
        }
      }
      
      // 5. Trigger AI Title summary in the background on the first message
      if (isFirstMessage && shouldGenerateAiTitle(prompt)) {
        triggerAiTitleGeneration(prompt);
      }

      if (intent === 'system_control') {
        const sysResult = await executeSystemControlQuery(routingPrompt);
        const response = sysResult.message || (sysResult.success ? 'System setting updated.' : 'Failed to update system setting.');
        await typeMessageResponse(aiBubble, response);
        appendChatMessage('Ultron', response, true, { skipRender: true });

      } else if (intent === 'math') {
        const mathResult = evaluateMathQuery(routingPrompt);
        let response = '';
        if (mathResult) {
          response = formatMathSolution(mathResult);
        } else {
          const mathSysPrompt = `You are an expert mathematician and precise computational assistant. Solve the user's calculation step-by-step with exact arithmetic and format in clean Markdown.`;
          response = await queryOfflineLLM(prompt, [], 'conversation', mathSysPrompt, currentImagePayloads);
        }
        await typeMessageResponse(aiBubble, response);
        appendChatMessage('Ultron', response, true, { skipRender: true });

      } else if (intent === 'user_identity') {
        const userName = getUserFullName();
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
          const locCtx = window.UltronLocationContext;
          const loc = locCtx
            ? await locCtx.resolveEffectiveLocation(prompt, { getSystemContext })
            : { label: realtime.locationLabel, source: 'auto', confidence: 'medium' };
          const approx = loc.label || realtime.locationLabel;
          const sourceNote = loc.source === 'saved' ? ' (from your saved home city)'
            : loc.source === 'windows-gps' ? ' (from Windows location services — GPS/Wi‑Fi)'
            : loc.source === 'ip-geo' ? ' (approximate, from IP geolocation)'
            : loc.source === 'timezone' ? ' (estimated from timezone — set home city in Settings for accuracy)'
            : '';
          response = `Your approximate location is **${approx}**${realtime.countryCode ? ` (${realtime.countryCode})` : ''}${sourceNote}. Timezone: **${realtime.timeZone}**.`;
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

      } else if (compound && isWebSearchEnabled()) {
        await runSearchIntentFlow(compound.searchPart, aiBubble, currentImagePayloads, [], [], Date.now(), false);
        const actionBubble = appendChatMessage('Ultron', '<div class="thinking-container">Thinking<div class="thinking-dot-wrapper"><span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span></div></div>', true, { skipSave: true });
        await runAgenticLoop(compound.actionPart, actionBubble, 'action', currentImagePayloads);

      } else if (intent === 'conversation' && isProductOrShoppingQuery(routingPrompt)) {
        await runSearchIntentFlow(routingPrompt, aiBubble, currentImagePayloads, [], [], Date.now(), false);

      } else if (intent === 'conversation') {
        const isFollowUp = isFollowUpAboutPriorTurn(routingPrompt);
        const followUpSystem = isFollowUp ? buildFollowUpConversationSystemPrompt() : null;
        // Pure conversational response — stream local model tokens straight into the bubble
        let streamedTokens = false;
        let lastStreamPaint = 0;
        let response = await queryOfflineLLM(prompt, [], 'conversation', followUpSystem, currentImagePayloads, isFollowUp ? {} : {
          onToken: (fullText) => {
            streamedTokens = true;
            const now = Date.now();
            if (now - lastStreamPaint < 80) return;
            lastStreamPaint = now;
            if (!isIrrelevantModelResponse(fullText, prompt)) {
              renderMessageContent(aiBubble, fullText);
              chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
              if (isTtsAutoSpeakEnabled()) feedStreamingAutoSpeak(fullText);
            }
          }
        });

        if (response && (isIrrelevantModelResponse(response, prompt) || isMultiTopicHallucination(response, prompt))) {
          logTrace('Replacing irrelevant follow-up response with context-aware retry.', 'system');
          streamedTokens = false;
          renderMessageContent(aiBubble, composeAgentLiveContent(getAgentShimmerLineHtml('Thinking')));
          response = await queryOfflineLLM(
            prompt,
            [],
            'conversation',
            isFollowUp ? buildFollowUpConversationSystemPrompt() : null,
            currentImagePayloads
          );
        }

        if (!response || !response.trim()) {
          const isGemini = activeModel && activeModel.startsWith('gemini');
          if (isGemini) {
            response = `⚠️ **Google Gemini Connection Error**\n\nCould not receive a response from **${activeModel}**.\n\nPlease check your internet connection or verify your API key in **Settings > Models**.`;
            notifyModelIssue(classifyModelFailure(response, activeModel));
          } else {
            response = `⚠️ **Local Ollama Model Connection Error**\n\nCould not connect to model **${activeModel || 'ollama'}** on ` + '`http://127.0.0.1:11434`' + `.\n\n**To Fix:**\n1. Make sure Ollama is running (` + '`ollama serve`' + `).\n2. Pull your model (` + '`ollama pull ' + (activeModel || 'tinyllama') + '`' + `).\n3. Or select Google Gemini from the top dropdown.`;
            notifyModelIssue(classifyModelFailure('Could not connect to Ollama service', activeModel));
          }
        } else if (/Connection Error|Provider Error|API Key Required|Memory Limit Exceeded|Model request failed/i.test(response)) {
          notifyModelIssue(classifyModelFailure(response, activeModel));
        }
        response = String(response || '').replace(/\[your_name\]|\[Your Name\]|<your name>|\[Agent Name\]/gi, 'Brown');
        if (response && (shouldFallbackToWebSearch(routingPrompt, response) || (isGenericAssistantGreeting(response) && isProductOrShoppingQuery(routingPrompt)))) {
          logTrace('Factual or time-sensitive question — searching the web for a current answer.', 'system');
          await runSearchIntentFlow(routingPrompt, aiBubble, currentImagePayloads, [], [], Date.now(), false);
        } else if (/Gemini API Key Required/i.test(response)) {
          const card = `<div class="agent-final-response">${renderErrorRecoveryCard('GEMINI_KEY_MISSING', `Google Gemini API key required for ${activeModel}. Add your key in Settings → Models.`)}</div>`;
          renderMessageContent(aiBubble, card);
          finalizeAiMessageBubble(aiBubble, card, { autoSpeak: false });
          appendChatMessage('Ultron', card, true, { skipRender: true });
        } else if (streamedTokens) {
          renderMessageContent(aiBubble, response);
          formatCodeBlocks(aiBubble);
          finalizeAiMessageBubble(aiBubble, response);
          appendChatMessage('Ultron', response, true, { skipRender: true });
        } else {
          await typeMessageResponse(aiBubble, response);
          formatCodeBlocks(aiBubble);
          appendChatMessage('Ultron', response, true, { skipRender: true });
        }

      } else {
        // Action or Search intent — run the full agentic loop
        await runAgenticLoop(prompt, aiBubble, intent, currentImagePayloads);
      }
    }
  } catch (err) {
    // Handle user-initiated stop (AbortError) gracefully
    if (err.name === 'AbortError' || (_activeAbortController && _activeAbortController.signal.aborted)) {
      const stoppedBubbles = chatMessagesContainer.querySelectorAll('.chat-bubble.ai');
      const lastAiBubble = stoppedBubbles.length ? stoppedBubbles[stoppedBubbles.length - 1] : null;
      if (lastAiBubble) {
        const existingContent = lastAiBubble.querySelector('.message-content');
        const messageWrapper = lastAiBubble.querySelector('.message-wrapper') || lastAiBubble;
        const actionsDiv = messageWrapper ? messageWrapper.querySelector('.message-actions') : null;
        if (existingContent) {
          const thinkingNode = existingContent.querySelector('.agent-thinking-wrapper, .thinking-container');
          if (thinkingNode) thinkingNode.remove();
          const stoppedNotes = existingContent.querySelectorAll('.agent-stopped-note');
          stoppedNotes.forEach(n => n.remove());

          const cleanText = extractPlainTextFromMessage(existingContent.innerText || existingContent.textContent || '');
          if (actionsDiv) {
            actionsDiv.style.display = 'flex';
            wireMessageActionButtons(actionsDiv, cleanText);
          }
        }
      }
      logTrace('Generation stopped by user.', 'system');
    } else {
      logTrace(`Request failed: ${err.message}`, 'error');
      const stoppedBubbles = chatMessagesContainer.querySelectorAll('.chat-bubble.ai');
      const lastAiBubble = stoppedBubbles.length ? stoppedBubbles[stoppedBubbles.length - 1] : null;
      const errText = `Something went wrong: ${err.message || 'Unknown error'}. Try **Ctrl+R** to reload, or check that Ollama is running.`;
      if (lastAiBubble) {
        renderMessageContent(lastAiBubble.querySelector('.message-content') || lastAiBubble, errText);
        finalizeAiMessageBubble(lastAiBubble.querySelector('.message-content') || lastAiBubble, errText, { autoSpeak: false });
        appendChatMessage('Ultron', errText, true, { skipRender: true });
      } else {
        appendChatMessage('Ultron', errText, true);
      }
    }
  } finally {
    setSendingState(false);
  }
}

function parseReactToolCall(text) {
  if (!text || typeof text !== 'string') return null;

  const finalMatch = text.match(/Final Answer:\s*([\s\S]+)/i);
  if (finalMatch && finalMatch[1].trim()) {
    return { type: 'FINAL_ANSWER', content: finalMatch[1].trim() };
  }

  const actionMatch = text.match(/Action:\s*([^\n]+)/i);
  if (!actionMatch) return null;

  const actionName = actionMatch[1].trim().replace(/^["']|["']$/g, '').toUpperCase();
  const inputMatch = text.match(/Action Input:\s*([\s\S]*?)(?=\n\n|\nThought:|\nAction:|\nFinal Answer:|$)/i);
  let actionInput = inputMatch ? inputMatch[1].trim() : '';

  let args = {};
  if (actionInput) {
    try {
      args = JSON.parse(actionInput);
    } catch (e) {
      const plain = actionInput.replace(/^["']|["']$/g, '');
      if (['OPEN_APP', 'FOCUS_APP'].includes(actionName)) {
        args = { appName: plain };
      } else if (actionName === 'OPEN_URL') {
        args = { url: plain };
      } else if (actionName === 'OPEN_FILE') {
        args = { path: plain };
      } else if (actionName === 'TYPE_TEXT') {
        args = { text: actionInput };
      } else if (actionName === 'HOTKEY') {
        args = { keys: plain };
      } else if (actionName === 'SEARCH') {
        args = { query: plain };
      } else if (['READ_FILE', 'LIST_DIR', 'EXECUTE'].includes(actionName)) {
        args = actionName === 'EXECUTE' ? { command: plain } : { path: plain };
      } else if (actionName === 'WEB_FETCH') {
        args = { url: plain };
      } else {
        args = { target: plain };
      }
    }
  }

  const synthetic = JSON.stringify({ tool: actionName, args });
  return parseJsonToolCall(synthetic);
}

function extractReactFinalAnswer(text) {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/Final Answer:\s*([\s\S]+)/i);
  return match ? match[1].trim() : '';
}

function extractReactThought(text) {
  if (!text || typeof text !== 'string') return '';
  const match = text.match(/Thought:\s*([\s\S]*?)(?=\nAction:|\nFinal Answer:|$)/i);
  return match ? match[1].trim().replace(/\s+/g, ' ') : '';
}

function parseAgentToolCall(text, userPrompt = '') {
  if (text && typeof text === 'string') {
    const reactResult = parseReactToolCall(text);
    if (reactResult) {
      if (reactResult.type === 'FINAL_ANSWER') return null;
      return reactResult;
    }

    const jsonToolCall = parseJsonToolCall(text);
    if (jsonToolCall) return jsonToolCall;

    // OPEN_APP: app name
    const openAppMatch = text.match(/OPEN_APP:\s*([^\n]+)/i);
    if (openAppMatch) {
      return {
        type: 'APP_ACTION',
        action: 'OPEN_APP',
        appName: openAppMatch[1].trim(),
        target: openAppMatch[1].trim()
      };
    }

    // FOCUS_APP: app name
    const focusAppMatch = text.match(/FOCUS_APP:\s*([^\n]+)/i);
    if (focusAppMatch) {
      return {
        type: 'APP_ACTION',
        action: 'FOCUS_APP',
        appName: focusAppMatch[1].trim(),
        target: focusAppMatch[1].trim()
      };
    }

    // OPEN_URL: https://...
    const openUrlMatch = text.match(/OPEN_URL:\s*([^\n]+)/i);
    if (openUrlMatch) {
      return {
        type: 'APP_ACTION',
        action: 'OPEN_URL',
        url: openUrlMatch[1].trim(),
        target: openUrlMatch[1].trim()
      };
    }

    // TYPE_TEXT: text
    const typeTextMatch = text.match(/TYPE_TEXT:\s*([\s\S]+)/i);
    if (typeTextMatch) {
      return {
        type: 'APP_ACTION',
        action: 'TYPE_TEXT',
        text: typeTextMatch[1].trim(),
        target: 'text input'
      };
    }

    // HOTKEY: ctrl+s
    const hotkeyMatch = text.match(/HOTKEY:\s*([^\n]+)/i);
    if (hotkeyMatch) {
      return {
        type: 'APP_ACTION',
        action: 'HOTKEY',
        keys: hotkeyMatch[1].trim(),
        target: hotkeyMatch[1].trim()
      };
    }

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

    // DOWNLOAD_FILE: query / url
    const downloadMatch = text.match(/DOWNLOAD_FILE:\s*([^\n]+)/i);
    if (downloadMatch) {
      return { type: 'DOWNLOAD_FILE', query: downloadMatch[1].trim(), target: downloadMatch[1].trim() };
    }

    // DELETE_FILE: path
    const deleteMatch = text.match(/DELETE_FILE:\s*([^\n]+)/i);
    if (deleteMatch) {
      return { type: 'DELETE_FILE', targetPath: deleteMatch[1].trim(), target: deleteMatch[1].trim() };
    }

    // CLICK: x, y
    const clickMatch = text.match(/CLICK:\s*(\d+)\s*,\s*(\d+)/i);
    if (clickMatch) {
      return { type: 'APP_ACTION', action: 'CLICK', x: parseInt(clickMatch[1], 10), y: parseInt(clickMatch[2], 10) };
    }

    // RIGHT_CLICK: x, y
    const rightClickMatch = text.match(/RIGHT_CLICK:\s*(\d+)\s*,\s*(\d+)/i);
    if (rightClickMatch) {
      return { type: 'APP_ACTION', action: 'RIGHT_CLICK', x: parseInt(rightClickMatch[1], 10), y: parseInt(rightClickMatch[2], 10) };
    }

    // SCROLL: delta
    const scrollMatch = text.match(/SCROLL:\s*([-\d]+)/i);
    if (scrollMatch) {
      return { type: 'APP_ACTION', action: 'SCROLL', delta: parseInt(scrollMatch[1], 10) || 300 };
    }
  }

  // Fallback Intent Steerer for small offline models (e.g. tinyllama)
  if (userPrompt) {
    return detectFallbackToolCall(userPrompt);
  }

  return null;
}

function getToolTargetLabel(toolCall) {
  if (!toolCall) return '';
  return String(toolCall.target || toolCall.appName || toolCall.url || toolCall.path || toolCall.keys || toolCall.action || toolCall.type || '').trim();
}

// Short, human-readable step label for the task plan (Cursor-style todos)
function humanizeToolCallLabel(toolCall) {
  if (!toolCall) return 'Run action';
  const trim = (s, n = 40) => {
    const str = String(s || '').trim();
    return str.length > n ? `${str.substring(0, n)}...` : str;
  };
  if (toolCall.type === 'APP_ACTION') {
    switch (String(toolCall.action || '').toUpperCase()) {
      case 'OPEN_APP': return `Open ${trim(toolCall.appName || toolCall.target)}`;
      case 'FOCUS_APP': return `Switch to ${trim(toolCall.appName || toolCall.target)}`;
      case 'OPEN_URL': return `Open ${trim(toolCall.url || toolCall.target)}`;
      case 'OPEN_FILE': {
        const pathLabel = trim(toolCall.path || toolCall.target);
        const leaf = pathLabel.split(/[\\/]/).filter(Boolean).pop() || pathLabel;
        return `Go to ${leaf}`;
      }
      case 'TYPE_TEXT': return `Type "${trim(toolCall.text, 30)}"`;
      case 'HOTKEY': return `Press ${trim(toolCall.keys)}`;
      case 'CLICK': return toolCall.targetDesc ? `Click "${trim(toolCall.targetDesc, 30)}"` : `Click at (${toolCall.x}, ${toolCall.y})`;
      case 'RIGHT_CLICK': return toolCall.targetDesc ? `Right-click "${trim(toolCall.targetDesc, 30)}"` : `Right-click at (${toolCall.x}, ${toolCall.y})`;
      case 'DOUBLE_CLICK': return toolCall.targetDesc ? `Double-click "${trim(toolCall.targetDesc, 30)}"` : `Double-click at (${toolCall.x}, ${toolCall.y})`;
      case 'MOUSE_MOVE':
      case 'MOVE_MOUSE': return `Move mouse to (${toolCall.x}, ${toolCall.y})`;
      case 'SCROLL': return 'Scroll the page';
      case 'WAIT': return 'Wait for the app';
      case 'LIST_APPS': return 'List installed apps';
      default: return trim(toolCall.action);
    }
  }
  switch (toolCall.type) {
    case 'APP_SEQUENCE': return 'Run app steps';
    case 'CAPTURE_SCREEN': return 'Check the screen';
    case 'EXECUTE': {
      const cmd = trim(toolCall.target, 48);
      if (/^mkdir/i.test(cmd)) {
        const pathMatch = cmd.match(/mkdir\s+"([^"]+)"/i);
        const leaf = pathMatch ? pathMatch[1].split(/[\\/]/).filter(Boolean).pop() : 'folder';
        return `Create folder "${leaf}"`;
      }
      return `Run command: ${cmd}`;
    }
    case 'WRITE_FILE': return `Write ${trim(toolCall.targetPath || toolCall.target, 36)}`;
    case 'READ_FILE': return `Read ${trim(toolCall.target, 36)}`;
    case 'DELETE_FILE': return `Delete ${trim(toolCall.targetPath || toolCall.target, 36)}`;
    case 'DOWNLOAD_FILE':
    case 'FETCH_IMAGE': return `Download ${trim(toolCall.query || toolCall.target, 36)}`;
    case 'LIST_DIR': return `List folder ${trim(toolCall.target, 32)}`;
    case 'SEARCH': return `Search the web: ${trim(toolCall.target, 30)}`;
    case 'WEB_FETCH': return `Fetch page: ${trim(toolCall.target || toolCall.url, 40)}`;
    default: return trim(toolCall.type);
  }
}

function getAppActivityVerb(toolCall) {
  const labels = {
    OPEN_APP: 'Opening',
    FOCUS_APP: 'Switching to',
    TYPE_TEXT: 'Typing in',
    HOTKEY: 'Sending shortcut to',
    CLICK: 'Clicking in',
    RIGHT_CLICK: 'Right-clicking in',
    DOUBLE_CLICK: 'Double-clicking in',
    MOUSE_MOVE: 'Moving in',
    SCROLL: 'Scrolling in',
    WAIT: 'Waiting for'
  };
  return labels[String(toolCall && toolCall.action || '').toUpperCase()]
    || humanizeToolCallLabel(toolCall);
}

let _activeAgentApp = { name: '', icon: '' };

const RESERVED_TOOL_NAMES = new Set([
  'OPEN_APP', 'FOCUS_APP', 'OPEN_URL', 'OPEN_FILE', 'WRITE_FILE', 'READ_FILE',
  'LIST_DIR', 'EXECUTE', 'SEARCH', 'WEB_FETCH', 'TYPE_TEXT', 'HOTKEY', 'CLICK',
  'DOUBLE_CLICK', 'SCROLL', 'WAIT', 'CAPTURE_SCREEN', 'APP_SEQUENCE', 'LIST_APPS'
]);

function promptWantsFileCreation(userPrompt) {
  const p = String(userPrompt || '').toLowerCase();
  return (/\b(createa?|creat|make|new|write)\b/i.test(p) && /\bfile\b/i.test(p))
    || (/\bfile\b/i.test(p) && /\b(named|called)\b/i.test(p) && /\b(create|make|write)\b/i.test(p));
}

function promptWantsFolderCreation(userPrompt) {
  const p = String(userPrompt || '').toLowerCase();
  if (/\bfile\b/i.test(p)) return false;
  return /\b(createa?|creat|make|new|mkdir)\s+(a\s+)?(folder|directory)\b/i.test(userPrompt)
    || (/\b(folder|directory)\b/i.test(p) && /\b(named|called)\b/i.test(p) && /\b(create|make|new)\b/i.test(p));
}

function extractFolderNameFromPrompt(userPrompt, stopWords = new Set()) {
  const patterns = [
    /(?:folder|directory)\s+(?:named|called)\s+["']?([a-zA-Z0-9_\-\.]+)["']?/i,
    /(?:named|called)\s+["']?([a-zA-Z0-9_\-\.]+)["']?(?:\s+for|\s+in|\s+on|\s*$)/i,
    /(?:createa?|creat|make|new|mkdir)\s+(?:a\s+)?(?:folder|directory)\s+(?:named|called)?\s*["']?([a-zA-Z0-9_\-\.]+)["']?/i
  ];
  for (const re of patterns) {
    const match = userPrompt.match(re);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (candidate && !stopWords.has(candidate.toLowerCase()) && !RESERVED_TOOL_NAMES.has(candidate.toUpperCase())) {
        return candidate;
      }
    }
  }
  return 'new_folder';
}

function buildMkdirFromPrompt(userPrompt, dirs = {}) {
  const userHome = dirs.homeDir || (_cachedSystemEnv && _cachedSystemEnv.homeDir) || 'C:\\Users\\vedan';
  const desktopDir = dirs.desktop || `${userHome}\\Desktop`;
  const documentsDir = dirs.documents || `${userHome}\\Documents`;
  const downloadsDir = dirs.downloads || `${userHome}\\Downloads`;
  const stopWords = new Set(['for', 'me', 'a', 'the', 'my', 'new', 'some', 'please', 'on', 'in', 'at', 'to', 'it', 'us']);
  const folderName = extractFolderNameFromPrompt(userPrompt, stopWords);
  const parentDir = resolveFolderTargetFromPrompt(userPrompt) || desktopDir;
  const targetPath = `${parentDir}\\${folderName}`;
  return {
    type: 'EXECUTE',
    target: `mkdir "${targetPath}"`
  };
}

function claimsDesktopTaskCompleted(text) {
  const t = String(text || '');
  return /\b(has been created|have been created|was created|is now ready|successfully created|i('ve| have) created|folder.*created|file.*created|created for you|created within|now ready to be used)\b/i.test(t);
}

/** Detects "here is how you do it yourself" answers — an autonomous agent
 *  must execute the task, not hand the user a manual. */
function answersWithManualSteps(text) {
  const t = String(text || '');
  return /\b(open file explorer|file explorer by pressing|windows key\s*\+\s*e|follow these steps|here are the steps|here's the steps|step by step|click on the view tab|sort the files by size|navigate to your)\b/i.test(t);
}

function modelAnsweredWithoutExecuting(userPrompt, finalText, executedActions = [], intent = 'action') {
  if (intent !== 'action' || executedActions.length > 0) return false;
  if (!hasDesktopActionCues(userPrompt)) return false;
  return claimsDesktopTaskCompleted(finalText) || answersWithManualSteps(finalText);
}

function extractFileNameFromPrompt(userPrompt, stopWords = new Set()) {
  const patterns = [
    /(?:file|document)\s+(?:named|called)\s+["']?([a-zA-Z0-9_\-\.]+)["']?/i,
    /(?:named|called)\s+["']?([a-zA-Z0-9_\-\.]+)["']?/i,
    /(?:createa?|creat|make|new|write)\s+(?:a\s+)?file\s+(?:named|called)?\s*["']?([a-zA-Z0-9_\-\.]+)["']?/i
  ];
  for (const re of patterns) {
    const match = userPrompt.match(re);
    if (match && match[1]) {
      const candidate = match[1].trim();
      if (candidate && !stopWords.has(candidate.toLowerCase()) && !RESERVED_TOOL_NAMES.has(candidate.toUpperCase())) {
        return candidate.includes('.') ? candidate : `${candidate}.txt`;
      }
    }
  }
  return 'new_file.txt';
}

function buildWriteFileFromPrompt(userPrompt, dirs = {}) {
  const userHome = dirs.homeDir || (_cachedSystemEnv && _cachedSystemEnv.homeDir) || 'C:\\Users\\vedan';
  const desktopDir = dirs.desktop || `${userHome}\\Desktop`;
  const documentsDir = dirs.documents || `${userHome}\\Documents`;
  const downloadsDir = dirs.downloads || `${userHome}\\Downloads`;
  const stopWords = new Set(['for', 'me', 'a', 'the', 'my', 'new', 'some', 'please', 'on', 'in', 'at', 'to', 'it', 'us', 'folder']);
  const fileName = extractFileNameFromPrompt(userPrompt, stopWords);
  const folder = resolveFolderTargetFromPrompt(userPrompt) || desktopDir;
  const targetPath = `${folder}\\${fileName}`;
  return {
    type: 'WRITE_FILE',
    targetPath,
    content: `Created by Ultron on ${new Date().toLocaleString()}`,
    target: targetPath
  };
}

function isInvalidAppToolCall(toolCall) {
  if (!toolCall || toolCall.type !== 'APP_ACTION') return false;
  if (!['OPEN_APP', 'FOCUS_APP'].includes(String(toolCall.action || '').toUpperCase())) return false;
  const appName = String(toolCall.appName || toolCall.target || '').trim();
  if (!appName) return true;
  const upper = appName.toUpperCase();
  return RESERVED_TOOL_NAMES.has(upper) || upper === String(toolCall.action || '').toUpperCase();
}

function sanitizeParsedToolCall(toolCall, userPrompt = '') {
  if (!toolCall) return null;
  if (isInvalidAppToolCall(toolCall)) {
    const fallback = detectFallbackToolCall(userPrompt);
    return fallback || null;
  }
  if (toolCall.type === 'APP_ACTION' && ['OPEN_APP', 'FOCUS_APP'].includes(String(toolCall.action || '').toUpperCase())) {
    const appName = String(toolCall.appName || toolCall.target || '').trim();
    if (!appName || RESERVED_TOOL_NAMES.has(appName.toUpperCase())) {
      return detectFallbackToolCall(userPrompt);
    }
  }
  if (toolCall.type === 'WRITE_FILE' && !toolCall.targetPath) {
    return buildWriteFileFromPrompt(userPrompt);
  }
  return toolCall;
}

async function enrichToolCallAppPresentation(toolCall) {
  if (!toolCall || toolCall.type !== 'APP_ACTION') return;
  const action = String(toolCall.action || '').toUpperCase();
  if (['OPEN_APP', 'FOCUS_APP'].includes(action) && window.ultronAPI.resolveAppName) {
    try {
      const resolved = await window.ultronAPI.resolveAppName(toolCall.appName || toolCall.target);
      if (resolved && resolved.success && resolved.match) {
        toolCall.appName = resolved.match.name;
        toolCall.target = resolved.match.name;
        toolCall.appIcon = resolved.match.icon || '';
        _activeAgentApp = { name: resolved.match.name, icon: resolved.match.icon || '' };
        return;
      }
    } catch (e) {}
  }
  if (['TYPE_TEXT', 'HOTKEY', 'CLICK', 'DOUBLE_CLICK', 'SCROLL', 'WAIT'].includes(action) && _activeAgentApp.name) {
    toolCall.appName = toolCall.appName || _activeAgentApp.name;
    toolCall.appIcon = toolCall.appIcon || _activeAgentApp.icon;
  }
}

function parseJsonToolCall(text) {
  const candidates = [];
  const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson) candidates.push(fencedJson[1]);

  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const tool = String(parsed.tool || parsed.type || parsed.action || '').toUpperCase();
      const args = parsed.args || parsed.arguments || parsed;
      if (!tool) continue;

      if (tool === 'APP_SEQUENCE' && Array.isArray(args.actions)) {
        return {
          type: 'APP_SEQUENCE',
          actions: args.actions.map(action => ({
            action: String(action.action || action.tool || '').toUpperCase(),
            appName: action.appName || action.app || action.name,
            url: action.url,
            path: action.path || action.filePath,
            text: action.text,
            keys: action.keys || action.hotkey,
            ms: action.ms,
            target: action.appName || action.app || action.name || action.url || action.path || action.text || action.keys || action.action
          })).filter(action => action.action),
          target: 'app sequence'
        };
      }

      if (['OPEN_APP', 'FOCUS_APP', 'OPEN_URL', 'OPEN_FILE', 'TYPE_TEXT', 'HOTKEY', 'WAIT', 'LIST_APPS', 'CLICK', 'DOUBLE_CLICK', 'SCROLL'].includes(tool)) {
        const appName = args.appName || args.app || args.name || '';
        if (['OPEN_APP', 'FOCUS_APP'].includes(tool) && !appName) {
          continue;
        }
        return {
          type: 'APP_ACTION',
          action: tool,
          appName,
          url: args.url,
          path: args.path || args.filePath,
          text: args.text,
          keys: args.keys || args.hotkey,
          ms: args.ms,
          x: args.x,
          y: args.y,
          targetDesc: args.target || args.element || args.description || '',
          delta: args.delta || args.amount,
          target: appName || args.url || args.path || args.text || args.keys || ''
        };
      }

      if (tool === 'CAPTURE_SCREEN') {
        return {
          type: 'CAPTURE_SCREEN',
          mode: args.mode || 'screen',
          windowTitle: args.windowTitle || args.appName || args.title || '',
          target: args.windowTitle || args.appName || 'screen'
        };
      }

      if (['EXECUTE', 'READ_FILE', 'LIST_DIR', 'SEARCH', 'WEB_FETCH'].includes(tool)) {
        return {
          type: tool,
          target: args.command || args.path || args.query || args.url || args.target || '',
          url: args.url || ''
        };
      }

      if (tool === 'WRITE_FILE') {
        return {
          type: 'WRITE_FILE',
          targetPath: args.path || args.filePath,
          content: args.content || '',
          target: args.path || args.filePath || 'file'
        };
      }
    } catch (e) {}
  }

  return null;
}

function detectFallbackToolCall(userPrompt, executedActions = []) {
  if (!userPrompt || typeof userPrompt !== 'string') return null;
  const p = userPrompt.toLowerCase().trim();
  const executedUpper = (executedActions || []).map(a => String(a || '').toUpperCase());

  // Use cached system environment for dynamic paths
  const dirs = (_cachedSystemEnv && _cachedSystemEnv.keyDirectories) || {};
  const userHome = (_cachedSystemEnv && _cachedSystemEnv.homeDir) || 'C:\\Users\\vedan';
  const desktopDir = dirs.desktop || `${userHome}\\Desktop`;
  const documentsDir = dirs.documents || `${userHome}\\Documents`;
  const downloadsDir = dirs.downloads || `${userHome}\\Downloads`;
  const stopWords = new Set(['for', 'me', 'a', 'the', 'my', 'new', 'some', 'please', 'on', 'in', 'at', 'to', 'it', 'us']);

  const domainMap = {
    claude: 'https://claude.ai',
    chatgpt: 'https://chatgpt.com',
    openai: 'https://chatgpt.com',
    gemini: 'https://gemini.google.com',
    youtube: 'https://www.youtube.com',
    google: 'https://www.google.com',
    github: 'https://github.com',
    gmail: 'https://mail.google.com',
    calendar: 'https://calendar.google.com',
    reddit: 'https://www.reddit.com',
    twitter: 'https://x.com',
    x: 'https://x.com',
    spotify: 'https://open.spotify.com',
    netflix: 'https://www.netflix.com',
    amazon: 'https://www.amazon.com',
    wikipedia: 'https://www.wikipedia.org'
  };

  // Play song / video / music on YouTube
  const playYoutubeMatch = userPrompt.match(/\b(?:play|search(?:\s+for)?|listen\s+to)\s+(?:a\s+|the\s+)?(?:song|video|music|track)?\s*(?:named|called)?\s*["']?(.+?)["']?\s+on\s+youtube\b/i)
    || userPrompt.match(/\b(?:on\s+youtube)\s+(?:play|search(?:\s+for)?)\s+["']?(.+?)["']?$/i);
  if (playYoutubeMatch && !executedUpper.includes('OPEN_URL')) {
    const rawSong = playYoutubeMatch[1].replace(/\b(play|song|named|called|video|music|on|youtube)\b/gi, '').trim();
    const songQuery = rawSong || playYoutubeMatch[1].trim();
    const ytUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(songQuery)}`;
    return {
      type: 'APP_ACTION',
      action: 'OPEN_URL',
      url: ytUrl,
      target: `YouTube: "${songQuery}"`
    };
  }

  // Play / search music on Spotify
  const playSpotifyMatch = userPrompt.match(/\b(?:play|search(?:\s+for)?|listen\s+to)\s+(?:a\s+|the\s+)?(?:song|music|track)?\s*(?:named|called)?\s*["']?(.+?)["']?\s+on\s+spotify\b/i);
  if (playSpotifyMatch && !executedUpper.includes('OPEN_URL')) {
    const songQuery = playSpotifyMatch[1].trim();
    const spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(songQuery)}`;
    return {
      type: 'APP_ACTION',
      action: 'OPEN_URL',
      url: spotifyUrl,
      target: `Spotify: "${songQuery}"`
    };
  }

  // Search on Google
  const googleSearchMatch = userPrompt.match(/\b(?:search(?:\s+for)?|google)\s+["']?(.+?)["']?\s+on\s+google\b/i);
  if (googleSearchMatch && !executedUpper.includes('OPEN_URL')) {
    const q = googleSearchMatch[1].trim();
    const gUrl = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
    return {
      type: 'APP_ACTION',
      action: 'OPEN_URL',
      url: gUrl,
      target: `Google Search: "${q}"`
    };
  }

  // Direct website navigation (e.g. "go to claude's website and logout...")
  const siteNavMatch = userPrompt.match(/\b(?:go\s+to|navigate\s+to|visit|head\s+to|browse\s+to|open)\s+(?:the\s+)?([a-zA-Z0-9_\-\.]+?)(?:'s|\s+)?\s*(?:website|site|page|app)?(?:\s+and\s+|\s+then\s+|$)/i);
  if (siteNavMatch && !executedUpper.includes('OPEN_URL') && !p.includes('folder') && !p.includes('directory')) {
    const siteKey = siteNavMatch[1].toLowerCase().replace(/['s]/g, '').trim();
    if (siteKey && domainMap[siteKey]) {
      return {
        type: 'APP_ACTION',
        action: 'OPEN_URL',
        url: domainMap[siteKey],
        target: `${siteKey} website`
      };
    } else if (siteKey && siteKey.includes('.')) {
      const url = siteKey.startsWith('http') ? siteKey : `https://${siteKey}`;
      return { type: 'APP_ACTION', action: 'OPEN_URL', url, target: url };
    }
  }

  // Download asset, logo, image, or document from web
  const downloadMatch = userPrompt.match(/\b(download|get|fetch|save)\s+(?:a\s+|the\s+)?([a-zA-Z0-9_\-\s.]+?)(?:\s+logo|\s+image|\s+icon|\s+for\s+me|\s+from\s+web|\s+to\s+my\s+pc|$)/i);
  if (downloadMatch && !executedUpper.includes('DOWNLOAD_FILE') && !p.includes('folder') && !p.includes('directory')) {
    const rawTarget = downloadMatch[2].trim();
    if (rawTarget && !stopWords.has(rawTarget.toLowerCase()) && !/^(file|document|app|folder|page)$/i.test(rawTarget)) {
      const isLogo = /\b(logo|icon|image|avatar|brand)\b/i.test(userPrompt);
      const ext = isLogo ? 'svg' : 'png';
      const cleanName = `${rawTarget.replace(/\s+/g, '_').toLowerCase()}${isLogo && !rawTarget.includes('logo') ? '_logo' : ''}.${ext}`;
      const targetPath = `${downloadsDir}\\${cleanName}`;
      return {
        type: 'DOWNLOAD_FILE',
        query: `${rawTarget}${isLogo && !rawTarget.includes('logo') ? ' logo' : ''}`,
        filename: cleanName,
        targetPath,
        target: targetPath
      };
    }
  }

  // Delete / Remove file or directory
  const deleteMatch = userPrompt.match(/\b(delete|remove|erase|unlink)\s+(?:the\s+|file\s+|folder\s+)?(["'][^"']+["']|[a-zA-Z0-9_\-\\.:/]+)/i);
  if (deleteMatch && !executedUpper.includes('DELETE_FILE')) {
    const targetFile = deleteMatch[2].replace(/["']/g, '').trim();
    if (targetFile && !stopWords.has(targetFile.toLowerCase())) {
      return { type: 'DELETE_FILE', target: targetFile, targetPath: targetFile };
    }
  }

  // Direct mouse scroll request
  if (/\b(scroll down|scroll up|scroll)\b/i.test(userPrompt) && !executedUpper.includes('SCROLL')) {
    const isUp = /\b(scroll up|upward|up)\b/i.test(userPrompt);
    const amount = isUp ? -300 : 300;
    return { type: 'APP_ACTION', action: 'SCROLL', delta: amount, target: `${amount}px` };
  }

  const folderTarget = resolveFolderTargetFromPrompt(userPrompt);
  const wantsNavigation = Boolean(folderTarget)
    && /\b(go to|navigate|head to|take me to|browse to|open folder|and go)\b/i.test(userPrompt);

  // Standalone folder navigation (e.g. follow-up "go to downloads now")
  if ((wantsNavigation || (/\b(open|show)\b/i.test(userPrompt) && folderTarget))
      && folderTarget
      && !/\b(file explorer|windows explorer|explorer)\b/i.test(userPrompt)) {
    return {
      type: 'APP_ACTION',
      action: 'OPEN_FILE',
      path: folderTarget,
      target: folderTarget
    };
  }

  // Create file — before folder logic ("in downloads folder" is a location, not mkdir)
  if (promptWantsFileCreation(userPrompt) && !executedUpper.includes('WRITE_FILE')) {
    return buildWriteFileFromPrompt(userPrompt, { desktop: desktopDir, documents: documentsDir, downloads: downloadsDir, homeDir: userHome });
  }

  // Create folder — fast, direct mkdir (no LLM needed)
  if (promptWantsFolderCreation(userPrompt) && !executedUpper.includes('EXECUTE')) {
    return buildMkdirFromPrompt(userPrompt, { desktop: desktopDir, documents: documentsDir, downloads: downloadsDir, homeDir: userHome });
  }

  const appAliases = [
    ['obs studio', 'OBS Studio'],
    ['obs', 'OBS Studio'],
    ['notepad', 'Notepad'],
    ['file explorer', 'File Explorer'],
    ['windows explorer', 'File Explorer'],
    ['explorer', 'File Explorer'],
    ['settings', 'Settings'],
    ['chrome', 'Google Chrome'],
    ['google chrome', 'Google Chrome'],
    ['edge', 'Microsoft Edge'],
    ['microsoft edge', 'Microsoft Edge'],
    ['vscode', 'Visual Studio Code'],
    ['vs code', 'Visual Studio Code'],
    ['visual studio code', 'Visual Studio Code'],
    ['obsidian', 'Obsidian'],
    ['powershell', 'PowerShell'],
    ['command prompt', 'Command Prompt'],
    ['cmd', 'Command Prompt'],
    ['whatsapp', 'WhatsApp'],
    ['telegram', 'Telegram'],
    ['discord', 'Discord'],
    ['slack', 'Slack']
  ];

  const findPromptAppName = () => {
    const direct = userPrompt.match(/(?:open|launch|start|focus|switch to)\s+([a-zA-Z0-9 +._-]+?)(?:\s+and|\s+then|\s+to\s+type|\s+with\s+text|$)/i);
    if (direct) {
      const raw = direct[1].trim();
      const alias = appAliases.find(([key]) => raw.toLowerCase().includes(key));
      return alias ? alias[1] : raw;
    }
    const alias = appAliases.find(([key]) => p.includes(key));
    return alias ? alias[1] : '';
  };

  const quotedTextMatch = userPrompt.match(/(?:type|write|enter|paste)\s+["']([^"']+)["']/i);
  const typedTextMatch = quotedTextMatch
    || userPrompt.match(/(?:type|write|enter|paste)\s+(.+?)(?:\s+in\s+|\s+into\s+|\s+on\s+|$)/i);
  const typedText = typedTextMatch ? typedTextMatch[1].trim() : '';
  const requiresGeneratedText =
    /\b\d+\s+(quotes?|ideas?|sentences?|paragraphs?|examples?|names?|captions?|headlines?)\b/i.test(userPrompt)
    || /\b(write|draft|compose|create)\s+(an?\s+)?(essay|article|story|poem|letter|email|report|summary|speech|blog|code|script)\b/i.test(userPrompt);

  // Extract explicit URL or known domain
  let matchedUrl = '';
  const rawUrlMatch = userPrompt.match(/https?:\/\/[^\s]+/i);
  if (rawUrlMatch) {
    matchedUrl = rawUrlMatch[0];
  } else {
    for (const [key, domainUrl] of Object.entries(domainMap)) {
      if (new RegExp(`\\b${key}\\b`, 'i').test(p)) {
        matchedUrl = domainUrl;
        break;
      }
    }
  }

  const hasExecutedOpenApp = executedUpper.some(a => a.includes('OPEN_APP') || a.includes('CHROME') || a.includes('EDGE') || a.includes('NOTEPAD'));
  const hasExecutedOpenUrl = executedUpper.some(a => a.includes('OPEN_URL') || a.includes('HTTP'));

  // If app is already opened and prompt requested opening a URL / website:
  if (hasExecutedOpenApp && matchedUrl && !hasExecutedOpenUrl) {
    return { type: 'APP_ACTION', action: 'OPEN_URL', url: matchedUrl, target: matchedUrl };
  }

  // If app is already opened and prompt requested typing text:
  if (hasExecutedOpenApp && typedText && !executedUpper.includes('TYPE_TEXT')) {
    const appName = findPromptAppName() || _activeAgentApp.name || '';
    return { type: 'APP_ACTION', action: 'TYPE_TEXT', text: typedText, appName, target: appName || 'text input' };
  }

  // If app is already opened and prompt requested saving:
  if (hasExecutedOpenApp && /\b(save|save it|save changes)\b/i.test(userPrompt) && !executedUpper.includes('HOTKEY')) {
    return { type: 'APP_ACTION', action: 'HOTKEY', keys: ['ctrl', 's'], target: 'Ctrl+S' };
  }

  // File Explorer + optional folder navigation
  if (/\b(file explorer|windows explorer|my files|this pc)\b/i.test(userPrompt)) {
    if (folderTarget && (wantsNavigation || /\b(download|document|desktop|folder|directory)\b/i.test(p))) {
      return {
        type: 'APP_SEQUENCE',
        target: `File Explorer → ${folderTarget}`,
        actions: [
          { action: 'OPEN_APP', appName: 'File Explorer', target: 'File Explorer' },
          { action: 'WAIT', ms: 900, target: '900ms' },
          { action: 'OPEN_FILE', path: folderTarget, target: folderTarget }
        ]
      };
    }
    if (!hasExecutedOpenApp) {
      return { type: 'APP_ACTION', action: 'OPEN_APP', appName: 'File Explorer', target: 'File Explorer' };
    }
  }

  if (/\b(open|show|go to)\s+(settings|windows settings)\b/i.test(userPrompt)) {
    return { type: 'EXECUTE', target: 'start ms-settings:' };
  }

  // "open whatsapp and send a message named hi to vedant wankhade"
  if (window.UltronCommandParser && typeof window.UltronCommandParser.tryParseToToolCall === 'function') {
    const sendParsed = window.UltronCommandParser.tryParseToToolCall(userPrompt);
    if (sendParsed && sendParsed.type === 'APP_SEQUENCE' && sendParsed._parsedBy === 'rule') {
      return sendParsed;
    }
  }

  // "write the bill of 200 in notepad for fuel" — no explicit "open" required
  const writeInAppMatch = userPrompt.match(
    /\b(write|type)\s+(.+?)\s+in\s+(notepad(?:\+\+)?|word|chrome|google chrome|edge|microsoft edge|vscode|vs code|visual studio code|file explorer|powershell|command prompt|cmd)\b/i
  );
  if (writeInAppMatch && !requiresGeneratedText && !hasExecutedOpenApp) {
    const text = writeInAppMatch[2].trim();
    const appRaw = writeInAppMatch[3].trim().toLowerCase();
    const alias = appAliases.find(([key]) => appRaw === key || appRaw.includes(key));
    const appName = alias ? alias[1] : writeInAppMatch[3].trim();
    if (text && appName) {
      return {
        type: 'APP_SEQUENCE',
        target: `${appName} → type text`,
        actions: [
          { action: 'OPEN_APP', appName, target: appName },
          { action: 'WAIT', ms: 1000, target: '1000ms' },
          { action: 'TYPE_TEXT', text, appName, target: appName }
        ]
      };
    }
  }

  // Read file with explicit path
  const pathMatch = userPrompt.match(/([A-Za-z]:\\[^\s"']+|(?:desktop|documents|downloads)[/\\][^\s"']+)/i);
  if (pathMatch && /\b(read|open|show|parse|view|content of)\b/i.test(userPrompt) && !executedUpper.includes('READ_FILE')) {
    const filePath = pathMatch[1].replace(/\//g, '\\');
    let resolved = filePath;
    if (!/^[A-Za-z]:\\/.test(resolved)) {
      const base = filePath.toLowerCase().startsWith('desktop') ? desktopDir
        : filePath.toLowerCase().startsWith('documents') ? documentsDir
        : filePath.toLowerCase().startsWith('downloads') ? downloadsDir
        : desktopDir;
      resolved = `${base}\\${filePath.replace(/^[^\\]+\\?/, '')}`;
    }
    return { type: 'READ_FILE', target: resolved, targetPath: resolved };
  }

  if (/\b(list|show)\s+(files|folders|contents)\b/i.test(userPrompt) && !executedUpper.includes('LIST_DIR')) {
    const listDir = p.includes('document') ? documentsDir : p.includes('download') ? downloadsDir : desktopDir;
    return { type: 'LIST_DIR', target: listDir };
  }

  // Desktop app launch / Sequence control
  if (/\b(open|launch|start|focus|switch to)\b/i.test(userPrompt)) {
    const appName = findPromptAppName();

    // Chained: open browser AND open website
    if (appName && matchedUrl && !hasExecutedOpenApp && !hasExecutedOpenUrl) {
      return {
        type: 'APP_SEQUENCE',
        target: `${appName} → ${matchedUrl}`,
        actions: [
          { action: 'OPEN_APP', appName, target: appName },
          { action: 'WAIT', ms: 800, target: '800ms' },
          { action: 'OPEN_URL', url: matchedUrl, target: matchedUrl }
        ]
      };
    }

    if (matchedUrl && !hasExecutedOpenUrl && (!appName || hasExecutedOpenApp)) {
      return { type: 'APP_ACTION', action: 'OPEN_URL', url: matchedUrl, target: matchedUrl };
    }

    if (appName && !hasExecutedOpenApp) {
      if (typedText && !requiresGeneratedText) {
        return {
          type: 'APP_SEQUENCE',
          target: `${appName} then type text`,
          actions: [
            { action: 'OPEN_APP', appName, target: appName },
            { action: 'WAIT', ms: 900, target: '900ms' },
            { action: 'TYPE_TEXT', text: typedText, appName, target: appName }
          ]
        };
      }
      return { type: 'APP_ACTION', action: 'OPEN_APP', appName, target: appName };
    }
  }

  if (/\b(type|paste|enter)\b/i.test(userPrompt) && typedText && !executedUpper.includes('TYPE_TEXT')) {
    const appName = findPromptAppName() || _activeAgentApp.name || '';
    return { type: 'APP_ACTION', action: 'TYPE_TEXT', text: typedText, appName, target: appName || 'text input' };
  }

  // Helper: resolve target location from prompt
  function resolveLocation(defaultPath) {
    if (/download|downlaod|downlod/i.test(p)) return downloadsDir;
    if (/document|documet/i.test(p)) return documentsDir;
    if (/\bdesktop\b/i.test(p)) return desktopDir;
    return defaultPath;
  }

  // Folder creation — only when user asked for a folder, not "in X folder" as location
  const wantsCreateFolder = /\b(create|make|new|mkdir)\s+(a\s+)?(folder|directory)\b/i.test(userPrompt)
    || /\b(folder|directory)\s+(?:named|called)\b/i.test(userPrompt);
  if (wantsCreateFolder && !/\bfile\b/i.test(userPrompt)) {
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

  // 3. Python Fibonacci code creation & execution (e.g. "write a python code that prints fibonacci series and run it")
  if (/\bfibonacci\b/i.test(p) && (p.includes('python') || p.includes('script') || p.includes('code')) && (p.includes('write') || p.includes('create') || p.includes('make') || p.includes('run') || p.includes('execute'))) {
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

  // Legacy file creation fallback
  if ((p.includes('create') || p.includes('make') || p.includes('write')) && (p.includes('file') || p.includes('document') || p.includes('txt'))) {
    return buildWriteFileFromPrompt(userPrompt, { desktop: desktopDir, documents: documentsDir, downloads: downloadsDir, homeDir: userHome });
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

function buildAgentToolPrompt(userPrompt, step, observation = '', options = {}) {
  if (window.UltronAgentPrompt && typeof window.UltronAgentPrompt.buildAgentToolExecutionPrompt === 'function') {
    return window.UltronAgentPrompt.buildAgentToolExecutionPrompt(userPrompt, step, observation, options);
  }

  return `User task:
${userPrompt}

Available tools. Use a tool ONLY when the user needs desktop/file/web action. If they asked for text, an essay, explanation, or ideas with no request to open apps or write files, answer in natural language with NO JSON and NO tools.

When an action is needed, output exactly one JSON object and nothing else:
{"tool":"OPEN_APP","args":{"appName":"Notepad"}}
{"tool":"FOCUS_APP","args":{"appName":"Google Chrome"}}
{"tool":"OPEN_URL","args":{"url":"https://example.com"}}
{"tool":"OPEN_FILE","args":{"path":"C:\\\\path\\\\file.txt"}}
{"tool":"TYPE_TEXT","args":{"text":"text to type into the currently focused app"}}
{"tool":"HOTKEY","args":{"keys":"ctrl+s"}}
{"tool":"CLICK","args":{"x":640,"y":480}}
{"tool":"CLICK","args":{"target":"the Send button"}}
{"tool":"DOUBLE_CLICK","args":{"x":640,"y":480}}
{"tool":"SCROLL","args":{"delta":-120}}
{"tool":"WAIT","args":{"ms":1000}}
{"tool":"READ_FILE","args":{"path":"C:\\\\path\\\\file.txt"}}
{"tool":"WRITE_FILE","args":{"path":"C:\\\\path\\\\file.txt","content":"file content"}}
{"tool":"LIST_DIR","args":{"path":"C:\\\\path"}}
{"tool":"SEARCH","args":{"query":"web search query"}}
{"tool":"WEB_FETCH","args":{"url":"https://example.com/page"}}
{"tool":"EXECUTE","args":{"command":"safe command"}}${options.canCaptureScreen ? '\n{"tool":"CAPTURE_SCREEN","args":{"mode":"screen"}}' : ''}

TOOL RULES:
- Prefer answering directly when no desktop action is required.
- Never narrate planned tool calls or show JSON/tool plans to the user as the answer.
- CLICK accepts exact {"x","y"} coordinates OR {"target":"element description"} — Ultron locates described elements on screen automatically (preferred when you have not observed exact coordinates).
- Only use CAPTURE_SCREEN when you must see the UI to complete a desktop task.
- For multi-step app work, do one step at a time unless a simple app open + type sequence is obvious.
- After the task is complete, respond normally without JSON.
${observation ? `\nLatest observation:\n${observation}\n\nContinue from that observation.` : `\nThis is step ${step}. Decide the next best tool call or final answer.`}`;
}

async function runSearchIntentFlow(userPrompt, aiBubble, loopImagePayloads, activitySteps, agentSubgoals, loopStartedAt, showTaskPlan) {
  // Never let attached-document bodies become a web-search query.
  const stripped = String(userPrompt || '').replace(/📄\s*\*\*Attached Document[\s\S]*?```/gi, '').trim();
  if (stripped) userPrompt = stripped;

  if (!userPrompt || userPrompt.trim().length < 3 || /^(search|find|google|look up|browse)$/i.test(userPrompt.trim())) {
    const clarMsg = "What would you like me to search for? Please provide a specific topic, question, or website name.";
    renderMessageContent(aiBubble, clarMsg);
    finalizeAiMessageBubble(aiBubble, clarMsg);
    appendChatMessage('Ultron', clarMsg, true, { skipRender: true });
    return;
  }

  const userName = getUserFullName();
  const researchEnabled = window.UltronAgentResearch
    && window.UltronAgentResearch.getResearchConfig().enabled;
  const useDeepResearch = researchEnabled
    && window.UltronAgentResearch.isDeepResearchRequest(userPrompt);

  renderSearchLiveStatus(aiBubble, agentSubgoals, useDeepResearch ? 'Planning multi-hop research...' : 'Thinking: Analyzing query & formulating targeted search...');
  await new Promise(resolve => setTimeout(resolve, 300));

  let searchResult = null;
  let searchQuery = '';
  let researchHops = [];

  try {
    if (useDeepResearch && typeof window.UltronAgentResearch.runDeepResearch === 'function') {
      const research = await window.UltronAgentResearch.runDeepResearch(userPrompt, {
        buildWebSearchQuery,
        searchWeb: (query, options) => window.ultronAPI.searchWeb(query, options),
        normalizeSearchPayload,
        queryLLM: (prompt, systemPrompt) => queryOfflineLLM(prompt, [], 'search', systemPrompt),
        onProgress: ({ hop, query, phase }) => {
          if (phase !== 'searching') return;
          renderSearchLiveStatus(aiBubble, agentSubgoals, `Research hop ${hop + 1}: ${query}`);
        }
      });
      searchResult = research.merged;
      researchHops = research.hops || [];
      searchQuery = researchHops.map(h => h.query).filter(Boolean).join(' → ') || userPrompt;
    } else {
      searchQuery = await buildWebSearchQuery(userPrompt);
      renderSearchLiveStatus(aiBubble, agentSubgoals, searchQuery);

      // Multi-query fan-out: broad questions split into focused queries,
      // results deduped by URL, ranked, top-3 fully extracted, cited.
      searchResult = await runFanOutWebSearch(userPrompt, searchQuery, activitySteps, (statusText) => {
        renderSearchLiveStatus(aiBubble, agentSubgoals, statusText);
      });
    }

    agentSubgoals.push({
      text: useDeepResearch
        ? `Deep research (${researchHops.length || 1} hop${researchHops.length === 1 ? '' : 's'})`
        : `Web Search: "${String(searchQuery).substring(0, 25)}"`,
      completed: true,
      status: 'completed'
    });
    activeSubgoals = agentSubgoals.map(s => ({ text: s.text, completed: s.completed, status: s.status }));
    renderChecklist(activeSubgoals);

    renderSearchLiveStatus(aiBubble, agentSubgoals, 'Analyzing live web results...');

    let finalResponse = '';
    if (shouldAskForSearchClarification(searchResult)) {
      finalResponse = searchResult.clarification || `I searched for "${searchQuery}", but the results were too thin to answer confidently. Can you add a brand, budget, location, or what kind of result you want?`;
    } else {
      const hopNote = useDeepResearch && researchHops.length > 1
        ? `\nResearch covered ${researchHops.length} search hops. Synthesize across all sources.`
        : '';
      finalResponse = await summarizeSearchAnswer(userPrompt, searchResult, searchQuery, {
        userName,
        imagePayloads: loopImagePayloads,
        hopNote
      });
    }

    agentSubgoals.push({ text: 'Task completed successfully', completed: true, status: 'completed' });
    activeSubgoals = agentSubgoals.map(s => ({ text: s.text, completed: s.completed, status: s.status }));
    renderChecklist(activeSubgoals);

    replaceProgressStepsOfType(activitySteps, 'SEARCH', {
      type: 'SEARCH',
      label: getAgentProgressMessage('SEARCH', { query: `${String(searchQuery).substring(0, 40)} (${searchResult.results?.length || 0} results)` }),
      isProgress: false
    });

    const searchExperienceMarkup = searchResult.results && searchResult.results.length > 0
      ? renderSearchExperience(finalResponse, searchResult)
      : finalResponse;

    const fullFinalContent = composeAgentFinalContent(showTaskPlan ? agentSubgoals : [], activitySteps, searchExperienceMarkup, Date.now() - loopStartedAt);
    await typeMessageResponse(aiBubble, fullFinalContent, { instant: true });
    appendChatMessage('Ultron', fullFinalContent, true, { skipRender: true });

    if (looksLikeAgentQuestion(finalResponse)) {
      playUltronSound('question');
    } else {
      playUltronSound('task_complete');
    }

    persistTaskMemory(`[SEARCH${useDeepResearch ? '/DEEP' : ''}] Query: "${String(searchQuery).substring(0, 40)}" -> ${finalResponse.substring(0, 60)}...`);
  } catch (e) {
    const errCard = `Web search failed: ${e.message}. Please try again.`;
    await typeMessageResponse(aiBubble, errCard, { instant: true });
    appendChatMessage('Ultron', errCard, true, { skipRender: true });
  }
}

async function runAgenticLoop(userPrompt, aiBubble, intent = 'action', imagePayloads = []) {
  // Content-only requests should never enter the tool/screen loop.
  if (isContentGenerationRequest(userPrompt) && !hasDesktopActionCues(userPrompt)) {
    renderMessageContent(aiBubble, composeAgentLiveContent(getAgentShimmerLineHtml('Writing')));
    const raw = await queryOfflineLLM(userPrompt, [], 'conversation', null, imagePayloads || []);
    const answer = (isCodeOnlyGenerationRequest(userPrompt)
      ? sanitizeCodeGenerationResponse(raw || '', userPrompt)
      : sanitizeResponseText(raw || '', userPrompt)) || "I'm ready to help — could you rephrase that?";
    const fullFinalContent = composeAgentFinalContent([], [], answer, 0);
    await typeMessageResponse(aiBubble, fullFinalContent, { instant: true });
    appendChatMessage('Ultron', fullFinalContent, true, { skipRender: true });
    return answer;
  }

  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.findWorkflowByPrompt === 'function') {
    const workflow = window.UltronAgentMemory.findWorkflowByPrompt(userPrompt);
    if (workflow && workflow.steps && workflow.steps.length) {
      userPrompt = typeof window.UltronAgentMemory.workflowToAgentPrompt === 'function'
        ? window.UltronAgentMemory.workflowToAgentPrompt(workflow)
        : `${userPrompt}\n\n[Run workflow "${workflow.name}": ${workflow.steps.join(' then ')}]`;
      logTrace(`Running saved workflow: ${workflow.name}`, 'system');
    }
  }

  if (window.UltronAgentSegmentation && window.UltronAgentSegmentation.isCompoundPrompt(userPrompt)) {
    const segments = window.UltronAgentSegmentation.segmentUserPrompt(userPrompt);
    if (segments.length > 1) {
      userPrompt = window.UltronAgentSegmentation.buildSegmentedAgentPrompt(segments, 0);
      logTrace(`Multi-step request: running segment 1 of ${segments.length}`, 'system');
    }
  }

  if (window.UltronDialogueState && typeof window.UltronDialogueState.updateFromTurn === 'function') {
    window.UltronDialogueState.updateFromTurn(userPrompt);
  }

  // Ensure desktop connectors (UIA) are ready before first tool call
  if (hasDesktopActionCues(userPrompt) || intent === 'action') {
    const autoReady = await ensureDesktopAutomationReady();
    if (autoReady.uia && !autoReady.already) {
      await refreshMcpConnectorBadges();
    }
  }

  let steps = 0;
  const agentRuntime = getAgentRuntimeSettings();
  const maxSteps = agentRuntime.maxTurns || 10;
  if (window.UltronLoopGuard) {
    window.UltronLoopGuard.configure(agentRuntime.loopGuard || {});
    window.UltronLoopGuard.reset();
  }
  const loopStartedAt = Date.now();
  let loopImagePayloads = mergeImagePayloads(imagePayloads || []);
  let hasVisualContext = loopImagePayloads.length > 0;
  const skillsSnippet = buildAgentSkillsSnippet(userPrompt);
  const mcpSnippet = (window.UltronMcpTools && typeof window.UltronMcpTools.getMcpToolsSnippet === 'function')
    ? await window.UltronMcpTools.getMcpToolsSnippet()
    : '';
  let currentPrompt = buildAgentToolPrompt(userPrompt, 1, '', { hasVisualContext, canCaptureScreen: isScreenCaptureEnabled() && needsScreenCaptureForTask(userPrompt) });
  if (skillsSnippet) currentPrompt += skillsSnippet;
  if (window.UltronDialogueState && typeof window.UltronDialogueState.getPromptSnippet === 'function') {
    currentPrompt += window.UltronDialogueState.getPromptSnippet();
  }
  const sessionFollowUp = getRecentSessionContextSnippet(4);
  if (sessionFollowUp && isFollowUpAboutPriorTurn(userPrompt)) {
    currentPrompt = `${sessionFollowUp}\n\n${currentPrompt}`;
  }
  let accumulatedContext = [];
  let isDone = false;
  let finalResponse = '';
  const executedAppActions = [];
  let completionNudges = 0;
  let plannerRetries = 0;
  let playbookLearned = false;
  let showTaskPlan = false;

  const userName = getUserFullName();
  const sysEnv = await getSystemContext();
  const realtime = buildRealtimeContext(sysEnv);
  const memorySnippet = getLearnedMemorySnippet() + (await getRagKnowledgeSnippet(userPrompt));
  const canCaptureScreen = isScreenCaptureEnabled() && needsScreenCaptureForTask(userPrompt);

  let agentSubgoals = [];
  let activitySteps = [];

  // Planner-first: multi-step prompts get a visible step graph before the
  // model's first action. Simple requests skip planning entirely.
  let agentStepPlan = null;
  if (window.UltronAgentPlanner && intent === 'action' && window.UltronAgentPlanner.needsPlanning(userPrompt)) {
    agentStepPlan = window.UltronAgentPlanner.buildStepPlan(userPrompt);
    if (agentStepPlan.length > 1) {
      agentSubgoals = window.UltronAgentPlanner.planToSubgoals(agentStepPlan);
      showTaskPlan = true;
      logTrace(`Planner produced ${agentStepPlan.length} steps for multi-step request`, 'system');

      // Generate structured implementation_plan.md artifact in workspace
      const planMd = `# Implementation Plan\n\n## Goal Description\nExecute autonomous multi-step workflow for:\n> ${userPrompt}\n\n## Proposed Steps\n${agentStepPlan.map((s, i) => `${i + 1}. **${s.title}** (\`${s.tool_hint}\`)\n   - Target: \`${s.tool_hint}\`\n   - Status: Pending`).join('\n')}\n\n## Verification & Safety\n- Verify UI element positions before clicking.\n- Automatically check focus and window status.\n- Protect system directories and prompt for permission on destructive actions.\n\n---\n*Ultron is executing these planned steps autonomously.*`;

      if (window.UltronCanvasArtifacts && typeof window.UltronCanvasArtifacts.mergeFilesIntoWorkspace === 'function') {
        window.UltronCanvasArtifacts.mergeFilesIntoWorkspace([{
          name: 'implementation_plan.md',
          content: planMd,
          language: 'markdown',
          type: 'markdown'
        }], { defaultMode: 'markdown' });
      }

      // Auto-index into RAG in background
      if (window.ultronAPI && window.ultronAPI.ragIndexText) {
        window.ultronAPI.ragIndexText({
          id: `plan-${Date.now()}`,
          title: `Implementation Plan: ${userPrompt.slice(0, 40)}`,
          content: planMd,
          metadata: { type: 'plan', prompt: userPrompt }
        }).catch(() => {});
      }
    } else {
      agentStepPlan = null;
    }
  }

  // Cursor-style first frame: think first. Do not invent or expose a task plan
  // until the model has selected its first action.
  activeSubgoals = [];
  renderChecklist(showTaskPlan ? agentSubgoals : []);
  // Sidebar no longer auto-opens when agent starts — user controls visibility
  renderAgentLiveContent(aiBubble, {
    widgetsHtml: showTaskPlan ? renderTaskWidgetHtml(agentSubgoals) : '',
    shimmerText: 'Thinking'
  });

  if (loopImagePayloads.length > 0) pushAgentProgressStep(activitySteps, 'MEDIA');

  if (isScreenCaptureEnabled() && intent === 'action' && needsScreenCaptureForTask(userPrompt)) {
    await ensureVisionModelForScreen();
    pushAgentProgressStep(activitySteps, 'SCREEN');
    if (canUseScreenAnalysis()) {
      const initialShot = await captureScreenForAgent({ label: 'initial' });
      if (initialShot) {
        loopImagePayloads = mergeImagePayloads(loopImagePayloads, [initialShot]);
        hasVisualContext = loopImagePayloads.length > 0;
        activitySteps.push({
          type: 'SCREEN',
          label: 'Captured the screen',
          thumbnail: initialShot.thumbnailDataUrl
        });
        currentPrompt = buildAgentToolPrompt(userPrompt, 1, 'Initial desktop screenshot captured and attached.', { hasVisualContext, canCaptureScreen });
      }
    } else {
      const ocr = await readScreenTextForAgent({ label: 'initial-ocr' });
      if (ocr) {
        const visibleText = String(ocr.text || '').slice(0, 12000);
        activitySteps.push({
          type: 'SCREEN',
          label: 'Read visible screen text with Windows OCR',
          thumbnail: ocr.thumbnailDataUrl
        });
        currentPrompt = buildAgentToolPrompt(
          userPrompt,
          1,
          `Windows OCR visible text:\n${visibleText || '[No readable text found]'}`,
          { hasVisualContext: false, canCaptureScreen }
        );
      }
    }
  }

  const agentSystemPrompt = resolveAgentSystemPrompt(
    buildAgentPromptContext(sysEnv, realtime, userName, memorySnippet, hasVisualContext, skillsSnippet, mcpSnippet)
  );

  // If intent is 'search', run web search (single-hop or deep multi-hop research)
  if (intent === 'search') {
    await runSearchIntentFlow(userPrompt, aiBubble, loopImagePayloads, activitySteps, agentSubgoals, loopStartedAt, showTaskPlan);
    return;
  }

  while (steps < maxSteps && !isDone) {
    steps++;

    // Check if user clicked the stop button
    if (_activeAbortController && _activeAbortController.signal.aborted) {
      activitySteps.push({ type: 'STOPPED', label: 'Stopped by user' });
      finalResponse = 'Generation stopped.';
      isDone = true;
      break;
    }

    logTrace(`Agent Loop Step ${steps}/${maxSteps}...`, 'system');

    const thinkingStartedAt = Date.now();
    let toolCall = null;
    let rawResponse = '';

    // Fast path: rule parser (Vayu) or file/folder creation — skip LLM when deterministic
    if (steps === 1 && window.UltronCommandParser && window.UltronCommandParser.canUseRuleParser(userPrompt)) {
      const parsed = window.UltronCommandParser.tryParseToToolCall(userPrompt);
      if (parsed) {
        toolCall = parsed;
        activitySteps.push({
          type: 'THINKING',
          label: `Plan: ${humanizeToolCallLabel(toolCall)}`
        });
        activitySteps.push({
          type: 'EXECUTE',
          label: `Direct: ${humanizeToolCallLabel(toolCall)}`
        });
        logTrace(`Rule-based parser handled: ${humanizeToolCallLabel(toolCall)}`, 'system');
      }
    }
    if (steps === 1 && !toolCall) {
      toolCall = detectFallbackToolCall(userPrompt);
      if (toolCall) {
        activitySteps.push({
          type: 'THINKING',
          label: `Plan: ${humanizeToolCallLabel(toolCall)}`
        });
        activitySteps.push({
          type: 'EXECUTE',
          label: `Direct: ${humanizeToolCallLabel(toolCall)}`
        });
        logTrace(`Fallback parser handled: ${humanizeToolCallLabel(toolCall)}`, 'system');
      }
    }

    if (toolCall && steps === 1) {
      renderAgentLiveContent(aiBubble, {
        widgetsHtml: `${showTaskPlan ? renderTaskWidgetHtml(agentSubgoals, deriveTaskPlanTitle(userPrompt)) : ''}${renderActivityFeedHtml(activitySteps)}`,
        shimmerText: humanizeToolCallLabel(toolCall)
      });
    }

    if (!toolCall) {
    renderAgentLiveContent(aiBubble, {
      widgetsHtml: `${showTaskPlan ? renderTaskWidgetHtml(agentSubgoals, deriveTaskPlanTitle(userPrompt)) : ''}${renderActivityFeedHtml(activitySteps)}`,
      shimmerText: 'Thinking'
    });

    // 1. Query LLM for next step/action
    try {
      rawResponse = await queryOfflineLLM(currentPrompt, accumulatedContext, intent, agentSystemPrompt, loopImagePayloads);
    } catch (llmErr) {
      if (llmErr.name === 'AbortError' || (_activeAbortController && _activeAbortController.signal.aborted)) {
        activitySteps.push({ type: 'STOPPED', label: 'Stopped by user' });
        finalResponse = '';
        isDone = true;
        break;
      }
      throw llmErr;
    }
    if (!rawResponse || typeof rawResponse !== 'string') {
      rawResponse = '';
    }

    // Replace the live "deciding..." entry with a Cursor-style timed line
    const agentThought = extractReactThought(rawResponse);
    if (agentThought) {
      activitySteps.push({
        type: 'THINKING',
        label: agentThought.length > 140 ? `${agentThought.slice(0, 137)}…` : agentThought
      });
      renderAgentLiveContent(aiBubble, {
        widgetsHtml: `${showTaskPlan ? renderTaskWidgetHtml(agentSubgoals, deriveTaskPlanTitle(userPrompt)) : ''}${renderActivityFeedHtml(activitySteps)}`,
        shimmerText: 'Planning next step'
      });
      await new Promise(resolve => setTimeout(resolve, 350));
    } else {
      activitySteps.push({
        type: 'THINKING',
        label: `Thought for ${formatWorkDuration(Date.now() - thinkingStartedAt)}`
      });
    }
    } // end if (!toolCall) — LLM planning block

    if (!toolCall) {
    // The auto-selected vision model could not load (out of memory): revert to
    // the previous text model and keep the task going without screenshots.
    if (isModelLoadFailureResponse(rawResponse) && revertVisionModelSwitch('out of memory')) {
      loopImagePayloads = [];
      hasVisualContext = false;
      activitySteps.push({
        type: 'ERROR',
        label: `Vision model did not fit in memory — continuing with ${activeModel} (no screen analysis).`
      });
      currentPrompt = buildAgentToolPrompt(userPrompt, steps, 'Screen analysis is unavailable on this system right now. Complete the task without screenshots.', { hasVisualContext: false, canCaptureScreen: false });
      rawResponse = await queryOfflineLLM(currentPrompt, accumulatedContext, intent, agentSystemPrompt, []);
      if (!rawResponse || typeof rawResponse !== 'string') {
        rawResponse = '';
      }
    }

    rawResponse = rawResponse.replace(/\[your_name\]|\[Your Name\]|<your name>|\[Agent Name\]/gi, "Brown");

    if (!toolCall) {
    const reactFinalAnswer = extractReactFinalAnswer(rawResponse);
    if (reactFinalAnswer) {
      const expectsDesktopWork = hasDesktopActionCues(userPrompt) || intent === 'action';
      const unfinishedWork = hasUnfinishedExplicitTask(userPrompt, executedAppActions, agentStepPlan);
      const shouldForceTool = expectsDesktopWork
        && (executedAppActions.length === 0 || unfinishedWork)
        && (isInstructionalFinalAnswer(reactFinalAnswer) || unfinishedWork || /\b(open|launch|start|read|write|list|go to|navigate|download|downlaod|create|folder|mkdir|file)\b/i.test(userPrompt));

      if (shouldForceTool && completionNudges < 3) {
        if (agentStepPlan && window.UltronAgentPlanner?.getNextPendingPlanStep) {
          const nextPending = window.UltronAgentPlanner.getNextPendingPlanStep(agentStepPlan);
          if (nextPending) {
            toolCall = window.UltronAgentPlanner.resolveToolCallForPlanStep(nextPending, userPrompt, executedAppActions, _cachedSystemEnv);
          }
        }
        if (!toolCall) {
          toolCall = detectFallbackToolCall(userPrompt, executedAppActions);
        }
        if (toolCall) {
          completionNudges++;
          activitySteps.push({
            type: 'EXECUTE',
            label: humanizeToolCallLabel(toolCall)
          });
        } else {
          isDone = true;
          finalResponse = sanitizeResponseText(reactFinalAnswer, userPrompt);
          if (!finalResponse.trim()) finalResponse = "Done. Let me know if you need anything else.";
          break;
        }
      } else if (unfinishedWork && completionNudges < 3) {
        completionNudges++;
        if (agentStepPlan && window.UltronAgentPlanner?.getNextPendingPlanStep) {
          const nextPending = window.UltronAgentPlanner.getNextPendingPlanStep(agentStepPlan);
          if (nextPending) {
            toolCall = window.UltronAgentPlanner.resolveToolCallForPlanStep(nextPending, userPrompt, executedAppActions, _cachedSystemEnv);
          }
        }
        if (!toolCall) {
          toolCall = detectFallbackToolCall(userPrompt, executedAppActions);
        }
        if (!toolCall) {
          accumulatedContext.push({ role: 'assistant', content: rawResponse });
          accumulatedContext.push({ role: 'user', content: buildMissingActionInstruction(userPrompt, executedAppActions) });
          currentPrompt = `${buildAgentToolPrompt(userPrompt, steps + 1, 'Do not give Final Answer until every requested step is done.', { hasVisualContext, canCaptureScreen })}\n\n${buildMissingActionInstruction(userPrompt, executedAppActions)}`;
          activitySteps.push({ type: 'THINKING', label: 'Continuing the unfinished request' });
          continue;
        }
      } else if (expectsDesktopWork && executedAppActions.length === 0 && completionNudges < 3) {
        toolCall = detectFallbackToolCall(userPrompt, executedAppActions);
        if (toolCall) {
          completionNudges++;
          activitySteps.push({ type: 'EXECUTE', label: humanizeToolCallLabel(toolCall) });
        } else if (isWebSearchEnabled() && (isFactualOrCurrentEventsQuery(userPrompt) || isInformationalOrHowToQuery(userPrompt) || shouldFallbackToWebSearch(userPrompt, reactFinalAnswer))) {
          logTrace('Informational or knowledge query in agent loop — falling back to live web search.', 'system');
          return await runSearchIntentFlow(userPrompt, aiBubble, loopImagePayloads, activitySteps, agentSubgoals, loopStartedAt, showTaskPlan);
        } else if (reactFinalAnswer && reactFinalAnswer.trim().length > 20 && !claimsDesktopTaskCompleted(reactFinalAnswer)) {
          isDone = true;
          finalResponse = sanitizeResponseText(reactFinalAnswer, userPrompt);
          break;
        } else {
          isDone = true;
          finalResponse = "I couldn't run that on your PC — the model answered without executing anything. Try rephrasing, e.g. `create a folder named vedant in downloads`.";
          break;
        }
      } else if (expectsDesktopWork && executedAppActions.length === 0 && claimsDesktopTaskCompleted(reactFinalAnswer)) {
        isDone = true;
        finalResponse = "**That didn't actually run on your computer.** The model claimed success without creating anything. Try again — Ultron will run the command directly.";
        break;
      } else {
        isDone = true;
        finalResponse = sanitizeResponseText(reactFinalAnswer, userPrompt);
        if (!finalResponse.trim()) finalResponse = "Done. Let me know if you need anything else.";
        break;
      }
    }

    // 2. Parse for tool calls (with fallback intent steerer for small models like tinyllama)
    if (!toolCall) {
      toolCall = parseAgentToolCall(rawResponse, userPrompt);
    }
    toolCall = sanitizeParsedToolCall(toolCall, userPrompt);

    if (!toolCall && agentStepPlan && window.UltronAgentPlanner?.getNextPendingPlanStep) {
      const nextPending = window.UltronAgentPlanner.getNextPendingPlanStep(agentStepPlan);
      if (nextPending) {
        toolCall = window.UltronAgentPlanner.resolveToolCallForPlanStep(nextPending, userPrompt, executedAppActions, _cachedSystemEnv);
      }
    }

    if (!toolCall && (!rawResponse || !rawResponse.trim())) {
      toolCall = detectFallbackToolCall(userPrompt, executedAppActions);
    }

    if (!toolCall) {
      const expectsDesktopWork = hasDesktopActionCues(userPrompt) || intent === 'action';
      if (expectsDesktopWork && executedAppActions.length === 0 && completionNudges < 2) {
        completionNudges++;
        toolCall = detectFallbackToolCall(userPrompt, executedAppActions);
      }
    }

    if (!toolCall) {
      if (hasUnfinishedExplicitTask(userPrompt, executedAppActions, agentStepPlan) && completionNudges < 2) {
        completionNudges++;
        const missingInstruction = buildMissingActionInstruction(userPrompt, executedAppActions);
        accumulatedContext.push({ role: 'assistant', content: rawResponse || '(no tool call)' });
        accumulatedContext.push({ role: 'user', content: missingInstruction });
        currentPrompt = `${buildAgentToolPrompt(userPrompt, steps + 1, 'The previous response stopped before completing all requested app actions.', { hasVisualContext, canCaptureScreen })}

${missingInstruction}`;
        activitySteps.push({ type: 'THINKING', label: 'Continuing the unfinished request' });
        continue;
      }
      // No tool calls and no explicit work remains
      if (hasDesktopActionCues(userPrompt) && executedAppActions.length === 0 && completionNudges < 3) {
        const fallback = detectFallbackToolCall(userPrompt, executedAppActions);
        if (fallback) {
          toolCall = fallback;
          completionNudges++;
          activitySteps.push({ type: 'EXECUTE', label: humanizeToolCallLabel(fallback) });
        }
      }
    }

    if (!toolCall) {
      isDone = true;
      finalResponse = sanitizeResponseText(rawResponse || '', userPrompt);
      if (modelAnsweredWithoutExecuting(userPrompt, finalResponse, executedAppActions, intent)) {
        finalResponse = "**That didn't actually run on your computer.** The model answered without executing anything. Try again — Ultron will run the command directly.";
      } else if (!finalResponse.trim()) {
        if (hasDesktopActionCues(userPrompt) && executedAppActions.length === 0) {
          finalResponse = "I couldn't complete that desktop task — the model didn't choose a tool. Try rephrasing with explicit steps (e.g. \"open Notepad and type hello\") or switch to **phi3** / **gemma2** in the model dropdown.";
        } else {
          finalResponse = "Done. Let me know if you need anything else.";
        }
      }
      break;
    }
    }
    } // end if (!toolCall) — parse / fallback block

    // 3. Execute tool based on tool type
    await enrichToolCallAppPresentation(toolCall);
    const toolTargetLabel = getToolTargetLabel(toolCall);
    logTrace(`Agent Action Step ${steps}: Executing ${toolCall.type} (${toolTargetLabel.substring(0, 40)}...)`, 'local');

    if (window.UltronLoopGuard) {
      const guardVerdict = window.UltronLoopGuard.checkCall(toolCall);
      if (guardVerdict.warned) {
        activitySteps.push({ type: 'THINKING', label: `Loop warning: ${guardVerdict.reason}` });
      }
      if (guardVerdict.blocked) {
        const guardRecovery = (window.UltronAgentPlanner && typeof window.UltronAgentPlanner.getRecoveryStrategy === 'function')
          ? window.UltronAgentPlanner.getRecoveryStrategy(toolCall, { errorCode: 'LOOP_BLOCKED' }).note
          : '';
        accumulatedContext.push({ role: 'assistant', content: rawResponse });
        accumulatedContext.push({
          role: 'user',
          content: `[Loop Guard]: ${guardVerdict.reason}${guardRecovery ? ` Re-plan: ${guardRecovery}` : ''} Try a different tool or approach, or give the Final Answer if the task is complete.`
        });
        if (window.UltronLoopGuard.compressContext) {
          accumulatedContext = window.UltronLoopGuard.compressContext(
            accumulatedContext,
            agentRuntime.contextWindowMessages
          );
        }
        currentPrompt = buildAgentToolPrompt(userPrompt, steps + 1, guardVerdict.reason, { hasVisualContext, canCaptureScreen });
        continue;
      }
    }

    if (agentSubgoals.length === 0) {
      showTaskPlan = shouldCreateAgentTaskPlan(userPrompt, toolCall);
      agentSubgoals = showTaskPlan
        ? buildAgentTaskPlan(userPrompt, toolCall)
        : [{
            action: toolCall.type === 'APP_ACTION' ? String(toolCall.action || '').toUpperCase() : toolCall.type,
            text: humanizeToolCallLabel(toolCall),
            completed: false,
            status: 'pending'
          }];
    }

    const actionKey = toolCall.type === 'APP_ACTION'
      ? String(toolCall.action || '').toUpperCase()
      : String(toolCall.type || '').toUpperCase();
    let currentSubgoal = toolCall.type === 'APP_SEQUENCE'
      ? agentSubgoals.find(task => !task.completed && task.status !== 'failed')
      : agentSubgoals.find(task => task.action === actionKey && !task.completed && task.status !== 'failed');
    if (!currentSubgoal) {
      currentSubgoal = {
        action: actionKey,
        text: humanizeToolCallLabel(toolCall),
        completed: false,
        status: 'pending'
      };
      agentSubgoals.push(currentSubgoal);
    }
    if (toolCall.type !== 'APP_SEQUENCE') {
      currentSubgoal.text = humanizeToolCallLabel(toolCall);
      currentSubgoal.status = 'in_progress';
    }

    const progressCategory = toolCall.type === 'APP_ACTION' ? (toolCall.action || 'APP') : toolCall.type;
    activitySteps.push({
      type: progressCategory,
      appName: toolCall.appName || '',
      appIcon: toolCall.appIcon || '',
      label: toolCall.type === 'APP_ACTION'
        ? getAppActivityVerb(toolCall)
        : getAgentProgressMessage(progressCategory, {
            appName: toolCall.appName || toolTargetLabel,
            command: toolCall.target,
            path: toolCall.targetPath || toolCall.target,
            keys: toolCall.keys,
            query: toolCall.target
          })
    });
    const actionProgressIndex = activitySteps.length - 1;

    activeSubgoals = agentSubgoals.map(s => ({ text: s.text, completed: s.completed, status: s.status }));
    renderChecklist(activeSubgoals);

    renderAgentLiveContent(aiBubble, {
      widgetsHtml: `${showTaskPlan ? renderTaskWidgetHtml(agentSubgoals, deriveTaskPlanTitle(userPrompt)) : ''}${renderActivityFeedHtml(activitySteps)}`,
      shimmerText: humanizeToolCallLabel(toolCall)
    });
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    let toolResult = '';
    let execResult = null;
    const withTimeout = (promise, ms = 15000) => {
      const timeout = new Promise(resolve => setTimeout(() => resolve({ success: false, error: `Execution Timed Out (${ms / 1000}s limit reached).` }), ms));
      return Promise.race([promise, timeout]);
    };

    const executor = window.UltronAgentExecutor;
    const schema = window.UltronToolSchema;

    if (toolCall.type === 'APP_SEQUENCE') {
      const results = [];
      for (const action of toolCall.actions || []) {
        const actionTool = { type: 'APP_ACTION', ...action };
        await enrichToolCallAppPresentation(actionTool);
        const sequenceTask = agentSubgoals.find(task =>
          task.action === String(action.action || '').toUpperCase()
          && !task.completed
          && task.status !== 'failed'
        );
        if (sequenceTask) {
          sequenceTask.status = 'in_progress';
          activeSubgoals = agentSubgoals.map(task => ({ ...task }));
          renderChecklist(activeSubgoals);
          renderAgentLiveContent(aiBubble, {
            widgetsHtml: `${showTaskPlan ? renderTaskWidgetHtml(agentSubgoals) : ''}${renderActivityFeedHtml(activitySteps)}`,
            shimmerText: humanizeToolCallLabel(actionTool)
          });
        }
        const stepResult = executor
          ? await executor.executeAgentToolCall(actionTool, { withTimeout, canCaptureScreen })
          : schema.normalizeToolResult(await withTimeout(window.ultronAPI.appAction(actionTool), 20000));
        results.push(`${action.action}: ${stepResult.success ? stepResult.message : `failed - ${stepResult.message}`}`);
        if (stepResult.success) executedAppActions.push(String(action.action || '').toUpperCase());
        if (window.UltronAgentMemory && typeof window.UltronAgentMemory.recordAppOutcome === 'function' && ['OPEN_APP', 'FOCUS_APP'].includes(String(action.action || '').toUpperCase())) {
          window.UltronAgentMemory.recordAppOutcome(action.appName || action.target, stepResult.success);
        }
        if (sequenceTask) {
          sequenceTask.completed = stepResult.success;
          sequenceTask.status = stepResult.success ? 'completed' : 'failed';
        }
        if (!stepResult.success) break;
      }
      toolResult = results.join('\n');
      const failedResult = results.find(result => result.includes('failed -'));
      finalResponse = failedResult
        ? `I couldn't complete the app workflow. ${failedResult.replace(/^[A-Z_]+:\s*/, '')}`
        : (resolveFolderTargetFromPrompt(userPrompt)
          ? `Opened **File Explorer** and navigated to the requested folder.`
          : `Completed the requested actions${_activeAgentApp.name ? ` in **${_activeAgentApp.name}**` : ''}.`);
      isDone = true;
    } else if (toolCall.type === 'WEB_FETCH') {
      if (executor && typeof executor.isWebSearchEnabled === 'function' && !executor.isWebSearchEnabled()) {
        finalResponse = renderErrorRecoveryCard('SEARCH_DISABLED', 'Web fetch is disabled. Enable web search from the + menu.');
        isDone = true;
      } else {
      const pageUrl = toolCall.url || toolCall.target || '';
      pushAgentProgressStep(activitySteps, 'WEB_FETCH', { url: pageUrl });
      renderMessageContent(aiBubble, composeAgentLiveContent(
        showTaskPlan ? renderTaskWidgetHtml(agentSubgoals) : '',
        renderActivityFeedHtml(activitySteps),
        getWebSearchCardHtml(`Fetching ${pageUrl}`)
      ));
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

      let pageContent = '';
      if (window.UltronMcpTools && typeof window.UltronMcpTools.fetchPageMarkdown === 'function') {
        pageContent = await window.UltronMcpTools.fetchPageMarkdown(pageUrl) || '';
      }
      if (!pageContent) {
        finalResponse = `Could not fetch content from ${pageUrl}. Check the URL or your network connection.`;
      } else {
        toolResult = pageContent.slice(0, 12000);
        const summarySystemPrompt = `You are Brown in a direct 1-on-1 conversation.
Summarize or answer using ONLY the fetched page content below.
Never include raw URLs in the body. Be concise and structured.`;
        const summaryPrompt = `User request:
${userPrompt}

Page URL:
${pageUrl}

Fetched content:
${toolResult}

Write the final answer now.`;
        const summary = await queryOfflineLLM(summaryPrompt, [], 'conversation', summarySystemPrompt, loopImagePayloads);
        finalResponse = sanitizeResponseText(summary || toolResult.slice(0, 2000), userPrompt);
      }
      isDone = true;
      }
    } else if (toolCall.type === 'SEARCH') {
      const searchSource = resolveSearchQuerySource(toolCall.target, userPrompt);
      const searchTarget = await buildWebSearchQuery(searchSource.query);
      activitySteps[actionProgressIndex].label = getAgentProgressMessage('SEARCH', { query: searchTarget });
      renderSearchLiveStatus(aiBubble, agentSubgoals, searchTarget, showTaskPlan);

      const searchRes = await withTimeout(window.ultronAPI.searchWeb(searchTarget), 20000);
      const searchPayload = normalizeSearchPayload(searchRes, searchTarget);
      toolResult = searchContextForLLM(searchPayload) || `Web search failed.`;
      if (!shouldAskForSearchClarification(searchPayload)) {
        const answer = await summarizeSearchAnswer(userPrompt, searchPayload, searchTarget, {
          imagePayloads: loopImagePayloads
        });
        finalResponse = renderSearchExperience(answer, searchPayload);
      } else {
        finalResponse = searchPayload.clarification || `I searched for "${searchTarget}", but the results were too thin to answer confidently. Can you add a brand, budget, location, or what kind of result you want?`;
      }
      isDone = true;
    } else if (executor && ['APP_ACTION', 'CAPTURE_SCREEN', 'EXECUTE', 'WRITE_FILE', 'READ_FILE', 'LIST_DIR', 'SEARCH', 'WEB_FETCH', 'DELETE_FILE', 'DOWNLOAD_FILE', 'FETCH_IMAGE', 'SYSTEM_CONTROL', 'CLIPBOARD_ACTION', 'RAG_SEARCH'].includes(toolCall.type)) {
      if (toolCall.type === 'CAPTURE_SCREEN') await ensureVisionModelForScreen();

      // Vision-grounded clicking: resolve description-based click targets to
      // coordinates (see → decide → act) before execution.
      let preResolvedResult = null;
      if (toolCall.type === 'APP_ACTION'
        && ['CLICK', 'DOUBLE_CLICK', 'RIGHT_CLICK'].includes(String(toolCall.action || '').toUpperCase())
        && (!Number.isFinite(Number(toolCall.x)) || !Number.isFinite(Number(toolCall.y)))) {
        const clickDesc = String(toolCall.targetDesc || toolCall.element || toolCall.target || '').trim();
        if (clickDesc && !/^\s*\d+\s*[x,]\s*\d+\s*$/i.test(clickDesc)) {
          activitySteps.push({ type: 'VERIFY', label: `Locating "${clickDesc}" on screen`, ts: Date.now() });
          renderAgentLiveContent(aiBubble, {
            widgetsHtml: `${showTaskPlan ? renderTaskWidgetHtml(agentSubgoals, deriveTaskPlanTitle(userPrompt)) : ''}${renderActivityFeedHtml(activitySteps)}`,
            shimmerText: `Locating "${clickDesc}"`
          });
          const grounded = await clickByDescription(clickDesc);
          if (grounded && grounded.success && grounded.method === 'vision') {
            toolCall.x = grounded.x;
            toolCall.y = grounded.y;
            activitySteps.push({ type: 'SUCCESS', label: `Located "${clickDesc}" at (${grounded.x}, ${grounded.y})`, ts: Date.now() });
          } else if (grounded && grounded.success && grounded.method === 'uia') {
            // The UIA connector clicked the named element directly
            activitySteps.push({ type: 'SUCCESS', label: `Clicked "${clickDesc}" via UI Automation`, ts: Date.now() });
            preResolvedResult = { success: true, message: `Clicked "${clickDesc}" via UI Automation`, evidence: `UIA element "${clickDesc}" clicked` };
          } else {
            activitySteps.push({ type: 'ERROR', label: `Could not locate "${clickDesc}" on screen`, ts: Date.now() });
            preResolvedResult = { success: false, message: `Could not locate "${clickDesc}" on screen. Capture the screen to re-observe, try a keyboard shortcut (Tab + Enter), or ask the user where the element is.`, errorCode: 'CLICK_TARGET_NOT_FOUND' };
          }
        }
      }

      execResult = preResolvedResult || await executor.executeAgentToolCall(toolCall, {
        withTimeout,
        canCaptureScreen,
        captureScreenForAgent,
        activeAppName: _activeAgentApp.name
      });
      toolResult = schema ? schema.toolResultToObservation(execResult) : execResult.message;

      if (execResult.success) {
        if (window.UltronAgentPlanner && agentStepPlan) {
          const planActionKey = toolCall.type === 'APP_ACTION' ? String(toolCall.action || '').toUpperCase() : String(toolCall.type || '').toUpperCase();
          window.UltronAgentPlanner.markPlanStep(agentStepPlan, planActionKey, true);
        }
        if (toolCall.type === 'APP_ACTION') {
          executedAppActions.push(String(toolCall.action || '').toUpperCase());
          if (window.UltronAgentMemory && typeof window.UltronAgentMemory.recordAppOutcome === 'function') {
            const appName = execResult.resolvedApp || toolCall.appName || toolCall.target;
            window.UltronAgentMemory.recordAppOutcome(appName, true);
          }
          const appActionName = String(toolCall.action || '').toUpperCase();
          if (window.UltronAgentMemory && typeof window.UltronAgentMemory.registerArtifact === 'function') {
            if (appActionName === 'OPEN_URL' && (toolCall.url || toolCall.target)) {
              window.UltronAgentMemory.registerArtifact('web', toolCall.url || toolCall.target, { source: 'OPEN_URL', title: _activeAgentApp.name || '' });
            } else if (appActionName === 'OPEN_FILE' && (toolCall.path || toolCall.target)) {
              window.UltronAgentMemory.registerArtifact('file', toolCall.path || toolCall.target, { source: 'OPEN_FILE' });
            }
          }
          // Foreground verification after OPEN_APP/FOCUS_APP: never claim
          // success without evidence; auto-refocus once on mismatch.
          if (window.UltronAgentPlanner && ['OPEN_APP', 'FOCUS_APP'].includes(appActionName)) {
            const playbookApp = execResult.resolvedApp || toolCall.appName || toolCall.target;
            const playbookSnippet = window.UltronAgentPlanner.getPlaybookSnippet(playbookApp);
            if (playbookSnippet) toolResult += `\n${playbookSnippet}`;
            else if (appActionName === 'OPEN_APP' && playbookApp) {
              // First contact with this app: seed an empty playbook so it can
              // learn UI steps this session and reuse them in future sessions.
              window.UltronAgentPlanner.savePlaybook(playbookApp, [], 'seed');
            }
          }
          if (['OPEN_APP', 'FOCUS_APP'].includes(appActionName) && window.UltronAgentPlanner && !execResult._plannerVerified) {
            const verify = await window.UltronAgentPlanner.verifyActionResult(toolCall, execResult);
            if (!verify.verified && verify.retryHint) {
              activitySteps.push({ type: 'VERIFY', label: `Verifying focus: ${verify.evidence}` });
              const refocusCall = { type: 'APP_ACTION', action: 'FOCUS_APP', appName: toolCall.appName || toolCall.target };
              const refocusRes = await executor.executeAgentToolCall(refocusCall, { withTimeout, canCaptureScreen, captureScreenForAgent, activeAppName: _activeAgentApp.name });
              if (!refocusRes || !refocusRes.success) {
                toolResult += `\n[Verification warning: ${verify.evidence}]`;
              } else {
                activitySteps.push({ type: 'SUCCESS', label: `Refocused ${toolCall.appName || toolCall.target}` });
              }
            } else if (verify.verified && verify.evidence) {
              toolResult += `\n[Verified: ${verify.evidence}]`;
            }
          }
        } else if (toolCall.type === 'WRITE_FILE') {
          executedAppActions.push('WRITE_FILE');
          if (window.UltronAgentMemory && typeof window.UltronAgentMemory.registerArtifact === 'function') {
            window.UltronAgentMemory.registerArtifact('file', execResult.evidence || toolCall.targetPath, { source: 'WRITE_FILE' });
          }
          pushWrittenFileToWorkspace(toolCall.targetPath, toolCall.content);
        } else if (toolCall.type === 'DOWNLOAD_FILE' || toolCall.type === 'FETCH_IMAGE') {
          executedAppActions.push('DOWNLOAD_FILE');
          if (window.UltronAgentMemory && typeof window.UltronAgentMemory.registerArtifact === 'function') {
            window.UltronAgentMemory.registerArtifact('file', execResult.evidence || toolCall.targetPath, { source: 'DOWNLOAD_FILE' });
          }
        } else if (toolCall.type === 'DELETE_FILE') {
          executedAppActions.push('DELETE_FILE');
        } else if (toolCall.type === 'READ_FILE') {
          executedAppActions.push('READ_FILE');
        } else if (toolCall.type === 'LIST_DIR') {
          executedAppActions.push('LIST_DIR');
        }
        if (toolCall.type === 'CAPTURE_SCREEN' && execResult.raw && execResult.raw.shot) {
          const shot = execResult.raw.shot;
          loopImagePayloads = mergeImagePayloads(loopImagePayloads, [shot]);
          hasVisualContext = loopImagePayloads.length > 0;
          activitySteps.push({
            type: 'SCREEN',
            label: `Captured ${shot.sourceName || 'screen'} (${shot.width}x${shot.height})`,
            thumbnail: shot.thumbnailDataUrl
          });
          // Playbook learning: first screenshot of a freshly opened app with
          // an empty playbook → ask the vision model for basic usage steps.
          if (window.UltronAgentPlanner && _activeAgentApp.name && !playbookLearned) {
            const seededPb = window.UltronAgentPlanner.getPlaybook(_activeAgentApp.name);
            if (seededPb && (!seededPb.steps || !seededPb.steps.length)) {
              playbookLearned = true;
              try {
                const hint = await queryOfflineLLM(
                  `Look at this screenshot of ${_activeAgentApp.name}. List 3-5 very short basic usage steps for this app (one per line, imperative, no extra commentary).`,
                  [], 'conversation', 'You are a concise desktop automation assistant.', loopImagePayloads
                );
                const hintSteps = String(hint || '').split(/\n+/)
                  .map(s => s.replace(/^[\s\-*\d.)]+/, '').trim())
                  .filter(s => s && s.length > 3 && s.length < 90)
                  .slice(0, 6);
                if (hintSteps.length) {
                  window.UltronAgentPlanner.savePlaybook(_activeAgentApp.name, hintSteps, 'vision');
                  logTrace(`Learned playbook for ${_activeAgentApp.name}: ${hintSteps.length} steps`, 'system');
                }
              } catch (e) {}
            }
          }
          isDone = false;
        } else if (toolCall.type === 'WRITE_FILE') {
          finalResponse = `File created successfully on computer at **${execResult.evidence || toolCall.targetPath}**.${renderUndoActionCard()}`;
          pushWrittenFileToWorkspace(toolCall.targetPath, toolCall.content);
          if (toolCall.followUpCommand) {
            const execRes = await withTimeout(window.ultronAPI.executeAction({ command: toolCall.followUpCommand }));
            if (execRes.success) {
              toolResult += `\n\nExecution Output:\n\`\`\`text\n${execRes.stdout || 'Success (No Output)'}\n\`\`\``;
              finalResponse += `\n\n**Execution Output:**\n\`\`\`text\n${execRes.stdout || 'Done'}\n\`\`\``;
            }
          }
          isDone = !shouldContinueAgentLoopAfterTool(toolCall, userPrompt);
        } else if (toolCall.type === 'READ_FILE') {
          if (window.UltronAgentMemory && typeof window.UltronAgentMemory.registerArtifact === 'function') {
            const readPath = toolCall.target || toolCall.targetPath || toolCall.path || '';
            const readKind = /\b(resume|cv)\b/i.test(readPath) ? 'resume' : (/\.pdf$/i.test(readPath) ? 'pdf' : (/\.(jpe?g|png|webp|gif|bmp)$/i.test(readPath) ? 'image' : 'document'));
            window.UltronAgentMemory.registerArtifact(readKind, readPath, { source: 'READ_FILE', snippet: String(execResult.evidence || '').slice(0, 160) });
          }
          finalResponse = `${renderFileSourceCard(toolCall.target || toolCall.targetPath || toolCall.path || '', /\b(resume|cv)\b/i.test(String(toolCall.target || '')) ? 'resume' : (/\.pdf$/i.test(String(toolCall.target || '')) ? 'pdf' : 'document'), String(execResult.evidence || '').slice(0, 600))}
<div class="source-card-body-title">File Content</div>
<pre class="source-card-content">${escapeHtml(String(execResult.evidence || '').slice(0, 6000))}</pre>`;
          isDone = !shouldContinueAgentLoopAfterTool(toolCall, userPrompt);
        } else if (toolCall.type === 'LIST_DIR') {
          if (window.UltronAgentMemory && typeof window.UltronAgentMemory.registerArtifact === 'function') {
            window.UltronAgentMemory.registerArtifact('folder', toolCall.target || toolCall.targetPath || toolCall.path || '', { source: 'LIST_DIR' });
          }
          finalResponse = `${renderFileSourceCard(toolCall.target || toolCall.targetPath || toolCall.path || '', 'folder', String(execResult.evidence || '').slice(0, 600))}
<div class="source-card-body-title">Directory Contents</div>
<pre class="source-card-content">${escapeHtml(String(execResult.evidence || '').slice(0, 6000))}</pre>`;
          isDone = !shouldContinueAgentLoopAfterTool(toolCall, userPrompt);
        } else if (toolCall.type === 'EXECUTE') {
          executedAppActions.push('EXECUTE');
          if (toolCall.target.startsWith('mkdir')) {
            const path = toolCall.target.replace(/^mkdir\s+/i, '').replace(/^"|"$/g, '');
            if (window.UltronAgentMemory && typeof window.UltronAgentMemory.registerArtifact === 'function') {
              window.UltronAgentMemory.registerArtifact('folder', path, { source: 'EXECUTE_MKDIR' });
            }
            finalResponse = `Folder created at **${path}**.`;
          } else {
            finalResponse = execResult.message || 'Command completed.';
          }
          isDone = true;
        } else if (shouldContinueAgentLoopAfterTool(toolCall, userPrompt, executedAppActions) || hasUnfinishedExplicitTask(userPrompt, executedAppActions)) {
          isDone = false;
        } else if (toolCall.type === 'APP_ACTION' && toolCall.action === 'OPEN_APP') {
          if (hasUnfinishedExplicitTask(userPrompt, executedAppActions)) {
            isDone = false;
            finalResponse = '';
          } else {
            finalResponse = `Opened **${execResult.resolvedApp || toolCall.appName || toolCall.target}**.`;
            isDone = true;
          }
        } else if (toolCall.type === 'APP_ACTION' && toolCall.action === 'OPEN_FILE') {
          const folderName = (toolCall.path || toolCall.target || '').split(/[\\/]/).filter(Boolean).pop() || 'folder';
          finalResponse = hasUnfinishedExplicitTask(userPrompt, executedAppActions)
            ? ''
            : `Opened **${folderName}**.`;
          isDone = !hasUnfinishedExplicitTask(userPrompt, executedAppActions);
        } else {
          finalResponse = execResult.message;
          isDone = true;
        }
      } else {
        pushAgentProgressStep(activitySteps, 'ERROR');
        if (toolCall.type === 'APP_ACTION' && window.UltronAgentMemory && typeof window.UltronAgentMemory.recordAppOutcome === 'function') {
          window.UltronAgentMemory.recordAppOutcome(toolCall.appName || toolCall.target, false);
        }
        if (execResult.errorCode === 'APP_AMBIGUOUS') {
          finalResponse = renderClarifyAppCard(toolCall.appName || toolCall.target, execResult.suggestions);
          playUltronSound('question');
          isDone = true;
        } else if ((execResult.errorCode === 'APP_NOT_FOUND' || isInvalidAppToolCall(toolCall))
          && completionNudges < 3) {
          const fallback = detectFallbackToolCall(userPrompt);
          if (fallback) {
            completionNudges++;
            activitySteps.push({ type: 'THINKING', label: 'Retrying with direct fallback' });
            execResult = await executor.executeAgentToolCall(fallback, {
              withTimeout,
              canCaptureScreen,
              captureScreenForAgent,
              activeAppName: _activeAgentApp.name
            });
            toolCall = fallback;
            toolResult = schema ? schema.toolResultToObservation(execResult) : execResult.message;
            if (execResult.success) {
              if (fallback.type === 'WRITE_FILE') {
                executedAppActions.push('WRITE_FILE');
                if (window.UltronAgentMemory && typeof window.UltronAgentMemory.registerArtifact === 'function') {
                  window.UltronAgentMemory.registerArtifact('file', execResult.evidence || fallback.targetPath, { source: 'WRITE_FILE_FALLBACK' });
                }
                pushWrittenFileToWorkspace(fallback.targetPath, fallback.content);
                finalResponse = `File created successfully at **${execResult.evidence || fallback.targetPath}**.${renderUndoActionCard()}`;
              } else {
                finalResponse = execResult.message || 'Action completed.';
              }
              currentSubgoal.completed = true;
              currentSubgoal.status = 'completed';
              isDone = true;
            } else {
              finalResponse = renderErrorRecoveryCard(execResult.errorCode || 'EXEC_FAILED', execResult.message, execResult);
              isDone = true;
            }
          } else {
            const appRecovery = (window.UltronAgentPlanner && typeof window.UltronAgentPlanner.getRecoveryStrategy === 'function')
              ? window.UltronAgentPlanner.getRecoveryStrategy(toolCall, execResult)
              : null;
            if (appRecovery && appRecovery.toolCall && plannerRetries < 2) {
              plannerRetries++;
              // Mid-task insert: recovery revealed a missing app (e.g. needs a
              // browser → open Edge). Add that step to the live plan.
              if (window.UltronAgentPlanner && agentStepPlan
                && appRecovery.toolCall.type === 'APP_ACTION'
                && ['OPEN_APP', 'FOCUS_APP'].includes(String(appRecovery.toolCall.action || '').toUpperCase())) {
                window.UltronAgentPlanner.insertPlanStep(agentStepPlan, {
                  title: `Open ${appRecovery.toolCall.appName || 'alternative app'}`,
                  tool_hint: String(appRecovery.toolCall.action || 'OPEN_APP').toUpperCase()
                });
                agentSubgoals = window.UltronAgentPlanner.planToSubgoals(agentStepPlan);
                activeSubgoals = agentSubgoals.map(s => ({ text: s.text, completed: s.completed, status: s.status }));
                renderChecklist(activeSubgoals);
              }
              activitySteps.push({ type: 'THINKING', label: `Re-planning: ${appRecovery.note || 'trying an alternative'}` });
              const altResult = await executor.executeAgentToolCall(appRecovery.toolCall, {
                withTimeout,
                canCaptureScreen,
                captureScreenForAgent,
                activeAppName: _activeAgentApp.name
              });
              if (altResult && altResult.success) {
                executedAppActions.push(appRecovery.toolCall.type === 'APP_ACTION' ? String(appRecovery.toolCall.action || '').toUpperCase() : appRecovery.toolCall.type);
                finalResponse = altResult.message || 'Recovered with an alternative action.';
                isDone = !(shouldContinueAgentLoopAfterTool(appRecovery.toolCall, userPrompt, executedAppActions) || hasUnfinishedExplicitTask(userPrompt, executedAppActions));
              } else {
                finalResponse = renderErrorRecoveryCard(execResult.errorCode, execResult.message, execResult);
                isDone = true;
              }
            } else {
              finalResponse = renderErrorRecoveryCard(execResult.errorCode, execResult.message, execResult);
              isDone = true;
            }
          }
        } else {
          const recovery = (window.UltronAgentPlanner && typeof window.UltronAgentPlanner.getRecoveryStrategy === 'function')
            ? window.UltronAgentPlanner.getRecoveryStrategy(toolCall, execResult)
            : null;
          if (recovery && plannerRetries < 2 && steps < maxSteps) {
            // Feed the failure + strategy back to the model instead of aborting
            plannerRetries++;
            activitySteps.push({ type: 'THINKING', label: `Re-planning: ${recovery.note || 'adjusting strategy'}` });
            toolResult = `${execResult.message || 'Action failed.'}\n[Re-plan suggestion: ${recovery.note}]`;
            finalResponse = '';
            isDone = false;
          } else {
            finalResponse = renderErrorRecoveryCard(execResult.errorCode, execResult.message, execResult);
            isDone = true;
          }
        }
      }
    } else {
      toolResult = `Unsupported tool type: ${toolCall.type}`;
      finalResponse = toolResult;
      isDone = true;
    }

    // Reflect this step's real outcome in the task plan
    const stepFailed = execResult ? !execResult.success : /failed|stopped|error/i.test(toolResult);
    if (toolCall.type !== 'APP_SEQUENCE') {
      currentSubgoal.completed = !stepFailed;
      currentSubgoal.status = stepFailed ? 'failed' : 'completed';
    }
    if (execResult && execResult.success && (execResult.resolvedApp || execResult.appIcon)) {
      const resolvedName = execResult.resolvedApp || toolCall.appName || '';
      const resolvedIcon = execResult.appIcon || toolCall.appIcon || '';
      activitySteps[actionProgressIndex].appName = resolvedName;
      activitySteps[actionProgressIndex].appIcon = resolvedIcon;
      if (resolvedName) _activeAgentApp = { name: resolvedName, icon: resolvedIcon };
    }

    // Live-visible execution: after a UI-mutating action that ends the task,
    // attach a screen thumbnail as visual evidence (respects neverCaptureApps).
    if (isDone && execResult && execResult.success
      && toolCall.type === 'APP_ACTION'
      && ['CLICK', 'DOUBLE_CLICK', 'TYPE_TEXT', 'OPEN_APP', 'FOCUS_APP'].includes(String(toolCall.action || '').toUpperCase())
      && canUseScreenAnalysis() && isScreenActivityFeedEnabled()) {
      try {
        const evidenceShot = await captureScreenForAgent({ label: `evidence-${String(toolCall.action || 'action').toLowerCase()}` });
        if (evidenceShot && evidenceShot.thumbnailDataUrl) {
          activitySteps.push({
            type: 'SCREEN',
            label: 'Screen after action',
            thumbnail: evidenceShot.thumbnailDataUrl,
            ts: Date.now()
          });
        }
      } catch (e) {}
    }

    if (!isDone && shouldContinueAgentLoopAfterTool(toolCall, userPrompt, executedAppActions) && toolCall.type !== 'CAPTURE_SCREEN') {
      await new Promise(resolve => setTimeout(resolve, 600));
      pushAgentProgressStep(activitySteps, 'VERIFY');
      if (canUseScreenAnalysis()) {
        const verifyShot = await captureScreenForAgent({ label: `after-${progressCategory}` });
        if (verifyShot) {
          loopImagePayloads = mergeImagePayloads(loopImagePayloads, [verifyShot]);
          hasVisualContext = loopImagePayloads.length > 0;
          toolResult += `\n[Post-action screenshot captured (${verifyShot.width}x${verifyShot.height}) — verify the UI state before continuing.]`;
          activitySteps.push({
            type: 'SCREEN',
            label: getAgentProgressMessage('VERIFY'),
            thumbnail: verifyShot.thumbnailDataUrl
          });
        }
      } else {
        const ocr = await readScreenTextForAgent({ label: `after-${progressCategory}-ocr` });
        if (ocr) {
          toolResult += `\n[Windows OCR after action]:\n${String(ocr.text || '[No readable text found]').slice(0, 12000)}`;
          activitySteps.push({
            type: 'SCREEN',
            label: 'Verified visible text with Windows OCR',
            thumbnail: ocr.thumbnailDataUrl
          });
        }
      }
    }

    // 4. Append observation to context for self-correction feedback loop
    if (!isDone) {
      accumulatedContext.push({ role: 'assistant', content: rawResponse });
      accumulatedContext.push({ role: 'user', content: `[Observation / System Result]:\n${toolResult}\n\nContinue toward completing the user's task.` });

      if (window.UltronLoopGuard && window.UltronLoopGuard.compressContext) {
        accumulatedContext = window.UltronLoopGuard.compressContext(
          accumulatedContext,
          agentRuntime.contextWindowMessages
        );
      }

      currentPrompt = buildAgentToolPrompt(userPrompt, steps + 1, toolResult, { hasVisualContext, canCaptureScreen });
      if (hasUnfinishedExplicitTask(userPrompt, executedAppActions)) {
        currentPrompt += `\n\n${buildMissingActionInstruction(userPrompt, executedAppActions)}`;
      }
    }
  }

  if (!finalResponse) {
    if (_activeAbortController && _activeAbortController.signal.aborted) {
      finalResponse = '';
    } else {
      finalResponse = isDone
        ? 'Task completed successfully.'
        : 'Reached the maximum number of agent steps. Review the activity feed for partial progress.';
    }
  }

  const anyFailed = agentSubgoals.some(step => step.status === 'failed');
  const nothingExecuted = hasDesktopActionCues(userPrompt) && executedAppActions.length === 0 && intent === 'action';
  if (window.UltronAgentCompletion && intent === 'action') {
    try {
    const completionCheck = window.UltronAgentCompletion.checkTaskCompletion(userPrompt, {
      activitySteps,
      executedAppActions,
      finalResponse
    });
    if (!completionCheck.complete && completionNudges < 2 && steps < maxSteps && !(_activeAbortController && _activeAbortController.signal.aborted)) {
      completionNudges++;
      logTrace(`Completion repair: ${completionCheck.suggestedRepair}`, 'system');
      const fallback = detectFallbackToolCall(userPrompt);
      const repairExecutor = window.UltronAgentExecutor;
      if (fallback && repairExecutor) {
        const repairResult = await repairExecutor.executeAgentToolCall(fallback, { withTimeout: (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r({ success: false, error: 'timeout' }), ms))]), canCaptureScreen: false });
        if (repairResult && repairResult.success) {
          activitySteps.push({ type: 'SUCCESS', label: 'Completion repair succeeded' });
          finalResponse = repairResult.message || finalResponse;
          if (fallback.type === 'WRITE_FILE' || fallback.type === 'EXECUTE') {
            executedAppActions.push(fallback.type);
            if (fallback.type === 'WRITE_FILE' && window.UltronAgentMemory && typeof window.UltronAgentMemory.registerArtifact === 'function') {
              window.UltronAgentMemory.registerArtifact('file', repairResult.evidence || fallback.targetPath, { source: 'WRITE_FILE_REPAIR' });
              pushWrittenFileToWorkspace(fallback.targetPath, fallback.content);
            }
          }
        }
      } else if (!finalResponse.includes('incomplete')) {
        finalResponse = `${finalResponse}\n\n**Note:** ${completionCheck.suggestedRepair}`;
      }
    }
    } catch (repairErr) {
      logTrace(`Completion repair skipped: ${repairErr.message}`, 'system');
    }
  }
  if (nothingExecuted && modelAnsweredWithoutExecuting(userPrompt, finalResponse, executedAppActions, intent)) {
    finalResponse = '**That did not run on your computer.** The model answered without executing anything. Reload and try again — folder/file tasks now run directly without waiting on the model.';
  }
  agentSubgoals.forEach(step => {
    if (!step.completed && step.status !== 'failed') {
      if (anyFailed || nothingExecuted) {
        step.status = 'failed';
      } else {
        step.completed = true;
        step.status = 'completed';
      }
    }
  });
  if (!anyFailed && !nothingExecuted) {
    agentSubgoals.push({ text: 'Done', completed: true, status: 'completed' });
  }
  activitySteps.push({
    type: anyFailed || nothingExecuted ? 'ERROR' : 'SUCCESS',
    label: anyFailed || nothingExecuted ? 'Task stopped — one or more steps did not run.' : 'Task complete.'
  });
  activeSubgoals = agentSubgoals.map(s => ({ text: s.text, completed: s.completed, status: s.status }));
  renderChecklist(activeSubgoals);
  // Sidebar no longer auto-opens when agent finishes — user controls visibility

  const fullFinalContent = composeAgentFinalContent(showTaskPlan ? agentSubgoals : [], activitySteps, finalResponse, Date.now() - loopStartedAt, deriveTaskPlanTitle(userPrompt));

  await typeMessageResponse(aiBubble, fullFinalContent, { instant: true });
  appendChatMessage('Ultron', fullFinalContent, true, { skipRender: true });

  if (looksLikeAgentQuestion(finalResponse)) {
    playUltronSound('question');
  } else {
    playUltronSound('task_complete');
  }

  const taskSummary = `[${intent.toUpperCase()}] "${userPrompt.substring(0, 40)}" → ${finalResponse.substring(0, 60).replace(/\n/g, ' ')}...`;
  persistTaskMemory(taskSummary);
  if (window.ultronAPI && typeof window.ultronAPI.ragIndexText === 'function') {
    setTimeout(async () => {
      try {
        await window.ultronAPI.ragIndexText({
          id: `task-outcome-${Date.now()}`,
          title: `Learned Task: ${userPrompt.slice(0, 35)}`,
          content: `Task: ${userPrompt}\nOutcome Summary: ${taskSummary}\nFinal Output: ${finalResponse.slice(0, 400)}`,
          metadata: { type: 'learning', userPrompt }
        });
      } catch (_) {}
    }, 150);
  }
  if (window.UltronDialogueState && typeof window.UltronDialogueState.updateFromTurn === 'function') {
    window.UltronDialogueState.updateFromTurn(userPrompt, finalResponse.slice(0, 120));
  }
  if (window.UltronDialogueState && typeof window.UltronDialogueState.recordTaskOutcome === 'function') {
    const pathMatch = String(finalResponse || '').match(/[A-Z]:\\[^\s<*"']+/i);
    window.UltronDialogueState.recordTaskOutcome(finalResponse.slice(0, 200), {
      path: pathMatch ? pathMatch[0] : '',
      message: finalResponse.slice(0, 200)
    });
  }
}

// Load historical conversation session
function loadSession(id, title) {
  if (typeof closeSettingsPanel === 'function') {
    closeSettingsPanel();
  }
  const chatMain = document.querySelector('.chat-main');

  if (activeChatTitle) activeChatTitle.textContent = title;
  setSendingState(false);
  activeSubgoals = [];

  try {
    if (!id || !conversationsStore[id]) {
      if (chatMain) chatMain.classList.add('empty-state');
      chatMessagesContainer.innerHTML = '';
      updateWelcomeGreeting();
      renderChecklist([]);
      return;
    }

    currentSessionId = id;
    chatMessagesContainer.innerHTML = '';

    const savedSession = conversationsStore[id];
    if (savedSession && Array.isArray(savedSession.messages) && savedSession.messages.length > 0) {
      if (chatMain) chatMain.classList.remove('empty-state');
      for (const msg of savedSession.messages) {
        const isAi = msg.isAi != null ? Boolean(msg.isAi) : msg.sender === 'Ultron';
        const contentEl = renderChatMessage(msg.sender, msg.text, isAi);
        if (isAi && contentEl) finalizeAiMessageBubble(contentEl, msg.text, { autoSpeak: false });
      }
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    } else {
      if (chatMain) chatMain.classList.add('empty-state');
      updateWelcomeGreeting();
    }
  } catch (err) {
    logTrace(`Error loading session messages: ${err.message}`, 'system');
    renderChatMessage('Ultron', `Failed to load conversation messages: ${err.message}`, true);
  }

  renderChecklist(activeSubgoals);
}

function showConfirmDialog({
  title = 'Confirm action',
  message = 'Are you sure?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-action-modal');
    const titleEl = document.getElementById('confirm-action-title');
    const messageEl = document.getElementById('confirm-action-message');
    const btnConfirm = document.getElementById('btn-confirm-action-confirm');
    const btnCancel = document.getElementById('btn-confirm-action-cancel');
    const backdrop = modal?.querySelector('[data-confirm-dismiss="true"]');

    if (!modal || !titleEl || !messageEl || !btnConfirm || !btnCancel) {
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    btnConfirm.textContent = confirmText;
    btnCancel.textContent = cancelText;
    btnConfirm.classList.toggle('confirm-action-btn-danger', destructive);
    btnConfirm.classList.toggle('confirm-action-btn-primary', !destructive);
    modal.classList.remove('hidden');

    const onConfirm = (e) => {
      e?.stopPropagation?.();
      cleanup();
      resolve(true);
    };

    const onCancel = (e) => {
      e?.stopPropagation?.();
      cleanup();
      resolve(false);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') onCancel(e);
    };

    const cleanup = () => {
      modal.classList.add('hidden');
      btnConfirm.removeEventListener('click', onConfirm);
      btnCancel.removeEventListener('click', onCancel);
      backdrop?.removeEventListener('click', onCancel);
      document.removeEventListener('keydown', onKeyDown);
    };

    btnConfirm.addEventListener('click', onConfirm);
    btnCancel.addEventListener('click', onCancel);
    backdrop?.addEventListener('click', onCancel);
    document.addEventListener('keydown', onKeyDown);
    btnCancel.focus();
  });
}

async function deleteSession(sessionId) {
  const session = conversationsStore[sessionId];
  if (!session) return;

  const confirmed = await showConfirmDialog({
    title: 'Delete chat?',
    message: `Permanently delete "${session.title || 'this chat'}"? All messages in this conversation will be removed. This cannot be undone.`,
    confirmText: 'Delete chat',
    cancelText: 'Cancel',
    destructive: true
  });

  if (!confirmed) return;

  const deletedTitle = session.title || 'Chat';
  delete conversationsStore[sessionId];
  saveConversationsToDisk();

  if (currentSessionId === sessionId) {
    triggerNewChat();
  }

  rebuildSessionHistoryList();
  logTrace(`Deleted conversation: "${deletedTitle}"`, 'system');
}

// Promise-based Delete Confirmation Dialog Modal popup
function showDeleteConfirmation(modelName) {
  return showConfirmDialog({
    title: 'Delete model?',
    message: `Are you sure you want to delete the offline model weights for "${modelName}"? This action cannot be undone.`,
    confirmText: 'Delete model',
    cancelText: 'Cancel',
    destructive: true
  });
}

// Populate Models Settings list
function inferModelTags(modelName = '', desc = '') {
  const n = String(modelName).toLowerCase();
  const d = String(desc).toLowerCase();
  const tags = new Set();

  if (n.endsWith('-cloud') || d.includes('ollama cloud') || d.includes('cloud inference')) {
    tags.add('cloud');
  } else {
    tags.add('offline');
  }

  if (/llava|vision|moondream|bakllava|multimodal/i.test(n + d)) tags.add('vision');
  if (/deepseek-r1|deepseek-v3|wizardlm|orca|qwq|thinking|reason|chain-of-thought/i.test(n + d)) tags.add('thinking');
  if (/codellama|starcoder|qwen3-coder|code assistant|code generation/i.test(n + d)) tags.add('code');
  if (/embed|nomic-embed|retrieval/i.test(n + d)) tags.add('embedding');

  return Array.from(tags);
}

function modelMatchesFilter(modelName, desc, tags = [], filter = 'all') {
  if (filter === 'all') return true;
  const resolvedTags = tags.length ? tags : inferModelTags(modelName, desc);
  return resolvedTags.includes(filter);
}

function getModelBrandInfo(modelName, author = '', provider = '') {
  const m = (modelName || '').toLowerCase();
  const a = (author || '').toLowerCase();
  const isHf = provider === 'huggingface' || m.startsWith('hf.co/');

  if (isHf) {
    return {
      brand: 'Hugging Face',
      author: author || 'community',
      avatar: `<div class="model-brand-avatar hf-avatar"><img src="../../Assets/Brand-Assets/hf-logo.png" alt="Hugging Face" style="width: 17px; height: 17px; object-fit: contain; flex-shrink: 0; display: block;" /></div>`,
      prefix: ''
    };
  }

  const isCloud = m.endsWith('-cloud') || provider === 'cloud';
  const isGptOss = m.startsWith('gpt-oss') || m.startsWith('gptoss');

  if (isCloud || isGptOss) {
    return {
      brand: isCloud ? 'Ollama Cloud' : 'Ollama',
      author: author || 'ollama',
      avatar: `<div class="model-brand-avatar ollama-avatar"><img src="../../Assets/Brand-Assets/ollama-white-logo.png" alt="Ollama" style="width: 17px; height: 17px; object-fit: contain; flex-shrink: 0; display: block;" /></div>`,
      prefix: ''
    };
  }

  // Cloud multi-providers
  if (provider === 'gemini' || m.includes('gemini')) {
    return {
      brand: 'Google Gemini',
      author: author || 'google',
      avatar: `<div class="model-brand-avatar google-avatar"><img src="../../Assets/Brand-Assets/gemini-logo.png" alt="Gemini" style="width: 17px; height: 17px; object-fit: contain; flex-shrink: 0; display: block;" /></div>`,
      prefix: ''
    };
  }
  if (provider === 'openai' || ((m.startsWith('gpt-') || m.startsWith('o1') || m.startsWith('o3')) && !isGptOss && !isCloud)) {
    return {
      brand: 'OpenAI',
      author: author || 'openai',
      avatar: `<div class="model-brand-avatar openai-avatar"><img src="../../Assets/Brand-Assets/openai-white-logo.png" alt="OpenAI" style="width: 17px; height: 17px; object-fit: contain; flex-shrink: 0; display: block;" /></div>`,
      prefix: ''
    };
  }
  if (provider === 'anthropic' || m.includes('claude')) {
    return {
      brand: 'Anthropic',
      author: author || 'anthropic',
      avatar: `<div class="model-brand-avatar anthropic-avatar"><img src="../../Assets/Brand-Assets/claude-logo.png" alt="Claude" style="width: 17px; height: 17px; object-fit: contain; flex-shrink: 0; display: block;" /></div>`,
      prefix: ''
    };
  }
  if (provider === 'deepseek' || (m.includes('deepseek') && provider === 'cloud')) {
    return {
      brand: 'DeepSeek',
      author: author || 'deepseek',
      avatar: `<div class="model-brand-avatar deepseek-avatar"><img src="../../Assets/Brand-Assets/deepseek-blue-logo.png" alt="DeepSeek" style="width: 17px; height: 17px; object-fit: contain; flex-shrink: 0; display: block;" /></div>`,
      prefix: ''
    };
  }
  if (provider === 'groq') {
    return {
      brand: 'Groq',
      author: author || 'groq',
      avatar: `<div class="model-brand-avatar groq-avatar"><img src="../../Assets/Brand-Assets/grok-white-logo.png" alt="Groq" style="width: 17px; height: 17px; object-fit: contain; flex-shrink: 0; display: block;" /></div>`,
      prefix: ''
    };
  }

  // Default Ollama local or cloud models
  return {
    brand: 'Ollama',
    author: author || 'ollama',
    avatar: `<div class="model-brand-avatar ollama-avatar"><img src="../../Assets/Brand-Assets/ollama-white-logo.png" alt="Ollama" style="width: 17px; height: 17px; object-fit: contain; flex-shrink: 0; display: block;" /></div>`,
    prefix: ''
  };
}

const MODEL_CATALOG_FILTERS = [
  { 
    id: 'all', 
    label: 'All', 
    iconHtml: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:2px;"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>`
  },
  { 
    id: 'text', 
    label: 'Text', 
    iconHtml: `<span class="modality-badge-t" style="font-size: 9px; padding: 1px 4px; margin-right: 2px;">T</span>` 
  },
  { 
    id: 'thinking', 
    label: 'Reasoning', 
    iconHtml: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:2px;"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>` 
  },
  { 
    id: 'vision', 
    label: 'Vision', 
    iconHtml: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:2px;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>` 
  },
  { 
    id: 'code', 
    label: 'Code', 
    iconHtml: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#4ade80" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:2px;"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>` 
  },
  { 
    id: 'offline', 
    label: 'Offline', 
    iconHtml: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:2px;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>` 
  },
  { 
    id: 'cloud', 
    label: 'Cloud', 
    iconHtml: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:2px;"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>` 
  },
  { 
    id: 'embedding', 
    label: 'Embeddings', 
    iconHtml: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:2px;"><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="6" r="3"></circle><line x1="9" y1="6" x2="15" y2="6"></line><line x1="9" y1="18" x2="15" y2="18"></line><line x1="6" y1="9" x2="6" y2="15"></line><line x1="18" y1="9" x2="18" y2="15"></line></svg>` 
  }
];

let activeModelCatalogFilter = 'all';

function renderModelTypeFilterBar(container) {
  if (!container) return;
  container.innerHTML = '';

  const allPool = [
    ...(OLLAMA_CLOUD_PULL_MODELS || []),
    ...(OLLAMA_POPULAR_MODELS || []),
    ...(HUGGINGFACE_POPULAR_MODELS || []),
    ...(installedModelsList || []).map(m => typeof m === 'string' ? { name: m } : m)
  ];

  const counts = {
    all: allPool.length,
    text: 0,
    thinking: 0,
    vision: 0,
    code: 0,
    offline: 0,
    cloud: 0,
    embedding: 0
  };

  allPool.forEach(m => {
    const name = m.name || '';
    const desc = m.desc || '';
    const tags = m.tags || inferModelTags(name, desc);
    const isCloud = name.endsWith('-cloud') || tags.includes('cloud');
    if (isCloud) counts.cloud++;
    else counts.offline++;
    if (tags.includes('thinking')) counts.thinking++;
    if (tags.includes('vision')) counts.vision++;
    if (tags.includes('code')) counts.code++;
    if (tags.includes('embedding')) counts.embedding++;
    counts.text++;
  });

  MODEL_CATALOG_FILTERS.forEach(({ id, label, iconHtml }) => {
    const countVal = counts[id] || 0;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `model-filter-chip${activeModelCatalogFilter === id ? ' active' : ''}`;
    btn.dataset.filter = id;
    btn.innerHTML = `
      ${iconHtml ? `<span class="filter-icon-span">${iconHtml}</span>` : ''}
      <span>${label}</span>
      <span class="filter-count">${countVal}</span>
    `;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', activeModelCatalogFilter === id ? 'true' : 'false');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (activeModelCatalogFilter === id) return;
      activeModelCatalogFilter = id;
      document.querySelectorAll('.model-type-filters').forEach(renderModelTypeFilterBar);
      renderSettingsModels();
      renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');
    });
    container.appendChild(btn);
  });
}

function selectAndActivateModel(modelName) {
  if (!modelName) return;
  activeModel = modelName;
  _lastOllamaModel = modelName;
  localStorage.setItem('ultron-selected-model', modelName);

  // Update dropdown options
  const selObj = document.getElementById('select-model-name');
  if (selObj) {
    let opt = Array.from(selObj.options).find(o => o.value.toLowerCase() === modelName.toLowerCase());
    if (!opt) {
      opt = document.createElement('option');
      opt.value = modelName;
      opt.textContent = modelName;
      selObj.appendChild(opt);
    }
    selObj.value = opt.value;
  }

  updateModelSelectorLabel();
  syncModelAttachmentCapabilities();
  renderSettingsModels();
  renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');
  logTrace(`Active model set to "${modelName}".`, 'system');
}

function initModelCatalogFilters() {
  renderModelTypeFilterBar(document.getElementById('installed-model-filters'));
  renderModelTypeFilterBar(document.getElementById('catalog-model-filters'));
}

function renderCatalogTagBadges(tags = []) {
  if (!tags.length) return '';
  const ordered = ['cloud', 'offline', 'thinking', 'vision', 'code', 'embedding'].filter(t => tags.includes(t));
  return `<div class="catalog-model-tags-row">${ordered.map(tag => {
    const label = tag.charAt(0).toUpperCase() + tag.slice(1);
    return `<span class="catalog-model-tag tag-${tag}">${label}</span>`;
  }).join('')}</div>`;
}

function renderSettingsModels() {
  settingsModelsList.innerHTML = '';
  renderModelTypeFilterBar(document.getElementById('installed-model-filters'));

  const effectiveInstalledMap = new Map();
  // 1. Locally installed models
  (installedModelsList || []).forEach(model => {
    const name = typeof model === 'string' ? model : model.name;
    if (name) {
      effectiveInstalledMap.set(name.toLowerCase(), typeof model === 'string' ? { name } : model);
    }
  });

  // 2. If signed in with Ollama Cloud, include all cloud models in the Installed Models library!
  if (isOllamaCloudConnectedState) {
    (OLLAMA_CLOUD_PULL_MODELS || []).forEach(model => {
      if (!effectiveInstalledMap.has(model.name.toLowerCase())) {
        effectiveInstalledMap.set(model.name.toLowerCase(), model);
      }
    });
  }

  const allEffectiveInstalled = Array.from(effectiveInstalledMap.values());

  const filteredInstalled = allEffectiveInstalled.filter(model => {
    const name = typeof model === 'string' ? model : model.name;
    return modelMatchesFilter(name, '', [], activeModelCatalogFilter);
  });
  
  // 2. Render downloaded / unlocked models
  if (allEffectiveInstalled.length === 0) {
    settingsModelsList.innerHTML = `
      <div style="border: 1px dashed var(--border-color); background: rgba(255,255,255,0.02); border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 8px;">
        <p style="font-size: 13px; color: var(--accent-white); font-weight: 500; margin: 0 0 6px 0;">No model weights installed yet</p>
        <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 14px 0;">Connect your <strong>Ollama Cloud</strong> account above or download <strong>Phi-3</strong> (2.2 GB) for offline replies.</p>
        <button id="btn-quick-download-phi3" class="btn-primary-sm" style="background-color: #ffffff !important; color: #000000 !important; font-weight: 600; padding: 6px 16px; font-size: 12px; border-radius: 6px; cursor: pointer; border: none;">
          Download Phi-3 (2.2 GB)
        </button>
      </div>
    `;
    
    setTimeout(() => {
      const btnQuick = document.getElementById('btn-quick-download-phi3');
      if (btnQuick) {
        btnQuick.addEventListener('click', () => {
          switchModelsViewTab('download');
          const inputModel = document.getElementById('input-download-model');
          const btnDownload = document.getElementById('btn-download-model');
          if (inputModel) inputModel.value = 'phi3:latest';
          if (btnDownload) btnDownload.click();
        });
      }
    }, 0);
    return;
  }

  if (filteredInstalled.length === 0) {
    settingsModelsList.innerHTML = `
      <div style="border: 1px dashed var(--border-color); background: rgba(255,255,255,0.02); border-radius: 8px; padding: 14px; text-align: center; margin-bottom: 8px;">
        <p style="font-size: 12px; color: var(--text-muted); margin: 0;">No installed models match the <strong>${escapeHtml(activeModelCatalogFilter)}</strong> filter.</p>
      </div>
    `;
    return;
  }
  
  filteredInstalled.forEach(model => {
    const item = document.createElement('div');
    item.className = 'catalog-model-card installed-model-card';

    const name = typeof model === 'string' ? model : model.name;
    const isCloudModel = name.endsWith('-cloud');

    // Find catalog entry for rich description and size if available
    const catalogEntry = [
      ...(OLLAMA_CLOUD_PULL_MODELS || []),
      ...(OLLAMA_POPULAR_MODELS || []),
      ...(HUGGINGFACE_POPULAR_MODELS || [])
    ].find(
      c => c.name.toLowerCase() === name.toLowerCase() ||
           c.name.split(':')[0] === name.split(':')[0] ||
           (c.repoId && name.toLowerCase().includes(c.repoId.toLowerCase()))
    );

    const isHfModel = name.startsWith('hf.co/') || (catalogEntry && catalogEntry.provider === 'huggingface');
    const brandInfo = getModelBrandInfo(name, catalogEntry?.author, isHfModel ? 'huggingface' : (isCloudModel ? 'cloud' : 'ollama'));

    // Parameter size tag (e.g. "8B", "20B", "3B", "7B")
    const paramBadge = catalogEntry?.size || (
      name.match(/(\d+\.?\d*b)/i) ? name.match(/(\d+\.?\d*b)/i)[0].toUpperCase() : 'Weights'
    );

    // Formatted disk size text
    const sizeText = model.size
      ? `${(model.size / (1024 * 1024 * 1024)).toFixed(1)} GB`
      : (catalogEntry?.downloadSize || 'Installed');

    // Description text
    const descText = catalogEntry?.desc
      ? catalogEntry.desc
      : (isHfModel ? 'Hugging Face GGUF model installed locally on your PC.' : (isCloudModel ? 'Ollama Cloud model (free tier remote execution).' : 'Local offline model weight installed on your PC.'));

    // Tags
    const tags = catalogEntry?.tags ? [...catalogEntry.tags] : inferModelTags(name, descText);
    const isThinking = tags.includes('thinking');
    const isVision = tags.includes('vision');
    const isCode = tags.includes('code');

    // Display title
    const displayTitle = catalogEntry?.displayName || name;
    const authorName = catalogEntry?.author || (isHfModel ? 'huggingface' : (isCloudModel ? 'ollama' : 'local'));

    // Active status
    const isActive = activeModel && (activeModel === name || activeModel.split(':')[0] === name.split(':')[0]);

    item.innerHTML = `
      <div class="card-header-row">
        <div class="card-header-left">
          ${brandInfo.avatar}
          <span class="card-model-title">${escapeHtml(displayTitle)}</span>
          <span class="modality-badge-t">T</span>
          ${isCloudModel ? '<span class="modality-badge-cloud">Cloud</span>' : '<span class="modality-badge-offline">Offline</span>'}
          ${isThinking ? '<span class="modality-badge-reasoning">Reasoning</span>' : ''}
          ${isVision ? '<span class="modality-badge-vision">Vision</span>' : ''}
          ${isCode ? '<span class="modality-badge-code">Code</span>' : ''}
        </div>
        <div class="card-header-right">
          <span class="card-token-metric">${escapeHtml(paramBadge)} • ${escapeHtml(sizeText)}</span>
          ${isActive
            ? `<span class="badge-in-use">In Use</span>`
            : (isCloudModel
                ? `<button class="btn-cloud-use btn-select-model" data-model="${escapeHtml(name)}">Use Model</button>`
                : `<button class="btn-select-model" data-model="${escapeHtml(name)}">Select</button>`
              )
          }
          <button class="btn-delete-model" data-model="${escapeHtml(name)}" title="Delete this model">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="12" height="12">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
            Delete
          </button>
        </div>
      </div>

      <div class="card-description-text">${escapeHtml(descText)}</div>

      <div class="card-metadata-row">
        <span class="meta-item">by <span class="meta-author-link">${escapeHtml(authorName)}</span></span>
        <span class="meta-divider">•</span>
        <span class="meta-item"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>${isCloudModel ? 'Cloud Hosted' : '128K context'}</span>
        <span class="meta-divider">•</span>
        <span class="meta-item">${isCloudModel ? 'Free tier' : '$0.00 / free (offline)'}</span>
        <span class="meta-divider">•</span>
        <span class="meta-item"><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:3px;"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>${escapeHtml(sizeText)} on disk</span>
      </div>
    `;

    // Bind Select button handler
    const btnSelect = item.querySelector('.btn-select-model');
    if (btnSelect) {
      btnSelect.addEventListener('click', (e) => {
        e.stopPropagation();
        const selectedName = e.currentTarget.getAttribute('data-model');
        selectAndActivateModel(selectedName);
      });
    }

    // Bind Delete button handler
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

// Persistent user authorized apps manager
function getSavedAuthorizedAppsMap() {
  const saved = localStorage.getItem('ultron-authorized-apps-map');
  if (saved) {
    try { return JSON.parse(saved); } catch (e) {}
  }
  return null; // Null indicates default (all checked)
}

function saveAuthorizedAppsMap(map) {
  localStorage.setItem('ultron-authorized-apps-map', JSON.stringify(map));
  // Keep main-process enforcement in sync with the settings UI
  if (window.ultronAPI && typeof window.ultronAPI.setAuthorizedApps === 'function') {
    window.ultronAPI.setAuthorizedApps(map).catch(() => {});
  }
}

let cachedSettingsApps = [];
let settingsAppsViewMode = localStorage.getItem('ultron-apps-view') || 'list';

function formatAppSize(bytes) {
  const value = Number(bytes) || 0;
  if (value <= 0) return '';
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function formatAppDate(isoDate) {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

function formatAppPublisher(app) {
  const publisher = String(app.publisher || '').trim();
  if (!publisher || publisher === 'Local') return '';
  return publisher;
}

function formatAppGridMeta(app) {
  const parts = [formatAppSize(app.sizeBytes), formatAppDate(app.modifiedAt)].filter(Boolean);
  return parts.join(' · ');
}

function getAppIconMarkup(app) {
  return app.icon
    ? `<img class="app-icon" src="${app.icon}" alt="${escapeHtml(app.name)}">`
    : getAppIconSvg(app.name);
}

function getAppsFilterQuery() {
  const appsSearchInput = document.getElementById('apps-search');
  return appsSearchInput ? appsSearchInput.value.toLowerCase().trim() : '';
}

function setAppsViewMode(mode) {
  settingsAppsViewMode = mode === 'grid' ? 'grid' : 'list';
  localStorage.setItem('ultron-apps-view', settingsAppsViewMode);
  if (settingsAppsList) {
    settingsAppsList.classList.toggle('apps-view-grid', settingsAppsViewMode === 'grid');
    settingsAppsList.classList.toggle('apps-view-list', settingsAppsViewMode === 'list');
  }
  document.getElementById('btn-apps-view-list')?.classList.toggle('active', settingsAppsViewMode === 'list');
  document.getElementById('btn-apps-view-grid')?.classList.toggle('active', settingsAppsViewMode === 'grid');
}

function updateAppsCountLabel(count) {
  const label = document.getElementById('apps-count-label');
  if (label) label.textContent = `${count} app${count === 1 ? '' : 's'} found`;
}

function syncAppCardAuthorization(card, isSelected) {
  if (!card) return;
  card.classList.toggle('is-authorized', isSelected);
  card.classList.toggle('is-restricted', !isSelected);
  const toggle = card.querySelector('.app-auth-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
    toggle.classList.toggle('is-restricted', !isSelected);
  }
  const checkbox = card.querySelector('.app-item-checkbox');
  if (checkbox) checkbox.checked = isSelected;
}

function bindAppAuthorizationControls(card, app, authMapRef) {
  const toggleAuthorization = (nextValue) => {
    authMapRef[app.name] = nextValue;
    saveAuthorizedAppsMap(authMapRef);
    syncAppCardAuthorization(card, nextValue);
    updateMarkAllCheckboxState();
  };

  const checkbox = card.querySelector('.app-item-checkbox');
  if (checkbox) {
    checkbox.addEventListener('change', () => toggleAuthorization(checkbox.checked));
  }

  card.querySelector('.app-auth-toggle')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleAuthorization(authMapRef[app.name] === false);
  });

  card.querySelector('.app-card-menu')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleAuthorization(authMapRef[app.name] === false);
  });
}

function buildAppListRow(app, isSelected, authMapRef) {
  const safeId = `chk-app-${app.name.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  const row = document.createElement('div');
  row.className = `app-list-row${isSelected ? ' is-authorized' : ' is-restricted'}`;
  row.dataset.appName = app.name;
  row.innerHTML = `
    <input type="checkbox" class="app-item-checkbox" id="${safeId}" data-app-name="${escapeHtml(app.name)}" ${isSelected ? 'checked' : ''}>
    <div class="app-list-icon-wrap">${getAppIconMarkup(app)}</div>
    <div class="app-list-body">
      <div class="app-list-title-row">
        <span class="app-list-name">${escapeHtml(app.name)}</span>
      </div>
    </div>
    <button type="button" class="app-auth-toggle app-list-auth-toggle ${isSelected ? '' : 'is-restricted'}" aria-label="Toggle authorization for ${escapeHtml(app.name)}" aria-pressed="${isSelected ? 'true' : 'false'}"><span class="app-auth-switch-knob"></span></button>
  `;
  bindAppAuthorizationControls(row, app, authMapRef);
  return row;
}

function buildAppGridCard(app, isSelected, authMapRef) {
  const safeId = `chk-app-grid-${app.name.replace(/[^a-zA-Z0-9-]/g, '-')}`;
  const card = document.createElement('div');
  card.className = `app-grid-card${isSelected ? ' is-authorized' : ' is-restricted'}`;
  card.dataset.appName = app.name;
  card.innerHTML = `
    <input type="checkbox" class="app-item-checkbox" id="${safeId}" data-app-name="${escapeHtml(app.name)}" ${isSelected ? 'checked' : ''}>
    <div class="app-grid-icon-wrap">${getAppIconMarkup(app)}</div>
    <div class="app-grid-name">${escapeHtml(app.name)}</div>
    <button type="button" class="app-auth-toggle ${isSelected ? '' : 'is-restricted'}" aria-label="Toggle authorization for ${escapeHtml(app.name)}" aria-pressed="${isSelected ? 'true' : 'false'}"><span class="app-auth-switch-knob"></span></button>
  `;
  bindAppAuthorizationControls(card, app, authMapRef);
  return card;
}

function renderSettingsAppsList(apps, authMap) {
  if (!settingsAppsList) return;

  setAppsViewMode(settingsAppsViewMode);
  settingsAppsList.innerHTML = '';

  if (!apps.length) {
    updateAppsCountLabel(0);
    settingsAppsList.innerHTML = `<div class="apps-empty-state">No matching applications found.</div>`;
    return;
  }

  updateAppsCountLabel(apps.length);
  const activeMap = authMap;

  apps.forEach((app) => {
    const isSelected = activeMap[app.name] !== false;
    if (activeMap[app.name] === undefined) activeMap[app.name] = true;
    const node = settingsAppsViewMode === 'grid'
      ? buildAppGridCard(app, isSelected, activeMap)
      : buildAppListRow(app, isSelected, activeMap);
    settingsAppsList.appendChild(node);
  });

  updateMarkAllCheckboxState();
}

function getFilteredSettingsApps() {
  const filterQuery = getAppsFilterQuery();
  return cachedSettingsApps.filter((app) => {
    if (!filterQuery) return true;
    const haystack = `${app.name} ${app.publisher || ''}`.toLowerCase();
    return haystack.includes(filterQuery);
  });
}

// Populate Apps Settings list (Windows-style grid & list views)
async function renderSettingsApps() {
  if (!settingsAppsList) return;

  setAppsViewMode(settingsAppsViewMode);
  settingsAppsList.innerHTML = `
    <div class="apps-loading-state">
      <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" fill="none"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" fill="none"></path>
      </svg>
      <span>Scanning local applications...</span>
    </div>
  `;
  updateAppsCountLabel(0);

  logTrace('Scanning host application shortcuts...', 'system');
  const result = await window.ultronAPI.getInstalledApps();
  settingsAppsList.innerHTML = '';

  if (!result.success || !Array.isArray(result.apps) || result.apps.length === 0) {
    cachedSettingsApps = [];
    updateAppsCountLabel(0);
    settingsAppsList.innerHTML = `<div class="apps-empty-state">No local application shortcuts found.</div>`;
    return;
  }

  cachedSettingsApps = result.apps.slice().sort((a, b) => a.name.localeCompare(b.name));
  const savedMap = getSavedAuthorizedAppsMap();
  const currentMap = savedMap || {};

  cachedSettingsApps.forEach((app) => {
    if (currentMap[app.name] === undefined) currentMap[app.name] = true;
  });

  if (!savedMap) saveAuthorizedAppsMap(currentMap);

  renderSettingsAppsList(getFilteredSettingsApps(), currentMap);
}

function updateMarkAllCheckboxState() {
  const chkMarkAllApps = document.getElementById('chk-mark-all-apps');
  if (!chkMarkAllApps || !settingsAppsList) return;
  const allBoxes = settingsAppsList.querySelectorAll('.app-item-checkbox');
  if (allBoxes.length === 0) {
    chkMarkAllApps.checked = false;
    return;
  }
  const checkedCount = Array.from(allBoxes).filter(b => b.checked).length;
  chkMarkAllApps.checked = checkedCount === allBoxes.length;
}

// Bind live apps search filter and Mark All checkbox events
const appsSearchInput = document.getElementById('apps-search');
if (appsSearchInput) {
  appsSearchInput.addEventListener('input', () => {
    const savedMap = getSavedAuthorizedAppsMap() || {};
    cachedSettingsApps.forEach((app) => {
      if (savedMap[app.name] === undefined) savedMap[app.name] = true;
    });
    renderSettingsAppsList(getFilteredSettingsApps(), savedMap);
  });
}

document.getElementById('btn-apps-view-list')?.addEventListener('click', () => {
  setAppsViewMode('list');
  const savedMap = getSavedAuthorizedAppsMap() || {};
  renderSettingsAppsList(getFilteredSettingsApps(), savedMap);
});

document.getElementById('btn-apps-view-grid')?.addEventListener('click', () => {
  setAppsViewMode('grid');
  const savedMap = getSavedAuthorizedAppsMap() || {};
  renderSettingsAppsList(getFilteredSettingsApps(), savedMap);
});

const chkMarkAllApps = document.getElementById('chk-mark-all-apps');
if (chkMarkAllApps) {
  chkMarkAllApps.addEventListener('change', () => {
    if (!settingsAppsList) return;
    const allBoxes = settingsAppsList.querySelectorAll('.app-item-checkbox');
    const newStatus = chkMarkAllApps.checked;
    const activeMap = getSavedAuthorizedAppsMap() || {};

    allBoxes.forEach((chk) => {
      chk.checked = newStatus;
      const appName = chk.getAttribute('data-app-name');
      if (appName) activeMap[appName] = newStatus;
      syncAppCardAuthorization(chk.closest('.app-list-row, .app-grid-card'), newStatus);
    });

    saveAuthorizedAppsMap(activeMap);
  });
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
      if (!hasCheckedOllamaOnBoot) {
        refreshOllamaStatus();
        hasCheckedOllamaOnBoot = true;
      }
    } else if (targetTab === 'desktop') {
      if (typeof setConnectorBadgesChecking === 'function') setConnectorBadgesChecking();
      await refreshMcpConnectorBadges();
      if (typeof clearConnectorBadgesChecking === 'function') clearConnectorBadgesChecking();
    } else if (targetTab === 'apps') {
      renderSettingsApps();
    } else if (targetTab === 'storage') {
      if (settingMemoryToggle) {
        const isMemoryEnabled = window.localStorage.getItem('ultron-memory-enabled') !== 'false';
        settingMemoryToggle.checked = isMemoryEnabled;
      }
      await loadStoragePathsUI();
      updateMemoryUIState();
    } else if (targetTab === 'account') {
      await loadAccountDetails({ locationReason: 'account-tab' });
    }
  });
});

// Settings sidebar search — live-filters the navigation list as you type
const settingsSearchInput = document.getElementById('settings-search-input');
if (settingsSearchInput) {
  settingsSearchInput.addEventListener('input', () => {
    const q = settingsSearchInput.value.trim().toLowerCase();
    settingsTabs.forEach(tab => {
      const label = (tab.textContent || '').toLowerCase();
      tab.classList.toggle('hidden-by-search', Boolean(q) && !label.includes(q));
    });
  });
}

let hasCheckedOllamaOnBoot = false;

// Bind Google Gemini API Key Input and Save/Edit Button
const inputGeminiKey = document.getElementById('input-gemini-api-key');
const btnSaveGeminiKey = document.getElementById('btn-save-gemini-key');
const btnCancelGeminiKey = document.getElementById('btn-cancel-gemini-key');
const btnToggleGeminiInput = document.getElementById('btn-toggle-gemini-key-input');
const geminiKeyInputContainer = document.getElementById('gemini-key-input-container');
const geminiKeyBtnText = document.getElementById('gemini-key-btn-text');
const feedbackGeminiKey = document.getElementById('gemini-key-feedback');

let isEditingGeminiKey = false;

async function initPersistentGeminiKey() {
  let key = localStorage.getItem('ultron-gemini-api-key') || '';
  if (!key && window.ultronAPI && window.ultronAPI.loadGeminiKey) {
    try {
      key = await window.ultronAPI.loadGeminiKey();
      if (key) {
        localStorage.setItem('ultron-gemini-api-key', key);
      }
    } catch (e) {}
  }
  updateGeminiKeyUi();
  if (key) {
    await connectGemini(key);
    ensureValidActiveGeminiModel();
  } else updateGeminiConnectionBadge();
}

function updateGeminiKeyUi() {
  if (!inputGeminiKey || !btnSaveGeminiKey) return;
  const savedKey = localStorage.getItem('ultron-gemini-api-key') || '';

  if (savedKey) {
    inputGeminiKey.value = savedKey;
    if (geminiKeyBtnText) geminiKeyBtnText.textContent = 'Edit Key';
  } else {
    if (geminiKeyBtnText) geminiKeyBtnText.textContent = 'Add Key';
  }

  // Hide or show the input container based on editing state
  if (!isEditingGeminiKey) {
    if (geminiKeyInputContainer) geminiKeyInputContainer.classList.add('hidden');
    if (btnToggleGeminiInput) btnToggleGeminiInput.style.display = 'inline-flex';
  } else {
    if (geminiKeyInputContainer) geminiKeyInputContainer.classList.remove('hidden');
    if (btnToggleGeminiInput) btnToggleGeminiInput.style.display = 'none';
  }
}

// Initial UI check on script load
initPersistentGeminiKey();

if (btnToggleGeminiInput) {
  btnToggleGeminiInput.addEventListener('click', () => {
    isEditingGeminiKey = true;
    updateGeminiKeyUi();
    if (inputGeminiKey) {
      inputGeminiKey.focus();
      inputGeminiKey.select();
    }
  });
}

if (btnCancelGeminiKey) {
  btnCancelGeminiKey.addEventListener('click', () => {
    isEditingGeminiKey = false;
    updateGeminiKeyUi();
  });
}

if (btnSaveGeminiKey) {
  btnSaveGeminiKey.addEventListener('click', async () => {
    const val = inputGeminiKey ? inputGeminiKey.value.trim() : '';
    if (val) {
      btnSaveGeminiKey.disabled = true;
      btnSaveGeminiKey.textContent = 'Connecting…';
      localStorage.setItem('ultron-gemini-api-key', val);
      if (window.ultronAPI && window.ultronAPI.saveGeminiKey) {
        await window.ultronAPI.saveGeminiKey(val).catch(() => {});
      }
      const connection = await connectGemini(val, { selectFirst: true });
      btnSaveGeminiKey.disabled = false;
      btnSaveGeminiKey.textContent = 'Save Key';
      if (feedbackGeminiKey) {
        feedbackGeminiKey.textContent = connection.success
          ? `✓ Connected — ${connection.models.length} compatible Gemini models available.`
          : `Could not connect: ${connection.error}`;
        feedbackGeminiKey.style.color = connection.success ? '#34d399' : '#f87171';
        feedbackGeminiKey.classList.remove('hidden');
        if (connection.success) setTimeout(() => feedbackGeminiKey.classList.add('hidden'), 5000);
      }
      if (connection.success) {
        isEditingGeminiKey = false;
        updateGeminiKeyUi();
        refreshTtsModelsUI();
      }
    } else {
      localStorage.removeItem('ultron-gemini-api-key');
      if (window.ultronAPI && window.ultronAPI.saveGeminiKey) {
        window.ultronAPI.saveGeminiKey('').catch(() => {});
      }
      isEditingGeminiKey = false;
      ONLINE_GEMINI_MODELS = [];
      geminiConnectionState = 'disconnected';
      geminiConnectionError = '';
      updateGeminiConnectionBadge();
      updateGeminiKeyUi();
      renderModelDropdownList();
      updateModelSelectorLabel();
      refreshTtsModelsUI();
      if (feedbackGeminiKey) {
        feedbackGeminiKey.textContent = 'Key cleared.';
        feedbackGeminiKey.classList.remove('hidden');
        setTimeout(() => feedbackGeminiKey.classList.add('hidden'), 3000);
      }
    }
  });
}

// Windows UIA MCP settings
const windowsUiaStatusBadge = document.getElementById('windows-uia-status-badge');
const windowsMcpStatusBadge = document.getElementById('windows-mcp-status-badge');
const filesystemMcpStatusBadge = document.getElementById('filesystem-mcp-status-badge');
const windowsMcpFeedback = document.getElementById('windows-mcp-feedback');
const filesystemMcpFeedback = document.getElementById('filesystem-mcp-feedback');
const btnInstallWindowsUia = document.getElementById('btn-install-windows-uia');
const btnRefreshDesktopConnectors = document.getElementById('btn-refresh-desktop-connectors');
const btnOpenPermissionsFromDesktop = document.getElementById('btn-open-permissions-from-desktop');
const windowsUiaFeedback = document.getElementById('windows-uia-feedback');
const windowsUiaProgress = document.getElementById('windows-uia-progress');
const windowsUiaProgressStatus = document.getElementById('windows-uia-progress-status');
const windowsUiaProgressStats = document.getElementById('windows-uia-progress-stats');
const windowsUiaProgressBar = document.getElementById('windows-uia-progress-bar');
const windowsUiaProgressSpeed = document.getElementById('windows-uia-progress-speed');

function resetWindowsUiaProgress() {
  if (windowsUiaProgress) windowsUiaProgress.classList.add('hidden');
  if (windowsUiaProgressBar) windowsUiaProgressBar.style.width = '0%';
  if (windowsUiaProgressStats) windowsUiaProgressStats.textContent = '0%';
  if (windowsUiaProgressSpeed) windowsUiaProgressSpeed.textContent = 'Speed: --';
}

function showWindowsUiaProgress(data = {}) {
  if (!windowsUiaProgress) return;
  windowsUiaProgress.classList.remove('hidden');
  const phase = data.phase || 'download';
  const percent = Number.isFinite(data.percent) ? data.percent : 0;
  if (windowsUiaProgressBar) windowsUiaProgressBar.style.width = `${percent}%`;
  if (windowsUiaProgressStats) {
    const sizeLabel = data.downloaded && data.total
      ? `${percent}% (${data.downloaded} / ${data.total})`
      : `${percent}%`;
    windowsUiaProgressStats.textContent = sizeLabel;
  }
  if (windowsUiaProgressStatus) {
    windowsUiaProgressStatus.textContent = phase === 'extract'
      ? 'Extracting mcp-windows server…'
      : 'Downloading mcp-windows server (~50MB)…';
  }
  if (windowsUiaProgressSpeed) {
    windowsUiaProgressSpeed.textContent = data.speed ? `Speed: ${data.speed}` : 'Speed: --';
  }
}

function updateWindowsUiaInstallButton(connected, installing = false) {
  if (!btnInstallWindowsUia) return;
  btnInstallWindowsUia.classList.remove('btn-installing', 'btn-installed');
  if (installing) {
    btnInstallWindowsUia.disabled = true;
    btnInstallWindowsUia.innerHTML = `<span class="connector-refresh-btn-spinner" style="display:inline-block; margin-right:6px;" aria-hidden="true"></span><span>Installing…</span>`;
    btnInstallWindowsUia.classList.add('btn-installing');
    return;
  }
  if (connected) {
    btnInstallWindowsUia.disabled = true;
    btnInstallWindowsUia.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" width="13" height="13" style="margin-right:6px;"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Installed</span>`;
    btnInstallWindowsUia.classList.add('btn-installed');
    return;
  }
  btnInstallWindowsUia.disabled = false;
  btnInstallWindowsUia.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13" style="margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg><span>Install / Connect UI Automation</span>`;
}

function setConnectorBadgesChecking() {
  [windowsUiaStatusBadge, windowsMcpStatusBadge, filesystemMcpStatusBadge].forEach((badge) => {
    if (!badge) return;
    badge.textContent = 'Checking…';
    badge.classList.add('badge-checking');
  });
}

function clearConnectorBadgesChecking() {
  [windowsUiaStatusBadge, windowsMcpStatusBadge, filesystemMcpStatusBadge].forEach((badge) => {
    badge?.classList.remove('badge-checking');
  });
}

async function runDesktopConnectorsRefresh() {
  if (!btnRefreshDesktopConnectors || btnRefreshDesktopConnectors.classList.contains('is-refreshing')) return;

  const labelEl = btnRefreshDesktopConnectors.querySelector('.connector-refresh-btn-label');
  const spinnerEl = btnRefreshDesktopConnectors.querySelector('.connector-refresh-btn-spinner');

  btnRefreshDesktopConnectors.disabled = true;
  btnRefreshDesktopConnectors.classList.add('is-refreshing');
  btnRefreshDesktopConnectors.classList.remove('is-success');
  if (spinnerEl) spinnerEl.classList.remove('hidden');
  if (labelEl) labelEl.textContent = 'Refreshing…';
  setConnectorBadgesChecking();

  const started = Date.now();
  try {
    await refreshMcpConnectorBadges();
  } finally {
    const minVisibleMs = 750;
    const elapsed = Date.now() - started;
    if (elapsed < minVisibleMs) {
      await new Promise((r) => setTimeout(r, minVisibleMs - elapsed));
    }
    clearConnectorBadgesChecking();
    if (spinnerEl) spinnerEl.classList.add('hidden');
    btnRefreshDesktopConnectors.classList.remove('is-refreshing');
    btnRefreshDesktopConnectors.classList.add('is-success');
    if (labelEl) labelEl.textContent = 'Updated!';
    await new Promise((r) => setTimeout(r, 700));
    btnRefreshDesktopConnectors.classList.remove('is-success');
    btnRefreshDesktopConnectors.disabled = false;
    if (labelEl) labelEl.textContent = 'Refresh status';
  }
}

async function refreshMcpConnectorBadges() {
  if (!window.ultronAPI || !window.ultronAPI.getMcpStatus) return;
  try {
    const status = await window.ultronAPI.getMcpStatus();
    const connected = status.connected || [];
    const tools = status.tools || [];

    const uiaConnected = connected.includes('windows-uia');
    setConnectorBadge(windowsUiaStatusBadge, uiaConnected ? 'connected' : 'offline');
    updateWindowsUiaInstallButton(uiaConnected);

    if (windowsUiaFeedback) {
      if (uiaConnected) {
        const connectorsRoot = window.ultronAPI.getConnectorsRoot
          ? await window.ultronAPI.getConnectorsRoot().catch(() => '')
          : '';
        windowsUiaFeedback.textContent = connectorsRoot
          ? `Connected (installed) — ${connectorsRoot}\\mcp-windows-uia`
          : 'Connected and ready for desktop automation.';
      } else if (!btnInstallWindowsUia?.classList.contains('btn-installing')) {
        windowsUiaFeedback.textContent = '';
      }
    }

    const windowsMcpOk = connected.includes('windows');
    setConnectorBadge(windowsMcpStatusBadge, windowsMcpOk ? 'connected' : 'offline', {
      offline: windowsMcpOk ? 'Connected' : 'Not connected'
    });
    if (windowsMcpFeedback) {
      windowsMcpFeedback.textContent = windowsMcpOk
        ? `Active tools: ${tools.filter(t => t.startsWith('windows:')).slice(0, 4).join(', ') || 'App, Click, Type…'}`
        : 'Install uv from astral.sh/uv — Windows-MCP starts automatically when uv is available.';
    }

    const fsOk = connected.includes('filesystem');
    const fetchOk = connected.includes('fetch');
    setConnectorBadge(
      filesystemMcpStatusBadge,
      fsOk && fetchOk ? 'connected' : (fsOk || fetchOk ? 'partial' : 'offline'),
      { partial: 'Partial', connected: 'Connected' }
    );
    if (filesystemMcpFeedback) {
      const parts = [];
      if (fsOk) parts.push('filesystem (read/write/list files)');
      if (fetchOk) parts.push('fetch (web pages)');
      filesystemMcpFeedback.textContent = parts.length
        ? `Active: ${parts.join('; ')}`
        : 'Filesystem and fetch MCP connect on startup — restart Ultron if missing.';
    }
  } catch (e) { /* ignore */ }
}

async function initMcpConnectorBadges() {
  await refreshMcpConnectorBadges();
}

initMcpConnectorBadges();

if (btnRefreshDesktopConnectors) {
  btnRefreshDesktopConnectors.addEventListener('click', () => {
    runDesktopConnectorsRefresh();
  });
}

if (btnOpenPermissionsFromDesktop) {
  btnOpenPermissionsFromDesktop.addEventListener('click', () => {
    document.querySelector('.settings-tab-btn[data-tab="permissions"]')?.click();
  });
}

if (btnInstallWindowsUia) {
  btnInstallWindowsUia.addEventListener('click', async () => {
    if (!window.ultronAPI || !window.ultronAPI.installMcpWindowsUia) return;
    if (btnInstallWindowsUia.classList.contains('btn-installed')) return;

    const locationOk = await confirmConnectorDownloadLocation();
    if (!locationOk) return;

    updateWindowsUiaInstallButton(false, true);
    if (windowsUiaFeedback) windowsUiaFeedback.textContent = '';
    resetWindowsUiaProgress();
    showWindowsUiaProgress({ percent: 0, phase: 'download' });

    const cleanUiaProgress = window.ultronAPI.onDownloadProgress
      ? window.ultronAPI.onDownloadProgress((data) => {
          if ((data.modelName || '').toLowerCase() !== 'mcp-windows-uia') return;
          showWindowsUiaProgress(data);
        })
      : null;

    const res = await window.ultronAPI.installMcpWindowsUia().catch(err => ({ success: false, error: err.message }));
    if (cleanUiaProgress) cleanUiaProgress();

    resetWindowsUiaProgress();
    await refreshMcpConnectorBadges();
    if (!res.success) {
      updateWindowsUiaInstallButton(false, false);
      if (windowsUiaFeedback) {
        windowsUiaFeedback.textContent = res.error || 'Install failed.';
      }
    }
    logTrace(res.success ? 'Windows UIA MCP connected.' : `Windows UIA MCP install failed: ${res.error}`, 'system');
  });
}

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

// ==========================================
// MODELS TOP-RIGHT DOWNLOAD TRACKER & CIRCULAR PROGRESS CONTROLLER
// ==========================================
const activeModelDownloadsMap = new Map();
let isDownloadPopoverOpen = false;

function getDownloadProgressRingOffset(percent) {
  const radius = 14;
  const circumference = 2 * Math.PI * radius; // ~87.9646
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  return circumference - (pct / 100) * circumference;
}

function updateModelsDownloadTrackerUI() {
  const trackerEl = document.getElementById('models-download-tracker');
  const btnIndicator = document.getElementById('btn-models-download-indicator');
  const ringFill = document.getElementById('download-progress-ring');
  const badge = document.getElementById('download-active-badge');
  const popover = document.getElementById('models-download-popover');
  const popoverSummary = document.getElementById('download-popover-status-summary');
  const itemsContainer = document.getElementById('download-popover-items');

  if (!trackerEl || !btnIndicator || !ringFill) return;

  const entries = Array.from(activeModelDownloadsMap.values());
  const activeDownloads = entries.filter(e => e.status !== 'Completed' && e.status !== 'Failed' && e.status !== 'Cancelled');

  if (entries.length === 0) {
    trackerEl.classList.add('hidden');
    if (popover) popover.classList.add('hidden');
    isDownloadPopoverOpen = false;
    return;
  }

  // Show tracker in top right of models header
  trackerEl.classList.remove('hidden');

  if (activeDownloads.length > 0) {
    btnIndicator.classList.add('is-downloading');
    if (badge) {
      badge.classList.remove('hidden');
      badge.textContent = String(activeDownloads.length);
    }
    
    // Average progress percentage for the circular ring
    const avgPercent = activeDownloads.reduce((acc, curr) => acc + (curr.percent || 0), 0) / activeDownloads.length;
    ringFill.style.strokeDashoffset = `${getDownloadProgressRingOffset(avgPercent)}px`;
    ringFill.style.stroke = '#22c55e';
    if (popoverSummary) {
      popoverSummary.textContent = `${activeDownloads.length} Downloading`;
      popoverSummary.style.color = '#22c55e';
    }
  } else {
    btnIndicator.classList.remove('is-downloading');
    if (badge) badge.classList.add('hidden');
    ringFill.style.strokeDashoffset = '0px';
    ringFill.style.stroke = '#22c55e';
    if (popoverSummary) {
      popoverSummary.textContent = 'All Finished';
      popoverSummary.style.color = '#a1a1aa';
    }
  }

  // Render popover items
  if (itemsContainer) {
    itemsContainer.innerHTML = '';
    entries.forEach((item) => {
      const isHf = item.modelName.startsWith('hf.co/');
      const card = document.createElement('div');
      card.className = 'download-popover-card';
      
      const isDone = item.status === 'Completed';
      const isCancelled = item.status === 'Cancelled';
      const isFailed = item.status === 'Failed';

      card.innerHTML = `
        <div class="download-card-title-row">
          <div style="display: flex; align-items: center; gap: 6px; min-width: 0;">
            <span class="download-card-name" title="${escapeHtml(item.modelName)}">${escapeHtml(item.modelName)}</span>
            <span class="download-card-tag">${isHf ? 'GGUF' : 'OLLAMA'}</span>
          </div>
          ${(!isDone && !isCancelled && !isFailed) ? `
            <button type="button" class="btn-popover-cancel" data-model="${escapeHtml(item.modelName)}">Cancel</button>
          ` : `
            <span style="font-size: 10px; font-weight: 600; color: ${isDone ? '#22c55e' : '#ef4444'};">${escapeHtml(item.status)}</span>
          `}
        </div>
        <div class="download-card-progress-track">
          <div class="download-card-progress-fill" style="width: ${item.percent || 0}%; ${isDone ? 'background: #22c55e;' : ''}"></div>
        </div>
        <div class="download-card-stats-row">
          <span>${item.percent || 0}% ${item.downloaded ? `(${escapeHtml(item.downloaded)}${item.total ? ` / ${escapeHtml(item.total)}` : ''})` : ''}</span>
          <span>${item.speed ? escapeHtml(item.speed) : (isDone ? 'Completed' : '--')}</span>
        </div>
      `;

      const btnCancel = card.querySelector('.btn-popover-cancel');
      if (btnCancel) {
        btnCancel.addEventListener('click', async (e) => {
          e.stopPropagation();
          btnCancel.disabled = true;
          btnCancel.textContent = 'Cancelling…';
          try {
            await window.ultronAPI.cancelDownloadModel(item.modelName);
            item.status = 'Cancelled';
            updateModelsDownloadTrackerUI();
          } catch (err) {
            console.warn('Cancel error:', err);
          }
        });
      }

      itemsContainer.appendChild(card);
    });
  }
}

function initModelsDownloadTracker() {
  const btnIndicator = document.getElementById('btn-models-download-indicator');
  const popover = document.getElementById('models-download-popover');
  const trackerEl = document.getElementById('models-download-tracker');

  if (!btnIndicator || !popover) return;

  btnIndicator.addEventListener('click', (e) => {
    e.stopPropagation();
    isDownloadPopoverOpen = !isDownloadPopoverOpen;
    if (isDownloadPopoverOpen) {
      popover.classList.remove('hidden');
      updateModelsDownloadTrackerUI();
    } else {
      popover.classList.add('hidden');
    }
  });

  document.addEventListener('click', (e) => {
    if (isDownloadPopoverOpen && trackerEl && !trackerEl.contains(e.target)) {
      isDownloadPopoverOpen = false;
      popover.classList.add('hidden');
    }
  });

  // Global listener for download progress from any model download
  if (window.ultronAPI?.onDownloadProgress) {
    window.ultronAPI.onDownloadProgress((data) => {
      if (!data || !data.modelName) return;
      const key = data.modelName.toLowerCase();
      const existing = activeModelDownloadsMap.get(key) || { modelName: data.modelName };
      
      existing.modelName = data.modelName;
      existing.percent = typeof data.percent === 'number' ? data.percent : (existing.percent || 0);
      existing.downloaded = data.downloaded || existing.downloaded || '';
      existing.total = data.total || existing.total || '';
      existing.speed = data.speed || existing.speed || '';
      existing.status = existing.percent >= 100 ? 'Completed' : 'Downloading…';
      existing.timestamp = Date.now();

      activeModelDownloadsMap.set(key, existing);
      updateModelsDownloadTrackerUI();

      // Update specific card button if visible
      const activeCardBtn = document.querySelector(`.btn-catalog-pull[data-model="${data.modelName}"], .btn-catalog-pull[data-model="${key}"]`);
      if (activeCardBtn && existing.status !== 'Completed') {
        activeCardBtn.classList.add('is-downloading');
        activeCardBtn.disabled = true;
        activeCardBtn.innerHTML = `
          <svg class="lottie-download-svg is-active-anim" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#22c55e" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
            <line class="lottie-download-beam" x1="12" y1="2" x2="12" y2="13" stroke="#22c55e" stroke-width="1.8"></line>
            <g class="lottie-download-arrow">
              <line class="lottie-download-stem" x1="12" y1="4" x2="12" y2="13"></line>
              <polyline points="8 9.5 12 13.5 16 9.5"></polyline>
            </g>
            <path class="lottie-download-tray" d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path>
          </svg>
          Downloading (${existing.percent}%)
        `;
      }
    });
  }
}

initModelsDownloadTracker();

let activeDownloadingModel = null;

// Bind model downloader
btnDownloadModel.addEventListener('click', async () => {
  const modelName = inputDownloadModel.value.trim();
  if (!modelName) return;

  const cloudOk = await ensureOllamaCloudAuthForPull(modelName);
  if (!cloudOk) return;
  
  activeDownloadingModel = modelName;
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
  
  // Register in download activity tracker
  activeModelDownloadsMap.set(modelName.toLowerCase(), {
    modelName,
    percent: 0,
    downloaded: '0 MB',
    total: '',
    speed: '--',
    status: 'Downloading…',
    timestamp: Date.now()
  });
  updateModelsDownloadTrackerUI();
  renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');

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

      // Update tracker Map
      const item = activeModelDownloadsMap.get(modelName.toLowerCase()) || { modelName };
      item.percent = data.percent;
      item.downloaded = data.downloaded;
      item.total = data.total;
      item.speed = data.speed;
      item.status = data.percent >= 100 ? 'Completed' : 'Downloading…';
      activeModelDownloadsMap.set(modelName.toLowerCase(), item);
      updateModelsDownloadTrackerUI();
    }
  });
  
  try {
    const result = await window.ultronAPI.downloadModel(modelName);
    const item = activeModelDownloadsMap.get(modelName.toLowerCase());

    if (result.success) {
      logTrace(`Model weights for "${modelName}" pulled successfully!`, 'system');
      if (item) {
        item.status = 'Completed';
        item.percent = 100;
        item.justCompleted = true;
        updateModelsDownloadTrackerUI();
        renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');
        renderSettingsModels();

        setTimeout(() => {
          if (item) item.justCompleted = false;
          activeModelDownloadsMap.delete(modelName.toLowerCase());
          updateModelsDownloadTrackerUI();
          renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');
        }, 4500);
      }
      alert(`Model weights for "${modelName}" pulled successfully!\n\nTo run this model manually from the command line, run:\nollama run ${modelName}`);
      inputDownloadModel.value = '';
      
      // Refresh profiling and settings list
      await runOnboardingProfiler();
      renderSettingsModels();
    } else if (result.cancelled) {
      logTrace(`Model pull for "${modelName}" was cancelled by user.`, 'system');
      if (item) {
        item.status = 'Cancelled';
        updateModelsDownloadTrackerUI();
        setTimeout(() => {
          activeModelDownloadsMap.delete(modelName.toLowerCase());
          updateModelsDownloadTrackerUI();
          renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');
        }, 3000);
      }
    } else {
      logTrace(`Failed to download weights: ${result.error}`, 'system');
      if (item) {
        item.status = 'Failed';
        updateModelsDownloadTrackerUI();
        renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');
      }
      alert(`Failed to download weights: ${result.error}`);
    }
  } catch (err) {
    logTrace(`Download error: ${err.message}`, 'system');
    alert(`Download error: ${err.message}`);
  } finally {
    activeDownloadingModel = null;
    // Unsubscribe from real-time events
    cleanProgressEvent();
    
    // Hide progress bar container
    if (progressContainer) {
      progressContainer.style.setProperty('display', 'none', 'important');
      progressContainer.classList.add('hidden');
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
// UNIFIED POPULAR & LIVE MODEL CATALOG CONTROLLER
// (OLLAMA LIBRARY & HUGGING FACE GGUF HUB)
// ==========================================
let activeCatalogProviderFilter = 'all'; // 'all' | 'ollama' | 'huggingface'
let liveHuggingFaceResults = [];
let hfSearchDebounceTimer = null;
let activeHfSearchQuery = '';

const OLLAMA_CLOUD_PULL_MODELS = [
  { name: 'gpt-oss:20b-cloud', size: '20B', downloadSize: 'Cloud', provider: 'ollama', desc: 'Fast general tasks & coding on Ollama Cloud (free tier — runs on Ollama servers)', tags: ['cloud', 'thinking', 'code'] },
  { name: 'gpt-oss:120b-cloud', size: '120B', downloadSize: 'Cloud', provider: 'ollama', desc: 'Large reasoning & chain-of-thought model — runs on Ollama cloud infrastructure', tags: ['cloud', 'thinking'] },
  { name: 'deepseek-v3.1:671b-cloud', size: '671B', downloadSize: 'Cloud', provider: 'ollama', desc: 'Flagship DeepSeek v3.1 671B mixture-of-experts cloud inference via Ollama', tags: ['cloud', 'thinking'] },
  { name: 'deepseek-r1:70b-cloud', size: '70B', downloadSize: 'Cloud', provider: 'ollama', desc: 'DeepSeek R1 70B reasoning & math model hosted on Ollama Cloud', tags: ['cloud', 'thinking'] },
  { name: 'qwen3-coder:480b-cloud', size: '480B', downloadSize: 'Cloud', provider: 'ollama', desc: 'State-of-the-art code generation & repository reasoning on Ollama Cloud', tags: ['cloud', 'code'] },
  { name: 'qwen2.5:72b-cloud', size: '72B', downloadSize: 'Cloud', provider: 'ollama', desc: 'Alibaba Qwen 2.5 72B flagship high-accuracy cloud model', tags: ['cloud', 'thinking'] },
  { name: 'llama3.3:70b-cloud', size: '70B', downloadSize: 'Cloud', provider: 'ollama', desc: 'Meta Llama 3.3 70B versatile reasoning & chat model hosted on Ollama servers', tags: ['cloud'] },
  { name: 'minimax-m2.7-cloud', size: 'CLOUD', downloadSize: 'Cloud', provider: 'ollama', desc: 'MiniMax M2.7 high speed multimodal cloud model', tags: ['cloud'] },
];

const OLLAMA_POPULAR_MODELS = [
  { name: 'llama3:latest', size: '8B', downloadSize: '4.7 GB', provider: 'ollama', desc: 'Meta flagship open model for general AI tasks', tags: ['offline'] },
  { name: 'mistral:latest', size: '7B', downloadSize: '4.1 GB', provider: 'ollama', desc: 'Fast, high-accuracy general AI model by Mistral AI', tags: ['offline'] },
  { name: 'phi3:latest', size: '3.8B', downloadSize: '2.2 GB', provider: 'ollama', desc: 'Microsoft high-efficiency reasoning & logic model', tags: ['offline', 'thinking'] },
  { name: 'gemma2:2b', size: '2B', downloadSize: '1.6 GB', provider: 'ollama', desc: 'Google Gemma 2 compact model for low VRAM systems', tags: ['offline'] },
  { name: 'gemma2:latest', size: '9B', downloadSize: '5.4 GB', provider: 'ollama', desc: 'Google state-of-the-art open model with high precision', tags: ['offline'] },
  { name: 'qwen2.5:latest', size: '7B', downloadSize: '4.7 GB', provider: 'ollama', desc: 'Alibaba top-tier reasoning, math, and code model', tags: ['offline', 'thinking'] },
  { name: 'qwen2.5-coder:latest', size: '7B', downloadSize: '4.7 GB', provider: 'ollama', desc: 'Alibaba code-specialized model with expert programming logic', tags: ['offline', 'code'] },
  { name: 'qwen2.5-coder:1.5b', size: '1.5B', downloadSize: '986 MB', provider: 'ollama', desc: 'Ultra-fast lightweight coding model for low VRAM PCs', tags: ['offline', 'code'] },
  { name: 'deepseek-r1:latest', size: '7B', downloadSize: '4.7 GB', provider: 'ollama', desc: 'DeepSeek advanced reasoning & chain-of-thought model', tags: ['offline', 'thinking'] },
  { name: 'deepseek-coder-v2:latest', size: '16B', downloadSize: '8.9 GB', provider: 'ollama', desc: 'DeepSeek mixture-of-experts code model supporting 300+ languages', tags: ['offline', 'code'] },
  { name: 'mistral-nemo:latest', size: '12B', downloadSize: '7.1 GB', provider: 'ollama', desc: 'Mistral & NVIDIA state-of-the-art 12B model with 128k context', tags: ['offline'] },
  { name: 'phi4:latest', size: '14B', downloadSize: '9.1 GB', provider: 'ollama', desc: 'Microsoft groundbreaking 14B reasoning & math model', tags: ['offline', 'thinking'] },
  { name: 'llava:latest', size: '7B', downloadSize: '4.5 GB', provider: 'ollama', desc: 'Multimodal vision + text model for analyzing images', tags: ['offline', 'vision'] },
  { name: 'moondream:latest', size: '1.8B', downloadSize: '1.7 GB', provider: 'ollama', desc: 'Tiny, highly efficient visual reasoning and image analysis model', tags: ['offline', 'vision'] },
  { name: 'bakllava:latest', size: '7B', downloadSize: '4.7 GB', provider: 'ollama', desc: 'Mistral-based multimodal model with enhanced vision grounding', tags: ['offline', 'vision'] },
  { name: 'nomic-embed-text:latest', size: '137M', downloadSize: '274 MB', provider: 'ollama', desc: 'High performance text embedding & retrieval model', tags: ['offline', 'embedding'] },
  { name: 'bge-m3:latest', size: '567M', downloadSize: '1.1 GB', provider: 'ollama', desc: 'BAAI multi-lingual, multi-granularity dense embedding model', tags: ['offline', 'embedding'] },
  { name: 'snowflake-arctic-embed:latest', size: '137M', downloadSize: '274 MB', provider: 'ollama', desc: 'Snowflake high-accuracy semantic text embedding model', tags: ['offline', 'embedding'] },
  { name: 'codellama:latest', size: '7B', downloadSize: '3.8 GB', provider: 'ollama', desc: 'Meta specialized model for code generation & debugging', tags: ['offline', 'code'] },
  { name: 'tinyllama:latest', size: '1.1B', downloadSize: '637 MB', provider: 'ollama', desc: 'Ultra lightweight model for low resource PCs', tags: ['offline'] },
  { name: 'llama3.2:1b', size: '1B', downloadSize: '1.3 GB', provider: 'ollama', desc: 'Meta ultra-fast 1B model for rapid responses', tags: ['offline'] },
  { name: 'llama3.2:3b', size: '3B', downloadSize: '2.0 GB', provider: 'ollama', desc: 'Meta balanced 3B compact model', tags: ['offline'] },
  { name: 'smollm2:1.7b', size: '1.7B', downloadSize: '1.0 GB', provider: 'ollama', desc: 'HuggingFace ultra-compact mobile and edge model', tags: ['offline'] },
  { name: 'smollm2:360m', size: '360M', downloadSize: '229 MB', provider: 'ollama', desc: 'HuggingFace micro language model for instant completions', tags: ['offline'] },
  { name: 'starcoder2:latest', size: '3B', downloadSize: '1.7 GB', provider: 'ollama', desc: 'BigCode high-speed code assistant', tags: ['offline', 'code'] },
  { name: 'granite3-dense:8b', size: '8B', downloadSize: '4.9 GB', provider: 'ollama', desc: 'IBM Granite Enterprise-grade general language model', tags: ['offline'] },
  { name: 'hermes3:8b', size: '8B', downloadSize: '4.7 GB', provider: 'ollama', desc: 'Nous Research Hermes 3 steerable agentic LLM', tags: ['offline', 'thinking'] },
  { name: 'vicuna:latest', size: '7B', downloadSize: '3.8 GB', provider: 'ollama', desc: 'LMSYS chat & conversation fine-tuned model', tags: ['offline'] },
  { name: 'wizardlm2:latest', size: '7B', downloadSize: '4.1 GB', provider: 'ollama', desc: 'Microsoft WizardLM2 complex reasoning model', tags: ['offline', 'thinking'] },
  { name: 'orca-mini:latest', size: '3B', downloadSize: '1.9 GB', provider: 'ollama', desc: 'Compact reasoning model for lightweight hardware', tags: ['offline', 'thinking'] },
  { name: 'zephyr:latest', size: '7B', downloadSize: '4.1 GB', provider: 'ollama', desc: 'HuggingFace direct preference optimized chat model', tags: ['offline'] },
  { name: 'command-r:latest', size: '35B', downloadSize: '20 GB', provider: 'ollama', desc: 'Cohere flagship RAG and tool-use model for complex tasks', tags: ['offline', 'thinking'] }
];

const HUGGINGFACE_POPULAR_MODELS = [
  {
    name: 'hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M',
    displayName: 'Llama-3.2-1B-Instruct (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '1B',
    downloadSize: '1.3 GB',
    desc: 'Meta ultra-fast 1B instruct model quantized to Q4_K_M by bartowski',
    tags: ['offline', 'huggingface'],
    downloads: 384000,
    likes: 420
  },
  {
    name: 'hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M',
    displayName: 'Llama-3.2-3B-Instruct (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '3B',
    downloadSize: '2.0 GB',
    desc: 'Meta high-efficiency 3B compact instruct model quantized to Q4_K_M',
    tags: ['offline', 'huggingface'],
    downloads: 512000,
    likes: 630
  },
  {
    name: 'hf.co/bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF:Q4_K_M',
    displayName: 'DeepSeek-R1-Distill-Qwen-1.5B (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '1.5B',
    downloadSize: '1.2 GB',
    desc: 'DeepSeek advanced chain-of-thought reasoning distilled into compact Qwen 1.5B',
    tags: ['offline', 'thinking', 'huggingface'],
    downloads: 620000,
    likes: 910
  },
  {
    name: 'hf.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF:Q4_K_M',
    displayName: 'DeepSeek-R1-Distill-Qwen-7B (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '7B',
    downloadSize: '4.7 GB',
    desc: 'DeepSeek R1 reasoning & problem-solving model quantized to Q4_K_M',
    tags: ['offline', 'thinking', 'huggingface'],
    downloads: 890000,
    likes: 1250
  },
  {
    name: 'hf.co/bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF:Q4_K_M',
    displayName: 'Qwen2.5-Coder-1.5B-Instruct (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '1.5B',
    downloadSize: '1.1 GB',
    desc: 'Alibaba lightning-fast code generation and debugging model',
    tags: ['offline', 'code', 'huggingface'],
    downloads: 240000,
    likes: 380
  },
  {
    name: 'hf.co/bartowski/Qwen2.5-Coder-7B-Instruct-GGUF:Q4_K_M',
    displayName: 'Qwen2.5-Coder-7B-Instruct (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '7B',
    downloadSize: '4.7 GB',
    desc: 'Alibaba flagship coding intelligence model with deep syntax reasoning',
    tags: ['offline', 'code', 'huggingface'],
    downloads: 710000,
    likes: 890
  },
  {
    name: 'hf.co/bartowski/Mistral-Nemo-Instruct-2407-GGUF:Q4_K_M',
    displayName: 'Mistral-Nemo-Instruct-2407 (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '12B',
    downloadSize: '7.1 GB',
    desc: 'Mistral & NVIDIA state-of-the-art 12B model quantized to Q4_K_M',
    tags: ['offline', 'huggingface'],
    downloads: 430000,
    likes: 680
  },
  {
    name: 'hf.co/bartowski/Phi-4-GGUF:Q4_K_M',
    displayName: 'Phi-4 (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '14B',
    downloadSize: '8.9 GB',
    desc: 'Microsoft flagship 14B mathematical reasoning model quantized to Q4_K_M',
    tags: ['offline', 'thinking', 'huggingface'],
    downloads: 580000,
    likes: 1100
  },
  {
    name: 'hf.co/bartowski/SmolLM2-1.7B-Instruct-GGUF:Q4_K_M',
    displayName: 'SmolLM2-1.7B-Instruct (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '1.7B',
    downloadSize: '1.0 GB',
    desc: 'HuggingFace ultra-compact high speed instruct model quantized to Q4_K_M',
    tags: ['offline', 'huggingface'],
    downloads: 190000,
    likes: 270
  },
  {
    name: 'hf.co/bartowski/Hermes-3-Llama-3.1-8B-GGUF:Q4_K_M',
    displayName: 'Hermes-3-Llama-3.1-8B (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '8B',
    downloadSize: '4.9 GB',
    desc: 'Nous Research Hermes 3 fine-tuned on Llama 3.1 with agentic tool capability',
    tags: ['offline', 'thinking', 'huggingface'],
    downloads: 340000,
    likes: 560
  },
  {
    name: 'hf.co/bartowski/gemma-2-2b-it-GGUF:Q4_K_M',
    displayName: 'Gemma-2-2B-IT (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '2B',
    downloadSize: '1.6 GB',
    desc: 'Google high precision compact conversational model',
    tags: ['offline', 'huggingface'],
    downloads: 310000,
    likes: 290
  },
  {
    name: 'hf.co/bartowski/gemma-2-9b-it-GGUF:Q4_K_M',
    displayName: 'Gemma-2-9B-IT (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '9B',
    downloadSize: '5.5 GB',
    desc: 'Google flagship Gemma 2 9B instruction-tuned model quantized to Q4_K_M',
    tags: ['offline', 'huggingface'],
    downloads: 640000,
    likes: 850
  },
  {
    name: 'hf.co/bartowski/Phi-3.5-mini-instruct-GGUF:Q4_K_M',
    displayName: 'Phi-3.5-Mini-Instruct (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '3.8B',
    downloadSize: '2.3 GB',
    desc: 'Microsoft state-of-the-art multilingual logic & reasoning mini model',
    tags: ['offline', 'thinking', 'huggingface'],
    downloads: 180000,
    likes: 310
  },
  {
    name: 'hf.co/TheBloke/Mistral-7B-Instruct-v0.2-GGUF:Q4_K_M',
    displayName: 'Mistral-7B-Instruct-v0.2 (GGUF)',
    author: 'TheBloke',
    provider: 'huggingface',
    size: '7B',
    downloadSize: '4.1 GB',
    desc: 'TheBloke canonical quantization of Mistral 7B Instruct v0.2',
    tags: ['offline', 'huggingface'],
    downloads: 1450000,
    likes: 2400
  },
  {
    name: 'hf.co/bartowski/Llama-3.1-8B-Instruct-GGUF:Q4_K_M',
    displayName: 'Llama-3.1-8B-Instruct (GGUF)',
    author: 'bartowski',
    provider: 'huggingface',
    size: '8B',
    downloadSize: '4.9 GB',
    desc: 'Meta 128k context flagship 8B general intelligence model',
    tags: ['offline', 'huggingface'],
    downloads: 980000,
    likes: 1600
  }
];

function formatCompactCount(num) {
  if (!num || isNaN(num)) return null;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(0) + 'k';
  return String(num);
}

let catalogLimit = 12;

function filterCatalogModels(models, filterQuery = '') {
  const query = filterQuery.toLowerCase().trim();
  return models.filter(m => {
    const tags = m.tags || inferModelTags(m.name, m.desc);
    const matchesType = modelMatchesFilter(m.name, m.desc, tags, activeModelCatalogFilter);
    const matchesQuery = !query ||
      m.name.toLowerCase().includes(query) ||
      (m.displayName && m.displayName.toLowerCase().includes(query)) ||
      (m.author && m.author.toLowerCase().includes(query)) ||
      m.desc.toLowerCase().includes(query);
    return matchesType && matchesQuery;
  });
}

function initCatalogProviderFilters() {
  const providerButtons = document.querySelectorAll('#catalog-provider-filters .provider-filter-pill');
  providerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      providerButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCatalogProviderFilter = btn.getAttribute('data-provider') || 'all';
      renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');
    });
  });
}

function renderOllamaCatalog(filterQuery = '') {
  const catalogListEl = document.getElementById('ollama-catalog-list');
  const btnLoadMore = document.getElementById('btn-load-more-models');
  if (!catalogListEl) return;

  renderModelTypeFilterBar(document.getElementById('catalog-model-filters'));

  catalogListEl.innerHTML = '';
  const query = filterQuery.toLowerCase().trim();
  const installedNames = new Set([
    ...(installedModelsList || []).map(m => (typeof m === 'string' ? m : m.name).toLowerCase()),
    ...(isOllamaCloudConnectedState ? (OLLAMA_CLOUD_PULL_MODELS || []).map(m => m.name.toLowerCase()) : [])
  ]);

  function appendCatalogSection(title, titleColor, models, limitSlice = true, badgeType = null) {
    const filtered = filterCatalogModels(models, filterQuery);
    if (filtered.length === 0) return false;

    const header = document.createElement('div');
    header.className = 'catalog-section-title';
    header.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 10px 2px 6px; font-size: 11px; font-weight: 600; color: ${titleColor}; letter-spacing: 0.02em;`;
    
    let headerLeft = `<span>${escapeHtml(title)}</span>`;
    if (badgeType === 'hf') {
      headerLeft = `<div style="display: flex; align-items: center; gap: 6px;"><img src="../../Assets/Brand-Assets/hf-logo.png" style="width: 13px; height: 13px; object-fit: contain;" /><span>${escapeHtml(title)}</span></div>`;
    } else if (badgeType === 'ollama') {
      headerLeft = `<div style="display: flex; align-items: center; gap: 6px;"><img src="../../Assets/Brand-Assets/ollama-white-logo.png" style="width: 13px; height: 13px; object-fit: contain;" /><span>${escapeHtml(title)}</span></div>`;
    }
    
    header.innerHTML = `${headerLeft}<span style="font-size: 10px; color: var(--text-muted); font-weight: normal;">${filtered.length} models</span>`;
    catalogListEl.appendChild(header);

    const visible = query ? filtered : (limitSlice ? filtered.slice(0, catalogLimit) : filtered);
    visible.forEach(model => appendCatalogCard(model, installedNames));
    return true;
  }

  function appendCatalogCard(model, installedSet) {
    const isInstalled = installedSet.has(model.name.toLowerCase()) || (model.repoId && installedSet.has(`hf.co/${model.repoId}`.toLowerCase()));
    const isCloudModel = model.name.endsWith('-cloud') || (model.tags && model.tags.includes('cloud'));
    const isHuggingFace = model.provider === 'huggingface' || model.name.startsWith('hf.co/');
    const tags = model.tags || inferModelTags(model.name, model.desc);
    const card = document.createElement('div');
    card.className = 'catalog-model-card';

    const brandInfo = getModelBrandInfo(model.name, model.author, isHuggingFace ? 'huggingface' : (isCloudModel ? 'cloud' : 'ollama'));

    const isThinking = tags.includes('thinking');
    const isVision = tags.includes('vision');
    const isCode = tags.includes('code');

    const displayTitle = model.displayName || model.name;
    const authorName = model.author || (isHuggingFace ? 'huggingface' : (isCloudModel ? 'ollama' : 'community'));

    const paramText = model.size ? `${model.size} tokens` : (isCloudModel ? 'Cloud' : 'Weights');
    const contextText = isCloudModel ? '1.05M context' : '128K context';
    const priceInput = isCloudModel ? (model.priceInput || '$0/M input') : '$0/M input';
    const priceOutput = isCloudModel ? (model.priceOutput || '$0.') : '$0.';

    // Build tag pills with colored dots (matching mobile UI)
    const tagPills = [];
    if (isThinking) tagPills.push({ label: 'Reasoning', color: '#f59e0b' });
    if (isVision) tagPills.push({ label: 'Vision', color: '#a855f7' });
    if (isCode) tagPills.push({ label: 'Code', color: '#22c55e' });
    if (isCloudModel) tagPills.push({ label: 'Cloud', color: '#38bdf8' });
    if (!isCloudModel) tagPills.push({ label: 'Offline', color: '#94a3b8' });
    if (isHuggingFace) tagPills.push({ label: 'HuggingFace', color: '#facc15' });

    const tagPillsHtml = tagPills.length > 0
      ? `<div class="card-tags-row">${tagPills.map(t => `<span class="card-tag-pill"><span class="card-tag-dot" style="background:${t.color}"></span>${escapeHtml(t.label)}</span>`).join('')}</div>`
      : '';

    const dlInfo = activeModelDownloadsMap.get(model.name.toLowerCase());
    const isActivelyDownloading = dlInfo && dlInfo.status !== 'Completed' && dlInfo.status !== 'Failed' && dlInfo.status !== 'Cancelled';
    const isJustCompleted = dlInfo && dlInfo.status === 'Completed' && dlInfo.justCompleted;

    // Build action button
    let actionButtonHtml = '';
    if (isCloudModel) {
      const isActiveCloud = activeModel && (activeModel.toLowerCase() === model.name.toLowerCase() || activeModel.toLowerCase().split(':')[0] === model.name.toLowerCase().split(':')[0]);
      if (isActiveCloud) {
        actionButtonHtml = `
          <span class="badge-in-use" title="Model is currently active">
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            In Use
          </span>
        `;
      } else {
        actionButtonHtml = `
          <button class="btn-cloud-use btn-catalog-pull" data-model="${escapeHtml(model.name)}" title="Select and use this cloud model">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor" stroke="none" style="margin-right: 4px;">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            Use Model
          </button>
        `;
      }
    } else if (isActivelyDownloading) {
      actionButtonHtml = `
        <button class="btn-catalog-pull is-downloading" disabled data-model="${escapeHtml(model.name)}">
          <svg class="lottie-download-svg is-active-anim" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#22c55e" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
            <line class="lottie-download-beam" x1="12" y1="2" x2="12" y2="13" stroke="#22c55e" stroke-width="1.8"></line>
            <g class="lottie-download-arrow">
              <line class="lottie-download-stem" x1="12" y1="4" x2="12" y2="13"></line>
              <polyline points="8 9.5 12 13.5 16 9.5"></polyline>
            </g>
            <path class="lottie-download-tray" d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path>
          </svg>
          Downloading (${dlInfo.percent || 0}%)
        </button>
      `;
    } else if (isJustCompleted) {
      actionButtonHtml = `
        <span class="badge-installed just-completed">
          <svg class="lottie-check-svg play-once" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#22c55e" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;">
            <circle class="lottie-check-circle" cx="12" cy="12" r="10" stroke="#22c55e" stroke-width="2.2" fill="none"></circle>
            <polyline class="lottie-check-mark" points="7.5 12 10.5 15 16.5 9" stroke="#22c55e" stroke-width="2.6"></polyline>
          </svg>
          INSTALLED
        </span>
      `;
    } else if (isInstalled) {
      actionButtonHtml = `
        <span class="badge-installed">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 3px;">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          INSTALLED
        </span>
      `;
    } else {
      actionButtonHtml = `
        <button class="btn-catalog-pull" data-model="${escapeHtml(model.name)}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 4px;">
            <line x1="12" y1="4" x2="12" y2="14"></line>
            <polyline points="8 10 12 14 16 10"></polyline>
            <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1"></path>
          </svg>
          Download
        </button>
      `;
    }

    // HuggingFace logo badge
    const hfBadge = isHuggingFace
      ? `<img src="../../Assets/Brand-Assets/hf-logo.png" style="width:14px;height:14px;object-fit:contain;vertical-align:middle;margin-right:2px;" />`
      : '';

    card.innerHTML = `
      <div class="card-header-row">
        <div class="card-header-left">
          ${brandInfo.avatar}
          <span class="card-model-title">${escapeHtml(displayTitle)}</span>
        </div>
        <div class="card-header-right">
          <span class="card-token-metric">${escapeHtml(paramText)}</span>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#64748b" stroke-width="2" style="flex-shrink:0;cursor:pointer;" title="Model details"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
        </div>
      </div>

      ${tagPillsHtml}

      <div class="card-description-text">${escapeHtml(model.desc || 'High-performance neural model weights.')}</div>

      <div class="card-metadata-row">
        <span class="meta-item">${hfBadge}by <span class="meta-author-link">${escapeHtml(authorName)}</span></span>
        <span class="meta-divider">·</span>
        <span class="meta-item">${escapeHtml(contextText)}</span>
        <span class="meta-divider">·</span>
        <span class="meta-item">${escapeHtml(priceInput)}</span>
        <span class="meta-divider">·</span>
        <span class="meta-item">${escapeHtml(priceOutput)}</span>
        <span style="margin-left:auto;">${actionButtonHtml}</span>
      </div>
    `;
    const pullBtn = card.querySelector('.btn-catalog-pull');
    if (pullBtn) {
      pullBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (isCloudModel) {
          const ok = await ensureOllamaCloudAuthForPull(model.name);
          if (!ok) return;

          // If not installed in Ollama list yet, pull the cloud model stub
          if (!installedNames.has(model.name.toLowerCase())) {
            pullBtn.disabled = true;
            pullBtn.textContent = 'Connecting…';
            try {
              const res = await window.ultronAPI.downloadModel(model.name);
              if (res && res.success) {
                await runOnboardingProfiler();
              }
            } catch (_) {}
            pullBtn.disabled = false;
            pullBtn.textContent = 'Use Model';
          }

          selectAndActivateModel(model.name);
          renderOllamaCatalog(filterQuery);
          return;
        }
        const ok = await ensureOllamaCloudAuthForPull(model.name);
        if (!ok) return;
        if (inputDownloadModel) {
          inputDownloadModel.value = model.name;
          btnDownloadModel.click();
        }
      });
    }
    catalogListEl.appendChild(card);
  }

  const showOllama = activeCatalogProviderFilter === 'all' || activeCatalogProviderFilter === 'ollama';
  const showHuggingFace = activeCatalogProviderFilter === 'all' || activeCatalogProviderFilter === 'huggingface';
  const showCloudSection = (activeModelCatalogFilter === 'all' || activeModelCatalogFilter === 'cloud') && showOllama;
  const showLocalSection = activeModelCatalogFilter !== 'cloud';

  let hasCloud = false;
  let hasOllama = false;
  let hasHf = false;
  let hasLiveHf = false;

  // 1. Ollama Cloud Section
  if (showCloudSection) {
    hasCloud = appendCatalogSection('Ollama Cloud Models (Free Tier)', '#34d399', OLLAMA_CLOUD_PULL_MODELS, false, 'ollama');
  }

  // 2. Local Ollama Models Section
  if (showOllama && showLocalSection) {
    hasOllama = appendCatalogSection('Ollama Local Models', 'var(--text-muted)', OLLAMA_POPULAR_MODELS, true, 'ollama');
  }

  // 3. Hugging Face Predefined / Curated GGUF Models
  if (showHuggingFace && showLocalSection) {
    hasHf = appendCatalogSection('Hugging Face Popular GGUF Hub', '#fde047', HUGGINGFACE_POPULAR_MODELS, true, 'hf');
  }

  // 4. Live Hugging Face Search Results
  if (showHuggingFace && liveHuggingFaceResults.length > 0 && query) {
    hasLiveHf = appendCatalogSection(`Hugging Face Live Search ("${escapeHtml(query)}")`, '#60a5fa', liveHuggingFaceResults, false, 'hf');
  }

  const totalFilteredCount = (showOllama ? filterCatalogModels(OLLAMA_POPULAR_MODELS, filterQuery).length : 0) +
                             (showHuggingFace ? filterCatalogModels(HUGGINGFACE_POPULAR_MODELS, filterQuery).length : 0);

  if (!hasCloud && !hasOllama && !hasHf && !hasLiveHf && query && !query.includes(' ')) {
    appendCatalogCard({
      name: query,
      size: 'Custom Tag',
      downloadSize: 'Direct Pull',
      desc: `Pull model tag "${query}" directly from repository`,
    }, installedNames);
  } else if (!hasCloud && !hasOllama && !hasHf && !hasLiveHf) {
    catalogListEl.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); padding: 12px 0; text-align: center;">
        No models found matching "${escapeHtml(query)}" for provider "${escapeHtml(activeCatalogProviderFilter)}".
      </div>
    `;
    if (btnLoadMore) btnLoadMore.style.display = 'none';
    return;
  }

  if (btnLoadMore) {
    if (showLocalSection && catalogLimit < totalFilteredCount) {
      btnLoadMore.style.display = 'inline-flex';
      btnLoadMore.innerHTML = `
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-right:6px;">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
        Load More Models (${Math.min(catalogLimit, totalFilteredCount)} of ${totalFilteredCount})
      `;
    } else {
      btnLoadMore.style.display = 'none';
    }
  }
}

let activeModelsViewSubTab = 'installed';

function switchModelsViewTab(targetView = 'installed') {
  activeModelsViewSubTab = targetView;
  const btnInstalled = document.getElementById('tab-btn-installed-models');
  const btnDownload = document.getElementById('tab-btn-download-models');
  const viewInstalled = document.getElementById('installed-models-view');
  const viewDownload = document.getElementById('download-models-view');

  if (targetView === 'installed') {
    if (btnInstalled) {
      btnInstalled.classList.add('active');
      btnInstalled.setAttribute('aria-selected', 'true');
    }
    if (btnDownload) {
      btnDownload.classList.remove('active');
      btnDownload.setAttribute('aria-selected', 'false');
    }
    if (viewInstalled) viewInstalled.classList.remove('hidden');
    if (viewDownload) viewDownload.classList.add('hidden');
    renderSettingsModels();
  } else {
    if (btnDownload) {
      btnDownload.classList.add('active');
      btnDownload.setAttribute('aria-selected', 'true');
    }
    if (btnInstalled) {
      btnInstalled.classList.remove('active');
      btnInstalled.setAttribute('aria-selected', 'false');
    }
    if (viewDownload) viewDownload.classList.remove('hidden');
    if (viewInstalled) viewInstalled.classList.add('hidden');
    const inputModel = document.getElementById('input-download-model');
    renderOllamaCatalog(inputModel ? inputModel.value : '');
  }
}

function initModelsViewTabs() {
  const btnInstalled = document.getElementById('tab-btn-installed-models');
  const btnDownload = document.getElementById('tab-btn-download-models');

  if (btnInstalled) {
    btnInstalled.addEventListener('click', () => switchModelsViewTab('installed'));
  }
  if (btnDownload) {
    btnDownload.addEventListener('click', () => switchModelsViewTab('download'));
  }
}

initModelCatalogFilters();
initCatalogProviderFilters();
initModelsViewTabs();

// Live Debounced Hugging Face Hub Search Controller
function triggerLiveHuggingFaceSearch(query) {
  const spinner = document.getElementById('hf-search-spinner');
  clearTimeout(hfSearchDebounceTimer);

  const cleanQuery = (query || '').trim();
  if (!cleanQuery || cleanQuery.length < 2 || activeCatalogProviderFilter === 'ollama') {
    liveHuggingFaceResults = [];
    if (spinner) spinner.style.display = 'none';
    renderOllamaCatalog(cleanQuery);
    return;
  }

  if (spinner) spinner.style.display = 'flex';

  hfSearchDebounceTimer = setTimeout(async () => {
    activeHfSearchQuery = cleanQuery;
    try {
      if (window.ultronAPI && window.ultronAPI.searchHuggingFaceModels) {
        const res = await window.ultronAPI.searchHuggingFaceModels(cleanQuery, 12);
        if (res && res.success && Array.isArray(res.models)) {
          liveHuggingFaceResults = res.models;
        } else {
          liveHuggingFaceResults = [];
        }
      }
    } catch (e) {
      console.warn('[HF Search] live query failed:', e);
      liveHuggingFaceResults = [];
    } finally {
      if (spinner) spinner.style.display = 'none';
      renderOllamaCatalog(cleanQuery);
    }
  }, 320);
}

// Initialize model catalog & filter bar directly
renderModelTypeFilterBar(document.getElementById('catalog-model-filters'));
renderOllamaCatalog();

// Bind catalog Load More button
const btnLoadMoreModels = document.getElementById('btn-load-more-models');
if (btnLoadMoreModels) {
  btnLoadMoreModels.addEventListener('click', (e) => {
    e.preventDefault();
    catalogLimit += 12;
    renderOllamaCatalog(inputDownloadModel ? inputDownloadModel.value : '');
  });
}

// Bind catalog search input filter & live HF search
if (inputDownloadModel) {
  inputDownloadModel.addEventListener('input', () => {
    triggerLiveHuggingFaceSearch(inputDownloadModel.value);
  });
}

// Bind clicks & enter key to send
btnSend.addEventListener('click', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (isAwaitingResponse) return;
  submitPrompt();
});

// Stop / cancel generation button
if (btnStop) {
  btnStop.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (_activeAbortController) {
      _activeAbortController.abort();
      logTrace('User clicked Stop — aborting generation.', 'system');
    }
  });
}

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
  const newHeight = Math.max(Math.min(scrollHeight, 160), 33);
  chatInput.style.height = `${newHeight}px`;
  logTrace(`Input height recalculated: scrollHeight=${scrollHeight}px, applied=${newHeight}px`, 'system');
};

chatInput.addEventListener('input', adjustInputHeight);
chatInput.addEventListener('change', adjustInputHeight);
chatInput.addEventListener('focus', adjustInputHeight);
chatInput.addEventListener('keyup', adjustInputHeight);

// New Chat Trigger handler
const triggerNewChat = () => {
  if (typeof closeSettingsPanel === 'function') {
    closeSettingsPanel();
  }
  chatMessagesContainer.innerHTML = '';
  currentSessionId = null;
  setSendingState(false);
  
  const chatMain = document.querySelector('.chat-main');
  if (chatMain) {
    chatMain.classList.add('empty-state');
  }
  updateWelcomeGreeting();
  
  logTrace('New chat isolation workspace container generated.', 'system');
  activeSubgoals = [];
  renderChecklist([]);
  
  if (activeChatTitle) activeChatTitle.textContent = 'New chat';
  
  // Remove active highlight from all history items
  const sessionHistoryList = document.getElementById('session-history-list');
  if (sessionHistoryList) {
    const items = sessionHistoryList.querySelectorAll('.session-history-item');
    items.forEach(i => i.classList.remove('active'));
  }
};

if (btnNewChat) btnNewChat.addEventListener('click', triggerNewChat);
if (btnNewSession) btnNewSession.addEventListener('click', triggerNewChat);

function getUserFirstName() {
  const fn = window.localStorage.getItem('ultron-user-first-name');
  if (fn && fn.trim()) return fn.trim();
  const fullName = window.localStorage.getItem('ultron-user-name');
  if (fullName && fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts[0]) return parts[0];
  }
  return 'User';
}

function getUserLastName() {
  const ln = window.localStorage.getItem('ultron-user-last-name');
  if (ln && ln.trim()) return ln.trim();
  const fullName = window.localStorage.getItem('ultron-user-name');
  if (fullName && fullName.trim()) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length > 1) return parts.slice(1).join(' ');
  }
  return '';
}

function getUserFullName() {
  const fn = getUserFirstName();
  const ln = getUserLastName();
  if (fn === 'User' && !ln) return 'User';
  return `${fn} ${ln}`.trim();
}

function getUserEmail() {
  const email = window.localStorage.getItem('ultron-user-email');
  if (email && email.trim()) return email.trim();
  return 'user@example.com';
}

function getUserInitials() {
  const fn = getUserFirstName();
  const ln = getUserLastName();
  if (fn !== 'User' && ln) {
    return (fn[0] + ln[0]).toUpperCase();
  }
  if (fn && fn !== 'User') {
    return fn.slice(0, 2).toUpperCase();
  }
  return 'U';
}

function updateWelcomeGreeting() {
  const welcomeTitle = document.getElementById('welcome-title');
  if (!welcomeTitle) return;

  const firstName = getUserFirstName();

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

async function loadAccountDetails(options = {}) {
  if (window.ultronAPI && window.ultronAPI.loadUserProfile) {
    try {
      const storedProfile = await window.ultronAPI.loadUserProfile();
      if (storedProfile) {
        if (storedProfile.fullName && !window.localStorage.getItem('ultron-user-name')) {
          window.localStorage.setItem('ultron-user-name', storedProfile.fullName);
        }
        if (storedProfile.firstName && !window.localStorage.getItem('ultron-user-first-name')) {
          window.localStorage.setItem('ultron-user-first-name', storedProfile.firstName);
        }
        if (storedProfile.lastName && !window.localStorage.getItem('ultron-user-last-name')) {
          window.localStorage.setItem('ultron-user-last-name', storedProfile.lastName);
        }
        if (storedProfile.birthdate && !window.localStorage.getItem('ultron-user-birthdate')) {
          window.localStorage.setItem('ultron-user-birthdate', storedProfile.birthdate);
        }
        if (storedProfile.email && !window.localStorage.getItem('ultron-user-email')) {
          window.localStorage.setItem('ultron-user-email', storedProfile.email);
        }
      }
    } catch (e) {}
  }

  const name = getUserFullName();
  const email = getUserEmail();
  const birthdate = window.localStorage.getItem('ultron-user-birthdate') || '';
  const initials = getUserInitials();
  
  const accountName = document.getElementById('account-name');
  const accountEmail = document.getElementById('account-email');
  const accountAvatar = document.getElementById('account-avatar');
  const sidebarName = document.querySelector('.profile-name');
  const sidebarAvatar = document.querySelector('.avatar-circle');
  
  if (accountName) accountName.textContent = name;
  if (accountEmail) accountEmail.textContent = email;
  if (accountAvatar) accountAvatar.textContent = initials;
  if (sidebarName) sidebarName.textContent = name;
  if (sidebarAvatar) sidebarAvatar.textContent = initials;
  
  const inputName = document.getElementById('input-account-name');
  const inputEmail = document.getElementById('input-account-email');
  const inputBirthdate = document.getElementById('input-account-birthdate');
  if (inputName) inputName.value = name;
  if (inputEmail) inputEmail.value = email;
  if (inputBirthdate) inputBirthdate.value = birthdate;

  const inputHomeLocation = document.getElementById('setting-home-location');
  const locationStatus = document.getElementById('setting-location-status');
  const autoLocToggle = document.getElementById('setting-auto-location');
  const savedLoc = window.UltronLocationContext
    ? window.UltronLocationContext.getSavedLocation()
    : (window.localStorage.getItem('ultron-user-location') || '');
  if (inputHomeLocation && savedLoc) inputHomeLocation.value = savedLoc;
  if (locationStatus && savedLoc) {
    locationStatus.textContent = `Location: ${savedLoc}`;
  }
  syncDetectLocationButtonFromSavedLocation();
  if (autoLocToggle) {
    autoLocToggle.checked = window.localStorage.getItem('ultron-auto-location-enabled') !== 'false';
  }

  // Detect location ONCE on startup or when explicitly forced
  if (options.forceLocationRefresh) {
    await autoDetectHomeLocation({
      silent: true,
      reason: options.locationReason || 'account-load',
      forceRefresh: true
    });
  } else if (!savedLoc && options.locationReason === 'startup') {
    await autoDetectHomeLocation({
      silent: true,
      reason: 'startup',
      forceRefresh: false
    });
  }

  // Silently sync desktop app telemetry & onboarding email in background
  syncDesktopAppTelemetry().catch(() => {});
}

// ── Silent Background Telemetry & Onboarding Email Sync ─────────────────────
function getOrCreateDesktopDeviceId() {
  try {
    let id = window.localStorage.getItem('ultron-device-id');
    if (!id) {
      const rand = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12);
      id = `win_${Date.now().toString(36)}_${rand}`;
      window.localStorage.setItem('ultron-device-id', id);
    }
    return id;
  } catch (_) {
    return `win_sess_${Date.now()}`;
  }
}

async function syncDesktopAppTelemetry() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const userEmail = (window.localStorage.getItem('ultron-user-email') || '').trim();
    const userName = (window.localStorage.getItem('ultron-user-name') || '').trim();
    const deviceId = getOrCreateDesktopDeviceId();
    const privacyAccepted = window.localStorage.getItem('ultron-privacy-accepted') === 'true';
    const privacyAcceptedAt = window.localStorage.getItem('ultron-privacy-accepted-at') || (privacyAccepted ? new Date().toISOString() : '');
    const privacyVersion = window.localStorage.getItem('ultron-privacy-version') || '1.0';

    if (!userEmail || userEmail === 'user@example.com' || !userEmail.includes('@')) {
      return;
    }

    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/ultron-da7a0/databases/(default)/documents/deviceAppSync/${deviceId}`;
    const payload = {
      fields: {
        deviceId: { stringValue: deviceId },
        email: { stringValue: userEmail.toLowerCase() },
        name: { stringValue: userName || userEmail.split('@')[0] },
        platform: { stringValue: 'Windows 11 / 10 x64' },
        appVersion: { stringValue: 'v1.0.15' },
        onboarded: { booleanValue: true },
        privacyAccepted: { booleanValue: privacyAccepted },
        privacyAcceptedAt: { stringValue: privacyAcceptedAt },
        privacyVersion: { stringValue: privacyVersion },
        lastOnlineAt: { timestampValue: new Date().toISOString() }
      }
    };

    await fetch(firestoreUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (_) {
    // Silent fail in background
  }
}

// Auto-trigger background telemetry on startup and when connection resumes
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncDesktopAppTelemetry().catch(() => {});
  });
  setTimeout(() => {
    syncDesktopAppTelemetry().catch(() => {});
  }, 4000);
  setInterval(() => {
    syncDesktopAppTelemetry().catch(() => {});
  }, 30 * 60 * 1000);
}

async function checkAndRunFirstTimeOnboarding() {
  let isCompleted = window.localStorage.getItem('ultron-setup-completed') === 'true';
  if (!isCompleted && window.ultronAPI && window.ultronAPI.loadSetupStatus) {
    try {
      isCompleted = await window.ultronAPI.loadSetupStatus();
      if (isCompleted) {
        window.localStorage.setItem('ultron-setup-completed', 'true');
      }
    } catch (e) {}
  }

  if (isCompleted) {
    return;
  }

  const onboardingScreen = document.getElementById('onboarding-screen');
  if (!onboardingScreen) return;

  // Show integrated onboarding screen directly inside the app interface
  onboardingScreen.classList.remove('hidden');

  let currentStep = 0;

  const step0 = document.getElementById('onboard-step-0');
  const formShell = document.getElementById('onboard-form-shell');
  const stepHeading = document.getElementById('onboard-step-heading');
  const step1 = document.getElementById('onboard-step-1');
  const step2 = document.getElementById('onboard-step-2');
  const step3 = document.getElementById('onboard-step-3');
  const step4 = document.getElementById('onboard-step-4');
  const step5 = document.getElementById('onboard-step-5');
  const footerActions = document.getElementById('onboard-footer-actions');

  const fullNameInput = document.getElementById('onboard-full-name');
  const birthdateInput = document.getElementById('onboard-birthdate');
  const emailInput = document.getElementById('onboard-email');

  const error1 = document.getElementById('onboard-step-1-error');
  const error2 = document.getElementById('onboard-step-2-error');
  const error3 = document.getElementById('onboard-step-3-error');

  const btnStart = document.getElementById('btn-onboard-start');
  const btnNext = document.getElementById('btn-onboard-next');
  const btnBack = document.getElementById('btn-onboard-back');
  const btnFinish = document.getElementById('btn-onboard-finish');
  const btnInstallOllama = document.getElementById('btn-onboard-install-ollama');
  const btnRetryOllama = document.getElementById('btn-onboard-retry-ollama');

  let ollamaReady = false;
  let readyRedirectTimer = null;
  let onboardVoiceMuted = false;
  let currentOnboardAudioElem = null;

  const ONBOARD_AUDIO_CANDIDATES = {
    0: [
      '../../Assets/sounds/step-0-welcom.mp3',
      '../../Assets/sounds/step-0-welcome.mp3',
      '../../Assets/sounds/onboarding/step-0-welcome.mp3',
      '../../Assets/sounds/onboarding/step-0-welcom.mp3'
    ],
    1: [
      '../../Assets/sounds/step-1-name.mp3',
      '../../Assets/sounds/onboarding/step-1-name.mp3'
    ],
    2: [
      '../../Assets/sounds/step-2-birthdate.mp3',
      '../../Assets/sounds/onboarding/step-2-birthdate.mp3'
    ],
    3: [
      '../../Assets/sounds/step-3-email.mp3',
      '../../Assets/sounds/onboarding/step-3-email.mp3'
    ],
    4: [
      '../../Assets/sounds/step-4-requirements.mp3',
      '../../Assets/sounds/onboarding/step-4-requirements.mp3'
    ],
    5: [
      '../../Assets/sounds/step-5-ready.mp3',
      '../../Assets/sounds/onboarding/step-5-ready.mp3'
    ]
  };

  async function speakOnboardStep(step) {
    if (onboardVoiceMuted) return;
    const candidates = ONBOARD_AUDIO_CANDIDATES[step];
    if (!candidates || !candidates.length) return;
    await playOnboardAudioCandidates(candidates);
  }

  async function playOnboardAudioCandidates(candidates) {
    stopOnboardVoice();
    if (onboardVoiceMuted) return;

    const voiceBtn = document.getElementById('btn-onboard-voice-guide');
    if (voiceBtn) {
      voiceBtn.classList.add('is-speaking');
      const wave = voiceBtn.querySelector('.voice-wave-container');
      const iconIdle = voiceBtn.querySelector('.voice-icon-idle');
      const iconMuted = voiceBtn.querySelector('.voice-icon-muted');
      if (wave) wave.classList.remove('hidden');
      if (iconIdle) iconIdle.classList.add('hidden');
      if (iconMuted) iconMuted.classList.add('hidden');
    }

    function setVoiceIdleState() {
      if (voiceBtn) {
        voiceBtn.classList.remove('is-speaking');
        const wave = voiceBtn.querySelector('.voice-wave-container');
        const iconIdle = voiceBtn.querySelector('.voice-icon-idle');
        const iconMuted = voiceBtn.querySelector('.voice-icon-muted');
        if (wave) wave.classList.add('hidden');
        if (iconIdle) iconIdle.classList.toggle('hidden', onboardVoiceMuted);
        if (iconMuted) iconMuted.classList.toggle('hidden', !onboardVoiceMuted);
      }
    }

    for (const src of candidates) {
      try {
        const audio = new Audio(src);
        currentOnboardAudioElem = audio;
        audio.onended = () => {
          currentOnboardAudioElem = null;
          setVoiceIdleState();
        };
        audio.onerror = () => {
          currentOnboardAudioElem = null;
          setVoiceIdleState();
        };
        await audio.play();
        return;
      } catch (err) {
        currentOnboardAudioElem = null;
      }
    }
    setVoiceIdleState();
  }

  function stopOnboardVoice() {
    if (currentOnboardAudioElem) {
      try {
        currentOnboardAudioElem.pause();
        currentOnboardAudioElem.currentTime = 0;
      } catch (e) {}
      currentOnboardAudioElem = null;
    }

    const voiceBtn = document.getElementById('btn-onboard-voice-guide');
    if (voiceBtn) {
      voiceBtn.classList.remove('is-speaking');
      const wave = voiceBtn.querySelector('.voice-wave-container');
      const iconIdle = voiceBtn.querySelector('.voice-icon-idle');
      const iconMuted = voiceBtn.querySelector('.voice-icon-muted');
      if (wave) wave.classList.add('hidden');
      if (iconIdle) iconIdle.classList.toggle('hidden', onboardVoiceMuted);
      if (iconMuted) iconMuted.classList.toggle('hidden', !onboardVoiceMuted);
    }
  }

  const btnVoiceGuide = document.getElementById('btn-onboard-voice-guide');
  if (btnVoiceGuide) {
    btnVoiceGuide.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btnVoiceGuide.classList.contains('is-speaking')) {
        onboardVoiceMuted = true;
        btnVoiceGuide.classList.add('is-muted');
        stopOnboardVoice();
      } else if (onboardVoiceMuted) {
        onboardVoiceMuted = false;
        btnVoiceGuide.classList.remove('is-muted');
        speakOnboardStep(currentStep);
      } else {
        speakOnboardStep(currentStep);
      }
    });
  }

  const stepHeadings = {
    1: 'Your profile',
    2: 'Date of birth',
    3: 'Email',
    4: 'Requirements & Components',
  };

  function setFinishVisible(visible) {
    if (!btnFinish) return;
    btnFinish.classList.toggle('hidden', !visible);
    btnFinish.disabled = !visible;
  }

  function setOllamaActionBoxes({ notInstalled = false, notRunning = false } = {}) {
    const notInstalledBox = document.getElementById('ollama-not-installed-box');
    const notRunningBox = document.getElementById('ollama-not-running-box');
    const progressRow = document.getElementById('ollama-install-progress-row');

    if (notInstalledBox) notInstalledBox.classList.toggle('hidden', !notInstalled);
    if (notRunningBox) notRunningBox.classList.toggle('hidden', !notRunning);
    if (progressRow && !notInstalled) progressRow.classList.add('hidden');
  }

  async function finishOnboarding() {
    const privacyCheckbox = document.getElementById('onboard-privacy-checkbox');
    const privacyError = document.getElementById('onboard-privacy-error');
    if (privacyCheckbox && !privacyCheckbox.checked) {
      if (privacyError) privacyError.classList.remove('hidden');
      return;
    }
    if (privacyError) privacyError.classList.add('hidden');

    window.localStorage.setItem('ultron-privacy-accepted', 'true');
    window.localStorage.setItem('ultron-privacy-accepted-at', new Date().toISOString());
    window.localStorage.setItem('ultron-privacy-version', '1.0');

    stopOnboardVoice();
    window.localStorage.setItem('ultron-setup-completed', 'true');
    if (window.ultronAPI && window.ultronAPI.saveSetupStatus) {
      await window.ultronAPI.saveSetupStatus(true);
    }
    onboardingScreen.classList.add('hidden');

    await loadAccountDetails();
    updateWelcomeGreeting();
    logTrace('First-time setup completed successfully! Welcome to Brown AI.', 'system');
  }

  // Pre-fill existing user info if available
  const existingName = window.localStorage.getItem('ultron-user-name');
  const existingFn = window.localStorage.getItem('ultron-user-first-name');
  const existingLn = window.localStorage.getItem('ultron-user-last-name');
  const existingBd = window.localStorage.getItem('ultron-user-birthdate');
  const existingEm = window.localStorage.getItem('ultron-user-email');

  if (fullNameInput) {
    if (existingName) fullNameInput.value = existingName;
    else if (existingFn) fullNameInput.value = `${existingFn} ${existingLn || ''}`.trim();
  }
  if (emailInput && existingEm && existingEm !== 'user@example.com') emailInput.value = existingEm;

  function parseDateStr(str) {
    if (!str) return null;
    const cleaned = str.trim();
    if (!cleaned) return null;

    // YYYY-MM-DD
    let match = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10) - 1;
      const d = parseInt(match[3], 10);
      const date = new Date(y, m, d);
      if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
        return date;
      }
    }

    // DD-MM-YYYY or MM-DD-YYYY
    match = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
    if (match) {
      let p1 = parseInt(match[1], 10);
      let p2 = parseInt(match[2], 10);
      let y = parseInt(match[3], 10);
      let d = p1, m = p2 - 1;
      if (p1 <= 12 && p2 > 12) {
        m = p1 - 1;
        d = p2;
      }
      const date = new Date(y, m, d);
      if (date.getFullYear() === y && date.getMonth() === m && date.getDate() === d) {
        return date;
      }
    }

    const timestamp = Date.parse(cleaned);
    if (!isNaN(timestamp)) {
      const d = new Date(timestamp);
      if (!isNaN(d.getTime())) return d;
    }

    return null;
  }

  function formatDateISO(date) {
    if (!date || isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  function attachDateSlashFormatter(input) {
    if (!input) return;

    let isDeleting = false;
    input.addEventListener('keydown', (e) => {
      isDeleting = e.key === 'Backspace' || e.key === 'Delete';
    });

    input.addEventListener('input', () => {
      if (isDeleting) return;

      const raw = input.value;
      const digits = raw.replace(/\D/g, '').slice(0, 8);
      if (!digits) {
        input.value = '';
        return;
      }

      let formatted = '';
      if (digits.length >= 4 && (digits.startsWith('19') || digits.startsWith('20'))) {
        // YYYY/MM/DD pattern
        if (digits.length <= 4) {
          formatted = digits;
        } else if (digits.length <= 6) {
          formatted = `${digits.slice(0, 4)}/${digits.slice(4)}`;
        } else {
          formatted = `${digits.slice(0, 4)}/${digits.slice(4, 6)}/${digits.slice(6, 8)}`;
        }
      } else {
        // DD/MM/YYYY pattern
        if (digits.length <= 2) {
          formatted = digits;
        } else if (digits.length <= 4) {
          formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
        } else {
          formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
        }
      }

      input.value = formatted;
    });
  }

  function initCustomDatePicker() {
    const dateInput = document.getElementById('onboard-birthdate');
    const toggleBtn = document.getElementById('onboard-date-toggle');
    const popover = document.getElementById('custom-dob-picker');
    const monthSelect = document.getElementById('dob-picker-month');
    const yearSelect = document.getElementById('dob-picker-year');
    const prevBtn = document.getElementById('dob-picker-prev');
    const nextBtn = document.getElementById('dob-picker-next');
    const daysContainer = document.getElementById('dob-picker-days');
    const clearBtn = document.getElementById('dob-picker-clear');
    const todayBtn = document.getElementById('dob-picker-today');
    const container = document.getElementById('onboard-date-field-container');

    if (!dateInput || !popover || !monthSelect || !yearSelect || !daysContainer) return;

    attachDateSlashFormatter(dateInput);

    // Populate years (1920 to current year)
    const currentYearNow = new Date().getFullYear();
    yearSelect.innerHTML = '';
    for (let y = currentYearNow; y >= 1920; y--) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      yearSelect.appendChild(opt);
    }

    let selectedDate = parseDateStr(existingBd) || (dateInput.value ? parseDateStr(dateInput.value) : null);
    let viewMonth = selectedDate ? selectedDate.getMonth() : 0; // Jan
    let viewYear = selectedDate ? selectedDate.getFullYear() : 2005; // default 2005 for onboarding DOB

    function renderDays() {
      monthSelect.value = viewMonth;
      yearSelect.value = viewYear;
      daysContainer.innerHTML = '';

      const firstDayIdx = new Date(viewYear, viewMonth, 1).getDay();
      const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
      const prevMonthTotalDays = new Date(viewYear, viewMonth, 0).getDate();

      const today = new Date();

      // Prev month days padding
      for (let i = firstDayIdx - 1; i >= 0; i--) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'datepicker-day other-month';
        btn.textContent = prevMonthTotalDays - i;
        btn.addEventListener('click', () => {
          if (viewMonth === 0) {
            viewMonth = 11;
            viewYear--;
          } else {
            viewMonth--;
          }
          selectDay(prevMonthTotalDays - i);
        });
        daysContainer.appendChild(btn);
      }

      // Current month days
      for (let day = 1; day <= totalDays; day++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'datepicker-day';
        btn.textContent = day;

        const isToday = today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day;
        if (isToday) btn.classList.add('today');

        const isSelected = selectedDate && selectedDate.getFullYear() === viewYear && selectedDate.getMonth() === viewMonth && selectedDate.getDate() === day;
        if (isSelected) btn.classList.add('selected');

        btn.addEventListener('click', () => selectDay(day));
        daysContainer.appendChild(btn);
      }

      // Next month days padding to make 6 rows (42 grid cells)
      const totalRendered = firstDayIdx + totalDays;
      const remainingCells = 42 - totalRendered;
      for (let day = 1; day <= remainingCells; day++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'datepicker-day other-month';
        btn.textContent = day;
        btn.addEventListener('click', () => {
          if (viewMonth === 11) {
            viewMonth = 0;
            viewYear++;
          } else {
            viewMonth++;
          }
          selectDay(day);
        });
        daysContainer.appendChild(btn);
      }
    }

    function selectDay(day) {
      selectedDate = new Date(viewYear, viewMonth, day);
      const isoStr = formatDateISO(selectedDate);
      dateInput.value = isoStr;
      if (error2) error2.classList.add('hidden');
      renderDays();
      popover.classList.add('hidden');
    }

    function openPicker() {
      const parsed = parseDateStr(dateInput.value);
      if (parsed) {
        selectedDate = parsed;
        viewMonth = parsed.getMonth();
        viewYear = parsed.getFullYear();
      }
      renderDays();
      popover.classList.remove('hidden');
    }

    function togglePicker() {
      if (popover.classList.contains('hidden')) {
        openPicker();
      } else {
        popover.classList.add('hidden');
      }
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePicker();
      });
    }

    dateInput.addEventListener('click', (e) => {
      e.stopPropagation();
      openPicker();
    });

    monthSelect.addEventListener('change', (e) => {
      viewMonth = parseInt(e.target.value, 10);
      renderDays();
    });

    yearSelect.addEventListener('change', (e) => {
      viewYear = parseInt(e.target.value, 10);
      renderDays();
    });

    if (prevBtn) {
      prevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (viewMonth === 0) {
          viewMonth = 11;
          viewYear--;
        } else {
          viewMonth--;
        }
        renderDays();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (viewMonth === 11) {
          viewMonth = 0;
          viewYear++;
        } else {
          viewMonth++;
        }
        renderDays();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedDate = null;
        dateInput.value = '';
        renderDays();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const now = new Date();
        viewMonth = now.getMonth();
        viewYear = now.getFullYear();
        selectDay(now.getDate());
      });
    }

    dateInput.addEventListener('input', () => {
      const parsed = parseDateStr(dateInput.value);
      if (parsed) {
        selectedDate = parsed;
        viewMonth = parsed.getMonth();
        viewYear = parsed.getFullYear();
        if (error2) error2.classList.add('hidden');
        renderDays();
      }
    });

    document.addEventListener('click', (e) => {
      if (container && !container.contains(e.target)) {
        popover.classList.add('hidden');
      }
    });

    if (selectedDate) {
      dateInput.value = formatDateISO(selectedDate);
    }
  }

  initCustomDatePicker();

  if (fullNameInput) {
    fullNameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnNext) btnNext.click();
      }
    });
  }

  if (birthdateInput) {
    birthdateInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnNext) btnNext.click();
      }
    });
  }

  if (emailInput) {
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (btnNext) btnNext.click();
      }
    });
  }

  function updateStepUI() {
    const onWelcome = currentStep === 0;

    if (step0) step0.classList.toggle('hidden', !onWelcome);
    if (formShell) formShell.classList.toggle('hidden', onWelcome);

    // Automatically speak context guidance for the current onboarding step
    speakOnboardStep(currentStep);

    if (onWelcome) return;

    if (stepHeading && stepHeadings[currentStep]) {
      stepHeading.textContent = stepHeadings[currentStep];
      stepHeading.classList.remove('hidden');
    }

    // Hide all form steps
    if (step1) step1.classList.add('hidden');
    if (step2) step2.classList.add('hidden');
    if (step3) step3.classList.add('hidden');
    if (step4) step4.classList.add('hidden');
    if (step5) step5.classList.add('hidden');
    if (footerActions) footerActions.classList.remove('hidden');

    if (currentStep === 1) {
      if (step1) step1.classList.remove('hidden');
      if (fullNameInput) setTimeout(() => fullNameInput.focus(), 100);
      if (btnBack) btnBack.classList.add('hidden');
      if (btnNext) btnNext.classList.remove('hidden');
      if (btnFinish) btnFinish.classList.add('hidden');
    } else if (currentStep === 2) {
      if (step2) step2.classList.remove('hidden');
      if (birthdateInput) setTimeout(() => birthdateInput.focus(), 100);
      if (btnBack) btnBack.classList.remove('hidden');
      if (btnNext) btnNext.classList.remove('hidden');
      if (btnFinish) btnFinish.classList.add('hidden');
    } else if (currentStep === 3) {
      if (step3) step3.classList.remove('hidden');
      if (emailInput) setTimeout(() => emailInput.focus(), 100);
      if (btnBack) btnBack.classList.remove('hidden');
      if (btnNext) btnNext.classList.remove('hidden');
      if (btnFinish) btnFinish.classList.add('hidden');
    } else if (currentStep === 4) {
      if (step4) step4.classList.remove('hidden');
      if (btnBack) btnBack.classList.remove('hidden');
      if (btnNext) btnNext.classList.add('hidden');
      // Voice models are a mandatory setup component — no skipping.
      if (btnSkipLater) btnSkipLater.classList.add('hidden');
      setFinishVisible(Boolean(compStatus.kokoro));
      runOboardingRequirementsCheck();
    } else if (currentStep === 5) {
      if (step5) step5.classList.remove('hidden');
      if (stepHeading) stepHeading.classList.add('hidden');
      if (footerActions) footerActions.classList.add('hidden');
    }
  }

  if (btnStart) {
    btnStart.onclick = () => {
      currentStep = 1;
      updateStepUI();
    };
  }

  // Next / Continue button handler
  if (btnNext) {
    btnNext.onclick = async () => {
      if (currentStep === 1) {
        const rawName = fullNameInput ? fullNameInput.value.trim() : '';
        if (!rawName) {
          if (error1) error1.classList.remove('hidden');
          return;
        }
        if (error1) error1.classList.add('hidden');

        const parts = rawName.split(/\s+/);
        const fn = parts[0] || 'User';
        const ln = parts.slice(1).join(' ') || '';

        window.localStorage.setItem('ultron-user-name', rawName);
        window.localStorage.setItem('ultron-user-first-name', fn);
        window.localStorage.setItem('ultron-user-last-name', ln);

        currentStep = 2;
        updateStepUI();
      } else if (currentStep === 2) {
        const rawBd = birthdateInput ? birthdateInput.value.trim() : '';
        const parsed = parseDateStr(rawBd);
        if (!rawBd || !parsed) {
          if (error2) error2.classList.remove('hidden');
          return;
        }
        if (error2) error2.classList.add('hidden');

        const isoDate = formatDateISO(parsed);
        birthdateInput.value = isoDate;
        window.localStorage.setItem('ultron-user-birthdate', isoDate);

        currentStep = 3;
        updateStepUI();
      } else if (currentStep === 3) {
        const em = emailInput ? emailInput.value.trim() : '';
        if (!em || !em.includes('@')) {
          if (error3) error3.classList.remove('hidden');
          return;
        }
        if (error3) error3.classList.add('hidden');

        window.localStorage.setItem('ultron-user-email', em);

        const fullName = window.localStorage.getItem('ultron-user-name') || '';
        const fn = window.localStorage.getItem('ultron-user-first-name') || '';
        const ln = window.localStorage.getItem('ultron-user-last-name') || '';
        const bd = window.localStorage.getItem('ultron-user-birthdate') || '';

        if (window.ultronAPI && window.ultronAPI.saveUserProfile) {
          await window.ultronAPI.saveUserProfile({ fullName, firstName: fn, lastName: ln, birthdate: bd, email: em });
        }

        await loadAccountDetails();
        updateWelcomeGreeting();

        currentStep = 4;
        updateStepUI();
      }
    };
  }

  // Back button handler
  if (btnBack) {
    btnBack.onclick = () => {
      if (currentStep > 1) {
        currentStep--;
        updateStepUI();
      }
    };
  }

  // Multi-Component Requirements Check & Setup (Step 4)
  let compStatus = {
    ollama: false,
    uia: false,
    kokoro: false
  };

  async function checkOllamaComp() {
    const badge = document.getElementById('onboard-badge-ollama');
    const desc = document.getElementById('onboard-desc-ollama');
    const btn = document.getElementById('btn-onboard-action-ollama');
    if (badge) { badge.className = 'onboard-comp-badge checking'; badge.textContent = 'Checking…'; }
    if (desc) desc.textContent = 'Verifying Ollama local neural service…';

    const conn = await checkOllamaConnection();
    if (conn.connected) {
      compStatus.ollama = true;
      if (badge) { badge.className = 'onboard-comp-badge ready'; badge.textContent = 'Ready'; }
      if (desc) desc.textContent = 'Ollama is online and connected (Localhost:11434).';
      if (btn) { btn.textContent = 'Connected'; btn.className = 'btn-onboard-comp-action installed'; btn.disabled = true; }
      return true;
    }

    if (window.ultronAPI?.checkOllamaInstalled) {
      const installCheck = await window.ultronAPI.checkOllamaInstalled();
      if (installCheck.installed) {
        if (desc) desc.textContent = 'Ollama installed. Starting background service…';
        await window.ultronAPI.startOllamaService(installCheck.path).catch(() => {});
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 800));
          const retry = await checkOllamaConnection();
          if (retry.connected) {
            compStatus.ollama = true;
            if (badge) { badge.className = 'onboard-comp-badge ready'; badge.textContent = 'Ready'; }
            if (desc) desc.textContent = 'Ollama is online and connected.';
            if (btn) { btn.textContent = 'Connected'; btn.className = 'btn-onboard-comp-action installed'; btn.disabled = true; }
            return true;
          }
        }
      }
    }

    compStatus.ollama = false;
    if (badge) { badge.className = 'onboard-comp-badge missing'; badge.textContent = 'Not Running'; }
    if (desc) desc.textContent = 'Ollama is not running. Install or launch Ollama to run local models.';
    if (btn) { btn.textContent = 'Install / Start'; btn.className = 'btn-onboard-comp-action'; btn.disabled = false; }
    return false;
  }

  async function checkUiaComp() {
    const badge = document.getElementById('onboard-badge-uia');
    const desc = document.getElementById('onboard-desc-uia');
    const btn = document.getElementById('btn-onboard-action-uia');
    if (badge) { badge.className = 'onboard-comp-badge checking'; badge.textContent = 'Checking…'; }
    if (desc) desc.textContent = 'Verifying Windows UI automation server…';

    try {
      const res = await window.ultronAPI?.checkMcpWindowsUia?.();
      if (res?.installed) {
        compStatus.uia = true;
        if (badge) { badge.className = 'onboard-comp-badge ready'; badge.textContent = 'Installed'; }
        if (desc) desc.textContent = 'Windows UI Automation server is ready for desktop control.';
        if (btn) { btn.textContent = 'Installed'; btn.className = 'btn-onboard-comp-action installed'; btn.disabled = true; }
        return true;
      }
    } catch (e) {}

    compStatus.uia = false;
    if (badge) { badge.className = 'onboard-comp-badge not-installed'; badge.textContent = 'Available'; }
    if (desc) desc.textContent = 'Enables deep Windows UI automation and native app control.';
    if (btn) { btn.textContent = 'Setup Automation'; btn.className = 'btn-onboard-comp-action'; btn.disabled = false; }
    return false;
  }

  async function checkKokoroComp() {
    const badge = document.getElementById('onboard-badge-kokoro');
    const desc = document.getElementById('onboard-desc-kokoro');
    const btn = document.getElementById('btn-onboard-action-kokoro');
    if (badge) { badge.className = 'onboard-comp-badge checking'; badge.textContent = 'Checking…'; }
    if (desc) desc.textContent = 'Verifying Kokoro neural voice synthesizer…';

    try {
      const res = await window.ultronAPI?.getTtsCatalog?.();
      const models = res?.models || [];
      const heartInstalled = models.some(m => m.key === 'kokoro-heart' && m.installed);
      const michaelInstalled = models.some(m => m.key === 'kokoro-michael' && m.installed);

      if (heartInstalled && michaelInstalled) {
        compStatus.kokoro = true;
        if (badge) { badge.className = 'onboard-comp-badge ready'; badge.textContent = 'Installed'; }
        if (desc) desc.textContent = 'Heart & Michael neural voice models are ready.';
        if (btn) { btn.textContent = 'Ready'; btn.className = 'btn-onboard-comp-action installed'; btn.disabled = true; }
        return true;
      }
    } catch (e) {}

    compStatus.kokoro = false;
    if (badge) { badge.className = 'onboard-comp-badge not-installed'; badge.textContent = 'Required'; }
    if (desc) desc.textContent = 'Offline TTS · Downloads Heart (Female) & Michael (Male) voices. Required to finish setup.';
    if (btn) { btn.textContent = 'Download Voices'; btn.className = 'btn-onboard-comp-action'; btn.disabled = false; }
    return false;
  }

  async function runOboardingRequirementsCheck() {
    await Promise.all([
      checkOllamaComp(),
      checkUiaComp(),
      checkKokoroComp()
    ]);
    // Voice models are mandatory: auto-start their download on first check and
    // keep Finish locked until both Heart & Michael are on disk.
    if (!compStatus.kokoro) {
      await startKokoroOnboardDownload();
    }
    setFinishVisible(Boolean(compStatus.kokoro));
  }

  // Action listeners for individual cards
  const btnActionOllama = document.getElementById('btn-onboard-action-ollama');
  if (btnActionOllama) {
    btnActionOllama.onclick = async () => {
      btnActionOllama.disabled = true;
      await startOllamaInstallFlow(btnActionOllama);
      await checkOllamaComp();
    };
  }

  const btnActionUia = document.getElementById('btn-onboard-action-uia');
  if (btnActionUia) {
    btnActionUia.onclick = async () => {
      btnActionUia.disabled = true;
      btnActionUia.textContent = 'Setting up…';
      const badge = document.getElementById('onboard-badge-uia');
      if (badge) { badge.className = 'onboard-comp-badge downloading'; badge.textContent = 'Setting up…'; }
      await window.ultronAPI?.installMcpWindowsUia?.();
      await checkUiaComp();
    };
  }

  const btnActionKokoro = document.getElementById('btn-onboard-action-kokoro');
  async function startKokoroOnboardDownload() {
    const btn = document.getElementById('btn-onboard-action-kokoro');
    const badge = document.getElementById('onboard-badge-kokoro');
    if (btn) { btn.disabled = true; btn.textContent = 'Downloading…'; }
    if (badge) { badge.className = 'onboard-comp-badge downloading'; badge.textContent = 'Downloading…'; }
    await window.ultronAPI?.downloadKokoroOnboardingVoices?.();
    await checkKokoroComp();
    setFinishVisible(Boolean(compStatus.kokoro));
  }
  if (btnActionKokoro) {
    btnActionKokoro.onclick = () => startKokoroOnboardDownload();
  }

  // Batch action: Download all missing requirements
  const btnDownloadAll = document.getElementById('btn-onboard-download-all');
  if (btnDownloadAll) {
    btnDownloadAll.onclick = async () => {
      btnDownloadAll.disabled = true;
      btnDownloadAll.innerHTML = `<div class="onboard-spinner"></div> Setting up all components…`;

      // 1. UIA
      if (!compStatus.uia && window.ultronAPI?.installMcpWindowsUia) {
        await window.ultronAPI.installMcpWindowsUia().catch(() => {});
        await checkUiaComp();
      }

      // 2. Kokoro
      if (!compStatus.kokoro && window.ultronAPI?.downloadKokoroOnboardingVoices) {
        await window.ultronAPI.downloadKokoroOnboardingVoices().catch(() => {});
        await checkKokoroComp();
      }

      // 3. Ollama
      if (!compStatus.ollama) {
        await checkOllamaComp();
      }

      setFinishVisible(Boolean(compStatus.kokoro));
      btnDownloadAll.disabled = false;
      btnDownloadAll.innerHTML = `✓ Requirements Setup Complete`;
      btnDownloadAll.classList.add('installed');
    };
  }

  // Skip / Setup Later button
  const btnSkipLater = document.getElementById('btn-onboard-skip-later');
  if (btnSkipLater) {
    btnSkipLater.onclick = async () => {
      currentStep = 5;
      updateStepUI();
      if (readyRedirectTimer) clearTimeout(readyRedirectTimer);
      readyRedirectTimer = setTimeout(async () => {
        readyRedirectTimer = null;
        await finishOnboarding();
      }, 2000);
    };
  }

  // Finish setup — show ready screen, then redirect to main agent UI
  if (btnFinish) {
    btnFinish.onclick = async () => {
      currentStep = 5;
      updateStepUI();

      if (readyRedirectTimer) clearTimeout(readyRedirectTimer);
      readyRedirectTimer = setTimeout(async () => {
        readyRedirectTimer = null;
        await finishOnboarding();
      }, 2400);
    };
  }

  // Initialize welcome screen
  updateStepUI();
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

const btnPlusMenu = document.getElementById('btn-plus-menu');
const plusMenuWrapper = document.getElementById('plus-menu-wrapper');
const plusMenuDropdown = document.getElementById('plus-menu-dropdown');
const plusMenuAttach = document.getElementById('plus-menu-attach');
const hiddenFileInput = document.getElementById('hidden-file-input');
const attachmentPreviewBar = document.getElementById('attachment-preview-bar');

function closePlusMenu() {
  if (!plusMenuWrapper || !plusMenuDropdown || !btnPlusMenu) return;
  plusMenuDropdown.classList.add('hidden');
  plusMenuWrapper.classList.remove('open');
  btnPlusMenu.setAttribute('aria-expanded', 'false');
}

function togglePlusMenu() {
  if (!plusMenuWrapper || !plusMenuDropdown || !btnPlusMenu) return;
  const willOpen = plusMenuDropdown.classList.contains('hidden');
  if (willOpen) {
    syncModelAttachmentCapabilities();
    plusMenuDropdown.classList.remove('hidden');
    plusMenuWrapper.classList.add('open');
    btnPlusMenu.setAttribute('aria-expanded', 'true');
  } else {
    closePlusMenu();
  }
}

async function processAndAttachFiles(files) {
  const caps = getModelCapabilities(activeModel);
  let hasImageOnTextModel = false;

  for (const file of Array.from(files)) {
    if (attachedFiles.some(f => f.name === file.name && f.size === file.size)) continue;

    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);
    let textContent = '';
    let dataUrl = '';

    if (isImage) {
      if (!caps.isVision) {
        hasImageOnTextModel = true;
      }
      try {
        dataUrl = await new Promise((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result);
          reader.onerror = rej;
          reader.readAsDataURL(file);
        });
      } catch (err) {
        logTrace(`Failed to read image dataUrl for ${file.name}: ${err.message}`, 'error');
      }
    } else {
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
      if (isPdf) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          if (window.ultronAPI && typeof window.ultronAPI.extractPdfText === 'function') {
            const res = await window.ultronAPI.extractPdfText(bytes);
            if (res && res.success && res.text) {
              textContent = res.text;
            }
          }
        } catch (err) {
          logTrace(`Failed to extract text from PDF ${file.name}: ${err.message}`, 'error');
        }
      } else if (file.size < 4 * 1024 * 1024) {
        try {
          textContent = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result);
            reader.onerror = rej;
            reader.readAsText(file);
          });
        } catch (err) {
          logTrace(`Failed to read text file ${file.name}: ${err.message}`, 'error');
        }
      }
    }

    attachedFiles.push({
      file,
      name: file.name,
      size: file.size,
      type: file.type || 'text/plain',
      isImage,
      textContent,
      dataUrl
    });
  }

  renderAttachmentPreviews(hasImageOnTextModel);
}

if (btnPlusMenu) {
  btnPlusMenu.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    togglePlusMenu();
  });
}

if (plusMenuAttach && hiddenFileInput) {
  plusMenuAttach.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closePlusMenu();
    syncModelAttachmentCapabilities();
    hiddenFileInput.click();
  });
}

document.querySelectorAll('.plus-menu-item.mode-option').forEach(btn => {
  btn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const mode = btn.dataset.mode;
    if (!mode) return;
    await applySecurityMode(mode, 'plus-menu');
    closePlusMenu();
  });
});

function syncPlusMenuToggles() {
  const toggles = [
    { id: 'plus-toggle-agent-tools', key: 'ultron-agent-tools-enabled' },
    { id: 'plus-toggle-screen-aware', key: 'ultron-screen-aware-enabled' },
    { id: 'plus-toggle-web-search', key: 'ultron-web-search-enabled' }
  ];
  toggles.forEach(({ id, key }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    const enabled = window.localStorage.getItem(key) !== 'false';
    btn.classList.toggle('active', enabled);
    btn.setAttribute('aria-checked', enabled ? 'true' : 'false');
  });
}

document.querySelectorAll('.plus-menu-item.toggle-option').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const keyMap = {
      'plus-toggle-agent-tools': 'ultron-agent-tools-enabled',
      'plus-toggle-screen-aware': 'ultron-screen-aware-enabled',
      'plus-toggle-web-search': 'ultron-web-search-enabled'
    };
    const key = keyMap[btn.id];
    if (!key) return;
    const next = window.localStorage.getItem(key) === 'false';
    window.localStorage.setItem(key, next ? 'true' : 'false');
    if (btn.id === 'plus-toggle-screen-aware' && settingScreenCaptureToggle) {
      settingScreenCaptureToggle.checked = next;
      window.localStorage.setItem('ultron-screen-capture-enabled', next ? 'true' : 'false');
    }
    syncPlusMenuToggles();
    logTrace(`Agent option "${btn.querySelector('.plus-menu-item-title')?.textContent || btn.id}" ${next ? 'enabled' : 'disabled'}.`, 'system');
  });
});

syncPlusMenuToggles();

if (chatMessagesContainer) {
  chatMessagesContainer.addEventListener('click', async (e) => {
    const fixBtn = e.target.closest('.error-fix-btn');
    if (fixBtn) {
      const action = fixBtn.dataset.fixAction;
      if (action === 'open-settings-apps') {
        openSettingsPanel('apps');
      } else if (action === 'enable-screen') {
        window.localStorage.setItem('ultron-screen-capture-enabled', 'true');
        window.localStorage.setItem('ultron-screen-aware-enabled', 'true');
        if (settingScreenCaptureToggle) settingScreenCaptureToggle.checked = true;
        syncPlusMenuToggles();
      } else if (action === 'switch-vision-model') {
        await ensureVisionModelForScreen();
        updateModelSelectorLabel();
      } else if (action === 'open-models') {
        openSettingsPanel('models');
      } else if (action === 'open-settings-desktop') {
        openSettingsPanel('desktop');
      } else if (action === 'open-app' && fixBtn.dataset.appName) {
        chatInput.value = `Open ${fixBtn.dataset.appName}`;
        chatInput.focus();
      } else if (action === 'undo-last' && window.UltronAgentExecutor) {
        const undoRes = await window.UltronAgentExecutor.popAndRunUndo();
        logTrace(undoRes.message || 'Undo attempted.', undoRes.success ? 'system' : 'error');
      }
      return;
    }
    const choiceBtn = e.target.closest('.clarify-choice-btn');
    if (choiceBtn && choiceBtn.dataset.appChoice) {
      chatInput.value = `Open ${choiceBtn.dataset.appChoice}`;
      chatInput.focus();
      playUltronSound('question');
    }
  });
}

document.querySelectorAll('.trace-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.trace-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _traceLogFilter = btn.dataset.traceFilter || 'all';
    window.localStorage.setItem('ultron-trace-filter', _traceLogFilter);
  });
});

// Restore persisted trace log filter
(function restoreTraceFilter() {
  const saved = window.localStorage.getItem('ultron-trace-filter');
  if (!saved || saved === 'all') return;
  const btn = document.querySelector(`.trace-filter-btn[data-trace-filter="${saved}"]`);
  if (btn) {
    document.querySelectorAll('.trace-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _traceLogFilter = saved;
  }
})();

let _liveMetricsTimer = null;
async function refreshLiveMetrics() {
  if (!window.ultronAPI || typeof window.ultronAPI.getLiveMetrics !== 'function') return;
  try {
    const res = await window.ultronAPI.getLiveMetrics();
    if (!res || !res.success) return;
    if (statRamLive) statRamLive.textContent = `${res.memoryUsedPct}% (${res.freeMemoryGB} GB free)`;
    if (statCpuLive && res.cpuLoadPct != null) statCpuLive.textContent = `${res.cpuLoadPct}%`;
  } catch (e) {}
}

function startLiveMetricsPolling() {
  refreshLiveMetrics();
  if (_liveMetricsTimer) clearInterval(_liveMetricsTimer);
  const intervalMs = getPerformanceProfile() === 'battery' ? 30000 : (getPerformanceProfile() === 'performance' ? 5000 : 12000);
  _liveMetricsTimer = setInterval(refreshLiveMetrics, intervalMs);
}

document.addEventListener('click', (e) => {
  if (plusMenuWrapper && !plusMenuWrapper.contains(e.target)) {
    closePlusMenu();
  }
});

if (hiddenFileInput) {
  hiddenFileInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      await processAndAttachFiles(e.target.files);
      // Document intake flow: a picker card asked for a file — resume the request
      if (_pendingIntakePrompt) {
        const resume = _pendingIntakePrompt;
        _pendingIntakePrompt = '';
        submitPrompt(resume);
      }
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
    inputWrapper.addEventListener('drop', async (e) => {
      e.preventDefault();
      inputWrapper.style.borderColor = '';
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        await processAndAttachFiles(e.dataTransfer.files);
      }
    });
  }
}

function renderAttachmentPreviews(hasImageWarning = false) {
  if (!attachmentPreviewBar) return;

  if (attachedFiles.length === 0) {
    attachmentPreviewBar.classList.add('hidden');
    attachmentPreviewBar.innerHTML = '';
    return;
  }

  attachmentPreviewBar.classList.remove('hidden');
  attachmentPreviewBar.innerHTML = '';

  const caps = getModelCapabilities(activeModel);

  if (hasImageWarning || (attachedFiles.some(f => f.isImage) && !caps.isVision)) {
    const warnBanner = document.createElement('div');
    warnBanner.className = 'attachment-warning-banner';
    warnBanner.style.cssText = 'width: 100%; font-size: 11px; color: #fbbf24; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.25); padding: 4px 8px; border-radius: 6px; margin-bottom: 6px; display: flex; align-items: center; justify-content: space-between;';
    warnBanner.innerHTML = `
      <span>⚠️ <b>${activeModel}</b> is a text-based model. Switch to Gemini or a Vision model to process image contents.</span>
      <button type="button" id="btn-switch-to-vision" style="background: #fbbf24; color: #000; border: none; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 10px; cursor: pointer;">Switch to Gemini</button>
    `;
    const switchBtn = warnBanner.querySelector('#btn-switch-to-vision');
    if (switchBtn) {
      switchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeModel = pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0]?.name || activeModel;
        updateModelSelectorLabel();
        renderAttachmentPreviews();
        logTrace(`Switched model to Gemini for image vision analysis`, 'system');
      });
    }
  }

  attachedFiles.forEach((fileObj, index) => {
    const ext = fileObj.name.includes('.') ? fileObj.name.split('.').pop().toUpperCase() : 'FILE';
    const extLower = ext.toLowerCase();
    let badgeClass = 'attachment-badge';
    if (extLower === 'pdf') badgeClass += ' badge-pdf';
    else if (['doc', 'docx'].includes(extLower)) badgeClass += ' badge-doc';
    else if (['js', 'ts', 'py', 'html', 'css', 'json', 'c', 'cpp'].includes(extLower)) badgeClass += ' badge-code';
    else if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extLower)) badgeClass += ' badge-img';

    const sizeKB = (fileObj.size / 1024).toFixed(1);
    
    const pill = document.createElement('div');
    pill.className = 'attachment-pill';

    const thumbHtml = fileObj.isImage && fileObj.dataUrl
      ? `<img src="${fileObj.dataUrl}" class="attachment-pill-thumb" alt="Preview" />`
      : `<span class="${badgeClass}">${ext}</span>`;

    pill.innerHTML = `
      ${thumbHtml}
      <span class="attachment-name" title="${fileObj.name}">${fileObj.name}</span>
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
// VOICE RECORDING & SPEECH-TO-TEXT ENGINE
// ==========================================
let isRecordingVoice = false;
let voiceCaptureActive = false;
let mediaStream = null;
let audioContext = null;
let analyserNode = null;
let animFrameId = null;
let speechRecognition = null;
let mediaRecorder = null;
let recordedAudioChunks = [];
let pcmProcessor = null;
let recordedPcmChunks = [];
let pcmCaptureRate = 48000;
let lastVoiceTranscriptionError = '';
let micNoiseFloor = 0.004;
let micCalibratingUntil = 0;
let accumulatedTranscript = '';
let finalVoiceTranscript = '';
let initialInputValue = '';
let voiceTimerInterval = null;
let voiceStartTime = 0;
let _prevHeights = [];
let voiceStopInProgress = false;
let liveWindowsSttActive = false;
let liveWindowsSttUnsubscribe = null;
let liveWindowsSttFailed = false;
let liveSttPrivacyWarned = false;

// ==========================================
// VOICE CHAT MODE — text/voice toggle + orb
// ==========================================
const CHAT_MODE_KEY = 'ultron-chat-mode';
let voiceOrbAnimId = null;
let voiceOrbSmoothLevel = 0;
let voiceOrbAnimSource = 'idle';
let voiceOrbVisualState = 'idle'; // idle | user | ai
let voiceOrbLastFrameAt = 0;
let ttsAudioContext = null;
let ttsAnalyserNode = null;
let voiceModeListenTimer = null;
let voiceModeRecording = false;
let voiceModePaused = false;
let voiceModeMicMuted = false;
let vadAnimId = null;
let vadIntervalId = null;
let vadSpeechStartAt = 0;
let vadLastSpeechAt = 0;
let vadSpeechFrameCount = 0;
let vadNoiseFrameCount = 0;
let vadAutoTriggered = false;
let voiceModeGestureUnlocked = false;
let voiceModeGestureListener = null;

const VAD_BASE_SPEECH_THRESHOLD = 0.022;
let vadNoiseMultiplier = 3.0;
const VAD_CALIBRATION_MS = 350;
let vadSilenceMs = 700;
const VAD_MIN_SPEECH_MS = 320;
const VAD_START_FRAMES = 2;
const VAD_STOP_FRAMES = 4;
const VAD_MAX_RECORD_MS = 55000;

function getVoiceOrbFrameMs() {
  const profile = getPerformanceProfile();
  return profile === 'battery' ? 180 : (profile === 'performance' ? 66 : 100);
}

const btnChatModeText = document.getElementById('btn-chat-mode-text');
const btnChatModeVoice = document.getElementById('btn-chat-mode-voice');
const voiceModeStage = document.getElementById('voice-mode-stage');
const voiceModeStatus = document.getElementById('voice-mode-status');
const voiceModeCaption = document.getElementById('voice-mode-caption');
const voiceModeBar = document.getElementById('voice-mode-bar');
const voiceModeBarLabel = document.getElementById('voice-mode-bar-label');
const voiceModePause = document.getElementById('voice-mode-pause');
const voiceModeStopMic = document.getElementById('voice-mode-stop-mic');
const voiceModeExit = document.getElementById('voice-mode-exit');
const voiceModeModelsToggle = document.getElementById('voice-mode-models-toggle');
const voiceModeModelsPanel = document.getElementById('voice-mode-models-panel');
const voiceModeModelsList = document.getElementById('voice-mode-models-list');
const voiceModeModelsWrap = document.querySelector('.voice-mode-models-wrap');

// Hardware Adaptive Voice Engine Profile Detection
function getHardwareAdaptiveVoiceConfig() {
  const cores = navigator.hardwareConcurrency || 4;
  const ram = navigator.deviceMemory || 8;
  const isLowEnd = cores <= 4 || ram <= 4;

  return {
    isLowEnd,
    sampleRate: isLowEnd ? 22050 : 44100,
    vadInterval: isLowEnd ? 85 : 35,
    chunkSize: isLowEnd ? 100 : 250,
    animThrottleMs: isLowEnd ? 33 : 16
  };
}

function isVoiceChatModeEnabled() {
  // Voice mode is disabled in Beta 1 while under development
  return false;
}

function setVoiceChatMode(enabled = false, options = {}) {
  window.localStorage.setItem(CHAT_MODE_KEY, 'text');
  applyVoiceChatModeUi(options);
}

function invalidateTtsModelCache() {
  cachedActiveTtsModelKey = null;
}

function getVoiceModeChatModelLabel() {
  const label = document.getElementById('model-selector-label');
  return activeModel || label?.textContent?.trim() || 'Not set';
}

async function getVoiceModeTtsLabel() {
  const key = await resolveActiveTtsModelKey(true);
  if (!key) return 'Not configured';
  try {
    const catalogRes = await window.ultronAPI?.getTtsCatalog?.();
    const match = catalogRes?.models?.find(m => m.key === key);
    if (match?.label) return match.label;
  } catch (e) { /* ignore */ }
  return key;
}

function updateVoiceModeModelsToggleLabel() {
  const labelEl = document.getElementById('voice-mode-models-label');
  if (labelEl) {
    labelEl.textContent = activeModel || 'Select Model';
  }
}

function closeVoiceModeModelsPanel() {
  if (!voiceModeModelsPanel || !voiceModeModelsToggle) return;
  voiceModeModelsPanel.classList.add('hidden');
  voiceModeModelsToggle.setAttribute('aria-expanded', 'false');
}

async function selectChatModel(modelName) {
  const name = String(modelName || '').trim();
  if (!name) return;
  if (name !== activeModel) {
    const isGemini = name.toLowerCase().includes('gemini');
    await unloadOllamaModelsExcept(isGemini ? '' : name);
    activeModel = name;
    logTrace(`Chat context model shifted to "${activeModel}"`, 'local');
  }
  updateModelSelectorLabel();
  updateVoiceModeModelsToggleLabel();
  if (modelDropdown) modelDropdown.classList.add('hidden');
  if (modelSelectorWrapper) modelSelectorWrapper.classList.remove('open');
  closeVoiceModeModelsPanel();
}

let activeVoiceEngineMode = 'local'; // 'local' | 'gemini-live'

const GEMINI_LIVE_VOICE_MODELS = [
  {
    name: 'Gemini 2.5 Flash Native Audio Dialog',
    description: 'Live API · Native Audio-to-Audio bidirectional dialog',
    badge: 'Live API'
  },
  {
    name: 'Gemini 3 Flash Live',
    description: 'Live API · Low-latency live speech, audio & vision',
    badge: 'Live API'
  },
  {
    name: 'Gemini 3.5 Live Translate',
    description: 'Live API · Real-time multilingual spoken translation',
    badge: 'Live API'
  }
];

function initVoiceModeEngineToggle() {
  const btnLocal = document.getElementById('btn-voice-engine-local');
  const btnGemini = document.getElementById('btn-voice-engine-gemini');

  if (btnLocal) {
    btnLocal.addEventListener('click', (e) => {
      e.stopPropagation();
      activeVoiceEngineMode = 'local';
      btnLocal.classList.add('active');
      btnGemini?.classList.remove('active');
      
      // If currently on a Gemini model, switch back to local default
      if (activeModel && activeModel.toLowerCase().includes('gemini')) {
        const localModel = installedOllamaModels[0]?.name || 'llama3.2';
        selectChatModel(localModel);
      }
      updateVoiceModeModelsToggleLabel();
    });
  }

  if (btnGemini) {
    btnGemini.addEventListener('click', async (e) => {
      e.stopPropagation();
      const apiKey = await window.ultronAPI?.loadGeminiKey?.().catch(() => '');
      if (!apiKey || !apiKey.trim()) {
        logTrace('Gemini API key is required for Gemini Live models.', 'system');
        alert('Please add your Google Gemini API Key in Settings → Connectors to use Gemini Live models.');
        return;
      }

      activeVoiceEngineMode = 'gemini-live';
      btnGemini.classList.add('active');
      btnLocal?.classList.remove('active');
      
      // Select first Gemini live model
      selectChatModel('Gemini 2.5 Flash Native Audio Dialog');
      updateVoiceModeModelsToggleLabel();
    });
  }
}

initVoiceModeEngineToggle();

function updateVoiceModeModelsPanel() {
  updateVoiceModeModelsToggleLabel();
  if (!voiceModeModelsList) return;
  voiceModeModelsList.innerHTML = '';

  if (activeVoiceEngineMode === 'gemini-live') {
    const titleEl = document.createElement('div');
    titleEl.className = 'model-dropdown-section-title';
    titleEl.textContent = 'Gemini Live Engines';
    voiceModeModelsList.appendChild(titleEl);

    GEMINI_LIVE_VOICE_MODELS.forEach(m => {
      const item = document.createElement('div');
      item.className = `model-dropdown-item${activeModel === m.name ? ' active' : ''}`;
      item.innerHTML = `
        <div class="model-dropdown-item-header">
          <span class="model-name-text">${m.name}</span>
          <span class="model-badge-pill">${m.badge}</span>
        </div>
        <div class="model-dropdown-desc">${m.description}</div>
      `;
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectChatModel(m.name);
        closeVoiceModeModelsPanel();
      });
      voiceModeModelsList.appendChild(item);
    });
    return;
  }

  if (typeof renderModelDropdownList === 'function') renderModelDropdownList();
  if (!modelDropdownList) return;
  Array.from(modelDropdownList.children).forEach((child) => {
    const clone = child.cloneNode(true);
    if (clone.classList.contains('model-dropdown-item') && !clone.classList.contains('disabled')) {
      const name = clone.querySelector('.model-name-text')?.textContent?.trim();
      if (name && name === activeModel) {
        clone.classList.add('active');
      }
      clone.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (name) {
          selectChatModel(name);
          closeVoiceModeModelsPanel();
        }
      });
    }
    voiceModeModelsList.appendChild(clone);
  });
}

function toggleVoiceModeModelsPanel() {
  if (!voiceModeModelsPanel || !voiceModeModelsToggle) return;
  const opening = voiceModeModelsPanel.classList.contains('hidden');
  if (opening) {
    updateVoiceModeModelsPanel();
    voiceModeModelsPanel.classList.remove('hidden');
    voiceModeModelsToggle.setAttribute('aria-expanded', 'true');
  } else {
    closeVoiceModeModelsPanel();
  }
}

document.addEventListener('click', (e) => {
  if (voiceModeModelsPanel && !voiceModeModelsPanel.classList.contains('hidden')) {
    if (!voiceModeModelsToggle?.contains(e.target) && !voiceModeModelsPanel?.contains(e.target)) {
      closeVoiceModeModelsPanel();
    }
  }
});

function markAiContentVoicePending(contentElement) {
  if (!isVoiceChatModeEnabled() || !contentElement) return;
  const bubble = contentElement.closest('.chat-bubble.ai');
  if (!bubble) return;
  const html = contentElement.innerHTML || '';
  if (isThinkingMarkup(html) || isRichResultMarkup(html) || isAgentWidgetMarkup(html)) return;
  contentElement.classList.add('voice-pending-speech');
  contentElement.classList.remove('voice-speech-revealed');
}

function revealPendingVoiceSpeech() {
  document.querySelectorAll('.message-content.voice-pending-speech').forEach((el) => {
    el.classList.remove('voice-pending-speech');
    el.classList.add('voice-speech-revealed');
  });
  syncVoiceModeAiFromChat();
}

function isVoiceModeListenBlocked() {
  return voiceModePaused || voiceModeMicMuted;
}

function updateVoiceModeBarUi() {
  const isSpeaking = Boolean(streamingAutoSpeakState.busy || activeNeuralAudio);
  const isMicActive = isRecordingVoice && !voiceModeMicMuted && !voiceModePaused;

  let label = 'Listening…';
  if (voiceModePaused) label = 'Paused';
  else if (voiceModeMicMuted) label = 'Mic off';
  else if (isRecordingVoice) label = 'Listening…';
  else if (isAwaitingResponse) label = 'Ultron is responding…';
  else if (isSpeaking) label = 'Ultron is speaking…';

  if (voiceModeBarLabel) voiceModeBarLabel.textContent = label;

  if (voiceModePause) {
    voiceModePause.classList.toggle('is-active', isSpeaking);
    voiceModePause.title = isSpeaking ? 'Pause AI speech' : 'Play / Resume conversation';
    const pauseIcon = voiceModePause.querySelector('.voice-mode-icon-pause');
    const resumeIcon = voiceModePause.querySelector('.voice-mode-icon-resume');
    if (pauseIcon) pauseIcon.classList.toggle('hidden', !isSpeaking);
    if (resumeIcon) resumeIcon.classList.toggle('hidden', isSpeaking);
  }

  if (voiceModeStopMic) {
    voiceModeStopMic.classList.toggle('is-muted', !isMicActive);
    voiceModeStopMic.title = isMicActive ? 'Mute microphone' : 'Unmute microphone';
    const micOnIcon = voiceModeStopMic.querySelector('.voice-mode-mic-on');
    const micOffIcon = voiceModeStopMic.querySelector('.voice-mode-mic-off');
    if (micOnIcon) micOnIcon.classList.toggle('hidden', !isMicActive);
    if (micOffIcon) micOffIcon.classList.toggle('hidden', isMicActive);
  }
}

function setVoiceModeCaption(_text, _opts) {
  if (!voiceModeCaption) return;
  voiceModeCaption.textContent = '';
  voiceModeCaption.dataset.role = '';
  voiceModeCaption.classList.remove('visible', 'processing', 'interim');
}

function updateVoiceModeUserTranscript(_text, _opts) {
  return;
}

function updateVoiceModeAiTranscript(_text, _opts) {
  return;
}

function clearVoiceModeUserTranscript() {
  setVoiceModeCaption('');
}

function clearVoiceModeCaption() {
  setVoiceModeCaption('');
}

function syncVoiceModeAiFromChat() {
  return;
}

function getLatestAiMessagePlainText() {
  const bubbles = chatMessagesContainer?.querySelectorAll('.chat-bubble.ai');
  if (!bubbles?.length) return '';
  const last = bubbles[bubbles.length - 1];
  const content = last.querySelector('.message-content');
  if (!content) return '';
  const plain = extractPlainTextFromMessage(content.innerHTML || content.textContent || '') || content.textContent || '';
  if (/^thinking$/i.test(plain.trim()) || plain.trim().length < 2) return '';
  return plain.trim();
}

function setVoiceModeStatus(text) {
  const label = String(text || '').trim();
  if (voiceModeStatus) {
    if (label) {
      const isListening = /^listening/i.test(label);
      voiceModeStatus.classList.toggle('is-listening', isListening);
      if (isListening) {
        voiceModeStatus.innerHTML = 'Listening<span class="animated-voice-dots" aria-hidden="true"><span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>';
      } else {
        voiceModeStatus.textContent = label;
      }
      voiceModeStatus.hidden = false;
      voiceModeStatus.style.display = '';
    } else {
      voiceModeStatus.classList.remove('is-listening');
      voiceModeStatus.textContent = '';
      voiceModeStatus.hidden = true;
      voiceModeStatus.style.display = 'none';
    }
  }
  updateVoiceModeBarUi();
}

let vadInterimBusy = false;
let vadLastInterimAt = 0;

function stopVoiceModeVad() {
  if (vadAnimId) {
    cancelAnimationFrame(vadAnimId);
    vadAnimId = null;
  }
  if (vadIntervalId) {
    clearInterval(vadIntervalId);
    vadIntervalId = null;
  }
  vadSpeechStartAt = 0;
  vadLastSpeechAt = 0;
  vadSpeechFrameCount = 0;
  vadNoiseFrameCount = 0;
  vadAutoTriggered = false;
  vadInterimBusy = false;
  vadLastInterimAt = 0;
}

function resetMicNoiseCalibration() {
  micNoiseFloor = 0.004;
  micCalibratingUntil = performance.now() + VAD_CALIBRATION_MS;
}

function updateMicNoiseFloor(level) {
  if (!Number.isFinite(level) || level <= 0) return;
  if (performance.now() <= micCalibratingUntil) {
    micNoiseFloor = micNoiseFloor ? (micNoiseFloor * 0.82 + level * 0.18) : level;
  } else if (level < micNoiseFloor * 1.6) {
    micNoiseFloor = micNoiseFloor * 0.96 + level * 0.04;
  }
  micNoiseFloor = Math.max(0.0025, Math.min(0.04, micNoiseFloor));
}

function getAdaptiveVadThreshold() {
  return Math.max(VAD_BASE_SPEECH_THRESHOLD, micNoiseFloor * vadNoiseMultiplier);
}

function getMicVoiceFeatures(analyser) {
  const level = getMicLevelFast(analyser);
  if (!analyser) return { level, voiceRatio: 0, zcr: 0, voiceLike: false };

  const freqLength = analyser.frequencyBinCount || 0;
  if (!_waveformFreqBuffer || _waveformFreqBuffer.length !== freqLength) {
    _waveformFreqBuffer = new Uint8Array(freqLength);
  }
  analyser.getByteFrequencyData(_waveformFreqBuffer);

  const nyquist = (audioContext?.sampleRate || 48000) / 2;
  let voiceEnergy = 0;
  let totalEnergy = 0;
  for (let i = 1; i < freqLength; i++) {
    const hz = (i / freqLength) * nyquist;
    const amp = _waveformFreqBuffer[i] / 255;
    const energy = amp * amp;
    totalEnergy += energy;
    if (hz >= 120 && hz <= 3800) voiceEnergy += energy;
  }

  const timeLength = analyser.fftSize || 256;
  if (!_micFastTimeBuffer || _micFastTimeBuffer.length !== timeLength) {
    _micFastTimeBuffer = new Uint8Array(timeLength);
  }
  analyser.getByteTimeDomainData(_micFastTimeBuffer);
  let crossings = 0;
  let prev = (_micFastTimeBuffer[0] - 128) / 128;
  for (let i = 1; i < timeLength; i++) {
    const cur = (_micFastTimeBuffer[i] - 128) / 128;
    if ((prev < 0 && cur >= 0) || (prev >= 0 && cur < 0)) crossings++;
    prev = cur;
  }

  const voiceRatio = totalEnergy > 0.00001 ? voiceEnergy / totalEnergy : 0;
  const zcr = crossings / Math.max(1, timeLength - 1);
  return {
    level,
    voiceRatio,
    zcr,
    voiceLike: voiceRatio >= 0.48 && zcr >= 0.015 && zcr <= 0.32
  };
}

function hasVoiceSpeechSignal(features) {
  const level = typeof features === 'number' ? features : features?.level || 0;
  updateMicNoiseFloor(level);
  if (performance.now() <= micCalibratingUntil) return false;
  const threshold = getAdaptiveVadThreshold();
  if (level >= threshold) {
    if (typeof features === 'number') return true;
    if (features.voiceLike || level >= threshold * 1.2) return true;
  }
  const t = (accumulatedTranscript || finalVoiceTranscript || '').trim();
  return t.length > 1;
}

function startVoiceModeVad() {
  stopVoiceModeVad();
  if (!isVoiceChatModeEnabled() || !isRecordingVoice) return;
  const pollMs = Math.max(40, getHardwareAdaptiveVoiceConfig().vadInterval || 50);

  vadIntervalId = setInterval(() => {
    if (!isRecordingVoice || !isVoiceChatModeEnabled() || voiceModePaused || vadAutoTriggered) {
      stopVoiceModeVad();
      return;
    }

    if (audioContext && audioContext.state === 'suspended') {
      ensureAudioContextRunning(audioContext);
    }

    const micFeatures = getMicVoiceFeatures(analyserNode);
    const speechCandidate = hasVoiceSpeechSignal(micFeatures);
    if (speechCandidate) {
      vadSpeechFrameCount++;
      vadNoiseFrameCount = 0;
    } else {
      vadNoiseFrameCount++;
    }
    const speaking = vadSpeechFrameCount >= VAD_START_FRAMES;
    const now = performance.now();

    if (speaking) {
      if (!vadSpeechStartAt) vadSpeechStartAt = now;
      vadLastSpeechAt = now;
    } else if (vadSpeechStartAt && vadLastSpeechAt) {
      const silenceMs = now - vadLastSpeechAt;
      const speechMs = vadLastSpeechAt - vadSpeechStartAt;
      const hasText = Boolean((accumulatedTranscript || finalVoiceTranscript || '').trim());

      if (vadNoiseFrameCount >= VAD_STOP_FRAMES && silenceMs >= vadSilenceMs && (speechMs >= VAD_MIN_SPEECH_MS || hasText)) {
        vadAutoTriggered = true;
        stopVoiceModeVad();
        finishVoiceModeTurn(true);
        return;
      }
    }

    if (vadSpeechStartAt && now - vadSpeechStartAt > VAD_MAX_RECORD_MS && !vadAutoTriggered) {
      vadAutoTriggered = true;
      stopVoiceModeVad();
      finishVoiceModeTurn(true);
    }
  }, pollMs);
}

function resumeVoiceModeConversation() {
  voiceModePaused = false;
  voiceModeMicMuted = false;
  unlockVoiceModeAudio();
  updateVoiceModeBarUi();
  setVoiceModeStatus('');
  scheduleVoiceModeListen(0);
}

function pauseVoiceModeConversation() {
  voiceModePaused = true;
  if (voiceModeListenTimer) {
    clearTimeout(voiceModeListenTimer);
    voiceModeListenTimer = null;
  }
  stopVoiceModeVad();
  if (isRecordingVoice) stopVoiceRecording(false);
  stopTtsSpeech();
  setVoiceModeStatus('Paused');
  updateVoiceModeBarUi();
}

function toggleVoiceModePause() {
  if (voiceModePaused || voiceModeMicMuted) {
    resumeVoiceModeConversation();
  } else {
    pauseVoiceModeConversation();
  }
}

function stopVoiceModeMicHandoff() {
  voiceModeMicMuted = true;
  stopVoiceModeVad();
  if (isRecordingVoice) stopVoiceRecording(false);
  clearVoiceModeUserTranscript();
  setVoiceModeStatus('Mic off');
  updateVoiceModeBarUi();
}

function toggleVoiceModeMic() {
  if (voiceModeMicMuted) {
    voiceModeMicMuted = false;
    voiceModePaused = false;
    unlockVoiceModeAudio();
    updateVoiceModeBarUi();
    setVoiceModeStatus('Listening…');
    scheduleVoiceModeListen(0);
    return;
  }
  stopVoiceModeMicHandoff();
}

function setVoiceOrbVisualState(state) {
  if (state === 'listening') voiceOrbVisualState = 'user';
  else if (state === 'ai-speaking') voiceOrbVisualState = 'ai';
  else voiceOrbVisualState = 'idle';

  if (voiceModeStage) voiceModeStage.dataset.orbState = voiceOrbVisualState;
}

function cancelVoiceOrbAnimation() {
  if (voiceOrbAnimId) {
    cancelAnimationFrame(voiceOrbAnimId);
    voiceOrbAnimId = null;
  }
}

// Reusable zero-allocation typed array buffers for audio analysis & visualization
let _micFastTimeBuffer = null;
let _analyserFreqBuffer = null;
let _activityTimeBuffer = null;
let _activityFreqBuffer = null;
let _waveformFreqBuffer = null;
let _waveformTimeBuffer = null;

let _lastVoiceState = null;
let _lastVoiceLevel = -1;

function getAnalyserLevel(analyser) {
  if (!analyser) return 0;
  const bufferLength = analyser.frequencyBinCount;
  if (!_analyserFreqBuffer || _analyserFreqBuffer.length !== bufferLength) {
    _analyserFreqBuffer = new Uint8Array(bufferLength);
  }
  analyser.getByteFrequencyData(_analyserFreqBuffer);
  let freqSum = 0;
  for (let i = 0; i < bufferLength; i += 4) freqSum += _analyserFreqBuffer[i];
  return Math.min(1, (freqSum / (bufferLength / 4)) / 160);
}

function getMicActivityLevel(analyser) {
  if (!analyser) return 0;
  const bufferLength = analyser.frequencyBinCount;
  const fftSize = analyser.fftSize || 256;
  if (!_activityTimeBuffer || _activityTimeBuffer.length !== fftSize) {
    _activityTimeBuffer = new Uint8Array(fftSize);
  }
  if (!_activityFreqBuffer || _activityFreqBuffer.length !== bufferLength) {
    _activityFreqBuffer = new Uint8Array(bufferLength);
  }
  analyser.getByteTimeDomainData(_activityTimeBuffer);
  analyser.getByteFrequencyData(_activityFreqBuffer);

  let sum = 0;
  const step = 8;
  const len = _activityTimeBuffer.length;
  for (let i = 0; i < len; i += step) {
    const v = (_activityTimeBuffer[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / (len / step));

  let speechSum = 0;
  let speechCount = 0;
  const lo = 2;
  const hi = Math.min(56, bufferLength - 1);
  for (let i = lo; i <= hi; i++) {
    speechSum += _activityFreqBuffer[i];
    speechCount++;
  }
  const speechLevel = speechCount ? (speechSum / speechCount) / 200 : 0;

  return Math.min(1, Math.max(rms * 3.2, speechLevel * 1.15, getAnalyserLevel(analyser) * 0.85));
}

function updateVoiceGradientVisual(level, state) {
  if (!voiceModeStage) return;
  if (state !== _lastVoiceState) {
    voiceModeStage.dataset.orbState = state;
    _lastVoiceState = state;
  }
  if (Math.abs(level - _lastVoiceLevel) < 0.005) return;
  _lastVoiceLevel = level;

  const pulse = 0.18 + level * 0.82;
  const scale = 0.82 + level * 0.58;
  const bright = 0.32 + level * 0.68;
  const shiftX = (level - 0.3) * 4;
  const shiftY = (level - 0.25) * 3;
  voiceModeStage.style.setProperty('--voice-pulse', pulse.toFixed(3));
  voiceModeStage.style.setProperty('--voice-mesh-scale', scale.toFixed(3));
  voiceModeStage.style.setProperty('--voice-mesh-bright', bright.toFixed(3));
  voiceModeStage.style.setProperty('--voice-mesh-shift-x', `${shiftX.toFixed(2)}%`);
  voiceModeStage.style.setProperty('--voice-mesh-shift-y', `${shiftY.toFixed(2)}%`);
  voiceModeStage.style.setProperty('--voice-audio-level', level.toFixed(3));
}

function startVoiceOrbAnimation(source = 'idle') {
  if (source === 'idle') {
    voiceOrbAnimSource = 'idle';
    cancelVoiceOrbAnimation();
    voiceOrbSmoothLevel = 0.28;
    if (voiceModeStage) voiceModeStage.dataset.orbState = 'idle';

    let lastIdleTick = 0;
    function idleFrame(now) {
      if (!isVoiceChatModeEnabled() || voiceOrbAnimSource !== 'idle') {
        cancelVoiceOrbAnimation();
        return;
      }
      if (now - lastIdleTick >= 110) {
        lastIdleTick = now;
        const breathe = 0.24 + Math.sin(now / 1200) * 0.16;
        updateVoiceGradientVisual(breathe, 'idle');
      }
      voiceOrbAnimId = requestAnimationFrame(idleFrame);
    }
    voiceOrbAnimId = requestAnimationFrame(idleFrame);
    return;
  }

  voiceOrbAnimSource = source;
  cancelVoiceOrbAnimation();
  voiceOrbLastFrameAt = 0;

  function frame(now) {
    if (!isVoiceChatModeEnabled()) {
      cancelVoiceOrbAnimation();
      return;
    }

    const activeMic = voiceOrbAnimSource === 'mic' && isRecordingVoice && analyserNode;
    const activeAi = voiceOrbAnimSource === 'ai' && (ttsAnalyserNode || streamingAutoSpeakState.busy);
    if (!activeMic && !activeAi) {
      cancelVoiceOrbAnimation();
      startVoiceOrbAnimation('idle');
      return;
    }

    if (now - voiceOrbLastFrameAt < getVoiceOrbFrameMs()) {
      voiceOrbAnimId = requestAnimationFrame(frame);
      return;
    }
    voiceOrbLastFrameAt = now;

    let target = 0.05;
    if (activeMic) {
      target = getMicLevelFast(analyserNode);
      voiceOrbVisualState = 'user';
    } else if (activeAi && ttsAnalyserNode) {
      target = getMicLevelFast(ttsAnalyserNode);
      voiceOrbVisualState = 'ai';
    } else {
      target = 0.15;
      voiceOrbVisualState = 'ai';
    }

    const smoothRate = target > voiceOrbSmoothLevel ? 0.45 : 0.12;
    voiceOrbSmoothLevel += (target - voiceOrbSmoothLevel) * smoothRate;
    updateVoiceGradientVisual(voiceOrbSmoothLevel, voiceOrbVisualState);
    voiceOrbAnimId = requestAnimationFrame(frame);
  }

  voiceOrbAnimId = requestAnimationFrame(frame);
}

function connectTtsAudioAnalyser(audio) {
  if (!audio) return;
  try {
    if (!ttsAudioContext || ttsAudioContext.state === 'closed') {
      ttsAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ttsAudioContext.state === 'suspended') ttsAudioContext.resume();
    const source = ttsAudioContext.createMediaElementSource(audio);
    ttsAnalyserNode = ttsAudioContext.createAnalyser();
    ttsAnalyserNode.fftSize = 256;
    ttsAnalyserNode.smoothingTimeConstant = 0.75;
    source.connect(ttsAnalyserNode);
    ttsAnalyserNode.connect(ttsAudioContext.destination);
  } catch (e) {
    ttsAnalyserNode = null;
  }
}

function scheduleVoiceModeListen(delayMs = 120) {
  if (!isVoiceChatModeEnabled() || isAwaitingResponse || isRecordingVoice || isVoiceModeListenBlocked()) return;
  if (voiceModeListenTimer) clearTimeout(voiceModeListenTimer);
  voiceModeListenTimer = setTimeout(() => {
    voiceModeListenTimer = null;
    if (streamingAutoSpeakState.busy || activeNeuralAudio) {
      scheduleVoiceModeListen(180);
      return;
    }
    if (isVoiceChatModeEnabled() && !isAwaitingResponse && !isRecordingVoice && !isVoiceModeListenBlocked()) {
      startVoiceModeSession();
    }
  }, delayMs);
}

async function startVoiceModeSession() {
  if (isRecordingVoice || isAwaitingResponse || isVoiceModeListenBlocked()) return;
  if (!voiceModeGestureUnlocked) {
    promptVoiceModeGesture();
    return;
  }
  voiceModeRecording = true;
  setVoiceModeStatus('Listening…');
  setVoiceOrbVisualState('listening');
  clearVoiceModeCaption();
  await startVoiceRecording({ voiceMode: true });
  if (!isRecordingVoice) {
    voiceModeRecording = false;
    setVoiceModeStatus('Tap to start listening');
  } else {
    setVoiceModeStatus('Listening…');
  }
}

function unlockVoiceModeAudio() {
  voiceModeGestureUnlocked = true;
  clearVoiceModeGestureListener();
}

function getMicLevelFast(analyser) {
  if (!analyser) return 0;
  const fftSize = analyser.fftSize || 256;
  if (!_micFastTimeBuffer || _micFastTimeBuffer.length !== fftSize) {
    _micFastTimeBuffer = new Uint8Array(fftSize);
  }
  analyser.getByteTimeDomainData(_micFastTimeBuffer);
  let sum = 0;
  const step = 16;
  const len = _micFastTimeBuffer.length;
  for (let i = 0; i < len; i += step) {
    const v = (_micFastTimeBuffer[i] - 128) / 128;
    sum += v * v;
  }
  return Math.min(1, Math.sqrt(sum / (len / step)) * 3.4);
}

function promptVoiceModeGesture() {
  if (!isVoiceChatModeEnabled() || voiceModeGestureUnlocked) return;
  setVoiceModeStatus('Tap to start listening');
}

function clearVoiceModeGestureListener() {
  if (!voiceModeGestureListener) return;
  document.removeEventListener('pointerdown', voiceModeGestureListener, true);
  document.removeEventListener('keydown', voiceModeGestureListener, true);
  voiceModeGestureListener = null;
}

async function ensureAudioContextRunning(ctx) {
  if (!ctx) return false;
  if (ctx.state === 'running') return true;
  try {
    await ctx.resume();
  } catch (e) {
    console.warn('AudioContext resume failed:', e);
  }
  return ctx.state === 'running';
}

async function finishVoiceModeTurn(autoSubmitted = false) {
  if (!isRecordingVoice) return;
  stopVoiceModeVad();
  await stopVoiceRecording(true, { autoVoiceSubmit: autoSubmitted });
}

async function syncActiveTtsModelForVoiceMode() {
  const key = window.localStorage.getItem('ultron-tts-neural-model');
  if (key && window.ultronAPI?.setActiveTtsModel) {
    try {
      const res = await window.ultronAPI.setActiveTtsModel(key);
      if (res?.success) cachedActiveTtsModelKey = key;
    } catch (e) { /* ignore */ }
  }
}

function applyVoiceChatModeUi({ fromUserGesture = false } = {}) {
  const chatMain = document.querySelector('.chat-main');
  const enabled = isVoiceChatModeEnabled();

  if (chatMain) chatMain.classList.toggle('voice-chat-mode', enabled);
  if (voiceModeStage) {
    voiceModeStage.classList.toggle('hidden', !enabled);
    voiceModeStage.setAttribute('aria-hidden', enabled ? 'false' : 'true');
  }
  if (voiceModeBar) voiceModeBar.classList.toggle('hidden', !enabled);
  if (btnChatModeText) {
    btnChatModeText.classList.toggle('active', !enabled);
    btnChatModeText.setAttribute('aria-selected', !enabled ? 'true' : 'false');
  }
  if (btnChatModeVoice) {
    btnChatModeVoice.classList.toggle('active', enabled);
    btnChatModeVoice.setAttribute('aria-selected', enabled ? 'true' : 'false');
  }

  if (enabled) {
    voiceModePaused = false;
    voiceModeMicMuted = false;
    invalidateTtsModelCache();
    syncActiveTtsModelForVoiceMode();
    startVoiceOrbAnimation('idle');
    updateVoiceModeBarUi();
    updateVoiceModeModelsPanel();
    clearVoiceModeCaption();
    if (fromUserGesture) {
      unlockVoiceModeAudio();
      setVoiceModeStatus('Listening…');
      scheduleVoiceModeListen(0);
    } else if (voiceModeGestureUnlocked) {
      setVoiceModeStatus('Listening…');
      scheduleVoiceModeListen(0);
    } else {
      promptVoiceModeGesture();
    }
  } else {
    cancelVoiceOrbAnimation();
    stopVoiceModeVad();
    clearVoiceModeGestureListener();
    closeVoiceModeModelsPanel();
    voiceModeGestureUnlocked = false;
    setVoiceOrbVisualState('');
    clearVoiceModeCaption();
    if (voiceModeListenTimer) {
      clearTimeout(voiceModeListenTimer);
      voiceModeListenTimer = null;
    }
    if (isRecordingVoice) stopVoiceRecording(false);
    voiceModeRecording = false;
    voiceModePaused = false;
    voiceModeMicMuted = false;
    // Leaving voice mode: voice-only engines (Native Audio Dialog, Live, TTS) are not text-chat models.
    if (activeModel && isVoiceOnlyModelLabel(activeModel)) {
      const safe = pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0]?.name || '';
      if (safe) {
        activeModel = safe;
        updateModelSelectorLabel();
        syncModelAttachmentCapabilities();
        logTrace(`Returned to text chat model "${safe}" after leaving voice mode.`, 'system');
      }
      renderModelDropdownList();
    }
  }
}

if (btnChatModeText) {
  btnChatModeText.addEventListener('click', () => {
    if (!isVoiceChatModeEnabled()) return;
    setVoiceChatMode(false, { fromUserGesture: true });
  });
}

if (btnChatModeVoice) {
  btnChatModeVoice.addEventListener('click', (e) => {
    e.preventDefault();
    logTrace('Voice mode is currently in development and will be available in a future update.', 'system');
  });
}

if (voiceModeStatus) {
  voiceModeStatus.addEventListener('click', (e) => {
    e.preventDefault();
    if (!isVoiceChatModeEnabled() || isRecordingVoice || isAwaitingResponse) return;
    unlockVoiceModeAudio();
    scheduleVoiceModeListen(0);
  });
}

if (voiceModePause) {
  voiceModePause.addEventListener('click', (e) => {
    e.preventDefault();
    unlockVoiceModeAudio();
    toggleVoiceModePause();
  });
}

if (voiceModeModelsToggle) {
  voiceModeModelsToggle.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleVoiceModeModelsPanel();
  });
}

if (voiceModeStopMic) {
  voiceModeStopMic.addEventListener('click', (e) => {
    e.preventDefault();
    unlockVoiceModeAudio();
    toggleVoiceModeMic();
  });
}

if (voiceModeExit) {
  voiceModeExit.addEventListener('click', (e) => {
    e.preventDefault();
    stopVoiceModeVad();
    if (isRecordingVoice) stopVoiceRecording(false);
    stopTtsSpeech();
    setVoiceChatMode(false, { fromUserGesture: true });
  });
}

function initVoiceChatModeAfterBoot() {
  // Always default to standard text mode on app launch
  setVoiceChatMode(false);
}

const btnMic = document.getElementById('btn-mic');
const mainInputPill = document.getElementById('main-input-pill') || document.querySelector('.input-pill');
const voiceRecordingPill = document.getElementById('voice-recording-pill');
const voiceWaveformCanvas = document.getElementById('voice-waveform-canvas');
const voiceRecordingTimer = document.getElementById('voice-recording-timer');
const voiceBtnAdd = document.getElementById('voice-btn-add');
const voiceBtnCancel = document.getElementById('voice-btn-cancel');
const voiceBtnDone = document.getElementById('voice-btn-done');
const voiceLiveTranscript = document.getElementById('voice-live-transcript');
const voiceVisualizerWrapper = document.querySelector('.voice-visualizer-wrapper');

if (btnMic) {
  btnMic.addEventListener('click', (e) => {
    e.preventDefault();
    if (isRecordingVoice) {
      stopVoiceRecording(true);
    } else {
      startVoiceRecording({ voiceMode: false });
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

function isBrowserSpeechRecognitionAvailable() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function shouldUseBrowserSpeechRecognition() {
  // Windows Speech is the sole transcription engine for both text and voice mode.
  return false;
}

function getVoiceSttCulture() {
  const lang = String(navigator.language || 'en-US').trim();
  if (lang.toLowerCase().startsWith('en')) return 'en-US';
  if (lang.toLowerCase().startsWith('hi')) return 'hi-IN';
  return 'en-US';
}

const settingPerformanceProfile = document.getElementById('setting-performance-profile');
const settingPerformanceProfileNote = document.getElementById('setting-performance-profile-note');
const settingVoiceInputDevice = document.getElementById('setting-voice-input-device');
const settingVoiceSensitivity = document.getElementById('setting-voice-sensitivity');
const settingVoiceSensitivityLabel = document.getElementById('setting-voice-sensitivity-label');
const settingVoicePause = document.getElementById('setting-voice-pause');
const settingVoicePauseLabel = document.getElementById('setting-voice-pause-label');

function getPerformanceProfile() {
  const profile = localStorage.getItem('ultron-performance-profile') || 'balanced';
  return ['battery', 'balanced', 'performance'].includes(profile) ? profile : 'balanced';
}

function applyPerformanceProfile(profile = getPerformanceProfile()) {
  document.body.dataset.performanceProfile = profile;
  if (settingPerformanceProfile) settingPerformanceProfile.value = profile;
  if (settingPerformanceProfileNote) {
    settingPerformanceProfileNote.textContent = profile === 'battery'
      ? 'Reduced animation, polling, and background startup work'
      : profile === 'performance'
        ? 'Fast refreshes and full visual effects'
        : 'Balanced daily use';
  }
}

function getSelectedVoiceInputDeviceId() {
  return localStorage.getItem('ultron-voice-input-device') || '';
}

function updateVoiceInputSettingsLabels() {
  if (settingVoiceSensitivityLabel) {
    const value = Number(vadNoiseMultiplier);
    settingVoiceSensitivityLabel.textContent = value >= 4.2 ? 'Strict' : value <= 3 ? 'Sensitive' : 'Balanced';
  }
  if (settingVoicePauseLabel) settingVoicePauseLabel.textContent = `${(vadSilenceMs / 1000).toFixed(1)}s`;
}

async function refreshVoiceInputDevices() {
  if (!settingVoiceInputDevice || !navigator.mediaDevices?.enumerateDevices) return;
  const selected = getSelectedVoiceInputDeviceId();
  const devices = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(device => device.kind === 'audioinput');
  settingVoiceInputDevice.innerHTML = '<option value="">System default</option>';
  devices.forEach((device, index) => {
    const option = document.createElement('option');
    option.value = device.deviceId;
    option.textContent = device.label || `Microphone ${index + 1}`;
    settingVoiceInputDevice.appendChild(option);
  });
  settingVoiceInputDevice.value = devices.some(device => device.deviceId === selected) ? selected : '';
}

function initRuntimePreferencesUI() {
  const savedSensitivity = Number(localStorage.getItem('ultron-voice-sensitivity'));
  const savedPause = Number(localStorage.getItem('ultron-voice-pause-ms'));
  if (Number.isFinite(savedSensitivity)) vadNoiseMultiplier = Math.max(2.4, Math.min(5, savedSensitivity));
  if (Number.isFinite(savedPause)) vadSilenceMs = Math.max(500, Math.min(2000, savedPause));
  if (settingVoiceSensitivity) settingVoiceSensitivity.value = String(vadNoiseMultiplier);
  if (settingVoicePause) settingVoicePause.value = String(vadSilenceMs);
  updateVoiceInputSettingsLabels();
  applyPerformanceProfile();
  refreshVoiceInputDevices();

  settingPerformanceProfile?.addEventListener('change', () => {
    localStorage.setItem('ultron-performance-profile', settingPerformanceProfile.value);
    applyPerformanceProfile(settingPerformanceProfile.value);
  });
  settingVoiceInputDevice?.addEventListener('change', () => {
    localStorage.setItem('ultron-voice-input-device', settingVoiceInputDevice.value || '');
  });
  settingVoiceSensitivity?.addEventListener('input', () => {
    vadNoiseMultiplier = Number(settingVoiceSensitivity.value);
    localStorage.setItem('ultron-voice-sensitivity', String(vadNoiseMultiplier));
    updateVoiceInputSettingsLabels();
  });
  settingVoicePause?.addEventListener('input', () => {
    vadSilenceMs = Number(settingVoicePause.value);
    localStorage.setItem('ultron-voice-pause-ms', String(vadSilenceMs));
    updateVoiceInputSettingsLabels();
  });
  document.querySelector('.settings-tab-btn[data-tab="sounds"]')?.addEventListener('click', refreshVoiceInputDevices);

  window.addEventListener('ultron-performance-mode-changed', (e) => {
    const mode = e.detail?.mode || 'auto';
    const label = mode === 'gpu' ? 'GPU Priority (Hardware Accelerated)' : (mode === 'cpu' ? 'CPU Only (Eco / Low-Power)' : 'Auto Adaptive');
    logTrace(`Switched performance mode to: ${label}`, 'system');
  });
}

initRuntimePreferencesUI();

function isUltronWindowsDevice() {
  return /windows/i.test(navigator.userAgent || '') || /win/i.test(navigator.platform || '');
}

const SETTINGS_ACTION_ICONS = {
  preview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
  downloading: '<svg class="settings-icon-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>',
  downloaded: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg>',
  use: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.8 5.7 21.1 8 14 2 9.4h7.6z"></path></svg>',
  active: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
  ready: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'
};

function settingsActionButtonHtml(label, iconKey, extraClass = '') {
  const icon = SETTINGS_ACTION_ICONS[iconKey] || '';
  const classes = ['sound-preview-btn', 'settings-action-btn', extraClass].filter(Boolean).join(' ');
  return `<span class="${classes}"><span class="settings-action-icon" aria-hidden="true">${icon}</span><span class="settings-action-label">${label}</span></span>`;
}

function setSettingsActionButton(button, label, iconKey, extraClass = '') {
  if (!button) return;
  const extraClasses = String(extraClass || '').split(/\s+/).filter(Boolean);
  button.className = ['sound-preview-btn', 'settings-action-btn', ...extraClasses].join(' ');
  const icon = SETTINGS_ACTION_ICONS[iconKey] || '';
  button.innerHTML = `<span class="settings-action-icon" aria-hidden="true">${icon}</span><span class="settings-action-label">${label}</span>`;
}

function decorateSettingsActionButtons(root = document) {
  const map = [
    ['Preview', 'preview'],
    ['Download', 'download'],
    ['Downloading…', 'downloading'],
    ['Downloaded', 'downloaded'],
    ['Use', 'use'],
    ['Active', 'active'],
    ['Ready', 'ready'],
    ['Needs key', 'download'],
    ['Playing…', 'preview']
  ];
  root.querySelectorAll('button.sound-preview-btn').forEach((btn) => {
    if (btn.querySelector('.settings-action-icon')) return;
    const text = (btn.textContent || '').trim();
    const match = map.find(([label]) => label.toLowerCase() === text.toLowerCase());
    if (match) setSettingsActionButton(btn, match[0], match[1], [...btn.classList].filter(c => c !== 'sound-preview-btn').join(' '));
  });
}

async function ensureVoiceModelForMic() {
  if (isUltronWindowsDevice()) {
    try {
      if (window.ultronAPI?.getVoiceModelStatus) {
        const status = await window.ultronAPI.getVoiceModelStatus();
        if (status?.probed && status?.available === false) {
          return {
            ready: false,
            status,
            message: 'Windows speech recognition is unavailable. Install English (US) in Windows Settings → Time & language → Speech.'
          };
        }
      }
    } catch (e) {
      console.warn('Voice model status check failed:', e);
    }
    return { ready: true };
  }

  if (!window.ultronAPI?.getVoiceModelStatus) return { ready: true };
  try {
    const status = await window.ultronAPI.getVoiceModelStatus();
    if (status?.installed || status?.builtIn || status?.noDownloadRequired) {
      return { ready: true, status };
    }
    return {
      ready: false,
      status,
      message: 'Voice input is not available on this device.'
    };
  } catch (e) {
    return { ready: true };
  }
}

function updateVoiceLiveTranscript(text, { processing = false } = {}) {
  const trimmed = String(text || '').trim();

  if (processing) {
    if (voiceLiveTranscript) {
      voiceLiveTranscript.textContent = trimmed || 'Transcribing…';
      voiceLiveTranscript.classList.add('visible', 'processing');
      if (voiceVisualizerWrapper) voiceVisualizerWrapper.classList.add('has-transcript');
    }
    if (isVoiceChatModeEnabled()) {
      setVoiceModeStatus('Listening…');
    }
    return;
  }

  if (voiceLiveTranscript) {
    voiceLiveTranscript.classList.remove('processing');
    if (trimmed) {
      voiceLiveTranscript.textContent = trimmed;
      voiceLiveTranscript.classList.add('visible');
      if (voiceVisualizerWrapper) voiceVisualizerWrapper.classList.add('has-transcript');
    } else {
      voiceLiveTranscript.textContent = '';
      voiceLiveTranscript.classList.remove('visible');
      if (voiceVisualizerWrapper) voiceVisualizerWrapper.classList.remove('has-transcript');
    }
  }

  if (isVoiceChatModeEnabled() && trimmed && !/^(Listening…|Transcribing…)$/i.test(trimmed)) {
    return;
  }
}

function clearVoiceLiveTranscript() {
  updateVoiceLiveTranscript('');
}

function getPcmRms(samples) {
  if (!samples || !samples.length) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function estimatePcmNoiseFloor(samples, sampleRate = 16000) {
  if (!samples || !samples.length) return 0.003;
  const frameSize = Math.max(160, Math.floor(sampleRate * 0.02));
  const frameLevels = [];
  for (let offset = 0; offset + frameSize <= samples.length; offset += frameSize) {
    frameLevels.push(getPcmRms(samples.subarray(offset, offset + frameSize)));
  }
  if (!frameLevels.length) return getPcmRms(samples);
  frameLevels.sort((a, b) => a - b);
  return Math.max(0.002, frameLevels[Math.floor(frameLevels.length * 0.2)] || 0.002);
}

function getPcmSpeechStats(samples, sampleRate = 16000) {
  if (!samples || !samples.length) return { speechRatio: 0, peak: 0, rms: 0, threshold: 0.006 };
  const frameSize = Math.max(160, Math.floor(sampleRate * 0.025));
  const noiseFloor = estimatePcmNoiseFloor(samples, sampleRate);
  const threshold = Math.max(0.006, noiseFloor * 2.6);
  let speechFrames = 0;
  let totalFrames = 0;
  let peak = 0;
  for (let offset = 0; offset + frameSize <= samples.length; offset += frameSize) {
    const frame = samples.subarray(offset, offset + frameSize);
    const rms = getPcmRms(frame);
    if (rms >= threshold) speechFrames++;
    totalFrames++;
    for (let i = 0; i < frame.length; i++) {
      const abs = Math.abs(frame[i]);
      if (abs > peak) peak = abs;
    }
  }
  return {
    speechRatio: totalFrames ? speechFrames / totalFrames : 0,
    peak,
    rms: getPcmRms(samples),
    threshold
  };
}

function hasEnoughSpeechForStt(samples, sampleRate = 16000) {
  if (!samples || samples.length < sampleRate * 0.45) return false;
  const stats = getPcmSpeechStats(samples, sampleRate);
  return stats.peak >= 0.018 && stats.rms >= 0.0035 && stats.speechRatio >= 0.12;
}

function trimPcmSilence(samples, threshold = null) {
  if (!samples || !samples.length) return samples;
  const activeThreshold = threshold || Math.max(0.004, estimatePcmNoiseFloor(samples) * 2.4);
  let start = 0;
  let end = samples.length - 1;
  while (start < end && Math.abs(samples[start]) < activeThreshold) start++;
  while (end > start && Math.abs(samples[end]) < activeThreshold) end--;
  if (end <= start) return samples;
  const pad = Math.floor(16000 * 0.08);
  return samples.subarray(Math.max(0, start - pad), Math.min(samples.length, end + pad + 1));
}

function applyPcmNoiseGate(samples, sampleRate = 16000) {
  if (!samples || !samples.length) return samples;
  const frameSize = Math.max(160, Math.floor(sampleRate * 0.02));
  const noiseFloor = estimatePcmNoiseFloor(samples, sampleRate);
  const openThreshold = Math.max(0.006, noiseFloor * 2.8);
  const closeThreshold = Math.max(0.004, noiseFloor * 1.8);
  const out = new Float32Array(samples.length);
  let gateOpen = false;

  for (let offset = 0; offset < samples.length; offset += frameSize) {
    const end = Math.min(samples.length, offset + frameSize);
    const frame = samples.subarray(offset, end);
    const rms = getPcmRms(frame);
    if (rms >= openThreshold) gateOpen = true;
    else if (rms < closeThreshold) gateOpen = false;

    const gain = gateOpen ? 1 : 0.12;
    for (let i = offset; i < end; i++) out[i] = samples[i] * gain;
  }

  return out;
}

function normalizePcmForStt(samples) {
  if (!samples || !samples.length) return samples;
  const trimmed = trimPcmSilence(samples);
  const gated = applyPcmNoiseGate(trimmed);
  const rms = getPcmRms(gated);
  if (rms <= 0.00001) return trimmed;
  const target = 0.12;
  let gain = 1;
  if (rms < target) gain = Math.min(8, target / rms);
  else if (rms > 0.35) gain = Math.max(0.5, target / rms);
  if (Math.abs(gain - 1) < 0.05) return gated;
  const out = new Float32Array(gated.length);
  for (let i = 0; i < gated.length; i++) {
    const amplified = gated[i] * gain;
    out[i] = Math.abs(amplified) < 0.002 ? 0 : Math.max(-1, Math.min(1, amplified));
  }
  return out;
}

function normalizeManualPcmForWindowsStt(samples) {
  if (!samples || !samples.length) return samples;
  const trimmed = trimPcmSilence(samples, 0.0025);
  const rms = getPcmRms(trimmed);
  if (rms <= 0.00001) return trimmed;
  const gain = Math.min(3, Math.max(0.5, 0.12 / rms));
  const out = new Float32Array(trimmed.length);
  for (let i = 0; i < trimmed.length; i++) {
    out[i] = Math.max(-1, Math.min(1, trimmed[i] * gain));
  }
  return out;
}

// Gentle trim + level boost without a noise gate. Modern speech engines
// (WinRT / Gemini) handle noise suppression themselves; hard gating and
// heavy gain only add artifacts that hurt accuracy.
function normalizePcmGentle(samples) {
  if (!samples || !samples.length) return samples;
  const trimmed = trimPcmSilence(samples);
  const rms = getPcmRms(trimmed);
  if (rms <= 0.00001) return trimmed;
  const gain = Math.min(3, Math.max(0.5, 0.12 / rms));
  if (Math.abs(gain - 1) < 0.05) return trimmed;
  const out = new Float32Array(trimmed.length);
  for (let i = 0; i < trimmed.length; i++) {
    out[i] = Math.max(-1, Math.min(1, trimmed[i] * gain));
  }
  return out;
}

function mergePcmChunks(chunks) {
  if (!chunks || !chunks.length) return new Float32Array(0);
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

async function resamplePcmTo16k(float32Samples, sourceRate = 48000) {
  if (!float32Samples || !float32Samples.length) return null;
  if (Math.round(sourceRate) === 16000) {
    return float32Samples instanceof Float32Array ? float32Samples : Float32Array.from(float32Samples);
  }

  const offline = new OfflineAudioContext(
    1,
    Math.ceil(float32Samples.length * 16000 / sourceRate),
    16000
  );
  const buffer = offline.createBuffer(1, float32Samples.length, sourceRate);
  const channel = float32Samples instanceof Float32Array
    ? float32Samples
    : Float32Array.from(float32Samples);
  buffer.copyToChannel(channel, 0);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function captureRecordedPcm() {
  if (!recordedPcmChunks.length) return { samples: null, sampleRate: pcmCaptureRate };
  const samples = mergePcmChunks(recordedPcmChunks);
  recordedPcmChunks = [];
  return { samples, sampleRate: pcmCaptureRate || 48000 };
}

function teardownPcmCapture() {
  if (pcmProcessor) {
    pcmProcessor.onaudioprocess = null;
    try { pcmProcessor.disconnect(); } catch (e) { /* ignore */ }
    pcmProcessor = null;
  }
}

async function decodeAudioBlobToMono16k(blob) {
  if (!blob || !blob.size) return null;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    await decodeCtx.close();

    const targetRate = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * targetRate), targetRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0);
  } catch (e) {
    console.warn('Audio decode error:', e);
    return null;
  }
}

function encodeWavBase64(float32Samples, sampleRate = 16000) {
  if (!float32Samples || !float32Samples.length) return '';
  const samples = float32Samples instanceof Float32Array
    ? float32Samples
    : Float32Array.from(float32Samples);
  const numSamples = samples.length;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function getVoiceLiveTranscriptText() {
  const finalized = (finalVoiceTranscript || '').trim();
  if (finalized) return finalized;

  const fromState = (accumulatedTranscript || '').trim();
  if (fromState) return fromState;

  if (chatInput && initialInputValue !== undefined) {
    const prefix = initialInputValue ? `${initialInputValue.trim()} ` : '';
    const spoken = chatInput.value.startsWith(prefix)
      ? chatInput.value.slice(prefix.length).trim()
      : chatInput.value.trim();
    if (spoken && spoken !== initialInputValue.trim()) return spoken;
  }

  if (voiceLiveTranscript) {
    const uiText = String(voiceLiveTranscript.textContent || '').trim();
    if (uiText && !/^(Listening…|Transcribing…)$/i.test(uiText)) return uiText;
  }

  return '';
}

function hasEnoughTranscriptWords(text, minWords = 3) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length >= minWords;
}

async function transcribeAudioWithTimeout(payload, timeoutMs = 25000) {
  if (!window.ultronAPI?.transcribeAudio) {
    return { success: false, error: 'Speech engine unavailable.' };
  }
  try {
    return await Promise.race([
      window.ultronAPI.transcribeAudio(payload),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Transcription timed out.')), timeoutMs);
      })
    ]);
  } catch (err) {
    return { success: false, error: err.message || 'Transcription failed.' };
  }
}

function applyVoiceTextToChatInput(text) {
  if (!chatInput) return;
  const prefix = initialInputValue ? initialInputValue.trim() + ' ' : '';
  const nextValue = text ? `${prefix}${text}` : initialInputValue;
  chatInput.value = nextValue;
  chatInput.dispatchEvent(new Event('input', { bubbles: true }));
  chatInput.style.height = 'auto';
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 160)}px`;
  chatInput.focus();
}

function restoreVoiceDoneButton() {
  if (!voiceBtnDone) return;
  voiceBtnDone.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;
  voiceBtnDone.style.pointerEvents = '';
  if (voiceBtnCancel) voiceBtnCancel.style.pointerEvents = '';
}

function transitionVoicePillToMainInput() {
  if (isVoiceChatModeEnabled()) {
    if (voiceRecordingPill) {
      voiceRecordingPill.classList.add('hidden');
      voiceRecordingPill.classList.remove('fading-out');
    }
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    if (voiceRecordingPill) {
      voiceRecordingPill.classList.add('fading-out');
      setTimeout(() => {
        voiceRecordingPill.classList.add('hidden');
        voiceRecordingPill.classList.remove('fading-out');
        if (mainInputPill) {
          mainInputPill.classList.remove('hidden');
          mainInputPill.classList.add('fading-out');
          requestAnimationFrame(() => {
            mainInputPill.classList.remove('fading-out');
            resolve();
          });
        } else {
          resolve();
        }
      }, 120);
    } else if (mainInputPill) {
      mainInputPill.classList.remove('hidden');
      resolve();
    } else {
      resolve();
    }
  });
}

function flushSpeechRecognition(timeoutMs = 900) {
  if (!speechRecognition) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    const prevOnEnd = speechRecognition.onend;

    speechRecognition.onend = () => {
      clearTimeout(timer);
      finish();
    };

    try {
      speechRecognition.stop();
    } catch (e) {
      clearTimeout(timer);
      finish();
    }
  });
}

async function blobToBase64Data(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function transcribeAudioWithGemini(audioBlob) {
  const apiKey = localStorage.getItem('ultron-gemini-api-key') || '';
  if (!apiKey || !audioBlob || !audioBlob.size) return '';

  try {
    const base64Audio = await blobToBase64Data(audioBlob);
    const speechModel = pickDefaultGeminiModel() || ONLINE_GEMINI_MODELS[0]?.name;
    if (!speechModel) return '';

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${speechModel}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Transcribe the following spoken voice audio recording into plain text verbatim. Return ONLY the spoken words with zero quotes, headers, or commentary.' },
            { inlineData: { mimeType: audioBlob.type || 'audio/webm', data: base64Audio } }
          ]
        }],
        generationConfig: { temperature: 0 }
      })
    });

    if (!res.ok) return '';
    const jsonRes = await res.json();
    return jsonRes.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  } catch (e) {
    console.warn('Gemini audio transcribe error:', e);
    return '';
  }
}

async function prepareSttSamples({ audioBlob = null, pcmSamples = null, pcmSampleRate = 48000, strictVoiceGate = false } = {}) {
  let blobSamples = null;
  let pcmResampled = null;

  if (audioBlob && audioBlob.size > 0) {
    blobSamples = await decodeAudioBlobToMono16k(audioBlob);
  }

  if (pcmSamples && pcmSamples.length > 0) {
    pcmResampled = await resamplePcmTo16k(pcmSamples, pcmSampleRate);
  }

  const blobOk = blobSamples && blobSamples.length > 800;
  const pcmOk = pcmResampled && pcmResampled.length > 800;

  // Prefer the raw recorded track: the browser already applies echo
  // cancellation, noise suppression and auto gain at capture time, and
  // modern speech engines transcribe it far more accurately than the
  // filtered PCM chain. PCM is only a fallback when the blob is missing.
  let samples = null;
  if (blobOk) {
    samples = blobSamples;
  } else if (pcmOk) {
    samples = pcmResampled;
    logTrace('STT audio source: filtered mic PCM (recorded track unavailable).', 'system');
  }

  if (!samples || samples.length <= 800) return null;
  // Modern engines (WinRT / Gemini) do their own noise handling; hard noise
  // gates and heavy gain only add artifacts that hurt accuracy.
  const normalized = normalizePcmGentle(samples);
  if (!normalized || normalized.length < 16000 * 0.45) return null;
  return strictVoiceGate && !hasEnoughSpeechForStt(normalized) ? null : normalized;
}

async function transcribeWithWindowsStt(samples, culture = getVoiceSttCulture()) {
  if (!samples || samples.length <= 800) return { success: false, error: 'Recording was too short.' };

  const wavBase64 = encodeWavBase64(samples, 16000);
  const payload = wavBase64
    ? { sampleRate: 16000, culture, wavBase64 }
    : {
        sampleRate: 16000,
        culture,
        samples: samples instanceof Float32Array ? Array.from(samples) : samples
      };
  const result = await transcribeAudioWithTimeout(payload, 25000);
  return result || { success: false, error: 'Windows Speech did not return a result.' };
}

function getVoiceTranscriptFallback(hint = '') {
  const fromHint = String(hint || '').trim();
  if (fromHint && !/^(Listening…|Transcribing…)$/i.test(fromHint)) return fromHint;

  const fromState = getVoiceLiveTranscriptText();
  if (fromState) return fromState;

  if (voiceModeCaption?.dataset.role === 'user') {
    const uiText = String(voiceModeCaption.textContent || '').trim();
    if (uiText && !/^(Listening…|Transcribing…|No speech detected|Thinking…|\.\.\.|…)$/i.test(uiText)) return uiText;
  }

  return '';
}

async function resolveVoiceTranscript({ audioBlob = null, pcmSamples = null, pcmSampleRate = 48000, liveTranscriptHint = '' } = {}) {
  const inVoiceMode = isVoiceChatModeEnabled();
  lastVoiceTranscriptionError = '';

  // Cloud-grade transcription first when a Gemini key is configured - it is
  // dramatically more accurate than any on-device engine for both chat and
  // voice mode. Falls through to the native Windows engine when offline.
  const geminiKeyForStt = (localStorage.getItem('ultron-gemini-api-key') || '').trim();
  if (geminiKeyForStt && audioBlob && audioBlob.size > 0) {
    try {
      const cloudText = await transcribeAudioWithGemini(audioBlob);
      if (cloudText) {
        logTrace('Cloud speech transcription complete.', 'system');
        return cloudText.trim();
      }
    } catch (cloudErr) {
      console.warn('Cloud transcription notice:', cloudErr.message);
    }
  }

  // Live Windows Speech transcript (accumulated in real time while the user
  // spoke). Prefer it over re-decoding the recorded buffer; fall through to
  // the recorded-audio engines only when the live engine produced nothing.
  const liveWindowsText = String(finalVoiceTranscript || '').trim();
  if (liveWindowsText) {
    logTrace('Speech transcription complete (live Windows engine).', 'system');
    return liveWindowsText;
  }

  const samples = await prepareSttSamples({ audioBlob, pcmSamples, pcmSampleRate, strictVoiceGate: false });
  if (samples && samples.length > 800 && window.ultronAPI?.transcribeAudio) {
    setVoiceTranscribingUi(true);

    const rms = getPcmRms(samples);
    const durationSec = (samples.length / 16000).toFixed(1);
    logTrace(`Mic captured ${durationSec}s (level ${rms.toFixed(4)}). Transcribing speech...`, 'system');
    if (rms < 0.002) {
      logTrace('Mic audio too quiet — raise Windows mic volume or move closer to the microphone.', 'system');
    }

    try {
      const result = await transcribeWithWindowsStt(samples);
      if (result?.text) {
        logTrace('Speech transcription complete.', 'system');
        return result.text.trim();
      }

      if (audioBlob && audioBlob.size > 0) {
        const geminiText = await transcribeAudioWithGemini(audioBlob);
        if (geminiText) {
          logTrace('Cloud speech transcription complete.', 'system');
          return geminiText.trim();
        }
      }

      const message = result?.error || 'Did not detect clear speech.';
      lastVoiceTranscriptionError = message;
      logTrace(message, 'system');
      if (!inVoiceMode) updateVoiceLiveTranscript(message, { processing: false });
    } catch (e) {
      console.warn('Speech transcription error:', e);
      if (audioBlob && audioBlob.size > 0) {
        try {
          const geminiText = await transcribeAudioWithGemini(audioBlob);
          if (geminiText) return geminiText.trim();
        } catch (gErr) { /* ignore */ }
      }
      logTrace('Voice transcription notice: ' + e.message, 'system');
    }
  } else if ((pcmSamples && pcmSamples.length > 0) || (audioBlob && audioBlob.size > 0)) {
    if (audioBlob && audioBlob.size > 0) {
      try {
        const geminiText = await transcribeAudioWithGemini(audioBlob);
        if (geminiText) return geminiText.trim();
      } catch (gErr) { /* ignore */ }
    }
    lastVoiceTranscriptionError = samples
      ? 'Recording was too short for Windows Speech.'
      : 'No usable microphone audio was captured.';
    logTrace(
      samples ? 'Recording too short — speak for at least 1 second.' : 'Could not capture mic audio. Check microphone permissions.',
      'system'
    );
  }

  if (inVoiceMode && !samples) {
    return '';
  }

  if (!samples && !lastVoiceTranscriptionError) {
    lastVoiceTranscriptionError = 'No microphone audio was captured.';
  }

  return '';
}

function setVoiceTranscribingUi(isTranscribing) {
  if (!isTranscribing) return;
  if (voiceLiveTranscript) {
    voiceLiveTranscript.textContent = 'Processing speech…';
    voiceLiveTranscript.classList.add('visible', 'processing');
    if (voiceVisualizerWrapper) voiceVisualizerWrapper.classList.add('has-transcript');
  }
  if (isVoiceChatModeEnabled()) {
    setVoiceModeStatus('Thinking…');
  }
}

function handleLiveWindowsSttPartial(text) {
  const piece = String(text || '').trim();
  if (!piece || !isRecordingVoice) return;
  finalVoiceTranscript = `${finalVoiceTranscript} ${piece}`.trim();
  accumulatedTranscript = finalVoiceTranscript;
  updateVoiceLiveTranscript(accumulatedTranscript);
  if (isVoiceChatModeEnabled()) {
    setVoiceModeStatus('Listening…');
  }
  if (chatInput && !isVoiceChatModeEnabled()) {
    const prefix = initialInputValue ? initialInputValue.trim() + ' ' : '';
    chatInput.value = prefix + accumulatedTranscript;
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
  }
}

async function startVoiceRecording(options = {}) {
  const voiceMode = options.voiceMode === true || (options.voiceMode !== false && isVoiceChatModeEnabled());
  if (isRecordingVoice) return;

  try {
    const modelCheck = await ensureVoiceModelForMic();
    if (!modelCheck.ready) {
      logTrace(modelCheck.message || 'Voice input is not available on this device.', 'system');
      alert(modelCheck.message || 'Voice input is not available on this device.');
      return;
    }

    accumulatedTranscript = '';
    finalVoiceTranscript = '';
    initialInputValue = chatInput ? chatInput.value : '';
    recordedAudioChunks = [];
    recordedPcmChunks = [];
    pcmCaptureRate = 48000;

    resetMicNoiseCalibration();

    const selectedDeviceId = getSelectedVoiceInputDeviceId();
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        sampleSize: 16,
        channelCount: 1
      }
    });

    refreshVoiceInputDevices();

    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const audioReady = await ensureAudioContextRunning(audioContext);
    if (!audioReady) {
      throw new Error('Microphone audio could not start. Tap “Tap to start listening”, then try again.');
    }

    pcmCaptureRate = audioContext.sampleRate || 48000;
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.65;

    const source = audioContext.createMediaStreamSource(mediaStream);
    const highPass = audioContext.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 90;
    highPass.Q.value = 0.7;
    const lowPass = audioContext.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 7600;
    lowPass.Q.value = 0.7;
    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(analyserNode);

    isRecordingVoice = true;
    voiceCaptureActive = true;
    clearVoiceLiveTranscript();
    clearVoiceModeCaption();

    if (voiceMode) {
      setVoiceOrbVisualState('listening');
      startVoiceOrbAnimation('mic');
      setVoiceModeStatus('Listening…');
    } else {
      updateVoiceLiveTranscript('Listening…', { processing: false });
      if (mainInputPill) {
        mainInputPill.classList.add('fading-out');
        setTimeout(() => {
          mainInputPill.classList.add('hidden');
          mainInputPill.classList.remove('fading-out');
          if (voiceRecordingPill) {
            voiceRecordingPill.classList.remove('hidden');
            voiceRecordingPill.classList.add('fading-out');
            requestAnimationFrame(() => {
              voiceRecordingPill.classList.remove('fading-out');
            });
          }
        }, 120);
      }
    }

    voiceStartTime = Date.now();
    if (voiceRecordingTimer) voiceRecordingTimer.textContent = '0:00';
    if (voiceTimerInterval) clearInterval(voiceTimerInterval);
    voiceTimerInterval = setInterval(updateVoiceTimer, 200);

    try {
      pcmProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      lowPass.connect(pcmProcessor);
      pcmProcessor.connect(silentGain);
      silentGain.connect(audioContext.destination);
      pcmProcessor.onaudioprocess = (event) => {
        if (!voiceCaptureActive) return;
        const input = event.inputBuffer.getChannelData(0);
        recordedPcmChunks.push(new Float32Array(input));
        if (recordedPcmChunks.length > 800) recordedPcmChunks.shift();
      };
    } catch (pcmErr) {
      console.warn('PCM capture init notice:', pcmErr);
    }
    if (!voiceMode) {
      drawWaveform();
    }

    if (voiceMode) {
      startVoiceModeVad();
    }

    try {
      const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
          : (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : ''));
      mediaRecorder = preferredMime
        ? new MediaRecorder(mediaStream, { mimeType: preferredMime })
        : new MediaRecorder(mediaStream);
      recordedAudioChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) recordedAudioChunks.push(e.data);
      };
      mediaRecorder.start(250);
    } catch (mErr) {
      console.warn('MediaRecorder init failed:', mErr);
      throw new Error('Could not start audio recording on this device.');
    }

    const SpeechRec = shouldUseBrowserSpeechRecognition()
      ? (window.SpeechRecognition || window.webkitSpeechRecognition)
      : null;
    if (SpeechRec) {
      speechRecognition = new SpeechRec();
      speechRecognition.continuous = true;
      speechRecognition.interimResults = true;
      speechRecognition.lang = getVoiceSttCulture();

      speechRecognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const piece = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalVoiceTranscript = `${finalVoiceTranscript} ${piece}`.trim();
          } else {
            interim += piece;
          }
        }
        accumulatedTranscript = (finalVoiceTranscript + interim).trim();
        updateVoiceLiveTranscript(accumulatedTranscript);
        if (voiceMode) {
          setVoiceModeStatus('Listening…');
        }

        if (chatInput && isRecordingVoice && !isVoiceChatModeEnabled()) {
          const prefix = initialInputValue ? initialInputValue.trim() + ' ' : '';
          chatInput.value = prefix + accumulatedTranscript;
          chatInput.style.height = 'auto';
          chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
        }
      };

      speechRecognition.onerror = (err) => {
        console.warn('Speech recognition notice:', err.error);
        if (err.error === 'not-allowed') {
          alert('Microphone speech recognition is blocked. Allow microphone access in Windows Settings → Privacy → Microphone.');
        }
      };

      speechRecognition.onend = () => {
        if (isRecordingVoice && speechRecognition) {
          try { speechRecognition.start(); } catch (e) {}
        }
      };

      speechRecognition.start();
    }

    // Modern Windows Speech engine (live). Streams recognition from the mic
    // while the user speaks - dramatically more accurate than decoding the
    // recorded buffer afterwards. Runs alongside the recorder so we always
    // keep the raw audio for cloud/Whisper fallbacks.
    if (!SpeechRec && window.ultronAPI?.startLiveSpeech) {
      try {
        const liveResult = await window.ultronAPI.startLiveSpeech(getVoiceSttCulture());
        if (liveResult?.success) {
          liveWindowsSttActive = true;
          liveWindowsSttFailed = false;
          if (liveWindowsSttUnsubscribe) { try { liveWindowsSttUnsubscribe(); } catch (e) {} }
          liveWindowsSttUnsubscribe = window.ultronAPI.onLiveSpeechPartial
            ? window.ultronAPI.onLiveSpeechPartial(handleLiveWindowsSttPartial)
            : null;
        } else {
          liveWindowsSttActive = false;
          liveWindowsSttFailed = true;
          if (liveResult?.code === 'privacy') {
            logTrace(liveResult.error || 'Turn on Online speech recognition in Windows Settings \u2192 Privacy & security \u2192 Speech for the most accurate mic input.', 'system');
            if (!liveSttPrivacyWarned) {
              liveSttPrivacyWarned = true;
              alert('For accurate voice input, turn on "Online speech recognition":\nWindows Settings \u2192 Privacy & security \u2192 Speech.\n\nUntil then, Ultron falls back to a less accurate offline engine.');
            }
          }
        }
      } catch (liveErr) {
        liveWindowsSttActive = false;
        liveWindowsSttFailed = true;
        console.warn('Live Windows speech notice:', liveErr?.message || liveErr);
      }
    }
  } catch (err) {
    console.error('Microphone access error:', err);
    voiceCaptureActive = false;
    isRecordingVoice = false;
    cancelVoiceOrbAnimation();
    if (voiceTimerInterval) {
      clearInterval(voiceTimerInterval);
      voiceTimerInterval = null;
    }
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      mediaStream = null;
    }
    if (audioContext) {
      try { audioContext.close(); } catch (e) { /* ignore */ }
      audioContext = null;
    }
    analyserNode = null;
    mediaRecorder = null;
    if (voiceMode) {
      setVoiceModeStatus('Tap to start listening');
      startVoiceOrbAnimation('idle');
      if (err.name === 'NotAllowedError') {
        logTrace('Microphone blocked — allow Ultron in Windows Settings → Privacy → Microphone.', 'system');
      }
    } else {
      const msg = err.name === 'NotAllowedError'
        ? 'Microphone access denied. Open Windows Settings → Privacy → Microphone and allow Ultron.'
        : (err.message || 'Unable to access microphone.');
      alert(msg);
    }
  }
}

async function stopVoiceRecording(saveTranscript = true, options = {}) {
  if (voiceStopInProgress) return;
  voiceStopInProgress = true;
  stopVoiceModeVad();

  try {
  voiceCaptureActive = false;
  await new Promise(r => setTimeout(r, 70));
  const { samples: capturedPcm, sampleRate: capturedPcmRate } = captureRecordedPcm();
  teardownPcmCapture();

  isRecordingVoice = false;

  if (voiceTimerInterval) {
    clearInterval(voiceTimerInterval);
    voiceTimerInterval = null;
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  if (saveTranscript && voiceBtnDone) {
    setVoiceTranscribingUi(true);
    voiceBtnDone.innerHTML = `
      <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
      </svg>
    `;
    voiceBtnDone.style.pointerEvents = 'none';
    if (voiceBtnCancel) voiceBtnCancel.style.pointerEvents = 'none';
  }

  if (speechRecognition) {
    speechRecognition.onend = null;
    await flushSpeechRecognition(250);
  }

  if (liveWindowsSttActive && window.ultronAPI?.stopLiveSpeech) {
    liveWindowsSttActive = false;
    try {
      const liveStop = await window.ultronAPI.stopLiveSpeech();
      const liveText = String(liveStop?.text || '').trim();
      if (liveText) finalVoiceTranscript = liveText;
    } catch (liveStopErr) {
      console.warn('Live Windows speech stop notice:', liveStopErr?.message || liveStopErr);
    }
  }
  liveWindowsSttActive = false;
  if (liveWindowsSttUnsubscribe) {
    try { liveWindowsSttUnsubscribe(); } catch (e) { /* ignore */ }
    liveWindowsSttUnsubscribe = null;
  }

  let finalAudioBlob = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, capturedPcm && capturedPcm.length > 800 ? 220 : 700);
      mediaRecorder.onstop = () => {
        clearTimeout(timeout);
        if (recordedAudioChunks.length > 0) {
          finalAudioBlob = new Blob(recordedAudioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        }
        resolve();
      };
      try {
        if (mediaRecorder.state === 'recording') mediaRecorder.requestData();
        mediaRecorder.stop();
      } catch (e) {
        clearTimeout(timeout);
        resolve();
      }
    });
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
    try { speechRecognition.stop(); } catch (e) {}
    speechRecognition = null;
  }

  let textToInsert = '';

  if (saveTranscript) {
    try {
      textToInsert = await resolveVoiceTranscript({
        audioBlob: finalAudioBlob,
        pcmSamples: capturedPcm,
        pcmSampleRate: capturedPcmRate
      });
    } catch (err) {
      console.error('Voice transcription error:', err);
      logTrace(err.message || 'Voice transcription failed.', 'system');
      textToInsert = '';
    }
  }

  restoreVoiceDoneButton();
  clearVoiceLiveTranscript();
  await transitionVoicePillToMainInput();

  const inVoiceMode = isVoiceChatModeEnabled();

  if (saveTranscript && inVoiceMode) {
    voiceModeRecording = false;

    if (textToInsert) {
      setVoiceModeStatus('Thinking…');
      cancelVoiceOrbAnimation();
      setVoiceOrbVisualState('');
      startVoiceOrbAnimation('idle');
      await submitPrompt(textToInsert);
    } else {
      clearVoiceModeCaption();
      setVoiceModeStatus(options.autoVoiceSubmit ? 'Listening…' : '');
      setVoiceOrbVisualState('listening');
      startVoiceOrbAnimation('idle');
      scheduleVoiceModeListen(options.autoVoiceSubmit ? 180 : 280);
    }
    updateVoiceModeBarUi();
  } else if (saveTranscript) {
    if (textToInsert) {
      applyVoiceTextToChatInput(textToInsert);
      logTrace('Voice input added to prompt.', 'system');
    } else {
      applyVoiceTextToChatInput('');
      if (chatInput && lastVoiceTranscriptionError) chatInput.placeholder = lastVoiceTranscriptionError;
      logTrace('No speech detected. Speak clearly for 1–2 seconds, then tap the checkmark.', 'system');
    }
  } else {
    if (chatInput) {
      chatInput.value = initialInputValue;
      chatInput.style.height = 'auto';
      chatInput.style.height = `${Math.min(chatInput.scrollHeight, 160)}px`;
    }
  }

  accumulatedTranscript = '';
  finalVoiceTranscript = '';
  initialInputValue = '';
  recordedAudioChunks = [];
  recordedPcmChunks = [];
  pcmCaptureRate = 48000;
  voiceCaptureActive = false;
  mediaRecorder = null;
  } finally {
    voiceStopInProgress = false;
  }
}

function drawWaveform() {
  if (!isRecordingVoice || !voiceWaveformCanvas || !analyserNode) return;

  const canvas = voiceWaveformCanvas;
  const canvasCtx = canvas.getContext('2d');

  const bufferLength = analyserNode.frequencyBinCount;
  const fftSize = analyserNode.fftSize || 256;
  if (!_waveformFreqBuffer || _waveformFreqBuffer.length !== bufferLength) {
    _waveformFreqBuffer = new Uint8Array(bufferLength);
  }
  if (!_waveformTimeBuffer || _waveformTimeBuffer.length !== fftSize) {
    _waveformTimeBuffer = new Uint8Array(fftSize);
  }

  // Cache canvas dimensions outside rAF to avoid triggering forced layout reflows (getBoundingClientRect) on every frame
  const dpr = window.devicePixelRatio || 1;
  let width = canvas.clientWidth || canvas.width || 500;
  let height = canvas.clientHeight || canvas.height || 32;

  function renderFrame() {
    if (!isRecordingVoice) return;
    animFrameId = requestAnimationFrame(renderFrame);

    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      width = canvas.clientWidth || width;
      height = canvas.clientHeight || height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    
    canvasCtx.save();
    canvasCtx.scale(dpr, dpr);

    analyserNode.getByteFrequencyData(_waveformFreqBuffer);
    analyserNode.getByteTimeDomainData(_waveformTimeBuffer);
    const freqArray = _waveformFreqBuffer;
    const timeArray = _waveformTimeBuffer;

    // Calculate real-time Volume Intensity (RMS)
    let sum = 0;
    for (let k = 0; k < timeArray.length; k++) {
      const v = (timeArray[k] - 128) / 128;
      sum += v * v;
    }
    const rmsVolume = Math.sqrt(sum / timeArray.length); // 0.0 (silent) to ~1.0 (loud)

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
      const freqAmp = (freqArray[dataIdx] || 0) / 255;
      
      // Multiplier for voice pitch & sound volume intensity — boosted for strong dynamic reaction
      const voiceFactor = Math.max(freqAmp * 2.8, rmsVolume * 6.0);
      
      let targetHeight = 4;
      if (voiceFactor >= 0.005) {
        targetHeight = Math.min(height - 2, Math.max(4, voiceFactor * (height - 2)));
      }

      // Smooth lerp transition for fluid 60fps movement
      _prevHeights[i] += (targetHeight - _prevHeights[i]) * 0.45;
      const pillHeight = _prevHeights[i];
      const y = (height - pillHeight) / 2;
      // Vibrant Blue visualizer waveform fill
      if (voiceFactor >= 0.01) {
        const glowOpacity = Math.min(1.0, 0.65 + voiceFactor * 0.35);
        canvasCtx.fillStyle = `rgba(59, 130, 246, ${glowOpacity})`;
      } else {
        canvasCtx.fillStyle = 'rgba(96, 165, 250, 0.45)';
      }

      canvasCtx.beginPath();
      if (canvasCtx.roundRect) {
        canvasCtx.roundRect(x, y, pillWidth, pillHeight, pillWidth / 2);
      } else {
        canvasCtx.rect(x, y, pillWidth, pillHeight);
      }
      canvasCtx.fill();

      x += pillWidth + pillGap;
    }
    
    canvasCtx.restore();
  }

  renderFrame();
}

// Guarantee smooth fade-out of skeleton loader so app NEVER freezes or shows white screen
function hideSkeletonLoader() {
  const skeletonOverlay = document.getElementById('app-skeleton-overlay');
  if (skeletonOverlay && !skeletonOverlay.classList.contains('hidden')) {
    skeletonOverlay.classList.add('hidden');
    setTimeout(() => {
      skeletonOverlay.style.display = 'none';
      skeletonOverlay.style.pointerEvents = 'none';
    }, 450);
  }
}

// Immediate boot sequence: Keep skeleton loader visible while background diagnostics run
function isLegacyAppDataStoragePath(dirPath) {
  if (!dirPath) return false;
  const normalized = String(dirPath).replace(/\//g, '\\').toLowerCase();
  if (normalized.includes('\\appdata\\') && (normalized.includes('ultrondatadev') || normalized.includes('ultrondata'))) return true;
  if (/\\ultron$/.test(normalized.replace(/\\+$/, '')) && !/\\ultron-local$/.test(normalized) && !/\\ultron-ai$/.test(normalized)) return true;
  return false;
}

async function loadStoragePathsUI() {
  if (window.ultronAPI?.ensureUltronStorage) {
    await window.ultronAPI.ensureUltronStorage().catch(() => {});
  }
  if (!window.ultronAPI?.getStoragePaths) return;
  const paths = await window.ultronAPI.getStoragePaths().catch(() => null);
  if (!paths) return;

  if (storageUltronRootLabel) {
    const folderLabel = paths.storageFolderName || (paths.ultronRoot?.includes('Ultron-AI') ? 'Ultron-AI' : 'brown-local');
    storageUltronRootLabel.textContent = `${folderLabel}: ${paths.ultronRoot || paths.defaultUltronRoot || ''}`;
  }
  if (storageInstallRootLabel) {
    storageInstallRootLabel.textContent = `App install: ${paths.installRoot}`;
  }
  if (settingDataDir) {
    settingDataDir.value = paths.agentDataDir || paths.defaultAgentDataDir || '';
    window.localStorage.setItem('ultron-data-dir', settingDataDir.value);
  }
  if (settingConnectorsDir) {
    settingConnectorsDir.value = paths.connectorsDir || paths.defaultConnectorsDir || '';
    window.localStorage.setItem('ultron-connectors-dir', settingConnectorsDir.value);
  }
  if (settingOllamaModelsDir) {
    settingOllamaModelsDir.value = paths.modelsDir || paths.defaultModelsDir || paths.ollamaModelsDir || 'Not configured';
  }
  const ollamaNote = document.getElementById('setting-ollama-install-note');
  if (ollamaNote) {
    const modelsPath = paths.modelsDir || paths.defaultModelsDir || '';
    const folderName = paths.storageFolderName || 'brown-local';
    ollamaNote.textContent = paths.ollamaInstallPath
      ? `Ollama: ${paths.ollamaInstallPath}. Models → ${modelsPath || `${folderName}\\models`}.`
      : `Models → ${modelsPath || `${folderName}\\models`} when Ollama is installed.`;
  }
}

async function syncStoragePathOnBoot() {
  if (!window.ultronAPI?.ensureUltronStorage) return;
  try {
    await window.ultronAPI.ensureUltronStorage();
    const paths = await window.ultronAPI.getStoragePaths?.().catch(() => null);
    if (!paths) return;

    let agentPath = window.localStorage.getItem('ultron-data-dir')?.trim();
    let connectorsPath = window.localStorage.getItem('ultron-connectors-dir')?.trim();

    if (!agentPath || isLegacyAppDataStoragePath(agentPath)) {
      agentPath = paths.agentDataDir || paths.defaultAgentDataDir;
    }
    if (!connectorsPath || isLegacyAppDataStoragePath(connectorsPath)) {
      connectorsPath = paths.connectorsDir || paths.defaultConnectorsDir;
    }

    if (agentPath && window.ultronAPI.updateDataDir) {
      await window.ultronAPI.updateDataDir(agentPath);
      window.localStorage.setItem('ultron-data-dir', agentPath);
    }
    if (connectorsPath && window.ultronAPI.updateConnectorsDir) {
      await window.ultronAPI.updateConnectorsDir(connectorsPath);
      window.localStorage.setItem('ultron-connectors-dir', connectorsPath);
    }
    if (paths.ultronRoot) {
      window.localStorage.setItem('ultron-root', paths.ultronRoot);
    }
  } catch (e) { /* ignore */ }
}

async function confirmConnectorDownloadLocation() {
  if (!window.ultronAPI?.getStoragePaths) return true;
  const paths = await window.ultronAPI.getStoragePaths().catch(() => null);
  const target = paths?.connectorsDir || paths?.defaultConnectorsDir || 'connectors folder';
  const proceed = confirm(
    `Download connector to:\n${target}\n\nClick OK to install here, or Cancel to choose a different folder.`
  );
  if (proceed) return true;

  const result = await window.ultronAPI.selectDirectory();
  if (result.canceled || !result.filePaths?.length) return false;

  const chosen = result.filePaths[0];
  const updateResult = await window.ultronAPI.updateConnectorsDir(chosen);
  if (!updateResult.success) {
    alert(`Could not set connectors folder: ${updateResult.error || 'Unknown error'}`);
    return false;
  }
  if (settingConnectorsDir) settingConnectorsDir.value = chosen;
  window.localStorage.setItem('ultron-connectors-dir', chosen);
  logTrace(`Connectors download location set to: "${chosen}"`, 'system');
  return true;
}

function renderWorkflowsListUI() {
  const list = document.getElementById('workflows-list');
  if (!list || !window.UltronAgentMemory) return;
  const workflows = window.UltronAgentMemory.loadWorkflows();
  list.innerHTML = '';
  if (!workflows.length) {
    list.innerHTML = '<p class="text-xs text-muted">No workflows yet. Add one or say: save workflow called My Task: OPEN_APP Notepad</p>';
    return;
  }
  workflows.forEach(wf => {
    const row = document.createElement('div');
    row.className = 'workflow-row';
    row.innerHTML = `
      <div class="workflow-row-info">
        <div class="workflow-row-name">${escapeHtml(wf.name)}</div>
        <div class="workflow-row-steps">${wf.steps.map(s => escapeHtml(s)).join(' → ')}</div>
      </div>
      <div class="workflow-row-actions">
        <button type="button" class="sound-preview-btn btn-run-workflow" data-id="${escapeHtml(wf.id)}" style="display: inline-flex; align-items: center; gap: 5px;">
          <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          <span>Run</span>
        </button>
        <button type="button" class="sound-preview-btn btn-delete-workflow" data-id="${escapeHtml(wf.id)}" style="display: inline-flex; align-items: center; gap: 5px;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          <span>Delete</span>
        </button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('.btn-run-workflow').forEach(btn => {
    btn.addEventListener('click', () => {
      const wf = window.UltronAgentMemory.loadWorkflows().find(w => w.id === btn.dataset.id);
      if (wf) submitPrompt(`run ${wf.name}`);
    });
  });
  list.querySelectorAll('.btn-delete-workflow').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.UltronAgentMemory.deleteWorkflow) window.UltronAgentMemory.deleteWorkflow(btn.dataset.id);
      renderWorkflowsListUI();
      populateScheduleWorkflowPick();
    });
  });
}

function populateScheduleWorkflowPick() {
  const pick = document.getElementById('schedule-workflow-pick');
  if (!pick || !window.UltronAgentMemory) return;
  const workflows = window.UltronAgentMemory.loadWorkflows();
  pick.innerHTML = workflows.map(w => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join('')
    || '<option value="">No workflows</option>';
}

function renderSchedulesListUI() {
  const list = document.getElementById('schedules-list');
  if (!list || !window.UltronAgentScheduler) return;
  const schedules = window.UltronAgentScheduler.loadSchedules();
  list.innerHTML = '';
  if (!schedules.length) {
    list.innerHTML = '<p class="text-xs text-muted">No schedules. Pick a workflow and time above.</p>';
    return;
  }
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  schedules.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'workflow-row';
    const days = (entry.days || []).map(d => dayNames[d]).join(', ');
    row.innerHTML = `
      <div class="workflow-row-info">
        <div class="workflow-row-name">${escapeHtml(entry.label || entry.workflowId)}</div>
        <div class="workflow-row-steps">${String(entry.hour).padStart(2, '0')}:${String(entry.minute).padStart(2, '0')} · ${days || 'Every day'}</div>
      </div>
      <div class="workflow-row-actions">
        <button type="button" class="sound-preview-btn btn-remove-schedule" data-id="${escapeHtml(entry.id)}">Remove</button>
      </div>`;
    list.appendChild(row);
  });
  list.querySelectorAll('.btn-remove-schedule').forEach(btn => {
    btn.addEventListener('click', () => {
      window.UltronAgentScheduler.removeSchedule(btn.dataset.id);
      renderSchedulesListUI();
    });
  });
}

function renderCapabilityGatesUI() {
  const list = document.getElementById('capability-gates-list');
  const caps = window.UltronAgentCapabilities;
  if (!list || !caps) return;
  list.innerHTML = '';
  Object.entries(caps.CAPABILITY_GROUPS).forEach(([id, group]) => {
    const row = document.createElement('div');
    row.className = 'capability-row';
    const select = document.createElement('select');
    select.className = 'capability-mode-select';
    select.dataset.group = id;
    ['off', 'ask', 'always'].forEach(mode => {
      const opt = document.createElement('option');
      opt.value = mode;
      opt.textContent = mode.charAt(0).toUpperCase() + mode.slice(1);
      if (caps.getCapabilityMode(id) === mode) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', () => {
      caps.setCapabilityMode(id, select.value);
      logTrace(`Capability ${group.label}: ${select.value}`, 'system');
    });
    row.innerHTML = `
      <div class="capability-row-info">
        <div class="capability-row-label">${escapeHtml(group.label)}</div>
        <div class="capability-row-desc">${escapeHtml(group.description)}</div>
      </div>`;
    row.appendChild(select);
    list.appendChild(row);
  });
}

function renderAuditLogUI() {
  const list = document.getElementById('audit-log-list');
  const audit = window.UltronAgentAudit;
  if (!list || !audit) return;
  const entries = audit.getAuditLog(40);
  list.innerHTML = '';
  if (!entries.length) {
    list.innerHTML = '<p class="text-xs text-muted">No agent actions recorded yet.</p>';
    return;
  }
  entries.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'audit-row';
    const time = new Date(entry.ts).toLocaleString();
    const summary = audit.formatAuditSummary(entry);
    const outcomeClass = entry.approved === false ? 'denied' : (entry.success ? 'ok' : 'fail');
    const outcomeLabel = entry.outcome || (entry.success ? 'completed' : 'failed');
    row.innerHTML = `
      <div class="audit-row-info">
        <div class="audit-row-time">${escapeHtml(time)}</div>
        <div class="audit-row-summary">${escapeHtml(summary)}</div>
        <div class="audit-row-outcome ${outcomeClass}">${escapeHtml(outcomeLabel)}</div>
      </div>`;
    list.appendChild(row);
  });
}

function initAutomationSettingsUI() {
  try {
  const localAiMode = document.getElementById('setting-local-ai-mode');
  if (localAiMode) {
    localAiMode.value = getLocalAiMode();
    localAiMode.addEventListener('change', () => {
      window.localStorage.setItem('ultron-ai-mode', localAiMode.value);
      updateLocalAiModeStatus();
      logTrace(`Local AI mode: ${localAiMode.value}`, 'system');
    });
    updateLocalAiModeStatus();
  }

  document.getElementById('btn-add-workflow')?.addEventListener('click', () => {
    const name = window.prompt('Workflow name');
    if (!name) return;
    const stepsRaw = window.prompt('Steps (separate with commas or "then")', 'OPEN_APP: Notepad');
    if (!stepsRaw || !window.UltronAgentMemory) return;
    const steps = stepsRaw.split(/\s*(?:,|\bthen\b)\s*/i).map(s => s.trim()).filter(Boolean);
    window.UltronAgentMemory.addWorkflow(name, steps);
    renderWorkflowsListUI();
    populateScheduleWorkflowPick();
  });

  document.getElementById('btn-add-schedule')?.addEventListener('click', () => {
    const wfId = document.getElementById('schedule-workflow-pick')?.value;
    const timeVal = document.getElementById('schedule-time-pick')?.value;
    if (!wfId || !timeVal || !window.UltronAgentScheduler) return;
    const [hour, minute] = timeVal.split(':').map(Number);
    window.UltronAgentScheduler.addSchedule({ workflowId: wfId, hour, minute });
    renderSchedulesListUI();
    logTrace(`Scheduled workflow at ${timeVal}`, 'system');
  });

  document.getElementById('btn-clear-audit-log')?.addEventListener('click', () => {
    if (window.UltronAgentAudit) window.UltronAgentAudit.clearAuditLog();
    renderAuditLogUI();
  });

  document.querySelector('.settings-tab-btn[data-tab="desktop"]')?.addEventListener('click', () => {
    renderWorkflowsListUI();
    populateScheduleWorkflowPick();
    renderSchedulesListUI();
    updateLocalAiModeStatus();
  });

  document.querySelector('.settings-tab-btn[data-tab="permissions"]')?.addEventListener('click', () => {
    renderCapabilityGatesUI();
    renderAuditLogUI();
  });

  renderWorkflowsListUI();
  populateScheduleWorkflowPick();
  renderSchedulesListUI();
  renderCapabilityGatesUI();
  renderAuditLogUI();

  if (window.UltronAgentScheduler && typeof window.UltronAgentScheduler.startScheduler === 'function') {
    window.UltronAgentScheduler.startScheduler((entry) => {
      const wf = window.UltronAgentMemory?.loadWorkflows()?.find(w => w.id === entry.workflowId);
      if (!wf) return;
      logTrace(`Running scheduled workflow: ${wf.name}`, 'system');
      playUltronSound?.('task_complete');
      submitPrompt(`run ${wf.name}`);
    });
  }
  } catch (initErr) {
    console.warn('Automation settings init failed:', initErr);
  }
}

function settleBootStep(promise, timeoutMs = 10000) {
  return Promise.race([
    Promise.resolve(promise).catch((error) => {
      console.warn('Startup task failed:', error);
      return null;
    }),
    new Promise((resolve) => setTimeout(resolve, timeoutMs))
  ]);
}

const SPLASH_DISPLAY_DURATION_MS = 10000; // Mandatory 10 seconds minimum display on startup
const SKELETON_DISPLAY_DURATION_MS = 1000;
const SPLASH_FADE_MS = 450;
const bootStartTime = Date.now();

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let splashStatusInterval = null;
let splashTransitionTimeout = null;

function updateSplashStatus(message, immediate = false) {
  const el = document.getElementById('splash-status-text');
  if (!el || !message) return;
  if (el.dataset.currentMsg === message) return;
  el.dataset.currentMsg = message;

  if (immediate) {
    if (splashTransitionTimeout) {
      clearTimeout(splashTransitionTimeout);
      splashTransitionTimeout = null;
    }
    el.classList.remove('status-fade-out', 'status-fade-in');
    el.textContent = message;
    return;
  }

  if (splashTransitionTimeout) {
    clearTimeout(splashTransitionTimeout);
  }

  el.classList.add('status-fade-out');
  el.classList.remove('status-fade-in');

  splashTransitionTimeout = setTimeout(() => {
    el.textContent = message;
    el.classList.remove('status-fade-out');
    el.classList.add('status-fade-in');

    // Force browser reflow to trigger smooth entry transition
    void el.offsetWidth;

    requestAnimationFrame(() => {
      el.classList.remove('status-fade-in');
    });
    splashTransitionTimeout = null;
  }, 220);
}

function startSplashStatusCycle() {
  const messages = [
    { at: 0, text: 'Starting up...' },
    { at: 1800, text: 'Checking your models...' },
    { at: 3600, text: 'Syncing your workspace...' },
    { at: 5400, text: 'Checking connections...' },
    { at: 7200, text: 'Connecting services...' },
    { at: 8800, text: 'Getting everything ready...' }
  ];

  const start = Date.now();
  // Immediately set first message without fade lag
  updateSplashStatus(messages[0].text, true);

  splashStatusInterval = setInterval(() => {
    const elapsed = Date.now() - start;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (elapsed >= messages[i].at) {
        updateSplashStatus(messages[i].text);
        break;
      }
    }
  }, 100);
}

function stopSplashStatusCycle() {
  if (splashStatusInterval) {
    clearInterval(splashStatusInterval);
    splashStatusInterval = null;
  }
  if (splashTransitionTimeout) {
    clearTimeout(splashTransitionTimeout);
    splashTransitionTimeout = null;
  }
}

function dismissSplashScreen() {
  stopSplashStatusCycle();
  const splashScreen = document.getElementById('app-splash-screen');
  if (!splashScreen || splashScreen.dataset.dismissed === '1') {
    return;
  }
  splashScreen.dataset.dismissed = '1';
  splashScreen.classList.add('fade-out');
  setTimeout(() => {
    splashScreen.style.display = 'none';
    splashScreen.style.pointerEvents = 'none';
  }, SPLASH_FADE_MS);
}

function ensureSkeletonVisible() {
  const skeletonOverlay = document.getElementById('app-skeleton-overlay');
  if (!skeletonOverlay) return;
  skeletonOverlay.classList.remove('hidden');
  skeletonOverlay.style.display = 'flex';
  skeletonOverlay.style.visibility = 'visible';
  skeletonOverlay.style.opacity = '1';
  skeletonOverlay.style.pointerEvents = 'all';
}

async function bootSystem() {
  const splashScreen = document.getElementById('app-splash-screen');
  if (splashScreen) {
    splashScreen.style.display = 'flex';
    splashScreen.style.opacity = '1';
    splashScreen.style.visibility = 'visible';
  }

  startSplashStatusCycle();

  try {
    // 1. Instant Synchronous UI pre-renders (safely isolated)
    try { updateWelcomeGreeting(); } catch (e) { console.warn('Welcome greeting err:', e); }
    try { setSendingState(false); } catch (e) { console.warn('Sending state err:', e); }
    try { initTraceEmptyState(); } catch (e) { console.warn('Trace empty state err:', e); }
    try { renderChecklist([]); } catch (e) { console.warn('Checklist err:', e); }
    try { syncPlusMenuToggles(); } catch (e) { console.warn('Menu toggles err:', e); }
    try { initAutomationSettingsUI(); } catch (e) { console.warn('Automation settings err:', e); }
    try { startLiveMetricsPolling(); } catch (e) { console.warn('Live metrics err:', e); }

    // 2. Parallel background preload (non-blocking)
    const coreTasks = [
      syncStoragePathOnBoot().then(() => loadStoragePathsUI()).catch(() => {}),
      reloadConversationsFromDisk().catch(() => {}),
      loadAccountDetails({ locationReason: 'startup', forceLocationRefresh: false }).catch(() => {}),
      checkOllamaStartup().catch(() => {}),
      initMultiProviderUI().catch(() => {}),
      syncSecurityMode().catch(() => {}),
      (async () => {
        if (window.UltronAgentPrompt?.loadUltronAgentConfig) {
          await window.UltronAgentPrompt.loadUltronAgentConfig().catch(() => {});
          if (window.UltronAgentPrompt?.startUltronAgentConfigHotReload) {
            window.UltronAgentPrompt.startUltronAgentConfigHotReload();
          }
        }
      })()
    ];

    if (window.UltronAgentMemory?.loadTaskMemory) {
      try { _learnedTaskMemory = window.UltronAgentMemory.loadTaskMemory().map(item => item.text || item); } catch (e) {}
    }

    const bootAllowlist = getSavedAuthorizedAppsMap();
    if (bootAllowlist && window.ultronAPI?.setAuthorizedApps) {
      window.ultronAPI.setAuthorizedApps(bootAllowlist).catch(() => {});
    }

    // Run core tasks in parallel
    Promise.allSettled(coreTasks).catch(() => {});
  } catch (err) {
    console.error('Boot sequence initialization warning:', err);
  } finally {
    // MANDATORY 10-SECOND LOCK: ALWAYS guarantee splash displays for strictly 10.0 seconds
    const elapsed = Date.now() - bootStartTime;
    if (elapsed < SPLASH_DISPLAY_DURATION_MS) {
      await waitMs(SPLASH_DISPLAY_DURATION_MS - elapsed);
    }

    updateSplashStatus('Ready — Let’s get started!');
    await waitMs(300);

    dismissSplashScreen();

    try {
      renderModelDropdownList();
      renderSettingsModels();
      updateModelSelectorLabel();
    } catch (e) {}

    hideSkeletonLoader();

    // Deferred tasks after UI is live
    checkAndRunFirstTimeOnboarding().catch(() => {});
    initVoiceChatModeAfterBoot();
  }
}

bootSystem();
syncSecurityMode();

// Bind left sidebar toggle directly to element
const btnToggleLeftSidebar = document.getElementById('btn-toggle-left-sidebar');
const leftSidebar = document.getElementById('left-sidebar');
if (btnToggleLeftSidebar && leftSidebar) {
  if (localStorage.getItem('ultron-left-sidebar-collapsed') !== 'false') {
    leftSidebar.classList.add('collapsed');
  }
  btnToggleLeftSidebar.addEventListener('click', () => {
    leftSidebar.classList.toggle('collapsed');
    localStorage.setItem(
      'ultron-left-sidebar-collapsed',
      leftSidebar.classList.contains('collapsed') ? 'true' : 'false'
    );
    logTrace('Left navigation menu width toggled.', 'system');
  });
}

// Bind right sidebar collapsible sections (collapse state persisted per section)
const rightSections = document.querySelectorAll('.right-section.collapsible');
rightSections.forEach((section) => {
  if (section.id && window.localStorage.getItem(`ultron-section-collapsed-${section.id}`) === 'true') {
    section.classList.add('collapsed');
  }
  const header = section.querySelector('.section-header-clickable');
  if (header) {
    header.addEventListener('click', () => {
      section.classList.toggle('collapsed');
      if (section.id) {
        window.localStorage.setItem(`ultron-section-collapsed-${section.id}`, section.classList.contains('collapsed') ? 'true' : 'false');
      }
      const title = section.querySelector('.section-title').textContent;
      logTrace(`Right panel section "${title}" toggled.`, 'system');
    });
  }
});

// Bind settings modal triggers
const settingMemoryToggle = document.getElementById('setting-memory-toggle');
const settingScreenCaptureToggle = document.getElementById('setting-screen-capture-toggle');
const settingNeverCaptureApps = document.getElementById('setting-never-capture-apps');

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

if (settingScreenCaptureToggle) {
  settingScreenCaptureToggle.addEventListener('change', () => {
    window.localStorage.setItem('ultron-screen-capture-enabled', settingScreenCaptureToggle.checked ? 'true' : 'false');
    window.localStorage.setItem('ultron-screen-aware-enabled', settingScreenCaptureToggle.checked ? 'true' : 'false');
    syncPlusMenuToggles();
    logTrace(`Live screen capture ${settingScreenCaptureToggle.checked ? 'enabled' : 'disabled'}.`, 'system');
  });
}

if (settingNeverCaptureApps) {
  settingNeverCaptureApps.value = window.localStorage.getItem('ultron-never-capture-apps') || '';
  settingNeverCaptureApps.addEventListener('change', () => {
    window.localStorage.setItem('ultron-never-capture-apps', settingNeverCaptureApps.value.trim());
  });
}

const settingSoundEnabled = document.getElementById('setting-sound-enabled');
const settingSoundTaskComplete = document.getElementById('setting-sound-task-complete');
const settingSoundPermission = document.getElementById('setting-sound-permission');
const settingSoundQuestion = document.getElementById('setting-sound-question');
const settingSoundVolume = document.getElementById('setting-sound-volume');
const settingSoundVolumeLabel = document.getElementById('setting-sound-volume-label');

function updateSoundVolumeLabel() {
  if (!settingSoundVolume || !settingSoundVolumeLabel) return;
  settingSoundVolumeLabel.textContent = `${settingSoundVolume.value}%`;
}

function previewUltronSound(kind) {
  const wasEnabled = window.localStorage.getItem('ultron-sound-enabled');
  window.localStorage.setItem('ultron-sound-enabled', 'true');
  playUltronSound(kind);
  if (wasEnabled === 'false') window.localStorage.setItem('ultron-sound-enabled', 'false');
}

function initSoundSettingsUI() {
  if (settingSoundEnabled) {
    settingSoundEnabled.checked = window.localStorage.getItem('ultron-sound-enabled') !== 'false';
    settingSoundEnabled.addEventListener('change', () => {
      window.localStorage.setItem('ultron-sound-enabled', settingSoundEnabled.checked ? 'true' : 'false');
    });
  }
  if (settingSoundTaskComplete) {
    settingSoundTaskComplete.checked = window.localStorage.getItem('ultron-sound-task-complete') !== 'false';
    settingSoundTaskComplete.addEventListener('change', () => {
      window.localStorage.setItem('ultron-sound-task-complete', settingSoundTaskComplete.checked ? 'true' : 'false');
    });
  }
  if (settingSoundPermission) {
    settingSoundPermission.checked = window.localStorage.getItem('ultron-sound-permission') !== 'false';
    settingSoundPermission.addEventListener('change', () => {
      window.localStorage.setItem('ultron-sound-permission', settingSoundPermission.checked ? 'true' : 'false');
    });
  }
  if (settingSoundQuestion) {
    settingSoundQuestion.checked = window.localStorage.getItem('ultron-sound-question') !== 'false';
    settingSoundQuestion.addEventListener('change', () => {
      window.localStorage.setItem('ultron-sound-question', settingSoundQuestion.checked ? 'true' : 'false');
    });
  }
  if (settingSoundVolume) {
    const vol = window.localStorage.getItem('ultron-sound-volume');
    if (vol != null) settingSoundVolume.value = vol;
    updateSoundVolumeLabel();
    settingSoundVolume.addEventListener('input', () => {
      window.localStorage.setItem('ultron-sound-volume', settingSoundVolume.value);
      updateSoundVolumeLabel();
    });
  }

  document.querySelectorAll('.sound-preview-btn').forEach(button => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      previewUltronSound(button.dataset.soundKind);
    });
  });

  document.querySelectorAll('.sound-file-picker').forEach(button => {
    const kind = button.dataset.soundKind;
    const savedName = window.localStorage.getItem(`ultron-sound-name-${kind}`);
    if (savedName) button.textContent = savedName;
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!window.ultronAPI?.selectSoundFile) return;
      const result = await window.ultronAPI.selectSoundFile();
      if (result?.canceled || !result?.fileUrl) return;
      const fileName = String(result.path || '').split(/[\\/]/).pop() || 'Custom file';
      window.localStorage.setItem(`ultron-sound-file-${kind}`, result.fileUrl);
      window.localStorage.setItem(`ultron-sound-name-${kind}`, fileName);
      button.textContent = fileName;
      Object.keys(_soundCache).forEach(key => {
        if (key === result.fileUrl) delete _soundCache[key];
      });
      playUltronSound(kind);
    });
  });
}

initSoundSettingsUI();

// ==========================================
// TEXT-TO-SPEECH (TTS) — read AI responses aloud
// ==========================================
let activeTtsUtterance = null;
let activeNeuralAudio = null;
let ttsVoicesCache = [];
let ttsKeepAliveTimer = null;

function isTtsAutoSpeakEnabled() {
  // In voice chat mode, always auto-speak responses
  if (isVoiceChatModeEnabled()) return true;
  // In normal text mode, never auto-speak — user must click Speak button.
  // Background pre-synthesis is handled separately by the pre-cache system.
  return false;
}

// --- TTS Pre-cache for text mode ---
// Synthesize audio in background as soon as a response is generated,
// so when the user clicks Speak, the audio is instantly ready.
const _ttsPrecache = new Map(); // key: text hash -> { wavBase64, mimeType }
let _ttsPrecacheGeneration = 0;

function _ttsPrecacheHash(text) {
  // Simple hash for cache keying
  let h = 0;
  const s = String(text || '').slice(0, 500);
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h + '_' + (text || '').length;
}

async function precacheTtsAudio(fullText) {
  // Pre-synthesize in background for text mode (not voice chat mode)
  if (isVoiceChatModeEnabled()) return;
  if (!fullText || isThinkingMarkup(fullText)) return;

  const cleaned = normalizeTextForSpeech(fullText);
  if (!cleaned || cleaned.length < 5) return;

  const cacheKey = _ttsPrecacheHash(cleaned);
  if (_ttsPrecache.has(cacheKey)) return; // Already cached

  const gen = ++_ttsPrecacheGeneration;

  try {
    const modelKey = await resolveActiveTtsModelKey();
    if (!modelKey || !window.ultronAPI?.synthesizeSpeech) return;
    if (gen !== _ttsPrecacheGeneration) return; // Stale

    const apiKey = (localStorage.getItem('ultron-gemini-api-key') || '').trim();
    const res = await window.ultronAPI.synthesizeSpeech(cleaned, modelKey, { apiKey });
    if (gen !== _ttsPrecacheGeneration) return;

    if (res?.success && res.wavBase64) {
      _ttsPrecache.set(cacheKey, { wavBase64: res.wavBase64, mimeType: res.mimeType || 'audio/wav' });
      // Keep cache small — evict oldest entries if over 5
      if (_ttsPrecache.size > 5) {
        const firstKey = _ttsPrecache.keys().next().value;
        _ttsPrecache.delete(firstKey);
      }
    }
  } catch (e) {
    // Silent — pre-cache is best-effort
  }
}

function getCachedTtsAudio(text) {
  const cleaned = normalizeTextForSpeech(text);
  if (!cleaned) return null;
  const cacheKey = _ttsPrecacheHash(cleaned);
  return _ttsPrecache.get(cacheKey) || null;
}

function getTtsRate() {
  const raw = window.localStorage.getItem('ultron-tts-rate');
  const val = raw != null ? parseFloat(raw) : 1;
  return Number.isFinite(val) ? Math.max(0.5, Math.min(2, val)) : 1;
}

function getTtsPitch() {
  const raw = window.localStorage.getItem('ultron-tts-pitch');
  const val = raw != null ? parseFloat(raw) : 1;
  return Number.isFinite(val) ? Math.max(0.5, Math.min(2, val)) : 1;
}

function getTtsPersona() {
  return window.localStorage.getItem('ultron-tts-persona') || 'neutral';
}

function getSelectedTtsVoiceUri() {
  return window.localStorage.getItem('ultron-tts-voice-uri') || '';
}

function normalizeTextForSpeech(text) {
  let cleaned = extractPlainTextFromMessage(text) || String(text || '');

  // Convert markdown tables into natural spoken sentences before stripping formatting
  cleaned = cleaned.replace(/(\|[\s\S]+?\|\n\|[-:\s|]+\|\n(?:\|[\s\S]+?\|\n?)+)/g, (tableBlock) => {
    const lines = tableBlock.trim().split('\n').filter(l => l.includes('|'));
    if (lines.length < 3) return '';
    const rows = lines.slice(2).map(r => r.split('|').map(c => c.trim()).filter(Boolean));
    const spokenRows = rows.map(r => {
      if (r.length >= 2) return `${r[0]} from ${r[1]}`;
      return r.join(', ');
    });
    return `Here are the top results: ${spokenRows.slice(0, 5).join('. ')}.`;
  });

  cleaned = cleaned
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/\*\*|__|\*|_/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^-{3,}$|^\*{3,}$|^_{3,}$/gm, ' ')
    .replace(/\[\d{1,2}\]/g, '') // Strip citation badges like [1], [2] for smooth speech
    .replace(/[—–‑]/g, ' ')
    .replace(/\s[-–—]\s/g, ' ')
    .replace(/[^\w\s.,!?;:'"()]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned;
}

function loadTtsVoices() {
  if (!window.speechSynthesis) return [];
  const voices = window.speechSynthesis.getVoices() || [];
  if (voices.length) ttsVoicesCache = voices;
  return ttsVoicesCache;
}

function ensureTtsVoicesReady(timeoutMs = 1200) {
  return new Promise((resolve) => {
    loadTtsVoices();
    if (ttsVoicesCache.length) {
      resolve(ttsVoicesCache);
      return;
    }
    const finish = () => {
      loadTtsVoices();
      resolve(ttsVoicesCache);
    };
    if (!window.speechSynthesis) {
      finish();
      return;
    }
    const onVoicesChanged = () => {
      loadTtsVoices();
      if (ttsVoicesCache.length) {
        window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
        resolve(ttsVoicesCache);
      }
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoicesChanged);
    setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      finish();
    }, timeoutMs);
  });
}

function clearTtsKeepAlive() {
  if (ttsKeepAliveTimer) {
    clearInterval(ttsKeepAliveTimer);
    ttsKeepAliveTimer = null;
  }
}

function startTtsKeepAlive() {
  clearTtsKeepAlive();
  if (!window.speechSynthesis) return;
  ttsKeepAliveTimer = setInterval(() => {
    if (!activeTtsUtterance) {
      clearTtsKeepAlive();
      return;
    }
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
  }, 250);
}

function getEnglishTtsVoices() {
  loadTtsVoices();
  const english = ttsVoicesCache.filter(v => /^en(-|_)?/i.test(v.lang || ''));
  return english.length ? english : ttsVoicesCache;
}

function resolveTtsVoice() {
  loadTtsVoices();
  const preferredUri = getSelectedTtsVoiceUri();
  if (preferredUri) {
    const exact = ttsVoicesCache.find(v => v.voiceURI === preferredUri);
    if (exact) return exact;
  }

  const voices = getEnglishTtsVoices();
  const persona = getTtsPersona();

  const scoreVoice = (voice) => {
    const name = (voice.name || '').toLowerCase();
    let score = 0;
    if (/natural|neural|online/i.test(name)) score += 12;
    if (/microsoft|google/i.test(name)) score += 2;
    if (persona === 'female' && /female|zira|jenny|aria|samantha|susan|hazel|emma|natasha|michelle|sonia|libby/i.test(name)) score += 6;
    if (persona === 'male' && /male|david|mark|guy|ryan|james|george|andrew|brian|christopher|thomas|william/i.test(name)) score += 6;
    if (persona === 'neutral' && !/robot|legacy|compact/i.test(name)) score += 1;
    return score;
  };

  const ranked = [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));
  return ranked[0] || ttsVoicesCache[0] || null;
}

function stopNeuralAudio() {
  if (activeNeuralAudio) {
    try {
      activeNeuralAudio.pause();
      activeNeuralAudio.src = '';
    } catch (e) { /* ignore */ }
    activeNeuralAudio = null;
  }
}

function playNeuralAudio(audioBase64, { mimeType = 'audio/wav', onStart, onEnd, allowOverlap = false } = {}) {
  return new Promise((resolve) => {
    if (!allowOverlap) stopNeuralAudio();
    const audio = new Audio(`data:${mimeType};base64,${audioBase64}`);
    activeNeuralAudio = audio;
    connectTtsAudioAnalyser(audio);
    audio.onplay = () => {
      setVoiceOrbVisualState('ai-speaking');
      startVoiceOrbAnimation('ai');
      if (typeof onStart === 'function') onStart();
    };
    audio.onended = () => {
      activeNeuralAudio = null;
      ttsAnalyserNode = null;
      if (typeof onEnd === 'function') onEnd();
      resolve(true);
    };
    audio.onerror = () => {
      activeNeuralAudio = null;
      ttsAnalyserNode = null;
      if (typeof onEnd === 'function') onEnd();
      resolve(false);
    };
    audio.play().catch(() => {
      activeNeuralAudio = null;
      ttsAnalyserNode = null;
      if (typeof onEnd === 'function') onEnd();
      resolve(false);
    });
  });
}

let _lastAutoSpeakFeedTime = 0;
let _lastAutoSpeakRawLength = 0;

function resetStreamingAutoSpeak() {
  _lastAutoSpeakFeedTime = 0;
  _lastAutoSpeakRawLength = 0;
  streamingAutoSpeakState.generation += 1;
  streamingAutoSpeakState.spokenUpTo = 0;
  streamingAutoSpeakState.queue = [];
  streamingAutoSpeakState.busy = false;
  streamingAutoSpeakState.started = false;
  streamingAutoSpeakState.mode = null;
  streamingAutoSpeakState.onFirstAudio = null;
  streamingAutoSpeakState.activeButton = null;
}

function stopTtsSpeech() {
  const btn = streamingAutoSpeakState.activeButton;
  resetStreamingAutoSpeak();
  if (btn) setSpeakButtonState(btn, 'idle');
  document.querySelectorAll('.btn-speak-msg.is-loading, .btn-speak-msg.speaking').forEach((el) => {
    setSpeakButtonState(el, 'idle');
  });
  clearTtsKeepAlive();
  stopNeuralAudio();
  ttsAnalyserNode = null;
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
  activeTtsUtterance = null;
  if (isVoiceChatModeEnabled()) {
    setVoiceOrbVisualState('');
    if (!isAwaitingResponse) startVoiceOrbAnimation('idle');
  }
}

let cachedActiveTtsModelKey = null;
const streamingAutoSpeakState = {
  generation: 0,
  spokenUpTo: 0,
  queue: [],
  busy: false,
  started: false,
  mode: null,
  onIdle: null,
  onFirstAudio: null,
  activeButton: null
};

function yieldToUi() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function setSpeakButtonState(btn, state) {
  if (!btn) return;
  const span = btn.querySelector('span');
  const icon = btn.querySelector('svg');
  btn.classList.remove('speaking', 'is-loading');
  btn.disabled = false;
  btn.style.pointerEvents = '';

  if (state === 'loading') {
    btn.classList.add('is-loading');
    btn.disabled = true;
    if (span) span.textContent = 'Loading…';
    btn.style.color = '#93c5fd';
    if (icon) icon.style.opacity = '0.35';
  } else if (state === 'speaking') {
    btn.classList.add('speaking');
    if (span) span.textContent = 'Stop';
    btn.style.color = '#a5b4fc';
    if (icon) icon.style.opacity = '1';
  } else {
    if (span) span.textContent = 'Speak';
    btn.style.color = 'var(--text-muted)';
    if (icon) icon.style.opacity = '1';
  }
}

function setAutoSpeakButtonState(state) {
  const btn = streamingAutoSpeakState.activeButton
    || ensureLatestMessageSpeakControls()
    || document.querySelector('.chat-bubble.ai:last-child .btn-speak-msg');
  if (!btn) return;
  if (state === true) state = 'speaking';
  if (state === false) state = 'idle';
  setSpeakButtonState(btn, state);
}

function notifyStreamingAutoSpeakIdle() {
  const btn = streamingAutoSpeakState.activeButton;
  setSpeakButtonState(btn, 'idle');
  streamingAutoSpeakState.activeButton = null;
  clearTtsKeepAlive();
  if (typeof streamingAutoSpeakState.onIdle === 'function') {
    const cb = streamingAutoSpeakState.onIdle;
    streamingAutoSpeakState.onIdle = null;
    cb();
  }
  if (isVoiceChatModeEnabled() && !isAwaitingResponse) {
    setVoiceModeStatus('Listening…');
    updateVoiceModeBarUi();
    scheduleVoiceModeListen(80);
  }
}

function markStreamingSpeechStarted() {
  if (!streamingAutoSpeakState.started) {
    streamingAutoSpeakState.started = true;
    startTtsKeepAlive();
    revealPendingVoiceSpeech();
    setVoiceOrbVisualState('ai-speaking');
    startVoiceOrbAnimation('ai');
    if (isVoiceChatModeEnabled()) setVoiceModeStatus('');
    if (typeof streamingAutoSpeakState.onFirstAudio === 'function') {
      streamingAutoSpeakState.onFirstAudio();
      streamingAutoSpeakState.onFirstAudio = null;
    } else {
      setAutoSpeakButtonState('speaking');
    }
  }
}

function splitTextForSpeechQueue(text, maxLen = 260) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxLen) return [cleaned];

  const chunks = [];
  let rest = cleaned;
  while (rest.length > maxLen) {
    let cut = rest.lastIndexOf(' ', maxLen);
    if (cut < Math.floor(maxLen * 0.35)) cut = maxLen;
    const piece = rest.slice(0, cut).trim();
    if (piece) chunks.push(piece);
    rest = rest.slice(cut).trim();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

function getLatestAiMessageText() {
  const bubbles = chatMessagesContainer?.querySelectorAll('.chat-bubble.ai');
  if (!bubbles?.length) return '';
  const last = bubbles[bubbles.length - 1];
  const content = last.querySelector('.message-content');
  if (!content) return '';
  return extractPlainTextFromMessage(content.innerHTML || content.textContent || '') || content.textContent || '';
}

function ensureLatestMessageSpeakControls() {
  const bubbles = chatMessagesContainer?.querySelectorAll('.chat-bubble.ai');
  if (!bubbles?.length) return null;
  const last = bubbles[bubbles.length - 1];
  const wrapper = last.querySelector('.message-wrapper');
  if (!wrapper) return null;
  const actionsDiv = wrapper.querySelector('.message-actions');
  if (!actionsDiv) return null;
  actionsDiv.style.display = 'flex';

  let btnSpeak = actionsDiv.querySelector('.btn-speak-msg');
  if (!btnSpeak) {
    btnSpeak = createSpeakMessageButton(() => getLatestAiMessageText());
    actionsDiv.appendChild(btnSpeak);
  }
  return btnSpeak;
}

function extractNewSpeechUnits(cleaned, fromIndex) {
  const slice = cleaned.slice(fromIndex);
  if (!slice.trim()) return { units: [], consumed: 0 };

  const units = [];
  let consumed = 0;
  const sentenceRe = /[^.!?\n]+[.!?]+(?:\s+|\n|$)/g;
  let match;
  while ((match = sentenceRe.exec(slice)) !== null) {
    const unit = match[0].trim();
    if (unit.length >= 4) {
      units.push(unit);
      consumed = match.index + match[0].length;
    }
  }

  if (!units.length && slice.length >= 90) {
    const cut = slice.lastIndexOf(' ', 90);
    if (cut >= 40) {
      units.push(slice.slice(0, cut).trim());
      consumed = cut + 1;
    }
  }

  return { units, consumed };
}

function enqueueSpeechUnits(units) {
  for (const unit of units) {
    streamingAutoSpeakState.queue.push(...splitTextForSpeechQueue(unit));
  }
}

async function resolveActiveTtsModelKey(forceRefresh = false) {
  if (!forceRefresh && cachedActiveTtsModelKey) return cachedActiveTtsModelKey;
  if (!window.ultronAPI?.getTtsCatalog) return null;
  try {
    const catalogRes = await window.ultronAPI.getTtsCatalog();
    const models = catalogRes?.models || [];
    const storedKey = window.localStorage.getItem('ultron-tts-neural-model');
    const activeKey = (storedKey && models.some(m => m.key === storedKey) ? storedKey : null)
      || models.find(m => m.isActive)?.key
      || models.find(m => m.installed || m.cloud)?.key;
    const active = models.find(m => m.key === activeKey);
    if (active && (active.installed || active.cloud)) {
      cachedActiveTtsModelKey = active.key;
      return active.key;
    }
  } catch (e) { /* ignore */ }
  return null;
}

async function synthesizeSpeechChunk(text) {
  const modelKey = await resolveActiveTtsModelKey();
  if (!modelKey || !window.ultronAPI?.synthesizeSpeech) return null;
  const apiKey = (localStorage.getItem('ultron-gemini-api-key') || '').trim();
  try {
    const res = await window.ultronAPI.synthesizeSpeech(text, modelKey, { apiKey });
    if (res?.success && res.wavBase64) {
      return { wavBase64: res.wavBase64, mimeType: res.mimeType || 'audio/wav' };
    }
    if (res?.error) logTrace(`Voice: ${res.error}`, 'system');
  } catch (e) {
    logTrace(`Voice failed: ${e.message}`, 'system');
  }
  return null;
}

function speakWithBrowserTts(text) {
  return new Promise((resolve) => {
    if (!window.speechSynthesis) {
      resolve(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = resolveTtsVoice();
    if (voice) utterance.voice = voice;
    utterance.rate = getTtsRate();
    utterance.pitch = getTtsPitch();
    utterance.volume = getSoundVolume();
    utterance.lang = voice?.lang || 'en-US';
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    activeTtsUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  });
}

async function drainStreamingAutoSpeak() {
  if (streamingAutoSpeakState.busy) return;
  streamingAutoSpeakState.busy = true;
  const gen = streamingAutoSpeakState.generation;
  let playedAny = false;

  while (streamingAutoSpeakState.queue.length && gen === streamingAutoSpeakState.generation) {
    const chunk = streamingAutoSpeakState.queue.shift();
    await yieldToUi();
    const audio = await synthesizeSpeechChunk(chunk);
    if (gen !== streamingAutoSpeakState.generation) break;

    if (audio?.wavBase64) {
      playedAny = true;
      markStreamingSpeechStarted();
      await playNeuralAudio(audio.wavBase64, { mimeType: audio.mimeType || 'audio/wav' });
    } else {
      markStreamingSpeechStarted();
      const spoke = await speakWithBrowserTts(chunk);
      if (spoke) playedAny = true;
    }
    await yieldToUi();
  }

  streamingAutoSpeakState.busy = false;
  if (gen === streamingAutoSpeakState.generation && !streamingAutoSpeakState.queue.length) {
    if (!playedAny) {
      logTrace('Voice audio failed. Fully restart Ultron, then try Preview in Settings → Agent Sounds.', 'system');
    }
    notifyStreamingAutoSpeakIdle();
  }
  if (streamingAutoSpeakState.queue.length && gen === streamingAutoSpeakState.generation) {
    drainStreamingAutoSpeak();
  }
}

function beginSpeechPlayback(fullText) {
  return beginUnifiedSpeechPlayback(fullText);
}

async function beginUnifiedSpeechPlayback(fullText) {
  const cleaned = normalizeTextForSpeech(fullText);
  if (!cleaned) return false;

  streamingAutoSpeakState.mode = 'unified';
  streamingAutoSpeakState.spokenUpTo = cleaned.length;
  streamingAutoSpeakState.queue.length = 0;

  const modelKey = await resolveActiveTtsModelKey();
  if (!modelKey || !window.ultronAPI?.synthesizeSpeech) return false;
  const apiKey = (localStorage.getItem('ultron-gemini-api-key') || '').trim();

  const gen = streamingAutoSpeakState.generation;
  setTimeout(async () => {
    if (gen !== streamingAutoSpeakState.generation) return;
    await yieldToUi();
    try {
      const res = await window.ultronAPI.synthesizeSpeech(cleaned, modelKey, { apiKey });
      if (gen !== streamingAutoSpeakState.generation) return;
      if (res?.success && res.wavBase64) {
        markStreamingSpeechStarted();
        await playNeuralAudio(res.wavBase64, { mimeType: res.mimeType || 'audio/wav' });
      } else {
        if (res?.error) logTrace(`Voice: ${res.error}`, 'system');
        logTrace('Voice audio failed. Try Preview in Settings → Agent Sounds.', 'system');
      }
    } catch (e) {
      logTrace(`Voice failed: ${e.message}`, 'system');
    }
    if (gen === streamingAutoSpeakState.generation) {
      notifyStreamingAutoSpeakIdle();
    }
  }, 0);

  return true;
}

function feedStreamingAutoSpeak(fullText, force = false) {
  if (!isTtsAutoSpeakEnabled()) return;
  if (!fullText || isThinkingMarkup(fullText)) return;

  const now = performance.now();
  const rawLen = fullText.length;
  const newChars = rawLen - _lastAutoSpeakRawLength;

  // Throttle regex text normalization during token-by-token streaming unless sentence boundary or 180ms elapsed
  if (!force && newChars < 25 && (now - _lastAutoSpeakFeedTime < 180)) {
    const tail = fullText.slice(_lastAutoSpeakRawLength);
    if (!/[.!?\n]/.test(tail)) {
      return;
    }
  }

  _lastAutoSpeakFeedTime = now;
  _lastAutoSpeakRawLength = rawLen;

  const cleaned = normalizeTextForSpeech(fullText);
  if (!cleaned) return;

  const btn = ensureLatestMessageSpeakControls();
  if (btn && !streamingAutoSpeakState.activeButton) {
    streamingAutoSpeakState.activeButton = btn;
    if (!streamingAutoSpeakState.started) setSpeakButtonState(btn, 'loading');
  }

  streamingAutoSpeakState.mode = 'chunked';

  const { units, consumed } = extractNewSpeechUnits(cleaned, streamingAutoSpeakState.spokenUpTo);
  if (!units.length) return;

  streamingAutoSpeakState.spokenUpTo += consumed;
  enqueueSpeechUnits(units);
  if (isVoiceChatModeEnabled() && streamingAutoSpeakState.started) {
    syncVoiceModeAiFromChat();
  }
  setTimeout(() => drainStreamingAutoSpeak(), 0);
}

function finishStreamingAutoSpeak(fullText) {
  if (!isTtsAutoSpeakEnabled()) return;
  if (streamingAutoSpeakState.mode === 'unified') return;

  feedStreamingAutoSpeak(fullText, true);
  const cleaned = normalizeTextForSpeech(fullText);
  if (!cleaned) return;
  if (streamingAutoSpeakState.spokenUpTo >= cleaned.length) return;

  const tail = cleaned.slice(streamingAutoSpeakState.spokenUpTo).trim();
  if (tail.length >= 2) {
    streamingAutoSpeakState.mode = 'unified';
    streamingAutoSpeakState.spokenUpTo = cleaned.length;
    streamingAutoSpeakState.queue.length = 0;
    beginUnifiedSpeechPlayback(tail);
  }
}

async function warmupActiveTtsEngine() {
  cachedActiveTtsModelKey = null;
  const modelKey = await resolveActiveTtsModelKey();
  if (modelKey && window.ultronAPI?.warmupTtsModel) {
    window.ultronAPI.warmupTtsModel(modelKey).catch(() => {});
  }
}

async function speakTextAloud(text, { force = false, button = null, onStart, onEnd } = {}) {
  const cleaned = normalizeTextForSpeech(text);
  if (!cleaned) return false;
  if (!force && !isTtsAutoSpeakEnabled()) return false;

  const speakBtn = button || null;
  stopTtsSpeech();
  if (speakBtn) {
    streamingAutoSpeakState.activeButton = speakBtn;
    setSpeakButtonState(speakBtn, 'loading');
  }

  // Check pre-cached audio for instant zero-latency playback
  const cached = getCachedTtsAudio(text);
  if (cached && cached.wavBase64) {
    if (speakBtn) setSpeakButtonState(speakBtn, 'speaking');
    if (typeof onStart === 'function') onStart();
    const ok = await playNeuralAudio(cached.wavBase64, { mimeType: cached.mimeType || 'audio/wav' });
    if (speakBtn) setSpeakButtonState(speakBtn, 'idle');
    if (typeof onEnd === 'function') onEnd();
    return ok;
  }

  const modelKey = await resolveActiveTtsModelKey();
  if (modelKey && window.ultronAPI?.synthesizeSpeech) {
    return new Promise((resolve) => {
      streamingAutoSpeakState.onFirstAudio = () => {
        if (speakBtn) setSpeakButtonState(speakBtn, 'speaking');
        if (typeof onStart === 'function') onStart();
      };
      streamingAutoSpeakState.onIdle = () => {
        if (speakBtn) setSpeakButtonState(speakBtn, 'idle');
        streamingAutoSpeakState.activeButton = null;
        if (typeof onEnd === 'function') onEnd();
        resolve(true);
      };
      const queued = beginSpeechPlayback(text);
      if (!queued) {
        if (speakBtn) setSpeakButtonState(speakBtn, 'idle');
        streamingAutoSpeakState.onIdle = null;
        resolve(false);
      }
    });
  }

  if (!window.speechSynthesis) {
    logTrace('Text-to-speech is not available in this environment.', 'system');
    return false;
  }

  await ensureTtsVoicesReady();

  const utterance = new SpeechSynthesisUtterance(cleaned);
  const voice = resolveTtsVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = getTtsRate();
  utterance.pitch = getTtsPitch();
  utterance.volume = getSoundVolume();
  utterance.lang = voice?.lang || 'en-US';

  utterance.onstart = () => {
    startTtsKeepAlive();
    if (typeof onStart === 'function') onStart();
  };
  utterance.onend = () => {
    clearTtsKeepAlive();
    activeTtsUtterance = null;
    if (typeof onEnd === 'function') onEnd();
  };
  utterance.onerror = () => {
    clearTtsKeepAlive();
    activeTtsUtterance = null;
    if (typeof onEnd === 'function') onEnd();
  };

  activeTtsUtterance = utterance;
  window.speechSynthesis.speak(utterance);
  return true;
}

function applyMessageActionButtonStyles(btn) {
  if (!btn) return;
  btn.type = 'button';
}

function createSpeakMessageButton(getText) {
  const btnSpeak = document.createElement('button');
  btnSpeak.className = 'btn-speak-msg btn-listen-msg message-action-btn';
  btnSpeak.title = 'Listen to response';
  applyMessageActionButtonStyles(btnSpeak);
  btnSpeak.innerHTML = `
    <svg class="message-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
    </svg>
    <span>Listen</span>
  `;

  btnSpeak.addEventListener('click', async (e) => {
    e.stopPropagation();
    const text = typeof getText === 'function' ? getText() : getText;
    if (btnSpeak.classList.contains('speaking')) {
      stopTtsSpeech();
      return;
    }
    if (btnSpeak.classList.contains('is-loading')) return;

    setSpeakButtonState(btnSpeak, 'loading');
    const started = await speakTextAloud(text, {
      force: true,
      button: btnSpeak,
      onStart: () => setSpeakButtonState(btnSpeak, 'speaking'),
      onEnd: () => setSpeakButtonState(btnSpeak, 'idle')
    });
    if (!started) {
      setSpeakButtonState(btnSpeak, 'idle');
      logTrace('Nothing to read aloud in this message.', 'system');
    }
  });

  btnSpeak.addEventListener('mouseenter', () => {
    if (!btnSpeak.classList.contains('speaking') && !btnSpeak.classList.contains('is-loading')) {
      btnSpeak.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
      btnSpeak.style.color = 'var(--accent-white)';
    }
  });
  btnSpeak.addEventListener('mouseleave', () => {
    if (!btnSpeak.classList.contains('speaking') && !btnSpeak.classList.contains('is-loading')) {
      btnSpeak.style.backgroundColor = 'transparent';
      btnSpeak.style.color = 'var(--text-muted)';
    }
  });

  return btnSpeak;
}

function wireMessageActionButtons(actionsDiv, fullText) {
  if (!actionsDiv || !fullText || isThinkingMarkup(fullText)) return;

  actionsDiv.style.display = 'flex';
  actionsDiv.style.visibility = 'visible';
  actionsDiv.style.opacity = '1';

  let btnCopy = actionsDiv.querySelector('.btn-copy-msg');
  if (!btnCopy) {
    btnCopy = document.createElement('button');
    btnCopy.className = 'btn-copy-msg message-action-btn';
    btnCopy.innerHTML = `
      <svg class="message-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span>Copy</span>
    `;
    actionsDiv.appendChild(btnCopy);
  }
  applyMessageActionButtonStyles(btnCopy);

  btnCopy.onclick = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(extractPlainTextFromMessage(fullText) || fullText);
    const span = btnCopy.querySelector('span');
    if (span) span.textContent = 'Copied!';
    btnCopy.style.color = '#34d399';
    setTimeout(() => {
      if (span) span.textContent = 'Copy';
      btnCopy.style.color = 'var(--text-muted)';
    }, 2000);
  };

  let btnSpeak = actionsDiv.querySelector('.btn-speak-msg');
  if (!btnSpeak) {
    btnSpeak = createSpeakMessageButton(() => fullText);
    actionsDiv.appendChild(btnSpeak);
  } else {
    btnSpeak.replaceWith(createSpeakMessageButton(() => fullText));
  }
}

function maybeAutoSpeakResponse(fullText) {
  resetStreamingAutoSpeak();
  finishStreamingAutoSpeak(fullText);
}

if (window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => loadTtsVoices();
  loadTtsVoices();
}

// Voice input (built-in Windows speech) settings
const voiceModelStatusBadge = document.getElementById('voice-model-status-badge');
const voiceModelSizeLabel = document.getElementById('voice-model-size-label');
const btnDownloadVoiceModel = document.getElementById('btn-download-voice-model');
const btnCancelVoiceModel = document.getElementById('btn-cancel-voice-model');
const btnDeleteVoiceModel = document.getElementById('btn-delete-voice-model');
const voiceModelDownloadProgress = document.getElementById('voice-model-download-progress');
const voiceModelProgressStatus = document.getElementById('voice-model-progress-status');
const voiceModelProgressStats = document.getElementById('voice-model-progress-stats');
const voiceModelProgressBar = document.getElementById('voice-model-progress-bar');
const voiceModelProgressDetail = document.getElementById('voice-model-progress-detail');
const VOICE_MODEL_PROGRESS_KEY = 'voice-native';
let voiceModelDownloadListenerCleanup = null;

function setVoiceModelProgressVisible(visible) {
  if (!voiceModelDownloadProgress) return;
  voiceModelDownloadProgress.classList.toggle('hidden', !visible);
}

function resetVoiceModelProgressUI() {
  setVoiceModelProgressVisible(false);
  if (voiceModelProgressStatus) voiceModelProgressStatus.textContent = 'Downloading voice model…';
  if (voiceModelProgressStats) voiceModelProgressStats.textContent = '0%';
  if (voiceModelProgressBar) voiceModelProgressBar.style.width = '0%';
  if (voiceModelProgressDetail) voiceModelProgressDetail.textContent = 'Speed: --';
}

function showVoiceModelProgress(data = {}) {
  setVoiceModelProgressVisible(true);
  const percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
  if (voiceModelProgressStatus) {
    voiceModelProgressStatus.textContent = data.status || 'Downloading voice model…';
  }
  if (voiceModelProgressStats) {
    const stats = data.downloaded && data.total
      ? `${percent}% (${data.downloaded} / ${data.total})`
      : `${percent}%`;
    voiceModelProgressStats.textContent = stats;
  }
  if (voiceModelProgressBar) voiceModelProgressBar.style.width = `${percent}%`;
  if (voiceModelProgressDetail) {
    voiceModelProgressDetail.textContent = data.speed
      ? `Speed: ${data.speed}`
      : (data.phase === 'complete' ? 'Ready for offline mic transcription.' : 'Downloading model files…');
  }
}

function updateVoiceModelSettingsUI(status) {
  if (!status) return;

  const builtIn = Boolean(
    status.builtIn
    || status.noDownloadRequired
    || status.engine === 'windows-speech'
    || (isUltronWindowsDevice() && status.engine !== 'whisper-tiny.en')
  );
  const ready = builtIn ? (status.available !== false) : Boolean(status.installed);

  if (voiceModelSizeLabel) {
    voiceModelSizeLabel.textContent = builtIn
      ? 'Built-in · no download required'
      : (ready
        ? `${status.cacheSize || status.sizeEstimate} · ready`
        : `${status.sizeEstimate || 'Unavailable'}`);
  }

  if (voiceModelStatusBadge) {
    voiceModelStatusBadge.classList.remove('installed', 'missing', 'downloading');
    if (status.downloading) {
      voiceModelStatusBadge.textContent = 'Downloading';
      voiceModelStatusBadge.classList.add('downloading');
    } else if (ready) {
      voiceModelStatusBadge.textContent = 'Ready';
      voiceModelStatusBadge.classList.add('installed');
    } else {
      voiceModelStatusBadge.textContent = 'Unavailable';
      voiceModelStatusBadge.classList.add('missing');
    }
  }

  if (btnDownloadVoiceModel) {
    btnDownloadVoiceModel.classList.toggle('hidden', builtIn || ready || status.downloading);
    btnDownloadVoiceModel.disabled = Boolean(builtIn || status.downloading);
  }
  if (btnCancelVoiceModel) {
    btnCancelVoiceModel.classList.toggle('hidden', builtIn || !status.downloading);
  }
  if (btnDeleteVoiceModel) {
    btnDeleteVoiceModel.classList.toggle('hidden', builtIn || !status.installed || status.downloading);
  }

  const voiceRowActions = document.getElementById('voice-input-row-actions');
  if (voiceRowActions && builtIn && ready) {
    voiceRowActions.classList.remove('hidden');
    voiceRowActions.innerHTML = settingsActionButtonHtml('Ready', 'ready', 'is-ready is-downloaded');
  }

  if (builtIn) {
    setVoiceModelProgressVisible(false);
  }
}

async function refreshVoiceModelSettingsUI() {
  if (!window.ultronAPI?.getVoiceModelStatus) return;
  try {
    const status = await window.ultronAPI.getVoiceModelStatus();
    updateVoiceModelSettingsUI(status);
  } catch (e) {
    if (voiceModelStatusBadge) {
      voiceModelStatusBadge.textContent = 'Unavailable';
      voiceModelStatusBadge.classList.add('missing');
    }
  }
}

function bindVoiceModelDownloadProgressListener() {
  if (voiceModelDownloadListenerCleanup) {
    voiceModelDownloadListenerCleanup();
    voiceModelDownloadListenerCleanup = null;
  }
  if (!window.ultronAPI?.onDownloadProgress) return;
  voiceModelDownloadListenerCleanup = window.ultronAPI.onDownloadProgress((data) => {
    if ((data.modelName || '').toLowerCase() !== VOICE_MODEL_PROGRESS_KEY) return;
    showVoiceModelProgress(data);
  });
}

async function startVoiceModelDownload() {
  if (!window.ultronAPI?.downloadVoiceModel) return;

  bindVoiceModelDownloadProgressListener();
  updateVoiceModelSettingsUI({ installed: false, downloading: true, sizeEstimate: 'Built-in · no download' });
  resetVoiceModelProgressUI();
  showVoiceModelProgress({ percent: 0, status: 'Starting download…' });

  const result = await window.ultronAPI.downloadVoiceModel().catch(err => ({
    success: false,
    error: err.message || 'Download failed.'
  }));

  if (voiceModelDownloadListenerCleanup) {
    voiceModelDownloadListenerCleanup();
    voiceModelDownloadListenerCleanup = null;
  }

  resetVoiceModelProgressUI();
  await refreshVoiceModelSettingsUI();

  if (result.success) {
    logTrace('Voice input is ready.', 'system');
  } else if (!result.cancelled) {
    logTrace(result.error || 'Voice model download failed.', 'system');
  }
}

function initVoiceModelSettingsUI() {
  decorateSettingsActionButtons(document.getElementById('tab-sounds') || document);

  if (btnDownloadVoiceModel) {
    btnDownloadVoiceModel.addEventListener('click', async (e) => {
      e.preventDefault();
      await startVoiceModelDownload();
    });
  }

  if (btnCancelVoiceModel) {
    btnCancelVoiceModel.addEventListener('click', async (e) => {
      e.preventDefault();
      if (window.ultronAPI?.cancelVoiceModelDownload) {
        await window.ultronAPI.cancelVoiceModelDownload();
      }
      resetVoiceModelProgressUI();
      await refreshVoiceModelSettingsUI();
      logTrace('Voice model download cancelled.', 'system');
    });
  }

  if (btnDeleteVoiceModel) {
    btnDeleteVoiceModel.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!window.ultronAPI?.deleteVoiceModel) return;
      const result = await window.ultronAPI.deleteVoiceModel();
      await refreshVoiceModelSettingsUI();
      if (result?.success) {
        logTrace('Voice input model removed.', 'system');
      } else {
        logTrace(result?.error || 'Could not remove voice model.', 'system');
      }
    });
  }

  document.querySelector('.settings-tab-btn[data-tab="sounds"]')?.addEventListener('click', () => {
    refreshVoiceModelSettingsUI();
  });
}

initVoiceModelSettingsUI();

// Neural TTS models (offline natural voices + optional Gemini Live cloud)
const ttsModelsListEl = document.getElementById('tts-models-list');
const ttsCloudModelsListEl = document.getElementById('tts-cloud-models-list');
const ttsModelStatusBadge = document.getElementById('tts-model-status-badge');
const ttsCloudStatusBadge = document.getElementById('tts-cloud-status-badge');
const ttsModelFeedback = document.getElementById('tts-model-feedback');
const ttsModelDownloadProgress = document.getElementById('tts-model-download-progress');
const ttsModelProgressStatus = document.getElementById('tts-model-progress-status');
const ttsModelProgressStats = document.getElementById('tts-model-progress-stats');
const ttsModelProgressBar = document.getElementById('tts-model-progress-bar');
const ttsModelProgressDetail = document.getElementById('tts-model-progress-detail');
const TTS_KOKORO_PROGRESS_KEY = 'tts-kokoro-engine';
let ttsCatalogCache = [];
let ttsDownloadingModelKey = null;
let ttsDownloadListenerCleanup = null;

function setTtsModelProgressVisible(visible) {
  if (!ttsModelDownloadProgress) return;
  ttsModelDownloadProgress.classList.toggle('hidden', !visible);
}

function resetTtsModelProgressUI() {
  setTtsModelProgressVisible(false);
  if (ttsModelProgressStatus) ttsModelProgressStatus.textContent = 'Downloading voice engine…';
  if (ttsModelProgressStats) ttsModelProgressStats.textContent = '0%';
  if (ttsModelProgressBar) ttsModelProgressBar.style.width = '0%';
  if (ttsModelProgressDetail) ttsModelProgressDetail.textContent = 'Preparing…';
}

function showTtsModelProgress(data = {}) {
  setTtsModelProgressVisible(true);
  const percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
  if (ttsModelProgressStatus) {
    ttsModelProgressStatus.textContent = data.status || 'Downloading voice engine…';
  }
  if (ttsModelProgressStats) {
    const stats = data.downloaded && data.total
      ? `${percent}% (${data.downloaded} / ${data.total})`
      : `${percent}%`;
    ttsModelProgressStats.textContent = stats;
  }
  if (ttsModelProgressBar) ttsModelProgressBar.style.width = `${percent}%`;
  if (ttsModelProgressDetail) {
    ttsModelProgressDetail.textContent = data.speed
      ? `Speed: ${data.speed}`
      : (data.phase === 'complete' ? 'Voice engine ready.' : 'Downloading model files…');
  }
}

function bindTtsModelDownloadProgressListener(modelKey) {
  if (ttsDownloadListenerCleanup) {
    ttsDownloadListenerCleanup();
    ttsDownloadListenerCleanup = null;
  }
  if (!window.ultronAPI?.onDownloadProgress) return;

  const catalogEntry = () => ttsCatalogCache.find(m => m.key === modelKey);
  ttsDownloadListenerCleanup = window.ultronAPI.onDownloadProgress((data) => {
    const progressName = String(data.modelName || '').toLowerCase();
    const isKokoro = progressName === TTS_KOKORO_PROGRESS_KEY;
    const isDirect = progressName === `tts-${modelKey}`.toLowerCase();
    if (!isKokoro && !isDirect) return;

    showTtsModelProgress(data);

    if (ttsModelsListEl) {
      ttsModelsListEl.querySelectorAll('.btn-tts-download').forEach(btn => {
        if (btn.dataset.key === modelKey) {
          setSettingsActionButton(btn, 'Downloading…', 'downloading', 'btn-tts-download is-downloading');
          btn.disabled = true;
        }
      });
    }
  });
}

function normalizeTtsModelsForDisplay(models) {
  return models.map(model => ({
    ...model,
    downloading: Boolean(model.downloading) || ttsDownloadingModelKey === model.key
  }));
}

function getTtsDownloadButtonState(model) {
  if (model.cloud) {
    if (model.installed) {
      return { label: 'Ready', icon: 'ready', className: 'is-cloud-ready', disabled: true };
    }
    return { label: 'Needs key', icon: 'download', className: 'is-cloud-missing', disabled: true };
  }
  if (model.installed) {
    return { label: 'Downloaded', icon: 'downloaded', className: 'is-downloaded', disabled: true };
  }
  if (model.downloading) {
    return { label: 'Downloading…', icon: 'downloading', className: 'is-downloading', disabled: true };
  }
  return { label: 'Download', icon: 'download', className: '', disabled: false };
}

function updateTtsSectionBadge(models = [], badgeEl = ttsModelStatusBadge, { cloud = false } = {}) {
  if (!badgeEl) return;
  const installed = models.some(m => m.installed);
  const downloading = models.some(m => m.downloading);
  badgeEl.classList.remove('installed', 'missing', 'downloading');
  if (downloading) {
    badgeEl.textContent = 'Downloading';
    badgeEl.classList.add('downloading');
  } else if (installed) {
    badgeEl.textContent = cloud ? 'Connected' : 'Ready';
    badgeEl.classList.add('installed');
  } else {
    badgeEl.textContent = cloud ? 'No API key' : 'Not installed';
    badgeEl.classList.add('missing');
  }
}

function buildTtsActionButton(label, iconKey, className, attrs = '') {
  const icon = SETTINGS_ACTION_ICONS[iconKey] || '';
  return `<button type="button" class="sound-preview-btn settings-action-btn ${className}" ${attrs}><span class="settings-action-icon" aria-hidden="true">${icon}</span><span class="settings-action-label">${label}</span></button>`;
}

function buildTtsModelCard(model) {
  const dl = getTtsDownloadButtonState(model);
  const sizeLabel = model.cloud
    ? (model.sizeEstimate === 'Live API' ? 'Cloud · Gemini Live API' : 'Cloud · Gemini TTS')
    : (model.installed
      ? `${model.cacheSize || model.sizeEstimate} · offline`
      : (model.downloading
        ? `${model.sizeEstimate} · downloading…`
        : `${model.sizeEstimate} · offline`));

  const card = document.createElement('div');
  card.className = `tts-model-card${model.isActive ? ' is-active' : ''}${model.cloud ? ' is-cloud' : ''}`;
  card.dataset.modelKey = model.key;
  card.innerHTML = `
    <div class="tts-model-card-header">
      <div>
        <div class="tts-model-card-title">${model.label}${model.isActive ? ' · Active' : ''}</div>
        <div class="tts-model-card-desc">${model.description || ''}</div>
        <div class="tts-model-card-meta">${sizeLabel}</div>
      </div>
      <div class="tts-model-card-actions">
        ${model.cloud
    ? buildTtsActionButton(dl.label, dl.icon, `btn-tts-cloud-status ${dl.className}`, 'disabled')
    : buildTtsActionButton(dl.label, dl.icon, `btn-tts-download ${dl.className}`, `data-key="${model.key}" ${dl.disabled ? 'disabled' : ''}`)}
        ${buildTtsActionButton('Preview', 'preview', 'btn-tts-preview', `data-key="${model.key}" ${model.installed ? '' : 'disabled'}`)}
        <label class="switch-container tts-use-toggle" style="position: relative; display: inline-block; width: 38px; height: 20px; cursor: pointer; margin: 0; flex-shrink: 0;" title="${model.isActive ? 'Active voice' : (model.installed ? 'Set as active voice' : 'Download to enable')}">
          <input type="checkbox" class="tts-use-toggle-input" data-key="${model.key}" ${model.isActive ? 'checked' : ''} ${model.installed ? '' : 'disabled'} style="opacity: 0; width: 0; height: 0;">
          <span class="switch-slider"></span>
        </label>
      </div>
    </div>
  `;
  return card;
}

function bindTtsModelCardActions(container) {
  if (!container) return;

  container.querySelectorAll('.btn-tts-download').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (btn.disabled || btn.classList.contains('is-downloaded')) return;
      await startTtsModelDownload(btn.dataset.key);
    });
  });

  container.querySelectorAll('.tts-use-toggle-input').forEach(input => {
    input.addEventListener('change', async () => {
      const key = input.dataset.key;
      if (!window.ultronAPI?.setActiveTtsModel) return;
      if (input.checked) {
        const result = await window.ultronAPI.setActiveTtsModel(key);
        if (result?.success) {
          window.localStorage.setItem('ultron-tts-neural-model', key);
          cachedActiveTtsModelKey = key;
          warmupActiveTtsEngine();
          await refreshTtsModelsUI();
          logTrace(`Active voice: ${key}`, 'system');
          return;
        }
      } else {
        // One voice must always stay active — flipping the active toggle off
        // simply restores it; turn ON another voice to switch.
        logTrace('One voice must stay active — turn on another voice to switch.', 'system');
      }
      await refreshTtsModelsUI();
    });
  });

  container.querySelectorAll('.btn-tts-preview').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      await previewTtsModel(btn.dataset.key, btn);
    });
  });
}

function renderTtsModelsList(models = []) {
  const displayModels = normalizeTtsModelsForDisplay(models);
  ttsCatalogCache = displayModels;

  const offlineModels = displayModels.filter(m => !m.cloud);
  const cloudModels = displayModels.filter(m => m.cloud);

  if (ttsModelsListEl) {
    ttsModelsListEl.innerHTML = '';
    if (!offlineModels.length && !models.length) {
      ttsModelsListEl.innerHTML = '<p class="text-xs text-muted">Neural voice API unavailable — fully restart Ultron (close app, then npm run start).</p>';
      if (ttsModelStatusBadge) {
        ttsModelStatusBadge.textContent = 'Restart required';
        ttsModelStatusBadge.classList.add('missing');
      }
    } else {
      offlineModels.forEach(model => ttsModelsListEl.appendChild(buildTtsModelCard(model)));
      bindTtsModelCardActions(ttsModelsListEl);
      updateTtsSectionBadge(offlineModels, ttsModelStatusBadge);
    }
  }

  if (ttsCloudModelsListEl) {
    ttsCloudModelsListEl.innerHTML = '';
    cloudModels.forEach(model => ttsCloudModelsListEl.appendChild(buildTtsModelCard(model)));
    bindTtsModelCardActions(ttsCloudModelsListEl);
    updateTtsSectionBadge(cloudModels, ttsCloudStatusBadge, { cloud: true });
  }
}

async function previewTtsModel(modelKey, btn) {
  const model = ttsCatalogCache.find(m => m.key === modelKey);
  if (!model) return;

  if (!model.installed) {
    if (ttsModelFeedback) {
      ttsModelFeedback.textContent = model.cloud
        ? 'Add your Gemini API key in Settings → Connectors first.'
        : `Download “${model.label}” first, then preview.`;
    }
    return;
  }

  const previewText = model.previewText || "Hello, I'm Ultron.";
  if (btn) {
    btn.disabled = true;
    setSettingsActionButton(btn, 'Playing…', 'preview', 'btn-tts-preview');
  }

  stopTtsSpeech();

  try {
    const res = await window.ultronAPI.synthesizeSpeech(previewText, modelKey);
    if (res?.success && res.wavBase64) {
      await playNeuralAudio(res.wavBase64, { mimeType: res.mimeType || 'audio/wav' });
      if (ttsModelFeedback) ttsModelFeedback.textContent = `Preview: ${model.label}`;
    } else if (ttsModelFeedback) {
      ttsModelFeedback.textContent = res?.error || 'Preview failed.';
    }
  } catch (err) {
    if (ttsModelFeedback) ttsModelFeedback.textContent = err.message || 'Preview failed.';
  } finally {
    if (btn) {
      btn.disabled = false;
      setSettingsActionButton(btn, 'Preview', 'preview', 'btn-tts-preview');
    }
  }
}

async function refreshTtsModelsUI() {
  if (!window.ultronAPI?.getTtsCatalog) {
    renderTtsModelsList([]);
    return;
  }

  try {
    const result = await window.ultronAPI.getTtsCatalog();
    const models = result?.models || [];
    const storedActive = window.localStorage.getItem('ultron-tts-neural-model');
    if (storedActive && !models.some(m => m.key === storedActive)) {
      // Stored key no longer offered (e.g. a Voice-Mode-only live engine) —
      // heal localStorage to whatever the main process reports as active.
      const mainActive = models.find(m => m.isActive)?.key;
      if (mainActive) window.localStorage.setItem('ultron-tts-neural-model', mainActive);
    } else if (storedActive && models.some(m => m.key === storedActive && m.installed)) {
      await window.ultronAPI.setActiveTtsModel?.(storedActive);
    }
    const refreshed = await window.ultronAPI.getTtsCatalog();
    renderTtsModelsList(refreshed?.models || models);
  } catch (e) {
    renderTtsModelsList([]);
    if (ttsModelStatusBadge) {
      ttsModelStatusBadge.textContent = 'Unavailable';
      ttsModelStatusBadge.classList.add('missing');
    }
    if (ttsModelFeedback) ttsModelFeedback.textContent = 'Voice API not loaded — quit Ultron completely and start again.';
  }
}

async function startTtsModelDownload(modelKey) {
  if (!window.ultronAPI?.downloadTtsModel || !modelKey) return;

  ttsDownloadingModelKey = modelKey;
  bindTtsModelDownloadProgressListener(modelKey);
  resetTtsModelProgressUI();
  showTtsModelProgress({ percent: 0, status: 'Starting download…' });
  await refreshTtsModelsUI();

  const result = await window.ultronAPI.downloadTtsModel(modelKey).catch(err => ({
    success: false,
    error: err.message || 'Download failed.'
  }));

  if (ttsDownloadListenerCleanup) {
    ttsDownloadListenerCleanup();
    ttsDownloadListenerCleanup = null;
  }

  ttsDownloadingModelKey = null;
  resetTtsModelProgressUI();

  if (result.success) {
    window.localStorage.setItem('ultron-tts-neural-model', modelKey);
    await window.ultronAPI.setActiveTtsModel?.(modelKey);
    if (ttsModelFeedback) ttsModelFeedback.textContent = 'Voice engine ready — tap Preview on any voice.';
    logTrace('Neural voice engine installed.', 'system');
  } else if (!result.cancelled) {
    if (ttsModelFeedback) ttsModelFeedback.textContent = result.error || 'Download failed.';
    logTrace(result.error || 'Neural voice download failed.', 'system');
  }

  await refreshTtsModelsUI();
}

function initTtsModelsUI() {
  document.querySelector('.settings-tab-btn[data-tab="sounds"]')?.addEventListener('click', () => {
    refreshTtsModelsUI();
    if (getPerformanceProfile() !== 'battery') warmupActiveTtsEngine();
  });
}

initTtsModelsUI();

const settingTtsAutoSpeak = document.getElementById('setting-tts-auto-speak');
const settingTtsPersona = document.getElementById('setting-tts-persona');
const settingTtsVoice = document.getElementById('setting-tts-voice');
const settingTtsRate = document.getElementById('setting-tts-rate');
const settingTtsRateLabel = document.getElementById('setting-tts-rate-label');
const btnPreviewTts = document.getElementById('btn-preview-tts');

function populateTtsVoiceSelect() {
  if (!settingTtsVoice) return;
  const current = getSelectedTtsVoiceUri();
  const voices = getEnglishTtsVoices();
  settingTtsVoice.innerHTML = '<option value="">Auto (persona)</option>';
  voices.forEach(voice => {
    const opt = document.createElement('option');
    opt.value = voice.voiceURI;
    opt.textContent = `${voice.name} (${voice.lang})`;
    settingTtsVoice.appendChild(opt);
  });
  settingTtsVoice.value = current && voices.some(v => v.voiceURI === current) ? current : '';
}

function updateTtsRateLabel() {
  if (!settingTtsRate || !settingTtsRateLabel) return;
  settingTtsRateLabel.textContent = `${Number(settingTtsRate.value).toFixed(2)}×`;
}

function initTtsSettingsUI() {
  if (settingTtsAutoSpeak) {
    settingTtsAutoSpeak.checked = isTtsAutoSpeakEnabled();
    settingTtsAutoSpeak.addEventListener('change', () => {
      window.localStorage.setItem('ultron-tts-auto-speak', settingTtsAutoSpeak.checked ? 'true' : 'false');
      if (!settingTtsAutoSpeak.checked) stopTtsSpeech();
    });
  }

  if (settingTtsPersona) {
    settingTtsPersona.value = getTtsPersona();
    settingTtsPersona.addEventListener('change', () => {
      window.localStorage.setItem('ultron-tts-persona', settingTtsPersona.value);
      if (settingTtsVoice) settingTtsVoice.value = '';
      window.localStorage.setItem('ultron-tts-voice-uri', '');
    });
  }

  if (settingTtsVoice) {
    ensureTtsVoicesReady().then(() => populateTtsVoiceSelect());
    settingTtsVoice.addEventListener('change', () => {
      window.localStorage.setItem('ultron-tts-voice-uri', settingTtsVoice.value || '');
    });
  }

  if (settingTtsRate) {
    const savedRate = window.localStorage.getItem('ultron-tts-rate');
    if (savedRate != null) settingTtsRate.value = savedRate;
    updateTtsRateLabel();
    settingTtsRate.addEventListener('input', () => {
      window.localStorage.setItem('ultron-tts-rate', settingTtsRate.value);
      updateTtsRateLabel();
    });
  }

  if (btnPreviewTts) {
    setSettingsActionButton(btnPreviewTts, 'Preview', 'preview');
    btnPreviewTts.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      btnPreviewTts.disabled = true;
      setSettingsActionButton(btnPreviewTts, 'Speaking…', 'preview');

      const storedSpeakKey = window.localStorage.getItem('ultron-tts-neural-model');
      const activeKey = (storedSpeakKey && ttsCatalogCache.some(m => m.key === storedSpeakKey) ? storedSpeakKey : null)
        || ttsCatalogCache.find(m => m.isActive)?.key
        || ttsCatalogCache.find(m => m.installed)?.key;

      const restorePreviewBtn = () => {
        btnPreviewTts.disabled = false;
        setSettingsActionButton(btnPreviewTts, 'Preview', 'preview');
      };

      let started = false;
      if (activeKey && window.ultronAPI?.synthesizeSpeech) {
        const model = ttsCatalogCache.find(m => m.key === activeKey);
        if (model?.installed) {
          const res = await window.ultronAPI.synthesizeSpeech(
            "Hello, I'm Ultron. I'll read my responses aloud when you enable auto speak.",
            activeKey
          );
          if (res?.success && res.wavBase64) {
            started = await playNeuralAudio(res.wavBase64, { onEnd: restorePreviewBtn });
          }
        }
      }

      if (!started) {
        started = await speakTextAloud("Hello, I'm Ultron. I'll read my responses aloud when you enable auto speak.", {
          force: true,
          onEnd: restorePreviewBtn
        });
      }

      if (!started) {
        btnPreviewTts.disabled = false;
        setSettingsActionButton(btnPreviewTts, 'No voice', 'preview');
        setTimeout(() => setSettingsActionButton(btnPreviewTts, 'Preview', 'preview'), 1800);
      }
    });
  }

  document.querySelector('.settings-tab-btn[data-tab="sounds"]')?.addEventListener('click', () => {
    ensureTtsVoicesReady().then(() => populateTtsVoiceSelect());
    refreshTtsModelsUI();
    decorateSettingsActionButtons(document.getElementById('tab-sounds') || document);
  });

  decorateSettingsActionButtons(document.getElementById('tab-sounds') || document);
}

initTtsSettingsUI();

let settingsPanelOpen = false;
let chatTitleBeforeSettings = '';

async function prepareSettingsPanelState() {
  if (settingMemoryToggle) {
    const isMemoryEnabled = window.localStorage.getItem('ultron-memory-enabled') !== 'false';
    settingMemoryToggle.checked = isMemoryEnabled;
  }

  if (settingScreenCaptureToggle) {
    const screenCaptureEnabled = window.localStorage.getItem('ultron-screen-capture-enabled') !== 'false';
    settingScreenCaptureToggle.checked = screenCaptureEnabled;
  }
  if (settingNeverCaptureApps) {
    settingNeverCaptureApps.value = window.localStorage.getItem('ultron-never-capture-apps') || '';
  }

  await loadStoragePathsUI();

  const inputsRow = document.getElementById('download-inputs-row');
  if (inputsRow) inputsRow.classList.remove('hidden');
  renderModelTypeFilterBar(document.getElementById('catalog-model-filters'));
  renderOllamaCatalog();

  updateMemoryUIState();
}

async function openSettingsPanel(tabName = 'account') {
  if (!settingsPanel || !chatMain) return;

  if (!settingsPanelOpen) {
    chatTitleBeforeSettings = activeChatTitle?.textContent || 'New chat';
  }

  settingsPanelOpen = true;
  settingsPanel.classList.remove('hidden');
  chatMain.classList.add('settings-open');
  btnSettings?.classList.add('active');

  if (activeChatTitle) activeChatTitle.textContent = 'Settings';
  btnBackFromSettings?.classList.remove('hidden');

  const tab = document.querySelector(`.settings-tab-btn[data-tab="${tabName}"]`);
  if (tab) tab.click();
  else document.querySelector('.settings-tab-btn[data-tab="account"]')?.click();

  await prepareSettingsPanelState();
  decorateSettingsActionButtons(settingsPanel || document);
  logTrace('Settings opened.', 'system');
}

function closeSettingsPanel() {
  if (!settingsPanel || !chatMain) return;

  settingsPanelOpen = false;
  settingsPanel.classList.add('hidden');
  chatMain.classList.remove('settings-open');
  btnSettings?.classList.remove('active');

  if (activeChatTitle) {
    activeChatTitle.textContent = chatTitleBeforeSettings || 'New chat';
  }
  btnBackFromSettings?.classList.add('hidden');

  logTrace('Settings closed.', 'system');
}

if (btnSettings && settingsPanel) {
  btnSettings.addEventListener('click', async () => {
    if (settingsPanelOpen) {
      closeSettingsPanel();
      return;
    }
    await openSettingsPanel('account');
  });
}

if (btnBackFromSettings) {
  btnBackFromSettings.addEventListener('click', () => {
    closeSettingsPanel();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsPanelOpen) {
    closeSettingsPanel();
  }
});

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

// Reset agent storage directory to default path
const btnResetStorage = document.getElementById('btn-reset-storage');
if (btnResetStorage && settingDataDir) {
  btnResetStorage.addEventListener('click', async () => {
    logTrace('Resetting agent storage directory to default...', 'system');
    const paths = await window.ultronAPI.getStoragePaths?.().catch(() => null);
    const defaultPath = paths?.defaultAgentDataDir || await window.ultronAPI.getDefaultDataDir();
    settingDataDir.value = defaultPath;
    window.localStorage.setItem('ultron-data-dir', defaultPath);
    const updateResult = await window.ultronAPI.updateDataDir(defaultPath);
    if (updateResult.success) {
      logTrace(`Agent storage and memory location reset to default: "${defaultPath}"`, 'system');
      await reloadConversationsFromDisk();
      alert(`Agent storage reset to install default:\n${defaultPath}`);
    } else {
      logTrace(`Failed to reset storage path: ${updateResult.error}`, 'system');
      alert(`Failed to reset storage path: ${updateResult.error}`);
    }
  });
}

const btnBrowseConnectors = document.getElementById('btn-browse-connectors');
if (btnBrowseConnectors && settingConnectorsDir) {
  btnBrowseConnectors.addEventListener('click', async () => {
    const result = await window.ultronAPI.selectDirectory();
    if (!result.canceled && result.filePaths.length > 0) {
      const selectedPath = result.filePaths[0];
      settingConnectorsDir.value = selectedPath;
      window.localStorage.setItem('ultron-connectors-dir', selectedPath);
      const updateResult = await window.ultronAPI.updateConnectorsDir(selectedPath);
      if (updateResult.success) {
        logTrace(`Connectors download location updated to: "${selectedPath}"`, 'system');
      } else {
        logTrace(`Failed to update connectors path: ${updateResult.error}`, 'system');
      }
    }
  });
}

if (settingConnectorsDir) {
  settingConnectorsDir.addEventListener('change', async () => {
    const customPath = settingConnectorsDir.value.trim();
    if (!customPath) return;
    window.localStorage.setItem('ultron-connectors-dir', customPath);
    const updateResult = await window.ultronAPI.updateConnectorsDir(customPath);
    if (updateResult.success) {
      logTrace(`Connectors download location updated manually to: "${customPath}"`, 'system');
    } else {
      logTrace(`Failed to update connectors path: ${updateResult.error}`, 'system');
    }
  });
}

const btnResetConnectors = document.getElementById('btn-reset-connectors');
if (btnResetConnectors && settingConnectorsDir) {
  btnResetConnectors.addEventListener('click', async () => {
    const paths = await window.ultronAPI.getStoragePaths?.().catch(() => null);
    const defaultPath = paths?.defaultConnectorsDir || '';
    if (!defaultPath) return;
    settingConnectorsDir.value = defaultPath;
    window.localStorage.setItem('ultron-connectors-dir', defaultPath);
    const updateResult = await window.ultronAPI.updateConnectorsDir(defaultPath);
    if (updateResult.success) {
      logTrace(`Connectors location reset to default: "${defaultPath}"`, 'system');
      alert(`Connectors folder reset to install default:\n${defaultPath}`);
    } else {
      alert(`Failed to reset connectors path: ${updateResult.error}`);
    }
  });
}

// Clear all chats & delete conversations from disk
const btnClearChats = document.getElementById('btn-clear-chats');
if (btnClearChats) {
  btnClearChats.addEventListener('click', async () => {
    const chatCount = Object.keys(conversationsStore).length;
    if (chatCount === 0) {
      triggerNewChat();
      return;
    }

    const confirmed = await showConfirmDialog({
      title: 'Clear all chats?',
      message: `Permanently delete all ${chatCount} conversation${chatCount === 1 ? '' : 's'} and their messages? This cannot be undone.`,
      confirmText: 'Clear all chats',
      cancelText: 'Cancel',
      destructive: true
    });

    if (!confirmed) return;

    logTrace('Clearing all conversation histories...', 'system');
    conversationsStore = {};
    rebuildSessionHistoryList();
    saveConversationsToDisk();
    triggerNewChat();
    logTrace('All conversation history successfully cleared.', 'system');
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

// Location settings
const settingHomeLocation = document.getElementById('setting-home-location');
const btnDetectLocation = document.getElementById('btn-detect-location');
const btnRefreshLocation = document.getElementById('btn-refresh-location');
const settingAutoLocation = document.getElementById('setting-auto-location');
const btnLocationInfo = document.getElementById('btn-location-info');
const locationInfoTooltip = document.getElementById('location-info-tooltip');

if (settingHomeLocation) {
  settingHomeLocation.addEventListener('change', () => {
    window.localStorage.setItem(MANUAL_LOCATION_KEY, 'true');
    persistHomeLocation(settingHomeLocation.value);
    setDetectLocationButtonState(settingHomeLocation.value.trim() ? 'detected' : 'idle');
    loadAccountDetails();
    logTrace(`Location ${settingHomeLocation.value.trim() ? 'set manually' : 'cleared'}: "${settingHomeLocation.value.trim()}"`, 'system');
  });
}

if (settingAutoLocation) {
  settingAutoLocation.addEventListener('change', async () => {
    const enabled = settingAutoLocation.checked;
    window.localStorage.setItem(AUTO_LOCATION_KEY, enabled ? 'true' : 'false');
    if (enabled) {
      window.localStorage.setItem(MANUAL_LOCATION_KEY, 'false');
      await autoDetectHomeLocation({ forceRefresh: true, reason: 'auto-enabled' });
    } else {
      const statusEl = document.getElementById('setting-location-status');
      const saved = settingHomeLocation?.value?.trim() || '';
      if (statusEl) {
        statusEl.textContent = saved
          ? `Using saved location: ${saved} (auto-detect off)`
          : 'Auto-detect off. Enter your location or click Refresh.';
      }
    }
  });
}

if (btnDetectLocation) {
  btnDetectLocation.addEventListener('click', async () => {
    window.localStorage.setItem(MANUAL_LOCATION_KEY, 'false');
    await autoDetectHomeLocation({ forceRefresh: true, reason: 'manual', allowManualOverride: true });
  });
}

if (btnRefreshLocation) {
  btnRefreshLocation.addEventListener('click', async () => {
    btnRefreshLocation.classList.add('is-refreshing');
    window.localStorage.setItem(MANUAL_LOCATION_KEY, 'false');
    await autoDetectHomeLocation({ forceRefresh: true, reason: 'manual', allowManualOverride: true });
    btnRefreshLocation.classList.remove('is-refreshing');
  });
}

if (btnLocationInfo && locationInfoTooltip) {
  btnLocationInfo.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = locationInfoTooltip.style.visibility === 'visible';
    locationInfoTooltip.style.visibility = isVisible ? 'hidden' : 'visible';
    locationInfoTooltip.style.opacity = isVisible ? '0' : '1';
  });
  document.addEventListener('click', () => {
    locationInfoTooltip.style.visibility = '';
    locationInfoTooltip.style.opacity = '';
  });
}

// Save account changes button listener
const btnSaveAccount = document.getElementById('btn-save-account');
if (btnSaveAccount) {
  btnSaveAccount.addEventListener('click', async () => {
    const inputName = document.getElementById('input-account-name');
    const inputEmail = document.getElementById('input-account-email');
    const inputBirthdate = document.getElementById('input-account-birthdate');
    if (inputName && inputEmail) {
      const name = inputName.value.trim();
      const email = inputEmail.value.trim();
      const birthdate = inputBirthdate ? inputBirthdate.value : '';
      if (!name) {
        alert('Please enter your full name.');
        return;
      }
      const parts = name.split(/\s+/);
      const fn = parts[0] || 'User';
      const ln = parts.slice(1).join(' ') || '';

      window.localStorage.setItem('ultron-user-first-name', fn);
      window.localStorage.setItem('ultron-user-last-name', ln);
      window.localStorage.setItem('ultron-user-name', name);
      window.localStorage.setItem('ultron-user-email', email || 'user@example.com');
      if (birthdate) {
        window.localStorage.setItem('ultron-user-birthdate', birthdate);
      }
      
      if (window.ultronAPI && window.ultronAPI.saveUserProfile) {
        await window.ultronAPI.saveUserProfile({ fullName: name, firstName: fn, lastName: ln, birthdate: birthdate, email: email || 'user@example.com' });
      }

      await loadAccountDetails();
      updateWelcomeGreeting();
      if (accountEditForm) {
        accountEditForm.classList.add('hidden');
      }
      logTrace(`Local account details updated to: "${name}" (${email || 'no email'}, DOB: ${birthdate || 'not set'})`, 'system');
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
    if (e.target.closest('.session-delete-btn')) return;

    const item = e.target.closest('.session-history-item');
    if (item) {
      const sessionItems = sessionHistoryList.querySelectorAll('.session-history-item');
      sessionItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      
      const sessionId = item.getAttribute('data-session-id');
      const title = item.querySelector('.nav-text')?.textContent || 'Chat';
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

// Dynamic prompt input typewriter placeholder animation
const DYNAMIC_PLACEHOLDERS = [
  "Ask Ultron to execute local tasks or create files...",
  "Create an HTML site using Antigravity for me...",
  "Search the web for latest research and news...",
  "Write a Python script to automate file organization...",
  "Analyze computer hardware, CPU, GPU, and memory...",
  "Run terminal commands, install packages, and debug code..."
];

let typewriterPhraseIndex = 0;
let typewriterCharIndex = 0;
let isDeletingPlaceholder = false;
let typewriterTimeoutId = null;

function startTypewriterPlaceholder() {
  if (!chatInput) return;

  function typeStep() {
    // If user has focused the input or entered text, wait
    if (chatInput.value || document.activeElement === chatInput) {
      typewriterTimeoutId = setTimeout(typeStep, 500);
      return;
    }

    const currentPhrase = DYNAMIC_PLACEHOLDERS[typewriterPhraseIndex];

    if (!isDeletingPlaceholder) {
      // Typing phase
      typewriterCharIndex++;
      chatInput.setAttribute('placeholder', currentPhrase.substring(0, typewriterCharIndex));

      if (typewriterCharIndex === currentPhrase.length) {
        // Pause at end of full phrase
        isDeletingPlaceholder = true;
        typewriterTimeoutId = setTimeout(typeStep, 2200);
        return;
      }
      typewriterTimeoutId = setTimeout(typeStep, 45); // Natural typing speed
    } else {
      // Deleting phase
      typewriterCharIndex--;
      chatInput.setAttribute('placeholder', currentPhrase.substring(0, typewriterCharIndex));

      if (typewriterCharIndex === 0) {
        // Switch to next phrase
        isDeletingPlaceholder = false;
        typewriterPhraseIndex = (typewriterPhraseIndex + 1) % DYNAMIC_PLACEHOLDERS.length;
        typewriterTimeoutId = setTimeout(typeStep, 400); // Pause before next phrase
        return;
      }
      typewriterTimeoutId = setTimeout(typeStep, 22); // Fast backspacing speed
    }
  }

  // Bind focus and blur events to pause and resume seamlessly
  chatInput.addEventListener('focus', () => {
    if (typewriterTimeoutId) clearTimeout(typewriterTimeoutId);
    chatInput.setAttribute('placeholder', 'Ask Ultron to execute local tasks...');
  });

  chatInput.addEventListener('blur', () => {
    if (!chatInput.value) {
      typewriterCharIndex = 0;
      isDeletingPlaceholder = false;
      if (typewriterTimeoutId) clearTimeout(typewriterTimeoutId);
      typeStep();
    }
  });

  typeStep();
}

// Start dynamic typewriter placeholder on load
startTypewriterPlaceholder();

// Auto-Updater UI Integration
function setupAutoUpdaterUI() {
  const btnCheck = document.getElementById('btn-check-updates');
  const btnDownload = document.getElementById('btn-download-update');
  const btnRestart = document.getElementById('btn-restart-install');
  const actionContainer = document.getElementById('update-action-container');
  const title = document.getElementById('update-status-title');
  const subtitle = document.getElementById('update-status-subtitle');
  const progressLabel = document.getElementById('update-progress-label');

  // Top-left Chat Header update buttons
  const topBtnCheck = document.getElementById('top-btn-check-update');
  const topBtnDownload = document.getElementById('top-btn-download-update');
  const topBtnRestart = document.getElementById('top-btn-restart-install');
  const topDownloadText = document.getElementById('top-download-text');

  if (!window.ultronAPI || !window.ultronAPI.onUpdateStatus) return;

  function applyUpdateStatus(data) {
    if (!data) return;

    if (btnCheck) {
      btnCheck.disabled = false;
      btnCheck.style.opacity = '1';
    }
    if (topBtnCheck) {
      topBtnCheck.disabled = false;
      topBtnCheck.style.opacity = '1';
      topBtnCheck.querySelector('span').textContent = 'Check for Updates';
    }

    if (data.status === 'checking') {
      if (title) title.textContent = 'Checking GitHub Releases...';
      if (topBtnCheck) {
        topBtnCheck.disabled = true;
        topBtnCheck.style.opacity = '0.6';
        topBtnCheck.querySelector('span').textContent = 'Checking...';
      }
      if (btnCheck) {
        btnCheck.disabled = true;
        btnCheck.style.opacity = '0.6';
      }
    } else if (data.status === 'dev-mode') {
      if (title) title.textContent = 'Development Mode';
      if (subtitle) subtitle.textContent = 'Auto-updates connect to GitHub Releases when packaged.';
      if (topBtnCheck) {
        topBtnCheck.querySelector('span').textContent = 'Dev Mode';
        setTimeout(() => {
          if (topBtnCheck) topBtnCheck.querySelector('span').textContent = 'Check for Updates';
        }, 3000);
      }
    } else if (data.status === 'available') {
      if (title) title.textContent = `New Update Available: v${data.version}!`;
      if (subtitle) subtitle.textContent = `Release notes: ${data.releaseNotes || 'Bug fixes, speed improvements, and new capabilities.'}`;
      if (actionContainer) actionContainer.style.display = 'flex';
      if (btnDownload) btnDownload.style.display = 'inline-flex';

      if (topBtnDownload) {
        topBtnDownload.classList.remove('hidden');
        if (topDownloadText) topDownloadText.textContent = `Download v${data.version}`;
      }

      if (typeof showToast === 'function') {
        showToast(
          `New Update Available: v${data.version}`,
          `Release notes: ${data.releaseNotes ? data.releaseNotes.slice(0, 100) + '...' : 'Enhancements and fixes ready.'}`,
          'info'
        );
      }
    } else if (data.status === 'not-available') {
      if (title) title.textContent = 'Brown AI is Up to Date ✓';
      if (subtitle) subtitle.textContent = `You are running the latest version (v${data.version || '1.0.15'}).`;
      if (actionContainer) actionContainer.style.display = 'none';
      if (topBtnDownload) topBtnDownload.classList.add('hidden');
      if (topBtnRestart) topBtnRestart.classList.add('hidden');
    } else if (data.status === 'downloading') {
      if (actionContainer) actionContainer.style.display = 'flex';
      if (btnDownload) btnDownload.style.display = 'none';
      const pct = data.percent !== undefined ? `${data.percent}%` : '';
      if (progressLabel) progressLabel.textContent = `Downloading update... ${pct}`;

      if (topBtnDownload) {
        topBtnDownload.classList.remove('hidden');
        if (topDownloadText) topDownloadText.textContent = `Downloading... ${pct}`;
      }
    } else if (data.status === 'downloaded') {
      if (title) title.textContent = `Update v${data.version || '1.0.15'} Ready to Install!`;
      if (subtitle) subtitle.textContent = 'Update downloaded successfully. Click restart to apply changes.';
      if (actionContainer) actionContainer.style.display = 'flex';
      if (btnDownload) btnDownload.style.display = 'none';
      if (btnRestart) btnRestart.style.display = 'inline-flex';
      if (progressLabel) progressLabel.textContent = 'Download Complete 100%';

      if (topBtnDownload) topBtnDownload.classList.add('hidden');
      if (topBtnRestart) topBtnRestart.classList.remove('hidden');

      if (typeof showToast === 'function') {
        showToast(
          `Update Ready: v${data.version || '1.0.14'}`,
          'Download finished. Click Restart & Install to complete update.',
          'success'
        );
      }
    } else if (data.status === 'error') {
      const isUpToDate = data.error && (data.error.includes('latest version') || data.error.includes('No newer release'));
      if (isUpToDate) {
        if (title) title.textContent = 'Brown AI is Up to Date ✓';
        if (subtitle) subtitle.textContent = 'You are running the latest version (v1.0.14).';
      } else {
        if (title) title.textContent = 'Update Check Status';
        if (subtitle) subtitle.textContent = data.error || 'Brown is up to date or network check was completed.';
      }
    }
  }

  const handleCheckForUpdates = async () => {
    applyUpdateStatus({ status: 'checking' });
    try {
      const res = await window.ultronAPI.checkForUpdates();
      if (res) {
        applyUpdateStatus(res);
      }
    } catch (err) {
      applyUpdateStatus({ status: 'error', error: err?.message || 'Check failed' });
    }
  };

  const handleDownloadUpdate = async () => {
    if (btnDownload) btnDownload.style.display = 'none';
    if (topBtnDownload) topBtnDownload.classList.add('hidden');
    if (progressLabel) progressLabel.textContent = 'Starting download...';
    if (topDownloadText) topDownloadText.textContent = 'Starting download...';
    await window.ultronAPI.downloadUpdate();
  };

  const handleRestartAndInstall = () => {
    window.ultronAPI.restartAndInstall();
  };

  if (btnCheck) btnCheck.addEventListener('click', handleCheckForUpdates);
  if (topBtnCheck) topBtnCheck.addEventListener('click', handleCheckForUpdates);
  if (btnDownload) btnDownload.addEventListener('click', handleDownloadUpdate);
  if (topBtnDownload) topBtnDownload.addEventListener('click', handleDownloadUpdate);
  if (btnRestart) btnRestart.addEventListener('click', handleRestartAndInstall);
  if (topBtnRestart) topBtnRestart.addEventListener('click', handleRestartAndInstall);

  window.ultronAPI.onUpdateStatus((data) => {
    applyUpdateStatus(data);
  });
}

setupAutoUpdaterUI();

// Handle hand-off from Floating Action Bar companion

function saveAndRenderFloatingBarSession(prompt, answer) {
  if (!prompt || !answer) return;

  // 1. Ensure a session exists in conversationsStore
  if (!currentSessionId || !conversationsStore[currentSessionId]) {
    const sessionTitle = typeof makeSessionTitle === 'function' ? makeSessionTitle(prompt) : prompt.substring(0, 30);
    if (typeof addSessionToHistory === 'function') {
      addSessionToHistory(sessionTitle);
    }
  }

  // 2. Prevent duplicate entries
  const currentMsgs = (conversationsStore[currentSessionId] && conversationsStore[currentSessionId].messages) || [];
  const alreadySaved = currentMsgs.some(m => !m.isAi && m.text && m.text.trim() === prompt.trim());

  if (!alreadySaved) {
    if (typeof appendChatMessage === 'function') {
      appendChatMessage('User', prompt, false);
      appendChatMessage('Ultron', answer, true);
    } else if (typeof renderChatMessage === 'function') {
      renderChatMessage('User', prompt, false);
      renderChatMessage('Ultron', answer, true);
    }
  }

  // 3. Persist session to disk & refresh sidebar history list
  if (typeof saveConversationsToDisk === 'function') {
    saveConversationsToDisk();
  }
  if (typeof rebuildSessionHistoryList === 'function') {
    rebuildSessionHistoryList();
  }
  if (typeof saveChatHistoryDebounced === 'function') {
    saveChatHistoryDebounced();
  }

  const chatMessagesContainer = document.querySelector('.chat-messages') || document.querySelector('.chat-main');
  if (chatMessagesContainer) {
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }
}

// Handle hand-off from Floating Action Bar companion
if (window.ultronAPI && window.ultronAPI.onFloatingBarHandOff) {
  window.ultronAPI.onFloatingBarHandOff((payload) => {
    if (!payload) return;

    if (payload.action === 'open-settings-models') {
      const settingsBtn = document.getElementById('btn-settings');
      if (settingsBtn) settingsBtn.click();
      setTimeout(() => {
        const modelsTab = document.querySelector('.settings-tab-btn[data-tab="models"]');
        if (modelsTab) modelsTab.click();
      }, 100);
      return;
    }

    if (payload.action === 'attach-files') {
      const attachBtn = document.getElementById('plus-menu-attach');
      if (attachBtn) attachBtn.click();
      return;
    }

    if (payload.prompt && payload.answer) {
      saveAndRenderFloatingBarSession(payload.prompt, payload.answer);
      return;
    }

    if (chatInput) {
      if (payload.prompt) {
        chatInput.value = payload.prompt;
      }
      chatInput.focus();
    }
    if (payload.autoSend && payload.prompt && btnSend) {
      btnSend.click();
    }
  });
}

// Real-time synchronization of sessions from Floating Companion Bar
if (window.ultronAPI && window.ultronAPI.onFloatingBarSessionCreated) {
  window.ultronAPI.onFloatingBarSessionCreated((payload) => {
    if (!payload || !payload.prompt || !payload.answer) return;
    saveAndRenderFloatingBarSession(payload.prompt, payload.answer);
  });
}

(function initMobilePairModal() {
  const modal = document.getElementById('mobile-pair-modal');
  const codeEl = document.getElementById('mobile-pair-code');
  const timerEl = document.getElementById('mobile-pair-timer');
  const nameEl = document.getElementById('mobile-pair-device-name');
  const titleEl = document.getElementById('mobile-pair-title');
  const boxesContainer = document.getElementById('mobile-pair-code-boxes');
  const denyBtn = document.getElementById('btn-mobile-pair-deny');
  if (!modal || !window.ultronAPI) return;

  let countdown = null;

  function hidePairModal() {
    modal.classList.add('hidden');
    if (countdown) {
      clearInterval(countdown);
      countdown = null;
    }
  }

  function showPairModal(payload) {
    const rawCode = (payload && payload.code) || '————';
    const cleanCode = String(rawCode).replace(/\s+/g, '');
    const seconds = payload && payload.expiresIn ? payload.expiresIn : 60;
    const deviceName = (payload && (payload.deviceName || payload.device)) || 'Mobile Device';

    if (titleEl) {
      titleEl.textContent = 'Pairing Request';
    }

    if (boxesContainer) {
      boxesContainer.innerHTML = '';
      for (let i = 0; i < 4; i++) {
        const char = cleanCode[i] || '—';
        const box = document.createElement('div');
        box.className = 'code-char-box';
        box.textContent = char;
        boxesContainer.appendChild(box);
      }
    } else if (codeEl) {
      codeEl.textContent = cleanCode;
    }

    let remaining = seconds;
    if (timerEl) timerEl.textContent = `Code expires in ${remaining}s`;
    modal.classList.remove('hidden');
    if (countdown) clearInterval(countdown);
    countdown = setInterval(() => {
      remaining -= 1;
      if (timerEl) timerEl.textContent = remaining > 0 ? `Code expires in ${remaining}s` : 'Code expired';
      if (remaining <= 0) hidePairModal();
    }, 1000);
  }

  if (denyBtn) {
    denyBtn.addEventListener('click', () => {
      hidePairModal();
      if (window.ultronAPI.denyMobilePair) window.ultronAPI.denyMobilePair();
    });
  }

  if (window.ultronAPI.onMobilePairRequest) {
    window.ultronAPI.onMobilePairRequest(showPairModal);
  }
  if (window.ultronAPI.onMobilePairComplete) {
    window.ultronAPI.onMobilePairComplete(hidePairModal);
  }
  if (window.ultronAPI.onMobilePairDismissed) {
    window.ultronAPI.onMobilePairDismissed(hidePairModal);
  }
  if (window.ultronAPI.onMobileProfileUpdated) {
    window.ultronAPI.onMobileProfileUpdated((profile) => {
      if (!profile) return;
      if (profile.displayName) window.localStorage.setItem('ultron-user-name', profile.displayName);
      if (profile.geminiApiKey) window.localStorage.setItem('ultron-gemini-api-key', profile.geminiApiKey);
      if (typeof profile.systemPrompt === 'string') {
        window.localStorage.setItem('ultron-custom-system-prompt', profile.systemPrompt);
      }
    });
  }
  if (window.ultronAPI.onMobileChatsImported) {
    window.ultronAPI.onMobileChatsImported(() => {
      if (typeof reloadConversationsFromDisk === 'function') reloadConversationsFromDisk();
    });
  }
})();

(function initMobileChatConsentModal() {
  const modal = document.getElementById('mobile-chat-consent-modal');
  const titleEl = document.getElementById('mobile-chat-consent-title');
  const detailEl = document.getElementById('mobile-chat-consent-detail');
  const timerEl = document.getElementById('mobile-chat-consent-timer');
  const acceptBtn = document.getElementById('btn-mobile-chat-accept');
  const denyBtn = document.getElementById('btn-mobile-chat-deny');
  if (!modal || !window.ultronAPI) return;

  let countdown = null;

  function hideConsentModal() {
    modal.classList.add('hidden');
    if (countdown) {
      clearInterval(countdown);
      countdown = null;
    }
  }

  function showConsentModal(payload) {
    const seconds = payload && payload.expiresIn ? payload.expiresIn : 60;
    if (titleEl) titleEl.textContent = (payload && payload.title) || 'Allow chat transfer?';
    if (detailEl) {
      detailEl.textContent = (payload && payload.detail) || 'Your phone is requesting to sync conversations with this PC.';
    }
    let remaining = seconds;
    if (timerEl) timerEl.textContent = `Request expires in ${remaining}s`;
    modal.classList.remove('hidden');
    if (countdown) clearInterval(countdown);
    countdown = setInterval(() => {
      remaining -= 1;
      if (timerEl) timerEl.textContent = remaining > 0 ? `Request expires in ${remaining}s` : 'Request expired';
      if (remaining <= 0) hideConsentModal();
    }, 1000);
  }

  if (acceptBtn) {
    acceptBtn.addEventListener('click', () => {
      hideConsentModal();
      if (window.ultronAPI.approveMobileChats) window.ultronAPI.approveMobileChats();
    });
  }
  if (denyBtn) {
    denyBtn.addEventListener('click', () => {
      hideConsentModal();
      if (window.ultronAPI.denyMobileChats) window.ultronAPI.denyMobileChats();
    });
  }
  if (window.ultronAPI.onMobileChatConsent) {
    window.ultronAPI.onMobileChatConsent(showConsentModal);
  }
  if (window.ultronAPI.onMobileChatConsentDismissed) {
    window.ultronAPI.onMobileChatConsentDismissed(hideConsentModal);
  }
})();

// =========================================================================
// ULTRON PHASE 2 MASTER ORCHESTRATION SUITE
// Multi-Provider Hub, Local Vector RAG, Desktop Sync, Canvas, & VAD Interruption
// =========================================================================
(function initUltronPhase2Suite() {
  'use strict';

  // 1. Initialize Canvas & Smart Clipboard
  if (window.UltronCanvas && typeof window.UltronCanvas.init === 'function') {
    window.UltronCanvas.init();
  }
  if (window.UltronClipboardManager && typeof window.UltronClipboardManager.init === 'function') {
    window.UltronClipboardManager.init();
  }

  // 2. Multi-Provider API Key Store & Connection Handlers
  async function initMultiProviderUI() {
    if (!window.ultronAPI) return;

    try {
      const res = await window.ultronAPI.loadProviderKeys();
      if (res && res.success && res.keys && window.UltronMultiProviderHub) {
        const keys = res.keys;
        if (keys.openai) window.UltronMultiProviderHub.setStoredApiKey('openai', keys.openai);
        if (keys.anthropic) window.UltronMultiProviderHub.setStoredApiKey('anthropic', keys.anthropic);
        if (keys.deepseek) window.UltronMultiProviderHub.setStoredApiKey('deepseek', keys.deepseek);
        if (keys.groq) window.UltronMultiProviderHub.setStoredApiKey('groq', keys.groq);
        if (keys.customUrl) window.UltronMultiProviderHub.setCustomEndpointUrl(keys.customUrl);
        if (keys.customKey) window.UltronMultiProviderHub.setStoredApiKey('custom', keys.customKey);
      }

      // Proactively discover models for all configured providers
      if (window.UltronMultiProviderHub) {
        const providersToCheck = ['gemini', 'openai', 'anthropic', 'deepseek', 'groq', 'custom'];
        providersToCheck.forEach(p => {
          const hasKey = p === 'custom'
            ? (window.UltronMultiProviderHub.getCustomEndpointUrl() || window.UltronMultiProviderHub.getStoredApiKey('custom'))
            : (p === 'gemini' ? (localStorage.getItem('ultron-gemini-api-key') || window.UltronMultiProviderHub.getStoredApiKey('gemini')) : window.UltronMultiProviderHub.getStoredApiKey(p));
          if (hasKey) {
            window.UltronMultiProviderHub.fetchProviderModels(p).then(() => {
              renderModelDropdownList();
              updateModelSelectorLabel();
            }).catch(() => {});
          }
        });
      }
    } catch {}

    function setupProviderCard(providerId, options = {}) {
      const isCustom = Boolean(options.isCustom);
      const input = document.getElementById(options.inputId || `input-${providerId}-api-key`);
      const toggleBtn = document.getElementById(options.toggleBtnId || `btn-toggle-${providerId}-key-input`);
      const btnText = document.getElementById(options.btnTextId || `${providerId}-key-btn-text`);
      const container = document.getElementById(options.containerId || `${providerId}-key-input-container`);
      const saveBtn = document.getElementById(options.saveBtnId || `btn-save-${providerId}-key`);
      const cancelBtn = document.getElementById(options.cancelBtnId || `btn-cancel-${providerId}-key`);
      const feedback = document.getElementById(options.feedbackId || `${providerId}-key-feedback`);
      const badge = document.getElementById(options.badgeId || `${providerId}-status-badge`);
      const customKeyInput = isCustom ? document.getElementById('input-custom-endpoint-key') : null;

      let isEditing = false;

      function updateBadge(connected, errorMsg = '') {
        if (!badge) return;
        badge.textContent = connected ? 'Connected' : 'Not configured';
        badge.style.background = connected ? 'rgba(34, 197, 94, 0.14)' : 'rgba(161, 161, 170, 0.12)';
        badge.style.color = connected ? '#4ade80' : '#a1a1aa';
        badge.style.borderColor = connected ? 'rgba(34, 197, 94, 0.35)' : 'rgba(161, 161, 170, 0.25)';
        if (errorMsg) badge.title = errorMsg;
      }

      function updateUI() {
        let savedVal = '';
        if (isCustom) {
          savedVal = (window.UltronMultiProviderHub ? window.UltronMultiProviderHub.getCustomEndpointUrl() : '') || localStorage.getItem('ultron-custom-endpoint-url') || '';
          if (input) input.value = savedVal;
          if (customKeyInput) {
            customKeyInput.value = (window.UltronMultiProviderHub ? window.UltronMultiProviderHub.getStoredApiKey('custom') : '') || '';
          }
          if (btnText) btnText.textContent = savedVal ? 'Edit Endpoint' : 'Configure Endpoint';
          updateBadge(Boolean(savedVal));
        } else {
          savedVal = (window.UltronMultiProviderHub ? window.UltronMultiProviderHub.getStoredApiKey(providerId) : '') || '';
          if (input) input.value = savedVal;
          if (btnText) btnText.textContent = savedVal ? 'Edit Key' : 'Add Key';
          updateBadge(Boolean(savedVal));
        }

        if (!isEditing) {
          if (container) container.classList.add('hidden');
          if (toggleBtn) toggleBtn.style.display = 'inline-flex';
        } else {
          if (container) container.classList.remove('hidden');
          if (toggleBtn) toggleBtn.style.display = 'none';
        }
      }

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          isEditing = true;
          updateUI();
          if (input) {
            input.focus();
            input.select();
          }
        });
      }

      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          isEditing = false;
          updateUI();
        });
      }

      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          const val = input ? input.value.trim() : '';
          const customKey = customKeyInput ? customKeyInput.value.trim() : '';

          if (val) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Connecting…';

            let testRes = { success: false };
            if (window.UltronMultiProviderHub) {
              if (isCustom) {
                window.UltronMultiProviderHub.setCustomEndpointUrl(val);
                if (customKey) window.UltronMultiProviderHub.setStoredApiKey('custom', customKey);
                testRes = await window.UltronMultiProviderHub.testProviderConnection('custom', customKey, val);
              } else {
                window.UltronMultiProviderHub.setStoredApiKey(providerId, val);
                testRes = await window.UltronMultiProviderHub.testProviderConnection(providerId, val);
              }
            }

            saveBtn.disabled = false;
            saveBtn.textContent = isCustom ? 'Save Endpoint' : 'Save Key';

            if (testRes && testRes.success) {
              if (window.ultronAPI && typeof window.ultronAPI.saveProviderKeys === 'function') {
                const patch = {};
                if (isCustom) {
                  patch.customUrl = val;
                  if (customKey) patch.customKey = customKey;
                } else {
                  patch[providerId] = val;
                }
                await window.ultronAPI.saveProviderKeys(patch).catch(() => {});
              }

              updateBadge(true);
              const modelCount = Array.isArray(testRes.models) ? testRes.models.length : 0;
              if (feedback) {
                feedback.textContent = `✓ Connected — ${modelCount > 0 ? `${modelCount} models available.` : 'Connected successfully.'}`;
                feedback.style.color = '#34d399';
                feedback.classList.remove('hidden');
                setTimeout(() => feedback.classList.add('hidden'), 5000);
              }
              isEditing = false;
              updateUI();
              renderModelDropdownList();
              updateModelSelectorLabel();
            } else {
              updateBadge(false, testRes?.error || 'Connection failed');
              if (feedback) {
                feedback.textContent = `Could not connect: ${testRes?.error || 'Verification failed. Please check key/URL.'}`;
                feedback.style.color = '#f87171';
                feedback.classList.remove('hidden');
              }
            }
          } else {
            // Remove key / URL
            if (window.UltronMultiProviderHub) {
              if (isCustom) {
                window.UltronMultiProviderHub.setCustomEndpointUrl('');
                window.UltronMultiProviderHub.setStoredApiKey('custom', '');
              } else {
                window.UltronMultiProviderHub.setStoredApiKey(providerId, '');
              }
            }
            if (window.ultronAPI && typeof window.ultronAPI.saveProviderKeys === 'function') {
              const patch = {};
              if (isCustom) patch.customUrl = '';
              else patch[providerId] = '';
              await window.ultronAPI.saveProviderKeys(patch).catch(() => {});
            }
            isEditing = false;
            updateBadge(false);
            updateUI();
            if (feedback) feedback.classList.add('hidden');
            renderModelDropdownList();
            updateModelSelectorLabel();
          }
        });
      }

      updateUI();
    }

    setupProviderCard('openai');
    setupProviderCard('anthropic');
    setupProviderCard('deepseek');
    setupProviderCard('groq');
    setupProviderCard('custom', {
      isCustom: true,
      inputId: 'input-custom-endpoint-url',
      toggleBtnId: 'btn-toggle-custom-endpoint-input',
      btnTextId: 'custom-endpoint-btn-text',
      containerId: 'custom-endpoint-input-container',
      saveBtnId: 'btn-save-custom-endpoint',
      cancelBtnId: 'btn-cancel-custom-endpoint',
      feedbackId: 'custom-endpoint-feedback',
      badgeId: 'custom-status-badge'
    });
  }

  // 3. Local Vector RAG Knowledge Base UI Handlers
  async function initRagUI() {
    if (!window.ultronAPI || !window.ultronAPI.ragGetStats) return;

    // Auto-learn toggle (default ON so zero-setup users get it for free)
    const autoToggle = document.getElementById('rag-auto-toggle');
    if (autoToggle) {
      autoToggle.checked = isRagAutoEnabled();
      autoToggle.addEventListener('change', () => {
        try { localStorage.setItem('ultron-rag-auto', autoToggle.checked ? '1' : '0'); } catch (e) {}
      });
    }

    // Throttled background refresh (every 6h) keeps auto-sources fresh with no user action.
    try {
      const lastRefresh = parseInt(localStorage.getItem('ultron-rag-last-refresh') || '0', 10);
      if (isRagAutoEnabled() && Date.now() - lastRefresh > 6 * 3600 * 1000) {
        setTimeout(async () => {
          try {
            const stats = await window.ultronAPI.ragGetStats();
            if (stats && (stats.totalSources || 0) > 0) await window.ultronAPI.ragReindex();
            localStorage.setItem('ultron-rag-last-refresh', String(Date.now()));
          } catch (e) {}
        }, 8000);
      }
    } catch (e) {}

    async function loadRagStats() {
      try {
        const stats = await window.ultronAPI.ragGetStats();
        if (!stats) return;

        const statSources = document.getElementById('rag-stat-sources');
        const statChunks = document.getElementById('rag-stat-chunks');
        const listEl = document.getElementById('rag-sources-list');

        if (statSources) statSources.textContent = stats.totalSources || 0;
        if (statChunks) statChunks.textContent = stats.totalChunks || 0;

        if (listEl) {
          if (!stats.sources || stats.sources.length === 0) {
            listEl.innerHTML = `
              <div style="padding: 16px; text-align: center; color: #6b7280; font-size: 13px; background: rgba(255, 255, 255, 0.02); border-radius: 8px; border: 1px dashed var(--border-color);">
                Nothing indexed yet. With Auto-learn on, projects you open and files Ultron works on appear here automatically — or click "Add Folder" to add any folder.
              </div>
            `;
          } else {
            listEl.innerHTML = '';
            stats.sources.forEach(src => {
              const row = document.createElement('div');
              row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); border-radius: 8px; font-size: 13px;';
              row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 10px; overflow: hidden;">
                  <span style="font-size: 16px;">📁</span>
                  <div style="overflow: hidden;">
                    <div style="font-weight: 600; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${src.name || src.path}${src.auto ? ' <span style="font-size: 9px; font-weight: 700; color: #60a5fa; background: rgba(59, 130, 246, 0.15); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 999px; padding: 1px 6px; vertical-align: middle;">Auto</span>' : ''}</div>
                    <div style="font-size: 11px; color: #a1a1aa; margin-top: 2px;">${src.fileCount || 0} files • ${src.chunkCount || 0} vector chunks</div>
                  </div>
                </div>
                <button type="button" class="btn-rag-remove" style="background: transparent; border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 6px; padding: 4px 10px; font-size: 11px; cursor: pointer;">Remove</button>
              `;
              const btnRemove = row.querySelector('.btn-rag-remove');
              if (btnRemove) {
                btnRemove.addEventListener('click', async () => {
                  await window.ultronAPI.ragRemoveSource(src.path);
                  loadRagStats();
                });
              }
              listEl.appendChild(row);
            });
          }
        }
      } catch (err) {
        console.warn('[rag-ui] error loading stats:', err.message);
      }
    }

    const btnAddFolder = document.getElementById('btn-rag-add-folder');
    if (btnAddFolder) {
      btnAddFolder.addEventListener('click', async () => {
        if (window.ultronAPI.selectDirectory) {
          const selected = await window.ultronAPI.selectDirectory();
          if (selected) {
            const addRes = await window.ultronAPI.ragAddSources([selected]);
            if (addRes && addRes.success) {
              loadRagStats();
            }
          }
        }
      });
    }

    const btnReindex = document.getElementById('btn-rag-reindex');
    const progressContainer = document.getElementById('rag-progress-container');
    const progressBar = document.getElementById('rag-progress-bar');
    const progressStats = document.getElementById('rag-progress-stats');

    if (btnReindex) {
      btnReindex.addEventListener('click', async () => {
        if (progressContainer) progressContainer.classList.remove('hidden');
        if (progressBar) progressBar.style.width = '30%';
        btnReindex.textContent = 'Indexing…';

        const res = await window.ultronAPI.ragReindex();
        if (progressBar) progressBar.style.width = '100%';
        if (progressStats) progressStats.textContent = `${res.totalFiles || 0} files (${res.totalChunks || 0} chunks)`;

        setTimeout(() => {
          if (progressContainer) progressContainer.classList.add('hidden');
          btnReindex.textContent = 'Re-index All';
          loadRagStats();
        }, 1200);
      });
    }

    const btnClear = document.getElementById('btn-rag-clear');
    if (btnClear) {
      btnClear.addEventListener('click', async () => {
        if (confirm('Clear all indexed knowledge from the local vector database?')) {
          await window.ultronAPI.ragClear();
          loadRagStats();
        }
      });
    }

    const inputTestQuery = document.getElementById('input-rag-test-query');
    const btnTestSearch = document.getElementById('btn-rag-test-search');
    const resultsContainer = document.getElementById('rag-test-results');

    if (btnTestSearch && inputTestQuery) {
      btnTestSearch.addEventListener('click', async () => {
        const q = inputTestQuery.value.trim();
        if (!q) return;
        btnTestSearch.textContent = 'Searching…';
        const res = await window.ultronAPI.ragSearch({ query: q, topK: 4 });
        btnTestSearch.textContent = 'Search Index';

        if (resultsContainer) {
          resultsContainer.innerHTML = '';
          if (!res || !res.results || res.results.length === 0) {
            resultsContainer.innerHTML = '<div style="font-size: 12px; color: #a1a1aa; padding: 8px;">No matching vector chunks found.</div>';
          } else {
            res.results.forEach((r, idx) => {
              const card = document.createElement('div');
              card.style.cssText = 'background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; font-size: 12px;';
              card.innerHTML = `
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span style="font-weight: 600; color: #60a5fa;">#${idx + 1} ${r.fileName}</span>
                  <span style="color: #34d399; font-weight: 600;">Match: ${(r.score * 100).toFixed(1)}%</span>
                </div>
                <div style="color: #d1d5db; line-height: 1.4; font-family: 'JetBrains Mono', monospace; font-size: 11px; white-space: pre-wrap;">${escapeHtml(r.snippet)}</div>
              `;
              resultsContainer.appendChild(card);
            });
          }
        }
      });
    }

    // Refresh when knowledge tab opens
    document.querySelector('.settings-tab-btn[data-tab="knowledge"]')?.addEventListener('click', loadRagStats);
    loadRagStats();
  }

  // 4. Desktop Sync & Mobile Companion UI Handlers
  async function initDesktopSyncUI() {
    if (!window.ultronAPI || !window.ultronAPI.getDesktopSyncInfo) return;

    async function loadSyncStats() {
      try {
        const info = await window.ultronAPI.getDesktopSyncInfo();
        if (!info) return;

        const idEl = document.getElementById('sync-desktop-id');
        const lanEl = document.getElementById('sync-lan-endpoint');
        const devicesContainer = document.getElementById('sync-paired-devices-container');

        if (idEl && info.syncId) idEl.textContent = info.syncId;
        if (lanEl && Array.isArray(info.addresses)) {
          lanEl.textContent = `LAN IP: ${info.addresses.join(', ') || '127.0.0.1'} : ${info.port || 49200}`;
        }

        const statusBadge = document.getElementById('sync-status-badge');
        const activeDevices = info.activeDevices || [];
        if (statusBadge) {
          if (activeDevices.length > 0) {
            statusBadge.textContent = '● Paired';
            statusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
            statusBadge.style.color = '#34d399';
            statusBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
          } else {
            statusBadge.textContent = '● Disconnected';
            statusBadge.style.background = '#27191b';
            statusBadge.style.color = '#f87171';
            statusBadge.style.borderColor = '#5a1c1e';
          }
        }

        if (devicesContainer) {
          if (activeDevices.length === 0) {
            devicesContainer.innerHTML = `
              <div class="sync-empty-state-card">
                <div class="sync-empty-svg-wrapper">
                  <img class="sync-empty-illustration sync-animated-devices" src="../../Assets/computer-phone-connection.svg" alt="Device Connection" />
                </div>
                <h6 class="sync-empty-title">No mobile devices paired yet</h6>
                <p class="sync-empty-desc">Click “Generate Pair Code” and enter the code in your mobile app to connect your device.</p>
              </div>
            `;
          } else {
            devicesContainer.innerHTML = '';
            activeDevices.forEach(d => {
              const devName = d.deviceName || 'Ultron Mobile Companion';
              const brandName = 'Android';
              const logoSrc = '../../Assets/Brand-Assets/android-logo.png';

              const row = document.createElement('div');
              row.className = 'paired-mobile-device-card';
              row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: rgba(255, 255, 255, 0.025); border: 1px solid var(--border-color); border-radius: 10px; font-size: 13px; transition: border-color 0.2s ease;';
              row.innerHTML = `
                <div style="display: flex; align-items: center; gap: 14px;">
                  <div style="display: flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex-shrink: 0; padding: 0; background: transparent;">
                    <img src="${logoSrc}" alt="${brandName}" style="width: 24px; height: 24px; object-fit: contain; display: block;" />
                  </div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 600; color: #ffffff; font-size: 13.5px;">${escapeHtml(devName)}</span>
                      <span style="font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 4px; background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3);">${brandName}</span>
                    </div>
                    <div style="font-size: 11px; color: #a1a1aa; margin-top: 3px;">Paired: ${new Date(d.createdAt || Date.now()).toLocaleDateString()}</div>
                  </div>
                </div>
                <button type="button" class="btn-sync-revoke" style="background: #241416; border: 1px solid #5a1c1e; color: #f87171; border-radius: 6px; padding: 5px 14px; font-size: 11.5px; font-weight: 600; cursor: pointer; transition: all 0.2s ease;">Unpair</button>
              `;
              const btnRevoke = row.querySelector('.btn-sync-revoke');
              if (btnRevoke) {
                btnRevoke.addEventListener('click', async () => {
                  await window.ultronAPI.revokeMobilePairedDevice(d.id || d.tokenPrefix);
                  loadSyncStats();
                });
              }
              devicesContainer.appendChild(row);
            });
          }

          if (info && info.previousDevices && info.previousDevices.length > 0) {
            const prevHeader = document.createElement('div');
            prevHeader.style.cssText = 'margin-top: 18px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;';
            prevHeader.innerHTML = `
              <span style="font-size: 11px; font-weight: 600; color: #a1a1aa; text-transform: uppercase; letter-spacing: 0.04em;">Previously Connected Devices</span>
              <button type="button" class="btn-clear-prev-sync" style="background: transparent; border: none; color: #71717a; font-size: 11px; cursor: pointer; text-decoration: underline;">Clear History</button>
            `;
            const btnClearPrev = prevHeader.querySelector('.btn-clear-prev-sync');
            if (btnClearPrev) {
              btnClearPrev.addEventListener('click', async () => {
                await window.ultronAPI.clearPreviousMobileDevices();
                loadSyncStats();
              });
            }
            devicesContainer.appendChild(prevHeader);

            info.previousDevices.forEach(pd => {
              const brandName = 'Android';
              const logoSrc = '../../Assets/Brand-Assets/android-logo.png';
              const prevRow = document.createElement('div');
              prevRow.className = 'paired-mobile-device-card previous-device';
              prevRow.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: rgba(255, 255, 255, 0.015); border: 1px dashed rgba(255, 255, 255, 0.1); border-radius: 10px; font-size: 12.5px; margin-bottom: 6px; opacity: 0.8;';
              prevRow.innerHTML = `
                <div style="display: flex; align-items: center; gap: 12px;">
                  <div style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; flex-shrink: 0; background: transparent;">
                    <img src="${logoSrc}" alt="${brandName}" style="width: 20px; height: 20px; object-fit: contain; display: block; opacity: 0.7;" />
                  </div>
                  <div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 500; color: #e4e4e7; font-size: 12.5px;">${escapeHtml(pd.deviceName || 'Mobile Device')}</span>
                      <span style="font-size: 9.5px; font-weight: 500; padding: 1px 5px; border-radius: 4px; background: rgba(255, 255, 255, 0.06); color: #a1a1aa;">Disconnected</span>
                    </div>
                    <div style="font-size: 10.5px; color: #71717a; margin-top: 2px;">Last paired: ${new Date(pd.lastConnectedAt || Date.now()).toLocaleDateString()}</div>
                  </div>
                </div>
                <span style="font-size: 11px; color: #71717a;">Unpaired</span>
              `;
              devicesContainer.appendChild(prevRow);
            });
          }
        }
      } catch (err) {
        console.warn('[sync-ui] error loading info:', err.message);
      }
    }

    const btnGenPair = document.getElementById('btn-generate-pair-code');
    const pairBanner = document.getElementById('sync-pair-code-banner');
    const pairCodeDisplay = document.getElementById('sync-pair-code-display');
    const pairTimer = document.getElementById('sync-pair-code-timer');

    let _pairCountdown = null;

    if (btnGenPair) {
      btnGenPair.addEventListener('click', async () => {
        btnGenPair.textContent = 'Generating…';
        const res = await window.ultronAPI.createMobilePairCode();
        btnGenPair.textContent = 'Generate Pair Code';

        if (res && res.success && res.code) {
          if (pairBanner) pairBanner.classList.remove('hidden');
          if (pairCodeDisplay) pairCodeDisplay.textContent = res.code;

          let remaining = res.expiresIn || 60;
          if (pairTimer) pairTimer.textContent = `Code expires in ${remaining}s`;

          if (_pairCountdown) clearInterval(_pairCountdown);
          _pairCountdown = setInterval(() => {
            remaining -= 1;
            if (pairTimer) pairTimer.textContent = remaining > 0 ? `Code expires in ${remaining}s` : 'Code expired';
            if (remaining <= 0) {
              clearInterval(_pairCountdown);
              if (pairBanner) pairBanner.classList.add('hidden');
            }
          }, 1000);
        }
      });
    }

    const btnRefreshSync = document.getElementById('btn-refresh-sync-stats');
    const btnRefreshPaired = document.getElementById('btn-refresh-paired-devices');
    const handleManualRefresh = async (btn) => {
      if (btn) {
        btn.style.transform = 'rotate(180deg)';
        btn.style.opacity = '0.6';
      }
      await loadSyncStats();
      if (btn) {
        setTimeout(() => {
          btn.style.transform = 'rotate(0deg)';
          btn.style.opacity = '1';
        }, 300);
      }
    };
    if (btnRefreshSync) btnRefreshSync.addEventListener('click', () => handleManualRefresh(btnRefreshSync));
    if (btnRefreshPaired) btnRefreshPaired.addEventListener('click', () => handleManualRefresh(btnRefreshPaired));

    if (window.ultronAPI.onMobilePairComplete) {
      window.ultronAPI.onMobilePairComplete(() => {
        const modal = document.getElementById('mobile-pair-modal');
        if (modal) modal.classList.add('hidden');
        loadSyncStats();
      });
    }

    if (window.ultronAPI.onMobilePairedDevicesUpdated) {
      window.ultronAPI.onMobilePairedDevicesUpdated(loadSyncStats);
    }

    document.querySelector('.settings-tab-btn[data-tab="sync"]')?.addEventListener('click', loadSyncStats);
    loadSyncStats();

    // Auto-refresh sync state every 3.5s if settings view is open
    setInterval(() => {
      const syncPane = document.getElementById('settings-sync-pane') || document.querySelector('.settings-tab-content[data-tab="sync"]');
      const settingsModal = document.getElementById('settings-modal');
      const isVisible = (!settingsModal || !settingsModal.classList.contains('hidden')) && (!syncPane || !syncPane.classList.contains('hidden'));
      if (isVisible) {
        loadSyncStats();
      }
    }, 3500);
  }

  // 5. Initialize all subsystems on DOM ready
  initMultiProviderUI();
  initRagUI();
  initDesktopSyncUI();
})();

// ==========================================================================
// RELEASE NOTES & FEEDBACK CONTROLLER (BETA v1.0.0)
// ==========================================================================
(function initReleaseNotesAndFeedback() {
  const RELEASE_NOTES_KEY = 'ultron-release-notes-beta1-seen';

  function showReleaseNotesModal() {
    const modal = document.getElementById('release-notes-modal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  function hideReleaseNotesModal() {
    const modal = document.getElementById('release-notes-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  const btnClose = document.getElementById('btn-release-notes-close');
  const btnDismiss = document.getElementById('btn-release-notes-dismiss');
  const btnOpen = document.getElementById('btn-open-release-notes');
  const modal = document.getElementById('release-notes-modal');

  const markSeenAndClose = () => {
    try {
      localStorage.setItem(RELEASE_NOTES_KEY, 'true');
    } catch (e) {}
    hideReleaseNotesModal();
  };

  if (btnClose) btnClose.addEventListener('click', markSeenAndClose);
  if (btnDismiss) btnDismiss.addEventListener('click', markSeenAndClose);
  if (btnOpen) {
    btnOpen.addEventListener('click', (e) => {
      e.preventDefault();
      showReleaseNotesModal();
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        markSeenAndClose();
      }
    });
  }

  // First-launch check: If this is the user's first launch after install/setup, show the release notes popup once
  setTimeout(() => {
    try {
      const seen = localStorage.getItem(RELEASE_NOTES_KEY);
      if (!seen) {
        showReleaseNotesModal();
      }
    } catch (e) {}
  }, 1200);
})();



