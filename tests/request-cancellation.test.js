const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8').replace(/\r\n/g,'\n');
const guards=source.slice(source.indexOf('  const requestController = _activeAbortController;'),source.indexOf('  SmoothChatScroller.resetUserScroll();',source.indexOf('  const requestController = _activeAbortController;')));
function sandbox(){
  let paints=0,queries=0;const controller=new AbortController();
  const context=vm.createContext({requestRun:null,_activeAbortController:controller,DOMException,prompt:'mere liye hindi me ek kavita likho',routingPrompt:'mere liye hindi me ek kavita likho',response:'Hello! How can I help you today?',qualityRecoveryUsed:false,isFollowUp:false,currentImagePayloads:[],streamedTokens:false,streamPainter:null,
    aiBubble:{},_activeThinkingController:{stop(){},updateReasoningText(){}},isSimpleGreetingPrompt:()=>false,
    extractStreamingDisplayState:text=>({responseText:text,inThinking:false}),createSmoothStreamPainter:()=>({update:()=>paints++}),isTtsAutoSpeakEnabled:()=>false,
    validateResponse:async()=>[],isMultiTopicHallucination:()=>false,logTrace(){},renderMessageContent:()=>paints++,composeAgentLiveContent:text=>text,getAgentShimmerLineHtml:text=>text,
    isContentGenerationRequest:()=>true,buildContentGenerationSystemPrompt:()=> 'Write a Hindi poem in Devanagari.',buildConversationSystemPrompt:()=>'',
    queryOfflineLLM:async(...args)=>{queries++;assert.equal(args[5].skipQualityRecovery,true);return 'एक नई सुबह, एक नया आसमान।';}});
  vm.runInContext(guards+'\nthis.check=checkRequestActive;',context);
  const greetingStart=source.indexOf('function isUnrequestedGreeting(');vm.runInContext(source.slice(greetingStart,source.indexOf('\nfunction ',greetingStart+1)),context);
  const streamStart=source.indexOf('        const handleStreamTokenUpdate = (fullText) => {');
  vm.runInContext(source.slice(streamStart,source.indexOf('        // Execute via native',streamStart))+'\nthis.onToken=handleStreamTokenUpdate;',context);
  const recoveryStart=source.lastIndexOf('        checkRequestActive();',source.indexOf('        const outputIssues = await validateResponse'));
  assert(recoveryStart>=0);const recovery=source.slice(recoveryStart,source.indexOf('        // Explanation Guard:',recoveryStart));
  vm.runInContext('this.recover=async()=>{'+recovery+';return response;};',context);
  return {context,controller,paints:()=>paints,queries:()=>queries};
}
(async()=>{
  let run=sandbox();run.context.onToken('Hello!');run.context.onToken('Hello! How can I help you today?');assert.equal(run.paints(),0,'irrelevant greeting is not streamed as the answer');
  run.context.onToken('एक नई सुबह, एक नया आसमान।');assert.equal(run.paints(),1);
  run.controller.abort();run.context._activeAbortController=null;run.context.onToken('Late text');assert.equal(run.paints(),1,'late text cannot repaint a stopped response');
  await assert.rejects(run.context.recover(),error=>error.name==='AbortError');assert.equal(run.queries(),0,'Stop prevents starting a greeting recovery');
  run=sandbox();const answer=await run.context.recover();assert(answer.includes('नई सुबह'));assert.equal(run.queries(),1,'greeting recovery is bounded');
  run=sandbox();let finish,started;const ready=new Promise(resolve=>started=resolve);
  run.context.queryOfflineLLM=async()=>{started();return new Promise(resolve=>finish=resolve);};const pending=run.context.recover();await ready;
  const paints=run.paints();run.controller.abort();run.context._activeAbortController=null;finish('Hello! How can I help you today?');
  await assert.rejects(pending,error=>error.name==='AbortError');assert.equal(run.paints(),paints,'cancelled retry cannot replace the bubble with a new message');
  console.log('PASS: greeting buffering, bounded recovery, cancelled retries, late-stream suppression and immutable request cancellation.');
})().catch(error=>{console.error(error);process.exitCode=1;});
