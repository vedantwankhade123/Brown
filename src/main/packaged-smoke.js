// Explicit command-line smoke mode: an ephemeral profile and synthetic prompt only.
// No normal application boot, saved chats, voice downloads or account services.
exports.run=function(app){
 const fs=require('fs'),path=require('path'),os=require('os');
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'brown-packaged-smoke-'));
 app.setPath('userData',profile);
 const output=process.env.BROWN_SMOKE_REPORT||path.join(profile,'report.json');
 const model=process.env.BROWN_SMOKE_MODEL||'phi3:latest';
 app.whenReady().then(async()=>{
  const {BrowserWindow}=require('electron');
  const win=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false}});
  const report={version:app.getVersion(),packaged:app.isPackaged,profile,model,passed:false};
  try{
   win.webContents.session.webRequest.onBeforeRequest((details,done)=>done({cancel:details.resourceType==='script'}));
   await win.loadFile(path.join(__dirname,'..','renderer','index.html'));
   for(const name of ['local-inference','conversation-context','request-pipeline','visual-model-stream','chat-job-executor'])await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'..','renderer',name+'.js'),'utf8'));
   const result=await win.webContents.executeJavaScript(`(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000),phases=[],states=[];
    try{
     const execute=BrownChatJobExecutor.create({api:{},trace:line=>states.push(line)});
     const result=await execute({id:'packaged-smoke',sessionId:'synthetic-smoke',resources:{freeGB:3},payload:{model:${JSON.stringify(model)},provider:'ollama',interpreterModel:${JSON.stringify(model)},prompt:'Hello',enrichedPrompt:'Hello',history:[],system:'You are Brown. Reply briefly to the user.',instructions:'',pinned:[],skills:[],images:[],models:[],environment:{web:false,actions:false}}},{signal:controller.signal,phase:label=>phases.push(label),token(){}});
     return {text:result.text,phases,states,settingsAvailable:Boolean(document.getElementById('chat-concurrency-limit'))};
    }finally{clearTimeout(timer);}
   })()`);
   Object.assign(report,result);report.passed=Boolean(result.text?.trim())&&!/correction limit|Unverified draft/.test(result.text)&&result.settingsAvailable;
  }catch(error){report.error=String(error.stack||error);}
  finally{fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));win.destroy();app.exit(report.passed?0:1);}
 }).catch(error=>{fs.writeFileSync(output,JSON.stringify({error:String(error),passed:false}));app.exit(1);});
};
