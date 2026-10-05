const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
async function run() {
  const renderer = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
  const html = fs.readFileSync(require.resolve('../src/renderer/index.html'), 'utf8');
  const mobile = fs.readFileSync(require.resolve('../mobile/src/screens/OnboardingScreen.tsx'), 'utf8');
  assert(!html.includes('id="onboard-step-2"') && !html.includes('id="onboard-step-3"'));
  assert(!html.includes('helper-model.js') && !renderer.includes('BrownHelperModel'));
  assert(!mobile.includes('Date of Birth') && !mobile.includes('Email Address'));
  assert(!renderer.includes('const answerNeedsLiveSearch'));
  assert(!renderer.includes("} else if (intent === 'conversation' || intent === 'search')"));
  const start = renderer.indexOf('async function buildWebSearchQuery(');
  const end = renderer.indexOf('// ---------------------------------------------------------------', start);
  let planned = 0;
  const context = { window: {}, getSystemContext: async () => ({}), getRegionalShoppingContext: () => ({}), buildRealtimeContext: () => ({ locationLabel: 'Unknown location' }), fallbackSearchQueryFromPrompt: s => s, isProductOrShoppingQuery: () => false, isEntertainmentRecommendationQuery: () => false, looksLikeAnswerText: s => /^Sure|Here are/i.test(s), logTrace: () => {}, queryOfflineLLM: async () => { planned++; return 'India running shoes INR 3000'; } };
  vm.createContext(context); vm.runInContext(renderer.slice(start, end), context);
  assert.equal(await context.buildWebSearchQuery('Can you find shoes below 3000 rupees?'), 'India running shoes INR 3000');
  assert.equal(planned, 1, 'The planner must run even for short prompts');
  console.log('PASS: search plans queries before answering; desktop/mobile onboarding has no DOB/email or helper');
}
module.exports = { run };
