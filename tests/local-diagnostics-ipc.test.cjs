const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(require.resolve('../src/main/ipc'),'utf8');
const handlers={},writes=[];let consent=0,saves=0,fail=false,cancel=false,answer=0;
const dialog={showMessageBox:async()=>{consent++;return {response:answer};},showSaveDialog:async()=>{saves++;return {canceled:cancel,filePath:'report.json'};}};
const diagnostics=require('../src/main/local-diagnostics');
const env={ipcMain:{handle:(name,fn)=>handlers[name]=fn},require:()=>({dialog}),localDiagnostics:{...diagnostics,runtimeSnapshot:async()=>({reachable:false})},diagnosticEvents:[],app:{getVersion:()=> 'test',isPackaged:true},process:{versions:{electron:'test'}},fs:{promises:{writeFile:async(_path,data)=>{if(fail)throw Error('disk full');writes.push(JSON.parse(data));}}},Date,JSON,Array};
vm.runInNewContext(source.slice(source.indexOf("  ipcMain.handle('diagnostics:export-local'"),source.indexOf("  ipcMain.handle('diagnostics:capture'")),env);
(async()=>{
 const run=handlers['diagnostics:export-local'];
 assert((await run(null,{messages:[{role:'user',content:'private'}]})).success);assert.equal(consent,0);assert(!writes[0].conversation);
 assert((await run(null,{includeContent:true})).cancelled);assert.equal(saves,1);
 answer=1;assert((await run(null,{includeContent:true,messages:[{role:'user',content:'chosen'}]})).success);assert.equal(writes[1].conversation[0].content,'chosen');
 cancel=true;assert((await run(null,{})).cancelled);assert.equal(writes.length,2);
 cancel=false;fail=true;assert.equal((await run(null,{})).success,false);
 console.log('PASS: diagnostic IPC requires explicit consent for conversation, handles save cancellation and disk failure, and exports metadata by default.');
})().catch(error=>{console.error(error);process.exitCode=1;});
