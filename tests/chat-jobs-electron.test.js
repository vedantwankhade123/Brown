const {app,BrowserWindow}=require('electron'),fs=require('fs'),path=require('path');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1100,height:800,webPreferences:{offscreen:true,backgroundThrottling:false}});
 try{
  win.webContents.session.webRequest.onBeforeRequest((d,done)=>done({cancel:d.resourceType==='script'}));await win.loadFile(path.resolve('src/renderer/index.html'));
  for(const file of ['request-pipeline.js','conversation-context.js','chat-jobs.js','chat-job-executor.js','chat-job-ui.js'])await win.webContents.executeJavaScript(fs.readFileSync('src/renderer/'+file,'utf8'));
  await win.webContents.executeJavaScript(`(async()=>{
   const assert=(value,message)=>{if(!value)throw Error(message);},tick=()=>new Promise(resolve=>setTimeout(resolve,0));
   let selected='a',free=8;const sessions={a:{messages:[{isAi:true,text:'Private context A'}]},b:{messages:[{isAi:true,text:'Private context B'}]},c:{messages:[]},d:{messages:[]}},calls=[],gates=new Map();
   const main=document.querySelector('.chat-main');main.replaceChildren();
   BrownRequestPipeline={...BrownRequestPipeline,interpret:async input=>({status:'ready',request:input.request,goal:input.request,capability:'answer',intent:'conversation',output:'text',knowledge:'none',useContext:true,deliverables:['text'],skillIds:[]}),evaluateAnswer:async()=>[]};
   BrownVisualModelStream={generate:async options=>{calls.push(options);options.onToken('Partial '+options.user);return new Promise(resolve=>gates.set(options.user,resolve));}};
   const manager=BrownChatJobUI.init({sessions:()=>sessions,current:()=>selected,ensure:()=>selected,user:prompt=>sessions[selected].messages.push({isAi:false,text:prompt}),placeholder:()=>{const el=document.createElement('div');main.append(el);return el;},painter:el=>({update:text=>{el.textContent=text;},cancel(){}}),final:(el,record)=>{el.textContent=record.text;},webResult:text=>text,save(){},rebuild(){},indicators(){},busy(){},clear(){},resources:async()=>({freeGB:free}),execution:{api:{},providerHub:{}},snapshot:input=>({model:'local',provider:'ollama',interpreterModel:'local',prompt:input.prompt,enrichedPrompt:input.prompt,system:'Rules for '+selected,instructions:'Workspace '+selected,history:JSON.parse(JSON.stringify(sessions[selected].messages.slice(0,-1))),pinned:[],images:[],models:[],skills:[],environment:{},sourcePaths:[]})});
   await manager.submit({prompt:'Question A',displayPrompt:'Question A',attachments:[],images:[]});await tick();
   selected='b';main.replaceChildren();await manager.submit({prompt:'Question B',displayPrompt:'Question B',attachments:[],images:[]});await tick();
   assert(calls.length===2,'Independent chats did not start');assert(calls[0].messages.some(m=>m.content==='Private context A')&&!JSON.stringify(calls[0].messages).includes('Private context B'),'A received B context');assert(calls[1].messages.some(m=>m.content==='Private context B')&&!JSON.stringify(calls[1].messages).includes('Private context A'),'B received A context');assert(calls[0].system.includes('Workspace a')&&calls[1].system.includes('Workspace b'),'Project instructions leaked');
   gates.get('Question A')('Answer A');await tick();await tick();assert(sessions.a.messages.at(-1).text==='Answer A','Background A answer was lost');assert(main.textContent==='Partial Question B','Background result overwrote current chat');
   selected='a';main.textContent=sessions.a.messages.at(-1).text;gates.get('Question B')('Answer B');await tick();await tick();assert(sessions.b.messages.at(-1).text==='Answer B'&&main.textContent==='Answer A','B result leaked after navigation');
   free=.2;selected='c';main.replaceChildren();await manager.submit({prompt:'Question C',displayPrompt:'Question C',attachments:[],images:[]});await tick();assert(main.textContent.includes('In queue'),'Queue status missing');assert(calls.length===2,'Low memory started another inference');
   selected='d';main.replaceChildren();await manager.submit({prompt:'Question D',displayPrompt:'Question D',attachments:[],images:[]});await tick();manager.cancel('c');assert(manager.has('d')&&!manager.has('c'),'Cancel affected the wrong queued chat');
   free=8;await manager.wake();await tick();assert(gates.has('Question D')&&!gates.has('Question C'),'Cancelled queue item ran');gates.get('Question D')('Answer D');await tick();await tick();assert(sessions.d.messages.at(-1).text==='Answer D','Queue did not resume');manager.dispose();
  })()`);
  await win.webContents.executeJavaScript(`(async()=>{
   let captured;
   BrownVisualPlanner={generate:async options=>{captured=options;return 'Rendered login mockup';}};
   BrownVisualModelStream.createGenerator=()=>async()=>'';
   const execute=BrownChatJobExecutor.create({api:{}}),controller=new AbortController();
   await execute({sessionId:'visual-followup',resources:{freeGB:3},payload:{model:'local',visualModel:'local',models:[],prompt:'Create a login form. Follow-up: render it as an illustration',enrichedPrompt:'Render it visually',history:[{isAi:false,text:'Create a login form'},{isAi:true,text:'Earlier LoginForm code with email and password fields'}],environment:{},pinned:[],skills:[],visualSelection:{family:'artifact'},system:'Rules',instructions:''}},{signal:controller.signal,phase(){},token(){}});
   if(!captured.context.includes('Earlier LoginForm code')||!captured.context.includes('email and password'))throw Error('The visual executor lost the earlier answer');
  })()`);
  await win.webContents.executeJavaScript(`(async()=>{
   let captured,requested;
   BrownVisualModelStream.generate=async options=>{captured=options;return 'Read the attached invoice.';};
   const execute=BrownChatJobExecutor.create({api:{ragReadEvidence:async(_path,options)=>{requested=options;return {success:true,kind:'image',extraction:'ocr',content:'Invoice total 560',...(options.includeImage?{image:{mimeType:'image/png',data:'bounded-preview'}}:{})};}}});
   const payload={model:'llava:latest',provider:'ollama',interpreterModel:'local',prompt:'Read this invoice',enrichedPrompt:'Read this invoice',history:[],pinned:[{path:'C:/invoice.png',name:'invoice.png'}],skills:[],images:[],models:[{name:'llava:latest',capabilities:['vision']}],environment:{},system:'Rules',instructions:''};
   await execute({id:'image',sessionId:'image-chat',resources:{freeGB:4},payload},{signal:new AbortController().signal,phase(){},token(){}});
   if(!requested.includeImage||captured.messages.at(-1).images[0]!=='bounded-preview')throw Error('Local vision model did not receive indexed image preview');
   if(!captured.system.includes('Invoice total 560'))throw Error('OCR evidence was lost');
   payload.model='text-only';await execute({id:'text',sessionId:'image-chat',resources:{freeGB:4},payload},{signal:new AbortController().signal,phase(){},token(){}});
   if(requested.includeImage||captured.messages.at(-1).images)throw Error('Text-only model received binary images');
  })()`);
  console.log('PASS: independent chat jobs, isolated background completion, queue recovery, visual revision context and local vision/OCR evidence routing.');win.destroy();app.exit(0);
 }catch(error){console.error(error);win.destroy();app.exit(1);}
});
