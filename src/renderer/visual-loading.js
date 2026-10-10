(function (root) {
  // A streaming fence is data in progress, never a finished code example.
  function prepare(text, { streaming = false } = {}) {
    const value = String(text || '');
    if (streaming) {
      let pending = false;
      const masked = value.replace(/^\s*```(mermaid|chart|json-chart|data-chart|gen-ui|widget|generative-ui|flowchart|graph|mindmap)[^\n]*\n[\s\S]*?(?:^\s*```\s*$|$(?![\s\S]))/gim, () => { pending = true; return ''; });
      if (pending) return { text: masked, pending: true };
    }
    const fence = /^\s*```([^\n`]*)\s*$/gm;
    let opening = null, match;
    while ((match = fence.exec(value))) {
      if (opening) opening = null;
      else opening = { index: match.index, language: match[1].trim().toLowerCase() };
    }
    if (!opening || !/^(mermaid|chart|json-chart|data-chart|gen-ui|widget|generative-ui|flowchart|graph|mindmap)$/.test(opening.language)) return { text: value, pending: false };
    return { text: value.slice(0, opening.index), pending: streaming };
  }
  const api = { prepare };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownVisualLoading = api;
})(typeof window === 'undefined' ? globalThis : window);
