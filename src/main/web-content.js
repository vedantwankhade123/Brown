const { parseHTML } = require('linkedom');
const { Readability } = require('@mozilla/readability');
const TurndownService = require('turndown');
const { parsePublicUrl } = require('./agent-browser-network');

function publicLink(value, base) {
  if (!String(value || '').trim()) return '';
  try { return parsePublicUrl(new URL(value, base).href).href; } catch (_) { return ''; }
}
function extractWebContent(html, pageUrl) {
  // Parsing never executes scripts or loads subresources.
  const { document } = parseHTML(String(html));
  const meta = key => document.querySelector(`meta[property="${key}"], meta[name="${key}"]`)?.getAttribute('content') || '';
  const title = meta('og:title') || document.querySelector('title')?.textContent || '';
  const image = publicLink(meta('og:image') || meta('twitter:image'), pageUrl);
  const description = meta('description') || meta('og:description');
  const links = [...document.querySelectorAll('a[href]')].slice(0, 1500).map(a => ({ title: a.textContent.trim().slice(0, 200), url: publicLink(a.getAttribute('href'), pageUrl) })).filter(a => a.url && a.title);
  let article;
  try {
    Object.defineProperty(document, 'documentURI', { value: pageUrl, configurable: true });
    article = new Readability(document.cloneNode(true)).parse();
  } catch (_) { /* Storefronts may not have a reader-mode article. */ }
  document.querySelectorAll('script,style,noscript,svg,iframe,nav,footer,header,form').forEach(node => node.remove());
  const content = article?.content || (document.querySelector('main,article,[role="main"]') || document.body)?.innerHTML || '';
  const markdown = new TurndownService({ headingStyle: 'atx' }).turndown(content).slice(0, 16000);
  return { title: String(article?.title || title).trim(), description, image, links, markdown, plain: String(article?.textContent || document.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 16000) };
}
module.exports = { extractWebContent, publicLink };
