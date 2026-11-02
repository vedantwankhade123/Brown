(function(root){
 'use strict';
 function init({host,input,current,onChange=()=>{}}){
  const references=new Map(),placeholder=input.getAttribute('placeholder')||'Ask Brown anything...';
  function render(){
   const reference=references.get(current());host.replaceChildren();host.hidden=!reference;
   input.placeholder=reference?'Describe changes to '+reference.spec.title+'…':placeholder;
   if(reference){
    const chip=document.createElement('div');chip.className='artifact-revision-chip';chip.setAttribute('role','group');chip.setAttribute('aria-label','Illustration selected for revision');
    const icon=document.createElement('span');icon.className='artifact-revision-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="m5 17 5-5 4 4 3-3 3 4"/><circle cx="15" cy="8" r="2"/></svg>';
    const text=document.createElement('span');text.className='artifact-revision-name';text.textContent=reference.spec.title;text.title=reference.spec.title;
    const badge=document.createElement('small');badge.textContent='Revise';const remove=document.createElement('button');remove.type='button';remove.className='artifact-revision-remove';remove.textContent='×';remove.setAttribute('aria-label','Remove illustration reference');remove.onclick=()=>{clear();input.focus();};
    chip.append(icon,text,badge,remove);host.append(chip);
   }
   onChange();
  }
  function clear(sessionId=current()){references.delete(sessionId);render();}
  function attach(reference){if(!reference.sessionId||reference.sessionId!==current())throw Error('Open the illustration’s chat before revising it.');references.set(reference.sessionId,{sessionId:reference.sessionId,messageId:reference.messageId,spec:JSON.parse(JSON.stringify(reference.spec))});render();input.focus();}
  render();return {attach,render,peek:(sessionId=current())=>references.get(sessionId)||null,clear};
 }
 const api={init};if(typeof module!=='undefined')module.exports=api;root.BrownArtifactReference=api;
})(typeof window==='undefined'?globalThis:window);
