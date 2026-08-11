/**
 * Agent loop guard + ReAct parser unit tests.
 */
const assert = require('assert');

function parseReactToolCall(text) {
  if (!text || typeof text !== 'string') return null;

  const finalMatch = text.match(/Final Answer:\s*([\s\S]+)/i);
  if (finalMatch && finalMatch[1].trim()) {
    return { type: 'FINAL_ANSWER', content: finalMatch[1].trim() };
  }

  const actionMatch = text.match(/Action:\s*([^\n]+)/i);
  if (!actionMatch) return null;

  const actionName = actionMatch[1].trim().replace(/^["']|["']$/g, '').toUpperCase();
  const inputMatch = text.match(/Action Input:\s*([\s\S]*?)(?=\n\n|\nThought:|\nAction:|\nFinal Answer:|$)/i);
  let actionInput = inputMatch ? inputMatch[1].trim() : '';

  let args = {};
  if (actionInput) {
    try {
      args = JSON.parse(actionInput);
    } catch (e) {
      args = { appName: actionInput.replace(/^["']|["']$/g, '') };
    }
  }

  return { type: 'APP_ACTION', action: actionName, appName: args.appName };
}

function createLoopGuard(config = {}) {
  const settings = {
    enabled: true,
    maxIdenticalCalls: 3,
    pingPongWindow: 6,
    pollToolBudget: 5,
    warnBeforeBlock: false,
    ...config
  };
  const callCounts = new Map();
  const toolSequence = [];
  const perToolCounts = new Map();

  function checkCall(toolCall) {
    if (!settings.enabled) return { blocked: false, reason: '' };
    const label = toolCall.action || toolCall.type;
    const key = JSON.stringify(toolCall);
    const count = (callCounts.get(key) || 0) + 1;
    callCounts.set(key, count);
    if (count > settings.maxIdenticalCalls) {
      return { blocked: true, reason: 'identical' };
    }
    const perTool = (perToolCounts.get(label) || 0) + 1;
    perToolCounts.set(label, perTool);
    toolSequence.push(label);
    return { blocked: false, reason: '' };
  }

  return { checkCall };
}

function runAgentTests() {
  const openApp = parseReactToolCall(`Thought: I should open Notepad.
Action: OPEN_APP
Action Input: Notepad`);
  assert.ok(openApp);
  assert.strictEqual(openApp.action, 'OPEN_APP');
  assert.strictEqual(openApp.appName, 'Notepad');

  const final = parseReactToolCall('Thought: done\nFinal Answer: Notepad is open.');
  assert.ok(final);
  assert.strictEqual(final.type, 'FINAL_ANSWER');
  assert.match(final.content, /Notepad is open/);

  const guard = createLoopGuard({ maxIdenticalCalls: 2 });
  const tool = { type: 'APP_ACTION', action: 'OPEN_APP', appName: 'Notepad' };
  assert.strictEqual(guard.checkCall(tool).blocked, false);
  assert.strictEqual(guard.checkCall(tool).blocked, false);
  assert.strictEqual(guard.checkCall(tool).blocked, true);

  // Deep research merge dedupes URLs
  function mergeSearchPayloads(base, incoming) {
    const merged = { results: [], answerContext: '', query: incoming.query || base.query || '' };
    const seen = new Set();
    for (const item of [...(base.results || []), ...(incoming.results || [])]) {
      const url = String(item.url || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      merged.results.push(item);
    }
    return merged;
  }

  const hop1 = { results: [{ url: 'https://a.com', title: 'A' }] };
  const hop2 = { results: [{ url: 'https://a.com', title: 'A dup' }, { url: 'https://b.com', title: 'B' }] };
  const merged = mergeSearchPayloads(hop1, hop2);
  assert.strictEqual(merged.results.length, 2);
  assert.strictEqual(merged.results[1].title, 'B');
}

module.exports = { runAgentTests, parseReactToolCall, createLoopGuard };

if (require.main === module) {
  runAgentTests();
  console.log('Agent tests passed.');
}
