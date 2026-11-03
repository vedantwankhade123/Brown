(function(root){
 'use strict';
 const active=job=>['queued','running'].includes(job.state);
 function concurrency(res={}){
  const total=Number(res.totalGB),free=Number(res.freeGB),cores=Number(res.cpuCores),vram=Number(res.gpuVramGB);
  let limit=Number.isFinite(total)&&total>0?(total>=64&&vram>=16?5:total>=32&&vram>=8?4:total>=32?3:total>=16?2:1):(free>=6?2:1);
  if(cores>0&&cores<4)limit=1;
  if(res.cpuOnly)limit=Math.min(limit,3);
  const selected=Number(res.maxConcurrent);
  if(Number.isInteger(selected)&&selected>=1&&selected<=5)limit=Math.min(limit,selected);
  return limit;
 }
 const local=job=>!job.payload.provider||job.payload.provider==='ollama'&&!/(?:-cloud|:cloud)$|cloud\//i.test(job.payload.model||'');
 function create({resources,execute,changed=()=>{},completed=()=>{},pollMs=3000,timeoutMs=360000,queueTimeoutMs=600000,runtimeBackoffMs=3000}){
  const jobs=new Map();let pumping=false,timer,disposed=false,submissions=0,cooldownUntil=0,recoveryLimit=5;
  const emit=job=>{try{changed(job);}catch(error){console.error('Chat status update failed',error);}};
  function capacity(candidate,running,res){
   if(res?.foregroundBusy)return 'Waiting for the current foreground task';
   const selected=Number(res?.maxConcurrent),cap=Number.isInteger(selected)&&selected>=1&&selected<=5?selected:5;
   if(running.length>=cap)return 'All '+cap+' chat slots are busy';
   if(candidate.retryAfter>Date.now()&&(!Number.isFinite(Number(res?.freeGB))||Number(res.freeGB)<candidate.retryFreeGB))return candidate.retryReason||'Waiting for memory to recover';
   if(!local(candidate))return running.filter(job=>!local(job)).length>=2?'Waiting for a cloud request slot':'';
   const locals=running.filter(local),limit=Math.min(concurrency(res),Date.now()<cooldownUntil?recoveryLimit:5);
   if(locals.length>=limit)return 'Waiting for a local chat slot ('+limit+' allowed)';
   if(!locals.length)return '';
   if(candidate.payload.exclusive||locals.some(job=>job.payload.exclusive))return 'Waiting for the current task';
   if(Number(res?.cpu)>90)return 'Waiting for available compute';
   const free=Number(res?.freeGB);
   if(!Number.isFinite(free))return 'Waiting for memory information';
   // Keep headroom for every active request; live telemetry may lag model allocations.
   const reserved=running.filter(local).reduce((sum,job)=>sum+job.memoryReservation,0);
   const same=locals.some(job=>job.payload.model===candidate.payload.model);
   const size=Number(candidate.payload.modelSize)/1024**3;
   const needed=same?1:Math.max(2,Number.isFinite(size)&&size>0?size*1.3:4);
   if(free-reserved<needed+1)return same?'Waiting for memory capacity':'Waiting for memory to load another model';
   return '';
  }
  const schedule=()=>{clearTimeout(timer);if(!disposed&&[...jobs.values()].some(job=>job.state==='queued')){timer=setTimeout(pump,pollMs);timer.unref?.();}};
  function finish(job,state,result){
   if(!active(job))return;job.state=state;job.result=result;job.endedAt=Date.now();clearTimeout(job.deadline);clearTimeout(job.queueDeadline);if(!disposed){emit(job);try{completed(job);}catch(error){console.error('Chat completion update failed',error);}}while(jobs.size>80){const old=[...jobs.values()].find(item=>!active(item));if(!old)break;jobs.delete(old.id);}schedule();queueMicrotask(pump);
  }
  async function start(job,res){
   clearTimeout(job.queueDeadline);job.memoryReservation=local(job)?Math.max(1,Number.isFinite(Number(job.payload.modelSize))?Number(job.payload.modelSize)/1024**3*1.3:4):0;
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
    if(!job.controller.signal.aborted&&!job.runtimeRetry&&/\b429\b|\b503\b|too many requests|server.*busy|queue.*full/i.test(error?.message||'')){
     clearTimeout(job.deadline);job.runtimeRetry=true;job.retryAfter=Date.now()+runtimeBackoffMs;job.retryFreeGB=Infinity;job.retryReason='Waiting for the model service to become available';job.state='queued';job.reason=job.retryReason;job.partial='';armQueueDeadline(job);emit(job);schedule();return;
    }
    if(!job.controller.signal.aborted&&!job.memoryRetry&&/out.of.memory|not enough.*memory|requires more.*memory|memory.*allocat|cudaMalloc/i.test(error?.message||'')){
     cooldownUntil=Date.now()+30000;recoveryLimit=Math.max(1,[...jobs.values()].filter(item=>item.state==='running'&&local(item)).length-1);
     clearTimeout(job.deadline);job.memoryRetry=true;job.payload.exclusive=true;job.retryAfter=Date.now()+3000;job.retryFreeGB=Math.max(2,Number(res?.freeGB||0)+1);job.state='queued';job.reason='Waiting for memory to recover';job.partial='';armQueueDeadline(job);emit(job);schedule();return;
    }
    finish(job,job.controller.signal.aborted?'cancelled':'failed',{text:job.controller.signal.reason?.name==='TimeoutError'?'This request reached its time limit. Try a smaller request or another installed model.':job.controller.signal.aborted?(job.partial||'Response stopped.'):'The request could not finish: '+String(error?.message||error)});
   }
  }
  function armQueueDeadline(job){clearTimeout(job.queueDeadline);job.queueDeadline=setTimeout(()=>{if(job.state==='queued')finish(job,'failed',{text:'This request waited too long for capacity. Try again, choose a smaller model, or reduce simultaneous chats.'});},queueTimeoutMs);job.queueDeadline.unref?.();}
  async function pump(){
   if(pumping||disposed)return;pumping=true;const version=submissions;
   try{
    const queued=[...jobs.values()].filter(job=>job.state==='queued');if(!queued.length)return;
    let res,timeout;try{res=await Promise.race([resources(),new Promise(resolve=>{timeout=setTimeout(()=>resolve({}),2500);timeout.unref?.();})]);}catch{res={};}finally{clearTimeout(timeout);}
    let localBlocked=false;
    res=res&&typeof res==='object'?res:{};
    for(const job of queued){if(disposed||job.state!=='queued'||localBlocked&&local(job))continue;const reason=capacity(job,[...jobs.values()].filter(item=>item.state==='running'),res);
     if(reason){if(job.reason!==reason){job.reason=reason;emit(job);}if(local(job))localBlocked=true;continue;}
     job.reason='';void start(job,res);
    }
   }finally{pumping=false;schedule();if(version!==submissions)queueMicrotask(pump);}
  }
  const api={
   submit({id,sessionId,payload}){if(disposed)throw Error('The chat scheduler is closed.');if(jobs.has(id))throw Error('Duplicate chat job ID.');if([...jobs.values()].some(job=>active(job)&&job.sessionId===sessionId))throw Error('This chat already has a queued or running response.');if([...jobs.values()].filter(active).length>=20)throw Error('The chat queue is full. Wait for a response or stop a queued task.');const job={id,sessionId,payload,state:'queued',reason:'Waiting for a generation slot',phase:'In queue',partial:'',createdAt:Date.now(),controller:new AbortController()};job.controller.signal.addEventListener('abort',()=>finish(job,'cancelled',{text:job.controller.signal.reason?.name==='TimeoutError'?'This request reached its time limit.':job.partial||'Response stopped.'}),{once:true});jobs.set(id,job);armQueueDeadline(job);submissions++;emit(job);void pump();return job;},
   cancel(sessionId){for(const job of jobs.values())if(job.sessionId===sessionId&&active(job)){job.controller.abort(new DOMException('Cancelled','AbortError'));finish(job,'cancelled',{text:job.partial||'Response stopped.'});}},
   has:sessionId=>[...jobs.values()].some(job=>job.sessionId===sessionId&&active(job)),
   get:id=>jobs.get(id),list:()=>[...jobs.values()].filter(active),wake:pump,
   dispose(){disposed=true;clearTimeout(timer);for(const job of jobs.values())if(active(job)){job.controller.abort();clearTimeout(job.deadline);clearTimeout(job.queueDeadline);}jobs.clear();}
  };return api;
 }
 const api={create,concurrency};if(typeof module!=='undefined')module.exports=api;root.BrownChatJobScheduler=api;
})(typeof window==='undefined'?globalThis:window);

