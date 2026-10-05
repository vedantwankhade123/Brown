(function () {
  const features = Object.freeze({ computerActions: false });
  if (typeof module !== 'undefined') module.exports = features;
  if (typeof window !== 'undefined') window.BrownReleaseFeatures = features;
})();
