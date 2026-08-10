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

const LOCAL_MODEL_FALLBACK_ORDER = [
  'phi3',
  'llama3.2:3b',
  'gemma2:2b',
  'qwen2.5:3b',
  'mistral',
  'llama3',
  'qwen2.5',
  'tinyllama',
  'llama3.2:1b'
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

function selectBestInstalledLocalModel(excludedModels = []) {
  const excluded = new Set(excludedModels.map(name => normalizeModelName(name).toLowerCase()).filter(Boolean));
  return (installedModelsList || [])
    .map(model => ({
      name: normalizeModelName(model),
      size: typeof model === 'object' && model ? model.size : 0
    }))
    .filter(model => model.name && !excluded.has(model.name.toLowerCase()))
    .sort((a, b) => {
      const rankDiff = getModelFallbackRank(a.name) - getModelFallbackRank(b.name);
      if (rankDiff !== 0) return rankDiff;
      return (a.size || 0) - (b.size || 0);
    })[0]?.name || '';
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

const TASK_ICON_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" width="9" height="9"><polyline points="20 6 9 17 4 12"></polyline></svg>';

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

// Cursor-style transcript: muted one-line entries, no boxes or badges
function renderActivityFeedHtml(stepsList) {
  if (!stepsList || stepsList.length === 0) return '';

  const stepsHtml = stepsList.map((step, index) => {
    const typeStr = String(step.type || '').toUpperCase();
    const stateClass = typeStr === 'ERROR' ? ' line-error' : (typeStr === 'SUCCESS' ? ' line-success' : '');
    const newestClass = index === stepsList.length - 1 ? ' line-new' : '';
    const thumbHtml = step.thumbnail
      ? `<img class="agent-line-thumb" src="${step.thumbnail}" alt="screenshot" />`
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
      </div>
    `;
  }).join('');

  return `<div class="agent-progress-feed">${stepsHtml}</div>`;
}

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
  return /cudaMalloc failed|out[-\s]?of[-\s]?memory|not enough memory|memory limit|allocate compute|requires more (system )?memory|failed to allocate|alloc(?:ate)?[_\s-]*(?:tensor|buffer)|cpu buffer|ggml_assert\(buffer\)|projector cpu offload|server startup failed|exit status 0xc0000409|stack-based buffer/i.test(detail || '');
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

function getOllamaGpuOptions(sysEnv = {}, modelName = activeModel) {
  // No dedicated GPU (e.g. Intel iGPU): force CPU + system RAM so Ollama never
  // attempts a VRAM allocation that fails mid-task.
  if (!hasDedicatedGpuAvailable(sysEnv)) return { num_gpu: 0 };

  const dedicatedGpu = sysEnv.dedicatedGpu || sysEnv.hardware?.dedicatedGpu || {};
  const vramGB = Number(dedicatedGpu.vramGB || 0);
  const isVisionModel = modelSupportsVision(modelName);

  // A 4 GB RTX cannot hold llava's single ~4.03 GB full-offload allocation.
  // Split vision layers across RTX VRAM and host RAM instead. Empirically,
  // 16 layers is the stable balance for a 4 GB RTX 2050.
  if (isVisionModel && vramGB > 0 && vramGB <= 4.5) return { num_gpu: 16 };
  if (isVisionModel && vramGB > 4.5 && vramGB <= 6.5) return { num_gpu: 24 };

  // Larger-VRAM cards can use full layer offload. Allocation failures are
  // handled below with model unloading and a compact-context retry.
  return { num_gpu: 999 };
}

function buildAgentPromptContext(sysEnv, realtime, userName, memorySnippet = '', hasVisualContext = false) {
  const drivesDesc = (sysEnv.drives || []).map(d => `${d.letter} (${d.description || 'Disk'}, ${d.totalGB || '?'}GB total, ${d.freeGB || '?'}GB free)`).join(', ') || 'C:';
  return {
    userName,
    sysEnv,
    realtime,
    drivesDesc,
    memorySnippet,
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
  activitySteps.push({ type: category, label, isProgress: true });
  return label;
}

const INTERACTIVE_APP_ACTIONS = new Set(['OPEN_APP', 'FOCUS_APP', 'OPEN_URL', 'OPEN_FILE', 'TYPE_TEXT', 'HOTKEY', 'CLICK', 'DOUBLE_CLICK', 'SCROLL']);

// Screenshots only help when the active model can actually see them
function canUseScreenAnalysis() {
  return isScreenCaptureEnabled() && modelSupportsVision(activeModel);
}

function shouldContinueAgentLoopAfterTool(toolCall) {
  if (!toolCall) return false;
  if (toolCall.type === 'CAPTURE_SCREEN') return true;
  if (toolCall.type === 'APP_ACTION') {
    if (toolCall.action === 'WAIT' || toolCall.action === 'LIST_APPS') return true;
    if (['CLICK', 'DOUBLE_CLICK', 'SCROLL'].includes(toolCall.action)) {
      return isScreenCaptureEnabled();
    }
    return INTERACTIVE_APP_ACTIONS.has(toolCall.action) && isScreenCaptureEnabled();
  }
  if (toolCall.type === 'WRITE_FILE' || toolCall.type === 'READ_FILE') {
    return isScreenCaptureEnabled();
  }
  return false;
}

function getExplicitTaskRequirements(userPrompt) {
  const prompt = String(userPrompt || '');
  const opensApp = /\b(open|launch|start|focus|switch to)\b/i.test(prompt);
  return {
    needsTextEntry: opensApp && /\b(type|write|enter|paste|fill)\b/i.test(prompt),
    needsSave: /\b(save|save as)\b/i.test(prompt)
  };
}

function hasUnfinishedExplicitTask(userPrompt, executedActions = []) {
  const requirements = getExplicitTaskRequirements(userPrompt);
  const actions = new Set(executedActions.map(action => String(action || '').toUpperCase()));
  if (requirements.needsTextEntry && !actions.has('TYPE_TEXT')) return true;
  if (requirements.needsSave && !actions.has('HOTKEY')) return true;
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
    tasks.push({ action: 'TYPE_TEXT', text: 'Write the requested content', completed: false, status: 'pending' });
  }
  if (requirements.needsSave && !tasks.some(task => task.action === 'HOTKEY')) {
    tasks.push({ action: 'HOTKEY', text: 'Save the changes', completed: false, status: 'pending' });
  }
  return tasks;
}

function selectBestVisionModel() {
  if (geminiConnectionState === 'connected' && ONLINE_GEMINI_MODELS.length) {
    return ONLINE_GEMINI_MODELS.find(model => model.name.includes('flash'))?.name
      || ONLINE_GEMINI_MODELS[0].name;
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
    text.includes('agent-final-response')
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

// Compose the final agent chat message: the work transcript collapses into a
// "Worked for Xs" summary (Cursor-style), followed by the actual answer.
// Widgets stay raw HTML; the answer is converted from Markdown up-front so the
// mix never hits the markdown parser again.
function composeAgentFinalContent(agentSubgoals, activitySteps, finalResponse, durationMs = 0) {
  const widgetsHtml = collapseWidgetWhitespace(`${renderTaskWidgetHtml(agentSubgoals)}${renderActivityFeedHtml(activitySteps)}`);
  let responseHtml = '';

  if (finalResponse && typeof finalResponse === 'string') {
    if (isRichResultMarkup(finalResponse) || isAgentWidgetMarkup(finalResponse)) {
      responseHtml = finalResponse;
    } else {
      try {
        responseHtml = window.ultronAPI.parseMarkdown(finalResponse);
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
  if (isThinkingMarkup(text) || isRichResultMarkup(text) || isAgentWidgetMarkup(text)) {
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

  if (!fullText || fullText.length < 10 || isThinkingMarkup(fullText) || isRichResultMarkup(fullText) || isAgentWidgetMarkup(fullText) || options.instant) {
    renderMessageContent(contentElement, fullText);
    formatCodeBlocks(contentElement);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    if (actionsDiv && !isThinkingMarkup(fullText)) {
      actionsDiv.style.display = 'flex';
      if (btnCopy) {
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
      navigator.clipboard.writeText(extractPlainTextFromMessage(text) || text);
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
  } catch (err) {}

  // Fallback check via system profiler / installed models query
  try {
    const res = await window.ultronAPI.profileSystem();
    if (res && res.success && Array.isArray(res.installedModels) && res.installedModels.length > 0) {
      installedModelsList = res.installedModels;
      return { connected: true };
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

async function checkOllamaStartup() {
  logTrace('Checking Ollama connection status...', 'system');
  const conn = await checkOllamaConnection();
  if (conn.connected) {
    logTrace('Ollama connection verified on boot.', 'system');
    hideOllamaBanner();
    await runOnboardingProfiler();
    renderModelDropdownList();
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
          renderModelDropdownList();
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
}

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

function getLearnedMemorySnippet() {
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.getTaskMemorySnippet === 'function') {
    const snippet = window.UltronAgentMemory.getTaskMemorySnippet(5);
    return snippet ? `\n\nSELF-LEARNING MEMORY (your past task outcomes for reference):\n${snippet}` : '';
  }
  return _learnedTaskMemory.length > 0
    ? `\n\nSELF-LEARNING MEMORY (your past task outcomes for reference):\n${_learnedTaskMemory.slice(-5).map((m, i) => `${i + 1}. ${m}`).join('\n')}`
    : '';
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

// Auto-detect device location & system environment on software boot
(async function autoDetectSystemLocationOnBoot() {
  try {
    const env = await getSystemContext(true);
    const realtime = buildRealtimeContext(env);
    logTrace(`System & location auto-detected on startup: "${realtime.locationLabel}" (Timezone: ${realtime.timeZone})`, 'system');
  } catch (err) {
    console.warn('[STARTUP LOG] Automatic location detection on startup encountered non-fatal notice:', err.message);
  }
})();

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
  const savedLocation = localStorage.getItem('ultron-user-location');
  const locationLabel = savedLocation ? savedLocation : autoLocation;

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
    .replace(/^(please\s+)?(can\s+you\s+|could\s+you\s+)?(search|google|look\s+up|find\s+out|find|check)\s+(the\s+)?(web\s+)?(online\s+)?(for\s+)?/i, '')
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

async function buildWebSearchQuery(userPrompt) {
  const fallback = fallbackSearchQueryFromPrompt(userPrompt);

  const isMetaGarbage = (str) => /\b(based on|user prompt|we can generate|search query|keywords:|live information|snippet available|ai prompt|docsbot|prompt generation)\b/i.test(str);

  // If fallback is already a clean topic query without meta words, return fallback directly!
  if (fallback && fallback.split(' ').length <= 8 && !isMetaGarbage(fallback)) {
    return fallback;
  }

  const sysEnv = await getSystemContext();
  const realtime = buildRealtimeContext(sysEnv);
  const locationHint = realtime.locationLabel && realtime.locationLabel !== 'Unknown location' ? realtime.locationLabel : '';

  const queryPlannerSystemPrompt = `You are a Search Engine Query Keyword Generator.
Your job is to convert raw conversational user prompts into 2 to 5 highly relevant search keywords.
STRICT RULES:
- Output ONLY 2 to 5 keywords.
- NEVER include conversational fillers, instructions, or meta-commentary.
- Focus ONLY on the core intent and specific subject entities.`;

  const queryPlannerUserPrompt = `Prompt: "${userPrompt}"\nKeywords:`;

  try {
    const rawAiOutput = await queryOfflineLLM(queryPlannerUserPrompt, [], 'search', queryPlannerSystemPrompt);
    if (rawAiOutput && !isMetaGarbage(rawAiOutput)) {
      let planned = rawAiOutput.replace(/```[^`]*```/g, '').replace(/["'`]/g, '').trim();
      planned = fallbackSearchQueryFromPrompt(planned);

      if (planned && planned.length >= 3) {
        logTrace(`AI Search Query Reconstructed: "${planned}"`, 'system');
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

// Google Gemini API Online Model Provider
async function queryGeminiAPI(prompt, systemPrompt, modelName, apiKey, extraMessages = [], imagePayloads = []) {
  let officialModel = modelName;
  if (!officialModel || !officialModel.startsWith('gemini')) {
    officialModel = ONLINE_GEMINI_MODELS[0]?.name;
  }
  if (!officialModel) {
    const connection = await connectGemini(apiKey);
    if (!connection.success) throw new Error(connection.error);
    officialModel = ONLINE_GEMINI_MODELS[0]?.name;
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
      body: JSON.stringify(payload)
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
    if (err.message && (err.message.includes('no longer available') || err.message.includes('404') || err.message.includes('not found') || err.message.includes('not supported'))) {
      const fallback = ONLINE_GEMINI_MODELS.find(model => model.name !== officialModel);
      if (fallback) {
        logTrace(`Gemini model "${officialModel}" unavailable. Retrying with ${fallback.name}...`, 'system');
        activeModel = fallback.name;
        updateModelSelectorLabel();
        return await makeCall(fallback.name);
      }
    }
    throw new Error(`Google Gemini API (${officialModel}): ${err.message}`);
  }
}

// Offline inference helper querying local servers or Online Cloud APIs
async function queryOfflineLLM(prompt, extraMessages = [], intentOverride = null, customSystemPromptOverride = null, imagePayloads = []) {
  // Direct Ollama / Gemini API generate/chat loop.
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

    const userName = userNameEl ? userNameEl.textContent.trim() : 'Vedant Wankhade';
    const sysEnv = await getSystemContext();
    const realtime = buildRealtimeContext(sysEnv);
    const intent = intentOverride || classifyIntent(prompt);
    const isShortQuery = prompt.length < 60 && !/\b(explain|detail|step by step|comprehensive|essay|code|script|list all)\b/i.test(prompt);

    // Build drives description
    const drivesDesc = (sysEnv.drives || []).map(d => `${d.letter} (${d.description || 'Disk'}, ${d.totalGB || '?'}GB total, ${d.freeGB || '?'}GB free)`).join(', ') || 'C:';

    const memorySnippet = getLearnedMemorySnippet();

    const agentPromptContext = buildAgentPromptContext(sysEnv, realtime, userName, memorySnippet, Array.isArray(imagePayloads) && imagePayloads.length > 0);
    const agentSystemPrompt = intent === 'action' ? resolveAgentSystemPrompt(agentPromptContext) : null;
    const visionImages = Array.isArray(imagePayloads) ? imagePayloads.filter(p => p && p.data) : [];
    const canUseVision = visionImages.length > 0 && modelSupportsVision(activeModel);

    const systemPrompt = customSystemPromptOverride || agentSystemPrompt || (intent === 'conversation'
      ? `You are Ultron, a warm, intelligent, articulate AI assistant created to help ${userName}. Respond directly to ${userName}'s prompt naturally, concisely, and conversationally in the first person.`
      : `You are Ultron, a warm, highly intelligent, articulate, and engaging AI assistant in a direct 1-on-1 personal conversation with ${userName}.

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
    if (visionImages.length > 0 && !canUseVision && !activeModel.startsWith('gemini')) {
      finalUserPrompt = `${prompt}\n\n[Note: Desktop screenshot(s) were captured for this step, but the active model "${activeModel}" does not support vision. Switch to a vision model (e.g. llava, gemini) to analyze screen content.]`;
    }
    if (/\b(table|tabular|difference between|vs|comparison)\b/i.test(prompt) && !/\b(html\s+code|css\s+code|write\s+code)\b/i.test(prompt)) {
      finalUserPrompt = `${prompt}\n\n[Formatting Instruction: Respond using standard Markdown table syntax (| Header 1 | Header 2 |). DO NOT write HTML/CSS code.]`;
    }

    // Route Online Google Gemini models if selected
    if (activeModel && activeModel.startsWith('gemini')) {
      const apiKey = localStorage.getItem('ultron-gemini-api-key') || '';
      if (!apiKey || !apiKey.trim()) {
        return `⚠️ **Google Gemini API Key Required**\n\nYou selected **${activeModel}**, but no Gemini API key is configured.\n\n**To connect Google Gemini:**\n1. Open **Settings > Models**.\n2. Paste your free Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey).\n3. Click **Save Key**.`;
      }
      try {
        const geminiOutput = await queryGeminiAPI(finalUserPrompt, systemPrompt, activeModel, apiKey, extraMessages, visionImages);
        return geminiOutput;
      } catch (err) {
        logTrace(`Gemini API execution error: ${err.message}`, 'system');
        return `⚠️ **Google Gemini API Error**\n\n${err.message}\n\nPlease verify your API key in **Settings > Models** or switch models in the top dropdown selector.`;
      }
    }

    if (_lastOllamaModel.toLowerCase() !== activeModel.toLowerCase()) {
      await unloadOllamaModelsExcept(activeModel);
    }
    _lastOllamaModel = activeModel;
    
    let bodyData;
    let endpoint = '/api/generate';
    const activeTemp = intent === 'conversation' ? 0.7 : 0.2;
    const gpuOptions = getOllamaGpuOptions(sysEnv, activeModel);
    if (gpuOptions.num_gpu) {
      const gpuName = sysEnv.dedicatedGpu?.model || sysEnv.hardware?.dedicatedGpu?.model || 'dedicated GPU';
      logTrace(`Dedicated GPU detected (${gpuName}). Enabling Ollama GPU layer offload for ${activeModel}.`, 'system');
    }
    
    if (memoryEnabled && currentSessionId && conversationsStore[currentSessionId]) {
      // Sliding window memory (last 10 messages for rich context)
      const recentMsgs = conversationsStore[currentSessionId].messages
        .filter(m => !isThinkingMarkup(m.text))
        .slice(-10);
      
      // Gemma 2 models in Ollama do not support 'system' role in chat messages array
      const isGemma = activeModel && activeModel.toLowerCase().includes('gemma');
      const chatMessages = isGemma ? [] : [{ role: 'system', content: systemPrompt }];
      
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
      
      const maxTokens = intent === 'conversation' ? 512 : 768;
      const ctxTokens = canUseVision ? 1536 : 2048;

      bodyData = {
        model: activeModel,
        messages: chatMessages,
        stream: false,
        keep_alive: '2m',
        options: {
          ...gpuOptions,
          num_ctx: ctxTokens,
          num_predict: maxTokens,
          temperature: activeTemp
        }
      };
      endpoint = '/api/chat';
    } else {
      // Memory disabled: single prompt mode
      const maxTokens = intent === 'conversation' ? 512 : 768;
      const ctxTokens = canUseVision ? 1536 : 2048;

      bodyData = {
        model: activeModel,
        prompt: finalUserPrompt,
        system: activeModel && activeModel.toLowerCase().includes('gemma') ? undefined : systemPrompt,
        stream: false,
        keep_alive: '2m',
        ...(canUseVision ? { images: visionImages.map(p => p.data) } : {}),
        options: {
          ...gpuOptions,
          num_ctx: ctxTokens,
          num_predict: maxTokens,
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
      let text = endpoint === '/api/chat' ? (data.message ? data.message.content : '') : data.response;
      
      // Filter out model disclaimer responses that deny computer access capabilities during tool action execution ONLY
      if (intent !== 'conversation' && text && (text.includes("I do not have access") || text.includes("unable to access your operating system") || text.includes("I cannot access"))) {
        logTrace("Model output disclaimer detected and suppressed.", "system");
        return ""; // Return empty string so Fallback Intent Steerer takes over
      }
      return sanitizeResponseText(text, prompt);
    } else {
      let errDetail = '';
      try {
        const errJson = await response.json();
        errDetail = errJson.error || JSON.stringify(errJson);
      } catch (e) {
        errDetail = await response.text();
      }

      // If Ollama hits GPU/system memory pressure, first release every resident
      // model and retry compactly. Dedicated-GPU systems keep GPU offload;
      // forcing CPU there can make the failure worse by exhausting system RAM.
      if (isOllamaMemoryError(errDetail)) {
        const compactGpuOptions = getOllamaGpuOptions(sysEnv, activeModel);
        logTrace(`Ollama model allocation failed. Releasing resident models and retrying ${activeModel} with compact memory settings...`, 'system');
        await unloadOllamaModelsExcept('');
        bodyData.options = bodyData.options || {};
        Object.assign(bodyData.options, compactGpuOptions);
        bodyData.options.num_ctx = 1024;
        bodyData.options.num_predict = Math.min(bodyData.options.num_predict || 512, 512);
        bodyData.keep_alive = '30s';

        try {
          const retryRes = await fetch(`http://127.0.0.1:11434${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyData)
          });

          if (retryRes.ok) {
            const retryData = await retryRes.json();
            let text = endpoint === '/api/chat' ? (retryData.message ? retryData.message.content : '') : retryData.response;
            return sanitizeResponseText(text, prompt);
          }
        } catch (retryErr) {
          logTrace(`Compact model retry failed: ${retryErr.message}`, 'error');
        }

        const fallbackModel = selectBestInstalledLocalModel([activeModel]);
        if (fallbackModel) {
          logTrace(`Compact retry did not return a response. Falling back to installed lightweight model ${fallbackModel}...`, 'system');
          await unloadOllamaModelsExcept('');
          const fallbackBodyData = {
            ...bodyData,
            model: fallbackModel,
            keep_alive: '2m',
            ...(endpoint === '/api/chat' && Array.isArray(bodyData.messages) ? {
              messages: bodyData.messages.map(message => {
                const { images, ...textMessage } = message;
                return textMessage;
              })
            } : {}),
            ...(endpoint === '/api/generate' ? {
              system: fallbackModel.toLowerCase().includes('gemma') ? undefined : systemPrompt,
              images: undefined
            } : {}),
            options: {
              ...(bodyData.options || {}),
              num_gpu: 0,
              num_ctx: 1024,
              num_predict: intent === 'conversation' ? 512 : 1024
            }
          };

          try {
            const fallbackRes = await fetch(`http://127.0.0.1:11434${endpoint}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(fallbackBodyData)
            });

            if (fallbackRes.ok) {
              const fallbackData = await fallbackRes.json();
              const text = endpoint === '/api/chat' ? (fallbackData.message ? fallbackData.message.content : '') : fallbackData.response;
              const cleaned = sanitizeResponseText(text, prompt);
              activeModel = fallbackModel;
              _lastOllamaModel = fallbackModel;
              updateModelSelectorLabel();
              syncModelAttachmentCapabilities();
              return cleaned
                ? `${cleaned}\n\n_Model note: the selected model could not load in available memory, so I continued with ${fallbackModel}._`
                : cleaned;
            }
          } catch (fallbackErr) {
            logTrace(`Installed model fallback failed: ${fallbackErr.message}`, 'error');
          }
        }
      }

      logTrace(`Local LLM response HTTP error (${response.status}): ${errDetail}`, 'error');
      if (!isOllamaMemoryError(errDetail)) {
        return `Warning: **Ollama Model Error (${activeModel})**\n\nOllama returned an error before generating a response:\n\n` + '`' + `${errDetail || 'Unknown error'}` + '`' + `\n\nTry selecting another installed model from the model dropdown, or restart Ollama and send the prompt again.`;
      }
      return `⚠️ **Ollama Memory Limit Exceeded (${activeModel})**\n\n**${activeModel}** does not fit in the memory currently available on this PC. I released inactive models and retried with compact GPU/RAM settings, but it still could not load.\n\n**Solutions:**\n1. Close memory-heavy apps and try again.\n2. Use a lighter model (` + '`ollama pull gemma2:2b`' + `, ` + '`phi3`' + `, ` + '`tinyllama:latest`' + `).\n3. Or select Google Gemini from the top model dropdown for zero-RAM cloud inference.`;
    }
  } catch (e) {
    logTrace(`Local LLM offline loop exception: ${e.message}`, 'error');
    return `⚠️ **Ollama Connection Error**\n\nCould not connect to Ollama service at ` + '`http://127.0.0.1:11434`' + `.\n\n*Make sure Ollama is running (` + '`ollama serve`' + `).*`;
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

async function discoverGeminiModels(apiKey) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('API key is empty.');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || `Google API returned HTTP ${response.status}`);
  }
  const models = (payload.models || [])
    .filter(model => {
      const name = String(model.name || '').replace(/^models\//, '');
      const methods = model.supportedGenerationMethods || [];
      return name.startsWith('gemini-')
        && methods.includes('generateContent')
        && !/(embedding|aqa|imagen|image-generation|tts|robotics)/i.test(name);
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
    })
    .sort((a, b) => {
      const score = (model) => {
        const name = model.name.toLowerCase();
        if (name.includes('flash') && name.includes('latest')) return 0;
        if (name.includes('flash')) return 1;
        if (name.includes('pro') && name.includes('latest')) return 2;
        if (name.includes('pro')) return 3;
        return 4;
      };
      return score(a) - score(b) || a.name.localeCompare(b.name);
    });
  if (!models.length) throw new Error('No Gemini models supporting generateContent are available for this key.');
  return models;
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
      activeModel = ONLINE_GEMINI_MODELS[0].name;
      updateModelSelectorLabel();
    }
    logTrace(`Gemini connected: ${ONLINE_GEMINI_MODELS.length} compatible models discovered.`, 'system');
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

function updateModelSelectorLabel() {
  if (!modelSelectorLabel) return;
  const hasGeminiKey = Boolean((localStorage.getItem('ultron-gemini-api-key') || '').trim());
  let name = activeModel;
  
  if (!hasGeminiKey && (!name || name.toLowerCase().includes('gemini'))) {
    const firstLocal = selectBestInstalledLocalModel() || 'phi3:latest';
    activeModel = firstLocal;
    name = firstLocal;
  } else if (!name) {
    name = ONLINE_GEMINI_MODELS[0]?.name || selectBestInstalledLocalModel() || 'phi3:latest';
    activeModel = name;
  }

  const isGemini = ONLINE_GEMINI_MODELS.some(m => m.name === name) || name.toLowerCase().includes('gemini');
  const logoSrc = isGemini ? '../../Assets/gemini-logo.png' : '../../Assets/ollama-logo.png';
  const filterStyle = isGemini ? '' : 'filter: brightness(0) invert(1);';

  modelSelectorLabel.style.display = 'inline-flex';
  modelSelectorLabel.style.alignItems = 'center';
  modelSelectorLabel.style.gap = '6px';

  modelSelectorLabel.innerHTML = `
    <img src="${logoSrc}" alt="Logo" style="width: 14px; height: 14px; object-fit: contain; flex-shrink: 0; display: block; margin: 0; ${filterStyle}" />
    <span style="line-height: 1; display: inline-block; margin: 0; padding: 0;">${name}</span>
  `;

  syncModelAttachmentCapabilities();
}

function renderModelDropdownList() {
  modelDropdownList.innerHTML = '';
  
  const hasGeminiKey = Boolean((localStorage.getItem('ultron-gemini-api-key') || '').trim());

  // Render only models confirmed available for this API key.
  if (hasGeminiKey && geminiConnectionState === 'connected' && ONLINE_GEMINI_MODELS.length > 0) {
    const onlineHeader = document.createElement('div');
    onlineHeader.className = 'model-dropdown-section-title';
    onlineHeader.style.cssText = 'padding: 8px 12px 4px 12px; font-size: 11px; font-weight: 600; color: #60a5fa; letter-spacing: 0.02em; text-transform: none;';
    onlineHeader.textContent = 'Online Models';
    modelDropdownList.appendChild(onlineHeader);

    ONLINE_GEMINI_MODELS.forEach(model => {
      const item = document.createElement('div');
      item.className = `model-dropdown-item${model.name === activeModel ? ' active' : ''}`;
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="../../Assets/gemini-logo.png" alt="Gemini" style="width: 16px; height: 16px; object-fit: contain;" />
          <span class="model-name-text">${model.name}</span>
        </div>
        <span class="model-badge" style="background: transparent !important; color: #ffffff !important; border: none !important; padding: 0; font-size: 11px; font-weight: 600; font-family: 'JetBrains Mono', monospace;">${model.tag}</span>
      `;
      item.addEventListener('click', async () => {
        await unloadOllamaModelsExcept('');
        activeModel = model.name;
        updateModelSelectorLabel();
        modelDropdownList.querySelectorAll('.model-dropdown-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        modelDropdown.classList.add('hidden');
        modelSelectorWrapper.classList.remove('open');
        logTrace(`Chat context model shifted to Online Model: "${activeModel}"`, 'local');
      });
      modelDropdownList.appendChild(item);
    });
  } else {
    // If activeModel is currently a Gemini model but no key exists, fallback to first local offline model
    if (activeModel && activeModel.toLowerCase().includes('gemini')) {
      const firstLocal = selectBestInstalledLocalModel() || 'phi3:latest';
      activeModel = firstLocal;
      updateModelSelectorLabel();
    }
  }

  // Render Local Ollama Models section
  const localHeader = document.createElement('div');
  localHeader.className = 'model-dropdown-section-title';
  localHeader.style.cssText = 'padding: 10px 12px 4px 12px; font-size: 11px; font-weight: 600; color: var(--text-muted); letter-spacing: 0.02em; text-transform: none; border-top: 1px solid rgba(255,255,255,0.06); margin-top: 4px;';
  localHeader.textContent = 'Offline Models';
  modelDropdownList.appendChild(localHeader);

  const map = new Map();
  (installedModelsList || []).forEach(m => map.set(m.name, m));
  const uniqueModels = Array.from(map.values());

  if (uniqueModels.length === 0) {
    const emptyItem = document.createElement('div');
    emptyItem.className = 'model-dropdown-item disabled';
    emptyItem.style.cssText = 'padding: 8px 12px; color: var(--text-muted); font-size: 12px; font-style: italic;';
    emptyItem.textContent = 'No local models downloaded yet.';
    modelDropdownList.appendChild(emptyItem);
  } else {
    uniqueModels.forEach(model => {
      const item = document.createElement('div');
      item.className = `model-dropdown-item${model.name === activeModel ? ' active' : ''}`;
      
      let badgeText = 'LOCAL';
      if (model.name.includes(':')) {
        badgeText = model.name.split(':')[1].toUpperCase();
      }

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <img src="../../Assets/ollama-logo.png" alt="Ollama" style="width: 16px; height: 16px; object-fit: contain; filter: brightness(0) invert(1);" />
          <span class="model-name-text">${model.name}</span>
        </div>
        <span class="model-badge" style="background: transparent !important; color: #ffffff !important; border: none !important; padding: 0; font-size: 11px; font-weight: 600; font-family: 'JetBrains Mono', monospace;">${badgeText}</span>
      `;
      item.addEventListener('click', async () => {
        await unloadOllamaModelsExcept(model.name);
        activeModel = model.name;
        updateModelSelectorLabel();
        modelDropdownList.querySelectorAll('.model-dropdown-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        modelDropdown.classList.add('hidden');
        modelSelectorWrapper.classList.remove('open');
        logTrace(`Chat context model shifted to Local Model: "${activeModel}"`, 'local');
      });
      modelDropdownList.appendChild(item);
    });
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
    
    // Set active model to an actually installed model from Ollama or Gemini if key exists
    const hasGeminiKey = Boolean((localStorage.getItem('ultron-gemini-api-key') || '').trim());
    const installedMatch = installedModelsList.find(m => m.name === recommendation || (m.name && m.name.split(':')[0] === recommendation.split(':')[0]));
    if (installedMatch) {
      activeModel = installedMatch.name;
    } else if (installedModelsList.length > 0) {
      activeModel = selectBestInstalledLocalModel() || installedModelsList[0].name;
    } else if (hasGeminiKey && ONLINE_GEMINI_MODELS.length) {
      activeModel = ONLINE_GEMINI_MODELS[0].name;
    } else {
      activeModel = 'phi3:latest';
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

  // Smoothly reveal full app interface after hardware & model diagnostics complete
  hideSkeletonLoader();
}

// Bind security settings selector
const SECURITY_MODE_LABELS = {
  Review: 'Review',
  Containment: 'Containment',
  Adaptive: 'Adaptive',
  Trusted: 'Trusted'
};

function updateSecurityModeUI(mode) {
  const resolved = SECURITY_MODE_LABELS[mode] ? mode : 'Adaptive';
  if (selectSecurityMode) selectSecurityMode.value = resolved;
  if (settingsDefaultSecurity) settingsDefaultSecurity.value = resolved;

  document.querySelectorAll('.plus-menu-item.mode-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === resolved);
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
modelSelectorBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = !modelDropdown.classList.contains('hidden');
  if (isOpen) {
    modelDropdown.classList.add('hidden');
    modelSelectorWrapper.classList.remove('open');
  } else {
    // Open instantly with cached model list
    renderModelDropdownList();
    modelDropdown.classList.remove('hidden');
    modelSelectorWrapper.classList.add('open');

    // Refresh Ollama models in background (non-blocking)
    window.ultronAPI.profileSystem().then(res => {
      if (res && Array.isArray(res.installedModels)) {
        installedModelsList = res.installedModels;
        renderModelDropdownList(); // silently re-render with fresh data
      }
    }).catch(() => {});
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
  playUltronSound('permission');
  ensureRightSidebarVisible();
  expandRightSidebarSection('section-security');
  logTrace(`Permission required: "${String(request.command || '').substring(0, 60)}"`, 'permission');
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
  let currentImagePayloads = [];
  
  // Include attached files in prompt if present
  if (attachedFiles.length > 0) {
    const fileSummaries = [];
    attachedFiles.forEach(f => {
      if (f.isImage && f.dataUrl) {
        const base64Data = f.dataUrl.includes(',') ? f.dataUrl.split(',')[1] : f.dataUrl;
        currentImagePayloads.push({ mimeType: f.type || 'image/png', data: base64Data });
        fileSummaries.push(`📷 Image: ${f.name} (${(f.size/1024).toFixed(1)} KB)`);
      } else if (f.textContent) {
        const ext = f.name.includes('.') ? f.name.split('.').pop().toLowerCase() : 'txt';
        prompt = prompt ? `${prompt}\n\n📄 **Attached File: ${f.name}**\n\`\`\`${ext}\n${f.textContent}\n\`\`\`` : `📄 **Attached File: ${f.name}**\n\`\`\`${ext}\n${f.textContent}\n\`\`\``;
        fileSummaries.push(`📄 File: ${f.name} (${(f.size/1024).toFixed(1)} KB)`);
      } else {
        fileSummaries.push(`📄 File: ${f.name} (${(f.size/1024).toFixed(1)} KB)`);
      }
    });

    if (!prompt && fileSummaries.length > 0) {
      prompt = `Attached files: ${fileSummaries.join(', ')}`;
    }
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
      if (!['action', 'search'].includes(intent)) {
        activeSubgoals = [];
        renderChecklist([]);
      }

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
        let response = await queryOfflineLLM(prompt, [], 'conversation', null, currentImagePayloads);
        if (!response || !response.trim()) {
          const isGemini = activeModel && activeModel.startsWith('gemini');
          if (isGemini) {
            response = `⚠️ **Google Gemini Connection Error**\n\nCould not receive a response from **${activeModel}**.\n\nPlease check your internet connection or verify your API key in **Settings > Models**.`;
          } else {
            response = `⚠️ **Local Ollama Model Connection Error**\n\nCould not connect to model **${activeModel || 'ollama'}** on ` + '`http://127.0.0.1:11434`' + `.\n\n**To Fix:**\n1. Make sure Ollama is running (` + '`ollama serve`' + `).\n2. Pull your model (` + '`ollama pull ' + (activeModel || 'tinyllama') + '`' + `).\n3. Or select Google Gemini from the top dropdown.`;
          }
        }
        response = response.replace(/\[your_name\]|\[Your Name\]|<your name>|\[Agent Name\]/gi, "Ultron");
        await typeMessageResponse(aiBubble, response);
        appendChatMessage('Ultron', response, true, { skipRender: true });

      } else {
        // Action or Search intent — run the full agentic loop
        await runAgenticLoop(prompt, aiBubble, intent, currentImagePayloads);
      }
    }
  } finally {
    setSendingState(false);
  }
}

function parseAgentToolCall(text, userPrompt = '') {
  if (text && typeof text === 'string') {
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
      case 'OPEN_FILE': return `Open file ${trim(toolCall.path || toolCall.target)}`;
      case 'TYPE_TEXT': return `Type "${trim(toolCall.text, 30)}"`;
      case 'HOTKEY': return `Press ${trim(toolCall.keys)}`;
      case 'CLICK': return `Click at (${toolCall.x}, ${toolCall.y})`;
      case 'DOUBLE_CLICK': return `Double-click at (${toolCall.x}, ${toolCall.y})`;
      case 'SCROLL': return 'Scroll the page';
      case 'WAIT': return 'Wait for the app';
      case 'LIST_APPS': return 'List installed apps';
      default: return trim(toolCall.action);
    }
  }
  switch (toolCall.type) {
    case 'APP_SEQUENCE': return 'Run app steps';
    case 'CAPTURE_SCREEN': return 'Check the screen';
    case 'EXECUTE': return `Run command: ${trim(toolCall.target, 32)}`;
    case 'WRITE_FILE': return `Write ${trim(toolCall.targetPath || toolCall.target, 36)}`;
    case 'READ_FILE': return `Read ${trim(toolCall.target, 36)}`;
    case 'LIST_DIR': return `List folder ${trim(toolCall.target, 32)}`;
    case 'SEARCH': return `Search the web: ${trim(toolCall.target, 30)}`;
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
    DOUBLE_CLICK: 'Double-clicking in',
    SCROLL: 'Scrolling in',
    WAIT: 'Waiting for'
  };
  return labels[String(toolCall && toolCall.action || '').toUpperCase()]
    || humanizeToolCallLabel(toolCall);
}

let _activeAgentApp = { name: '', icon: '' };

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
        return {
          type: 'APP_ACTION',
          action: tool,
          appName: args.appName || args.app || args.name,
          url: args.url,
          path: args.path || args.filePath,
          text: args.text,
          keys: args.keys || args.hotkey,
          ms: args.ms,
          x: args.x,
          y: args.y,
          delta: args.delta || args.amount,
          target: args.appName || args.app || args.name || args.url || args.path || args.text || args.keys || tool
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

      if (['EXECUTE', 'READ_FILE', 'LIST_DIR', 'SEARCH'].includes(tool)) {
        return { type: tool, target: args.command || args.path || args.query || args.target || '' };
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

  const appAliases = [
    ['notepad', 'Notepad'],
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
    ['cmd', 'Command Prompt']
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

  // 1. Desktop app launch/control
  if (/\b(open|launch|start|focus|switch to)\b/i.test(userPrompt)) {
    const urlMatch = userPrompt.match(/https?:\/\/[^\s]+/i);
    if (urlMatch) {
      return { type: 'APP_ACTION', action: 'OPEN_URL', url: urlMatch[0], target: urlMatch[0] };
    }

    const appName = findPromptAppName();
    if (appName) {
      if (typedText && !requiresGeneratedText) {
        return {
          type: 'APP_SEQUENCE',
          target: `${appName} then type text`,
          actions: [
            { action: 'OPEN_APP', appName, target: appName },
            { action: 'WAIT', ms: 900, target: '900ms' },
            { action: 'TYPE_TEXT', text: typedText, target: 'text input' }
          ]
        };
      }
      return { type: 'APP_ACTION', action: 'OPEN_APP', appName, target: appName };
    }
  }

  if (/\b(type|paste|enter)\b/i.test(userPrompt) && typedText) {
    return { type: 'APP_ACTION', action: 'TYPE_TEXT', text: typedText, target: 'text input' };
  }

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

function buildAgentToolPrompt(userPrompt, step, observation = '', options = {}) {
  if (window.UltronAgentPrompt && typeof window.UltronAgentPrompt.buildAgentToolExecutionPrompt === 'function') {
    return window.UltronAgentPrompt.buildAgentToolExecutionPrompt(userPrompt, step, observation, options);
  }

  return `User task:
${userPrompt}

Available tools. When an action is needed, output exactly one JSON object and nothing else:
{"tool":"OPEN_APP","args":{"appName":"Notepad"}}
{"tool":"FOCUS_APP","args":{"appName":"Google Chrome"}}
{"tool":"OPEN_URL","args":{"url":"https://example.com"}}
{"tool":"OPEN_FILE","args":{"path":"C:\\\\path\\\\file.txt"}}
{"tool":"TYPE_TEXT","args":{"text":"text to type into the currently focused app"}}
{"tool":"HOTKEY","args":{"keys":"ctrl+s"}}
{"tool":"CLICK","args":{"x":640,"y":480}}
{"tool":"DOUBLE_CLICK","args":{"x":640,"y":480}}
{"tool":"SCROLL","args":{"delta":-120}}
{"tool":"WAIT","args":{"ms":1000}}
{"tool":"READ_FILE","args":{"path":"C:\\\\path\\\\file.txt"}}
{"tool":"WRITE_FILE","args":{"path":"C:\\\\path\\\\file.txt","content":"file content"}}
{"tool":"LIST_DIR","args":{"path":"C:\\\\path"}}
{"tool":"SEARCH","args":{"query":"web search query"}}
{"tool":"EXECUTE","args":{"command":"safe command"}}${options.canCaptureScreen ? '\n{"tool":"CAPTURE_SCREEN","args":{"mode":"screen"}}' : ''}

For multi-step app work, do one step at a time unless a simple app open + type sequence is obvious.
After the task is complete, respond normally without JSON.
${observation ? `\nLatest observation:\n${observation}\n\nContinue from that observation.` : `\nThis is step ${step}. Decide the next best tool call or final answer.`}`;
}

async function runAgenticLoop(userPrompt, aiBubble, intent = 'action', imagePayloads = []) {
  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.findWorkflowByPrompt === 'function') {
    const workflow = window.UltronAgentMemory.findWorkflowByPrompt(userPrompt);
    if (workflow && workflow.steps && workflow.steps.length) {
      userPrompt = `${userPrompt}\n\n[Run workflow "${workflow.name}": ${workflow.steps.join(' then ')}]`;
    }
  }

  let steps = 0;
  const maxSteps = 8;
  const loopStartedAt = Date.now();
  let loopImagePayloads = mergeImagePayloads(imagePayloads || []);
  let hasVisualContext = loopImagePayloads.length > 0;
  const canCaptureScreen = isScreenCaptureEnabled();
  let currentPrompt = buildAgentToolPrompt(userPrompt, 1, '', { hasVisualContext, canCaptureScreen });
  let accumulatedContext = [];
  let isDone = false;
  let finalResponse = '';
  const executedAppActions = [];
  let completionNudges = 0;
  let showTaskPlan = false;

  const userNameEl = document.querySelector('.profile-detail-name');
  const userName = userNameEl ? userNameEl.textContent.trim() : 'Vedant Wankhade';
  const sysEnv = await getSystemContext();
  const realtime = buildRealtimeContext(sysEnv);
  const memorySnippet = getLearnedMemorySnippet();

  let agentSubgoals = [];
  let activitySteps = [];

  // Cursor-style first frame: think first. Do not invent or expose a task plan
  // until the model has selected its first action.
  activeSubgoals = [];
  renderChecklist([]);
  ensureRightSidebarVisible();
  renderMessageContent(aiBubble, composeAgentLiveContent(
    getAgentShimmerLineHtml('Thinking')
  ));

  if (loopImagePayloads.length > 0) pushAgentProgressStep(activitySteps, 'MEDIA');

  if (isScreenCaptureEnabled() && intent === 'action') {
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
    buildAgentPromptContext(sysEnv, realtime, userName, memorySnippet, hasVisualContext)
  );

  // If intent is 'search', immediately do a web search first
  if (intent === 'search') {
    pushAgentProgressStep(activitySteps, 'SEARCH', { query: 'strategy' });
    renderMessageContent(aiBubble, composeAgentLiveContent(
      renderTaskWidgetHtml(agentSubgoals),
      renderActivityFeedHtml(activitySteps),
      getWebSearchCardHtml('Analyzing prompt & formulating search strategy...')
    ));
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    await new Promise(resolve => setTimeout(resolve, 300));

    const searchQuery = await buildWebSearchQuery(userPrompt);

    activitySteps.push({ type: 'SEARCH', label: getAgentProgressMessage('SEARCH', { query: searchQuery }) });
    renderMessageContent(aiBubble, composeAgentLiveContent(
      renderTaskWidgetHtml(agentSubgoals),
      renderActivityFeedHtml(activitySteps),
      getWebSearchCardHtml(searchQuery)
    ));
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

    agentSubgoals.push({ text: `Web Search: "${searchQuery.substring(0, 25)}"`, completed: false, status: 'in_progress' });
    activeSubgoals = agentSubgoals.map(s => ({ text: s.text, completed: s.completed, status: s.status }));
    renderChecklist(activeSubgoals);
    
    let searchResult = null;
    try {
      const rawSearchResult = await window.ultronAPI.searchWeb(searchQuery);
      searchResult = normalizeSearchPayload(rawSearchResult, searchQuery);
      
      agentSubgoals[agentSubgoals.length - 1].completed = true;
      agentSubgoals[agentSubgoals.length - 1].status = 'completed';
      activitySteps.push({ type: 'SEARCH', label: getAgentProgressMessage('SEARCH', { query: `results (${searchResult.results?.length || 0})` }) });
      
      activeSubgoals = agentSubgoals.map(s => ({ text: s.text, completed: s.completed, status: s.status }));
      renderChecklist(activeSubgoals);

      renderMessageContent(aiBubble, composeAgentLiveContent(
        renderTaskWidgetHtml(agentSubgoals),
        renderActivityFeedHtml(activitySteps),
        getWebSearchCardHtml('Analyzing live web results...')
      ));
      chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

      if (shouldAskForSearchClarification(searchResult)) {
        finalResponse = searchResult.clarification || `I searched for "${searchQuery}", but the results were too thin to answer confidently. Can you add a brand, budget, location, or what kind of result you want?`;
      } else {
        const liveContext = searchContextForLLM(searchResult);
        const summarySystemPrompt = `You are Ultron, an intelligent, helpful AI assistant in a direct 1-on-1 personal conversation with Vedant Wankhade.
Answer the request directly using the live web information provided.

CRITICAL INSTRUCTIONS:
- Give a clear, direct, structured answer (with specific product names, recommendations, prices, features, or facts).
- Speak directly in the first person using "I" and "you".
- DO NOT output meta-narration or prompt generator instructions (NEVER write "Based on the given user prompt", "Search Query Generator", "Here are keywords", "Live information:").
- DO NOT include raw URLs inside the body text. Source buttons are displayed separately below your answer.
- Format lists cleanly with Markdown bullet points and bold titles.`;

        const summaryPrompt = `Original request:
${userPrompt}

Search query used:
${searchQuery}

Live information:
${liveContext}

Write the direct final answer now.`;

        let summary = await queryOfflineLLM(summaryPrompt, [], 'conversation', summarySystemPrompt, loopImagePayloads);
        if (!summary || summary.trim() === '' || summary.includes('offline model loop failed') || summary.includes('Search Query Generator')) {
          summary = `I found ${searchResult.results.length} live result${searchResult.results.length === 1 ? '' : 's'} for "${searchQuery}". Open the sources below to inspect the original pages.`;
        }

        finalResponse = sanitizeResponseText(summary, userPrompt, {
          allowedUrls: (searchResult.results || []).map(item => item.url).filter(Boolean)
        });
      }
    } catch (e) {
      finalResponse = `Web search failed: ${e.message}. Please try again.`;
    }

    agentSubgoals.push({ text: 'Task completed successfully', completed: true, status: 'completed' });
    activeSubgoals = agentSubgoals.map(s => ({ text: s.text, completed: s.completed, status: s.status }));
    renderChecklist(activeSubgoals);
    
    const searchExperienceMarkup = typeof searchResult !== 'undefined' && searchResult.results && searchResult.results.length > 0
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

    persistTaskMemory(`[SEARCH] Query: "${searchQuery.substring(0, 40)}" -> ${finalResponse.substring(0, 60)}...`);
    return;
  }

  while (steps < maxSteps && !isDone) {
    steps++;
    logTrace(`Agent Loop Step ${steps}/${maxSteps}...`, 'system');

    const thinkingStartedAt = Date.now();

    renderMessageContent(aiBubble, composeAgentLiveContent(
      showTaskPlan ? renderTaskWidgetHtml(agentSubgoals) : '',
      renderActivityFeedHtml(activitySteps),
      getAgentShimmerLineHtml('Thinking')
    ));

    // 1. Query LLM for next step/action
    let rawResponse = await queryOfflineLLM(currentPrompt, accumulatedContext, intent, agentSystemPrompt, loopImagePayloads);
    if (!rawResponse || typeof rawResponse !== 'string') {
      rawResponse = '';
    }

    // Replace the live "deciding..." entry with a Cursor-style timed line
    activitySteps.push({
      type: 'THINKING',
      label: `Thought for ${formatWorkDuration(Date.now() - thinkingStartedAt)}`
    });

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

    rawResponse = rawResponse.replace(/\[your_name\]|\[Your Name\]|<your name>|\[Agent Name\]/gi, "Ultron");

    // 2. Parse for tool calls (with fallback intent steerer for small models like tinyllama)
    let toolCall = parseAgentToolCall(rawResponse, steps === 1 ? userPrompt : '');

    if (!toolCall) {
      if (hasUnfinishedExplicitTask(userPrompt, executedAppActions) && completionNudges < 2) {
        completionNudges++;
        const missingInstruction = buildMissingActionInstruction(userPrompt, executedAppActions);
        accumulatedContext.push({ role: 'assistant', content: rawResponse || '(no tool call)' });
        accumulatedContext.push({ role: 'user', content: missingInstruction });
        currentPrompt = `${buildAgentToolPrompt(userPrompt, steps + 1, 'The previous response stopped before completing all requested app actions.', { hasVisualContext, canCaptureScreen })}

${missingInstruction}`;
        activitySteps.push({ type: 'THINKING', label: 'Continuing the unfinished request' });
        continue;
      }
      // No tool calls and no explicit work remains: task complete.
      isDone = true;
      finalResponse = rawResponse || "Task completed successfully.";
      break;
    }

    // 3. Execute tool based on tool type
    await enrichToolCallAppPresentation(toolCall);
    const toolTargetLabel = getToolTargetLabel(toolCall);
    logTrace(`Agent Action Step ${steps}: Executing ${toolCall.type} (${toolTargetLabel.substring(0, 40)}...)`, 'local');

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

    renderMessageContent(aiBubble, composeAgentLiveContent(
      showTaskPlan ? renderTaskWidgetHtml(agentSubgoals) : '',
      renderActivityFeedHtml(activitySteps),
      getAgentShimmerLineHtml(humanizeToolCallLabel(toolCall))
    ));
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
          renderMessageContent(aiBubble, composeAgentLiveContent(
            showTaskPlan ? renderTaskWidgetHtml(agentSubgoals) : '',
            renderActivityFeedHtml(activitySteps),
            getAgentShimmerLineHtml(humanizeToolCallLabel(actionTool))
          ));
        }
        const stepResult = executor
          ? await executor.executeAgentToolCall(actionTool, { withTimeout, canCaptureScreen })
          : schema.normalizeToolResult(await withTimeout(window.ultronAPI.appAction(actionTool), 20000));
        results.push(`${action.action}: ${stepResult.success ? stepResult.message : `failed - ${stepResult.message}`}`);
        if (stepResult.success) executedAppActions.push(String(action.action || '').toUpperCase());
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
        : `Completed the requested actions${_activeAgentApp.name ? ` in **${_activeAgentApp.name}**` : ''}.`;
      isDone = true;
    } else if (toolCall.type === 'SEARCH') {
      const searchTarget = await buildWebSearchQuery(toolCall.target || userPrompt);
      renderMessageContent(aiBubble, composeAgentLiveContent(
        showTaskPlan ? renderTaskWidgetHtml(agentSubgoals) : '',
        renderActivityFeedHtml(activitySteps),
        getWebSearchCardHtml(searchTarget)
      ));
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

        const summary = await queryOfflineLLM(summaryPrompt, [], 'conversation', summarySystemPrompt, loopImagePayloads);
        const answer = sanitizeResponseText(summary || `I found ${searchPayload.results.length} live results for "${searchTarget}".`, userPrompt, {
          allowedUrls: (searchPayload.results || []).map(item => item.url).filter(Boolean)
        });
        finalResponse = renderSearchExperience(answer, searchPayload);
      } else {
        finalResponse = searchPayload.clarification || `I searched for "${searchTarget}", but the results were too thin to answer confidently. Can you add a brand, budget, location, or what kind of result you want?`;
      }
      isDone = true;
    } else if (executor && ['APP_ACTION', 'CAPTURE_SCREEN', 'EXECUTE', 'WRITE_FILE', 'READ_FILE', 'LIST_DIR'].includes(toolCall.type)) {
      if (toolCall.type === 'CAPTURE_SCREEN') await ensureVisionModelForScreen();
      execResult = await executor.executeAgentToolCall(toolCall, {
        withTimeout,
        canCaptureScreen,
        captureScreenForAgent
      });
      toolResult = schema ? schema.toolResultToObservation(execResult) : execResult.message;

      if (execResult.success) {
        if (toolCall.type === 'APP_ACTION') {
          executedAppActions.push(String(toolCall.action || '').toUpperCase());
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
          isDone = false;
        } else if (toolCall.type === 'WRITE_FILE') {
          finalResponse = `File created successfully on computer at **${execResult.evidence || toolCall.targetPath}**.${renderUndoActionCard()}`;
          if (toolCall.followUpCommand) {
            const execRes = await withTimeout(window.ultronAPI.executeAction({ command: toolCall.followUpCommand }));
            if (execRes.success) {
              toolResult += `\n\nExecution Output:\n\`\`\`text\n${execRes.stdout || 'Success (No Output)'}\n\`\`\``;
              finalResponse += `\n\n**Execution Output:**\n\`\`\`text\n${execRes.stdout || 'Done'}\n\`\`\``;
            }
          }
          isDone = !shouldContinueAgentLoopAfterTool(toolCall);
        } else if (toolCall.type === 'READ_FILE') {
          finalResponse = `**File Content (${toolCall.target}):**\n\`\`\`text\n${execResult.evidence}\n\`\`\``;
          isDone = !shouldContinueAgentLoopAfterTool(toolCall);
        } else if (toolCall.type === 'LIST_DIR') {
          finalResponse = `**Directory Contents (${toolCall.target}):**\n\`\`\`text\n${execResult.evidence}\n\`\`\``;
          isDone = !shouldContinueAgentLoopAfterTool(toolCall);
        } else if (toolCall.type === 'EXECUTE' && toolCall.target.startsWith('mkdir')) {
          finalResponse = `Folder created successfully on computer at **${toolCall.target.replace('mkdir ', '').replace(/"/g, '')}**.`;
          isDone = true;
        } else if (shouldContinueAgentLoopAfterTool(toolCall) || hasUnfinishedExplicitTask(userPrompt, executedAppActions)) {
          isDone = false;
        } else {
          finalResponse = execResult.message;
          isDone = true;
        }
      } else {
        pushAgentProgressStep(activitySteps, 'ERROR');
        if (execResult.errorCode === 'APP_AMBIGUOUS') {
          finalResponse = renderClarifyAppCard(toolCall.appName || toolCall.target, execResult.suggestions);
          playUltronSound('question');
        } else {
          finalResponse = renderErrorRecoveryCard(execResult.errorCode, execResult.message, execResult);
        }
        isDone = true;
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

    if (!isDone && shouldContinueAgentLoopAfterTool(toolCall) && toolCall.type !== 'CAPTURE_SCREEN') {
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
    accumulatedContext.push({ role: 'assistant', content: rawResponse });
    accumulatedContext.push({ role: 'user', content: `[Observation / System Result]:\n${toolResult}\n\nContinue toward completing the user's task.` });
    
    currentPrompt = buildAgentToolPrompt(userPrompt, steps + 1, toolResult, { hasVisualContext, canCaptureScreen });
    if (hasUnfinishedExplicitTask(userPrompt, executedAppActions)) {
      currentPrompt += `\n\n${buildMissingActionInstruction(userPrompt, executedAppActions)}`;
    }
  }

  if (!finalResponse) {
    finalResponse = isDone
      ? 'Task completed successfully.'
      : 'Reached the maximum number of agent steps. Review the activity feed for partial progress.';
  }

  const anyFailed = agentSubgoals.some(step => step.status === 'failed');
  agentSubgoals.forEach(step => {
    if (!step.completed && step.status !== 'failed') {
      step.completed = true;
      step.status = 'completed';
    }
  });
  if (!anyFailed) {
    agentSubgoals.push({ text: 'Done', completed: true, status: 'completed' });
  }
  activitySteps.push({
    type: anyFailed ? 'ERROR' : 'SUCCESS',
    label: anyFailed ? 'Task stopped — one of the steps failed.' : 'Task complete.'
  });
  activeSubgoals = agentSubgoals.map(s => ({ text: s.text, completed: s.completed, status: s.status }));
  renderChecklist(activeSubgoals);
  ensureRightSidebarVisible();

  const fullFinalContent = composeAgentFinalContent(showTaskPlan ? agentSubgoals : [], activitySteps, finalResponse, Date.now() - loopStartedAt);

  await typeMessageResponse(aiBubble, fullFinalContent, { instant: true });
  appendChatMessage('Ultron', fullFinalContent, true, { skipRender: true });

  if (looksLikeAgentQuestion(finalResponse)) {
    playUltronSound('question');
  } else {
    playUltronSound('task_complete');
  }

  const taskSummary = `[${intent.toUpperCase()}] "${userPrompt.substring(0, 40)}" → ${finalResponse.substring(0, 60).replace(/\n/g, ' ')}...`;
  persistTaskMemory(taskSummary);
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
      
      activeSubgoals = [];
    } else {
      // Fallback loading template if empty
      renderChatMessage('Ultron', 'This chat has no saved messages yet.', true);
      activeSubgoals = [];
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
        <p style="font-size: 11px; color: var(--text-muted); margin: 0 0 14px 0;">Click below to download <strong>Phi-3</strong> (2.2 GB), a stronger small model for reliable offline replies.</p>
        <button id="btn-quick-download-phi3" class="btn-primary-sm" style="background-color: #ffffff !important; color: #000000 !important; font-weight: 600; padding: 6px 16px; font-size: 12px; border-radius: 6px; cursor: pointer; border: none;">
          Download Phi-3 (2.2 GB)
        </button>
      </div>
    `;
    
    setTimeout(() => {
      const btnQuick = document.getElementById('btn-quick-download-phi3');
      if (btnQuick) {
        btnQuick.addEventListener('click', () => {
          const btnShow = document.getElementById('btn-show-download-fields');
          const inputsRow = document.getElementById('download-inputs-row');
          const inputModel = document.getElementById('input-download-model');
          const btnDownload = document.getElementById('btn-download-model');
          
          if (btnShow) btnShow.style.display = 'none';
          if (inputsRow) inputsRow.classList.remove('hidden');
          if (inputModel) inputModel.value = 'phi3:latest';
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
    } else if (model.size && model.size > 8 * 1024 * 1024 * 1024) { // Larger than 8GB
      compatLabel = 'High Resource (Slow)';
      compatClass = 'incompatible';
    }
    
    const sizeText = model.size ? `${(model.size / (1024 * 1024 * 1024)).toFixed(1)} GB` : 'Installed';

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span><strong>${model.name}</strong> (${sizeText})</span>
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
}

// Populate Apps Settings Checklist list (includes brand SVGs next to names and persistent state)
async function renderSettingsApps() {
  if (!settingsAppsList) return;

  settingsAppsList.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; gap: 10px; padding: 40px; color: var(--text-muted); font-size: 13px;">
      <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20" style="color: #ffffff;">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-opacity="0.25" fill="none"></circle>
        <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" fill="none"></path>
      </svg>
      <span>Scanning local applications...</span>
    </div>
  `;
  
  logTrace('Scanning host application shortcuts...', 'system');
  const result = await window.ultronAPI.getInstalledApps();
  settingsAppsList.innerHTML = '';
  
  if (result.success && Array.isArray(result.apps) && result.apps.length > 0) {
    const savedMap = getSavedAuthorizedAppsMap();
    const appsSearchInput = document.getElementById('apps-search');
    const filterQuery = appsSearchInput ? appsSearchInput.value.toLowerCase().trim() : '';

    const appsToRender = result.apps.filter(app => {
      if (!filterQuery) return true;
      return app.name.toLowerCase().includes(filterQuery);
    });

    if (appsToRender.length === 0) {
      settingsAppsList.innerHTML = `<div class="text-xs text-muted p-4" style="text-align: center;">No matching applications found.</div>`;
      return;
    }

    const currentMap = savedMap || {};

    appsToRender.forEach(app => {
      const item = document.createElement('div');
      item.className = 'app-list-item';
      
      // If never explicitly toggled, default to true
      const isSelected = currentMap[app.name] !== undefined ? currentMap[app.name] : true;
      if (currentMap[app.name] === undefined) {
        currentMap[app.name] = true;
      }
      
      const iconMarkup = app.icon 
        ? `<img class="app-icon" src="${app.icon}" alt="${app.name}" style="width: 18px; height: 18px; object-fit: contain;">` 
        : getAppIconSvg(app.name);
      
      const safeId = `chk-app-${app.name.replace(/[^a-zA-Z0-9-]/g, '-')}`;
      
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
          <input type="checkbox" class="app-item-checkbox" id="${safeId}" data-app-name="${escapeHtml(app.name)}" ${isSelected ? 'checked' : ''}>
          ${iconMarkup}
          <label for="${safeId}" style="cursor: pointer; font-size: 13px; font-weight: 500; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(app.name)}</label>
        </div>
        <span class="app-status-badge ${isSelected ? 'badge-authorized' : 'badge-restricted'}" style="font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px;">
          ${isSelected ? 'Authorized' : 'Restricted'}
        </span>
      `;

      const chk = item.querySelector('.app-item-checkbox');
      if (chk) {
        chk.addEventListener('change', () => {
          const appName = app.name;
          const activeMap = getSavedAuthorizedAppsMap() || {};
          result.apps.forEach(a => {
            if (activeMap[a.name] === undefined) activeMap[a.name] = true;
          });
          activeMap[appName] = chk.checked;
          saveAuthorizedAppsMap(activeMap);
          
          const badge = item.querySelector('.app-status-badge');
          if (badge) {
            badge.textContent = chk.checked ? 'Authorized' : 'Restricted';
            badge.className = `app-status-badge ${chk.checked ? 'badge-authorized' : 'badge-restricted'}`;
          }
          
          updateMarkAllCheckboxState();
        });
      }

      settingsAppsList.appendChild(item);
    });

    if (!savedMap) {
      saveAuthorizedAppsMap(currentMap);
    }

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

// Bind live apps search filter and Mark All checkbox events
const appsSearchInput = document.getElementById('apps-search');
if (appsSearchInput) {
  appsSearchInput.addEventListener('input', () => {
    const query = appsSearchInput.value.toLowerCase().trim();
    if (!settingsAppsList) return;
    const items = settingsAppsList.querySelectorAll('.app-list-item');
    items.forEach(item => {
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

const chkMarkAllApps = document.getElementById('chk-mark-all-apps');
if (chkMarkAllApps) {
  chkMarkAllApps.addEventListener('change', () => {
    if (!settingsAppsList) return;
    const allBoxes = settingsAppsList.querySelectorAll('.app-item-checkbox');
    const newStatus = chkMarkAllApps.checked;
    const activeMap = getSavedAuthorizedAppsMap() || {};
    
    allBoxes.forEach(chk => {
      chk.checked = newStatus;
      const appName = chk.getAttribute('data-app-name');
      if (appName) activeMap[appName] = newStatus;
      const item = chk.closest('.app-list-item');
      if (item) {
        const badge = item.querySelector('.app-status-badge');
        if (badge) {
          badge.textContent = newStatus ? 'Authorized' : 'Restricted';
          badge.className = `app-status-badge ${newStatus ? 'badge-authorized' : 'badge-restricted'}`;
        }
      }
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
    } else if (targetTab === 'apps') {
      renderSettingsApps();
    } else if (targetTab === 'storage') {
      if (settingMemoryToggle) {
        const isMemoryEnabled = window.localStorage.getItem('ultron-memory-enabled') !== 'false';
        settingMemoryToggle.checked = isMemoryEnabled;
      }
      if (settingDataDir) {
        const defaultPath = await window.ultronAPI.getDefaultDataDir();
        const storedPath = window.localStorage.getItem('ultron-data-dir');
        if (storedPath && !storedPath.includes('Roaming\\LocalAgent') && !storedPath.includes('AppData\\Local\\UltronData')) {
          settingDataDir.value = storedPath;
        } else {
          settingDataDir.value = defaultPath;
          window.localStorage.setItem('ultron-data-dir', defaultPath);
          await window.ultronAPI.updateDataDir(defaultPath);
        }
      }
      updateMemoryUIState();
    }
  });
});

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
  if (key) await connectGemini(key);
  else updateGeminiConnectionBadge();
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
      if (feedbackGeminiKey) {
        feedbackGeminiKey.textContent = 'Key cleared.';
        feedbackGeminiKey.classList.remove('hidden');
        setTimeout(() => feedbackGeminiKey.classList.add('hidden'), 3000);
      }
    }
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
  { name: 'gemma2:2b', size: '2B', downloadSize: '1.6 GB', desc: 'Google Gemma 2 compact model for low VRAM systems' },
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
  activeSubgoals = [];
  renderChecklist([]);
  
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
      if (file.size < 2 * 1024 * 1024) {
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
        if (btnSettings && settingsModal) {
          settingsModal.classList.remove('hidden');
          document.querySelector('.settings-tab-btn[data-tab="apps"]')?.click();
        }
      } else if (action === 'enable-screen') {
        window.localStorage.setItem('ultron-screen-capture-enabled', 'true');
        window.localStorage.setItem('ultron-screen-aware-enabled', 'true');
        if (settingScreenCaptureToggle) settingScreenCaptureToggle.checked = true;
        syncPlusMenuToggles();
      } else if (action === 'switch-vision-model') {
        await ensureVisionModelForScreen();
        updateModelSelectorLabel();
      } else if (action === 'open-models') {
        if (btnSettings && settingsModal) {
          settingsModal.classList.remove('hidden');
          document.querySelector('.settings-tab-btn[data-tab="models"]')?.click();
        }
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
  });
});

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
  _liveMetricsTimer = setInterval(refreshLiveMetrics, 8000);
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
    attachmentPreviewBar.appendChild(warnBanner);

    const switchBtn = warnBanner.querySelector('#btn-switch-to-vision');
    if (switchBtn) {
      switchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeModel = ONLINE_GEMINI_MODELS.find(model => model.name.includes('flash'))?.name
          || ONLINE_GEMINI_MODELS[0]?.name
          || activeModel;
        updateModelSelectorLabel();
        renderAttachmentPreviews();
        logTrace(`Switched model to Gemini 3.0 Flash for image vision analysis`, 'system');
      });
    }
  }

  attachedFiles.forEach((fileObj, index) => {
    const ext = fileObj.name.includes('.') ? fileObj.name.split('.').pop().toUpperCase() : 'FILE';
    const sizeKB = (fileObj.size / 1024).toFixed(1);
    
    const pill = document.createElement('div');
    pill.className = 'attachment-pill';

    const thumbHtml = fileObj.isImage && fileObj.dataUrl
      ? `<img src="${fileObj.dataUrl}" class="attachment-pill-thumb" alt="Preview" />`
      : `<span class="attachment-badge">${ext}</span>`;

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
let mediaStream = null;
let audioContext = null;
let analyserNode = null;
let animFrameId = null;
let speechRecognition = null;
let mediaRecorder = null;
let recordedAudioChunks = [];
let accumulatedTranscript = '';
let initialInputValue = '';
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
    const apiKey = localStorage.getItem('ultron-gemini-api-key') || '';
    if (!apiKey) {
      alert('Speech-to-Text requires a Gemini API Key. Please save your API key in Settings > Models first.');
      return;
    }

    accumulatedTranscript = '';
    initialInputValue = chatInput ? chatInput.value : '';
    recordedAudioChunks = [];
    isRecordingVoice = true;

    // Smooth animated transition from main prompt pill to voice capsule pill
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

    // Reset and start timer
    voiceStartTime = Date.now();
    if (voiceRecordingTimer) voiceRecordingTimer.textContent = '0:00';
    if (voiceTimerInterval) clearInterval(voiceTimerInterval);
    voiceTimerInterval = setInterval(updateVoiceTimer, 200);

    // Initialize microphone audio stream
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 256;
    analyserNode.smoothingTimeConstant = 0.7;
    
    const source = audioContext.createMediaStreamSource(mediaStream);
    source.connect(analyserNode);

    // Start animated audio level waveform synced to pitch & intensity
    drawWaveform();

    // MediaRecorder Audio Data Capture for 100% reliable Multimodal Transcribe
    try {
      mediaRecorder = new MediaRecorder(mediaStream);
      recordedAudioChunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedAudioChunks.push(e.data);
        }
      };
      mediaRecorder.start(100);
    } catch (mErr) {
      console.warn('MediaRecorder init notice:', mErr);
    }

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

        // Live transcribe into prompt input in real time
        if (chatInput && isRecordingVoice) {
          const prefix = initialInputValue ? initialInputValue.trim() + ' ' : '';
          chatInput.value = prefix + accumulatedTranscript;
          chatInput.style.height = 'auto';
          chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
        }
      };

      speechRecognition.onerror = (err) => {
        console.warn('Speech recognition notice:', err.error);
      };

      speechRecognition.onend = () => {
        if (isRecordingVoice && speechRecognition) {
          try { speechRecognition.start(); } catch (e) {}
        }
      };

      speechRecognition.start();
    }
  } catch (err) {
    console.error('Microphone access error:', err);
    alert('Unable to access microphone. Please check Windows system recording permissions.');
    stopVoiceRecording(false);
  }
}

async function stopVoiceRecording(saveTranscript = true) {
  isRecordingVoice = false;

  if (voiceTimerInterval) {
    clearInterval(voiceTimerInterval);
    voiceTimerInterval = null;
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  // Show clean white spinner on done checkmark button while processing
  if (saveTranscript && voiceBtnDone) {
    voiceBtnDone.innerHTML = `
      <svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
      </svg>
    `;
    voiceBtnDone.style.pointerEvents = 'none';
    if (voiceBtnCancel) voiceBtnCancel.style.pointerEvents = 'none';
  }

  // Stop MediaRecorder and grab audio blob
  let finalAudioBlob = null;
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    await new Promise((resolve) => {
      mediaRecorder.onstop = () => {
        if (recordedAudioChunks.length > 0) {
          finalAudioBlob = new Blob(recordedAudioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        }
        resolve();
      };
      try { mediaRecorder.stop(); } catch (e) { resolve(); }
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
    speechRecognition.onend = null;
    try { speechRecognition.stop(); } catch (e) {}
    speechRecognition = null;
  }

  if (saveTranscript) {
    let textToInsert = (accumulatedTranscript || '').trim();
    
    // If Web Speech API didn't populate transcript, convert recorded WebM audio blob to text via Gemini Multimodal Audio API
    if (!textToInsert && finalAudioBlob && finalAudioBlob.size > 0) {
      const apiKey = localStorage.getItem('ultron-gemini-api-key') || '';
      if (apiKey) {
        try {
          const base64Audio = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(finalAudioBlob);
          });

          const speechModel = ONLINE_GEMINI_MODELS.find(model => model.name.includes('flash'))?.name
            || ONLINE_GEMINI_MODELS[0]?.name;
          if (!speechModel) throw new Error('No compatible Gemini model is connected.');
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${speechModel}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: 'Transcribe the following spoken voice audio recording into plain text verbatim. Return ONLY the spoken words with zero quotes, headers, or commentary.' },
                  { inlineData: { mimeType: finalAudioBlob.type || 'audio/webm', data: base64Audio } }
                ]
              }]
            })
          });

          if (res.ok) {
            const jsonRes = await res.json();
            const transcribed = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (transcribed) {
              textToInsert = transcribed;
            }
          } else {
            const errJson = await res.json().catch(() => ({}));
            console.warn('Gemini Audio Transcribe error:', errJson);
          }
        } catch (tErr) {
          console.warn('Audio transcribe error:', tErr);
        }
      }
    }

    // Restore original checkmark icon
    if (voiceBtnDone) {
      voiceBtnDone.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
      voiceBtnDone.style.pointerEvents = '';
    }
    if (voiceBtnCancel) voiceBtnCancel.style.pointerEvents = '';

    // Smooth animated transition back to main prompt pill once transcription is ready
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
          });
        }
      }, 120);
    }

    if (chatInput) {
      const prefix = initialInputValue ? initialInputValue.trim() + ' ' : '';
      if (textToInsert) {
        chatInput.value = prefix + textToInsert;
      } else {
        chatInput.value = initialInputValue;
      }
      chatInput.focus();
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
    }
  } else {
    // Revert to initial input if canceled
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
          });
        }
      }, 120);
    }

    if (chatInput) {
      chatInput.value = initialInputValue;
      chatInput.style.height = 'auto';
      chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + 'px';
    }
  }

  accumulatedTranscript = '';
  initialInputValue = '';
  recordedAudioChunks = [];
}

function drawWaveform() {
  if (!isRecordingVoice || !voiceWaveformCanvas || !analyserNode) return;

  const canvas = voiceWaveformCanvas;
  const canvasCtx = canvas.getContext('2d');

  const bufferLength = analyserNode.frequencyBinCount;
  const freqArray = new Uint8Array(bufferLength);
  const timeArray = new Uint8Array(analyserNode.fftSize);

  function renderFrame() {
    if (!isRecordingVoice) return;
    animFrameId = requestAnimationFrame(renderFrame);

    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.width || 500;
    const height = rect.height || canvas.height || 32;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }
    
    canvasCtx.save();
    canvasCtx.scale(dpr, dpr);

    analyserNode.getByteFrequencyData(freqArray);
    analyserNode.getByteTimeDomainData(timeArray);

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
      
      // Multiplier for voice pitch & sound volume intensity
      const voiceFactor = Math.max(freqAmp * 1.8, rmsVolume * 3.2);
      
      let targetHeight = 3;
      if (voiceFactor >= 0.01) {
        targetHeight = Math.min(height - 4, Math.max(3, voiceFactor * (height - 4)));
      }

      // Smooth lerp transition for fluid 60fps movement
      _prevHeights[i] += (targetHeight - _prevHeights[i]) * 0.4;
      const pillHeight = _prevHeights[i];
      const y = (height - pillHeight) / 2;

      // Voice reactive dynamic glow color
      if (voiceFactor >= 0.02) {
        const glowOpacity = Math.min(1.0, 0.45 + voiceFactor * 0.55);
        const blueVal = Math.floor(210 + Math.min(45, voiceFactor * 45));
        canvasCtx.fillStyle = `rgba(96, 165, ${blueVal}, ${glowOpacity})`;
      } else {
        canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.3)';
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
async function bootSystem() {
  if (window.UltronAgentPrompt && typeof window.UltronAgentPrompt.loadUltronAgentConfig === 'function') {
    try {
      await window.UltronAgentPrompt.loadUltronAgentConfig();
      if (typeof window.UltronAgentPrompt.startUltronAgentConfigHotReload === 'function') {
        window.UltronAgentPrompt.startUltronAgentConfigHotReload();
      }
    } catch (err) {
      console.warn('Ultron agent config preload failed:', err);
    }
  }

  loadAccountDetails();
  updateWelcomeGreeting();
  setSendingState(false);
  initTraceEmptyState();
  renderChecklist([]);
  syncPlusMenuToggles();
  startLiveMetricsPolling();

  if (window.UltronAgentMemory && typeof window.UltronAgentMemory.loadTaskMemory === 'function') {
    _learnedTaskMemory = window.UltronAgentMemory.loadTaskMemory().map(item => item.text || item);
  }
  reloadConversationsFromDisk().catch(err => {
    console.error('Conversation reload error:', err);
  });

  // Background health check & profiler — calls hideSkeletonLoader() when finished
  checkOllamaStartup().then(() => {
    return runOnboardingProfiler();
  }).catch((err) => {
    console.error('Ollama startup check error:', err);
    hideSkeletonLoader();
  });

  // Safety fallback: reveal UI after max 3s even if diagnostics delay
  setTimeout(hideSkeletonLoader, 3000);
}

bootSystem();
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

    if (settingScreenCaptureToggle) {
      const screenCaptureEnabled = window.localStorage.getItem('ultron-screen-capture-enabled') !== 'false';
      settingScreenCaptureToggle.checked = screenCaptureEnabled;
    }
    if (settingNeverCaptureApps) {
      settingNeverCaptureApps.value = window.localStorage.getItem('ultron-never-capture-apps') || '';
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

  const handleCheckForUpdates = async () => {
    if (title) title.textContent = 'Checking for updates...';
    if (topBtnCheck) {
      topBtnCheck.disabled = true;
      topBtnCheck.style.opacity = '0.6';
      topBtnCheck.querySelector('span').textContent = 'Checking...';
    }
    if (btnCheck) {
      btnCheck.disabled = true;
      btnCheck.style.opacity = '0.6';
    }

    const res = await window.ultronAPI.checkForUpdates();
    if (res && res.status === 'dev-mode') {
      if (title) title.textContent = 'Dev Mode Active';
      if (subtitle) subtitle.textContent = 'Auto-updates check remote GitHub Releases in production builds.';
      if (topBtnCheck) {
        topBtnCheck.disabled = false;
        topBtnCheck.style.opacity = '1';
        topBtnCheck.querySelector('span').textContent = 'Dev Mode Active';
        setTimeout(() => {
          if (topBtnCheck) topBtnCheck.querySelector('span').textContent = 'Check for Updates';
        }, 3000);
      }
      if (btnCheck) {
        btnCheck.disabled = false;
        btnCheck.style.opacity = '1';
      }
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
      if (topBtnCheck) topBtnCheck.querySelector('span').textContent = 'Checking...';
    } else if (data.status === 'available') {
      if (title) title.textContent = `New Update Available: v${data.version}!`;
      if (subtitle) subtitle.textContent = `Release notes: ${data.releaseNotes || 'Bug fixes and performance improvements.'}`;
      if (actionContainer) actionContainer.style.display = 'flex';
      if (btnDownload) btnDownload.style.display = 'inline-flex';

      // Top-left header button
      if (topBtnDownload) {
        topBtnDownload.classList.remove('hidden');
        if (topDownloadText) topDownloadText.textContent = `Download v${data.version}`;
      }
    } else if (data.status === 'not-available') {
      if (title) title.textContent = 'Ultron is Up to Date ✓';
      if (subtitle) subtitle.textContent = `You are running the latest version (v${data.version || '1.0.3'}).`;
      if (actionContainer) actionContainer.style.display = 'none';
      if (topBtnDownload) topBtnDownload.classList.add('hidden');
      if (topBtnRestart) topBtnRestart.classList.add('hidden');
    } else if (data.status === 'downloading') {
      if (actionContainer) actionContainer.style.display = 'flex';
      if (btnDownload) btnDownload.style.display = 'none';
      if (progressLabel) progressLabel.textContent = `Downloading... ${data.percent}%`;

      if (topBtnDownload) {
        topBtnDownload.classList.remove('hidden');
        if (topDownloadText) topDownloadText.textContent = `Downloading... ${data.percent}%`;
      }
    } else if (data.status === 'downloaded') {
      if (title) title.textContent = `Update v${data.version} Ready!`;
      if (subtitle) subtitle.textContent = 'Click restart to install the latest version.';
      if (actionContainer) actionContainer.style.display = 'flex';
      if (btnDownload) btnDownload.style.display = 'none';
      if (btnRestart) btnRestart.style.display = 'inline-flex';
      if (progressLabel) progressLabel.textContent = 'Download Complete 100%';

      if (topBtnDownload) topBtnDownload.classList.add('hidden');
      if (topBtnRestart) topBtnRestart.classList.remove('hidden');
    } else if (data.status === 'error') {
      const isUpToDate = data.error && (data.error.includes('latest version') || data.error.includes('No newer release') || data.error.includes('404'));
      if (isUpToDate) {
        if (title) title.textContent = 'Ultron is Up to Date ✓';
        if (subtitle) subtitle.textContent = 'You are running the latest version.';
      } else {
        if (title) title.textContent = 'Update Check Error';
        if (subtitle) subtitle.textContent = data.error || 'Failed to check for updates.';
      }
    }
  });
}

setupAutoUpdaterUI();


