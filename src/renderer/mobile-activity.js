/* Read-only preview rendered by the original mobile chat components. */
(() => {
  const button = document.getElementById('btn-mobile-activity');
  if (!button || !window.ultronAPI?.getMobileActivity) return;
  const panel = document.createElement('aside');
  panel.id = 'mobile-activity-panel'; panel.className = 'mobile-activity-panel hidden';
  panel.setAttribute('aria-label', 'Live phone activity');
  panel.innerHTML = `<div class="mobile-panel-heading"><div><strong>Phone activity</strong><small data-device-name>Live companion view</small></div><div class="mobile-panel-header-actions"><button type="button" data-menu aria-label="Phone preview options" aria-expanded="false" aria-controls="mobile-preview-options">⋮</button><button type="button" data-close aria-label="Close phone preview">✕</button></div></div><div id="mobile-preview-options" class="mobile-preview-options hidden"><label class="mobile-device-picker">Device<select data-device aria-label="Choose paired phone"></select></label><button type="button" data-pause>Pause preview</button><button type="button" data-copy>Copy chat</button><label class="mobile-follow-option"><input type="checkbox" data-follow checked> Auto-scroll</label><button type="button" data-manage>Manage connection</button><div class="mobile-menu-divider"></div><button type="button" data-disconnect>Disconnect phone</button><small class="mobile-menu-hint">Pairing stays saved</small></div><p class="mobile-panel-status mobile-preview-sr-only" role="status"></p><div class="mobile-phone-stage"><div class="mobile-phone-frame pixel-nine"><img class="pixel-nine-frame-image" src="../../Assets/android-frame.png" alt="" aria-hidden="true"><iframe class="mobile-phone-screen" title="Read-only Brown mobile chat preview" src="phone-preview/index.html"></iframe></div></div>`;
  document.body.appendChild(panel);
  let opened = false, paused = false, selected = '', devices = [], shown = null, signature = '', busy = false;
  const picker = panel.querySelector('[data-device]');
  const frame = panel.querySelector('iframe');
  const menu = panel.querySelector('#mobile-preview-options');
  const menuButton = panel.querySelector('[data-menu]');
  let hint = '';
  function sendPreview() { frame.contentWindow?.postMessage({ type: 'brown-phone-preview', snapshot: shown, hint, follow: panel.querySelector('[data-follow]').checked }, '*'); }
  function toggleMenu(open) { menu.classList.toggle('hidden', !open); menuButton.setAttribute('aria-expanded', String(open)); }
  function fitPhone() {
    const stage = panel.querySelector('.mobile-phone-stage');
    panel.style.setProperty('--phone-scale', Math.max(.15, Math.min(stage.clientWidth / 474, stage.clientHeight / 948)));
  }
  const resize = new ResizeObserver(fitPhone); resize.observe(panel.querySelector('.mobile-phone-stage'));
  let panelAnimation = null, toggleRevision = 0, wasConnected = null, stateTimer = null;
  const chatMain = document.querySelector('.chat-main');
  function chatAvailable() { return !chatMain?.classList.contains('settings-open'); }
  function toggle(open, immediate = false) {
    if (open && !chatAvailable()) return;
    if (open === opened && !immediate) return;
    const revision = ++toggleRevision;
    const wasHidden = panel.classList.contains('hidden');
    // Continue from the current position when the direction changes mid-slide.
    const currentTransform = wasHidden ? null : getComputedStyle(panel).transform;
    panelAnimation?.cancel();
    panelAnimation = null;
    opened = open;
    if (open) { panel.classList.remove('hidden'); document.body.classList.add('mobile-preview-open'); }
    panel.inert = !open;
    panel.setAttribute('aria-hidden', String(!open));
    const finish = () => {
      if (revision !== toggleRevision) return;
      if (!opened) { panel.classList.add('hidden'); document.body.classList.remove('mobile-preview-open'); }
      panelAnimation?.cancel();
      panelAnimation = null;
      panel.style.willChange = '';
    };
    if (immediate || wasHidden && !open || window.matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else {
      const offscreen = `translateX(${panel.offsetWidth + 12}px)`;
      const start = currentTransform && currentTransform !== 'none' ? currentTransform : open ? offscreen : 'translateX(0)';
      panel.style.willChange = 'transform';
      panelAnimation = panel.animate(
        [{ transform: start }, { transform: open ? 'translateX(0)' : offscreen }],
        { duration: 380, easing: 'cubic-bezier(.25,.8,.25,1)', fill: 'both' }
      );
      panelAnimation.onfinish = finish;
    }
    button.setAttribute('aria-expanded', String(open)); toggleMenu(false);
    if (open) { fitPhone(); poll(); panel.querySelector('[data-close]').focus(); } else if (chatAvailable()) button.focus();
  }
  const navigationObserver = new MutationObserver(() => {
    button.disabled = !chatAvailable();
    if (!chatAvailable()) toggle(false, true);
  });
  if (chatMain) navigationObserver.observe(chatMain, { attributes: true, attributeFilter: ['class'] });
  button.disabled = !chatAvailable();
  function render() {
    const device = devices.find(d => d.id === selected) || devices[0];
    panel.querySelector('[data-device-name]').textContent = device?.deviceName || 'Live companion view';
    panel.querySelector('.mobile-panel-status').textContent = paused ? 'Preview paused' : device?.usingDesktop ? `Using desktop · ${device.desktopModel}` : device?.isConnected ? 'Phone connected' : 'Phone offline';
    if (paused && device?.isConnected && device?.preferences?.livePreview && device.activity) return;
    if (paused) { paused = false; panel.querySelector('[data-pause]').textContent = 'Pause preview'; }
    shown = device?.isConnected && device?.preferences?.livePreview ? device.activity || null : null;
    hint = !device ? 'Pair your phone in Connection settings to see its live chat.' : !device.preferences?.livePreview ? 'Enable Live chat preview in Desktop Sync on your phone.' : 'Open Chat on your phone to preview';
    const next = JSON.stringify([selected, hint, shown?.sessionId, shown?.title, shown?.model, shown?.generating, shown?.messages]);
    panel.querySelector('[data-disconnect]').disabled = !device?.isConnected;
    panel.querySelector('[data-copy]').disabled = !shown?.messages?.length;
    if (next !== signature) { signature = next; sendPreview(); }
  }
  async function poll() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      devices = await window.ultronAPI.getMobileActivity();
      window.dispatchEvent(new CustomEvent('brown-device-activity', { detail: devices }));
      const active = devices.filter(d => d.usingDesktop).length;
      const online = devices.filter(d => d.isConnected || d.activity).length;
      button.querySelector('[data-label]').textContent = active ? 'Phone active' : online ? 'Phone connected' : 'No device';
      if (wasConnected !== null && wasConnected !== (online > 0)) {
        clearTimeout(stateTimer); button.classList.remove('connection-changing');
        void button.offsetWidth; button.classList.add('connection-changing');
        stateTimer = setTimeout(() => button.classList.remove('connection-changing'), 1200);
      }
      wasConnected = online > 0;
      button.classList.toggle('is-active', active > 0); button.classList.toggle('is-connected', online > 0);
      if (!opened) return;
      if (!devices.some(d => d.id === selected)) selected = devices[0]?.id || '';
      const names = JSON.stringify(devices.map(d => [d.id, d.deviceName]));
      if (picker.dataset.signature !== names) { picker.replaceChildren(); for (const d of devices) { const option = document.createElement('option'); option.value = d.id; option.textContent = d.deviceName; picker.appendChild(option); } picker.dataset.signature = names; }
      picker.value = selected; picker.disabled = devices.length < 2; render();
    } catch { panel.querySelector('.mobile-panel-status').textContent = 'Could not refresh phone activity. Retrying…'; }
    finally { busy = false; }
  }
  button.onclick = () => toggle(!opened);
  panel.querySelector('[data-close]').onclick = () => toggle(false);
  menuButton.onclick = () => toggleMenu(menu.classList.contains('hidden'));
  picker.onchange = () => { selected = picker.value; paused = false; panel.querySelector('[data-pause]').textContent = 'Pause preview'; signature = ''; render(); };
  panel.querySelector('[data-pause]').onclick = event => { paused = !paused; event.target.textContent = paused ? 'Resume preview' : 'Pause preview'; render(); };
  panel.querySelector('[data-follow]').onchange = sendPreview;
  panel.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText((shown?.messages || []).map(m => `${m.role === 'assistant' ? 'Brown' : 'You'}: ${m.content}`).join('\n\n')); } catch { panel.querySelector('.mobile-panel-status').textContent = 'Could not copy chat'; } };
  panel.querySelector('[data-disconnect]').onclick = async () => { const device = devices.find(d => d.id === selected) || devices[0]; if (!device?.isConnected) return; const result = await window.ultronAPI.disconnectMobileDevice(device.id); if (result.success) { toggleMenu(false); await poll(); } else panel.querySelector('.mobile-panel-status').textContent = result.error; };
  panel.querySelector('[data-manage]').onclick = () => { toggle(false); if (typeof openSettingsPanel === 'function') openSettingsPanel('sync'); else { document.getElementById('btn-settings')?.click(); document.querySelector('.settings-tab-btn[data-tab="sync"]')?.click(); } };
  document.addEventListener('pointerdown', event => { if (!menu.contains(event.target) && !menuButton.contains(event.target)) toggleMenu(false); });
  document.addEventListener('keydown', event => { if (opened && event.key === 'Escape') { if (!menu.classList.contains('hidden')) { toggleMenu(false); menuButton.focus(); } else toggle(false); } });
  window.addEventListener('message', event => { if (event.source === frame.contentWindow && event.data?.type === 'brown-phone-preview-ready') sendPreview(); });
  frame.addEventListener('load', sendPreview);
  window.addEventListener('beforeunload', () => { clearInterval(timer); resize.disconnect(); navigationObserver.disconnect(); });
  const timer = setInterval(poll, 1500); poll();
})();
