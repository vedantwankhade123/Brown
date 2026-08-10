/**
 * Agent loop unit tests (tool parsing + widget markup detection).
 */
const assert = require('assert');

function parseJsonToolCall(text) {
  const candidates = [];
  const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson) candidates.push(fencedJson[1]);
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) candidates.push(objectMatch[0]);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const tool = String(parsed.tool || parsed.type || parsed.action || '').toUpperCase();
      const args = parsed.args || parsed.arguments || parsed;
      if (!tool) continue;
      if (['OPEN_APP', 'FOCUS_APP', 'CLICK', 'DOUBLE_CLICK', 'SCROLL'].includes(tool)) {
        return { type: 'APP_ACTION', action: tool, appName: args.appName, x: args.x, y: args.y, delta: args.delta };
      }
    } catch (e) {}
  }
  return null;
}

function isAgentWidgetMarkup(text) {
  return typeof text === 'string' && (
    text.includes('task-execution-widget') ||
    text.includes('ai-activity-live-box') ||
    text.includes('agent-final-response')
  );
}

function runAgentTests() {
  const openApp = parseJsonToolCall('{"tool":"OPEN_APP","args":{"appName":"Notepad"}}');
  assert.ok(openApp);
  assert.strictEqual(openApp.action, 'OPEN_APP');
  assert.strictEqual(openApp.appName, 'Notepad');

  const click = parseJsonToolCall('```json\n{"tool":"CLICK","args":{"x":100,"y":200}}\n```');
  assert.ok(click);
  assert.strictEqual(click.action, 'CLICK');
  assert.strictEqual(click.x, 100);

  const scroll = parseJsonToolCall('{"tool":"SCROLL","args":{"delta":-120}}');
  assert.ok(scroll);
  assert.strictEqual(scroll.delta, -120);

  assert.strictEqual(isAgentWidgetMarkup('<div class="task-execution-widget"></div>'), true);
  assert.strictEqual(isAgentWidgetMarkup('plain text answer'), false);

  const indented = '    <div class="task-execution-widget"></div>\n\nAnswer here';
  assert.strictEqual(isAgentWidgetMarkup(indented), true);
}

module.exports = { runAgentTests };

if (require.main === module) {
  runAgentTests();
  console.log('Agent tests passed.');
}
