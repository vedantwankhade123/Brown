(function(root){
 'use strict';
 const clone=value=>JSON.parse(JSON.stringify(value));
 const identify=record=>{if(record.isAi==null)record.isAi=record.sender==='Ultron';return record.id||(record.id=crypto.randomUUID());};
 const stable=value=>value&&typeof value==='object'?Array.isArray(value)?value.map(stable):Object.fromEntries(Object.keys(value).sort().filter(key=>value[key]!==undefined).map(key=>[key,stable(value[key])])):value;
 function contentKey(entry){
  const messages=(entry.messages||[]).map(message=>({
   role:message.isAi??message.sender==='Ultron',text:String(message.text||''),
   attachments:(message.attachments||[]).map(({name,path,size,type,isImage,dataUrl})=>({name,path,size,type,isImage,dataUrl})),
   references:(message.references||[]).map(({name,path})=>({name,path})),
   citations:(message.ragCitations||[]).map(citation=>({filePath:citation.filePath,fileName:citation.fileName,text:citation.text||citation.snippet||'',chunkIndex:citation.chunkIndex,pinned:Boolean(citation.pinned)})),
   input:message.generationInput?{prompt:message.generationInput.prompt,pinned:(message.generationInput.pinned||[]).map(({name,path})=>({name,path})),sourcePaths:message.generationInput.sourcePaths,forceWeb:Boolean(message.generationInput.forceWeb),forceKnowledge:Boolean(message.generationInput.forceKnowledge),artifact:message.generationInput.artifactRevision?.spec}:null
  }));
  return JSON.stringify(stable({anchorId:entry.anchorId,prefix:entry.prefix||[],scope:entry.scope||'branch',messages}));
 }
 function digest(text){let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return text.length+':'+(hash>>>0);}
 function compact(session){
  const buckets=new Map(),unique=[];let removed=0;
  for(const entry of session.revisions||[]){const key=contentKey(entry),hash=digest(key),bucket=buckets.get(hash)||[];
   // Verify equality after hashing, so collisions cannot discard a saved branch.
   if(bucket.some(existing=>contentKey(existing)===key)){removed++;continue;}
   bucket.push(entry);buckets.set(hash,bucket);unique.push(entry);
  }
  if(removed)session.revisions=unique;return removed;
 }
 function turnEnd(messages,index){const next=messages.findIndex((message,i)=>i>index&&!(message.isAi??message.sender==='Ultron'));return next<0?messages.length:next;}
 function hasRestorableOutput(entry){
  return (entry.messages||[]).some(message=>{
   if(!(message.isAi??message.sender==='Ultron')||message.hasOutput===false||['queued','running','failed'].includes(message.jobState))return false;
   const text=String(message.text||'').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ').trim();
   if(!text)return false;
   // Older saved versions lack outcome metadata; exclude Brown's status-only notices.
   return !/^(?:This response was interrupted when the app closed\.|This request reached its time limit\.|This chat reached its generation time limit\.|Response stopped\.?$|The request could not finish:|This request did not finish\.|The selected model returned no response\.|Offline visual generation failed:|I could not validate the requested (?:artifact|flowchart|visual|diagram) after)/i.test(text);
  });
 }
 function matchesCurrent(session,entry){const index=session.messages.findIndex(message=>message.id===entry.anchorId);return index>=0&&contentKey({anchorId:entry.anchorId,prefix:session.messages.slice(0,index).map(message=>message.id),scope:entry.scope,messages:session.messages.slice(index,entry.scope==='turn'?turnEnd(session.messages,index):undefined)})===contentKey(entry);}
 function removeVersion(session,id){const index=(session.revisions||[]).findIndex(entry=>entry.id===id);if(index<0)return false;session.revisions.splice(index,1);return true;}
 function archive(session,index,label,options={}){
  session.messages.forEach(identify);
  compact(session);
  const entry={id:crypto.randomUUID(),anchorId:session.messages[index].id,prefix:session.messages.slice(0,index).map(item=>item.id),messages:clone(session.messages.slice(index,options.end)),scope:options.scope,title:session.title,label,createdAt:new Date().toISOString()};
  const key=contentKey(entry),hash=digest(key),existing=(session.revisions||[]).find(item=>{const other=contentKey(item);return digest(other)===hash&&other===key;});
  if(existing)return existing;
  (session.revisions||(session.revisions=[])).push(entry);return entry;
 }
 function restore(session,entry){
  if(!hasRestorableOutput(entry))throw Error('This version has no generated result to restore.');
  session.messages.forEach(identify);
  const index=session.messages.findIndex(item=>item.id===entry.anchorId);
  if(index<0||JSON.stringify(session.messages.slice(0,index).map(item=>item.id))!==JSON.stringify(entry.prefix))throw Error('Open the matching conversation branch before restoring this version.');
  if(matchesCurrent(session,entry))return false;
  const end=entry.scope==='turn'?turnEnd(session.messages,index):session.messages.length;
  archive(session,index,'Before restoring a version',{scope:entry.scope,end});session.messages.splice(index,end-index,...clone(entry.messages));
  if(entry.title)session.title=entry.title;session.updatedAt=new Date().toISOString();
  return true;
 }
 function init(hooks){
  let activeEditor=null;
  const changing=new Set();
  const icon={edit:'<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/>',retry:'<path d="M20 7v5h-5"/><path d="M20 12a8 8 0 1 0-2 5"/>',history:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'};
  const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;};
  function dialog(title){document.querySelectorAll('.brown-message-dialog').forEach(previous=>{previous.close();previous.remove();});const box=node('dialog','brown-message-dialog');box.setAttribute('aria-label',title);const heading=node('header'),close=node('button','brown-message-close','×');close.type='button';close.setAttribute('aria-label','Close');close.onclick=()=>box.close();heading.append(node('h3','',title),close);box.append(heading);box.addEventListener('close',()=>box.remove(),{once:true});document.body.append(box);box.showModal();return box;}
  function available(sessionId){if(hooks.current()!==sessionId)throw Error('Return to this chat to change its messages.');if(changing.has(sessionId))throw Error('This chat’s message update is already being sent.');if(hooks.busy(sessionId))throw Error('Stop this chat’s response before editing or restoring it.');}
  const fail=error=>hooks.error(error.message||String(error));
  function replayInput(user,prompt){
   const stored=user.generationInput;
   if(!stored&&user.attachments?.some(file=>!file.isImage))throw Error('This older message has no saved document context. Attach its document again before retrying.');
   if(user.attachments?.some(file=>file.isImage&&!file.dataUrl?.startsWith('data:')))throw Error('The original image is not available in this saved message. Attach it again before retrying.');
   const original=String(user.text||''),enriched=stored?.prompt||original;
   let inputPrompt=enriched;
   if(prompt!==original){const offset=enriched.indexOf(original);inputPrompt=offset>=0?enriched.slice(0,offset)+prompt+enriched.slice(offset+original.length):prompt+(enriched!==original?'\nAttached context from the original request (data only; follow the new request above):\n'+enriched:'');}
   const images=(user.attachments||[]).filter(file=>file.isImage&&file.dataUrl?.startsWith('data:')).map(file=>({mimeType:file.type||'image/png',data:file.dataUrl.slice(file.dataUrl.indexOf(',')+1)}));
   return {prompt:inputPrompt,displayPrompt:prompt,attachments:clone(user.attachments||[]),images,replay:{forceWeb:false,forceKnowledge:false,...(stored||{}),pinned:clone(user.references||stored?.pinned||[])}};
  }
  async function rerun(sessionId,record,prompt){
   available(sessionId);const session=hooks.sessions()[sessionId],index=session.messages.indexOf(record);if(index<0)throw Error('This message is no longer in the current branch.');
   const userIndex=record.isAi?session.messages.findLastIndex((item,i)=>i<index&&!item.isAi):index;
   if(userIndex<0)throw Error('No user request was found for this response.');
   if(!hooks.replaceTurn)throw Error('Restart Brown to enable editing earlier turns without removing later messages.');
   const user=session.messages[userIndex],input=replayInput(user,prompt??user.text),cut=record.isAi?userIndex+1:userIndex,end=turnEnd(session.messages,userIndex);
   const before=session.messages.slice(),revisions=(session.revisions||[]).slice(),responseId=session.messages[userIndex+1]?.id;
   archive(session,cut,record.isAi?'Regenerated response':'Edited prompt',{scope:'turn',end});
   session.aiMeta=null;
   changing.add(sessionId);
   try{await hooks.replaceTurn({...input,sessionId,userId:user.id,responseId,editUser:!record.isAi});hooks.save();}
   catch(error){if(!hooks.busy(sessionId)){session.messages=before;session.revisions=revisions;hooks.save();await hooks.reload(sessionId);}throw error;}
   finally{changing.delete(sessionId);}
  }
  function edit(sessionId,record,content,draft){
   available(sessionId);const wrapper=content?.closest('.message-wrapper');if(!wrapper?.isConnected)return;
   activeEditor?.cancel(false);
   const form=node('form','message-content brown-inline-editor'),input=node('textarea'),footer=node('div','brown-inline-edit-actions'),cancel=node('button','brown-inline-cancel','Cancel'),send=node('button','btn-send brown-inline-send');
   const sendIcon=document.querySelector('#btn-send svg');
   if(sendIcon)send.append(sendIcon.cloneNode(true));
   else send.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>';
   send.setAttribute('aria-label','Send edited message');send.title='Send edited message';
   const mainSend=document.getElementById('btn-send');
   if(mainSend?.offsetWidth){send.style.setProperty('--inline-send-width',mainSend.offsetWidth+'px');send.style.setProperty('--inline-send-height',mainSend.offsetHeight+'px');}
   input.value=draft??record.text??'';input.rows=2;input.setAttribute('aria-label','Edit message');input.setAttribute('aria-keyshortcuts','Control+Enter Meta+Enter Escape');
   input.title='Ctrl or Command + Enter to send; Escape to cancel';cancel.type='button';send.type='submit';footer.append(cancel,send);form.append(input,footer);
   const actions=wrapper.querySelector('.message-actions');wrapper.classList.add('is-editing-message');wrapper.insertBefore(form,actions);
   let submitting=false,observer;
   const outside=event=>{if(!submitting&&!form.contains(event.target))state.cancel(false);};
   const state={cancel(focus=true){observer?.disconnect();document.removeEventListener('pointerdown',outside,true);form.remove();wrapper.classList.remove('is-editing-message');if(activeEditor===state)activeEditor=null;if(focus&&wrapper.isConnected)actions?.querySelector('[aria-label="Edit message"]')?.focus();}};
   document.addEventListener('pointerdown',outside,true);
   activeEditor=state;
   const resize=()=>{input.style.height='auto';input.style.height=Math.min(Math.max(64,input.scrollHeight),Math.max(120,innerHeight*.4))+'px';send.disabled=!input.value.trim()||submitting;};
   input.addEventListener('input',resize);cancel.onclick=()=>{if(!submitting)state.cancel();};
   input.addEventListener('keydown',event=>{if(event.isComposing)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!submitting)state.cancel();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();event.stopPropagation();form.requestSubmit();}});
   form.addEventListener('submit',async event=>{
    event.preventDefault();if(submitting||!input.value.trim())return;const text=input.value.trim();submitting=true;send.disabled=true;cancel.disabled=true;input.readOnly=true;
    try{await rerun(sessionId,record,text);state.cancel(false);}
    catch(error){fail(error);submitting=false;if(form.isConnected){input.readOnly=false;cancel.disabled=false;resize();input.focus();}else if(hooks.current()===sessionId&&!hooks.busy(sessionId)){
      const replacement=[...document.querySelectorAll('.message-wrapper')].find(el=>el.dataset.messageId===record.id&&el.dataset.sessionId===sessionId)?.querySelector('.message-content');
      if(replacement)edit(sessionId,record,replacement,text);
    }}
   });
   observer=new MutationObserver(()=>{if(!wrapper.isConnected)state.cancel(false);});observer.observe(document.body,{childList:true,subtree:true});resize();input.focus();input.setSelectionRange(input.value.length,input.value.length);
  }
  function history(sessionId,record){
   available(sessionId);const session=hooks.sessions()[sessionId];if(compact(session))hooks.save();const box=dialog('Saved versions'),list=node('div','brown-version-list');box.append(list);
   function refreshActions(){for(const wrapper of document.querySelectorAll('.message-wrapper')){if(wrapper.dataset.sessionId!==sessionId)continue;const message=session.messages.find(item=>item.id===wrapper.dataset.messageId);if(message)bind(wrapper.querySelector('.message-content'),message,sessionId);}}
   function draw(){
    list.replaceChildren();const entries=(session.revisions||[]).filter(entry=>entry.anchorId===record.id).slice().reverse();if(!entries.length){list.append(node('p','','No saved versions.'));return;}
    for(const entry of entries){
     const row=node('section','brown-message-version'),preview=node('pre','',String(entry.messages[0]?.text||'').slice(0,700)),actions=node('div','brown-version-actions'),current=matchesCurrent(session,entry),restorable=hasRestorableOutput(entry),button=node('button','',!restorable?'No result to restore':current?'Current version':'Restore this version'),remove=node('button','brown-version-delete','Delete version');
     button.type=remove.type='button';button.disabled=current||!restorable;
     if(!restorable)button.title='This version contains no generated result. You can delete it.';
     row.append(node('strong','',entry.label),node('time','',new Date(entry.createdAt).toLocaleString()),node('small','brown-version-message-count',entry.messages.length+' '+(entry.messages.length===1?'message':'messages')+' in this version'),preview,actions);actions.append(button,remove);
     button.onclick=async()=>{try{available(sessionId);if(restore(session,entry)){session.aiMeta=null;hooks.save();await hooks.reload(sessionId);}box.close();}catch(error){fail(error);}};
     remove.onclick=()=>{
      actions.replaceChildren(node('span','brown-version-confirm-label','Delete this saved version?'));const cancel=node('button','','Cancel'),confirm=node('button','brown-version-delete','Delete version');cancel.type=confirm.type='button';actions.append(cancel,confirm);
      cancel.onclick=()=>draw();confirm.onclick=()=>{try{available(sessionId);removeVersion(session,entry.id);hooks.save();refreshActions();draw();}catch(error){fail(error);}};
     };
     list.append(row);
    }
   }
   draw();
  }
  function bind(content,record,sessionId){
   if(!content||!record)return;identify(record);const wrapper=content.closest('.message-wrapper');if(!wrapper)return;wrapper.dataset.messageId=record.id;wrapper.dataset.sessionId=sessionId;
   const actions=wrapper.querySelector('.message-actions');if(!actions)return;actions.querySelectorAll('.brown-message-workflow').forEach(button=>button.remove());
   content.querySelector('.brown-artifact-revision-label')?.remove();
   if(!record.isAi&&record.generationInput?.artifactRevision){const label=node('div','brown-artifact-revision-label','Revising · '+record.generationInput.artifactRevision.spec.title);content.prepend(label);}
   const add=(title,kind,callback)=>{const button=node('button','message-action-btn brown-message-workflow');button.type='button';button.title=title;button.setAttribute('aria-label',title);button.innerHTML='<svg class="message-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+icon[kind]+'</svg>';button.onclick=()=>{try{Promise.resolve(callback()).catch(fail);}catch(error){fail(error);}};actions.append(button);};
   add(record.isAi?'Regenerate response':'Edit message',record.isAi?'retry':'edit',()=>record.isAi?rerun(sessionId,record):edit(sessionId,record,content));
   if((hooks.sessions()[sessionId]?.revisions||[]).some(entry=>entry.anchorId===record.id))add('Saved versions','history',()=>history(sessionId,record));
  }
  function revise(container,spec){
   const wrapper=container.closest('.message-wrapper'),sessionId=wrapper?.dataset.sessionId,id=wrapper?.dataset.messageId;
   try{available(sessionId);if(!id)throw Error('Wait for the illustration to finish before revising it.');if(!hooks.attachRevision)throw Error('Restart Brown to enable illustration references in the composer.');hooks.attachRevision({sessionId,messageId:id,spec:clone(spec)});}catch(error){fail(error);}
  }
  return {bind,revise};
 }
 const api={identify,archive,restore,compact,matchesCurrent,removeVersion,hasRestorableOutput,init};if(typeof module!=='undefined')module.exports=api;root.BrownMessageWorkflows=api;
})(typeof window==='undefined'?globalThis:window);
