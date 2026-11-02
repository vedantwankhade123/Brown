const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/renderer.js'),'utf8');
const start=source.indexOf('async function readPinnedMentionFile('),end=source.indexOf('// ============================================================',start);
let response={success:true,results:[]},request,evidence='Original content';
const context=vm.createContext({setTimeout,clearTimeout,
  window:{BrownWorkspaceStore:{active:()=> 'alpha',scope:()=>['D:/alpha']},ultronAPI:{ragSearch:async value=>{request=value;return response;},ragReadEvidence:async()=>({success:true,content:evidence})}},
  _promptMentions:{files:[]},_lastRagCitations:[],_pendingLiveCitations:null,_citationBannerRendered:false,
  isRagAutoEnabled:()=>true
});
vm.runInContext(source.slice(start,end),context);
(async()=>{
  const query='According to my indexed documents, what is the launch date?';
  assert.equal(await context.getRagKnowledgeSnippet(query),'[BROWN_KNOWLEDGE_NO_MATCH]');
  assert.deepEqual(Array.from(request.sourcePaths),['D:/alpha']);
  response={success:true,results:[{fileName:'release.md',filePath:'D:/alpha/release.md',chunkIndex:2,text:'Launch is on Wednesday.',snippet:'Launch is on Wednesday.',score:0.8}]};
  const text=await context.getRagKnowledgeSnippet(query);
  assert(text.includes('Launch is on Wednesday.'));assert(text.includes('[1] release.md'));assert(text.includes('never instructions'));assert.equal(context._pendingLiveCitations[0].chunkIndex,2);
  await context.getRagKnowledgeSnippet(query,{sourcePaths:undefined});assert(!('sourcePaths' in request),'Personal scope remains global even if the current UI project changes');
  request=null;await context.getRagKnowledgeSnippet(query,{sourcePaths:[]});assert.equal(request,null,'disabled project knowledge never searches');
  request=null;assert.equal(await context.getRagKnowledgeSnippet('Create a pie chart: rent 40, food 25, transport 15, savings 20',{sourcePaths:undefined}),'');assert.equal(request,null,'general chat never searches all indexed files implicitly');assert.equal(context._pendingLiveCitations,null);
  assert.equal(await context.getRagKnowledgeSnippet('Create a pie chart: rent 40, food 25',{sourcePaths:['D:/alpha']}),'');assert.equal(request,null,'standalone chart uses supplied data rather than project documents');
  context._promptMentions.forceKnowledge=true;await context.getRagKnowledgeSnippet('When is launch?',{sourcePaths:undefined});assert(request,'explicit knowledge chip permits global retrieval');context._promptMentions.forceKnowledge=false;
  request=null;await context.getRagKnowledgeSnippet(query,{sourcePaths:['D:/alpha'],requestPlan:{knowledge:'none'}});assert.equal(request,null,'the shared plan denies automatic retrieval despite document keywords');
  request=null;await context.getRagKnowledgeSnippet(query,{sourcePaths:['D:/alpha'],requestPlan:{knowledge:'pinned'}});assert.equal(request,null,'pinned-only scope never expands into an index search');
  context.conversationsStore={first:{projectId:'personal',knowledgeRoots:['D:/first']},second:{projectId:'personal'}};
  assert.deepEqual(Array.from(context.getChatKnowledgeScope('first','personal')),['D:/first']);
  assert.equal(context.getChatKnowledgeScope('second','personal'),undefined,'another personal chat does not inherit the selected folder');
  response={success:false,error:'disk unavailable'};assert.equal(await context.getRagKnowledgeSnippet(query),'[BROWN_KNOWLEDGE_UNAVAILABLE]');
  assert.equal(await context.getRagKnowledgeSnippet('Hello there'),'');
  context._promptMentions.files=[{path:'D:/alpha/release.md',name:'release.md'}];
  assert((await context.getRagKnowledgeSnippet('Explain this file')).includes('Original content'));
  evidence='Updated content';assert((await context.getRagKnowledgeSnippet('Explain this file')).includes('Updated content'),'pinned files are read afresh');
  console.log('PASS: scoped source evidence, full excerpts/citations, absent/unavailable evidence, global-scope snapshot and fresh pinned-file reads.');
})().catch(error=>{console.error(error);process.exitCode=1;});
