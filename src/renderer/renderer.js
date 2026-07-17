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

// Local session storage matrix to support natural language keyword scans
let conversationsStore = {};

// Stopwords to filter out during semantic search parses
const stopwords = new Set(['show', 'me', 'the', 'chat', 'about', 'find', 'a', 'an', 'is', 'of', 'to', 'in', 'and', 'for', 'with', 'on', 'at']);

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
function appendChatMessage(sender, text, isAi = false) {
  // Hide suggestions grid when first message is sent
  const suggestionsGrid = document.getElementById('suggestions-grid');
  if (suggestionsGrid) {
    suggestionsGrid.style.display = 'none';
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message flex gap-4 max-w-3xl ${isAi ? 'ai' : 'user'}`;
  
  if (isAi) {
    const avatar = document.createElement('div');
    avatar.className = 'avatar ai';
    avatar.innerHTML = `<img src="../Assets/ultron-logo.png" alt="Ultron" />`;
    messageDiv.appendChild(avatar);
  }
  
  const content = document.createElement('div');
  content.className = 'message-content';
  
  // Parse markdown securely via ContextBridge
  content.innerHTML = window.ultronAPI.parseMarkdown(text);
  
  messageDiv.appendChild(content);
  
  chatMessagesContainer.appendChild(messageDiv);
  chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  
  // Save message to current session inside conversationsStore
  if (currentSessionId && conversationsStore[currentSessionId]) {
    conversationsStore[currentSessionId].messages.push({ sender, text, isAi });
  }
  
  return content;
}

// Offline inference helper querying local servers
async function queryOfflineLLM(prompt) {
  // 1. Try Python local FastAPI server first (port 8000)
  try {
    const response = await fetch('http://127.0.0.1:8000/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, model: activeModel })
    });
    if (response.ok) {
      const data = await response.json();
      return data.response;
    }
  } catch (e) {
    logTrace('Python FastAPI server offline. Connecting directly to local Ollama binding...', 'local');
  }

  // 2. Direct Ollama API generate loop fallback (port 11434)
  try {
    const response = await fetch('http://127.0.0.1:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: activeModel,
        prompt: prompt,
        stream: false
      })
    });
    if (response.ok) {
      const data = await response.json();
      return data.response;
    }
  } catch (e) {
    return `**offline model loop failed.**\n\nEnsure that Ollama is installed and running on your local Windows machine at \`http://127.0.0.1:11434\`. You can download Ollama offline weights (\`${activeModel}\`) to resolve queries locally.`;
  }
}

