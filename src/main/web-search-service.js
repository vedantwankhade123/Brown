const { parseHTML, DOMParser } = require('linkedom');
const { fetchPublicPage, extractStructuredProducts, extractSiteIcon } = require('./public-web');
const { extractWebContent, publicLink } = require('./web-content');
const { plan, eligibleProduct } = require('../agent/search-plan');

const STOP = new Set('find me the best top please search internet online web for on in under below rupees inr with and of what is are how a an to can could you tell show give about latest current today news explain information details documentation'.split(' '));
function topicTokens(request) {
  return [...new Set((String(request).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter(word => !STOP.has(word)))];
}
function relevance(item, request) {
  const tokens = topicTokens(request);
  const haystack = `${item.title || ''} ${item.snippet || ''} ${item.url || ''}`.toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token.replace(/s$/, '')) ? 1 : 0), 0);
}
function isProductUrl(value) {
  try {
    const url = new URL(value);
    return /\/(?:dp|gp\/product|p|products?|buy)\/.+|\/[^/]+\/p(?:[/?]|$)|\/\d{5,}\/buy(?:[/?]|$)/i.test(url.pathname)
      && !/\/(?:articles?|blogs?|news|reviews?|guides?|search|collections?|categories?|category)\//i.test(url.pathname);
  } catch (_) { return false; }
}
function parseOrganic(html, provider) {
  const document = provider === 'bing' ? new DOMParser().parseFromString(String(html), 'text/xml') : parseHTML(String(html)).document;
  if (provider === 'bing') return [...document.querySelectorAll('item')].map(item => ({ title: item.querySelector('title')?.textContent || '', url: publicLink(item.querySelector('link')?.textContent || '', 'https://www.bing.com'), snippet: item.querySelector('description')?.textContent || '' }));
  return [...document.querySelectorAll('a.result__a, a.result-link')].map(a => {
    let url = publicLink(a.getAttribute('href'), 'https://duckduckgo.com');
    try { const target = new URL(url); if (target.searchParams.has('uddg')) url = publicLink(target.searchParams.get('uddg'), target.href); } catch (_) {}
    const block = a.closest('.result') || a.closest('tr');
    return { title: a.textContent.trim(), url, snippet: block?.querySelector('.result__snippet')?.textContent?.trim() || '' };
  });
}
async function discover(query, { fetchPage = fetchPublicPage, page = 0, signal } = {}) {
  const sources = [
    ['ddg', `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&s=${page * 10}`],
    ['bing', `https://www.bing.com/search?format=rss&first=${page * 10 + 1}&q=${encodeURIComponent(query)}`],
    ['ddg', `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`]
  ];
  const responses = await Promise.allSettled(sources.map(async ([provider, url]) => {
    const response = await fetchPage(url, { timeoutMs: 6500, maxBytes: 1500000, signal });
    if (!response.ok) throw new Error(`${provider}: HTTP ${response.status}`);
    const items = parseOrganic(await response.text(), provider).filter(item => item.title && item.url && !/\b(?:duckduckgo\.com|bing\.com|google\.com)\b/.test(new URL(item.url).hostname));
    if (!items.length) throw new Error(`${provider}: no readable organic results (possibly blocked)`);
    return items;
  }));
  return { results: responses.flatMap(r => r.status === 'fulfilled' ? r.value : []), errors: responses.filter(r => r.status === 'rejected').map(r => r.reason.message) };
}
async function searchWeb(request, options = {}, deps = {}) {
  const original = String(request || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
  const goal = String(options.budgetQuery || original);
  const query = original.replace(/^(?:please\s+)?(?:(?:can|could)\s+you\s+)?(?:find|search(?:\s+(?:online|the web))?(?:\s+for)?|show|give|look up)\s+(?:me\s+)?(?:the\s+)?/i, '').replace(/^(?:best|top|recommended)\s+/i, '').trim();
  const strategy = plan(goal);
  if (!query) return { success: false, query: '', request: goal, plan: strategy, results: [], products: [], videos: [], errors: [], answerContext: '', needsClarification: true, clarification: 'What would you like me to search for?' };
  const fetchPage = deps.fetchPage || fetchPublicPage;
  const search = deps.discover || discover;
  const signal = options.signal || AbortSignal.timeout(45000);
  const excluded = new Set(options.excludeUrls || []);
  const visited = new Set();
  const results = [], products = [], errors = [];
  const region = strategy.budget?.currency === 'INR' ? ' India' : '';
  const primary = await search(query + (strategy.shopping ? `${region} buy product price` : ''), { fetchPage, page: options.page || 0, signal });
  errors.push(...primary.errors);
  let candidates = primary.results;
  const minimumRelevance = strategy.shopping ? 1 : Math.min(2, topicTokens(goal).length);
  if (!strategy.shopping && !candidates.some(item => relevance(item, goal) >= minimumRelevance) && topicTokens(query).length > 1) {
    // Retry a narrower topic when a provider silently broadens a multi-entity query.
    const refined = await search(topicTokens(query).slice(1).join(' '), { fetchPage, page: options.page || 0, signal });
    candidates.push(...refined.results);
    errors.push(...refined.errors);
  }
  // Retailer-oriented discovery is independent of encyclopedic instant answers.
  if (strategy.shopping) {
    const targeted = await search(`${query}${region} ${region ? '(site:decathlon.in OR site:amazon.in OR site:flipkart.com OR site:myntra.com OR site:ajio.com)' : '(inurl:product OR inurl:dp OR inurl:buy)'}`, { fetchPage, page: options.page || 0, signal });
    errors.push(...targeted.errors);
    candidates = [...targeted.results, ...candidates];
  }
  candidates = candidates.filter((item, index, all) => item.url && !excluded.has(item.url) && all.findIndex(other => other.url === item.url) === index && relevance(item, goal) >= Math.max(1, minimumRelevance))
    .sort((a, b) => (relevance(b, goal) + (strategy.shopping && isProductUrl(b.url) ? 5 : 0)) - (relevance(a, goal) + (strategy.shopping && isProductUrl(a.url) ? 5 : 0)));
  async function read(item) {
    if (signal.aborted || visited.has(item.url)) return null;
    visited.add(item.url);
    try {
      const response = await fetchPage(item.url, { timeoutMs: 8000, maxBytes: 2000000, signal });
      if (!response.ok) { errors.push(`${new URL(item.url).hostname}: HTTP ${response.status}`); return null; }
      const html = await response.text();
      const finalUrl = response.url || item.url;
      const content = extractWebContent(html, finalUrl);
      const pageProducts = extractStructuredProducts(html, finalUrl).filter(p => eligibleProduct(p, goal) && relevance(p, goal) > 0);
      const result = { ...item, url: finalUrl, source: new URL(finalUrl).hostname, title: content.title || item.title, snippet: content.description || item.snippet, pageContent: content.markdown.slice(0, 5000), image: content.image, favicon: extractSiteIcon(html, finalUrl), products: pageProducts, verified: true };
      if (relevance(result, goal) === 0) return null;
      results.push(result);
      products.push(...pageProducts);
      return { result, links: content.links };
    } catch (error) { errors.push(`${new URL(item.url).hostname}: ${error.message}`); return null; }
  }
  const pages = await Promise.all(candidates.slice(0, strategy.shopping ? 10 : 6).map(read));
  if (strategy.shopping && products.length < 4 && !signal.aborted) {
    // Follow actual product links discovered on listings/reviews, rather than label articles as products.
    const links = pages.filter(Boolean).flatMap(p => p.links).filter(link => isProductUrl(link.url) && !visited.has(link.url) && !excluded.has(link.url) && relevance(link, goal) > 0);
    const unique = links.filter((link, i, all) => all.findIndex(other => other.url === link.url) === i);
    await Promise.all(unique.slice(0, 8).map(read));
  }
  const reviewScore = product => product.rating && product.ratingCount ? (product.rating * product.ratingCount + 3 * 20) / (product.ratingCount + 20) : 0;
  const verifiedProducts = products.filter((p, i, all) => all.findIndex(other => other.url === p.url) === i)
    .sort((a, b) => reviewScore(b) - reviewScore(a) || a.amount - b.amount).slice(0, 12);
  const ordered = results.filter((r, i, all) => all.findIndex(other => other.url === r.url) === i)
    .sort((a, b) => Number(Boolean(b.products.length)) - Number(Boolean(a.products.length)) || relevance(b, goal) - relevance(a, goal)).slice(0, 12);
  return { success: ordered.length > 0, query, request: goal, plan: strategy, results: ordered, products: verifiedProducts, videos: [], errors: [...new Set(errors)].slice(0, 12), fetchedAt: new Date().toISOString(), searchProvider: 'duckduckgo+bing+readability', needsClarification: !ordered.length,
    clarification: ordered.length ? '' : 'The search providers or source pages did not return readable results for this request. I could not verify an answer. Try again or provide a retailer or source link.',
    answerContext: ordered.map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.pageContent || r.snippet}`).join('\n\n') };
}
module.exports = { searchWeb, discover, parseOrganic, relevance, isProductUrl };
