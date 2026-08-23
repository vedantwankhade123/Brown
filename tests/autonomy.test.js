/**
 * Autonomy upgrade regression suite (plan phases 1–8).
 * Covers: risk classifier + mode matrix (P3), artifact anaphora resolution (P1),
 * planner decomposition / verification requirements / recovery (P2),
 * and the web search ranker (P7).
 */
const assert = require('assert');

// ---------------------------------------------------------------
// Minimal browser shims so the renderer agent modules load in Node
// ---------------------------------------------------------------
const _store = {};
if (!global.window) global.window = {};
window.localStorage = {
  getItem: (k) => (k in _store ? _store[k] : null),
  setItem: (k, v) => { _store[k] = String(v); },
  removeItem: (k) => { delete _store[k]; }
};
window.dispatchEvent = () => {};
if (!global.CustomEvent) {
  global.CustomEvent = class CustomEvent {
    constructor(type, opts = {}) { this.type = type; this.detail = opts.detail; }
  };
}
if (!global.document) {
  global.document = {
    getElementById: (id) => (id === 'select-security-mode' ? { value: 'Adaptive' } : null)
  };
}

require('../src/agent/agent-policy.js');
require('../src/agent/agent-memory.js');
require('../src/agent/agent-planner.js');

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// ---------------------------------------------------------------
// P3: risk classifier + mode matrix
// ---------------------------------------------------------------
function runRiskClassifierTests() {
  console.log('Running risk classifier + mode matrix tests...');
  const policy = window.UltronAgentPolicy;
  assert.ok(policy, 'UltronAgentPolicy must be defined (agent-policy.js must parse)');

  // Classifier levels
  const destructive = policy.classifyRisk({ type: 'EXECUTE', target: 'del /f important.txt' });
  assert.strictEqual(destructive.level, 'high');
  assert.strictEqual(destructive.blacklisted, true);

  const readonly = policy.classifyRisk({ type: 'EXECUTE', target: 'dir' });
  assert.strictEqual(readonly.level, 'medium');

  const genericExecCall = { type: 'EXECUTE', target: 'npm install express' };
  const genericExec = policy.classifyRisk(genericExecCall);
  assert.strictEqual(genericExec.level, 'high');
  assert.ok(!genericExec.blacklisted);

  const sysWrite = policy.classifyRisk({ type: 'WRITE_FILE', targetPath: 'C:\\Windows\\System32\\evil.dll' });
  assert.strictEqual(sysWrite.level, 'high');
  assert.strictEqual(sysWrite.category, 'WRITE_FILE_SYSTEM');

  const docWrite = policy.classifyRisk({ type: 'WRITE_FILE', targetPath: 'C:\\Users\\vedan\\Documents\\index.html' });
  assert.strictEqual(docWrite.level, 'low');

  const passwordType = policy.classifyRisk({ type: 'APP_ACTION', action: 'TYPE_TEXT', appName: 'Login', text: 'my password hunter2' });
  assert.strictEqual(passwordType.level, 'high');
  assert.strictEqual(passwordType.category, 'TYPE_TEXT_SENSITIVE');

  const openAppCall = { type: 'APP_ACTION', action: 'OPEN_APP', appName: 'Notepad' };
  const openApp = policy.classifyRisk(openAppCall);
  assert.strictEqual(openApp.level, 'low');

  const hotkeyCall = { type: 'APP_ACTION', action: 'HOTKEY', keys: 'ctrl+s' };
  const hotkey = policy.classifyRisk(hotkeyCall);
  assert.strictEqual(hotkey.level, 'medium');

  // Mode matrix:
  // Trusted auto-approves everything except blacklisted commands
  assert.strictEqual(policy.requiresPermissionPrompt('Trusted', genericExecCall), false);
  assert.strictEqual(policy.requiresPermissionPrompt('Trusted', { type: 'EXECUTE', target: 'cipher /w C:\\' }), true);
  // Adaptive auto-approves low+medium, prompts on high
  assert.strictEqual(policy.requiresPermissionPrompt('Adaptive', genericExecCall), true);
  assert.strictEqual(policy.requiresPermissionPrompt('Adaptive', hotkeyCall), false);
  assert.strictEqual(policy.requiresPermissionPrompt('Adaptive', openAppCall), false);
  // Review prompts medium+high, auto low
  assert.strictEqual(policy.requiresPermissionPrompt('Review', hotkeyCall), true);
  assert.strictEqual(policy.requiresPermissionPrompt('Review', genericExecCall), true);
  assert.strictEqual(policy.requiresPermissionPrompt('Review', openAppCall), false);
  // Containment prompts everything
  assert.strictEqual(policy.requiresPermissionPrompt('Containment', openAppCall), true);

  console.log('✓ Risk classifier + mode matrix tests passed.');
}

