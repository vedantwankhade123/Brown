const assert = require('node:assert/strict');
const { prepare } = require('../src/renderer/visual-loading');
const { extractStructuredProducts, budgetForQuery, fetchPublicPage } = require('../src/main/public-web');
const { normalizeQuote, marketSymbols } = require('../src/main/market-snapshot');
const { needsSummary, fallback } = require('../src/renderer/spoken-summary');
const { extractSiteIcon } = require('../src/main/public-web');
async function run() {
  assert(needsSummary('```chart\n{}\n```'));
  assert(needsSummary('The formula is $$x^2$$.'));
  assert(!needsSummary('A normal short answer.'));
  assert.match(fallback('```chart\n{"title":"Units","labels":["A","B"],"values":[10,20]}\n```'), /A: 10; B: 20/);
  assert(!fallback('```mermaid\nflowchart TD\nA["Start"] --> B["End"]\n```').includes('-->'));
  assert.equal(extractSiteIcon('<link href="/logo.svg" rel="icon">', 'https://example.com/page'), 'https://example.com/logo.svg');
  assert.equal(extractSiteIcon('<link rel="icon" href="javascript:bad">', 'https://example.com/page'), 'https://example.com/favicon.ico');
  assert.match(fallback('$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$'), /divided by/);
  assert(!fallback('$$x = \\frac{1}{2}$$').includes('\\frac'));
  const vm = require('node:vm');
  const renderer = require('node:fs').readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
  const summaryCode = renderer.slice(renderer.indexOf('const _spokenSummaries ='), renderer.indexOf('let _ttsPrecacheGeneration ='));
  let requests = 0;
  const context = vm.createContext({ activeModel: 'local-model', _processingSessionId: null, window: { BrownSpokenSummary: { needsSummary, fallback } }, AbortController, setTimeout, clearTimeout, fetch: async (_url, options) => {
    requests++;
    const request = JSON.parse(options.body);
    assert.equal(request.model, 'local-model');
    assert.equal(request.stream, false);
    assert.match(request.system, /Do not invent facts/);
    return { ok: true, json: async () => ({ response: 'A is 10 units. B is 20 units, twice A.' }) };
  } });
  vm.runInContext(summaryCode, context);
  const rich = '```chart\n{"labels":["A","B"],"values":[10,20]}\n```';
  context.answer = rich;
  const summaries = await vm.runInContext('Promise.all([prepareSpokenSummary(answer), prepareSpokenSummary(answer)])', context);
  assert.equal(requests, 1); assert.equal(summaries[0], summaries[1]);
  assert.match(summaries[0], /twice A/);
  await vm.runInContext('prepareSpokenSummary(answer)', context); assert.equal(requests, 1);
  assert.deepEqual(prepare('Hello\n```chart\n{"type":"bar"'), { text: 'Hello\n', pending: true });
  assert.equal(prepare('```chart\n{}\n```').pending, false);
  assert.equal(prepare('```javascript\nconst a=1;').pending, false);
  assert.equal(prepare('```chart\n{}\n```\n```mermaid\nflowchart TD').pending, true);
  const html = '<script type="application/ld+json">' + JSON.stringify({ '@graph': [
    { '@type': 'Product', name: 'Shoe', image: 'https://shop.example.com/a.jpg', offers: { price: '2499', priceCurrency: 'INR', url: '/shoe' } },
    { '@type': 'Product', name: 'Fake', image: 'file:///secret', offers: { price: 100, priceCurrency: 'INR' } },
    { '@type': 'Product', name: 'Missing price', offers: {} }
  ] }) + '</script>';
  const products = extractStructuredProducts(html, 'https://shop.example.com/catalog');
  assert.equal(products.length, 1); assert.equal(products[0].amount, 2499); assert.equal(products[0].url, 'https://shop.example.com/shoe');
  assert.deepEqual(budgetForQuery('find shoes under 3,000 rupees'), { amount: 3000, currency: 'INR' });
  assert.deepEqual(budgetForQuery('shoes below ₹3000'), { amount: 3000, currency: 'INR' });
  await assert.rejects(fetchPublicPage('http://127.0.0.1/secret'), /blocked/);
  await assert.rejects(fetchPublicPage('https://localhost/secret'), /blocked/);
  await assert.rejects(fetchPublicPage('file:///secret'), /HTTP/);
  assert.deepEqual(marketSymbols('Apple stock price today'), ['AAPL']);
  const quote = normalizeQuote({ chart: { result: [{ meta: { regularMarketPrice: 110, regularMarketTime: 1700000000, chartPreviousClose: 100, currency: 'USD' }, timestamp: [1, 2, 3], indicators: { quote: [{ close: [100, null, 110] }] } }] } }, 'AAPL');
  assert.equal(quote.changePercent, 10); assert.equal(quote.history.length, 2); assert(quote.timestamp.endsWith('Z'));
  assert.equal(normalizeQuote({ chart: { result: [{ meta: {} }] } }, 'AAPL'), null);
  console.log('PASS: streaming visuals hide source, structured products require source prices, budgets and private-network denial');
}
module.exports = { run };
