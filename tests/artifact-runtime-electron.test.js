const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,frame:false,width:1100,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}});
 try{
  win.webContents.on('console-message',(_event,_level,message)=>{if(/Error|Uncaught/.test(message))console.error(message);});
  win.webContents.session.webRequest.onBeforeRequest((d,done)=>done({cancel:d.resourceType==='script'}));
  await win.loadFile(path.resolve('src/renderer/index.html'));
  await win.webContents.executeJavaScript("document.body.classList.add('platform-win32');document.querySelectorAll('#app-splash-screen,.app-skeleton-overlay').forEach(el=>el.remove());");
  for(const file of ['artifact-runtime.js','geometry-diagrams.js','visual-planner.js','visual-loading.js'])await win.webContents.executeJavaScript(fs.readFileSync('src/renderer/'+file,'utf8'));
  await win.webContents.executeJavaScript('window.ultronAPI={getMobileActivity:async()=>[]};void 0;');
  await win.webContents.executeJavaScript(fs.readFileSync('src/renderer/mobile-activity.js','utf8'));
  await win.webContents.executeJavaScript(`(async()=>{
   const assert=(value,message)=>{if(!value)throw Error(message);};
   const runtime=BrownArtifactRuntime;
   const svg={family:'artifact',format:'svg',title:'Water cycle',source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><circle cx="100" cy="100" r="40" fill="#ffd278"/><path d="M150 150L400 80" stroke="#72afff"/><text x="200" y="200" fill="white">Evaporation → condensation → precipitation</text></svg>'};
   const html={family:'artifact',format:'html',title:'Study poster',source:'<style>.cards{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.cards section{padding:24px;background:#333;border-radius:16px}</style><h1>Study plan</h1><div class="cards"><section>Understand</section><section>Practice</section></div>'};
   for(const spec of [svg,html]){
    const ready=runtime.prepare(spec);assert(ready.doc.includes("script-src 'nonce-")&&ready.doc.includes("connect-src 'none'"),'Missing preview restrictions');
    const target=document.createElement('div');target.style.width='600px';document.body.append(target);runtime.mount(target,spec);
    const frame=target.querySelector('iframe');assert(frame.getAttribute('sandbox')==='allow-scripts'&&!frame.getAttribute('sandbox').includes('allow-same-origin')&&frame.srcdoc.includes("script-src 'nonce-"),'Preview gained model script or origin privileges');
    assert(frame.getBoundingClientRect().width<=target.getBoundingClientRect().width+1,'Preview overflowed');
    assert(!target.querySelector('pre'),'Inline code generated an extra formatting bar');
    const badge=target.querySelector('.artifact-beta-badge'),info=target.querySelector('.artifact-beta-info');
    assert(badge?.textContent==='BETA'&&getComputedStyle(badge).backgroundColor==='rgb(59, 130, 246)','Illustration BETA badge missing or wrong color');
    assert(badge.getBoundingClientRect().left<target.querySelector('button').getBoundingClientRect().left,'BETA badge is not at the left of illustration controls');
    info.dispatchEvent(new MouseEvent('mouseenter'));await new Promise(r=>setTimeout(r,20));
    const help=document.getElementById(info.getAttribute('aria-controls'));assert(help.matches(':popover-open')&&help.textContent.includes('experimental'),'Hover did not show experimental illustration info');
    info.click();info.dispatchEvent(new MouseEvent('mouseleave'));await new Promise(r=>setTimeout(r,180));assert(help.matches(':popover-open'),'Clicked info did not stay open');
    info.click();assert(!help.matches(':popover-open')&&info.getAttribute('aria-expanded')==='false','Info popover did not close');
    target.querySelector('button').click();await new Promise(r=>setTimeout(r,0));const code=document.querySelector('.artifact-code-panel pre');assert(code&&code.textContent===ready.source&&!frame.hidden&&document.body.classList.contains('artifact-code-open'),'Right source panel failed');
    document.querySelector('.artifact-code-panel button').click();await new Promise(resolve=>setTimeout(resolve,220));assert(!document.body.classList.contains('artifact-code-open'),'Original rail not restored');
    target.querySelectorAll('button')[3].click();await new Promise(r=>setTimeout(r,0));const dialog=document.querySelector('.brown-artifact-expanded[open]');assert(dialog&&dialog.querySelector('iframe').getAttribute('sandbox')==='allow-scripts','Expansion lost isolation');dialog.querySelector('button').click();target.remove();
   }
   for(const source of ['<svg><script>alert(1)</script></svg>','<img src="https://example.com/a.png">','<form action="https://example.com">send</form>'])assert(runtime.validate({...html,source}).length,'Unsafe source accepted');
   let rejected=false;try{runtime.prepare({...svg,source:'<svg viewBox="0 0 20 20"><g></svg>'});}catch{rejected=true;}assert(rejected,'Malformed XML accepted');
   assert(BrownVisualPlanner.plan('Draw a labeled water cycle illustration').family==='artifact','Custom visual forced into flowchart');
   assert(BrownVisualPlanner.plan('Create a UI for a login form').family==='artifact','UI mockup was routed to a flowchart');
   const followup=BrownVisualPlanner.resolveRequest('no i want a visual illustration',[{isAi:false,text:'Create a UI for a login form'},{isAi:true,text:'Login form code'}]);
   assert(followup.includes('login form')&&BrownVisualPlanner.plan(followup).family==='artifact','Visual correction lost its referenced subject');
   const message=document.createElement('div');message.className='message-wrapper';message.innerHTML='<div class="message-content"></div><div class="message-actions"><button>Speak</button></div>';document.body.append(message);runtime.mount(message.firstElementChild,html);await Promise.resolve();
   assert(message.querySelector('.brown-artifact > .brown-artifact-tools')===message.firstElementChild.firstElementChild&&!message.querySelector('.message-actions .brown-artifact-tools')&&!message.querySelector('.brown-artifact-header'),'Illustration controls are not above the preview');message.remove();
   const contrast=await runtime.inspect({...html,source:'<div style="background:white;color:white"><p>Important supporting fact</p></div>'});assert(contrast.some(issue=>issue.includes('contrast')),'Invisible supporting text was not detected');
   const inherited=runtime.prepare({...html,source:'<body style="background:#efffe8;color:#123"><p>Readable text</p></body>'});assert(inherited.source.includes('background:')&&inherited.source.includes('color:'),'Body palette was discarded');
   let attempts=0;
   const answer=await BrownVisualPlanner.generate({request:'Draw a labeled water cycle illustration',generate:async()=>JSON.stringify(++attempts===1?{...svg,source:'<svg viewBox="0 0 20 20"><g></svg>'}:svg),verify:async answer=>runtime.prepare(JSON.parse(answer.slice(answer.indexOf('{'),answer.lastIndexOf('}')+1)))});
   assert(attempts===2&&answer.includes('artifact'),'Specific validation error did not repair artifact');
   let placeholderAttempts=0;
   await BrownVisualPlanner.generate({request:'Create a login interface illustration',generate:async()=>JSON.stringify(++placeholderAttempts===1?{...svg,title:'Visual Illustration Required',source:'<svg viewBox="0 0 600 300"><text x="20" y="40">Please specify the subject</text></svg>'}:svg)});
   assert(placeholderAttempts===2,'Placeholder acknowledgment was accepted as an illustration');
   const overlapping={...svg,source:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300"><text x="100" y="100">First stage</text><text x="100" y="100">Second stage</text></svg>'};
   assert((await runtime.inspect(overlapping)).some(issue=>issue.includes('overlapping')),'Rendered overlap was missed');
   const long=document.createElement('div');document.body.append(long);runtime.mount(long,{family:'artifact',format:'html',title:'Long source',source:('<p class="sample">A long line of safe source markup for scrolling.</p>'+String.fromCharCode(10)).repeat(250)});long.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,240));
   const panel=document.querySelector('.artifact-code-panel'),scroll=panel.querySelector('.artifact-code-scroll'),chat=document.querySelector('.chat-main').getBoundingClientRect(),bounds=panel.getBoundingClientRect();
   assert(Math.abs(bounds.top-chat.top)<2&&Math.abs(bounds.height-chat.height)<2,'Source panel does not match chat height');
   assert(Math.abs(bounds.width-chat.width)<3,'Chat and source panel are not equal width');assert(document.getElementById('left-sidebar').classList.contains('collapsed'),'Code did not collapse navigation');
   for(const id of ['nav-new-chat','nav-search-chats','nav-assets','nav-projects-compact'])assert(getComputedStyle(document.getElementById(id)).display!=='none','Collapsed navigation icon missing: '+id);
   assert(scroll.scrollHeight>scroll.clientHeight+100,'Long source has no scroll range');scroll.scrollTop=500;assert(scroll.scrollTop>0,'Code cannot scroll');assert(panel.querySelector('.artifact-syntax-tag')&&panel.querySelector('.artifact-syntax-string'),'Source syntax highlighting missing');
   panel.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,220));long.remove();
   const controls=document.createElement('div');document.body.append(controls);runtime.mount(controls,svg);const codeButton=controls.querySelector('button');
   for(const id of ['btn-mobile-activity','btn-toggle-session-rail']){codeButton.click();await new Promise(resolve=>setTimeout(resolve,0));assert(document.querySelector('.artifact-code-panel'),'Source panel did not open');document.getElementById(id).click();assert(!document.querySelector('.artifact-code-panel')&&!document.body.classList.contains('artifact-code-open'),'Companion control left source panel open: '+id);}
   document.querySelector('.chat-main').classList.add('settings-open');codeButton.click();await new Promise(resolve=>setTimeout(resolve,0));assert(!document.querySelector('.artifact-code-panel'),'Source code opened while settings active');document.querySelector('.chat-main').classList.remove('settings-open');controls.remove();
   await new Promise(resolve=>setTimeout(resolve,0));const switchTarget=document.createElement('div');document.querySelector('.chat-main').append(switchTarget);runtime.mount(switchTarget,svg);
   const deviceButton=document.getElementById('btn-mobile-activity');deviceButton.click();await new Promise(resolve=>setTimeout(resolve,50));assert(BrownMobileActivity.isOpen(),'Phone panel did not open');
   switchTarget.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,280));assert(!BrownMobileActivity.isOpen()&&!document.body.classList.contains('mobile-preview-open'),'Phone layout reservation survived Code');assert(getComputedStyle(document.getElementById('mobile-activity-panel')).display==='none','Phone panel still consumes width');
   const chatBounds=document.querySelector('.chat-main').getBoundingClientRect(),sourceBounds=document.querySelector('.artifact-code-panel').getBoundingClientRect();assert(sourceBounds.left-chatBounds.right>=-2&&sourceBounds.left-chatBounds.right<=28,'Unexpected gap between chat and code: '+(sourceBounds.left-chatBounds.right));
   deviceButton.click();assert(!document.querySelector('.artifact-code-panel')&&!document.body.classList.contains('artifact-code-open'),'Phone opening left code reservation');assert(BrownMobileActivity.isOpen(),'Phone did not reopen');BrownMobileActivity.close();switchTarget.remove();
   const status=document.createElement('div');status.innerHTML='<span class="visual-loading-text">Writing illustration</span>';document.body.append(status);BrownVisualLoading.decorateStatus(status,{startedAt:Date.now()-65000});assert(status.querySelector('.visual-elapsed').textContent==='- 1m 5s','Elapsed timer incorrect');assert(status.querySelector('.visual-preview-placeholder'),'Visual placeholder missing');await new Promise(resolve=>setTimeout(resolve,1100));assert(status.querySelector('.visual-elapsed').textContent==='- 1m 6s','Elapsed timer not advancing');BrownVisualLoading.stopStatus(status);const elapsed=status.querySelector('.visual-elapsed').textContent;await new Promise(resolve=>setTimeout(resolve,1100));assert(status.querySelector('.visual-elapsed').textContent===elapsed,'Stopped timer kept running');status.remove();
  })()`);
  await win.webContents.executeJavaScript(`(()=>{const target=document.createElement('div');target.id='fit-test';target.style.width='320px';document.body.append(target);BrownArtifactRuntime.mount(target,{family:'artifact',format:'svg',title:'Overflow test',source:'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="600" viewBox="0 0 600 300"><rect x="0" y="0" width="1000" height="500" fill="#333"/><text x="950" y="520">Outside original canvas</text></svg>'});})()`);
  await new Promise(resolve=>setTimeout(resolve,300));
  const child=win.webContents.mainFrame.frames.find(frame=>frame.url==='about:srcdoc');
  if(!child)throw Error('Preview iframe did not load');
  const fit=await child.executeJavaScript(`(()=>{const svg=document.querySelector('svg'),b=svg.getBBox(),v=svg.viewBox.baseVal;return {fits:v.x<=b.x&&v.y<=b.y&&v.x+v.width>=b.x+b.width&&v.y+v.height>=b.y+b.height,noHorizontalScroll:document.documentElement.scrollWidth<=document.documentElement.clientWidth+1};})()`);
  if(!fit.fits||!fit.noHorizontalScroll)throw Error('Narrow preview still clips drawing bounds or scrolls horizontally: '+JSON.stringify(fit));
  const position=await win.webContents.executeJavaScript(`(async()=>{const target=document.createElement('div');document.body.append(target);BrownArtifactRuntime.mount(target,{family:'artifact',format:'html',title:'Wheel scrolling',source:('<p class="sample">Source line for native wheel input</p>'+String.fromCharCode(10)).repeat(300)});target.querySelector('button').click();await new Promise(resolve=>setTimeout(resolve,250));const area=document.querySelector('.artifact-code-scroll');area.scrollTop=0;const r=area.getBoundingClientRect();if(getComputedStyle(area).webkitAppRegion!=='no-drag'||getComputedStyle(area.querySelector('code')).webkitAppRegion!=='no-drag')throw Error('Code remains in a Windows drag region');return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  win.webContents.sendInputEvent({type:'mouseMove',...position});
  win.webContents.focus();
  win.webContents.sendInputEvent({type:'mouseWheel',...position,deltaX:0,deltaY:-320,canScroll:true});
  await new Promise(resolve=>setTimeout(resolve,250));
  const scrolled=await win.webContents.executeJavaScript("document.querySelector('.artifact-code-scroll').scrollTop");if(scrolled<=0)throw Error('Native mouse wheel did not scroll Windows source pane');
  win.webContents.sendInputEvent({type:'mouseWheel',...position,deltaX:0,deltaY:160,canScroll:true});await new Promise(resolve=>setTimeout(resolve,200));
  const reversed=await win.webContents.executeJavaScript("document.querySelector('.artifact-code-scroll').scrollTop");if(reversed>=scrolled)throw Error('Source pane cannot scroll back upward');
  console.log('PASS: isolated previews, source panel controls and native mouse-wheel scrolling with Windows drag regions enabled.');win.destroy();app.exit(0);
 }catch(error){console.error(error);win.destroy();app.exit(1);}
});

