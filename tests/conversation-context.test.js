const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = require('../src/renderer/conversation-context');
assert.deepEqual(context.history([{sender:'User',text:'Earlier request'},{sender:'Ultron',text:'Earlier answer'}],'Current request').map(message=>message.role),['user','assistant'],'Legacy assistant turns must retain their role');
const tight=context.history([{isAi:false,text:'Earlier request'},{isAi:true,text:'A'.repeat(6000)},{isAi:false,text:'The latest correction must stay in context'},{isAi:true,text:'B'.repeat(6000)}],'Explain the previous answer',{maxChars:1200});
assert(tight.some(message=>message.content.includes('latest correction')),'Large answers crowded out the latest user correction');
const prompt = 'what does it mean by the word loy in the poem u have given ?';
const poem = 'A quiet dawn, a gentle glow,\n' + 'The rivers carry dreams below.\n'.repeat(40) + 'Loy, the one who makes life worth living.\nA love that will always be your pleasure.';
const messages = [{ isAi: false, text: 'Write a poem for me.' }, { isAi: true, text: poem }, { isAi: false, text: prompt }];
assert(context.isFollowUp(prompt));
assert(context.isFollowUp('What is the meaning of this line in your poem?'));
assert(context.isFollowUp('Compare the functions in the code you wrote earlier.'));
assert(!context.isFollowUp('What is a poem?'));
assert(context.referencesTerm('What does loy mean?', messages));
assert(!context.referencesTerm('What does unrelated mean?', messages));
const history = context.history(messages, prompt);
assert.equal(history.filter(message => message.content === prompt).length, 0, 'current user input is not duplicated as history');
assert(history.some(message => message.content === poem), 'the full poem, including later lines, reaches the model');
const older = [...messages.slice(0, 2), ...Array.from({ length: 24 }, (_, index) => ({ isAi: index % 2 === 0, text: 'Other conversation detail ' + index }))];
assert(context.history(older, prompt).some(message => message.content.includes('Loy, the one')), 'an older referenced artifact survives the recent window');
const code = '```html\n<div class="greeting">Hello</div>\n```';
assert.equal(context.history([{ isAi: true, text: code }], 'Explain this code')[0].content, code);
assert(context.history(older, prompt, { maxChars: 2000 }).reduce((sum, message) => sum + message.content.length, 0) <= 2000);
const recommendations = [{isAi:false,text:'Suggest three implementations using TypeScript without cloud APIs.'},{isAi:true,text:'1. Local retrieval\n2. Project workspaces\n3. Model health'},...Array.from({length:20},(_,i)=>({isAi:i%2===0,text:'Unrelated follow-up '+i}))];
assert(context.isFollowUp('Implement the second point.'));
const ordinalHistory = context.history(recommendations,'Implement the second point.');
assert(ordinalHistory.some(m=>m.content.includes('2. Project workspaces')));
assert(ordinalHistory.some(m=>m.content.includes('without cloud APIs')),'the original constraints accompany the referenced recommendation');
const source = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
const sandbox = vm.createContext({ window: { BrownConversationContext: context }, normalizePromptTypos: text => text,
  currentSessionId: 'same-chat', conversationsStore: { 'same-chat': { messages } },
  isReminderOrTimerRequest: () => false, isCodeOnlyGenerationRequest: () => false,
  isFreshStandaloneRequest: () => false, isUnusableChatHistoryMessage: () => false,
  isThinkingMarkup: () => false, extractPlainTextFromMessage: text => text
});
for (const name of ['isExplanationRequest', 'isFollowUpAboutPriorTurn', 'isShortCreativeRequest', 'isContentGenerationRequest', 'shouldSkipConversationHistory', 'getConversationHistory']) {
  const start = source.indexOf('function ' + name + '(');
  vm.runInContext(source.slice(start, source.indexOf('\nfunction ', start + 1)), sandbox);
}
assert(sandbox.isFollowUpAboutPriorTurn(prompt));
assert(!sandbox.isShortCreativeRequest(prompt));
assert(!sandbox.isContentGenerationRequest(prompt));
assert(!sandbox.shouldSkipConversationHistory(prompt));
assert(sandbox.getConversationHistory(prompt).some(message => message.content === poem));
sandbox.currentSessionId = 'different-chat';
assert.equal(sandbox.getConversationHistory(prompt).length, 0, 'context never leaks from another chat');
console.log('PASS: poem/word follow-ups, full original text, older references, intact code, context budgets and chat isolation.');

