const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const planner = require('../src/renderer/visual-planner');
const { example } = require('./visual-planner.test');
const source = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
let cloudCalls = 0, fail = false;
const requests = [], tokens = [], statuses = [];
const context = vm.createContext({
  window: { BrownVisualPlanner: planner, BrownVisualModelStream: { createGenerator: options => require('../src/renderer/visual-model-stream').createGenerator({ ...options, fetchImpl: (...args) => context.fetch(...args) }) }, localStorage: { getItem: () => null }, UltronMultiProviderHub: { detectProviderForModel: () => 'ollama' }, ultronAPI: { renderVisualDiagram: async () => ({ success: true, html: '<svg></svg>' }) } },
  document: { querySelector: () => null },
  getUserFullName: () => 'User', getSystemContext: async () => ({}), buildRealtimeContext: () => '',
  getRagKnowledgeSnippet: async () => '',
  classifyIntent: () => 'conversation', resolveModelForLocalAi: () => ({ switched: false }),
  isVisualCreationRequest: () => true, isOllamaCloudPulledModel: name => name.includes('cloud'),
  activeModel: 'local-text', installedModelsList: [], currentSessionId: null, conversationsStore: {}, _activeAbortController: null,
  INTENT_LOCAL_MODEL_PREFS: { visual: [] }, selectInstalledModelForPrefs: () => 'local-text', selectBestInstalledLocalModel: () => 'local-text',
  AbortController, setTimeout, clearTimeout, logTrace() {},
  tryGeminiFallbackAfterLocalFailure: async () => { cloudCalls++; },
  fetch: async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (fail) throw new Error('Local connection failed');
    return new Response(JSON.stringify({ message: { content: JSON.stringify(example('sequence')) }, done: true }) + '\n');
  }
});
const start = source.indexOf('async function queryOfflineLLM(');
const scopeStart = source.indexOf('function getChatKnowledgeScope(');
vm.runInContext(source.slice(scopeStart,source.indexOf('\nasync function getRagKnowledgeSnippet(',scopeStart)),context);
vm.runInContext(source.slice(start, source.indexOf('\nlet ONLINE_GEMINI_MODELS', start)), context);
let ragSearches=0;
Object.assign(context,{_promptMentions:{files:[],forceKnowledge:false},_lastRagCitations:[],_pendingLiveCitations:null,_citationBannerRendered:false,isRagAutoEnabled:()=>true});
context.window.ultronAPI.ragSearch=async()=>{ragSearches++;return {success:true,results:[{fileName:'authSlice.jsx',filePath:'D:/unrelated/authSlice.jsx',text:'Unrelated React code',score:1}]};};
const evidenceStart=source.indexOf('async function readPinnedMentionFile(');
vm.runInContext(source.slice(evidenceStart,source.indexOf('// ============================================================',evidenceStart)),context);
(async () => {
  const answer = await context.queryOfflineLLM('Draw a sequence diagram.', [], 'conversation', null, [], { onToken: token => tokens.push(token), onStatus: phase => statuses.push(phase) });
  assert.match(answer, /sequenceDiagram/);
  assert.equal(requests[0].url, 'http://127.0.0.1:11434/api/chat');
  assert.equal(requests[0].body.format.properties.family.const, 'sequence');
  assert.equal(tokens[0], '```mermaid\n', 'the loader receives a visual marker, never raw JSON');
  assert.equal(requests[0].body.stream, true);
  assert.equal(requests[0].body.think, false);
  assert.deepEqual(statuses, ['context', 'visual', 'visualGenerate', 'visualValidate', 'visualRender'], 'statuses follow actual visual generation and validation events');
  context.activeModel = 'remote-cloud';
  await context.queryOfflineLLM('Draw a sequence diagram.', [], 'conversation');
  assert.equal(requests.at(-1).body.model, 'local-text', 'cloud Ollama models are excluded');
  fail = true;
  const failed = await context.queryOfflineLLM('Draw a sequence diagram.', [], 'conversation');
  assert.match(failed, /Offline visual generation failed/);
  assert.equal(cloudCalls, 0, 'local failure never falls back to a cloud service');
  fail = false;
  context.activeModel = 'large-local';
  context.installedModelsList = [{ name: 'large-local', size: 9000 }, { name: 'phi3:latest', size: 2000 }, { name: 'remote-cloud', size: 1 }];
  const baseFetch = context.fetch;
  const recoveryModels = [];
  context.fetch = async (url, options) => {
    const model = JSON.parse(options.body).model;
    recoveryModels.push(model);
    if (model === 'large-local') return new Response('{"error":"out of memory"}', { status: 500 });
    return baseFetch(url, options);
  };
  const recovered = await context.queryOfflineLLM('Draw a sequence diagram.', [], 'conversation');
  assert.match(recovered, /sequenceDiagram/);
  assert.deepEqual(recoveryModels, ['large-local', 'phi3:latest']);
  assert.equal(context.activeModel, 'large-local', 'visual recovery does not change the selected chat model');
  context.currentSessionId='visual-chat';context.conversationsStore['visual-chat']={projectId:'alpha',messages:[]};
  context.window.BrownWorkspaceStore={active:()=> 'alpha',scope:()=>['D:/alpha'],instructions:()=>''};
  const scatter=await context.queryOfflineLLM('Create a scatter plot with Study hours on the x-axis and Score on the y-axis. Use these pairs: (1,40), (2,50), (3,55), (4,70), (5,75), (6,85). Do not invent additional observations.',[],'conversation');
  assert.match(scatter, /"scatter"/);assert.equal(ragSearches,0);assert.equal(context._pendingLiveCitations,null,'standalone chart cannot display unrelated citations even when search would return them');
  const stacked='Create a stacked bar chart of quarterly device sales. Q1: Phones 40, Laptops 20. Q2: Phones 50, Laptops 30. Q3: Phones 45, Laptops 35. Include a legend and label the axis Units sold.';
  context.conversationsStore['visual-chat'].messages=[{isAi:false,text:stacked},{isAi:true,text:'Please provide values.'},{isAi:false,text:'take random on your own'}];
  const followup=await context.queryOfflineLLM('take random on your own',[],'conversation');assert.match(followup,/"stacked-bar"/);assert.equal(ragSearches,0);
  console.log('PASS: real query route uses schema-constrained localhost generation and excludes cloud fallback.');
})().catch(error => { console.error(error); process.exitCode = 1; });
