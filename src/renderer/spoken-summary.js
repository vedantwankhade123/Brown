(function (root) {
  function needsSummary(text) {
    return /```\w|\$\$|\\\[|\\\(|\$\S[^$\n]*\S\$|^\s*\|.+\|\s*$/m.test(String(text || ''));
  }
  function fallback(text) {
    return String(text || '').replace(/```(chart|json-chart|data-chart)\s*\n([\s\S]*?)```/gi, (_, language, source) => {
      try {
        const data = JSON.parse(source);
        if (!Array.isArray(data.labels) || !Array.isArray(data.values)) return 'A chart is shown in the answer.';
        const values = data.labels.slice(0, 12).map((label, i) => `${label}: ${data.values[i]}`).join('; ');
        return `${data.title || 'Chart'}. ${values}.`;
      } catch (_) { return 'A chart is shown in the answer.'; }
    }).replace(/```mermaid\s*\n([\s\S]*?)```/gi, (_, source) => {
      const labels = [...source.matchAll(/\b\w+\["?([^\]\n]+?)"?\]/g)].map(match => match[1]);
      return labels.length ? `The diagram includes ${labels.slice(0, 12).join(', ')}. See the diagram for their connections.` : 'A diagram illustrates the relationships described in this answer.';
    })
      .replace(/```[\s\S]*?```/g, 'The answer includes code or a visual; its full details are available on screen.')
      .replace(/\$\$([\s\S]*?)\$\$|\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$(\S[^$\n]*\S)\$/g, (_, a, b, c, d) => {
        let expression = a || b || c || d;
        // Resolve the innermost groups first so nested fractions and radicals remain readable.
        for (let i = 0; i < 8; i++) expression = expression
          .replace(/\\sqrt\{([^{}]+)\}/g, 'square root of ($1)')
          .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1) divided by ($2)');
        expression = expression.replace(/\\pm\b/g, ' plus or minus ').replace(/\\(?:times|cdot)\b/g, ' times ')
          .replace(/\\leq\b|≤/g, ' less than or equal to ').replace(/\\geq\b|≥/g, ' greater than or equal to ')
          .replace(/\\neq\b|≠/g, ' not equal to ').replace(/\^\{?2\}?/g, ' squared ').replace(/\^\{?3\}?/g, ' cubed ')
          .replace(/=/g, ' equals ').replace(/-/g, ' minus ').replace(/\+/g, ' plus ').replace(/\^/g, ' to the power of ')
          .replace(/\\[a-z]+\b/gi, ' ').replace(/[{}$]/g, '').replace(/\s+/g, ' ').trim();
        return ` Formula: ${expression}. `;
      });
  }
  const api = { needsSummary, fallback };
  if (typeof module !== 'undefined') module.exports = api;
  root.BrownSpokenSummary = api;
})(typeof window !== 'undefined' ? window : globalThis);
