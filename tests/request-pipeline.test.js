const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const pipeline=require('../src/renderer/request-pipeline');
const base={capability:'answer',goal:'Answer the current question',language:'',script:'',useContext:false,knowledge:'none',knowledgeEvidence:'',needsCurrentInfo:false,clarification:'',responseLength:'normal',skillIds:[],deliverables:['text'],confidence:0.9};
const plan=(patch={})=>({...base,...patch});
(async()=>{
  for(const request of ['hello','hi','heloo']){const greeting=await pipeline.interpret({request,model:'local',fetchImpl:async()=>{throw Error('Greeting must not load an interpreter');}});assert.equal(greeting.capability,'greeting');assert.equal(greeting.useContext,false);assert.deepEqual(await pipeline.evaluateAnswer({request,answer:'Hello, how can I assist you today?',plan:greeting,complete:async()=>{throw Error('Valid greeting must not need a judge');}}),[]);}
  const capabilities=pipeline.registry({web:false,actions:false});
  assert(capabilities.find(item=>item.id==='scatter').visual);assert(!capabilities.find(item=>item.id==='search').available);assert(!capabilities.find(item=>item.id==='action').available);
  for(const [request,language,script] of [['mere liye hindi me ek kavita likho','Hindi','Devanagari'],['मेरे लिए एक कविता लिखिए','Hindi','Devanagari'],['Écris un poème sur la pluie','French','Latin'],['اكتب قصيدة عن الأمل','Arabic','Arabic'],['雨について短い詩を書いて','Japanese','Han']]) {
    const result=await pipeline.interpret({request,complete:async()=>plan({capability:'creative',goal:'Write the requested poem',language,script,deliverables:['creative']})});
    assert.equal(result.output,'creative');assert.equal(result.language,language);assert.equal(result.request,request);assert(pipeline.contract(result).includes(script));
    assert(pipeline.validateAnswer('Hello! How can I help you today?',result).length,'generic validation rejects greeting substitution for every language');
  }
  const followup=await pipeline.interpret({request:'Peux-tu expliquer le deuxième vers ?',history:[{isAi:true,text:'A poem'}],complete:async input=>{assert.equal(input.history[0].text,'A poem');return plan({useContext:true,language:'French'});}});assert(followup.useContext);
  const unavailable=await pipeline.interpret({request:'Open a desktop app',environment:{actions:false},complete:async()=>plan({capability:'action'})});assert.equal(unavailable.status,'unavailable');
  const clarification=await pipeline.interpret({request:'Compare these files',complete:async()=>plan({capability:'documents',clarification:'Which files should I compare?'})});assert.equal(clarification.status,'clarify');
  const invalid=await pipeline.interpret({request:'Unfamiliar task',complete:async()=>plan({capability:'made-up-tool'})});assert.equal(invalid.status,'fallback');assert.equal(invalid.intent,'conversation','invalid plans never escalate into tools');
  assert.equal((await pipeline.interpret({request:'Task',complete:async()=>plan({confidence:0.2})})).status,'fallback');
  assert.equal((await pipeline.interpret({request:'Task',complete:async()=>plan({skillIds:['unknown']})})).status,'fallback');
  const noGlobal=await pipeline.interpret({request:'Write a story',complete:async()=>plan({knowledge:'global',knowledgeEvidence:'Use indexed files'})});assert.equal(noGlobal.knowledge,'none');
  const global=await pipeline.interpret({request:'Use my indexed files to explain the release',complete:async()=>plan({capability:'documents',knowledge:'global',knowledgeEvidence:'Use my indexed files'})});assert.equal(global.knowledge,'global');
  const noProject=await pipeline.interpret({request:'A question',environment:{projectKnowledge:false},complete:async()=>plan({knowledge:'project'})});assert.equal(noProject.knowledge,'none');
  assert(pipeline.validateAnswer('No table here',pipeline.normalize(plan({capability:'table',deliverables:['table']}),{request:'A table'})).length);
  const table=pipeline.normalize(plan({capability:'table',deliverables:['table']}),{request:'A table'});assert.equal(pipeline.validateAnswer('| A | B |\n| --- | --- |\n| 1 | 2 |',table).length,0);
  const diagram=pipeline.normalize(plan({capability:'sequence',deliverables:['sequence','table']}),{request:'Sequence and table'});assert(pipeline.validateAnswer('```mermaid\nsequenceDiagram\nA->>B: hi\n```',diagram).some(issue=>issue.includes('table')));
  assert.equal(pipeline.validateAnswer('Please provide chart values.',diagram,{outcome:'clarify'}).length,0,'specialist clarification is not treated as a malformed completed artifact');
  assert(pipeline.validateAnswer('Plain English only',pipeline.normalize(plan({capability:'creative',script:'Devanagari'}),{request:'A poem'})).length);
  const creative=pipeline.normalize(plan({capability:'creative',language:'French',script:'Latin',deliverables:['creative']}),{request:'Écris un poème.'});
  assert(pipeline.validateAnswer('CURRENT REQUEST PLAN (application-validated):\n{"goal":"Answer"}',creative).some(issue=>issue.includes('internal request plan')),'Internal plan echo was accepted as an answer');
  const social=pipeline.normalize(plan({capability:'greeting',goal:'Respond to the latest greeting'}),{request:'hi'});
  let checkedSocial=false;
  const stale=await pipeline.evaluateAnswer({request:'hi',answer:'Here are five things you can do for me.',plan:social,history:[{sender:'Ultron',text:'Prior reply'}],complete:async({payload,system})=>{checkedSocial=true;assert.equal(payload.request,'hi');assert.equal(payload.context[0].role,'assistant');assert(system.includes('role reversals'));return {verdict:'fail',issue:'Answer the latest greeting, not the earlier list request.'};}});
  assert(checkedSocial&&stale.length,'Social responses bypassed semantic fulfillment checks');
  const unchecked=await pipeline.evaluateAnswer({request:'A correction',answer:'Unchanged irrelevant response',plan:pipeline.fallback('A correction'),complete:async()=>({verdict:'fail',issue:'Address the correction.'})});assert(unchecked.length,'Interpreter fallback bypassed answer validation');
  assert.equal(pipeline.validateAnswer('Hello! How can I help you today?\nHere is the requested poem:\nLa pluie chante sur les toits.',creative).length,0,'a greeting preamble does not erase a substantive answer');
  const wrongMeaning=await pipeline.evaluateAnswer({request:'Écris un poème.',answer:'Bonjour, comment puis-je vous aider ?',plan:creative,complete:async()=>({verdict:'fail',issue:'Write the requested poem rather than greeting.'})});assert(wrongMeaning.length,'semantic fulfillment detects mismatches beyond English greeting patterns');
  assert.equal((await pipeline.evaluateAnswer({request:'Écris un poème.',answer:'La pluie chante sur les toits.',plan:creative,complete:async()=>({verdict:'pass',issue:''})})).length,0);
  assert.equal((await pipeline.assessAnswer({request:'Task',answer:'A response',plan:creative,model:'local',fetchImpl:async()=>new Promise(()=>{}),timeoutMs:10})).status,'unchecked','a slow evaluator cannot hang a request');
  assert.equal(pipeline.normalize(plan({needsCurrentInfo:true}),{request:'Current externally changing facts',environment:{web:false}}).status,'unavailable','freshness needs respect disabled web search');
  const run=pipeline.createRun({sessionId:'one',timeoutMs:1000,retryLimit:2});run.attachPlan(table,'Original input');assert(run.matches('Original input'));assert.equal(pipeline.forController(run.controller),run);
  run.claimRetry('transport');run.claimRetry('validation');assert(!run.canRetry('quality'));assert.throws(()=>run.claimRetry('quality'),/budget/);
  let calls=0;const owned=run.own(()=>calls++);owned();run.cancel();owned();assert.equal(calls,1);assert.throws(()=>run.guard(),error=>error.name==='AbortError');run.finish();
  const timed=pipeline.createRun({timeoutMs:10});await new Promise(resolve=>setTimeout(resolve,20));assert(timed.signal.aborted);assert.equal(timed.signal.reason.name,'TimeoutError');timed.finish();
  const controller=new AbortController();let started;const ready=new Promise(resolve=>started=resolve);
  const waiting=pipeline.interpret({request:'A task',model:'local-model',signal:controller.signal,fetchImpl:async(url,options)=>{assert.equal(url,'http://127.0.0.1:11434/api/chat');assert.equal(JSON.parse(options.body).stream,false);started();return new Promise(()=>{});},timeoutMs:1000});
  await ready;controller.abort();await assert.rejects(waiting,error=>error.name==='AbortError');
  const timeout=await pipeline.interpret({request:'A task',model:'local-model',fetchImpl:async()=>new Promise(()=>{}),timeoutMs:10});assert.equal(timeout.reason,'interpreter-timeout');
  const offline=await pipeline.interpret({request:'A task',model:'remote:cloud',fetchImpl:async()=>{throw Error('Cloud must not be called');}});assert.equal(offline.status,'fallback');
  let payload;const local=await pipeline.interpret({request:'A task',model:'local-model',fetchImpl:async(url,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({message:{content:JSON.stringify(plan())}}));}});assert.equal(local.status,'ready');assert(payload.format.properties.capability.enum.includes('creative'));assert.equal(payload.think,false);
  assert(!pipeline.contract(creative).includes('\"goal\"'),'Generation prompt must not contain interpreter goal JSON');
  assert(pipeline.validateAnswer('Some text {\"goal\":\"x\",\"deliverables\":[\"text\"]}',creative).some(issue=>issue.includes('internal request plan')));
  const source=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');assert(!/kavita\|kavitha|कविता\|शायरी/.test(source),'narrow language-specific classifier rules were removed');
  const routing=vm.createContext({window:{BrownRequestPipeline:pipeline,BrownVisualPlanner:require('../src/renderer/visual-planner'),UltronAgentSkills:{listBuiltinSkills:()=>[]},UltronMultiProviderHub:{detectProviderForModel:()=> 'ollama'}},
    currentSessionId:'chat',installedModelsList:[{name:'local'}],activeModel:'local',COMPUTER_ACTIONS_ENABLED:false,_promptMentions:{files:[],forceKnowledge:false},
    logTrace(){},getChatKnowledgeScope:()=>[],isWebSearchEnabled:()=>false,isRagAutoEnabled:()=>true,getAgentRuntimeSettings:()=>({skillsEnabled:true}),isOllamaCloudPulledModel:()=>false,isThinkingMarkup:()=>false,isVisualCreationRequest:text=>/Draw a diagram/.test(text)});
  routing.window.BrownRequestPipeline={...pipeline,interpret:async()=>pipeline.fallback('Draw a diagram')};
  const start=source.indexOf('async function interpretUserRequest('),end=source.indexOf('\nfunction analyzePromptRoute(',start);vm.runInContext(source.slice(start,end),routing);
  const routeRun=pipeline.createRun();const route=await routing.interpretUserRequest('Draw a diagram',[],routeRun);assert(route.visual,'explicit working visual route survives an uncertain interpreter');routeRun.finish();
  routing.window.BrownArtifactRuntime=require('../src/renderer/artifact-runtime');routing.isReminderOrTimerRequest=()=>false;
  const visualStart=source.indexOf('function isVisualCreationRequest(');vm.runInContext(source.slice(visualStart,source.indexOf('\nasync function interpretUserRequest(',visualStart)),routing);
  const artifactRun=pipeline.createRun();const artifactRoute=await routing.interpretUserRequest('reate a labeled SVG illustration of the water cycle',[],artifactRun);
  assert(artifactRoute.visual);assert.equal(artifactRoute.visualSelection.family,'artifact');assert.equal(artifactRoute.intent,'conversation');artifactRun.finish();
  globalThis.BrownArtifactRuntime=require('../src/renderer/artifact-runtime');let interpretationCalls=0;
  const directArtifact=await pipeline.interpret({request:'Create a labeled SVG illustration of the water cycle',fetchImpl:async()=>{interpretationCalls++;throw Error('Redundant interpretation');}});
  assert.equal(directArtifact.capability,'artifact');assert.equal(interpretationCalls,0,'explicit standalone artifact avoids a second local inference');
  await pipeline.interpret({request:'Create a labeled SVG illustration from my files',environment:{pinned:true},fetchImpl:async()=>{interpretationCalls++;throw Error('Model unavailable');},model:'local'});
  assert.equal(interpretationCalls,1,'source-dependent requests retain interpretation');
  console.log('PASS: shared capability plans, multilingual contracts, validation, source permissions, local-only interpretation, timeout/cancellation, common retry budgets and visual compatibility.');
})().catch(error=>{console.error(error);process.exitCode=1;});