// Populate custom model dropdown
function populateModelSelectors(models, recommendation) {
  modelDropdownList.innerHTML = '';
  
  if (models.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'model-dropdown-empty';
    emptyDiv.innerHTML = 'No models found.<br><a id="add-models-link">Add models in Settings</a>';
    modelDropdownList.appendChild(emptyDiv);
    modelSelectorLabel.textContent = recommendation || 'No model';
    
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
  
  models.forEach(model => {
    const item = document.createElement('div');
    item.className = `model-dropdown-item${model.name === activeModel ? ' active' : ''}`;
    item.textContent = model.name;
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
    activeModel = recommendation; // Use recommended model
    
    logTrace(`Onboarding Profiler: Total RAM resolved as ${stats.totalRamGB} GB`, 'system');
    logTrace(`Onboarding Profiler: Suggesting local model footprint: ${recommendation}`, 'system');
    logTrace(`Ollama binds returned ${installedModels.length} offline model weights.`, 'system');
    
    // Set settings data directory
    window.localStorage.setItem('ultron-data-dir', `C:\\Users\\${stats.cpuThreads > 0 ? 'vedan' : 'user'}\\AppData\\Roaming\\LocalAgent`);
    
    // Populate dropdown
    populateModelSelectors(installedModels, recommendation);
    
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
      }
      return;
    }
  }
  
  currentSessionId = `session-${Date.now()}`;
  
  // Setup inside local conversations memory store
  conversationsStore[currentSessionId] = {
    id: currentSessionId,
    title: title,
    messages: []
  };
  
  const item = document.createElement('div');
  item.className = 'nav-item font-small active';
  item.setAttribute('data-session-id', currentSessionId);
  item.innerHTML = `
    <span class="nav-text text-truncate">${title}</span>
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
    const response = await queryOfflineLLM(summaryPrompt);
    
    // Clean up summary string
    let finalTitle = response.replace(/["'‘’.“]/g, '').trim();
    if (finalTitle.length > 30) {
      finalTitle = finalTitle.substring(0, 27) + '...';
    }
    if (finalTitle && !finalTitle.toLowerCase().includes('failed') && !finalTitle.toLowerCase().includes('offline')) {
      // Update memory store
      if (conversationsStore[targetSessionId]) {
        conversationsStore[targetSessionId].title = finalTitle;
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

// Submit prompt logic
async function submitPrompt() {
  const prompt = chatInput.value.trim();
  if (!prompt) return;
  
  // Clear input and reset height
  chatInput.value = '';
  chatInput.style.height = '24px';
  
  // Toggle off search overlay if open
  chatSearchOverlay.classList.add('hidden');
  
  const isFirstMessage = !currentSessionId;
  
  // 1. Add session history item if starting a session
  if (isFirstMessage) {
    addSessionToHistory('New chat');
  }
  
  // 2. Render user message
  appendChatMessage('User', prompt, false);
  logTrace(`Processing user request: "${prompt.substring(0, 40)}..."`, 'local');
  
  // 3. Setup AI placeholder loading bubble
  const aiBubble = appendChatMessage('Ultron', 'Thinking...', true);
  
  // 4. Trigger AI Title summary in the background on the first message
  if (isFirstMessage) {
    triggerAiTitleGeneration(prompt);
  }
  
  // 5. Routing: Command execution vs. general chat
  const isCommandRequest = 
    prompt.startsWith('execute:') || 
    prompt.startsWith('run:') || 
    prompt.toLowerCase().includes('write file') || 
    prompt.toLowerCase().includes('system file') ||
    prompt.toLowerCase().includes('list directory');

  if (isCommandRequest) {
    activeSubgoals.push({ text: `Decompose task: "${prompt.substring(0, 30)}"`, completed: true });
    renderChecklist(activeSubgoals);
    
    try {
      let testCommand = 'dir';
      let targetPath = '.';
      let isWrite = false;
      
      if (prompt.toLowerCase().includes('write')) {
        testCommand = 'echo "Ultron test write file" > ultron_test.txt';
        isWrite = true;
      } else if (prompt.toLowerCase().includes('system file')) {
        testCommand = 'echo "Hijack" > C:\\Windows\\System32\\drivers\\etc\\hosts';
        targetPath = 'C:\\Windows\\System32\\drivers\\etc\\';
        isWrite = true;
      }
      
      logTrace(`Triggering local IPC execute-action loop: "${testCommand}"`, 'local');
      const result = await window.ultronAPI.executeAction({
        command: testCommand,
        targetPath,
        isWrite
      });
      
      if (result.success) {
        logTrace(`Subprocess stdout received: ${result.stdout || 'Success (No Output)'}`, 'local');
        const mdOutput = `**Action executed successfully.**\n\n**Output:**\n\`\`\`text\n${result.stdout || 'Done'}\n\`\`\``;
        aiBubble.innerHTML = window.ultronAPI.parseMarkdown(mdOutput);
        
        // Save output to memory store
        if (conversationsStore[currentSessionId]) {
          const lastMsg = conversationsStore[currentSessionId].messages[conversationsStore[currentSessionId].messages.length - 1];
          if (lastMsg) lastMsg.text = mdOutput;
        }
        
        activeSubgoals.push({ text: `Subprocess run completed: "${testCommand}"`, completed: true });
      } else {
        logTrace(`Subprocess execute failed: ${result.error}`, 'system');
        const mdError = `**Execution failed or blocked:**\n\n<span class="text-red-400 font-semibold">${result.error}</span>`;
        aiBubble.innerHTML = window.ultronAPI.parseMarkdown(mdError);
        
        // Save output to memory store
        if (conversationsStore[currentSessionId]) {
          const lastMsg = conversationsStore[currentSessionId].messages[conversationsStore[currentSessionId].messages.length - 1];
          if (lastMsg) lastMsg.text = mdError;
        }
      }
      renderChecklist(activeSubgoals);
    } catch (err) {
      logTrace(`Local interface communication crash: ${err.message}`, 'system');
      const mdCrash = `**A critical execution error occurred:**\n\n${err.message}`;
      aiBubble.innerHTML = window.ultronAPI.parseMarkdown(mdCrash);
      
      // Save output to memory store
      if (conversationsStore[currentSessionId]) {
        const lastMsg = conversationsStore[currentSessionId].messages[conversationsStore[currentSessionId].messages.length - 1];
        if (lastMsg) lastMsg.text = mdCrash;
      }
    }
  } else {
    try {
      const response = await queryOfflineLLM(prompt);
      aiBubble.innerHTML = window.ultronAPI.parseMarkdown(response);
      
      // Save response to memory store
      if (conversationsStore[currentSessionId]) {
        const lastMsg = conversationsStore[currentSessionId].messages[conversationsStore[currentSessionId].messages.length - 1];
        if (lastMsg) lastMsg.text = response;
      }
    } catch (err) {
      aiBubble.innerHTML = window.ultronAPI.parseMarkdown(`**Inference crashed:** ${err.message}`);
    }
  }
}

