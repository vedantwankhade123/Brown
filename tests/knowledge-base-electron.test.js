const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1200,height:850,webPreferences:{offscreen:true,backgroundThrottling:false}});
 try{
  win.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:details.resourceType==='script'}));
  await win.loadFile(path.resolve('src/renderer/index.html'));
  await win.webContents.executeJavaScript(fs.readFileSync('src/renderer/knowledge-base.js','utf8'));
  await win.webContents.executeJavaScript(`(async()=>{
   const assert=(value,message)=>{if(!value)throw Error(message);},wait=()=>new Promise(resolve=>setTimeout(resolve,180));
   const tab=document.getElementById('tab-knowledge');document.body.replaceChildren(tab);tab.classList.remove('hidden');
   const files=Array.from({length:26},(_,index)=>({fileName:(index<15?'Alpha-'+String(index).padStart(2,'0'):'Beta-'+String(index-15).padStart(2,'0'))+'.txt',path:'C:/knowledge/file-'+index+'.txt',size:1024,modifiedAt:'2026-10-31'}));
   await BrownKnowledgeBase.init({ragGetStats:async()=>({sources:[{name:'Knowledge',path:'C:/knowledge',isDirectory:true,fileCount:26}],totalChunks:26}),ragListFiles:async()=>({files})},{isAutoEnabled:()=>false});
   const rows=()=>document.querySelectorAll('#kb-file-rows tr');
   const next=()=>[...document.querySelectorAll('.kb-pagination button')].find(button=>button.textContent==='Next');
   assert(rows().length===10,'Initial page is not bounded');next().click();assert(rows().length===10&&document.querySelector('.kb-page-range').textContent.includes('11–20'),'Second page incorrect');next().click();assert(rows().length===6&&next().disabled,'Last page incorrect');
   const input=document.getElementById('kb-search');input.value='Beta';input.dispatchEvent(new Event('input'));await wait();
   const results=document.getElementById('kb-search-results');assert(!results.hidden&&results.querySelectorAll('button').length===11,'Search results missing');assert(rows().length===10&&document.querySelector('.kb-page-range').textContent==='1–10 of 11 files','Search did not reset pagination');
   const bounds=input.closest('.kb-search').getBoundingClientRect(),dropdown=results.getBoundingClientRect();assert(dropdown.top>=bounds.bottom&&Math.abs(dropdown.left-bounds.left)<2,'Search results are not directly below field');
   results.querySelectorAll('button')[10].click();assert(results.hidden&&rows().length===1&&rows()[0].textContent.includes('Beta-10'),'Search selection did not reveal matching page');
   input.value='No matches';input.dispatchEvent(new Event('input'));await wait();assert(results.textContent.includes('No indexed files')&&document.querySelector('.kb-pagination').hidden,'Empty search state incorrect');
   input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));assert(results.hidden,'Escape did not dismiss results');
   input.value='';input.dispatchEvent(new Event('input'));await wait();assert(rows().length===10&&!document.querySelector('.kb-pagination').hidden&&results.hidden,'Clearing search did not restore first page');
   document.getElementById('kb-type-filter').value='pdf';document.getElementById('kb-type-filter').dispatchEvent(new Event('change'));assert(rows().length===1&&rows()[0].textContent.includes('No indexed files'),'Type filter empty state incorrect');
   document.getElementById('kb-reset-filter').click();assert(rows().length===10,'Reset filters did not restore pagination');
  })()`);
  console.log('PASS: indexed-file pagination boundaries, search filtering, dropdown placement, result navigation, empty states and filter reset.');win.destroy();app.exit(0);
 }catch(error){console.error(error);win.destroy();app.exit(1);}
});
