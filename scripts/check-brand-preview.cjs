const { chromium } = require('C:/Users/vedan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage();
  for (const [name, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    await page.locator('.hero-brand-mark').waitFor();
    await page.waitForFunction(() => [...document.querySelectorAll('img[src*="browny"]')].every(i => i.complete && i.naturalWidth > 0));
    await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('.hero-title')).opacity) > 0.99);
    await page.screenshot({ path: `Assets/branding-preview/${name}.png` });
    const result = await page.evaluate(() => ({
      logos: [...document.querySelectorAll('img[src*="browny"]')].map(i => ({ source: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0 })),
      overflow: document.documentElement.scrollWidth > innerWidth,
      headline: document.querySelector('.hero-title').textContent,
      descriptionColor: getComputedStyle(document.querySelector('.hero-description')).color,
      title: document.title
    }));
    assert.equal(result.headline, 'Meet Brown AI');
    assert.equal(result.descriptionColor, 'rgb(255, 255, 255)');
    assert.equal(result.overflow, false);
    assert.equal(result.title, 'Brown AI | Your Local AI Assistant');
    console.log(name, result);
  }
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme });
    const expectedIcon = `/Assets/browny_${theme === 'light' ? 'black' : 'white'}.png?v=14`;
    await page.waitForFunction(href => document.querySelector('#browser-favicon').getAttribute('href') === href, expectedIcon);
    assert.equal(await page.locator('link[rel="icon"]').count(), 1);
  }
  await page.evaluate(() => window.openModels());
  await page.waitForFunction(() => document.title.includes('Model Library'));
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://usebrown.online/models');
  assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), 'https://usebrown.online/models');
  for (const route of ['', 'download/', 'models/', 'docs/', 'privacy/', 'terms/']) {
    const html = fs.readFileSync(`brown-website/dist/${route}index.html`, 'utf8');
    assert(!/[-–—]/.test(html.match(/<title>(.*?)<\/title>/)[1]));
    const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    assert(graph['@graph'].some(n => ['WebPage', 'CollectionPage'].includes(n['@type'])));
    assert.equal(graph['@graph'].find(n => n['@type'] === 'Organization').logo.length, 2);
  }
  console.log('Verified both theme icons, route metadata, and all six crawlable pages.');
  await browser.close();
})();