// Load session histories dynamically from memory store
function loadSession(id, title) {
  chatMessagesContainer.innerHTML = '';
  logTrace(`Loading session history: "${title}"`, 'system');
  
  if (activeChatTitle) activeChatTitle.textContent = title;
  currentSessionId = id;
  
  const savedSession = conversationsStore[id];
  if (savedSession && savedSession.messages.length > 0) {
    // Redraw saved conversation history
    savedSession.messages.forEach(msg => {
      // Append directly without saving it again inside memory store push loop
      const messageDiv = document.createElement('div');
      messageDiv.className = `chat-message flex gap-4 max-w-3xl ${msg.isAi ? 'ai' : 'user'}`;
      
      const avatar = document.createElement('div');
      avatar.className = `avatar ${msg.isAi ? 'ai' : 'user'}`;
      if (msg.isAi) {
        avatar.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M12 2a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1z"></path>
            <path d="M4 11V9a4 4 0 0 1 8 0v2M20 11V9a4 4 0 0 0-8 0v2"></path>
          </svg>
        `;
      } else {
        avatar.textContent = 'H';
      }
      
      const content = document.createElement('div');
      content.className = 'message-content';
      content.innerHTML = window.ultronAPI.parseMarkdown(msg.text);
      
      if (msg.isAi) {
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(content);
      } else {
        messageDiv.appendChild(content);
        messageDiv.appendChild(avatar);
      }
      
      chatMessagesContainer.appendChild(messageDiv);
    });
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    
    activeSubgoals = [
      { text: `Loaded chat context: "${title}"`, completed: true },
      { text: 'Awaiting local prompt commands', completed: false }
    ];
  } else {
    // Fallback loading template if empty
    appendChatMessage('User', title, false);
    appendChatMessage('Ultron', `Loaded workspace for topic thread.`, true);
    activeSubgoals = [
      { text: 'Loaded historical session', completed: true },
      { text: 'Awaiting local prompt commands', completed: false }
    ];
  }
  renderChecklist(activeSubgoals);
}

// Populate Models Settings list
function renderSettingsModels() {
  settingsModelsList.innerHTML = '';
  
  // 1. Check if Ollama is connected
  const isOllamaConnected = installedModelsList.length > 0;
  if (isOllamaConnected) {
    ollamaStatusBadge.textContent = 'Detected & Connected';
    ollamaStatusBadge.className = 'badge-active';
    btnInstallOllama.classList.add('hidden');
  } else {
    ollamaStatusBadge.textContent = 'Not Detected';
    ollamaStatusBadge.className = 'badge-inactive';
    btnInstallOllama.classList.remove('hidden');
  }
  
  // 2. Render downloaded models
  if (installedModelsList.length === 0) {
    settingsModelsList.innerHTML = `<div class="text-xs text-muted p-2">No offline model weights found. Use the section below to download one.</div>`;
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
      <span><strong>${model.name}</strong> (${(model.size / (1024*1024*1024)).toFixed(1)} GB)</span>
      <span class="model-compat-badge ${compatClass}">${compatLabel}</span>
    `;
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
  settingsAppsList.innerHTML = '';
  logTrace('Scanning host application shortcuts...', 'system');
  
  const result = await window.ultronAPI.getInstalledApps();
  if (result.success) {
    result.apps.forEach(app => {
      const item = document.createElement('div');
      item.className = 'app-list-item';
      
      const isSelected = ['Google Chrome', 'Visual Studio Code', 'Obsidian'].includes(app.name);
      
      const iconMarkup = app.icon 
        ? `<img class="app-icon" src="${app.icon}" alt="${app.name}" style="width: 18px; height: 18px; object-fit: contain;">` 
        : getAppIconSvg(app.name);
      
      item.innerHTML = `
        <input type="checkbox" id="chk-app-${app.name.replace(/\s+/g, '-')}" ${isSelected ? 'checked' : ''}>
        ${iconMarkup}
        <label for="chk-app-${app.name.replace(/\s+/g, '-')}">${app.name}</label>
      `;
      settingsAppsList.appendChild(item);
    });
  } else {
    settingsAppsList.innerHTML = `<div class="text-xs text-red-400 p-2">Failed to load host apps list: ${result.error}</div>`;
  }
}

// Bind Settings Tab Switch Actions
const settingsTabs = document.querySelectorAll('.settings-tab-btn');
settingsTabs.forEach(tab => {
  tab.addEventListener('click', () => {
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
      renderSettingsModels();
    } else if (targetTab === 'apps') {
      renderSettingsApps();
    }
  });
});

// Bind Ollama silent package install
btnInstallOllama.addEventListener('click', async () => {
  btnInstallOllama.disabled = true;
  btnInstallOllama.textContent = 'Installing...';
  logTrace('Initiating winget package pull command for Ollama...', 'system');
  
  const result = await window.ultronAPI.installOllama();
  if (result.success) {
    logTrace('winget Ollama installation process spawned successfully.', 'system');
    btnInstallOllama.textContent = 'Installed (Reboot recommended)';
  } else {
    logTrace(`Ollama installer hook failed: ${result.error}`, 'system');
    btnInstallOllama.disabled = false;
    btnInstallOllama.textContent = 'Download & Install Ollama';
  }
});

// Bind model downloader
btnDownloadModel.addEventListener('click', async () => {
  const modelName = inputDownloadModel.value.trim();
  if (!modelName) return;
  
  btnDownloadModel.disabled = true;
  downloadProgressText.classList.remove('hidden');
  downloadProgressText.textContent = `Downloading ${modelName} weights...`;
  logTrace(`Triggering background weight pull: "ollama pull ${modelName}"`, 'system');
  
  const result = await window.ultronAPI.downloadModel(modelName);
  if (result.success) {
    logTrace('Model weights completed successfully!', 'system');
    downloadProgressText.textContent = `Weights downloaded successfully!`;
    inputDownloadModel.value = '';
    // Refresh profiling and settings
    runOnboardingProfiler().then(() => {
      renderSettingsModels();
    });
  } else {
    logTrace(`Failed to download weights: ${result.error}`, 'system');
    downloadProgressText.textContent = `Error: ${result.error}`;
  }
  btnDownloadModel.disabled = false;
});

// Bind clicks & enter key to send
btnSend.addEventListener('click', submitPrompt);

// Support Enter to submit, and Shift+Enter to create a new line
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    submitPrompt();
  }
});

