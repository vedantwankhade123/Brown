document.addEventListener('DOMContentLoaded',()=>{
 const button=document.getElementById('btn-export-local-diagnostics'),checkbox=document.getElementById('diagnostics-include-content'),status=document.getElementById('local-diagnostics-status');
 if(!button)return;
 checkbox.checked=false;
 button.addEventListener('click',async()=>{
  button.disabled=true;status.textContent='Preparing local export…';
  try{
   const includeContent=checkbox.checked===true;
   const result=await window.ultronAPI.exportLocalDiagnostics({includeContent,...(includeContent?{messages:window.BrownDiagnosticConversation?.()||[]}: {})});
   status.textContent=result.cancelled?'Export cancelled.':result.success?'Diagnostic report saved locally. Nothing was uploaded.':result.error||'Export failed.';
  }catch(_){status.textContent='Export unavailable. Restart Brown after updating.';}
  finally{checkbox.checked=false;button.disabled=false;}
 });
});