// Exercise the real API request path with long-term memory switched off.
let request;
sandbox.currentSessionId = 'same-chat';
sandbox.window.localStorage = { getItem: key => key === 'ultron-memory-enabled' ? 'false' : null };
sandbox.window.UltronMultiProviderHub = { detectProviderForModel: () => 'test-provider', queryProvider: async value => { request = value; return 'The word is explained using the poem above.'; } };
Object.assign(sandbox, {
  document: { querySelector: () => null }, getUserFullName: () => 'User', getSystemContext: async () => ({}), buildRealtimeContext: () => ({}),
  resolveModelForLocalAi: () => ({ switched: false }), isVisualCreationRequest: () => false,
  getLearnedMemorySnippet: () => '', getRagKnowledgeSnippet: async () => '', buildAgentPromptContext: () => '',
  activeModel: 'test-model', isVoiceChatModeEnabled: () => false, COMPUTER_ACTIONS_ENABLED: false,
  getLocalAiMode: () => 'selected', trimRunawayContinuation: value => value,
  _activeAbortController: null, logTrace() {},
  notifyModelIssue() {}, classifyModelFailure: error => ({ message: error.message })
});
const queryStart = source.indexOf('async function queryOfflineLLM(');
const scopeStart = source.indexOf('function getChatKnowledgeScope(');
vm.runInContext(source.slice(scopeStart,source.indexOf('\nasync function getRagKnowledgeSnippet(',scopeStart)),sandbox);
vm.runInContext(source.slice(queryStart, source.indexOf('\nlet ONLINE_GEMINI_MODELS', queryStart)), sandbox);
(async () => {
  await sandbox.queryOfflineLLM(prompt, [], 'conversation', 'Answer from the previous poem.');
  assert(request, 'the model receives a request');
  assert(request.messages.some(message => message.role === 'assistant' && message.content === poem), 'disabling long-term memory does not erase same-chat context');
  assert.equal(request.messages.filter(message => message.content === prompt).length, 0);
  sandbox.conversationsStore['different-chat'] = { messages: [{ isAi: true, text: 'Unrelated private content from another chat.' }] };
  sandbox.getSystemContext = async () => { sandbox.currentSessionId = 'different-chat'; return {}; };
  await sandbox.queryOfflineLLM(prompt, [], 'conversation', 'Answer from the previous poem.');
  assert(request.messages.some(message => message.content === poem), 'a pending request retains its originating chat');
  assert(!request.messages.some(message => message.content.includes('Unrelated private content')));
  console.log('PASS: actual provider payload retains same-chat history with long-term memory disabled.');
  sandbox.getRagKnowledgeSnippet = async () => 'LOCAL KNOWLEDGE EVIDENCE: release.md says Wednesday.';
  sandbox.window.BrownWorkspaceStore = { active: () => 'alpha', instructions: () => 'PROJECT INSTRUCTIONS: Use TypeScript.', scope: () => ['D:/alpha'] };
  await sandbox.queryOfflineLLM('Explain the release schedule.', [], 'conversation', 'Answer briefly.');
  assert(request.systemPrompt.includes('release.md says Wednesday.'));
  assert(request.systemPrompt.includes('Use TypeScript.'));
  sandbox.getRagKnowledgeSnippet = async () => '[BROWN_KNOWLEDGE_NO_MATCH]';
  const before = request;
  const absent = await sandbox.queryOfflineLLM('According to my documents, what is the schedule?', [], 'conversation', 'Answer briefly.');
  assert(absent.includes('could not find relevant excerpts'));assert.equal(request,before,'missing evidence does not trigger a fabricated model answer');
  sandbox.getRagKnowledgeSnippet=async()=>'';sandbox.DOMException=DOMException;
  const abort=new AbortController();sandbox._activeAbortController=abort;
  let finishProvider,started;const providerStarted=new Promise(resolve=>{started=resolve;});
  sandbox.window.UltronMultiProviderHub.queryProvider=async()=>{started();return new Promise(resolve=>{finishProvider=resolve;});};
  const pending=sandbox.queryOfflineLLM('mere liye hindi me ek kavita likho',[],'conversation','Write a Hindi poem.');
  await providerStarted;abort.abort();sandbox._activeAbortController=null;finishProvider('Hello! How can I help you today?');
  await assert.rejects(pending,error=>error.name==='AbortError','Stop remains effective after UI clears the global controller');
  console.log('PASS: stopped request rejects late model output after global UI reset.');
  const pipeline=require('../src/renderer/request-pipeline');
  sandbox.window.BrownRequestPipeline=pipeline;
  Object.assign(sandbox,{AbortController,setTimeout,clearTimeout});
  sandbox.window.UltronMultiProviderHub.queryProvider=async value=>{request=value;return 'A complete response.';};
  sandbox.currentSessionId='same-chat';sandbox.getSystemContext=async()=>({});
  const run=pipeline.createRun({sessionId:'same-chat'});
  const plan={status:'ready',capability:'creative',goal:'Write a short French poem about rain',language:'French',script:'Latin',useContext:true,knowledge:'none',responseLength:'brief',output:'creative',deliverables:['poem']};
  run.attachPlan(plan,'Write a poem.');sandbox._activeAbortController=run.controller;
  await sandbox.queryOfflineLLM('Write a poem.',[],'conversation','Complete the request.');
  assert(request.systemPrompt.includes(plan.goal),'the real provider receives the shared goal contract');
  run.cancel();
  let retrievalCalls=0,visualCalls=0;
  sandbox.getRagKnowledgeSnippet=async()=>{retrievalCalls++;return 'PRIVATE RETRIEVAL';};
  sandbox.isVisualCreationRequest=()=>true;
  sandbox.window.BrownVisualPlanner={generate:()=>{visualCalls++;throw Error('background must not generate visuals');},resolveRequest:()=>{throw Error('background must not resolve visual follow-ups');}};
  await sandbox.queryOfflineLLM('Summarize the diagram chat.',[],'conversation','Return a title.',[],{background:true,sessionId:'same-chat'});
  assert.equal(retrievalCalls,0);assert.equal(visualCalls,0);
  assert(!request.systemPrompt.includes(plan.goal));
  assert(!request.systemPrompt.includes('Use TypeScript.'));
  assert(!request.messages.some(message=>message.content===poem),'background requests do not import full foreground history');
  console.log('PASS: shared goal reaches generation; background metadata remains independent of cancellation, visuals, project instructions and retrieval.');
})().catch(error => { console.error(error); process.exitCode = 1; });
