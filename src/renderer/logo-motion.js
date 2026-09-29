/**
 * Animated Brown mark (Lottie) — mounted in exactly two places:
 * the boot splash screen and the welcome screen of the chat area.
 */
(function () {
  'use strict';

  const ANIMATION = window.BROWN_LOGO_LOTTIE;
  const instances = new Map();

  // A hidden host keeps ticking, so pause whatever CSS took out of the layout.
  const visibility = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          const anim = instances.get(entry.target);
          if (!anim) return;
          if (entry.isIntersecting) anim.play();
          else anim.pause();
        });
      }, { threshold: 0 })
    : null;

  function mount(host) {
    if (!host || !window.lottie || !ANIMATION || host.dataset.logoMotion === '1') return;
    host.dataset.logoMotion = '1';

    let anim = null;
    try {
      anim = window.lottie.loadAnimation({
        container: host,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData: window.structuredClone ? window.structuredClone(ANIMATION) : JSON.parse(JSON.stringify(ANIMATION)),
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
      });
    } catch (err) {
      console.warn('[LogoMotion] Lottie mount failed:', err);
      return;
    }

    // No svg painted means no fallback: keep the static logo visible.
    if (!host.querySelector('svg')) return;
    instances.set(host, anim);
    if (visibility) visibility.observe(host);
  }

  function init() {
    document.querySelectorAll('[data-brown-logo]').forEach(mount);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  window.BrownLogoMotion = { refresh: init };
})();
