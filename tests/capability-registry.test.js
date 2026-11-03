// Shim a browser-like global so the agent UMD modules (which assign to `window` and read
// `window.localStorage`) register on globalThis exactly as they do in the renderer.
globalThis.window = globalThis;
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };

const assert = require('node:assert/strict');
require('../src/agent/agent-capabilities'); // registers window.UltronAgentCapabilities (no module.exports)
require('../src/agent/agent-skills');       // registers window.UltronAgentSkills
const caps = globalThis.UltronAgentCapabilities;
const pipeline = require('../src/renderer/request-pipeline');
const registry = require('../src/renderer/capability-registry');

const env = { web: true, actions: true };

// --- Shape: every entry carries risk / permissions / cost / verification / fallback ---
const all = registry.all(env);
assert(all.length > 0);
for (const entry of all) {
  assert.equal(typeof entry.id, 'string');
  assert(['capability', 'skill', 'tool-group'].includes(entry.kind), 'known kind: ' + entry.kind);
  assert(registry.RISK.includes(entry.risk), 'valid risk level on ' + entry.id);
  assert(Array.isArray(entry.permissions));
  assert.equal(typeof entry.cost, 'number');
  assert.equal(typeof entry.available, 'boolean');
  assert.equal(typeof entry.verification, 'string');
  assert.equal(typeof entry.fallback, 'string');
}
// All three sources are unified into the one catalog.
assert(all.some(e => e.kind === 'capability'), 'chat capabilities present');
assert(all.some(e => e.kind === 'skill'), 'skills present');
assert(all.some(e => e.kind === 'tool-group'), 'permission-gated tool groups present');

// --- Enum stability: capability ids must match request-pipeline.registry exactly --------
const capIds = all.filter(e => e.kind === 'capability').map(e => e.id);
assert.deepEqual(capIds, pipeline.registry(env).map(e => e.id), 'registry does not disturb the interpreter capability enum');

// --- Smallest-set routing ------------------------------------------------------------
const answer = registry.select({ plan: { capability: 'answer' }, environment: env, skills: [] });
assert.equal(answer.intent, 'conversation');
assert.deepEqual(answer.tools, [], 'pure local generation needs no tool group');
assert.equal(answer.smallestSet, true);

const search = registry.select({ plan: { capability: 'search' }, environment: env, skills: [] });
assert.equal(search.intent, 'search');
assert.deepEqual(search.tools.map(t => t.id), ['web'], 'search depends only on the web group, not all eight');

const docs = registry.select({ plan: { capability: 'documents' }, environment: env, skills: [] });
assert.deepEqual(docs.tools.map(t => t.id), ['knowledge_rag']);

const action = registry.select({ plan: { capability: 'action' }, environment: env, skills: [] });
assert.equal(action.intent, 'action');
const actionIds = action.tools.map(t => t.id);
assert(actionIds.includes('app_control') && actionIds.includes('shell'), 'action exposes its execution groups');
assert(!actionIds.includes('knowledge_rag') && !actionIds.includes('clipboard'), 'action never exposes unrelated groups');
assert.equal(action.tools.find(t => t.id === 'shell').risk, 'execution');

const artifact = registry.select({ plan: { capability: 'answer', visual: true, visualSelection: { family: 'artifact' } }, environment: env });
assert.equal(artifact.intent, 'visual-artifact');
assert.deepEqual(artifact.tools, []);
const chart = registry.select({ plan: { capability: 'answer', visual: true, visualSelection: { family: 'chart' } }, environment: env });
assert.equal(chart.intent, 'chart');

// Skills pass through annotated, capped at the smallest set (3), and can never carry risk.
const routed = registry.select({ plan: { capability: 'answer' }, environment: env, skills: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] });
assert.equal(routed.skills.length, 3);
assert(routed.skills.every(s => s.risk === 'read-only'), 'skills are playbooks, never an execution risk');

// --- Unavailable capabilities explain why + the next step ----------------------------
assert.equal(registry.explainUnavailable('answer', env), null, 'available capability needs no explanation');
const noWeb = registry.explainUnavailable('search', { web: false });
assert(noWeb && /web search/i.test(noWeb.reason) && noWeb.nextStep.length > 0);
const noAction = registry.explainUnavailable('action', { actions: false });
assert(noAction && noAction.nextStep.length > 0);
const blockedRoute = registry.select({ plan: { capability: 'search' }, environment: { web: false } });
assert(blockedRoute.unavailable && /web search/i.test(blockedRoute.unavailable.reason), 'routing surfaces the unavailable explanation');
assert.deepEqual(blockedRoute.tools, [], 'a disabled group is never routed');

// A permission group turned off is reported unavailable with a Settings pointer.
caps.setCapabilityMode('web', 'off');
const offGroup = registry.get('tool:web', env);
assert.equal(offGroup.available, false);
assert.equal(offGroup.mode, 'off');
const offWhy = registry.explainUnavailable('tool:web', env);
assert(offWhy && /disabled/i.test(offWhy.reason) && /Settings/.test(offWhy.nextStep));
caps.setCapabilityMode('web', 'always');
assert.equal(registry.get('tool:web', env).available, true);

// --- No new autonomy: skills grant no permissions; file/shell groups stay gated --------
for (const entry of all.filter(e => e.kind === 'skill')) assert.deepEqual(entry.permissions, [], 'a skill cannot grant a permission');
const shell = registry.get('tool:shell', env);
assert(shell && shell.risk === 'execution' && typeof shell.mode === 'string', 'shell stays a gated execution group');

// --- Ledger evidence: the exact call the executor makes records selected tool intent ---
const { createLedger } = require('../src/renderer/execution-ledger');
const led = createLedger({ requestId: 'r1', sessionId: 's1', provider: 'ollama', model: 'llama3.2' });
led.tools(registry.select({ plan: { capability: 'search' }, environment: env, skills: [] }).tools);
const summary = led.summary();
assert(summary.tools.some(t => t.id === 'web' && t.risk === 'read-only'), 'ledger shows the selected tool intent');
led.contextBudget({ limit: 1000, source: 'model', allocations: [] });
assert.equal(led.summary().privacy.includesConversation, false, 'tool intent never carries conversation content');

console.log('PASS: unified capability registry — risk/permission/cost on every entry, enum-stable capabilities, smallest-set routing, actionable unavailable messages, ledger tool intent, and no new shell/filesystem autonomy.');