// Auto-expand input box height dynamically while typing
chatInput.addEventListener('input', () => {
  chatInput.style.height = '24px';
  const newHeight = Math.min(chatInput.scrollHeight, 160);
  chatInput.style.height = `${newHeight}px`;
});

// New Chat Trigger handler
const triggerNewChat = () => {
  chatMessagesContainer.innerHTML = '';
  appendChatMessage('Ultron', 'New prompt isolation container initialized. State reset completed.', true);
  logTrace('New chat isolation workspace container generated.', 'system');
  activeSubgoals = [
    { text: 'Awaiting local prompt commands', completed: false }
  ];
  renderChecklist(activeSubgoals);
  
  currentSessionId = null;
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

// Suggestion card click handlers
document.querySelectorAll('.suggestion-card').forEach(card => {
  card.addEventListener('click', () => {
    const prompt = card.getAttribute('data-prompt');
    if (prompt && chatInput) {
      chatInput.value = prompt;
      chatInput.dispatchEvent(new Event('input'));
      // Auto-send the suggestion
      btnSend.click();
    }
  });
});

// Initialize setup immediately on script load (removes DOMContentLoaded race condition)
runOnboardingProfiler();
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
if (btnSettings && settingsModal && btnCloseSettings) {
  btnSettings.addEventListener('click', () => {
    // Open Account tab by default
    const firstTab = document.querySelector('.settings-tab-btn[data-tab="account"]');
    if (firstTab) firstTab.click();
    
    settingsModal.classList.remove('hidden');
    settingDataDir.value = window.localStorage.getItem('ultron-data-dir') || 'C:\\Users\\vedan\\AppData\\Roaming\\LocalAgent';
    logTrace('Settings configuration panel opened.', 'system');
  });
  btnCloseSettings.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    logTrace('Settings configuration panel closed.', 'system');
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
