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

  // Load Real Installed Offline Models
  async function loadOfflineModels() {
    let installedModels = [];

    // Probe local Ollama endpoint directly
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      if (response.ok) {
        const data = await response.json();
        if (data && Array.isArray(data.models) && data.models.length > 0) {
          installedModels = data.models;
        }
      }
    } catch (err) {
      try {
        if (window.ultronAPI && window.ultronAPI.profileSystem) {
          const sys = await window.ultronAPI.profileSystem();
          if (sys && sys.localModels && sys.localModels.length > 0) {
            installedModels = sys.localModels;
          }
        }
      } catch (e) {}
    }

    if (installedModels.length > 0) {
      const names = installedModels.map(m => typeof m === 'string' ? m : m.name);
      if (names.includes('phi3:latest')) {
        activeModel = 'phi3:latest';
      } else if (names.includes('gemma4:latest')) {
        activeModel = 'gemma4:latest';
      } else {
        activeModel = names[0];
      }
    } else {
      installedModels = [{ name: 'phi3:latest' }, { name: 'gemma4:latest' }];
      activeModel = 'phi3:latest';
    }

    updateModelSelectorLabel();
    renderModelDropdownList(installedModels);
  }

  function renderModelDropdownList(models) {
    if (!modelDropdownList) return;
    modelDropdownList.innerHTML = '';

    models.forEach(model => {
      const name = typeof model === 'string' ? model : model.name;
      const isSelected = name === activeModel;

      let badgeText = 'LATEST';
      if (name.includes(':')) {
        badgeText = name.split(':')[1].toUpperCase();
      }

      const item = document.createElement('div');
      item.className = `model-dropdown-item ${isSelected ? 'active' : ''}`;
      item.innerHTML = `
        <div class="model-dropdown-item-left">
          <img src="../../Assets/ollama-logo.png" alt="Ollama" class="model-ollama-icon" onerror="this.src='../Assets/ollama-logo.png'" />
          <span class="model-dropdown-name">${escapeHtml(name)}</span>
        </div>
        <span class="model-dropdown-badge">${badgeText}</span>
      `;

      item.addEventListener('click', () => {
        activeModel = name;
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
      modelSelectorLabel.textContent = activeModel;
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
      contractAnswerCard();
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

  function showAnswerCard(title = 'Ultron · AI Response') {
    hidePlusMenu();
    hideModelDropdown();
    hideApprovalDropdown();
    answerModelLabel.textContent = title;
    answerCard.classList.remove('hidden');
    expandAnswerCard();
    answerLoading.classList.remove('hidden');
    answerContent.classList.add('hidden');
    answerContent.innerHTML = '';
    currentAnswerText = '';
    updateTopModesVisibility();
  }

  function hideAnswerCard() {
    answerCard.classList.add('hidden');
    answerCard.classList.remove('contracted');
    isStreaming = false;
    currentAnswerText = '';
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
    }
  }

  function stopVoiceRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
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
    const preview = rawQuery.length > 32 ? rawQuery.substring(0, 30) + '...' : rawQuery;
    showAnswerCard(`Ultron · ${activeModel}: "${preview}"`);
    isStreaming = true;

    try {
      const response = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: activeModel,
          prompt: rawQuery,
          stream: true,
          system: 'You are Ultron, a fast, intelligent, and concise AI assistant built for Windows. Answer directly and concisely with markdown formatting.'
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP ${response.status} - ${response.statusText}`);
      }

      answerLoading.classList.add('hidden');
      answerContent.classList.remove('hidden');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (isStreaming) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.response) {
              currentAnswerText += data.response;
              renderAnswerContent(currentAnswerText);
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      renderAnswerContent(`⚠️ **Error:** ${escapeHtml(err.message || 'Model unavailable')}`);
    } finally {
      isStreaming = false;
      answerLoading.classList.add('hidden');
    }
  }

  function renderAnswerContent(markdown) {
    if (window.ultronAPI && window.ultronAPI.parseMarkdown) {
      answerContent.innerHTML = window.ultronAPI.parseMarkdown(markdown);
    } else {
      answerContent.textContent = markdown;
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

  // Auto-resize prompt textarea up to 5 lines with smooth scroll
  function autoResizePromptInput() {
    if (!promptInput) return;
    promptInput.style.height = 'auto';
    const scrollHeight = promptInput.scrollHeight;
    const maxHeight = 108; // Fit up to 5 lines of text
    if (scrollHeight > maxHeight) {
      promptInput.style.height = maxHeight + 'px';
      promptInput.classList.add('scrollable');
    } else {
      promptInput.style.height = Math.max(34, scrollHeight) + 'px';
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

    // Approval option item selection
    approvalOptions.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        setApprovalMode(opt.dataset.mode);
      });
    });

    // Download Models item click -> Expand to full app settings/models
    btnDropdownDownloadModels.addEventListener('click', () => {
      hideModelDropdown();
      expandToFullApp({ action: 'open-settings-models' });
    });

    // Attach files click
    plusActionAttach.addEventListener('click', () => {
      hidePlusMenu();
      expandToFullApp({ action: 'attach-files' });
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
      promptInput.value = '';
      autoResizePromptInput();
    });

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
        promptInput.value = '';
        autoResizePromptInput();
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
          if (!answerCard.classList.contains('contracted')) {
            contractAnswerCard();
          } else {
            hideAnswerCard();
          }
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

    if (expandAnswerBtn) {
      expandAnswerBtn.addEventListener('click', () => expandToFullApp());
    }

    if (closeAnswerBtn) {
      closeAnswerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        hideAnswerCard();
      });
    }

    // Dismiss popovers when clicking anywhere outside
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
      if (!e.target.closest('#answer-card') && !e.target.closest('#capsule-bar') && !answerCard.classList.contains('hidden')) {
        contractAnswerCard();
      }
    });
  }

  // Run initialization
  document.addEventListener('DOMContentLoaded', init);
})();
