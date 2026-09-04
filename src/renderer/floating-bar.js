/**
 * Ultron Floating Companion Controller
 * Matching Main App Plus Menu + Offline Models Dropdown + Approval Modes + Expanded Response Screen
 */

(function () {
  // DOM Elements
  const floatingWrapper = document.getElementById('floating-wrapper');
  const miniPillWidget = document.getElementById('mini-pill-widget');
  const miniPillMainClick = document.getElementById('mini-pill-main-click');
  const miniPillCloseBtn = document.getElementById('mini-pill-close-btn');
  const promptInput = document.getElementById('prompt-input');
  const btnPlusMenu = document.getElementById('btn-plus-menu');
  const plusMenuDropdown = document.getElementById('plus-menu-dropdown');
  const modelSelectorBtn = document.getElementById('model-selector-btn');
  const modelSelectorLabel = document.getElementById('model-selector-label');
  const modelDropdown = document.getElementById('model-dropdown');
  const modelDropdownList = document.getElementById('model-dropdown-list');
  const btnDropdownDownloadModels = document.getElementById('btn-dropdown-download-models');
  const approvalPill = document.getElementById('approval-pill');
  const approvalPillLabel = document.getElementById('approval-pill-label');
  const approvalIconBox = document.getElementById('approval-icon-box');
  const approvalDropdown = document.getElementById('approval-dropdown');
  const approvalOptions = Array.from(document.querySelectorAll('.approval-option'));
  const answerCard = document.getElementById('answer-card');
  const answerContent = document.getElementById('answer-content');
  const answerLoading = document.getElementById('answer-loading');
  const answerModelLabel = document.getElementById('answer-model-label');
  const micBtn = document.getElementById('mic-btn');
  const expandBtn = document.getElementById('expand-btn');
  const btnSend = document.getElementById('btn-send');
  const btnStop = document.getElementById('btn-stop');
  const copyAnswerBtn = document.getElementById('copy-answer-btn');
  const expandAnswerBtn = document.getElementById('expand-answer-btn');
  const closeAnswerBtn = document.getElementById('close-answer-btn');
  const editPromptBtn = document.getElementById('edit-prompt-btn');
  const toggleContractBtn = document.getElementById('toggle-contract-btn');
  const answerHeader = document.getElementById('answer-header');

  // Actions & Options
  const plusToggleAgentTools = document.getElementById('plus-toggle-agent-tools');
  const plusToggleScreenAware = document.getElementById('plus-toggle-screen-aware');
  const plusToggleWebSearch = document.getElementById('plus-toggle-web-search');
  const plusActionAttach = document.getElementById('plus-action-attach');

  // State
  let activeModel = 'phi3:latest';
  let activeApprovalMode = 'smart';
  let isRecording = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let currentAnswerText = '';
  let currentPromptText = '';
  let isStreaming = false;
  let activeAbortController = null;

  // Initialize
  async function init() {
    setupEventListeners();
    await loadOfflineModels();
    checkLocalStatus();

    if (window.ultronAPI && window.ultronAPI.onFloatingBarActivated) {
      window.ultronAPI.onFloatingBarActivated(({ prefill, miniMode }) => {
        if (miniMode) {
          showMiniPillMode();
        } else {
          showFullFloatingMode();
          if (prefill) {
            promptInput.value = prefill;
            autoResizePromptInput();
          }
          promptInput.focus();
          promptInput.select();
        }
      });
    }
  }

  // Check Ollama/Local status
  async function checkLocalStatus() {
    const miniDot = document.getElementById('mini-status-dot');
    try {
      if (window.ultronAPI && window.ultronAPI.checkOllamaInstalled) {
        const res = await window.ultronAPI.checkOllamaInstalled();
        const isOnline = res && res.installed;
        if (miniDot) miniDot.style.background = isOnline ? 'var(--accent-green)' : 'var(--accent-yellow)';
      }
    } catch (e) {
      if (miniDot) miniDot.style.background = 'var(--accent-green)';
    }
  }

  // Load Real Installed Offline Models & Discovered Cloud Models
  async function loadOfflineModels() {
    let installedModels = [];
    const seenNames = new Set();

    // 1. Probe local Ollama endpoint directly
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.models) && data.models.length > 0) {
          data.models.forEach(m => {
            const mName = typeof m === 'string' ? m : m.name;
            if (mName && !seenNames.has(mName)) {
              seenNames.add(mName);
              installedModels.push({
                name: mName,
                provider: 'ollama',
                type: 'local'
              });
            }
          });
        }
      }
    } catch (err) {}

    // 1b. Fallback to window.ultronAPI.profileSystem()
    try {
      if (window.ultronAPI && typeof window.ultronAPI.profileSystem === 'function') {
        const sys = await window.ultronAPI.profileSystem();
        const list = sys && (sys.installedModels || sys.localModels);
        if (Array.isArray(list)) {
          list.forEach(m => {
            const mName = typeof m === 'string' ? m : m.name;
            if (mName && !seenNames.has(mName)) {
              seenNames.add(mName);
              installedModels.push({
                name: mName,
                provider: 'ollama',
                type: 'local'
              });
            }
          });
        }
      }
    } catch (e) {}

    // 2. Add Google Gemini models if configured
    try {
      const hasGeminiKey = Boolean((localStorage.getItem('ultron-gemini-api-key') || '').trim());
      if (hasGeminiKey) {
        ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'].forEach(gName => {
          if (!seenNames.has(gName)) {
            seenNames.add(gName);
            installedModels.push({
              name: gName,
              provider: 'gemini',
              type: 'cloud'
            });
          }
        });
      }
    } catch (e) {}

    // 3. Probe discovered cloud models from localStorage
    try {
      const cachedDiscovered = localStorage.getItem('ultron-discovered-provider-models');
      if (cachedDiscovered) {
        const discovered = JSON.parse(cachedDiscovered);
        for (const [provider, list] of Object.entries(discovered)) {
          if (Array.isArray(list)) {
            list.forEach(m => {
              const mName = m && (m.id || m.name);
              if (mName && !seenNames.has(mName)) {
                seenNames.add(mName);
                installedModels.push({
                  name: mName,
                  provider: provider,
                  type: 'cloud'
                });
              }
            });
          }
        }
      }
    } catch (e) {}

    const savedModel = localStorage.getItem('ultron-active-model') || '';
    const availableNames = installedModels.map(m => m.name);

    if (installedModels.length > 0) {
      if (savedModel && availableNames.includes(savedModel)) {
        activeModel = savedModel;
      } else if (!activeModel || activeModel === 'Select Model' || !availableNames.includes(activeModel)) {
        activeModel = availableNames[0];
      }
    } else {
      activeModel = 'Select Model';
    }

    updateModelSelectorLabel();
    renderModelDropdownList(installedModels);
  }

  function renderModelDropdownList(models = []) {
    if (!modelDropdownList) return;
    modelDropdownList.innerHTML = '';

    if (!models || models.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'model-dropdown-empty';
      emptyItem.style.cssText = 'padding: 14px 12px; font-size: 12px; color: rgba(255,255,255,0.45); text-align: center; line-height: 1.4;';
      emptyItem.textContent = 'No models installed or connected.';
      modelDropdownList.appendChild(emptyItem);
      return;
    }

    models.forEach(model => {
      const name = typeof model === 'string' ? model : (model.name || model.id || '');
      if (!name) return;

      const isCloud = name.endsWith('-cloud');
      const isHf = name.startsWith('hf.co/') || model.provider === 'huggingface';
      const isGptOss = name.startsWith('gpt-oss') || name.startsWith('gptoss');

      let provider = model.provider;
      if (!provider) {
        if (isCloud || isGptOss) provider = 'ollama';
        else if (isHf) provider = 'huggingface';
        else if (name.startsWith('gemini')) provider = 'gemini';
        else if (name.startsWith('claude')) provider = 'claude';
        else if (name.startsWith('deepseek')) provider = 'deepseek';
        else if (name.startsWith('gpt') || name.startsWith('o1') || name.startsWith('o3')) provider = 'openai';
        else provider = 'ollama';
      }

      const isSelected = name === activeModel;

      let iconSrc = '../../Assets/Brand-Assets/ollama-white-logo.png';
      if (isHf) {
        iconSrc = '../../Assets/Brand-Assets/hf-logo.png';
      } else if (isCloud || isGptOss) {
        iconSrc = '../../Assets/Brand-Assets/ollama-white-logo.png';
      } else if (provider === 'gemini' || name.includes('gemini')) {
        iconSrc = '../../Assets/Brand-Assets/gemini-logo.png';
      } else if (provider === 'openai' || (name.includes('gpt') && !isGptOss) || name.includes('o1') || name.includes('o3')) {
        iconSrc = '../../Assets/Brand-Assets/openai-white-logo.png';
      } else if (provider === 'claude' || name.includes('claude')) {
        iconSrc = '../../Assets/Brand-Assets/claude-logo.png';
      } else if (provider === 'deepseek' || name.includes('deepseek')) {
        iconSrc = '../../Assets/Brand-Assets/deepseek-blue-logo.png';
      } else if (provider === 'groq') {
        iconSrc = '../../Assets/Brand-Assets/grok-white-logo.png';
      } else if (provider === 'custom') {
        iconSrc = '../../Assets/Brand-Assets/openrouter-white-logo.png';
      }

      let badgeText = 'LOCAL';
      if (isHf) {
        badgeText = 'HF GGUF';
      } else if (model.type === 'cloud' || provider !== 'ollama') {
        badgeText = provider.toUpperCase();
      } else if (name.includes(':')) {
        badgeText = name.split(':')[1].toUpperCase();
      }
      const badgeHtml = badgeText === 'LATEST' ? '' : `<span class="model-dropdown-badge">${badgeText}</span>`;

      const item = document.createElement('div');
      item.className = `model-dropdown-item ${isSelected ? 'active' : ''}`;
      item.innerHTML = `
        <div class="model-dropdown-item-left">
          <img src="${iconSrc}" alt="${provider}" class="model-ollama-icon" onerror="this.src='../../Assets/Brand-Assets/ollama-white-logo.png'" />
          <span class="model-dropdown-name">${escapeHtml(name)}</span>
        </div>
        ${badgeHtml}
      `;

      item.addEventListener('click', () => {
        activeModel = name;
        localStorage.setItem('ultron-active-model', name);
        updateModelSelectorLabel();
        hideModelDropdown();
        renderModelDropdownList(models);
        promptInput.focus();
      });

      modelDropdownList.appendChild(item);
    });
  }

  function updateModelSelectorLabel() {
    if (modelSelectorLabel) {
      if (!activeModel || activeModel === 'Select Model') {
        modelSelectorLabel.innerHTML = `
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: inline-block; vertical-align: middle; margin-right: 4px;">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
            <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
            <line x1="12" y1="22.08" x2="12" y2="12"></line>
          </svg>
          <span style="color: #f59e0b; font-weight: 600;">No Models</span>
        `;
      } else {
        modelSelectorLabel.textContent = activeModel;
      }
    }
  }

  // Mini-Pill & Full Floating Mode Switching
  function showMiniPillMode() {
    floatingWrapper.classList.add('hidden');
    miniPillWidget.classList.remove('hidden');
    hidePlusMenu();
    hideModelDropdown();
    hideApprovalDropdown();
    if (!answerCard.classList.contains('hidden')) {
      hideAnswerCard();
    }
    if (window.ultronAPI && window.ultronAPI.floatingBarSetMode) {
      window.ultronAPI.floatingBarSetMode({ miniMode: true });
    }
  }

  function showFullFloatingMode() {
    miniPillWidget.classList.add('hidden');
    floatingWrapper.classList.remove('hidden');
    if (window.ultronAPI && window.ultronAPI.floatingBarSetMode) {
      window.ultronAPI.floatingBarSetMode({ miniMode: false });
    }
    // Show stacked contracted cards docked directly above the input pill
    if (!isStreaming) {
      answerCard.classList.add('hidden');
      renderSessionCardsStack();
    }
    updateTopModesVisibility();
    promptInput.focus();
  }

  // Helper to hide text/voice/approval mode pills when large popovers (plus/expanded answer) are open
  function updateTopModesVisibility() {
    const topModes = document.getElementById('floating-top-modes');
    if (!topModes) return;
    const isFullAnswerOpen = !answerCard.classList.contains('hidden') && !answerCard.classList.contains('contracted');
    const isAnyLargePopoverOpen = !plusMenuDropdown.classList.contains('hidden') || isFullAnswerOpen;
    if (isAnyLargePopoverOpen) {
      topModes.classList.add('hidden');
    } else {
      topModes.classList.remove('hidden');
    }
  }

  // Plus Menu Toggle
  function togglePlusMenu() {
    const isHidden = plusMenuDropdown.classList.contains('hidden');
    if (isHidden) {
      hideModelDropdown();
      hideApprovalDropdown();
      if (!answerCard.classList.contains('hidden')) {
        contractAnswerCard();
      }
      plusMenuDropdown.classList.remove('hidden');
      btnPlusMenu.classList.add('open');
      btnPlusMenu.querySelector('.icon-plus').classList.add('hidden');
      btnPlusMenu.querySelector('.icon-close').classList.remove('hidden');
    } else {
      hidePlusMenu();
    }
    updateTopModesVisibility();
  }

  function hidePlusMenu() {
    plusMenuDropdown.classList.add('hidden');
    btnPlusMenu.classList.remove('open');
    btnPlusMenu.querySelector('.icon-plus').classList.remove('hidden');
    btnPlusMenu.querySelector('.icon-close').classList.add('hidden');
    updateTopModesVisibility();
  }

  // Model Dropdown Toggle
  function toggleModelDropdown() {
    const isHidden = modelDropdown.classList.contains('hidden');
    if (isHidden) {
      hidePlusMenu();
      hideApprovalDropdown();
      loadOfflineModels();
      modelDropdown.classList.remove('hidden');
      modelSelectorBtn.classList.add('open');
    } else {
      hideModelDropdown();
    }
    updateTopModesVisibility();
  }

  function hideModelDropdown() {
    modelDropdown.classList.add('hidden');
    modelSelectorBtn.classList.remove('open');
    updateTopModesVisibility();
  }

  // Approval Mode Dropdown Toggle
  function toggleApprovalDropdown() {
    const isHidden = approvalDropdown.classList.contains('hidden');
    if (isHidden) {
      hidePlusMenu();
      hideModelDropdown();
      approvalDropdown.classList.remove('hidden');
      approvalPill.classList.add('open');
    } else {
      hideApprovalDropdown();
    }
    updateTopModesVisibility();
  }

  function hideApprovalDropdown() {
    approvalDropdown.classList.add('hidden');
    approvalPill.classList.remove('open');
    updateTopModesVisibility();
  }

  function setApprovalMode(mode) {
    activeApprovalMode = mode;
    approvalOptions.forEach(opt => {
      const isActive = opt.dataset.mode === mode;
      opt.classList.toggle('active', isActive);
      const check = opt.querySelector('.approval-check');
      if (check) check.classList.toggle('hidden', !isActive);

      if (isActive) {
        approvalPillLabel.textContent = opt.dataset.label;
        if (mode === 'strict') {
          approvalIconBox.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" width="13" height="13">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
          `;
        } else if (mode === 'full') {
          approvalIconBox.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="#f97316" stroke-width="2" width="13" height="13">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          `;
        } else {
          approvalIconBox.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" width="13" height="13">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <polyline points="9 12 11 14 15 10"></polyline>
            </svg>
          `;
        }
      }
    });
    hideApprovalDropdown();
  }

  let recentFloatingSessions = []; // Max 4 sessions in the floating bar stack

  function renderSessionCardsStack() {
    const container = document.getElementById('session-cards-container');
    if (!container) return;
    container.innerHTML = '';

    // If full answer card is currently open, hide the stack so only full chat is visible
    if (!answerCard.classList.contains('hidden')) {
      container.classList.add('hidden');
      return;
    }

    if (recentFloatingSessions.length === 0) {
      container.classList.add('hidden');
      return;
    }

    container.classList.remove('hidden');

    recentFloatingSessions.forEach((sess) => {
      const card = document.createElement('div');
      card.className = 'contracted-session-card';
      card.title = 'Click to open session';
      
      const titleSpan = document.createElement('span');
      titleSpan.className = 'contracted-card-title';
      titleSpan.textContent = sess.prompt;

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'contracted-card-actions';

      // Edit button
      const editBtn = document.createElement('button');
      editBtn.className = 'icon-btn-sm';
      editBtn.title = 'Edit prompt in input bar';
      editBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
          <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
        </svg>
      `;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptInput.value = sess.prompt;
        autoResizePromptInput();
        promptInput.focus();
        promptInput.select();
      });

      // Delete button (from floating view stack only)
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'icon-btn-sm btn-close-danger';
      deleteBtn.title = 'Dismiss session card (kept in main app)';
      deleteBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      `;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        recentFloatingSessions = recentFloatingSessions.filter(s => s.id !== sess.id);
        renderSessionCardsStack();
      });

      actionsDiv.appendChild(editBtn);
      actionsDiv.appendChild(deleteBtn);

      card.appendChild(titleSpan);
      card.appendChild(actionsDiv);

      card.addEventListener('click', () => {
        loadSessionIntoChat(sess);
      });

      container.appendChild(card);
    });
  }

  function loadSessionIntoChat(sess) {
    currentPromptText = sess.prompt;
    currentAnswerText = sess.answer;
    
    hidePlusMenu();
    hideModelDropdown();
    hideApprovalDropdown();

    answerModelLabel.textContent = sess.prompt;
    answerCard.classList.remove('hidden');

    const userBlock = document.getElementById('user-msg-block');
    const userText = document.getElementById('user-msg-text');
    const thinking = document.getElementById('thinking-indicator');
    const footer = document.getElementById('answer-content-footer');

    if (userBlock && userText) {
      userText.textContent = sess.prompt;
      userBlock.classList.remove('hidden');
    }
    if (thinking) thinking.classList.add('hidden');
    if (answerContent) {
      answerContent.classList.remove('hidden');
      renderAnswerContent(sess.answer);
    }
    if (footer) footer.classList.remove('hidden');

    renderSessionCardsStack();
    updateTopModesVisibility();
  }

  function addSessionToStack(prompt, answer) {
    const newSess = {
      id: Date.now().toString(),
      prompt,
      answer,
      model: activeModel,
      timestamp: Date.now()
    };
    
    // Add to start (most recent)
    recentFloatingSessions.unshift(newSess);
    // If goes beyond 4, pop the oldest from the floating stack
    if (recentFloatingSessions.length > 4) {
      recentFloatingSessions.pop();
    }
    renderSessionCardsStack();
  }

  // Answer Card Controls (Docked Response Screen with Contract/Expand)
  function contractAnswerCard() {
    if (!answerCard || answerCard.classList.contains('hidden')) return;
    answerCard.classList.add('contracted');
    if (toggleContractBtn) {
      const up = toggleContractBtn.querySelector('.icon-expand-up');
      const down = toggleContractBtn.querySelector('.icon-contract-down');
      if (up) up.classList.remove('hidden');
      if (down) down.classList.add('hidden');
      const label = document.getElementById('contract-btn-text');
      if (label) label.textContent = 'Open';
    }
    updateTopModesVisibility();
  }

  function expandAnswerCard() {
    if (!answerCard || answerCard.classList.contains('hidden')) return;
    answerCard.classList.remove('contracted');
    if (toggleContractBtn) {
      const up = toggleContractBtn.querySelector('.icon-expand-up');
      const down = toggleContractBtn.querySelector('.icon-contract-down');
      if (up) up.classList.add('hidden');
      if (down) down.classList.remove('hidden');
      const label = document.getElementById('contract-btn-text');
      if (label) label.textContent = 'Minimize';
    }
    if (currentAnswerText) {
      answerLoading.classList.add('hidden');
      answerContent.classList.remove('hidden');
    } else if (isStreaming) {
      answerLoading.classList.remove('hidden');
      answerContent.classList.add('hidden');
    }
    updateTopModesVisibility();
  }

  function toggleContractAnswerCard() {
    if (answerCard.classList.contains('contracted')) {
      expandAnswerCard();
    } else {
      contractAnswerCard();
    }
  }

  function showAnswerCard(title = 'Brown · AI Response') {
    hidePlusMenu();
    hideModelDropdown();
    hideApprovalDropdown();
    answerModelLabel.textContent = title;
    answerCard.classList.remove('hidden');
    expandAnswerCard();
    answerLoading.classList.add('hidden');
    answerContent.classList.add('hidden');
    const footer = document.getElementById('answer-content-footer');
    if (footer) footer.classList.add('hidden');
    answerContent.innerHTML = '';
    currentAnswerText = '';
    updateTopModesVisibility();
  }

  function hideAnswerCard() {
    answerCard.classList.add('hidden');
    answerCard.classList.remove('contracted');
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }
    isStreaming = false;
    currentAnswerText = '';
    renderSessionCardsStack();
    updateTopModesVisibility();
  }

  // Hand-off / Expand to Full Window
  function expandToFullApp(customPayload = null) {
    const payload = customPayload || {
      prompt: currentPromptText || promptInput.value.trim(),
      model: activeModel,
      answer: currentAnswerText
    };

    if (window.ultronAPI && window.ultronAPI.floatingBarExpandToMain) {
      window.ultronAPI.floatingBarExpandToMain(payload);
    }
  }

  // Voice Speech-To-Text Handler
  async function toggleVoiceRecording() {
    if (isRecording) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  }

  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
        micBtn.classList.remove('recording');
        isRecording = false;

        promptInput.placeholder = 'Transcribing audio...';
        try {
          const arrayBuffer = await audioBlob.arrayBuffer();
          const float32Data = new Float32Array(arrayBuffer);

          if (window.ultronAPI && window.ultronAPI.transcribeAudio) {
            const result = await window.ultronAPI.transcribeAudio({
              samples: Array.from(float32Data.slice(0, 16000 * 15)),
              sampleRate: 16000
            });
            if (result && result.text) {
              promptInput.value = result.text;
              autoResizePromptInput();
            }
          }
        } catch (transcribeErr) {
          console.warn('[FloatingBar] Transcription error:', transcribeErr);
        } finally {
          promptInput.placeholder = 'Run terminal scripts, browse code...';
          promptInput.focus();
        }
      };

      mediaRecorder.start();
      isRecording = true;
      micBtn.classList.add('recording');
      promptInput.placeholder = 'Listening... Speak now...';
    } catch (err) {
      console.warn('[FloatingBar] Mic error:', err);
      micBtn.classList.remove('recording');
      isRecording = false;
    }
  }

  function stopVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
  }

  // Vision Screen Capture Trigger
  async function triggerScreenAwareness() {
    try {
      promptInput.placeholder = 'Capturing active desktop...';
      if (window.ultronAPI && window.ultronAPI.captureScreen) {
        const capture = await window.ultronAPI.captureScreen();
        if (capture && capture.dataUrl) {
          expandToFullApp({
            prompt: promptInput.value.trim(),
            screenshot: capture.dataUrl
          });
        }
      }
    } catch (err) {
      console.warn('[FloatingBar] Screen capture failed:', err);
    } finally {
      promptInput.placeholder = 'Run terminal scripts, browse code...';
    }
  }

  // Screen Vision / Capture Handler
  async function handleScreenVision() {
    try {
      promptInput.placeholder = 'Capturing screen...';
      if (window.ultronAPI && window.ultronAPI.captureScreen) {
        const capture = await window.ultronAPI.captureScreen({});
        if (capture && capture.success) {
          expandToFullApp({
            prompt: 'Explain and assist with what is currently on my screen',
            screenshot: capture.dataUrl
          });
        }
      }
    } catch (err) {
      console.warn('[FloatingBar] Screen capture failed:', err);
    } finally {
      promptInput.placeholder = 'Run terminal scripts, browse code...';
    }
  }

  // Execute Direct Query & Expand Screen
  async function executeQuery() {
    const rawQuery = promptInput.value.trim();
    if (!rawQuery) return;
    
    currentPromptText = rawQuery;
    promptInput.value = '';
    autoResizePromptInput();

    hidePlusMenu();
    hideModelDropdown();
    hideApprovalDropdown();

    answerModelLabel.textContent = rawQuery;
    answerCard.classList.remove('hidden');
    
    const userBlock = document.getElementById('user-msg-block');
    const userText = document.getElementById('user-msg-text');
    const thinking = document.getElementById('thinking-indicator');
    const footer = document.getElementById('answer-content-footer');

    if (userBlock && userText) {
      userText.textContent = rawQuery;
      userBlock.classList.remove('hidden');
    }
    if (thinking) thinking.classList.remove('hidden');
    if (answerContent) {
      answerContent.classList.add('hidden');
      answerContent.innerHTML = '';
    }
    if (footer) footer.classList.add('hidden');
    
    currentAnswerText = '';
    renderSessionCardsStack();
    updateTopModesVisibility();

    // Toggle Send -> Stop button
    if (btnSend) btnSend.classList.add('hidden');
    if (btnStop) btnStop.classList.remove('hidden');

    isStreaming = true;
    activeAbortController = new AbortController();

    const isSimpleGreeting = /^(hello|hi|hey|good morning|good afternoon|good evening|yo)\b/i.test(rawQuery.trim());
    const systemPrompt = isSimpleGreeting
      ? 'You are Brown, a friendly and concise AI assistant for Windows. Reply with a short, warm greeting in 1-2 concise sentences.'
      : 'You are Brown, a fast, intelligent, and concise AI assistant built for Windows. Answer directly and concisely with clean markdown formatting. Avoid unnecessary corporate preamble.';

    try {
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          prompt: rawQuery,
          stream: true,
          keep_alive: '5m',
          system: systemPrompt
        }),
        signal: activeAbortController ? activeAbortController.signal : undefined
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status} - ${response.statusText}`);
      }

      if (thinking) thinking.classList.add('hidden');
      if (answerContent) answerContent.classList.remove('hidden');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffered = '';

      while (isStreaming) {
        const { done, value } = await reader.read();
        if (done) break;

        buffered += decoder.decode(value, { stream: true });
        const lines = buffered.split('\n');
        buffered = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            const token = data.response || (data.message ? data.message.content : '');
            if (token) {
              currentAnswerText += token;
              renderAnswerContent(currentAnswerText);
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // User clicked stop - keep what has been generated so far
      } else {
        if (thinking) thinking.classList.add('hidden');
        if (answerContent) answerContent.classList.remove('hidden');
        renderAnswerContent(`⚠️ **Error:** ${escapeHtml(err.message || 'Model unavailable. Please make sure Ollama is running.')}`);
      }
    } finally {
      isStreaming = false;
      activeAbortController = null;
      if (btnSend) btnSend.classList.remove('hidden');
      if (btnStop) btnStop.classList.add('hidden');
      if (thinking) thinking.classList.add('hidden');
      if (footer && currentAnswerText) {
        footer.classList.remove('hidden');
      }

      if (currentAnswerText) {
        addSessionToStack(rawQuery, currentAnswerText);

        // Realtime session synchronization to Main Window
        if (window.ultronAPI && window.ultronAPI.floatingBarSyncSession) {
          window.ultronAPI.floatingBarSyncSession({
            prompt: rawQuery,
            answer: currentAnswerText,
            model: activeModel
          });
        }
      }
    }
  }

  function renderAnswerContent(markdown) {
    if (window.ultronAPI && window.ultronAPI.parseMarkdown) {
      answerContent.innerHTML = window.ultronAPI.parseMarkdown(markdown);
    } else {
      answerContent.textContent = markdown;
    }
    // Auto-scroll dynamically with real-time text typing
    const chatScroll = document.getElementById('chat-messages-scroll');
    if (chatScroll) {
      chatScroll.scrollTop = chatScroll.scrollHeight;
    }
    const answerBody = document.getElementById('answer-body');
    if (answerBody) {
      answerBody.scrollTop = answerBody.scrollHeight;
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Auto-resize prompt textarea up to 4 lines with smooth scroll
  function autoResizePromptInput() {
    if (!promptInput) return;
    const capsuleBar = document.getElementById('capsule-bar');
    promptInput.style.height = '36px';
    const scrollHeight = promptInput.scrollHeight;
    const maxHeight = 96; // Fit up to 4 lines of text
    if (scrollHeight > 40) {
      if (capsuleBar) capsuleBar.classList.add('multiline');
      if (scrollHeight > maxHeight) {
        promptInput.style.height = maxHeight + 'px';
        promptInput.classList.add('scrollable');
      } else {
        promptInput.style.height = scrollHeight + 'px';
        promptInput.classList.remove('scrollable');
      }
    } else {
      if (capsuleBar) capsuleBar.classList.remove('multiline');
      promptInput.style.height = '36px';
      promptInput.classList.remove('scrollable');
    }
  }

  // Event Listeners Setup
  function setupEventListeners() {
    // Mini-pill click -> Expand to full floating companion bar
    if (miniPillMainClick) {
      miniPillMainClick.addEventListener('click', (e) => {
        e.stopPropagation();
        showFullFloatingMode();
      });
    }

    // Mini-pill close (✕) button -> Hide mini pill completely
    if (miniPillCloseBtn) {
      miniPillCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.ultronAPI && window.ultronAPI.floatingBarHide) {
          window.ultronAPI.floatingBarHide({ force: true });
        }
      });
    }

    // Plus Button toggle
    btnPlusMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePlusMenu();
    });

    // Model Selector button toggle
    modelSelectorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleModelDropdown();
    });

    // Approval Pill toggle
    approvalPill.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleApprovalDropdown();
    });

    // Action buttons inside plus menu
    const btnAttach = document.getElementById('plus-action-attach');
    if (btnAttach) {
      btnAttach.addEventListener('click', () => {
        hidePlusMenu();
        if (window.ultronAPI && window.ultronAPI.floatingBarExpandToMain) {
          window.ultronAPI.floatingBarExpandToMain({ action: 'attach-files' });
        }
      });
    }

    // Model download button
    const btnDownloadModels = document.getElementById('btn-dropdown-download-models');
    if (btnDownloadModels) {
      btnDownloadModels.addEventListener('click', () => {
        hideModelDropdown();
        if (window.ultronAPI && window.ultronAPI.floatingBarExpandToMain) {
          window.ultronAPI.floatingBarExpandToMain({ action: 'open-settings-models' });
        }
      });
    }

    // Approval option item selection
    approvalOptions.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        setApprovalMode(opt.dataset.mode);
      });
    });

    // Agent options toggles
    [plusToggleAgentTools, plusToggleWebSearch].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => {
          btn.classList.toggle('active');
          const indicator = btn.querySelector('.toggle-indicator');
          if (indicator) indicator.classList.toggle('active');
        });
      }
    });

    // Vision / Screen aware button inside Plus Agent Options
    if (plusToggleScreenAware) {
      plusToggleScreenAware.addEventListener('click', () => {
        hidePlusMenu();
        handleScreenVision();
      });
    }

    // Send Button click
    btnSend.addEventListener('click', () => {
      executeQuery();
    });

    // Stop Button click (Abort streaming generation)
    if (btnStop) {
      btnStop.addEventListener('click', (e) => {
        e.stopPropagation();
        if (activeAbortController) {
          activeAbortController.abort();
        }
        isStreaming = false;
        if (btnSend) btnSend.classList.remove('hidden');
        if (btnStop) btnStop.classList.add('hidden');
        const thinking = document.getElementById('thinking-indicator');
        if (thinking) thinking.classList.add('hidden');
        const footer = document.getElementById('answer-content-footer');
        if (footer && currentAnswerText) {
          footer.classList.remove('hidden');
        }
      });
    }

    // Auto-resize on input typing/pasting
    promptInput.addEventListener('input', autoResizePromptInput);

    // Input Keydown Handling
    promptInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        if (e.shiftKey) {
          // Allow newline with Shift+Enter
          setTimeout(autoResizePromptInput, 0);
          return;
        }
        e.preventDefault();
        await executeQuery();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        expandToFullApp();
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        if (!plusMenuDropdown.classList.contains('hidden')) {
          hidePlusMenu();
          return;
        }
        if (!modelDropdown.classList.contains('hidden')) {
          hideModelDropdown();
          return;
        }
        if (!approvalDropdown.classList.contains('hidden')) {
          hideApprovalDropdown();
          return;
        }
        if (!answerCard.classList.contains('hidden')) {
          hideAnswerCard();
          return;
        }
        if (window.ultronAPI && window.ultronAPI.floatingBarHide) {
          window.ultronAPI.floatingBarHide();
        }
        return;
      }
    });

    // Mic button (placed directly on exact left of send button)
    if (micBtn) {
      micBtn.addEventListener('click', () => toggleVoiceRecording());
    }

    // Expand button (External on right side)
    if (expandBtn) {
      expandBtn.addEventListener('click', () => expandToFullApp());
    }

    // Edit Prompt Button (Pencil Icon)
    if (editPromptBtn) {
      editPromptBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentPromptText) {
          promptInput.value = currentPromptText;
          autoResizePromptInput();
        }
        promptInput.focus();
        promptInput.select();
      });
    }

    // Open / Minimize Response Toggle Button
    if (toggleContractBtn) {
      toggleContractBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleContractAnswerCard();
      });
    }

    // Clicking header or session title toggles expand / contract in the same response area
    if (answerHeader) {
      answerHeader.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          toggleContractAnswerCard();
        }
      });
    }

    // Answer Card buttons
    if (copyAnswerBtn) {
      copyAnswerBtn.addEventListener('click', () => {
        if (currentAnswerText) {
          navigator.clipboard.writeText(currentAnswerText);
          const lbl = copyAnswerBtn.querySelector('.btn-label-text');
          if (lbl) lbl.textContent = 'Copied!';
          setTimeout(() => { 
            if (lbl) lbl.textContent = 'Copy'; 
          }, 2000);
        }
      });
    }

    // Footer Copy Button (Below text)
    const footerCopyBtn = document.getElementById('footer-copy-btn');
    if (footerCopyBtn) {
      footerCopyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentAnswerText) {
          navigator.clipboard.writeText(currentAnswerText);
          const txt = footerCopyBtn.querySelector('.footer-btn-text');
          if (txt) txt.textContent = 'Copied!';
          setTimeout(() => {
            if (txt) txt.textContent = 'Copy';
          }, 2000);
        }
      });
    }

    // Footer Speak Button (TTS)
    const footerSpeakBtn = document.getElementById('footer-speak-btn');
    if (footerSpeakBtn) {
      footerSpeakBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!currentAnswerText) return;
        if (window.speechSynthesis) {
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            footerSpeakBtn.classList.remove('speaking');
            const txt = footerSpeakBtn.querySelector('.footer-btn-text');
            if (txt) txt.textContent = 'Speak';
          } else {
            const cleaned = currentAnswerText
              .replace(/```[\s\S]*?```/g, '')
              .replace(/`([^`]+)`/g, '$1')
              .replace(/[*_~#>]/g, '')
              .trim();
            const utterance = new SpeechSynthesisUtterance(cleaned || currentAnswerText);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.onend = () => {
              footerSpeakBtn.classList.remove('speaking');
              const txt = footerSpeakBtn.querySelector('.footer-btn-text');
              if (txt) txt.textContent = 'Speak';
            };
            utterance.onerror = () => {
              footerSpeakBtn.classList.remove('speaking');
              const txt = footerSpeakBtn.querySelector('.footer-btn-text');
              if (txt) txt.textContent = 'Speak';
            };
            footerSpeakBtn.classList.add('speaking');
            const txt = footerSpeakBtn.querySelector('.footer-btn-text');
            if (txt) txt.textContent = 'Stop';
            window.speechSynthesis.speak(utterance);
          }
        }
      });
    }

    if (expandAnswerBtn) {
      expandAnswerBtn.addEventListener('click', () => expandToFullApp());
    }

    if (closeAnswerBtn) {
      closeAnswerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideAnswerCard();
      });
    }

    // Window blur or click outside: hide expanded floating bar and show mini Ask Ultron pill
    window.addEventListener('blur', () => {
      if (!floatingWrapper.classList.contains('hidden')) {
        showMiniPillMode();
      }
    });

    // Dismiss popovers or collapse to mini pill when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#btn-plus-menu') && !e.target.closest('#plus-menu-dropdown')) {
        hidePlusMenu();
      }
      if (!e.target.closest('#model-selector-btn') && !e.target.closest('#model-dropdown')) {
        hideModelDropdown();
      }
      if (!e.target.closest('#approval-pill') && !e.target.closest('#approval-dropdown')) {
        hideApprovalDropdown();
      }
      if (!e.target.closest('#answer-card') && !e.target.closest('#capsule-bar') && !e.target.closest('#session-cards-container') && !answerCard.classList.contains('hidden')) {
        hideAnswerCard();
      }

      // If clicked outside all floating interactive widgets, collapse to mini pill
      if (!floatingWrapper.classList.contains('hidden') &&
          !e.target.closest('#capsule-bar') &&
          !e.target.closest('#answer-card') &&
          !e.target.closest('#session-cards-container') &&
          !e.target.closest('.popover-card') &&
          !e.target.closest('#floating-top-modes') &&
          !e.target.closest('#mini-pill-widget')) {
        showMiniPillMode();
      }
    });
  }

  // Run initialization
  document.addEventListener('DOMContentLoaded', init);
})();
