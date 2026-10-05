const { fetchPublicPage } = require('./public-web');
function marketSymbols(query) {
  const q = String(query || '').toLowerCase();
  const supported = { apple: 'AAPL', microsoft: 'MSFT', nvidia: 'NVDA', tesla: 'TSLA', amazon: 'AMZN', bitcoin: 'BTC-USD', ethereum: 'ETH-USD', nifty: '^NSEI', sensex: '^BSESN', 'bank nifty': '^NSEBANK', nasdaq: '^IXIC', 's&p': '^GSPC', dow: '^DJI', reliance: 'RELIANCE.NS', tcs: 'TCS.NS' };
  const selected = Object.entries(supported).filter(([name, symbol]) => q.includes(name) || new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(query)).map(([, symbol]) => symbol);
  if (selected.length) return [...new Set(selected)].slice(0, 6);
  return /us\b|american|wall street/i.test(q) ? ['^GSPC', '^IXIC', '^DJI'] : ['^NSEI', '^BSESN', '^NSEBANK'];
}
function normalizeQuote(data, symbol) {
  const result = data?.chart?.result?.[0], meta = result?.meta;
  if (!meta || !Number.isFinite(meta.regularMarketPrice) || !Number.isFinite(meta.regularMarketTime)) return null;
  const previous = meta.chartPreviousClose ?? meta.previousClose;
  const delta = Number.isFinite(previous) ? meta.regularMarketPrice - previous : null;
  const quotes = result.indicators?.quote?.[0]?.close || [];
  const history = (result.timestamp || []).map((time, i) => ({ time, price: quotes[i] })).filter(item => Number.isFinite(item.price) && Number.isFinite(item.time)).slice(-60);
  return { symbol, name: String(meta.longName || meta.shortName || symbol), price: meta.regularMarketPrice, currency: String(meta.currency || ''), change: delta, changePercent: delta !== null && previous > 0 ? delta / previous * 100 : null, timestamp: new Date(meta.regularMarketTime * 1000).toISOString(), exchange: String(meta.fullExchangeName || meta.exchangeName || ''), source: `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}/`, timing: 'Latest available source quote; may be delayed', history };
}
async function getMarketSnapshot(query) {
  const settled = await Promise.allSettled(marketSymbols(query).map(async symbol => {
    const response = await fetchPublicPage(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=5m&range=1d`, { timeoutMs: 8000, maxBytes: 500000 });
    if (!response.ok) return null;
    return normalizeQuote(JSON.parse(await response.text()), symbol);
  }));
  return settled.filter(item => item.status === 'fulfilled' && item.value).map(item => item.value);
}
module.exports = { marketSymbols, normalizeQuote, getMarketSnapshot };
