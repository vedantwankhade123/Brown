(function(root){
 'use strict';
 function locate(content,excerpt){
  const value=String(excerpt||'').trim(),text=String(content||''),start=value?text.indexOf(value):-1;
  if(start<0)return null;return {start,end:start+value.length,line:text.slice(0,start).split('\n').length,endLine:text.slice(0,start+value.length).split('\n').length};
 }
 function open(group,api){
  document.querySelector('.brown-evidence-dialog')?.close();
  const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;};
  const dialog=node('dialog','brown-evidence-dialog'),header=node('header'),close=node('button','brown-message-close','×');close.type='button';close.setAttribute('aria-label','Close source');close.onclick=()=>dialog.close();header.append(node('h3','',group.fileName||'Source evidence'),close);
  dialog.setAttribute('aria-label','Source excerpts from '+(group.fileName||'document'));
  const path=node('p','brown-evidence-path',group.filePath||''),intro=node('p','','Excerpts retrieved for this answer'),body=node('div','brown-evidence-body'),footer=node('footer');dialog.append(header,path,intro,body,footer);
  const chunks=(group.chunks||[]).filter(chunk=>String(chunk.text||chunk.snippet||'').trim()),seen=new Set();
  for(const chunk of chunks){const text=String(chunk.text||chunk.snippet).trim();if(seen.has(text))continue;seen.add(text);const section=node('section','brown-evidence-excerpt');section.append(node('strong','',Number.isInteger(chunk.chunkIndex)?'Indexed excerpt '+(chunk.chunkIndex+1):chunk.pinned?'Attached file excerpt':'Retrieved excerpt'),node('pre','',text));body.append(section);}
  if(!seen.size)body.append(node('p','','This older citation has no saved excerpt. Read the current indexed file below.'));
  const read=node('button','','Read current indexed file');read.type='button';read.disabled=!api?.ragReadEvidence;footer.append(read);
  if(api?.showItemInFolder&&/^(?:[a-z]:[\\/]|\\\\|\/)/i.test(group.filePath||'')){const reveal=node('button','','Show in folder');reveal.onclick=()=>api.showItemInFolder(group.filePath).catch(()=>{});footer.append(reveal);}
  let loaded=false;read.onclick=async()=>{
   if(loaded)return;read.disabled=true;const status=node('p','brown-evidence-status','Reading the current indexed source…');body.append(status);
   try{const result=await api.ragReadEvidence(group.filePath);if(!result?.success)throw Error(result?.error||'Source unavailable.');if(!dialog.isConnected)return;
    const content=String(result.content||''),excerpt=chunks.map(chunk=>String(chunk.text||chunk.snippet||'').trim()).find(value=>locate(content,value)),match=locate(content,excerpt);
    status.textContent=match?'Matching excerpt in current extracted text · lines '+match.line+'–'+match.endLine:seen.size?'The saved excerpt was not found verbatim in this current text preview. It may be outside the preview, the file may have changed, or extraction formatting may differ.':'Current extracted text';
    const pre=node('pre','brown-evidence-current');
    if(match){pre.append(document.createTextNode(content.slice(0,match.start)));const mark=node('mark','',content.slice(match.start,match.end));pre.append(mark,document.createTextNode(content.slice(match.end)));body.append(pre);mark.scrollIntoView({block:'center'});}
    else{pre.textContent=content;body.append(pre);}loaded=true;read.textContent='Current source loaded';
   }catch(error){status.textContent=error.message||'Could not read this source.';read.disabled=false;}
  };
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();close.focus();return dialog;
 }
 const api={open,locate};if(typeof module!=='undefined')module.exports=api;root.BrownEvidenceViewer=api;
})(typeof window==='undefined'?globalThis:window);
