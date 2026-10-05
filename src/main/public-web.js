const http = require('node:http');
const https = require('node:https');
const { parsePublicUrl, resolvePublicHost } = require('./agent-browser-network');

// Pin every connection to a validated public address, including redirect hops.
async function fetchPublicPage(value, { timeoutMs = 10000, maxBytes = 2000000, redirects = 4, signal } = {}) {
  const deadline = Date.now() + Math.min(20000, Math.max(100, timeoutMs));
  async function visit(target, remaining) {
    if (signal?.aborted || Date.now() >= deadline) throw new Error('Web request stopped or timed out');
    const url = parsePublicUrl(target);
    let dnsTimer;
    const address = await Promise.race([resolvePublicHost(url.hostname), new Promise((_, reject) => {
      dnsTimer = setTimeout(() => reject(new Error('Web hostname timed out')), Math.max(1, deadline - Date.now())); dnsTimer.unref?.();
    })]).finally(() => clearTimeout(dnsTimer));
    if (signal?.aborted) throw new Error('Web request cancelled');
    return new Promise((resolve, reject) => {
      let size = 0;
      const transport = url.protocol === 'https:' ? https : http;
      const request = transport.get(url, {
        agent: false,
        lookup: (_host, options, callback) => callback(null, options?.all ? [address] : address.address, address.family),
        headers: { 'User-Agent': 'Brown/1.0 (public web lookup)', Accept: 'text/html,application/ld+json,application/json,text/plain', 'Accept-Encoding': 'identity' }
      }, response => {
        const status = response.statusCode || 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          if (!remaining) { reject(new Error('Too many redirects')); return; }
          visit(new URL(response.headers.location, url).href, remaining - 1).then(resolve, reject); return;
        }
        const type = String(response.headers['content-type'] || '');
        if (!/(?:text\/|json|xml)/i.test(type)) { response.destroy(); reject(new Error('This page is not readable web content')); return; }
        const chunks = [];
        response.on('data', chunk => { size += chunk.length; if (size > maxBytes) response.destroy(new Error('Page exceeds the web lookup size limit')); else chunks.push(chunk); });
        response.on('error', reject);
        response.on('end', () => resolve({ ok: status >= 200 && status < 300, status, url: url.href, headers: { get: name => response.headers[String(name).toLowerCase()] || '' }, text: async () => Buffer.concat(chunks).toString('utf8') }));
      });
      const timer = setTimeout(() => request.destroy(new Error('Web lookup timed out')), Math.max(1, deadline - Date.now()));
      const abort = () => request.destroy(new Error('Web lookup cancelled'));
      signal?.addEventListener('abort', abort, { once: true });
      request.on('error', reject);
      request.on('close', () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); });
    });
  }
  return visit(value, redirects);
}

function extractStructuredProducts(html, pageUrl) {
  const products = [], seen = new Set();
  function walk(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 12 || products.length >= 30) return;
    if (Array.isArray(value)) { value.slice(0, 100).forEach(v => walk(v, depth + 1)); return; }
    const types = [].concat(value['@type'] || []);
    if (types.includes('Product')) {
      const offer = [].concat(value.offers || []).find(o => o && (o.price !== undefined || o.lowPrice !== undefined));
      const amount = Number(offer?.price ?? offer?.lowPrice);
      const currency = String(offer?.priceCurrency || '').toUpperCase();
      const image = [].concat(value.image || [])[0];
      try {
        const url = parsePublicUrl(new URL(offer?.url || value.url || pageUrl, pageUrl).href).href;
        const imageUrl = image ? parsePublicUrl(new URL(typeof image === 'string' ? image : image.url, pageUrl).href).href : '';
        if (value.name && Number.isFinite(amount) && amount > 0 && /^[A-Z]{3}$/.test(currency) && !seen.has(url)) {
          seen.add(url); products.push({ title: String(value.name).slice(0, 200), url, image: imageUrl, amount, currency, price: `${currency} ${amount}`, type: 'product', source: new URL(pageUrl).hostname, verifiedAt: new Date().toISOString(), availability: String(offer.availability || '') });
        }
      } catch (_) { /* Ignore nonpublic/malformed structured data. */ }
    }
    Object.values(value).slice(0, 100).forEach(v => walk(v, depth + 1));
  }
  for (const match of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(match[1])); } catch (_) { /* A broken block must not suppress other products. */ }
  }
  // Some storefronts expose product offers as Open Graph metadata rather than JSON-LD.
  const meta = {};
  for (const match of String(html).matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/g)) attrs[attr[1].toLowerCase()] = attr[3];
    if (attrs.property || attrs.name) meta[attrs.property || attrs.name] = attrs.content || '';
  }
  if (/product/i.test(meta['og:type'] || '') && meta['product:price:amount'] && meta['product:price:currency']) {
    walk({ '@type': 'Product', name: meta['og:title'], image: meta['og:image'], url: meta['og:url'] || pageUrl, offers: { price: meta['product:price:amount'], priceCurrency: meta['product:price:currency'] } });
  }
  return products;
}
function budgetForQuery(query) {
  const match = String(query).match(/\b(?:under|below|less than|within)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(rupees|inr|rs\b)?/i);
  return match ? { amount: Number(match[1].replace(/,/g, '')), currency: /₹|rupees|\binr\b|\brs\b/i.test(query) ? 'INR' : null } : null;
}
function extractSiteIcon(html, pageUrl) {
  for (const tag of String(html || '').match(/<link\b[^>]*>/gi) || []) {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1];
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!rel || !/(?:^|\s)(?:icon|apple-touch-icon)(?:\s|$)/i.test(rel) || !href) continue;
    try { const url = new URL(href, pageUrl); if (/^https?:$/.test(url.protocol)) return url.href; } catch (_) {}
  }
  try { return new URL('/favicon.ico', pageUrl).href; } catch (_) { return ''; }
}
module.exports = { fetchPublicPage, extractStructuredProducts, budgetForQuery, extractSiteIcon };
