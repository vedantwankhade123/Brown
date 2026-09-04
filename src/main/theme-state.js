const state = { light: false, splashDone: false };

function overlayColors() {
  const light = state.light && state.splashDone;
  return {
    color: light ? '#ffffff' : '#131314',
    symbolColor: light ? '#111827' : '#ffffff'
  };
}

module.exports = { state, overlayColors };
