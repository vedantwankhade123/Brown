const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
(async()=>{
 const source=fs.readFileSync(require.resolve('../src/main/ipc'),'utf8');
 const start=source.indexOf("  ipcMain.handle('get-storage-paths'");
 const end=source.indexOf('\n  });',start)+7;
 let handler,offline=false;
 const snapshot={runtimeEndpoint:'http://127.0.0.1:11434',modelsDir:'E:\\Configured',runtimeModelDirectoryVerified:false};
 vm.runInNewContext(source.slice(start,end),{ipcMain:{handle:(_name,fn)=>handler=fn},getStoragePathsSnapshot:()=>({...snapshot}),AbortSignal,fetch:async(url,options)=>{assert.equal(url,snapshot.runtimeEndpoint+'/api/ps');assert(options.signal);if(offline)throw Error('offline');return {ok:true,json:async()=>({models:[{name:'local',size:12,size_vram:6,unrelated:'omit'}]})};}});
 let result=await handler();assert.equal(result.runtime.reachable,true);assert.equal(result.runtime.loadedModels[0].name,'local');assert.equal(result.runtime.loadedModels[0].unrelated,undefined);assert.equal(result.runtimeModelDirectoryVerified,false);
 offline=true;result=await handler();assert.equal(result.runtime.reachable,false);assert.equal(result.modelsDir,snapshot.modelsDir,'Unavailable runtime must not hide storage diagnostics');
 console.log('PASS: bounded local runtime diagnostics, selected model metadata, honest model-directory status and offline fallback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
