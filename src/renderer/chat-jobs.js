(function(root){
 'use strict';
 const active=job=>['queued','running'].includes(job.state);
 function create({resources,execute,changed=()=>{},completed=()=>{},pollMs=3000,timeoutMs=360000}){
  const jobs=new Map();let pumping=false,timer,disposed=false,submissions=0;
  const emit=job=>changed(job);
  function capacity(candidate,running,res){
   const free=Number(res?.freeGB),known=Number.isFinite(free),size=Number(candidate.payload.modelSize||0)/1024**3;
   if(candidate.memoryRetry&&known&&free<(candidate.retryFreeGB||2)&&Date.now()<(candidate.retryAfter||0))return 'Waiting for memory to recover';
   if(known&&free<.8)return 'Waiting for available memory';
   if(!running.length)return '';
   if(running.length>=2)return 'Other chats are running';
   if(Number(res?.cpu)>90)return 'Waiting for available compute';
   if(!known||free<3)return 'Waiting for memory capacity';
   const same=running.every(job=>job.payload.model===candidate.payload.model);
   if(!same&&free<Math.max(4,size*1.3+2))return 'Another model is using memory';
   if(candidate.payload.exclusive||running.some(job=>job.payload.exclusive))return 'Waiting for the current task';
   return '';
  }
  const schedule=()=>{clearTimeout(timer);if(!disposed&&[...jobs.values()].some(job=>job.state==='queued')){timer=setTimeout(pump,pollMs);timer.unref?.();}};
  function finish(job,state,result){
   if(!active(job))return;job.state=state;job.result=result;job.endedAt=Date.now();clearTimeout(job.deadline);if(!disposed){emit(job);completed(job);}while(jobs.size>80){const old=[...jobs.values()].find(item=>!active(item));if(!old)break;jobs.delete(old.id);}schedule();queueMicrotask(pump);
  }
  async function start(job,res){
   job.state='running';job.startedAt=Date.now();job.phase='Understanding your request';emit(job);
   job.resources=res;
   job.deadline=setTimeout(()=>job.controller.abort(new DOMException('This chat reached its generation time limit.','TimeoutError')),timeoutMs);
   job.deadline.unref?.();
   try{
    const output=await execute(job,{signal:job.controller.signal,phase:(label,visual)=>{if(!active(job)||job.controller.signal.aborted)return;job.phase=label;job.visual=Boolean(visual);emit(job);},token:text=>{if(!active(job)||job.controller.signal.aborted)return;job.partial=String(text);emit(job);}});
    if(job.controller.signal.aborted)throw job.controller.signal.reason;
    finish(job,'complete',output);
   }catch(error){
    if(!active(job))return;
    if(!job.controller.signal.aborted&&!job.memoryRetry&&/out.of.memory|not enough.*memory|requires more.*memory|memory.*allocat|cudaMalloc/i.test(error?.message||'')){
     clearTimeout(job.deadline);job.memoryRetry=true;job.payload.exclusive=true;job.retryAfter=Date.now()+3000;job.retryFreeGB=Math.max(2,Number(res?.freeGB||0)+1);job.state='queued';job.reason='Waiting for memory to recover';job.partial='';emit(job);schedule();return;
    }
    finish(job,job.controller.signal.aborted?'cancelled':'failed',{text:job.controller.signal.reason?.name==='TimeoutError'?'This request reached its time limit. Try a smaller request or another installed model.':job.controller.signal.aborted?(job.partial||'Response stopped.'):'The request could not finish: '+String(error?.message||error)});
   }
  }
  async function pump(){
   if(pumping||disposed)return;pumping=true;const version=submissions;
   try{
    const queued=[...jobs.values()].filter(job=>job.state==='queued');if(!queued.length)return;
    let res,timeout;try{res=await Promise.race([resources(),new Promise(resolve=>{timeout=setTimeout(()=>resolve({}),2500);timeout.unref?.();})]);}catch{res={};}finally{clearTimeout(timeout);}
    for(const job of queued){if(disposed||job.state!=='queued')continue;const reason=capacity(job,[...jobs.values()].filter(item=>item.state==='running'),res);
     if(reason){if(job.reason!==reason){job.reason=reason;emit(job);}continue;}
     job.reason='';void start(job,res);
    }
   }finally{pumping=false;schedule();if(version!==submissions)queueMicrotask(pump);}
  }
  const api={
   submit({id,sessionId,payload}){if([...jobs.values()].some(job=>active(job)&&job.sessionId===sessionId))throw Error('This chat already has a queued or running response.');if([...jobs.values()].filter(active).length>=20)throw Error('The chat queue is full. Wait for a response or stop a queued task.');const job={id,sessionId,payload,state:'queued',reason:'Waiting for a generation slot',phase:'In queue',partial:'',createdAt:Date.now(),controller:new AbortController()};job.controller.signal.addEventListener('abort',()=>finish(job,'cancelled',{text:job.controller.signal.reason?.name==='TimeoutError'?'This request reached its time limit.':job.partial||'Response stopped.'}),{once:true});jobs.set(id,job);submissions++;emit(job);void pump();return job;},
   cancel(sessionId){for(const job of jobs.values())if(job.sessionId===sessionId&&active(job)){job.controller.abort(new DOMException('Cancelled','AbortError'));finish(job,'cancelled',{text:job.partial||'Response stopped.'});}},
   has:sessionId=>[...jobs.values()].some(job=>job.sessionId===sessionId&&active(job)),
   get:id=>jobs.get(id),list:()=>[...jobs.values()].filter(active),wake:pump,
   dispose(){disposed=true;clearTimeout(timer);for(const job of jobs.values())if(active(job)){job.controller.abort();clearTimeout(job.deadline);}jobs.clear();}
  };return api;
 }
 const api={create};if(typeof module!=='undefined')module.exports=api;root.BrownChatJobScheduler=api;
})(typeof window==='undefined'?globalThis:window);

