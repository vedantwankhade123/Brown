/**
 * Web page fetch → readable text/markdown (inspired by MCP server-fetch / OpenJarvis fetch).
 * Used for search enrichment and WEB_FETCH agent tool — no API key required.
 */
const { URL } = require('url');

function stripTags(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function htmlToMarkdown(html) {
  let md = String(html || '');
  md = md.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n');
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n');
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n');
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n\n$1\n\n');
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, '*$1*');
  md = md.replace(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
  return stripTags(md).replace(/\n{3,}/g, '\n\n').trim();
}

async function fetchWebPage(url, options = {}) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) {
    return { success: false, error: 'Only http/https URLs are supported.' };
  }

  const maxChars = Number(options.maxChars) > 0 ? Number(options.maxChars) : 12000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    const res = await fetch(target, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}`, status: res.status, finalUrl: res.url || target };
    }

    const contentType = res.headers.get('content-type') || '';
    const finalUrl = res.url || target;
    const raw = await res.text();

    if (contentType.includes('application/json')) {
      const text = raw.slice(0, maxChars);
      return { success: true, url: finalUrl, title: finalUrl, markdown: '```json\n' + text + '\n```', plain: text };
    }

    const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = stripTags(titleMatch ? titleMatch[1] : '');
    const markdown = htmlToMarkdown(raw).slice(0, maxChars);
    const plain = stripTags(raw).slice(0, maxChars);

    return {
      success: true,
      url: finalUrl,
      title: title || finalUrl,
      markdown: markdown || plain,
      plain
    };
  } catch (err) {
    clearTimeout(timeout);
    return { success: false, error: err.message || 'Fetch failed', url: target };
  }
}

module.exports = { fetchWebPage, htmlToMarkdown, stripTags };
