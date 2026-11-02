const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const planner = require('../src/renderer/visual-planner');
const source = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
let searches = 0;
const context = vm.createContext({
  window: { BrownArtifactRuntime:require('../src/renderer/artifact-runtime'),BrownSearchPlan: { resolveRequest: text => { searches++; return { request: 'old web query', followUp: false }; } }, BrownBrowser: { isEnabled: () => true } },
  COMPUTER_ACTIONS_ENABLED: true,
  isReminderOrTimerRequest: p => /remind|timer/i.test(p),
  isFollowUpAboutPriorTurn: () => false,
  isContentGenerationRequest: p => /^(?:write|draft|create).*(?:poem|essay|table)/i.test(p),
  hasDesktopActionCues: p => /browser|api|chrome/i.test(p),
  splitSearchAndActionPrompt: () => null,
  isWebSearchEnabled: () => true, hasExplicitSearchIntent: p => /^search\b/i.test(p),
  isProductOrShoppingQuery: () => true, isCodeOnlyGenerationRequest: () => false,
  isFactualOrCurrentEventsQuery: () => true, classifyIntent: () => 'conversation'
});
context.isSimpleGreetingPrompt = p => /^(?:hi|hello|hey)[!.\s]*$/i.test(p);
for (const name of ['isVisualCreationRequest', 'analyzePromptRoute', 'isUnrequestedGreeting']) {
  const start = source.indexOf('function ' + name + '(');
  vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 1)), context);
}
const pipeline = 'Draw a horizontal compiler pipeline with lexical analysis, parsing, semantic analysis, intermediate code generation, optimization, and machine code generation.';
const sequence = 'Create a login sequence diagram with Browser, API, and Database. Browser sends credentials to API. API checks credentials with Database. Database returns the result to API. API replies with a session token to Browser.';
const prompts = [pipeline, sequence, 'Draw a system architecture with a Chrome Browser, API and Database.', 'Create a bar chart: Alpha: 10; Beta: 20.', 'Hey, please draw a hierarchy of the Engineering team.', 'Can you draw a horizontal compiler pipeline with parsing and code generation?'];
for (const prompt of prompts) {
  const result = context.analyzePromptRoute(prompt, [{ text: 'search latest browsers', isAi: false }]);
  assert.equal(result.visual, true, prompt);
  assert.equal(result.intent, 'conversation', prompt);
  assert.equal(result.browser, false, 'browser toggle does not override visual output');
  assert.equal(result.request, prompt, 'current task is preserved');
}
assert.equal(searches, 0, 'visuals never invoke search resolution');
for(const prompt of ['reate a labeled SVG illustration of the water cycle. Show evaporation, condensation, precipitation, and collection with directional arrows.”','I need a labeled illustration of a volcano','A custom poster about photosynthesis']){
 const result=context.analyzePromptRoute(prompt);assert(result.visual,prompt);assert.equal(result.intent,'conversation');assert.equal(planner.plan(prompt).family,'artifact');
}
for(const prompt of ['What is an SVG illustration?','Please explain what a poster is','Open Chrome and create a labeled SVG illustration','Create an SVG illustration, code only'])assert(!context.isVisualCreationRequest(prompt),prompt);
for (const prompt of ['What is a sequence diagram?', 'Open Chrome and draw a diagram', 'Install a pipeline tool', 'Set a timer for 5 minutes']) {
  assert.equal(context.isVisualCreationRequest(prompt), false, prompt);
}
context.window.BrownBrowser = null;
const search = context.analyzePromptRoute('Search online for current laptop prices');
assert.equal(search.intent, 'search');
assert.equal(search.request, 'Search online for current laptop prices', 'non-follow-up resolver output cannot overwrite user request');
assert(context.isUnrequestedGreeting("Hello! I'm Brown. How can I assist you today?", pipeline));
assert(!context.isUnrequestedGreeting('Hello! How can I help you today?', 'hi'));
assert(!context.isUnrequestedGreeting('Hello! How can I help you today?', 'Write a greeting for my assistant'));
assert.match(source, /if \(!requestPlan\.visual && COMPUTER_ACTIONS_ENABLED && window\.agentHarnessClient/, 'visual requests bypass the generic harness');
assert.match(source, /requestPlan\.visual \? await ensureOllamaReadyForChat\(\)/, 'offline visuals do not require a selected cloud model key');
(async () => {
  let calls = 0, verified = false;
  const answer = await planner.generate({ request: pipeline, generate: () => { calls++; throw Error('Model must not run'); }, verify: async result => { verified = true; assert.match(result, /flowchart LR/); } });
  assert.equal(calls, 0); assert(verified);
  for (const label of ['lexical analysis', 'parsing', 'semantic analysis', 'intermediate code generation', 'optimization', 'machine code generation']) assert(answer.includes(label) || answer.includes(label.replace(' generation', '<br/>generation')));
  const failed = await planner.generate({ request: pipeline, generate: () => {}, verify: () => { throw Error('Layout unavailable'); } });
  assert.match(failed, /could not be rendered.*Layout unavailable/);
  assert.equal(planner.suppliedPipeline('Draw a pipeline with A, B if approved, and C.', planner.plan(pipeline)), null, 'conditional requests still need semantic planning');
  console.log('PASS: complete visual requests stay offline, bypass search/browser/harness and preserve explicit pipeline stages.');
})().catch(error => { console.error(error); process.exitCode = 1; });
