(function(root){
 'use strict';
 function createQueueClock(){
  const icon=document.createElement('span');icon.className='chat-queue-clock';icon.setAttribute('aria-hidden','true');
  icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  return icon;
 }
 function init(hooks){
  const views=new Map(),records=new Map(),signatures=new Map();let queue;
  const running=job=>['queued','running'].includes(job.state);
  function paint(job){
   const entry=views.get(job.id);if(!entry||!entry.element?.isConnected||hooks.current()!==job.sessionId)return;
   const element=entry.element;
   element.closest('.message-wrapper')?.querySelector('.message-actions')?.style.setProperty('display','none');
   if(job.partial&&!job.visual){
    if(!entry.painter){root.BrownVisualLoading?.transitionOut?.(element);element.replaceChildren();element.dataset.visualStartedAt=String(job.startedAt||job.createdAt);entry.painter=hooks.painter(element);}
    entry.painter.update(job.partial);return;
   }
   const visual=Boolean(job.visual&&job.state!=='queued'),mode=job.state==='queued'?'queue':visual?'visual':'text';
   if(entry.mode!==mode||!entry.status?.isConnected){
    entry.painter?.cancel();entry.painter=null;root.BrownVisualLoading?.transitionOut?.(element);element.replaceChildren();
    const status=document.createElement('div');status.className=visual?'visual-loading-state':'thinking-container';status.setAttribute('role','status');
    if(mode==='queue'){status.classList.add('chat-queue-status');status.append(createQueueClock());}
    if(visual){const spinner=document.createElement('span');spinner.className='visual-loading-spinner';spinner.setAttribute('aria-hidden','true');status.append(spinner);}
    const label=document.createElement('span');label.className='visual-loading-text text-shimmer';status.append(label);element.append(status);entry.status=status;entry.label=label;entry.mode=mode;
    root.BrownVisualLoading?.decorateStatus(status,{startedAt:job.startedAt||job.createdAt,preview:visual});
   }
   const jobs=queue.list(),waiting=jobs.filter(item=>item.state==='queued'),count=jobs.filter(item=>item.state==='running').length;
   entry.label.textContent=job.state==='queued'?'In queue · '+(waiting.findIndex(item=>item.id===job.id)+1)+' of '+waiting.length+' · '+count+' running · '+(job.reason||'Waiting for a generation slot'):job.phase;
  }
  function refresh(){hooks.busy(queue.has(hooks.current()));hooks.indicators();for(const job of queue.list())paint(job);}
  function changed(job){
   if(!running(job))return;
   const record=records.get(job.id);if(record){record.jobState=job.state;record.jobPhase=job.phase;record.jobReason=job.reason;if(job.partial)record.text=job.partial;}
   const signature=[job.state,job.phase,job.reason].join('|');
   if(signatures.get(job.id)!==signature){signatures.set(job.id,signature);hooks.rebuild();refresh();hooks.save();}
   paint(job);
  }
  function completed(job){
   const record=records.get(job.id),session=hooks.sessions()[job.sessionId];
   if(record&&session?.messages.includes(record)){
    let result=job.result||{text:'This request did not finish.'};
    record.text=result.web?hooks.webResult(result.text,result.web):result.text||'The selected model returned no response.';record.jobState=job.state;record.ragCitations=result.citations||[];session.updatedAt=new Date().toISOString();
    const view=views.get(job.id);view?.painter?.cancel();
    if(view?.element?.isConnected&&hooks.current()===job.sessionId){root.BrownVisualLoading?.transitionOut?.(view.element);hooks.final(view.element,record);}
    hooks.save();
   }
   views.delete(job.id);records.delete(job.id);signatures.delete(job.id);hooks.rebuild();refresh();hooks.done?.(job.sessionId,job);
  }
  queue=root.BrownChatJobScheduler.create({resources:hooks.resources,execute:root.BrownChatJobExecutor.create(hooks.execution),changed,completed});
  const manager={
   ...queue,refresh,
   async replaceTurn(input){
    const sessionId=hooks.current(),session=hooks.sessions()[sessionId];
    if(sessionId!==input.sessionId||!session)throw Error('Open the original chat before changing this turn.');
    if(queue.has(sessionId))throw Error('Stop this chat’s current response first.');
    if(queue.list().length>=20)throw Error('The chat queue is full. Wait for a response or stop a queued request.');
    const index=session.messages.findIndex(message=>message.id===input.userId&&!message.isAi);if(index<0)throw Error('The original request is no longer in this chat.');
    let end=session.messages.findIndex((message,i)=>i>index&&!message.isAi);if(end<0)end=session.messages.length;
    const original=session.messages.slice(),user=input.editUser?{...session.messages[index],text:input.displayPrompt}:session.messages[index];
    const payload=hooks.snapshot({...input,contextMessages:session.messages.slice(0,index)},sessionId),id=crypto.randomUUID(),record={id:input.responseId||crypto.randomUUID(),sender:'Ultron',isAi:true,text:'',createdAt:new Date().toISOString(),jobId:id,jobState:'queued'};
    user.references=payload.pinned||[];user.generationInput={prompt:input.prompt,pinned:payload.pinned,sourcePaths:payload.sourcePaths,forceWeb:payload.forceWeb,forceKnowledge:payload.environment?.forceKnowledge};const revision=payload.artifactRevision||input.replay?.artifactRevision;if(revision)user.generationInput.artifactRevision=revision;
    session.messages.splice(index,end-index,user,record);records.set(id,record);
    try{queue.submit({id,sessionId,payload});}catch(error){session.messages=original;records.delete(id);throw error;}
    hooks.save();refresh();await hooks.reloadTurn?.(sessionId,record.id);return record;
   },
   bind(id,element){const job=queue.get(id);if(!job||!running(job))return;views.get(id)?.painter?.cancel();views.set(id,{element});paint(job);},
   async submit(input){
    const current=hooks.current();if(current&&queue.has(current))throw Error('This chat already has a queued or running response.');if(queue.list().length>=20)throw Error('The chat queue is full. Wait for a response or stop a queued request.');
    const sessionId=hooks.ensure(input.displayPrompt||'File analysis');
    if(!input.reuseUser)hooks.user(input.displayPrompt,input.attachments);
    const userRecord=hooks.sessions()[sessionId].messages.at(-1);
    if(input.messageId&&userRecord&&!userRecord.isAi)userRecord.id=input.messageId;
    const payload=hooks.snapshot(input,sessionId),id=crypto.randomUUID(),record={sender:'Ultron',isAi:true,text:'',createdAt:new Date().toISOString(),jobId:id,jobState:'queued'};
    if(input.responseId)record.id=input.responseId;
    if(userRecord&&!userRecord.isAi){userRecord.references=payload.pinned||[];userRecord.generationInput={prompt:input.prompt,pinned:payload.pinned,sourcePaths:payload.sourcePaths,forceWeb:payload.forceWeb,forceKnowledge:payload.environment?.forceKnowledge};const revision=payload.artifactRevision||input.artifactRevision||input.replay?.artifactRevision;if(revision)userRecord.generationInput.artifactRevision=revision;}
    hooks.bindUser?.(userRecord,sessionId);
    hooks.sessions()[sessionId].messages.push(record);records.set(id,record);const element=hooks.placeholder();views.set(id,{element});
    hooks.bindRecord?.(element,record,sessionId);
    try{queue.submit({id,sessionId,payload});}catch(error){record.text=error.message;record.jobState='failed';hooks.final(element,record);records.delete(id);views.delete(id);throw error;}
    hooks.clear();hooks.save();refresh();
   }
  };
  window.addEventListener('beforeunload',()=>queue.dispose(),{once:true});return manager;
 }
 root.BrownChatJobUI={init,createQueueClock};
})(typeof window==='undefined'?globalThis:window);
