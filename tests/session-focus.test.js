const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
const context = vm.createContext({
  extractPlainTextFromMessage: text => String(text),
  isThinkingMarkup: text => text.includes('thinking-container'),
  currentSessionId: 'first', conversationsStore: { first: { messages: [] } },
  isAwaitingResponse: true, _processingSessionId: null,
  nowIso: () => '2026-10-31', window: {}, _pendingLiveCitations: null,
  touchSession() {}, rebuildSessionHistoryList() {}, saveConversationsToDisk() {}, renderSessionPanel() {}
});
vm.runInContext(source.slice(source.indexOf('function cleanSessionFocusText('), source.indexOf('function buildSessionMetaDigest(')), context);
const user = { isAi: false, text: 'Draw a tree for this folder structure' };
const answer = { isAi: true, text: '## Folder structure\n```mermaid\nflowchart TD\n A-->B\n```' };
assert.equal(context.buildInstantSessionFocusSummary([user, answer]), 'Folder structure');
assert.equal(context.buildInstantSessionFocusSummary([user, {isAi:true,text:'```mermaid\nA-->B\n```'}]), 'Response to: Draw a tree for this folder structure');
assert.equal(context.buildInstantSessionFocusSummary([user, answer, {isAi:false,text:'Explain the database'}]), 'Working on: Explain the database');
assert.equal(context.buildInstantSessionFocusSummary([user, answer, {isAi:false,text:'Explain the database'}, {isAi:true,text:'The database stores account records.'}]), 'The database stores account records.');
vm.runInContext(source.slice(source.indexOf('function appendChatMessage('), source.indexOf('\nasync function generateRollingSummaryAsync(', source.indexOf('function appendChatMessage('))), context);
context.appendChatMessage('User', user.text, false, {skipRender:true});
assert.equal(context._processingSessionId, 'first', 'first prompt binds completion hook to the newly created session');
context.appendChatMessage('Brown', answer.text, true, {skipRender:true});
assert.equal(context.conversationsStore.first.messages.length, 2);
console.log('PASS: first-turn tracking, immediate focus summaries, diagram cleanup, and consecutive turns.');
