const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:900,height:600,webPreferences:{offscreen:true,backgroundThrottling:false}});
 try{
  win.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:details.resourceType==='script'}));await win.loadFile(path.resolve('src/renderer/index.html'));
  await win.webContents.executeJavaScript(fs.readFileSync('src/renderer/visual-loading.js','utf8'));
  await win.webContents.executeJavaScript(`(async()=>{
   const assert=(v,m)=>{if(!v)throw Error(m);},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   document.body.replaceChildren();document.body.style.cssText='display:block;background:#111;padding:24px';
   const status=document.createElement('div');status.style.width='700px';status.innerHTML='<span>Generating illustration</span>';document.body.append(status);BrownVisualLoading.decorateStatus(status);window.animationStatus=status;
   const canvas=status.querySelector('.visual-preview-placeholder');assert(getComputedStyle(canvas).animationName==='visual-placeholder-enter','Opening transition missing');await wait(400);
   assert(!canvas.querySelector('canvas'),'Old ASCII renderer remains');const reference=document.createElement('div');reference.style.background='var(--brown-subitem-surface)';document.body.append(reference);assert(getComputedStyle(canvas).backgroundImage===getComputedStyle(reference).backgroundImage,'Loading surface differs from sidebar subitems');reference.remove();
   const wave=getComputedStyle(canvas,'::before');assert(wave.animationName==='visual-loading-diagonal-wave'&&wave.backgroundImage.includes('115deg'),'Diagonal wave missing');const first=wave.transform;await wait(180);assert(first!==getComputedStyle(canvas,'::before').transform,'Diagonal wave is frozen');
   window.animationCanvas=canvas;
  })()`);
  await new Promise(resolve=>setTimeout(resolve,150));fs.writeFileSync('tmp/visual-diagonal-loading.png',(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(async()=>{
   const assert=(v,m)=>{if(!v)throw Error(m);},status=window.animationStatus,canvas=window.animationCanvas,rect=canvas.getBoundingClientRect();
   BrownVisualLoading.transitionOut(status);status.replaceChildren(document.createTextNode('Completed visual'));
   assert(canvas.isConnected&&canvas.classList.contains('is-closing'),'Loader was removed without closing transition');assert(Math.abs(canvas.getBoundingClientRect().left-rect.left)<2,'Closing surface jumped horizontally');
   await new Promise(resolve=>setTimeout(resolve,300));assert(!canvas.isConnected&&status.textContent==='Completed visual','Closing loader leaked or replaced completed result');
  })()`);
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await win.webContents.executeJavaScript(`(()=>{const status=document.createElement('div');status.style.width='600px';document.body.append(status);BrownVisualLoading.decorateStatus(status);const canvas=status.querySelector('.visual-preview-placeholder');if(getComputedStyle(canvas).animationName!=='none'||getComputedStyle(canvas,'::before').animationName!=='none')throw Error('Reduced motion still animates');BrownVisualLoading.transitionOut(status);if(canvas.isConnected)throw Error('Reduced-motion close was delayed');})()`);
  console.log('PASS: sidebar-matched surface, diagonal wave motion, opening transition, nonblocking closing cleanup and reduced motion.');win.destroy();app.exit(0);
 }catch(error){console.error(error);win.destroy();app.exit(1);}
});
