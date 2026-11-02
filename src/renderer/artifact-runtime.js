(function(root){
 'use strict';
 const limit=80000;
 function isRequested(request){
  const value=String(request||'').trim().replace(/^["“”]+|["“”]+$/g,'').replace(/^(?:hey|hi|hello|please)[,!\s]+/i,'');
  if(/\b(?:code only|only code|source only|do not render|don't render)\b/i.test(value))return false;
  const output=/\b(?:svg\s+(?:illustration|drawing|visual)|html\s*\/\s*css\s+(?:poster|layout|visual)|illustration|infographic|poster|(?:ui|user interface|mockup)(?:\b)|visual\s+(?:explanation|layout))\b/i.exec(value);
  if(!output||output.index>100)return false;
  const before=value.slice(0,output.index);
  if(/^(?:open|launch|install|execute|search|browse|run|export|save)\b/i.test(value)||/\b(?:what|why|define|difference)\b/i.test(before))return false;
  if(/^(?:what\b|why\b|define\b|difference\b|how\s+(?:do|does|can|to)\b|explain\s+how\b|teach\s+me\b)/i.test(value))return false;
  // Output intent is explicit even when the opening verb is unfamiliar or mistyped.
  // This resolves an output format, never authorizes network or computer actions.
  return /\b(?:a|an|the|labeled|labelled|custom|create|draw|design|generate|show|want|need|make|render|build)\b/i.test(before)||output.index===0;
 }
 function validate(spec){
  if(!spec||spec.family!=='artifact'||!['svg','html'].includes(spec.format))return ['Return an artifact with format svg or html.'];
  const errors=[];
  if(typeof spec.title!=='string'||!spec.title.trim()||spec.title.length>100)errors.push('Provide a short artifact title.');
  if(typeof spec.source!=='string'||!spec.source.trim()||spec.source.length>limit)errors.push('Provide 1–80000 characters of self-contained source.');
  else {
   if(spec.format==='svg'&&!/<svg\b[\s\S]*<\/svg>/i.test(spec.source))errors.push('Provide a complete SVG with a viewBox and closing svg tag.');
   if(/<(?:script|iframe|object|embed|form|base|link|meta)\b|\bon\w+\s*=|javascript\s*:|@import\b/i.test(spec.source))errors.push('Use static SVG or HTML/CSS only. Remove scripts, event handlers, forms, frames and external dependencies.');
   if(/(?:src|href)\s*=\s*["'](?:https?:|\/\/|file:)/i.test(spec.source)||/url\(\s*["']?(?:https?:|\/\/|file:)/i.test(spec.source))errors.push('Embed all content locally; remote resources are unavailable.');
  }
  return errors;
 }
 // Only this application-owned fitting script can run. Generated scripts remain
 // forbidden; the opaque-origin sandbox has no app, file or network permissions.
 function fitPreview(){
  const surface=document.getElementById('brown-preview-surface');let scheduled=false;
  function fit(){scheduled=false;
   surface.style.transform='none';surface.style.width='100%';surface.style.position='absolute';surface.style.left='12px';surface.style.top='12px';
   for(const svg of surface.querySelectorAll('svg')){
    try {const bounds=svg.getBBox(),box=svg.viewBox.baseVal;if(bounds.width&&bounds.height){const pad=16;const x=Math.min(box.x,bounds.x-pad),y=Math.min(box.y,bounds.y-pad),right=Math.max(box.x+box.width,bounds.x+bounds.width+pad),bottom=Math.max(box.y+box.height,bounds.y+bounds.height+pad);svg.setAttribute('viewBox',[x,y,right-x,bottom-y].join(' '));}svg.setAttribute('preserveAspectRatio','xMidYMid meet');svg.style.setProperty('width','100%','important');svg.style.setProperty('height','auto','important');svg.style.setProperty('max-width','100%','important');}catch{}
   }
   const available=document.documentElement.clientWidth-24,natural=Math.max(surface.scrollWidth,available);
   if(natural>available+1){surface.style.width=natural+'px';surface.style.transform='scale('+available/natural+')';}
   const height=surface.getBoundingClientRect().height+24;
   document.body.style.height=height+'px';
   const issues=[];
   const rgb=value=>{const parts=String(value).match(/[\d.]+/g);return parts?.length>=3?parts.map(Number):null;};
   const luminance=color=>color.slice(0,3).map(value=>{value/=255;return value<=.04045?value/12.92:((value+.055)/1.055)**2.4;}).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
   for(const label of [...surface.querySelectorAll('p,li,h1,h2,h3,h4,h5,h6,span')].filter(el=>!el.closest('svg')&&el.textContent.trim()).slice(0,60)){
    const style=getComputedStyle(label),foreground=rgb(style.color);let background=null,gradient=false;
    for(let el=label;el;el=el.parentElement){const computed=getComputedStyle(el);if(computed.backgroundImage!=='none'){gradient=true;break;}const value=rgb(computed.backgroundColor);if(value&&(value.length===3||value[3]>=.95)){background=value;break;}}
    if(!foreground||gradient)continue;const a=luminance(foreground),b=luminance(background||[255,255,255]);const ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);
    const large=parseFloat(style.fontSize)>=24||parseFloat(style.fontSize)>=18&&Number(style.fontWeight)>=700;
    if(ratio<(large?3:4.5))issues.push('Improve text contrast against its background: '+label.textContent.trim().slice(0,60));
   }
   for(const svg of surface.querySelectorAll('svg')){const labels=[...svg.querySelectorAll('text')].slice(0,80);for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i].getBoundingClientRect(),b=labels[j].getBoundingClientRect();const overlap=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));if(overlap>Math.min(a.width*a.height,b.width*b.height)*.3&&overlap>12)issues.push('Separate overlapping labels: '+labels[i].textContent.slice(0,50)+' / '+labels[j].textContent.slice(0,50));}}
   parent.postMessage({type:'brown-artifact-layout',channel:document.body.dataset.channel,height,issues:issues.slice(0,5)},'*');
  }
  const queue=()=>{if(!scheduled){scheduled=true;requestAnimationFrame(fit);}};
  window.addEventListener('resize',queue);window.addEventListener('load',queue);document.fonts?.ready.then(queue);fit();
 }
 let sourcePanel=null,restoreLeftSidebar=false;
 function closeCodePanel({immediate=false}={}){const reset=()=>{document.body.classList.remove('artifact-code-open');document.body.style.removeProperty('--artifact-panel-width');if(restoreLeftSidebar)document.getElementById('left-sidebar')?.classList.remove('collapsed');restoreLeftSidebar=false;};if(!sourcePanel){if(immediate){document.querySelectorAll('.artifact-code-panel.is-closing').forEach(panel=>panel.remove());reset();}return;}const panel=sourcePanel;sourcePanel=null;panel.cleanup?.();const finish=()=>{panel.remove();if(!sourcePanel)reset();};if(immediate||matchMedia('(prefers-reduced-motion: reduce)').matches){finish();return;}panel.classList.add('is-closing');setTimeout(finish,180);}
 function syntaxCode(source){
  const code=document.createElement('code');code.className='language-html';const pattern=/(<!--[\s\S]*?-->|<\/?[\w:-]+|\/?>|"[^"]*"|'[^']*'|\b[\w-]+(?=\s*=)|\b[a-z-]+(?=\s*:))/g;let cursor=0,match;
  while((match=pattern.exec(source))){code.append(document.createTextNode(source.slice(cursor,match.index)));const span=document.createElement('span');span.className=match[0].startsWith('<!--')?'artifact-syntax-comment':/^[<>/]/.test(match[0])?'artifact-syntax-tag':/^["']/.test(match[0])?'artifact-syntax-string':'artifact-syntax-attribute';span.textContent=match[0];code.append(span);cursor=match.index+match[0].length;}code.append(document.createTextNode(source.slice(cursor)));return code;
 }
 function openCodePanel(spec,source){
  if(document.querySelector('.chat-main.settings-open'))return;
  root.BrownMobileActivity?.close();
  closeCodePanel({immediate:true});document.querySelectorAll('.artifact-code-panel.is-closing').forEach(panel=>panel.remove());const panel=document.createElement('aside');panel.className='artifact-code-panel';panel.setAttribute('aria-label',spec.title+' source code');
  const heading=document.createElement('header'),title=document.createElement('strong');title.textContent=spec.title+' · '+spec.format.toUpperCase();
  const close=document.createElement('button');close.type='button';close.innerHTML='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';close.setAttribute('aria-label','Close source code');close.onclick=()=>closeCodePanel();
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeCodePanel();}});
  const scroll=document.createElement('div');scroll.className='artifact-code-scroll';scroll.tabIndex=0;scroll.setAttribute('aria-label','Scrollable source code');scroll.addEventListener('wheel',event=>event.stopPropagation(),{passive:true});
  const code=document.createElement('pre');code.dataset.formatted='true';code.append(syntaxCode(source));scroll.append(code);heading.append(title,close);panel.append(heading,scroll);document.body.append(panel);sourcePanel=panel;document.body.classList.add('artifact-code-open');
  const sidebar=document.getElementById('left-sidebar');restoreLeftSidebar=Boolean(sidebar&&!sidebar.classList.contains('collapsed'));sidebar?.classList.add('collapsed');
  const main=document.querySelector('.chat-main');const align=()=>{if(!main)return;let rect=main.getBoundingClientRect();if(innerWidth>850){const current=panel.getBoundingClientRect().width,delta=(rect.width-current)/2;if(Math.abs(delta)>1)document.body.style.setProperty('--artifact-panel-width',Math.max(180,current+delta)+'px');rect=main.getBoundingClientRect();}panel.style.top=Math.max(0,rect.top)+'px';panel.style.height=Math.max(0,Math.min(rect.height,innerHeight-rect.top))+'px';panel.style.bottom='auto';};
  const resize=new ResizeObserver(align);if(main)resize.observe(main);window.addEventListener('resize',align);panel.cleanup=()=>{resize.disconnect();window.removeEventListener('resize',align);};align();close.focus({preventScroll:true});
 }
 async function inspect(spec,signal){
  const result=prepare(spec);if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  return new Promise((resolve,reject)=>{
   const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.style.cssText='position:fixed;left:-10000px;top:0;width:960px;height:640px;opacity:0;pointer-events:none;border:0';
   const finish=(issues,error)=>{clearTimeout(timer);window.removeEventListener('message',receive);signal?.removeEventListener('abort',cancel);frame.remove();if(error)reject(error);else resolve(issues);};
   const receive=event=>{if(event.source===frame.contentWindow&&event.data?.channel===result.channel&&event.data?.type==='brown-artifact-layout')finish(Array.isArray(event.data.issues)?event.data.issues:[]);};
   const cancel=()=>finish([],new DOMException('Cancelled','AbortError'));const timer=setTimeout(()=>finish([]),1800);
   window.addEventListener('message',receive);signal?.addEventListener('abort',cancel,{once:true});frame.srcdoc=result.doc;document.body.append(frame);
  });
 }
 function prepare(spec){
  const errors=validate(spec);if(errors.length)throw Error(errors.join(' '));
  const parsed=new DOMParser().parseFromString(spec.source,spec.format==='svg'?'image/svg+xml':'text/html');
  if(parsed.querySelector('parsererror'))throw Error('SVG is malformed XML. Close and correctly nest every element.');
  if(parsed.querySelectorAll('*').length>1200)throw Error('Simplify this artifact to at most 1200 elements.');
  const forbidden='script,iframe,object,embed,form,input,button,textarea,select,base,link,meta,foreignObject,animate,animateTransform,set,filter';
  parsed.querySelectorAll(forbidden).forEach(el=>el.remove());
  for(const el of parsed.querySelectorAll('*'))for(const attr of [...el.attributes]){
   if(/^on/i.test(attr.name)||/^(?:srcdoc|action|formaction)$/i.test(attr.name)||(/(?:href|src)$/i.test(attr.name)&&!/^#|^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(attr.value)))el.removeAttribute(attr.name);
  }
  const symbols={rightarrow:'→',leftarrow:'←',uparrow:'↑',downarrow:'↓',leftrightarrow:'↔',times:'×',pi:'π',rho:'ρ'};
  for(const text of parsed.querySelectorAll('svg text,svg tspan')){if(text.children.length)continue;text.textContent=text.textContent.replace(/\$?\\(rightarrow|leftarrow|uparrow|downarrow|leftrightarrow|times|pi|rho)\b\$?/g,(_,name)=>symbols[name]);}
  if(spec.format==='svg'&&!parsed.documentElement.hasAttribute('viewBox'))throw Error('SVG needs a viewBox for responsive rendering.');
  const htmlSurface=parsed.createElement('div');
  if(spec.format==='html'){if(parsed.body.getAttribute('style'))htmlSurface.setAttribute('style',parsed.body.getAttribute('style'));htmlSurface.innerHTML=parsed.body.innerHTML;}
  const source=spec.format==='svg'?new XMLSerializer().serializeToString(parsed.documentElement):parsed.head.innerHTML+htmlSurface.outerHTML;
  const channel=crypto.randomUUID(),nonce=crypto.randomUUID().replace(/-/g,'');
  const policy="default-src 'none'; script-src 'nonce-"+nonce+"'; style-src 'unsafe-inline'; img-src data:; font-src 'none'; connect-src 'none'; frame-src 'none'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  const doc='<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+policy+'"></head><body data-channel="'+channel+'"><div id="brown-preview-surface">'+source+'</div><style>html{color-scheme:light;overflow-x:hidden;background:transparent}:where(body){margin:0!important;padding:12px!important;width:100%!important;min-width:0!important;box-sizing:border-box!important;background:transparent;color:#1f2937;font:15px/1.5 system-ui,sans-serif;overflow-x:hidden!important}*,*:before,*:after{box-sizing:border-box;animation:none!important;transition:none!important}#brown-preview-surface{display:flow-root;transform-origin:top left;width:100%;min-width:0}svg{display:block;width:100%!important;height:auto!important;max-width:100%!important}img{max-width:100%}pre{white-space:pre-wrap}</style><script nonce="'+nonce+'">('+fitPreview.toString()+')();</script></body></html>';
  return {source,doc,channel};
 }
 function mount(container,spec){
  const result=prepare(spec),node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;};
  container.classList.add('brown-artifact');
  container.dataset.artifactTitle=spec.title;
  const tools=node('div','brown-artifact-tools');tools.setAttribute('aria-label',spec.title+' controls');
  const beta=node('div','artifact-beta-group'),badge=node('span','artifact-beta-badge','BETA'),info=node('button','artifact-beta-info','i'),popover=node('div','artifact-beta-popover','Illustrations are experimental and still in development. They may contain mistakes. Check important details.');
  info.type='button';info.setAttribute('aria-label','About experimental illustrations');info.setAttribute('aria-expanded','false');popover.id='artifact-info-'+crypto.randomUUID();popover.setAttribute('popover','auto');popover.setAttribute('role','note');info.setAttribute('aria-controls',popover.id);beta.append(badge,info);
  let infoTimer,pinned=false;
  const hideInfo=()=>{clearTimeout(infoTimer);if(popover.matches(':popover-open'))popover.hidePopover();info.setAttribute('aria-expanded','false');pinned=false;window.removeEventListener('resize',hideInfo);window.removeEventListener('scroll',hideInfo,true);};
  const showInfo=()=>{clearTimeout(infoTimer);if(!popover.isConnected)document.body.append(popover);if(!popover.matches(':popover-open'))popover.showPopover();const rect=info.getBoundingClientRect(),bounds=popover.getBoundingClientRect();popover.style.left=Math.max(12,Math.min(rect.left,innerWidth-bounds.width-12))+'px';popover.style.top=(rect.bottom+bounds.height+8<innerHeight?rect.bottom+8:Math.max(12,rect.top-bounds.height-8))+'px';info.setAttribute('aria-expanded','true');window.addEventListener('resize',hideInfo);window.addEventListener('scroll',hideInfo,true);};
  info.onmouseenter=info.onfocus=showInfo;info.onmouseleave=()=>{if(!pinned)infoTimer=setTimeout(hideInfo,160);};info.onclick=()=>{if(pinned)hideInfo();else{showInfo();pinned=true;}};popover.onmouseenter=()=>clearTimeout(infoTimer);popover.onmouseleave=()=>{if(!pinned)infoTimer=setTimeout(hideInfo,160);};popover.addEventListener('toggle',event=>{if(event.newState==='closed')hideInfo();});
  const frame=node('iframe','brown-artifact-frame');frame.title=spec.title;frame.setAttribute('sandbox','allow-scripts');frame.setAttribute('referrerpolicy','no-referrer');frame.srcdoc=result.doc;
  const layout=event=>{if(event.source!==frame.contentWindow||event.data?.type!=='brown-artifact-layout'||event.data.channel!==result.channel)return;const height=Number(event.data.height);if(Number.isFinite(height))frame.style.height=Math.max(240,Math.min(720,height))+'px';};
  window.addEventListener('message',layout);const observer=new MutationObserver(()=>{if(!container.isConnected){window.removeEventListener('message',layout);hideInfo();popover.remove();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});
  const status=node('span','brown-artifact-status');status.setAttribute('role','status');tools.append(status);let reset;
  const add=(label,callback)=>{const b=node('button',null,label);b.type='button';b.onclick=()=>Promise.resolve().then(callback).catch(()=>{status.textContent='Could not complete this action.';});tools.append(b);return b;};
  add('Code',()=>openCodePanel(spec,result.source));
  add('Copy',async()=>{await navigator.clipboard.writeText(result.source);status.textContent='Copied';clearTimeout(reset);reset=setTimeout(()=>{status.textContent='';},1800);});
  add('Export',()=>{const url=URL.createObjectURL(new Blob([spec.format==='svg'?result.source:result.doc],{type:spec.format==='svg'?'image/svg+xml':'text/html'}));const link=node('a');link.href=url;link.download=spec.title.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,70)+'.'+(spec.format==='svg'?'svg':'html');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  add('Expand',()=>{const dialog=node('dialog','brown-artifact-expanded'),close=node('button',null,'Close'),large=frame.cloneNode();close.type='button';close.onclick=()=>dialog.close();dialog.append(close,large);dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();close.focus();});
  add('Revise',()=>root.BrownMessageActions?.revise(container,spec));
  tools.append(beta);
  container.replaceChildren(tools,frame);
  queueMicrotask(()=>{
   window.dispatchEvent(new CustomEvent('brown:visual-mounted'));
  });
 }
 const api={isRequested,validate,prepare,inspect,mount,closeCodePanel};if(typeof module!=='undefined')module.exports=api;root.BrownArtifactRuntime=api;
 if(typeof document!=='undefined')document.addEventListener('click',event=>{if(event.target.closest?.('#btn-mobile-activity,#btn-toggle-session-rail')){if(event.target.closest('#btn-toggle-session-rail')){event.brownReplacingRightPanel=Boolean(sourcePanel||root.BrownMobileActivity?.isOpen());root.BrownMobileActivity?.close();}closeCodePanel({immediate:true});}},true);
 if(typeof document!=='undefined')document.addEventListener('click',event=>{if(event.target.closest?.('#btn-toggle-left-sidebar'))restoreLeftSidebar=false;if(event.target.closest?.('#nav-projects-compact')){restoreLeftSidebar=false;document.getElementById('left-sidebar')?.classList.remove('collapsed');document.getElementById('sidebar-projects')?.scrollIntoView({block:'nearest'});}});
})(typeof window==='undefined'?globalThis:window);
