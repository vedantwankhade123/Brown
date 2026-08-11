/**
 * Deep research orchestrator — multi-hop web search with page fetch and synthesis.
 * Inspired by ollama-agent-harness web_search/fetch patterns and OpenJarvis iterative tools.
 */
(function () {
  const DEFAULT_CONFIG = {
    enabled: true,
    maxHops: 3,
    fetchTopN: 3,
    minUsefulResults: 2,
    synthesizeOnComplete: true
  };

  function getResearchConfig() {
    if (window.UltronAgentPrompt && typeof window.UltronAgentPrompt.getResearchConfig === 'function') {
      return window.UltronAgentPrompt.getResearchConfig();
    }
    return { ...DEFAULT_CONFIG };
  }

  function isDeepResearchRequest(prompt) {
    const p = String(prompt || '').toLowerCase();
    if (/\b(deep research|research thoroughly|multi[- ]source|compare sources|investigate|comprehensive|in[- ]depth|detailed research)\b/i.test(p)) {
      return true;
    }
    if (/\b(research|compare|versus|vs\.?|pros and cons|which is better|alternatives to)\b/i.test(p) && p.split(/\s+/).length >= 6) {
      return true;
    }
    if (/\b(latest|current|recent)\b/i.test(p) && /\b(review|analysis|roundup|guide|overview)\b/i.test(p)) {
      return true;
    }
    return false;
  }

  function countUsefulResults(payload) {
    const results = payload && Array.isArray(payload.results) ? payload.results : [];
    return results.filter(item =>
      (item.snippet || '').trim().length > 40 || (item.pageContent || '').trim().length > 80
    ).length;
  }

  function mergeSearchPayloads(base, incoming) {
    const merged = {
      success: true,
      query: incoming.query || base.query || '',
      results: [],
      products: [],
      answerContext: '',
      needsClarification: false,
      clarification: ''
    };

    const seen = new Set();
    for (const item of [...(base.results || []), ...(incoming.results || [])]) {
      const url = String(item.url || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      merged.results.push(item);
    }

    const productSeen = new Set();
    for (const item of [...(base.products || []), ...(incoming.products || [])]) {
      const url = String(item.url || '').trim();
      if (!url || productSeen.has(url)) continue;
      productSeen.add(url);
      merged.products.push(item);
    }

    merged.results = merged.results.slice(0, 12);
    merged.products = merged.products.slice(0, 8);
    merged.answerContext = merged.results.map((item, index) => {
      const body = item.pageContent
        ? `Content excerpt:\n${String(item.pageContent).slice(0, 2500)}`
        : `Snippet: ${item.snippet || 'No snippet available.'}`;
      return `[${index + 1}] ${item.title}\nURL: ${item.url}\nSource: ${item.source || 'web'}\n${body}`;
    }).join('\n\n');

    const useful = countUsefulResults(merged);
    merged.needsClarification = merged.results.length === 0 || useful === 0;
    if (merged.needsClarification) {
      merged.clarification = merged.results.length === 0
        ? `I could not find reliable web results for "${merged.query}".`
        : `I found links for "${merged.query}" but could not extract enough detail.`;
    }
    return merged;
  }

  function fallbackFollowUpQuery(userPrompt, priorContext, hopIndex) {
    const p = String(userPrompt || '').toLowerCase();
    const gaps = [];
    if (/\b(price|cost|budget|under \d+)\b/i.test(p) && !/\bprice\b/i.test(priorContext)) gaps.push('price comparison');
    if (/\b(review|rating|pros|cons)\b/i.test(p) && !/\breview\b/i.test(priorContext)) gaps.push('reviews ratings');
    if (/\b(latest|2025|2026|recent|news)\b/i.test(p) && !/\b202[4-6]\b/i.test(priorContext)) gaps.push('latest news updates');
    if (/\b(how to|tutorial|guide|steps)\b/i.test(p) && !/\bstep\b/i.test(priorContext)) gaps.push('how to guide');
    if (gaps.length === 0) gaps.push('detailed facts verification');

    const topic = p
      .replace(/^(please\s+)?(can you\s+|could you\s+)?(research|search|look up|find out about)\s+/i, '')
      .replace(/\s+(for me|please|thanks)\s*$/i, '')
      .trim()
      .split(/\s+/)
      .slice(0, 6)
      .join(' ');

    return `${topic} ${gaps[hopIndex % gaps.length]}`.trim();
  }

  async function buildFollowUpSearchQuery(userPrompt, priorContext, hopIndex, queryLLM) {
    const fallback = fallbackFollowUpQuery(userPrompt, priorContext, hopIndex);
    if (typeof queryLLM !== 'function') return fallback;

    const systemPrompt = `You generate a follow-up web search query for hop ${hopIndex + 1} of a multi-hop research task.
Output ONLY 2 to 5 search keywords. No sentences, no quotes, no explanation.`;
    const userMsg = `Original question:\n${userPrompt}\n\nInformation gathered so far:\n${String(priorContext || '').slice(0, 4000)}\n\nFollow-up keywords:`;

    try {
      const raw = await queryLLM(userMsg, systemPrompt);
      const cleaned = String(raw || '')
        .replace(/```[^`]*```/g, '')
        .replace(/["'`]/g, '')
        .trim()
        .split('\n')[0]
        .trim();
      if (cleaned.length >= 3 && cleaned.length <= 120) return cleaned;
    } catch (e) { /* use fallback */ }

    return fallback;
  }

  function shouldContinueResearch(userPrompt, merged, hopIndex, config) {
    if (hopIndex >= config.maxHops - 1) return false;
    const useful = countUsefulResults(merged);
    if (useful >= config.minUsefulResults && hopIndex >= 1) return false;
    if (merged.results.length === 0) return true;
    if (useful < config.minUsefulResults) return true;
    return isDeepResearchRequest(userPrompt) && hopIndex < 1;
  }

  /**
   * Run multi-hop research. deps must provide:
   * - buildWebSearchQuery(prompt)
   * - searchWeb(query, options)
   * - normalizeSearchPayload(raw, query)
   * - queryLLM?(prompt, systemPrompt) optional
   * - onProgress?({ hop, query, merged, phase })
   */
  async function runDeepResearch(userPrompt, deps = {}) {
    const config = { ...DEFAULT_CONFIG, ...getResearchConfig() };
    const hops = [];
    let merged = { results: [], products: [], answerContext: '', query: '' };

    for (let hop = 0; hop < config.maxHops; hop++) {
      const query = hop === 0
        ? await deps.buildWebSearchQuery(userPrompt)
        : await buildFollowUpSearchQuery(userPrompt, merged.answerContext, hop, deps.queryLLM);

      if (deps.onProgress) {
        deps.onProgress({ hop, query, merged, phase: 'searching' });
      }

      const raw = await deps.searchWeb(query, { fetchCount: config.fetchTopN });
      const payload = deps.normalizeSearchPayload(raw, query);
      merged = mergeSearchPayloads(merged, payload);
      hops.push({ hop: hop + 1, query, resultCount: payload.results ? payload.results.length : 0 });

      if (deps.onProgress) {
        deps.onProgress({ hop, query, merged, phase: 'merged' });
      }

      if (!shouldContinueResearch(userPrompt, merged, hop, config)) break;
    }

    return { merged, hops, config };
  }

  window.UltronAgentResearch = {
    getResearchConfig,
    isDeepResearchRequest,
    countUsefulResults,
    mergeSearchPayloads,
    buildFollowUpSearchQuery,
    shouldContinueResearch,
    runDeepResearch
  };
})();
