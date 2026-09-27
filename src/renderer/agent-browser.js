/* Browser chrome only. The main process owns the WebContentsView and agent runs. */
(function () {
  'use strict';

  const api = window.ultronAPI;
  const MAX_ACTIONS = 30;
  const modes = new Set(['idle', 'running', 'paused', 'manual', 'stopped']);
  const statuses = new Set(['planned', 'running', 'succeeded', 'failed', 'cancelled']);
  const state = {
    visible: false, mode: 'idle', url: '', title: '', loading: false,
    canGoBack: false, canGoForward: false, detached: false, runId: null, approval: null, error: null
  };
  const ui = {};
  let available = typeof api?.browserCommand === 'function' && typeof api?.onBrowserEvent === 'function';
  let enabled = false;
  let paneOpen = false;
  let animating = false;
  let closeTimer = null;
  let narrow = false;
  let selectedTab = 'browser';
  let split = 50;
  let dragPointer = null;
  let localError = '';
  let approvalInFlight = null;
  let frame = 0;
  let placing = false;
  let placeAgain = false;
  let lastPlacement = '';
  let lastBounds = { x: 0, y: 0, width: 0, height: 0 };
  let nativeShown = false;
  let eventRevision = 0;
  let requestSequence = 0;
  let appliedReply = 0;
  let activeRun = null;
  let pendingRun = null;
  const finishedRuns = new Set();
  const blockers = new Set();
  const observed = new WeakSet();
  const blockerSelector = [
    'dialog', '[role="dialog"]', '[aria-modal="true"]', '[popover]',
    '.settings-modal-overlay', '.modal-overlay', '.permission-modal',
    '.confirm-action-modal', '.mobile-pair-modal', '#chat-search-overlay',
    '#onboarding-screen', '#app-splash-screen', '#app-skeleton-overlay', '#voice-mode-stage'
  ].join(',');

  function element(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }

  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }

  function button(label, onClick, className = '') {
    const el = element('button', `agent-browser-button ${className}`.trim(), label);
    el.type = 'button';
    el.addEventListener('click', onClick);
    return el;
  }

  function icon(paths) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of paths) {
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    }
    return svg;
  }

  function globe() {
    return icon([
      'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
      'M3 12h18M12 3c4 4.5 4 13.5 0 18-4-4.5-4-13.5 0-18Z'
    ]);
  }

  function brandMark() {
    return element('span', 'agent-browser-brand');
  }

  async function command(name, fields = {}, quiet = false) {
    if (!available) return { success: false, error: 'Browser controls are unavailable in this build.' };
    const revision = eventRevision;
    const sequence = ++requestSequence;
    let result;
    try {
      result = await api.browserCommand({ command: name, ...fields });
      if (!result || typeof result !== 'object') throw new Error('No response from the browser controller.');
    } catch (error) {
      result = { success: false, error: error?.message || 'The browser controller could not be reached.' };
    }
    // Events are newer than in-flight snapshots; never roll their state back.
    if (revision === eventRevision && sequence >= appliedReply) {
      appliedReply = sequence;
      applyState(result.state || result);
    }
    if (result.success === false && !quiet) {
      localError = String(result.error || 'The browser command could not be completed.');
      render();
    }
    return result;
  }

  function applyState(next) {
    if (!next || typeof next !== 'object') return;
    const previousApproval = state.approval?.id;
    for (const key of ['url', 'title']) {
      if (typeof next[key] === 'string') state[key] = next[key];
    }
    for (const key of ['visible', 'loading', 'canGoBack', 'canGoForward', 'detached']) {
      if (typeof next[key] === 'boolean') state[key] = next[key];
    }
    if (modes.has(next.mode)) state.mode = next.mode;
    if (next.runId === null || typeof next.runId === 'string') state.runId = next.runId;
    if ('error' in next) state.error = next.error ? String(next.error) : null;
    if ('approval' in next) {
      state.approval = next.approval && typeof next.approval.id === 'string'
        ? { id: next.approval.id, title: String(next.approval.title || 'Review browser action'), detail: String(next.approval.detail || '') }
        : null;
    }
    if (previousApproval !== state.approval?.id) {
      approvalInFlight = null;
      if (state.approval && paneOpen) selectedTab = 'browser';
    }
    if (next.visible === true && !placing && lastPlacement === '{"visible":false}') lastPlacement = '';
    render();
    scheduleBounds();
    if (state.approval && previousApproval !== state.approval.id) {
      window.requestAnimationFrame(() => {
        if (paneOpen && state.approval && isVisible(ui.approval) && !hasBlocker()) ui.approval.focus();
      });
    }
  }

  function render() {
    if (!ui.pane) return;
    ui.pane.hidden = !paneOpen;
    ui.splitter.hidden = !paneOpen || narrow;
    ui.tabs.hidden = !paneOpen || !narrow;
    ui.view.classList.toggle('agent-browser-open', paneOpen);
    ui.view.classList.toggle('agent-browser-narrow', narrow && paneOpen);
    ui.view.dataset.browserTab = selectedTab;
    ui.toggle.setAttribute('aria-pressed', String(enabled));
    ui.toggle.setAttribute('aria-expanded', String(paneOpen));
    ui.toggle.title = paneOpen ? 'Close browser · turn off browse mode' : 'Open browser · turn on browse mode';
    for (const [name, tab] of Object.entries(ui.tabButtons)) {
      tab.setAttribute('aria-selected', String(name === selectedTab));
      tab.tabIndex = name === selectedTab ? 0 : -1;
    }
    const approval = state.approval;
    const error = localError || state.error || (!available ? 'Browser controls are unavailable in this build.' : '');
    setText(ui.status, approval ? 'Review required' : state.loading ? 'Loading' : {
      idle: 'Ready', running: 'Browsing', paused: 'Paused', manual: 'You have control', stopped: 'Stopped'
    }[state.mode]);
    ui.status.dataset.mode = approval ? 'review' : state.mode;
    ui.toggle.classList.toggle('agent-browser-needs-review', Boolean(approval));
    setText(ui.title, state.title || 'Browser');
    ui.title.title = state.title || 'Browser';
    if (document.activeElement !== ui.url) ui.url.value = state.url === 'about:blank' ? '' : state.url;
    const navigationLocked = !available || Boolean(approval) || state.mode === 'running';
    ui.url.disabled = navigationLocked;
    ui.go.disabled = navigationLocked;
    ui.back.disabled = navigationLocked || !state.canGoBack;
    ui.forward.disabled = navigationLocked || !state.canGoForward;
    ui.reload.disabled = navigationLocked || !state.url || state.url === 'about:blank';
    ui.popout.disabled = !available;
    ui.popoutIcons.popout.toggleAttribute('hidden', state.detached);
    ui.popoutIcons.dock.toggleAttribute('hidden', !state.detached);
    const popoutLabel = state.detached ? 'Return browser to this window' : 'Open browser in a separate window';
    ui.popout.title = popoutLabel;
    ui.popout.setAttribute('aria-label', popoutLabel);
    ui.pause.hidden = state.mode === 'paused' || state.mode === 'manual';
    ui.pause.disabled = !available || state.mode !== 'running';
    ui.resume.hidden = !ui.pause.hidden;
    ui.resume.disabled = !available || Boolean(approval) || !state.runId;
    ui.stop.disabled = !available || !['running', 'paused', 'manual'].includes(state.mode);
    ui.takeover.disabled = !available || state.mode === 'manual' || Boolean(approval);
    ui.viewport.hidden = Boolean(approval);
    ui.approval.hidden = !approval;
    ui.approve.disabled = !available || approvalInFlight !== null;
    ui.deny.disabled = ui.approve.disabled;
    setText(ui.approvalTitle, approval?.title || 'Review browser action');
    setText(ui.approvalDetail, approval?.detail || '');
    setText(ui.approvalHint, approvalInFlight ? 'Sending your decision…' : 'Only approve actions you understand.');
    ui.error.hidden = !error;
    setText(ui.error, error);
    setText(ui.guidance, state.mode === 'manual'
      ? 'You have control. Enter credentials only in the page, never in chat.'
      : 'Public pages only. Interactive actions require review. Use Take over for credentials.');
  }

  function isVisible(el) {
    if (!el?.isConnected) return false;
    for (let node = el; node instanceof Element; node = node.parentElement) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function hasBlocker() {
    for (const el of blockers) {
      if (!el.isConnected) { blockers.delete(el); continue; }
      if (isVisible(el)) return true;
    }
    return false;
  }

  function placement() {
    if (animating) return { visible: false };
    if (paneOpen && state.approval) return { visible: false, approval: true };
    if (!paneOpen || document.hidden || dragPointer !== null ||
        (narrow && selectedTab !== 'browser') || !isVisible(ui.viewport) || hasBlocker()) {
      return { visible: false };
    }
    const rect = ui.viewport.getBoundingClientRect();
    // CSS pixels are DIP here. The main process, not devicePixelRatio, handles zoom.
    const x = Math.max(0, Math.ceil(rect.left));
    const y = Math.max(0, Math.ceil(rect.top));
    const width = Math.max(0, Math.min(window.innerWidth, Math.floor(rect.right)) - x);
    const height = Math.max(0, Math.min(window.innerHeight, Math.floor(rect.bottom)) - y);
    return width && height ? { visible: true, bounds: { x, y, width, height } } : { visible: false };
  }

  function scheduleBounds() {
    if (!ui.pane || frame) return;
    frame = window.requestAnimationFrame(flushBounds);
  }

  async function flushBounds() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (!available) return;
    if (placing) { placeAgain = true; return; }
    let target = placement();
    let key = JSON.stringify(target);
    if (key === lastPlacement) return;
    placing = true;
    lastPlacement = key;
    try {
      if (target.visible && !nativeShown) {
        const result = await command('show'); // Creates a blank view; never starts an agent run.
        nativeShown = result.success !== false;
        // Close, dialogs, approvals, or a tab switch can happen during the invoke.
        target = placement();
        key = JSON.stringify(target);
        lastPlacement = key;
        if (!nativeShown && target.visible) return;
      }
      if (target.visible) {
        lastBounds = target.bounds;
        await command('bounds', target);
      } else if (target.approval) {
        // Approval already hides the view in main. Do not also pause the run via hide.
        await command('bounds', { bounds: lastBounds, visible: false });
      } else {
        const result = await command('hide');
        if (result.success !== false) nativeShown = false;
      }
    } finally {
      placing = false;
      if (placeAgain) {
        placeAgain = false;
        if (document.hidden) void flushBounds();
        else scheduleBounds();
      }
    }
  }

  function collapseSidebarForPane() {
    const nav = document.getElementById('left-sidebar');
    if (!nav || nav.classList.contains('collapsed')) return;
    nav.classList.add('collapsed');
    try { localStorage.setItem('ultron-left-sidebar-collapsed', 'true'); } catch (e) {}
  }

  function openPane(explicit) {
    if (!ui.pane) return false;
    if (explicit) enabled = true;
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; ui.view.classList.remove('agent-browser-closing'); }
    paneOpen = true;
    selectedTab = 'browser';
    localError = '';
    lastPlacement = '';
    animating = true;
    collapseSidebarForPane();
    render();
    ui.view.classList.add('agent-browser-opening');
    scheduleBounds();
    setTimeout(() => {
      animating = false;
      ui.view.classList.remove('agent-browser-opening');
      scheduleBounds();
    }, 320);
    return true;
  }

  function closePane() {
    enabled = false;
    endDrag();
    ui.toggle.focus();
    if (closeTimer) return;
    if (!paneOpen) { render(); scheduleBounds(); return; }
    animating = true;
    scheduleBounds(); // Pull the native surface before the pane slides out.
    ui.view.classList.add('agent-browser-closing');
    closeTimer = setTimeout(() => {
      closeTimer = null;
      paneOpen = false;
      animating = false;
      ui.view.classList.remove('agent-browser-closing');
      render();
      scheduleBounds();
    }, 280);
  }

  async function control(name, fields = {}) {
    localError = '';
    render();
    const result = await command(name, fields);
    scheduleBounds();
    return result;
  }

  async function decide(approved) {
    if (!state.approval || approvalInFlight !== null) return;
    const id = state.approval.id;
    approvalInFlight = id;
    render();
    const result = await control('approve', { id, approved });
    if (approvalInFlight === id) {
      // Keep the decision locked and native slot hidden until the controller clears approval.
      if (result.success !== false && state.approval?.id === id) {
        setText(ui.approvalHint, 'Waiting for the browser controller…');
      } else {
        approvalInFlight = null;
        render();
      }
    }
  }

  function navigate(event) {
    event.preventDefault();
    if (ui.go.disabled) return;
    let url;
    try {
      url = new URL(ui.url.value.trim());
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      if (url.username || url.password) {
        localError = 'Do not include credentials in a URL. Open the public page, then use Take over.';
        render();
        return;
      }
    } catch {
      localError = 'Enter a full public http:// or https:// address.';
      render();
      ui.url.focus();
      return;
    }
    void control('navigate', { url: url.href });
  }

  function selectTab(name, focus = false) {
    selectedTab = name;
    render();
    scheduleBounds();
    if (focus) ui.tabButtons[name].focus();
  }

  function setSplit(value) {
    split = Math.max(30, Math.min(70, value));
    ui.view.style.setProperty('--agent-chat-share', `${split}%`);
    ui.splitter.setAttribute('aria-valuenow', String(Math.round(split)));
    ui.splitter.setAttribute('aria-valuetext', `Chat ${Math.round(split)} percent, browser ${100 - Math.round(split)} percent`);
    scheduleBounds();
  }

  function endDrag() {
    if (dragPointer === null) return;
    const pointer = dragPointer;
    dragPointer = null;
    if (ui.splitter.hasPointerCapture(pointer)) ui.splitter.releasePointerCapture(pointer);
    ui.view.classList.remove('agent-browser-dragging');
    scheduleBounds();
  }

  function watchVisibility() {
    const observer = new MutationObserver(records => {
      if (records.some(record => record.oldValue !== record.target.getAttribute(record.attributeName))) scheduleBounds();
    });
    function watch(el) {
      if (!el || observed.has(el)) return;
      observed.add(el);
      observer.observe(el, { attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden', 'data-theme'] });
    }
    function discover(root) {
      if (!(root instanceof Element)) return;
      const matches = root.matches(blockerSelector) ? [root] : [];
      matches.push(...root.querySelectorAll(blockerSelector));
      for (const el of matches) {
        blockers.add(el);
        for (let node = el; node; node = node.parentElement) watch(node);
      }
    }
    discover(document.body);
    for (let node = ui.viewport; node; node = node.parentElement) watch(node);
    // Only modal host children, never the streaming chat subtree.
    const hosts = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) discover(node);
      }
      scheduleBounds();
    });
    for (const host of new Set([document.body, ui.view.parentElement, ui.view])) {
      if (host) hosts.observe(host, { childList: true });
    }
    document.addEventListener('toggle', event => {
      if (event.target instanceof Element && event.target.matches(blockerSelector)) {
        discover(event.target);
        scheduleBounds();
      }
    }, true);
    const resize = new ResizeObserver(() => {
      const nextNarrow = ui.view.getBoundingClientRect().width < 760;
      if (nextNarrow !== narrow) { narrow = nextNarrow; render(); }
      scheduleBounds();
    });
    for (const el of [ui.view, ui.chat, ui.viewport, ui.pane]) resize.observe(el);
    window.addEventListener('resize', scheduleBounds);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        endDrag();
        void flushBounds(); // Hidden documents may suspend rAF entirely.
      } else scheduleBounds();
    });
    window.addEventListener('blur', endDrag);
    window.addEventListener('scroll', event => {
      if (event.target === document || (event.target instanceof Element && event.target.contains(ui.viewport))) scheduleBounds();
    }, true);
    document.addEventListener('transitionend', event => {
      if (observed.has(event.target)) scheduleBounds();
    }, true);
    window.addEventListener('pagehide', () => { void command('hide', {}, true); });
  }

  function createRun(id) {
    return { id, actions: new Map(), nodes: new Map(), details: null, summary: null, list: null, answerEl: null, contentEl: null };
  }

  function rememberFinished(id) {
    finishedRuns.add(id);
    if (finishedRuns.size > 64) finishedRuns.delete(finishedRuns.values().next().value);
  }

  function updateTranscript(run, finished = false) {
    if (!run.details) return;
    setText(run.summary, `${finished ? 'Browser activity · finished' : 'Browser activity'} · ${run.actions.size}${run.actions.size === MAX_ACTIONS ? ' latest' : ''} action${run.actions.size === 1 ? '' : 's'}`);
    for (const [id, row] of run.nodes) {
      if (!run.actions.has(id)) { row.remove(); run.nodes.delete(id); }
    }
    for (const [id, action] of run.actions) {
      let row = run.nodes.get(id);
      if (!row) {
        row = element('li', 'agent-browser-action');
        row.append(element('span', 'agent-browser-action-status'), element('span', 'agent-browser-action-copy'));
        run.nodes.set(id, row);
        run.list.append(row);
      }
      row.dataset.status = action.status;
      setText(row.firstChild, action.status);
      setText(row.lastChild, [action.action, action.message, action.url].filter(Boolean).join(' · '));
    }
    if (finished) run.details.open = false;
  }

  function onAction(event) {
    if (typeof event.runId !== 'string' || typeof event.actionId !== 'string' ||
        !statuses.has(event.status) || finishedRuns.has(event.runId)) return;
    let run;
    if (activeRun?.id === event.runId) {
      if (!activeRun.contentEl.isConnected || !activeRun.contentEl.contains(activeRun.details)) {
        rememberFinished(activeRun.id);
        activeRun = null;
        return;
      }
      run = activeRun;
    } else {
      // One bounded pre-attachment buffer; it can never write to another run's DOM.
      if (!pendingRun || pendingRun.id === event.runId || state.runId === event.runId) {
        if (pendingRun?.id !== event.runId) pendingRun = createRun(event.runId);
        run = pendingRun;
      } else return;
    }
    run.actions.set(event.actionId, {
      action: typeof event.action === 'string' ? event.action : 'Browser action',
      status: event.status,
      message: typeof event.message === 'string' ? event.message : '',
      url: typeof event.url === 'string' ? event.url : ''
    });
    if (run.actions.size > MAX_ACTIONS) run.actions.delete(run.actions.keys().next().value);
    updateTranscript(run);
  }

  function onScreenshot(event) {
    if (!activeRun || activeRun.id !== event.runId || !activeRun.contentEl.isConnected ||
        typeof event.dataUrl !== 'string' || !event.dataUrl.startsWith('data:image/png;base64,')) return;
    const figure = element('figure', 'agent-browser-screenshot');
    const image = element('img');
    image.src = event.dataUrl;
    image.alt = 'Browser viewport captured with your approval';
    figure.append(image, element('figcaption', '', event.url || 'Browser viewport'));
    activeRun.details.append(figure);
    const captures = activeRun.details.querySelectorAll('.agent-browser-screenshot');
    if (captures.length > 3) captures[0].remove();
  }

  function attachRun(runId, contentEl) {
    if (typeof runId !== 'string' || !runId || !(contentEl instanceof Element)) return null;
    if (activeRun?.id === runId) {
      return activeRun.contentEl === contentEl && contentEl.contains(activeRun.answerEl) ? activeRun.answerEl : null;
    }
    if (finishedRuns.has(runId)) return null;
    if (activeRun) finishRun(activeRun.id);
    const run = pendingRun?.id === runId ? pendingRun : createRun(runId);
    pendingRun = null;
    run.contentEl = contentEl;
    run.details = element('details', 'agent-browser-transcript');
    run.details.open = true;
    run.summary = element('summary');
    run.list = element('ol', 'agent-browser-actions');
    run.list.setAttribute('aria-label', 'Browser actions');
    run.details.append(run.summary, run.list);
    run.answerEl = element('div', 'agent-browser-answer');
    // Preserve existing text/children and their listeners. Streaming belongs only in answerEl.
    run.answerEl.append(...Array.from(contentEl.childNodes));
    contentEl.append(run.details, run.answerEl);
    activeRun = run;
    updateTranscript(run);
    openPane(false);
    return run.answerEl;
  }

  function finishRun(runId) {
    if (typeof runId !== 'string') return;
    rememberFinished(runId);
    if (pendingRun?.id === runId) pendingRun = null;
    if (activeRun?.id !== runId) return;
    updateTranscript(activeRun, true);
    activeRun = null;
  }

  function wantsBrowser(prompt) {
    if (typeof prompt !== 'string') return false;
    const text = prompt.replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]*)`/g, (_match, value) => /^https?:\/\/\S+$/i.test(value) ? value : '').trim();
    if (!text || /\b(?:do not|don't|without|never)\s+(?:use\s+(?:a\s+|the\s+)?browser|browse)\b/i.test(text)) return false;
    const codeTask = /\b(?:write|create|build|implement|generate|debug|fix|test)\b[\s\S]{0,90}\b(?:code|script|function|component|app|url|link|browser|html|javascript|python|test)\b/i.test(text);
    const explanation = /\b(?:explain|what\s+(?:is|are|does)|how\s+(?:does|do|to)|define)\b[\s\S]{0,70}\b(?:browsers?|browsing|browse|urls?)\b/i.test(text);
    if (codeTask || explanation) return false;
    if (/\b(?:use|open|launch)\s+(?:(?:the|a|your|agent)\s+)?browser\b/i.test(text) || /\bbrowse\b/i.test(text)) return true;
    return /https?:\/\/[^\s<>]+/i.test(text) && /\b(?:read|open|visit|summari[sz]e|review)\b/i.test(text);
  }

  function init() {
    ui.view = document.getElementById('chat-view');
    ui.chat = document.getElementById('chat-pane-column');
    if (!ui.view || !ui.chat) return;
    ui.toggle = button('Browser', () => paneOpen ? closePane() : openPane(true), 'agent-browser-toggle');
    ui.toggle.id = 'btn-agent-browser-toggle';
    ui.toggle.prepend(brandMark());
    ui.toggle.setAttribute('aria-controls', 'agent-browser-pane');
    const header = document.querySelector('.chat-header') || document.querySelector('main > header') || ui.view.parentElement;
    const actions = header.querySelector('.chat-header-actions') || header;
    const sessionBtn = actions.querySelector('#btn-toggle-session-rail');
    // Browser pill sits left of the Session toggle; update pill stays first.
    if (sessionBtn) actions.insertBefore(ui.toggle, sessionBtn);
    else actions.append(ui.toggle);

    ui.tabs = element('div', 'agent-browser-tabs');
    ui.tabs.setAttribute('role', 'tablist');
    ui.tabs.setAttribute('aria-label', 'Chat and browser workspace');
    ui.tabButtons = {};
    for (const name of ['chat', 'browser']) {
      const tab = button(name === 'chat' ? 'Chat' : 'Browser', () => selectTab(name));
      tab.id = `agent-browser-tab-${name}`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', name === 'chat' ? 'chat-pane-column' : 'agent-browser-pane');
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        selectTab(event.key === 'Home' ? 'chat' : event.key === 'End' ? 'browser' : name === 'chat' ? 'browser' : 'chat', true);
      });
      ui.tabButtons[name] = tab;
      ui.tabs.append(tab);
    }
    ui.splitter = element('div', 'agent-browser-splitter');
    ui.splitter.id = 'agent-browser-splitter';
    ui.splitter.tabIndex = 0;
    for (const [key, value] of Object.entries({ role: 'separator', 'aria-label': 'Resize chat and browser', 'aria-orientation': 'vertical', 'aria-valuemin': '30', 'aria-valuemax': '70', 'aria-controls': 'chat-pane-column agent-browser-pane' })) ui.splitter.setAttribute(key, value);
    ui.splitter.title = 'Drag or use arrow keys to resize. Double-click to reset.';
    ui.splitter.addEventListener('pointerdown', event => {
      if (event.button !== 0 || narrow) return;
      event.preventDefault();
      dragPointer = event.pointerId;
      ui.splitter.focus();
      ui.splitter.setPointerCapture(event.pointerId);
      ui.view.classList.add('agent-browser-dragging');
      scheduleBounds(); // Native content must not intercept the captured drag.
    });
    ui.splitter.addEventListener('pointermove', event => {
      if (dragPointer !== event.pointerId) return;
      const rect = ui.view.getBoundingClientRect();
      if (rect.width) setSplit(100 * (event.clientX - rect.left) / rect.width);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.splitter.addEventListener(type, endDrag);
    ui.splitter.addEventListener('dblclick', () => setSplit(50));
    ui.splitter.addEventListener('keydown', event => {
      const values = { ArrowLeft: split - (event.shiftKey ? 10 : 2), ArrowRight: split + (event.shiftKey ? 10 : 2), Home: 30, End: 70 };
      if (!(event.key in values)) return;
      event.preventDefault();
      setSplit(values[event.key]);
    });

    ui.pane = element('section', 'agent-browser-pane');
    ui.pane.id = 'agent-browser-pane';
    ui.pane.setAttribute('aria-label', 'Agent browser');
    const toolbar = element('div', 'agent-browser-toolbar');
    const heading = element('div', 'agent-browser-heading');
    ui.title = element('span', 'agent-browser-title', 'Browser');
    ui.status = element('span', 'agent-browser-status');
    ui.status.setAttribute('role', 'status');
    ui.status.setAttribute('aria-live', 'polite');
    const close = button('', closePane, 'agent-browser-close agent-browser-icon-button');
    close.prepend(icon(['M18 6 6 18M6 6l12 12']));
    close.setAttribute('aria-label', 'Close browser and turn off browse mode');
    close.title = 'Close';
    ui.popout = button('', () => { void command(state.detached ? 'dock' : 'popout'); }, 'agent-browser-icon-button agent-browser-popout');
    ui.popoutIcons = {
      popout: icon(['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14 21 3']),
      dock: icon(['M9 4h11v11H9z', 'M4 9v11h11'])
    };
    ui.popout.append(ui.popoutIcons.popout, ui.popoutIcons.dock);
    heading.append(brandMark(), ui.title, ui.status, ui.popout, close);
    const form = element('form', 'agent-browser-navigation');
    form.setAttribute('aria-label', 'Browser navigation');
    ui.back = button('', () => { void control('back'); }, 'agent-browser-icon-button');
    ui.back.prepend(icon(['m15 18-6-6 6-6']));
    ui.forward = button('', () => { void control('forward'); }, 'agent-browser-icon-button');
    ui.forward.prepend(icon(['m9 18 6-6-6-6']));
    ui.reload = button('', () => { void control('reload'); }, 'agent-browser-icon-button');
    ui.reload.prepend(icon(['M3 12a9 9 0 1 0 2.65-6.35', 'M3 4v5h5']));
    for (const [el, label] of [[ui.back, 'Go back'], [ui.forward, 'Go forward'], [ui.reload, 'Reload page']]) {
      el.setAttribute('aria-label', label);
      el.title = label;
    }
    const address = element('div', 'agent-browser-address');
    ui.url = element('input');
    ui.url.id = 'agent-browser-url';
    ui.url.type = 'text';
    ui.url.inputMode = 'url';
    ui.url.autocomplete = 'off';
    ui.url.spellcheck = false;
    ui.url.placeholder = 'https://example.com';
    ui.url.setAttribute('aria-label', 'Public page URL');
    ui.url.setAttribute('aria-describedby', 'agent-browser-guidance');
    ui.go = button('Go', () => {}, 'agent-browser-go');
    ui.go.type = 'submit';
    address.append(ui.url, ui.go);
    form.append(ui.back, ui.forward, ui.reload, address);
    form.addEventListener('submit', navigate);
    const controls = element('div', 'agent-browser-controls');
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Browser agent controls');
    ui.pause = button('Pause', () => { void control('pause'); });
    ui.resume = button('Resume', () => { void control('resume'); }, 'agent-browser-primary');
    ui.stop = button('Stop', () => { void control('stop'); });
    ui.takeover = button('Take over', () => { void control('takeover'); }, 'agent-browser-takeover');
    ui.takeover.title = 'Pause the agent and interact with the page yourself';
    controls.append(ui.pause, ui.resume, ui.stop, ui.takeover);
    toolbar.append(heading, form, controls);
    ui.error = element('div', 'agent-browser-error');
    ui.error.setAttribute('role', 'alert');
    ui.viewport = element('div', 'agent-browser-viewport');
    ui.viewport.id = 'agent-browser-viewport';
    ui.viewport.setAttribute('aria-label', 'Native browser page');
    const empty = element('div', 'agent-browser-empty');
    empty.append(globe(), element('h3', '', 'A window to the web'), element('p', '', 'Open a public page above, or ask Brown to browse. You stay in control.'));
    ui.viewport.append(empty);
    ui.approval = element('section', 'agent-browser-approval');
    ui.approval.id = 'agent-browser-approval';
    ui.approval.tabIndex = -1;
    ui.approval.setAttribute('aria-labelledby', 'agent-browser-approval-title');
    ui.approval.setAttribute('aria-describedby', 'agent-browser-approval-detail');
    const approvalCard = element('div', 'agent-browser-approval-card');
    ui.approvalTitle = element('h3');
    ui.approvalTitle.id = 'agent-browser-approval-title';
    ui.approvalDetail = element('p', 'agent-browser-approval-detail');
    ui.approvalDetail.id = 'agent-browser-approval-detail';
    ui.approvalHint = element('p', 'agent-browser-approval-hint');
    ui.approve = button('Approve action', () => { void decide(true); }, 'agent-browser-primary');
    ui.deny = button('Deny', () => { void decide(false); });
    const decisions = element('div', 'agent-browser-decisions');
    decisions.append(ui.deny, ui.approve);
    approvalCard.append(element('span', 'agent-browser-eyebrow', 'Your review is needed'), ui.approvalTitle, ui.approvalDetail, ui.approvalHint, decisions);
    ui.approval.append(approvalCard);
    ui.guidance = element('p', 'agent-browser-guidance');
    ui.guidance.id = 'agent-browser-guidance';
    ui.pane.append(toolbar, ui.error, ui.viewport, ui.approval, ui.guidance);
    ui.view.append(ui.tabs, ui.splitter, ui.pane);
    narrow = ui.view.getBoundingClientRect().width < 760;
    setSplit(split);
    render();
    watchVisibility();
    if (available) {
      try {
        // Only the isolated preload may deliver browser events. No DOM/message bridge.
        const unsubscribe = api.onBrowserEvent(event => {
          if (!event || typeof event !== 'object') return;
          if (event.type === 'state') { eventRevision++; applyState(event.state); }
          else if (event.type === 'action') onAction(event);
          else if (event.type === 'screenshot') onScreenshot(event);
        });
        if (typeof unsubscribe === 'function') window.addEventListener('pagehide', unsubscribe, { once: true });
        void command('state');
      } catch {
        available = false;
        localError = 'Browser event connection is unavailable. Reopen the app to try again.';
        render();
      }
    }
  }

  window.BrownBrowser = Object.freeze({
    isEnabled: () => enabled,
    wantsBrowser,
    open: () => openPane(true),
    attachRun,
    finishRun,
    getContext: () => ({ url: state.url, title: state.title })
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
