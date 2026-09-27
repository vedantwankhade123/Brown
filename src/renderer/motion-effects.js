/**
 * Brown AI motion effects — vanilla ports of:
 *  - TextShimmer (loading-ui): gradient sweep across status text
 *  - FlickerSpinner (flicker-dot): 7x7 dot-grid frame animation for loaders
 * No dependencies; exposed as window.UltronMotion + <flicker-spinner> element.
 */
(function () {
  'use strict';

  function escapeChar(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(str) {
    return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* ===================== TextShimmer ===================== */

  /**
   * Build shimmer-sweep HTML for a text label. The highlight width is
   * controlled by `spread` (bigger = wider bright band), `duration` in seconds.
   */
  function renderTextShimmer(text, options = {}) {
    const str = String(text ?? '');
    const vars = [];
    if (options.duration) vars.push(`--tsm-dur:${options.duration}s`);
    if (options.spread) vars.push(`--tsm-spread:${options.spread}`);
    if (options.baseColor) vars.push(`--tsm-base:${options.baseColor}`);
    if (options.shimmerColor) vars.push(`--tsm-shimmer:${options.shimmerColor}`);
    const cls = `text-shimmer${options.className ? ' ' + options.className : ''}`;
    return `<span class="${cls}" data-sw-text="${escapeAttr(str)}"${vars.length ? ` style="${vars.join(';')}"` : ''}>${escapeChar(str)}</span>`;
  }

  /* ===================== FlickerSpinner ===================== */

  // Frame data from flicker.laurie.fyi — 13 frames over a 7x7 (49-cell) grid.
  const FLICKER_FRAMES = [
    [0,0,0,0,1,1,0,1, 0,0,0,0,1,1,1,1, 0,0,0,0,1,0,1,1, 0,0,0,0,0,0,1,1, 0,0,0,0,0,0,1,1, 0,0,0,0,0,0,1,1, 0].map(v => !!v),
    [0,0,0,1,1,0,0,0, 0,0,0,1,1,0,1,0, 0,0,0,1,1,1,1,0, 0,0,0,1,0,1,1,0, 0,0,0,0,0,1,1,0, 0,0,0,0,0,1,1,0, 0].map(v => !!v),
    [0,0,1,1,0,0,0,0, 0,0,1,1,0,0,0,0, 0,0,1,1,0,1,0,0, 0,0,1,1,1,1,0,0, 0,0,1,0,1,1,0,0, 0,0,0,0,1,1,0,0, 0].map(v => !!v),
    [0,1,1,0,0,0,0,0, 0,1,1,0,0,0,0,0, 0,1,1,0,0,0,0,0, 0,1,1,0,1,0,0,0, 0,1,1,1,1,0,0,0, 0,1,0,1,1,0,0,0, 0].map(v => !!v),
    [1,1,0,0,0,0,0,0, 1,1,0,0,0,0,0,0, 1,1,0,0,0,0,0,0, 1,1,0,0,0,0,0,0, 1,1,0,1,0,0,0,0, 1,1,1,1,0,0,0,0, 1].map(v => !!v),
    [1,0,0,0,0,0,1,1, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 1,0,1,0,0,0,0,1, 1].map(v => !!v),
    [0,0,0,0,0,1,1,1, 0,0,0,0,0,1,1,1, 0,0,0,0,0,0,1,1, 0,0,0,0,0,0,1,1, 0,0,0,0,0,0,1,1, 0,0,0,0,0,0,1,1, 0].map(v => !!v),
    [0,0,0,0,1,1,0,0, 0,0,0,0,1,1,1,0, 0,0,0,0,1,1,1,0, 0,0,0,0,0,1,1,0, 0,0,0,0,0,1,1,0, 0,0,0,0,0,1,1,0, 0].map(v => !!v),
    [0,0,0,1,1,0,0,0, 0,0,0,1,1,0,0,0, 0,0,0,1,1,1,0,0, 0,0,0,1,1,1,0,0, 0,0,0,0,1,1,0,0, 0,0,0,0,1,1,0,0, 0].map(v => !!v),
    [0,0,1,1,0,0,0,0, 0,0,1,1,0,0,0,0, 0,0,1,1,0,0,0,0, 0,0,1,1,1,0,0,0, 0,0,1,1,1,0,0,0, 0,0,0,1,1,0,0,0, 0].map(v => !!v),
    [0,1,1,0,0,0,0,0, 0,1,1,0,0,0,0,0, 0,1,1,0,0,0,0,0, 0,1,1,0,0,0,0,0, 0,1,1,1,0,0,0,0, 0,1,1,1,0,0,0,0, 0].map(v => !!v),
    [1,1,0,0,0,0,1,0, 1,1,0,0,0,0,0,0, 1,1,0,0,0,0,0,0, 1,1,0,0,0,0,0,0, 1,1,0,0,0,0,0,0, 1,1,1,0,0,0,0,0, 1].map(v => !!v),
    [1,0,0,0,0,1,1,1, 1,0,0,0,0,1,0,1, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 1,0,0,0,0,0,0,1, 1].map(v => !!v)
  ];

  class FlickerSpinnerElement extends HTMLElement {
    connectedCallback() {
      if (this._cells) return;
      this.setAttribute('aria-hidden', 'true');
      this._cells = [];
      const frag = document.createDocumentFragment();
      for (let i = 0; i < 49; i++) {
        const dot = document.createElement('i');
        this._cells.push(dot);
        frag.appendChild(dot);
      }
      this.appendChild(frag);
      this._frame = Math.floor(Math.random() * FLICKER_FRAMES.length);
      this._paint();
      const speed = parseInt(this.getAttribute('speed'), 10);
      this._timer = setInterval(() => {
        this._frame = (this._frame + 1) % FLICKER_FRAMES.length;
        this._paint();
      }, speed > 0 ? speed : 90);
    }

    disconnectedCallback() {
      if (this._timer) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }

    _paint() {
      const frame = FLICKER_FRAMES[this._frame];
      for (let i = 0; i < 49; i++) {
        this._cells[i].classList.toggle('on', frame[i]);
      }
    }
  }

  if (!customElements.get('flicker-spinner')) {
    customElements.define('flicker-spinner', FlickerSpinnerElement);
  }

  function renderFlickerSpinner(options = {}) {
    const size = options.size ?? 18;
    const cls = options.className ? ` class="${options.className}"` : '';
    const speed = options.speed ? ` speed="${options.speed}"` : '';
    const colors = [];
    if (options.onColor) colors.push(`--flk-on:${options.onColor}`);
    if (options.offColor) colors.push(`--flk-off:${options.offColor}`);
    const style = [`--flk-size:${size}px`, ...colors].join(';');
    return `<flicker-spinner${cls} style="${style}"${speed}></flicker-spinner>`;
  }

  window.UltronMotion = {
    renderTextShimmer,
    renderFlickerSpinner,
    FLICKER_FRAMES
  };
})();
