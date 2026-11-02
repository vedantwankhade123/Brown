const state = { splashDone: false, setup: false };

function overlayColors() {
  // The onboarding screen paints its own full-bleed backdrop, so the native
  // window controls must not carry an opaque strip across it.
  if (state.setup) return { color: 'rgba(0, 0, 0, 0)', symbolColor: '#ffffff' };
  return { color: '#1B1B1B', symbolColor: '#ffffff' };
}

module.exports = { state, overlayColors };
