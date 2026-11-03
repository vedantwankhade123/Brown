const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
(async()=>{
 let bodies=[],metadata=0,failMetadata=false;
 const runtime={fetch:async(url,options)=>{
  if(url.endsWith('/api/show')){metadata++;if(failMetadata)throw Error('Unavailable');return {ok:true,json:async()=>({capabilities:['completion','thinking'],thinking:{values:[true,false],default:true},model_info:{'test.context_length':2048}})};}
  bodies.push(JSON.parse(options.body));return {ok:true,json:async()=>({message:{content:'Hello'}})};
 }};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/local-inference'),'utf8'),{window:runtime,AbortController,DOMException,URL,setTimeout,clearTimeout});
 const adapter=runtime.BrownLocalInference,input={model:'local',think:false,messages:[{role:'user',content:'Hello'}],options:{num_ctx:8192}};
 await adapter.chat(input);assert.equal(bodies[0].options.num_ctx,2048);assert(!('think' in bodies[0]));assert.equal(input.options.num_ctx,8192,'Adapter mutated caller options');
 await adapter.chat(input,{purpose:'structured'});assert.equal(bodies[1].think,false);assert.equal(metadata,1);
 await assert.rejects(adapter.chat({...input,model:'remote:cloud'}),/offline model/);
 await assert.rejects(adapter.chat({...input,messages:[{role:'user',content:'Describe',images:['data']}]}),/image input/);
 const cancel=new AbortController();cancel.abort();await assert.rejects(adapter.chat(input,{signal:cancel.signal}),{name:'AbortError'});
 await assert.rejects(adapter.fetch('https://example.com/api/chat',{body:JSON.stringify(input)}),/Unsupported/);
 adapter.clear();failMetadata=true;await adapter.chat(input);assert.equal(bodies.at(-1).think,false,'Unknown models use conservative controls');
 await adapter.fetch('http://127.0.0.1:11434/api/generate',{body:JSON.stringify({model:'local',prompt:'Hi'})});assert.equal(bodies.at(-1).prompt,'Hi');
 console.log('PASS: unified local inference, capability caching, model-native thinking, context limits, immutable input, cancellation, offline boundaries and metadata fallback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