// ---------------------------------------------------------------
// P1: artifact registry + anaphora resolution
// ---------------------------------------------------------------
async function runArtifactTests() {
  console.log('Running artifact registry + anaphora tests...');
  const memory = window.UltronAgentMemory;
  assert.ok(memory, 'UltronAgentMemory must be defined');

  const sid = 'suite-session';
  memory.registerArtifact('web', 'https://example.com/f1-results', { sessionId: sid, source: 'SEARCH', title: 'F1 results' });
  await sleep(5);
  memory.registerArtifact('resume', 'C:\\Users\\vedan\\Documents\\resume.pdf', { sessionId: sid, source: 'READ_FILE' });

  const artifacts = memory.getSessionArtifacts(sid);
  assert.strictEqual(artifacts.length, 2);

  // Pure anaphora ("open it") → most recent artifact (the resume)
  const itRef = memory.resolveArtifactReference('open it', sid);
  assert.ok(itRef && itRef.path.endsWith('resume.pdf'));

  // Dedupe by path+kind
  memory.registerArtifact('web', 'https://example.com/f1-results', { sessionId: sid, source: 'SEARCH' });
  assert.strictEqual(memory.getSessionArtifacts(sid).length, 2);

  const webRef = memory.resolveArtifactReference('open the website again', sid);
  assert.ok(webRef && webRef.kind === 'web');
  assert.strictEqual(webRef.path, 'https://example.com/f1-results');

  const resumeRef = memory.resolveArtifactReference('analyze the resume', sid);
  assert.ok(resumeRef && resumeRef.kind === 'resume');

  // Bare filename mention
  const nameRef = memory.resolveArtifactReference('what did resume.pdf say?', sid);
  assert.ok(nameRef && nameRef.kind === 'resume');

  // Prompt snippet exposes paths to the LLM
  const snippet = memory.getArtifactsSnippet(sid);
  assert.ok(snippet.includes('resume.pdf'));

  // Unrelated text resolves to nothing
  assert.strictEqual(memory.resolveArtifactReference('hello there', sid), null);

  console.log('✓ Artifact registry + anaphora tests passed.');
}

