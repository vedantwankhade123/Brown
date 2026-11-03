// Tests the built HTML, preload bridge, renderer export UI and main IPC handlers.
// Native dialogs are stubbed to disposable destinations; no real user data is read.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('fs'),path=require('path'),os=require('os'),vm=require('vm'),assert=require('assert/strict');
const archive=path.resolve(process.argv[2]||'dist-desktop-v1.0.21-ready/win-unpacked/resources/app.asar');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'brown-diagnostics-integration-'));
app.disableHardwareAcceleration();
app.setPath('userData',path.join(root,'profile'));
let stage='startup';
const deadline=setTimeout(()=>{console.error('Packaged diagnostics integration timed out at '+stage);app.exit(1);},45000);
app.whenReady().then(async()=>{
 console.log('Diagnostics test: Electron ready');
 let win,confirmation=0,confirmations=0;
 const destination=path.join(root,'diagnostics.json');
 try{
  const source=fs.readFileSync(path.join(archive,'src/main/ipc.js'),'utf8');
  console.log('Diagnostics test: packaged IPC loaded');
  const dialog={showSaveDialog:async()=>({filePath:destination,canceled:false}),showMessageBox:async()=>{confirmations++;return {response:confirmation};}};
  const diagnostics=require(path.join(archive,'src/main/local-diagnostics.js'));
  const version=require(path.join(archive,'package.json')).version;
  // Verify the built artifact really ships the export wiring, statically. Loading
  // the full ~212KB index.html under Electron stalls on low-memory hosts, so we
  // assert element presence here and drive behavior against a minimal DOM fixture.
  const builtHtml=fs.readFileSync(path.join(archive,'src/renderer/index.html'),'utf8');
  assert.match(builtHtml,/<input[^>]*type="checkbox"[^>]*id="diagnostics-include-content"/,'built HTML missing the include-content checkbox');
  assert.match(builtHtml,/<button[^>]*id="btn-export-local-diagnostics"/,'built HTML missing the export button');
  assert.match(builtHtml,/id="local-diagnostics-status"/,'built HTML missing the status element');
  console.log('Diagnostics test: built HTML wiring verified');
  vm.runInNewContext(source.slice(source.indexOf('  const localDiagnostics='),source.indexOf("  ipcMain.handle('diagnostics:capture'")),{ipcMain,fs,process,app:{getVersion:()=>version,isPackaged:true},require:name=>name==='electron'?{dialog}:diagnostics,Date,JSON,Array});
  console.log('Diagnostics test: handlers registered');
  win=new BrowserWindow({show:false,webPreferences:{preload:path.join(archive,'src/preload/preload.js'),sandbox:false,contextIsolation:true,backgroundThrottling:false}});
  console.log('Diagnostics test: window created');
  // Minimal fixture mirrors the three real elements (same ids, types, roles) so the
  // preload bridge + UI script are exercised without parsing unrelated app markup.
  const fixture='<!doctype html><html><head><meta charset="utf-8"></head><body>'+
   '<label><input type="checkbox" id="diagnostics-include-content"> Include prompts and responses from the current chat</label>'+
   '<button type="button" id="btn-export-local-diagnostics" class="set-pill">Export diagnostic report</button>'+
   '<p id="local-diagnostics-status" role="status" aria-live="polite"></p>'+
   '</body></html>';
  stage='load fixture';await win.loadURL('data:text/html;base64,'+Buffer.from(fixture).toString('base64'));
  console.log('Diagnostics test: fixture loaded');
  stage='attach UI';
  await win.webContents.executeJavaScript(fs.readFileSync(path.join(archive,'src/renderer/local-diagnostics-ui.js'),'utf8'));
  await win.webContents.executeJavaScript(`document.dispatchEvent(new Event('DOMContentLoaded')); window.BrownDiagnosticConversation=()=>[{role:'user',content:'SYNTHETIC_PRIVATE_PROMPT'},{role:'assistant',content:'SYNTHETIC_PRIVATE_RESPONSE'}]; window.ultronAPI.recordLocalDiagnostic({model:'test-local',status:'finished',code:'OK',generationMs:123,settings:{temperature:0.2},prompt:'SHOULD_NOT_EXPORT'});`);
  const click=async included=>win.webContents.executeJavaScript(`(async()=>{document.getElementById('diagnostics-include-content').checked=${included};document.getElementById('btn-export-local-diagnostics').click();const start=Date.now();while(document.getElementById('btn-export-local-diagnostics').disabled){if(Date.now()-start>10000)throw Error('Export stuck');await new Promise(r=>setTimeout(r,20));}return {status:document.getElementById('local-diagnostics-status').textContent,checked:document.getElementById('diagnostics-include-content').checked};})()`);
  stage='metadata export';assert.match((await click(false)).status,/saved locally/);
  const report=JSON.parse(fs.readFileSync(destination,'utf8'));
  assert.equal(report.app.version,version);assert.equal(report.events[0].generationMs,123);assert.equal(report.events[0].settings.temperature,0.2);
  assert(!report.conversation);assert(!JSON.stringify(report).includes('SYNTHETIC_PRIVATE'));assert(!JSON.stringify(report).includes('SHOULD_NOT_EXPORT'));assert.equal(confirmations,0);
  assert.match((await click(true)).status,/cancelled/);assert.equal(confirmations,1);assert(!JSON.parse(fs.readFileSync(destination,'utf8')).conversation);
  confirmation=1;const included=await click(true);assert.match(included.status,/saved locally/);assert.equal(included.checked,false);
  assert.equal(JSON.parse(fs.readFileSync(destination,'utf8')).conversation[0].content,'SYNTHETIC_PRIVATE_PROMPT');
  console.log('PASS: built HTML ships the export wiring, and preload + IPC export metadata, exclude content by default, honor declined consent and include synthetic chat only after consent.');
 }catch(error){console.error(error);process.exitCode=1;}
 finally{clearTimeout(deadline);win?.destroy();assert(root.startsWith(path.join(os.tmpdir(),'brown-diagnostics-integration-')));app.exit(process.exitCode||0);}
});
