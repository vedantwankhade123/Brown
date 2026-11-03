const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const {buildReport,cleanEvent,runtimeSnapshot}=require('../src/main/local-diagnostics');
(async()=>{
 const secret='private prompt contents',input={version:'test',runtime:{reachable:false},events:[{model:'local',purpose:'answer',status:'failed',code:'OUTPUT_LIMIT',timestamp:'2026-11-02T12:00:00.000Z',prompt:secret,response:secret,apiKey:'secret',settings:{num_ctx:2048,apiKey:'secret'}}],messages:[{role:'user',content:secret}]};
 const report=buildReport(input),json=JSON.stringify(report);assert(!json.includes(secret));assert(!json.includes('apiKey'));assert.equal(report.events[0].timestamp,input.events[0].timestamp);assert.equal(report.events[0].settings.num_ctx,2048);assert(!('conversation' in report));
 const included=buildReport({...input,includeContent:true,messages:[{role:'user',content:'password=abc Bearer abc123 sk-123456789012345'}]});assert(!JSON.stringify(included).includes('abc123'));assert(included.conversation[0].content.includes('[REDACTED]'));
 assert(!('message' in cleanEvent({message:secret,code:'Contains private text'})));
 const offline=await runtimeSnapshot(async()=>{throw Error('offline');});assert.equal(offline.reachable,false);
 const malformed=await runtimeSnapshot(async()=>({ok:true,json:async()=>({models:{bad:true}})}));assert.deepEqual(malformed.loadedModels,[]);assert.doesNotThrow(()=>cleanEvent(null));
 assert.deepEqual(buildReport({...input,includeContent:true,messages:[null,{}, {role:'user',content:{secret:true}}]}).conversation,[]);
 const handlers={};const ui={disabled:false,addEventListener:(name,fn)=>handlers[name]=fn},checkbox={checked:true},status={};let exported,read=0;
 const doc={addEventListener:(_event,fn)=>fn(),getElementById:id=>id==='btn-export-local-diagnostics'?ui:id==='diagnostics-include-content'?checkbox:status};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/renderer/local-diagnostics-ui'),'utf8'),{document:doc,window:{BrownDiagnosticConversation:()=>{read++;return [{role:'user',content:secret}];},ultronAPI:{exportLocalDiagnostics:async payload=>{exported=payload;return {success:true};}}}});
 assert.equal(checkbox.checked,false);await handlers.click();assert.equal(read,0);assert(!('messages' in exported));checkbox.checked=true;await handlers.click();assert.equal(read,1);assert.equal(checkbox.checked,false);
 console.log('PASS: local diagnostics exclude content and credentials by default, preserve timings, redact opted-in text, tolerate offline runtime and require explicit content selection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
