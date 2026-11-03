(function(root){
 'use strict';
 const endpoint='http://127.0.0.1:11434',cache=new Map();
 function modelContext(data){
  const values=Object.entries(data.model_info||{}).filter(([key])=>key.endsWith('.context_length')).map(([,value])=>Number(value));
  return Math.max(0,...values.filter(Number.isFinite));
 }
 async function discover(model,{fetchImpl=root.fetch.bind(root),signal}={}){
  const cached=cache.get(model);if(cached&&cached.expires>Date.now())return cached.value;
  const controller=new AbortController(),cancel=()=>controller.abort(signal.reason);
  signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
  const timer=setTimeout(()=>controller.abort(),2500);
  try{
   const response=await fetchImpl(endpoint+'/api/show',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({model})});
   if(!response.ok)throw Error('Model metadata unavailable');
   const data=await response.json(),value={model,capabilities:Array.isArray(data.capabilities)?data.capabilities:[],thinking:data.thinking,contextLength:modelContext(data)};
   cache.set(model,{value,expires:Date.now()+60000});return value;
  }catch(error){if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');return {model,capabilities:[],contextLength:0,unverified:true};}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
 }
 async function chat(body,{fetchImpl=root.fetch.bind(root),signal,purpose='answer',onRequest,route='/api/chat'}={}){
  if(signal?.aborted)throw signal.reason||new DOMException('Cancelled','AbortError');
  if(!body.model||/(?:-cloud|:cloud)$|cloud\//i.test(body.model))throw Error('Choose an installed offline model.');
  const info=await discover(body.model,{fetchImpl,signal});
  const request={...body,options:{...body.options},messages:(body.messages||[]).map(message=>({...message}))};
  if(info.contextLength&&Number(request.options.num_ctx)>info.contextLength)request.options.num_ctx=info.contextLength;
  const values=info.thinking?.values;
  if(purpose==='answer'&&info.capabilities.includes('thinking')){
   // Use the model's supported default, rather than suppressing reasoning globally.
   delete request.think;
  }else if(values?.length&&!values.includes(false))delete request.think;
  else request.think=false;
  if(request.messages.some(message=>message.images?.length)&&!info.unverified&&!info.capabilities.includes('vision'))throw Error('The selected model does not support image input.');
  onRequest?.({model:request.model,purpose,context:request.options.num_ctx,thinking:request.think??'model-default',roles:request.messages.map(message=>message.role)});
  const started=Date.now();
  const record=event=>{try{root.ultronAPI?.recordLocalDiagnostic?.({...event,model:request.model,purpose,settings:request.options,thinking:request.think??'model-default'})?.catch?.(()=>{});}catch(_){}};
  record({status:'started'});
  let response;try{response=await fetchImpl(endpoint+route,{method:'POST',headers:{'Content-Type':'application/json'},signal,body:JSON.stringify(request)});record({status:response.ok?'connected':'failed',httpStatus:response.status,durationMs:Date.now()-started,code:response.ok?'OK':'HTTP_'+response.status});}catch(error){record({status:'failed',durationMs:Date.now()-started,code:signal?.aborted?'CANCELLED':'CONNECTION_ERROR'});throw error;}
  return response;
 }
 async function request(url,options={}) {
  const parsed=new URL(url);if(parsed.origin!==endpoint||!['/api/chat','/api/generate'].includes(parsed.pathname))throw Error('Unsupported local inference endpoint.');
  const body=JSON.parse(options.body||'{}');return chat(body,{signal:options.signal,route:parsed.pathname,purpose:body.format?'structured':'answer'});
 }
 const api={chat,discover,fetch:request,endpoint,clear:()=>cache.clear()};
 if(typeof module!=='undefined')module.exports=api;root.BrownLocalInference=api;
})(typeof window==='undefined'?globalThis:window);
