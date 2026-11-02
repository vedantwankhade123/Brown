const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const pipeline=require('../src/renderer/request-pipeline'),context=require('../src/renderer/conversation-context');
async function scenario(request,candidates,capability='answer',useContext=true){
 const calls=[],checks=[],traces=[];
 const plan={...pipeline.fallback(request),status:'ready',capability,useContext};
 const runtime={BrownConversationContext:context,BrownRequestPipeline:{...pipeline,interpret:async()=>plan,evaluateAnswer:options=>pipeline.evaluateAnswer({...options,complete:async({payload})=>{checks.push(payload);return payload.answer.startsWith('BAD:')?{verdict:'fail',issue:'Answer the latest request from Brown’s perspective; do not repeat an unrelated reply.'}:{verdict:'pass',issue:''};}})},BrownVisualModelStream:{generate:async options=>{calls.push(options);options.onToken(candidates[calls.length-1]);return candidates[calls.length-1];}}};
 const sandbox=vm.createContext({window:runtime,AbortController,DOMException,setTimeout,clearTimeout});
 vm.runInContext(fs.readFileSync(require.resolve('../src/renderer/chat-job-executor'),'utf8'),sandbox);
 const history=[{sender:'User',text:'List five things you can do for me'},{sender:'Ultron',text:'An older response'}];
 const result=await runtime.BrownChatJobExecutor.create({api:{},trace:line=>traces.push(line)})({id:'request-123',sessionId:'chat-abc',resources:{freeGB:4},payload:{model:'local',provider:'ollama',prompt:request,enrichedPrompt:request,history,system:'You are Brown.',instructions:'',pinned:[],skills:[],environment:{web:false,actions:false},images:[]}},{signal:new AbortController().signal,phase(){},token(){}});
 assert.equal(calls.length,candidates.length);assert.equal(checks.length,candidates.length,'Correction was not semantically rechecked');
 for(const [index,call] of calls.entries()){assert.equal(call.messages.at(-1).role,'user');assert.equal(call.messages.at(-1).content,request+(index?'\n\nAPPLICATION RESPONSE CORRECTION:\n\nThe previous candidate did not fulfill the latest request. Correct these fulfillment errors: Answer the latest request from Brown’s perspective; do not repeat an unrelated reply.\nRespond to the final user message using prior conversation only as context.':''));if(useContext)assert.equal(call.messages[2].role,'assistant');else assert.equal(call.messages.length,2,'Independent request inherited stale tasks');assert(call.system.includes('AVAILABLE BROWN CAPABILITIES'));assert(!call.system.includes('"id":"action"'));}
 assert(traces.some(line=>line.includes('request-123')&&line.includes('chat-abc')),'Request identity missing from trace');
 return result.text;
}
(async()=>{
 assert.equal(await scenario('hi',['BAD: Here are five things you can do for me.','Hi! How can I help?'],'greeting'),'Hi! How can I help?');
 assert.equal(await scenario('I only asked how you are doing',['BAD: I am just a computer program.','Ready to help. How is your day?']),'Ready to help. How is your day?');
 assert.equal(await scenario('List five things you can do for me',['BAD: You can volunteer, cook and learn skills.','I can help you write, explain, plan, code and create visuals.']),'I can help you write, explain, plan, code and create visuals.');
 assert.match(await scenario('An unfamiliar request',['BAD: Repeated irrelevant reply','BAD: Another irrelevant reply']),/correction limit/,'Second failed answer was accepted');
 assert.equal(await scenario('Hello',['Hello!'],'greeting',false),'Hello!');
 const payloads=[],providerRuntime={window:{localStorage:{getItem:()=>''}},fetch:async(_url,options)=>{payloads.push(JSON.parse(options.body));return new Response(JSON.stringify({choices:[{message:{content:'Hello'}}]}));}};
 vm.runInContext(fs.readFileSync(require.resolve('../src/agent/multi-provider-hub'),'utf8'),vm.createContext(providerRuntime));
 const query=providerRuntime.window.UltronMultiProviderHub.queryProvider;
 await query({provider:'openai',model:'test-model',apiKey:'test-key',prompt:'hi',messages:[{role:'user',content:'hi'},{role:'assistant',content:'Hello earlier'},{role:'user',content:'Another question'},{role:'assistant',content:'Another answer'}]});
 assert.equal(payloads[0].messages.at(-1).role,'user');assert.equal(payloads[0].messages.at(-1).content,'hi','Repeated latest prompt was omitted');
 await query({provider:'openai',model:'test-model',apiKey:'test-key',prompt:'hi',messages:[{role:'user',content:'hi'}]});assert.equal(payloads[1].messages.length,1,'Current prompt was appended twice');
 console.log('PASS: latest-turn payloads, legacy roles, greeting/correction/capability fulfillment, bounded semantic repair and request identity tracing.');
})().catch(error=>{console.error(error);process.exitCode=1;});