// ---------------------------------------------------------------
// P2: planner decomposition, verification requirements, recovery
// ---------------------------------------------------------------
function runPlannerTests() {
  console.log('Running planner decomposition tests...');
  const planner = window.UltronAgentPlanner;
  assert.ok(planner, 'UltronAgentPlanner must be defined');

  const multi = 'create a landing page for rajesh saloon and then open it in chrome';
  assert.strictEqual(planner.needsPlanning(multi), true);

  const plan = planner.buildStepPlan(multi);
  assert.ok(plan.length >= 2, 'multi-step prompt should produce >= 2 steps');
  assert.strictEqual(plan[0].tool_hint, 'WRITE_FILE', 'creation step comes before opening');
  assert.ok(plan.some(s => s.tool_hint === 'OPEN_APP'));

  assert.strictEqual(planner.needsPlanning('what time is it'), false);

  const subgoals = planner.planToSubgoals(plan);
  assert.strictEqual(subgoals.length, plan.length);
  assert.strictEqual(subgoals[0].completed, false);

  const marked = planner.markPlanStep(plan, 'WRITE_FILE', true);
  assert.ok(marked && marked.status === 'completed');
  assert.strictEqual(planner.planToSubgoals(plan)[0].completed, true);

  // Mid-task insertion (missing app discovered during execution)
  const before = plan.length;
  planner.insertPlanStep(plan, { title: 'Open Edge', tool_hint: 'OPEN_APP' });
  assert.strictEqual(plan.length, before + 1);
  assert.strictEqual(plan[plan.length - 1].status, 'pending');

  // Verification requirements (golden rule: evidence per action type)
  assert.strictEqual(planner.getVerificationRequirement({ type: 'APP_ACTION', action: 'OPEN_APP', appName: 'Chrome' }).type, 'foreground');
  assert.strictEqual(planner.getVerificationRequirement({ type: 'WRITE_FILE', targetPath: 'C:\\x.txt' }).type, 'file-exists');
  assert.strictEqual(planner.getVerificationRequirement({ type: 'APP_ACTION', action: 'CLICK' }).type, 'screenshot');
  assert.strictEqual(planner.getVerificationRequirement({ type: 'SEARCH' }).type, 'none');

  // Recovery strategy for a missed click
  const recovery = planner.getRecoveryStrategy(
    { type: 'APP_ACTION', action: 'CLICK', targetDesc: 'the Send button' },
    { success: false, message: 'click failed' }
  );
  assert.ok(recovery && recovery.strategy === 're-observe');

  console.log('✓ Planner decomposition tests passed.');
}

// ---------------------------------------------------------------
// P7: search ranker (mirrors rankSearchResults in renderer.js —
// the renderer cannot be loaded in Node, so this copy is kept in
// sync manually and asserted here)
// ---------------------------------------------------------------
function rankSearchResults(results, userPrompt) {
  const stop = new Set(['the', 'and', 'for', 'with', 'what', 'when', 'where', 'who', 'why', 'how', 'please', 'about', 'that', 'this', 'from', 'your']);
  const promptTokens = String(userPrompt || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !stop.has(t));
  const currentYear = new Date().getFullYear();
  return (Array.isArray(results) ? results : []).map(item => {
    const title = String(item.title || '').toLowerCase();
    const hay = `${title} ${item.snippet || ''}`;
    let score = 0;
    for (const token of promptTokens) {
      if (hay.includes(token)) score += title.includes(token) ? 3 : 1;
    }
    if (hay.includes(String(currentYear))) score += 4;
    else if (hay.includes(String(currentYear - 1))) score += 2;
    if (/\b(today|yesterday|this week|latest|just|hours ago|minutes ago)\b/.test(hay)) score += 3;
    if (String(item.snippet || '').length < 40) score -= 2;
    return { ...item, rankScore: score };
  }).sort((a, b) => b.rankScore - a.rankScore);
}

function runSearchRankerTests() {
  console.log('Running search ranker tests...');
  const year = new Date().getFullYear();
  const results = [
    { title: 'Old race archive', url: 'https://old.example/a', snippet: 'Historical summary of the season many years ago.' },
    { title: `F1 latest race results ${year}`, url: 'https://news.example/b', snippet: `Latest F1 race results from this week, updated today (${year}).` },
    { title: 'Unrelated cooking blog', url: 'https://food.example/c', snippet: 'Recipes and kitchen tips for beginners.' }
  ];
  const ranked = rankSearchResults(results, 'Who won the latest F1 race?');
  assert.strictEqual(ranked[0].url, 'https://news.example/b', 'keyword-overlap + recency winner must rank first');
  assert.strictEqual(ranked[ranked.length - 1].url, 'https://food.example/c', 'unrelated result must rank last');
  assert.ok(ranked[0].rankScore > ranked[2].rankScore);
  console.log('✓ Search ranker tests passed.');
}

async function runAutonomyTests() {
  runRiskClassifierTests();
  await runArtifactTests();
  runPlannerTests();
  runSearchRankerTests();
}

module.exports = { runAutonomyTests };
