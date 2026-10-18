(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BrownOnboardingVoices = api;
})(typeof window === 'object' ? window : globalThis, function () {
  const voices = [
    { name: 'Heart', id: 'af_heart', key: 'kokoro-heart', detail: 'American · Female', portrait: 'heart' },
    { name: 'Michael', id: 'am_michael', key: 'kokoro-michael', detail: 'American · Male', portrait: 'michael' },
    { name: 'George', id: 'bm_george', key: 'kokoro-george', detail: 'British · Male', portrait: 'george' },
    { name: 'Lewis', id: 'bm_lewis', key: 'kokoro-lewis', detail: 'British · Male', portrait: 'lewis' }
  ];
  function mount(container, { onChange = () => {}, storage, window: view = window } = {}) {
    if (!container) return null;
    const doc = container.ownerDocument;
    container.innerHTML = `<button type="button" class="onboard-voice-trigger" aria-expanded="false" aria-controls="onboard-voice-menu" aria-label="Choose a voice, Heart selected"><img data-selected-portrait src="../../Assets/personas/heart_sound.png" alt="" /><span class="onboard-voice-copy"><strong data-selected-name>Heart</strong><small data-selected-detail>American · Female</small></span><svg class="onboard-voice-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><div id="onboard-voice-menu" class="onboard-voice-menu hidden" role="dialog" aria-modal="true" aria-label="Choose your voice" aria-hidden="true"><div class="onboard-voice-menu-head"><span>Choose your voice</span><button type="button" class="onboard-voice-close" aria-label="Close voice selection">✕</button></div><div class="onboard-voice-options" role="radiogroup" aria-label="Voice model">${voices.map((voice, index) => `<div class="onboard-voice-row"><button type="button" class="onboard-voice-chip${index === 0 ? ' selected' : ''}" role="radio" aria-checked="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-voice-id="${voice.id}" data-model-key="${voice.key}" data-voice-name="${voice.name}"><img class="onboard-voice-portrait" src="../../Assets/personas/${voice.portrait}_sound.png" alt="" /><span class="onboard-voice-copy"><strong>${voice.name}</strong><small>${voice.detail}</small></span><span class="onboard-voice-check" aria-hidden="true">✓</span></button><button type="button" class="onboard-voice-icon onboard-voice-select" data-voice-select="${voice.key}" aria-label="Select ${voice.name}" aria-pressed="${index === 0}" title="Select ${voice.name}">✓</button></div>`).join('')}</div></div>`;
    const trigger = container.querySelector('.onboard-voice-trigger');
    const menu = container.querySelector('#onboard-voice-menu');
    const choices = [...container.querySelectorAll('.onboard-voice-chip')];
    let selected = voices[0], opened = false, animation = null, revision = 0, busy = false;
    function toggle(open) {
      if (busy && open || open === opened) return;
      const version = ++revision;
      animation?.cancel(); animation = null;
      opened = open;
      trigger.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      menu.inert = !open;
      if (open) container.classList.add('is-open');
      const screen = container.closest('#onboarding-screen');
      if (open) screen?.classList.add('onboard-voice-choosing');
      if (open) {
        menu.classList.remove('hidden');
        positionMenu();
      }
      const finish = () => { if (version !== revision) return; if (!opened) { menu.classList.add('hidden'); container.classList.remove('is-open'); screen?.classList.remove('onboard-voice-choosing'); trigger.focus(); } animation?.cancel(); animation = null; };
      if (!menu.animate || view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
      animation = menu.animate(open ? [{ opacity: 0, transform: 'translateY(-12px) scale(.97)' }, { opacity: 1, transform: 'translateY(0) scale(1)' }] : [{ opacity: 1, transform: 'translateY(0) scale(1)' }, { opacity: 0, transform: 'translateY(-10px) scale(.97)' }], { duration: open ? 280 : 220, easing: open ? 'cubic-bezier(.22,1,.36,1)' : 'cubic-bezier(.4,0,1,1)', fill: 'both' });
      animation.onfinish = finish;
    }
    async function choose(voice, notify = true) {
      if (busy) return;
      selected = voice;
      choices.forEach(button => { const active = button.dataset.modelKey === voice.key; button.classList.toggle('selected', active); button.setAttribute('aria-checked', String(active)); button.tabIndex = active ? 0 : -1; });
      container.querySelectorAll('[data-voice-select]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.voiceSelect === voice.key)));
      container.querySelector('[data-selected-name]').textContent = voice.name;
      container.querySelector('[data-selected-detail]').textContent = voice.detail;
      container.querySelector('[data-selected-portrait]').src = `../../Assets/personas/${voice.portrait}_sound.png`;
      trigger.setAttribute('aria-label', `Choose a voice, ${voice.name} selected`);
      toggle(false);
      if (notify) onChange(voice);
    }
    function updateControls() {
      trigger.disabled = busy;
      container.querySelector('.onboard-voice-close').disabled = busy;
      choices.forEach(button => { button.disabled = busy; });
      for (const voice of voices) {
        container.querySelector(`[data-voice-select="${voice.key}"]`).disabled = busy;
      }
    }
    trigger.addEventListener('click', () => toggle(!opened));
    trigger.addEventListener('keydown', event => { if (event.key === 'ArrowDown') { event.preventDefault(); toggle(true); choices.find(choice => choice.dataset.modelKey === selected.key)?.focus(); } });
    choices.forEach((button, index) => {
      button.addEventListener('click', () => { void choose(voices[index]); });
      button.addEventListener('keydown', event => {
        const offset = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
        if (offset) { event.preventDefault(); choices[(index + offset + choices.length) % choices.length].focus(); }
      });
    });
    container.querySelector('.onboard-voice-close').addEventListener('click', () => { toggle(false); });
    container.querySelectorAll('[data-voice-select]').forEach(button => button.addEventListener('click', () => { void choose(voices.find(v => v.key === button.dataset.voiceSelect)); }));
    function positionMenu() {
      const logoBottom = doc.querySelector('.onboarding-brand-badge')?.getBoundingClientRect?.().bottom;
      const engineTop = doc.querySelector('#onboard-card-kokoro')?.getBoundingClientRect?.().top;
      const containerTop = container.getBoundingClientRect?.().top || 0;
      const anchorTop = Number.isFinite(logoBottom) ? logoBottom + 20 : Number.isFinite(engineTop) ? engineTop : containerTop;
      menu.style.top = `${anchorTop - containerTop}px`;
      menu.style.maxHeight = `${Math.max(100, Math.min(370, (view.innerHeight || 667) - anchorTop - 24))}px`;
    }
    const resize = () => { if (opened) positionMenu(); };
    view.addEventListener?.('resize', resize);
    const outside = event => { if (!container.contains(event.target)) toggle(false); };
    const escape = event => { if (opened && event.key === 'Escape') { event.preventDefault(); toggle(false); } };
    doc.addEventListener('pointerdown', outside);
    container.addEventListener('keydown', escape);
    try {
      const saved = JSON.parse(storage?.getItem?.('ultron-onboarding-voice-choice'));
      const voice = voices.find(voice => voice.key === saved?.key);
      if (voice) void choose(voice, false);
    } catch (error) {}
    return { selected: () => selected, close: () => toggle(false),
      setBusy(value) { busy = value; if (busy) toggle(false); updateControls(); },
      destroy() { container.closest('#onboarding-screen')?.classList.remove('onboard-voice-choosing'); animation?.cancel(); view.removeEventListener?.('resize', resize); doc.removeEventListener('pointerdown', outside); container.removeEventListener('keydown', escape); } };
  }
  let backgroundDownload = null;
  function downloadAfterSetup(choice, { api, storage }) {
    if (!choice?.enabled) return Promise.resolve({ success: true, skipped: true });
    if (backgroundDownload) return backgroundDownload;
    storage?.setItem('ultron-pending-voice-setup', JSON.stringify(choice));
    backgroundDownload = Promise.resolve().then(async () => {
      const result = await api.downloadKokoroOnboardingVoices([choice.id]);
      if (!result?.success) throw new Error(result?.error || 'Voice setup download failed.');
      const activated = await api.setActiveTtsModel(choice.key);
      if (!activated?.success) throw new Error(activated?.error || 'Could not select the downloaded voice.');
      storage?.setItem('ultron-tts-neural-model', choice.key);
      storage?.removeItem('ultron-pending-voice-setup');
      return result;
    }).finally(() => { backgroundDownload = null; });
    return backgroundDownload;
  }
  return { mount, voices, downloadAfterSetup };
});
