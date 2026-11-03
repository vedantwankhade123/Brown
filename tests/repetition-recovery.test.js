const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const stream=require('../src/renderer/visual-model-stream'),context=require('../src/renderer/conversation-context'),pipeline=require('../src/renderer/request-pipeline');
const loop='माझी '.repeat(40),answer='टोमॅटो लाल का झाला? कारण त्याने सॅलडला ड्रेसिंग करताना पाहिले!';
(async()=>{
 assert(stream.hasRepetition(loop));assert(stream.hasRepetition('hello world '.repeat(20)));assert(stream.hasRepetition('माझी'.repeat(40)));
 assert(!stream.hasRepetition('ha ha ha!'));assert(!stream.hasRepetition('-'.repeat(120)));assert(!stream.hasRepetition('```js\n'+loop+'\n```'));
 assert(stream.intentionalRepetition('Repeat hello 40 times'));assert(!stream.intentionalRepetition('in marathi'));
 assert(!stream.hasRepetition(Array.from({length:40},(_,i)=>'row '+i).join(' ')));
 assert(context.isLanguageFollowUp('in marathi'));assert(context.isLanguageFollowUp('Translate it into French.'));assert(!context.isLanguageFollowUp('What is Marathi?'));
 let cancelled=false,painted='';
 await assert.rejects(stream.generate({model:'local',system:'',user:'in marathi',detectRepetition:true,onToken:text=>painted=text,fetchImpl:async()=>new Response(new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({message:{content:loop}})+'\n'));},cancel(){cancelled=true;}}))}),{code:'REPETITIVE_OUTPUT'});
 assert(cancelled);assert.equal(painted,'','The degenerate chunk must not be painted');
 assert(pipeline.validateAnswer(loop,pipeline.fallback('in marathi')).some(issue=>issue.includes('repetitive')));
 const history=[{sender:'User',text:'Tell me a joke'},{sender:'Ultron',text:'Why did the tomato turn red? Because it saw the salad dressing!'}];
 async function scenario(fails){
  const calls=[];const runtime={BrownConversationContext:context,BrownRequestPipeline:{...pipeline,interpret:async()=>({...pipeline.fallback('in marathi'),useContext:false}),evaluateAnswer:async()=>[]},BrownVisualModelStream:{...stream,generate:async options=>{calls.push(options);if(calls.length<=fails)throw Object.assign(Error('loop'),{code:'REPETITIVE_OUTPUT'});return answer;}}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/chat-job-executor'),'utf8'),{window:runtime,AbortController,DOMException,setTimeout,clearTimeout});
  const result=runtime.BrownChatJobExecutor.create({api:{}})({id:'marathi',sessionId:'joke',resources:{freeGB:8},payload:{model:'llava:latest',provider:'ollama',prompt:'in marathi',enrichedPrompt:'in marathi',history,system:'You are Brown.',instructions:'',pinned:[],skills:[],environment:{},images:[]}},{signal:new AbortController().signal,phase(){},token(){}});
  if(fails===2)await assert.rejects(result,/stronger support/);else assert.equal((await result).text,answer);
  assert.equal(calls.length,2);assert(calls[0].messages.some(m=>m.role==='assistant'&&m.content.includes('salad dressing')));assert(calls[1].repeatPenalty>calls[0].repeatPenalty);assert(calls[1].maxTokens<=1024);assert(calls.every(c=>c.model==='llava:latest'));
 }
 await scenario(1);await scenario(2);
 console.log('PASS: multilingual stream loop detection, reader cleanup, normal repetition, explicit repeats, language-follow-up history and one same-model recovery.');
})().catch(error=>{console.error(error);process.exitCode=1;});
