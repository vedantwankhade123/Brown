const state = { light: false, splashDone: false, setup: false };

function overlayColors() {
  // The onboarding screen paints its own full-bleed backdrop, so the native
  // window controls must not carry an opaque strip across it.
  if (state.setup) return { color: 'rgba(0, 0, 0, 0)', symbolColor: '#ffffff' };
  const light = state.light && state.splashDone;
  return {
    color: light ? '#ffffff' : '#1B1B1B',
    symbolColor: light ? '#111827' : '#ffffff'
  };
}

module.exports = { state, overlayColors };
