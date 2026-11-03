// Exercise the production removal macro only in a disposable fixture.
// This harness has no registry operations and never runs the real uninstaller.
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const project=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'brown-installer-test-')),fixture=path.join(root,'app');
const compiler=path.join(process.env.LOCALAPPDATA,'electron-builder/Cache/nsis/nsis-3.0.4.1/Bin/makensis.exe');
try{
 for(const file of ['Brown AI.exe','resources/app.asar','resources/app.asar.unpacked/native.dll','locales/en-US.pak','data/chat.json','models/local.gguf','connectors/settings.json','personal.txt']){const target=path.join(fixture,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,'fixture');}
 const exe=path.join(root,'fixture.exe'),script=path.join(root,'fixture.nsi');
 fs.writeFileSync(script,`Unicode true\nName "Brown removal test"\nOutFile "${exe}"\nRequestExecutionLevel user\nSilentInstall silent\n!define BUILD_UNINSTALLER\n!define BUILD_RESOURCES_DIR "${project}\\build"\n!addincludedir "${project}\\node_modules\\app-builder-lib\\templates\\nsis\\include"\n!include "${project}\\build\\installer.nsh"\nSection\nStrCpy $INSTDIR "${fixture}"\n!insertmacro customRemoveFiles\nSectionEnd\n`);
 execFileSync(compiler,[script],{stdio:'pipe'});execFileSync(exe,[],{windowsHide:true});
 for(const file of ['Brown AI.exe','resources/app.asar','resources/app.asar.unpacked/native.dll','locales/en-US.pak'])assert(!fs.existsSync(path.join(fixture,file)),file);
 for(const file of ['data/chat.json','models/local.gguf','connectors/settings.json','personal.txt'])assert.equal(fs.readFileSync(path.join(fixture,file),'utf8'),'fixture');
 // Exercise storage relocation/restoration used when upgrading old uninstallers.
 const restoreExe=path.join(root,'restore.exe'),restoreScript=path.join(root,'restore.nsi');
 fs.writeFileSync(restoreScript,`Unicode true\nName "Brown restore test"\nOutFile "${restoreExe}"\nRequestExecutionLevel user\nSilentInstall silent\n!define BUILD_RESOURCES_DIR "${project}\\build"\n!addincludedir "${project}\\node_modules\\app-builder-lib\\templates\\nsis\\include"\n!include "${project}\\build\\installer.nsh"\n!macro _CHECK_APP_RUNNING\n!macroend\nSection\nStrCpy $INSTDIR "${fixture}"\n!insertmacro customCheckAppRunning\nCall BrownRestoreStorage\nSectionEnd\n`);
 execFileSync(compiler,[restoreScript],{stdio:'pipe'});execFileSync(restoreExe,[],{windowsHide:true});
 for(const file of ['data/chat.json','models/local.gguf','connectors/settings.json'])assert.equal(fs.readFileSync(path.join(fixture,file),'utf8'),'fixture');
 assert(!fs.existsSync(fixture+'.brown-update-backup'));
 // Abort after relocation: .onInstFailed must restore all saved directories.
 const interrupted=path.join(root,'interrupted.nsi'),interruptedExe=path.join(root,'interrupted.exe');
 fs.writeFileSync(interrupted,fs.readFileSync(restoreScript,'utf8').replace(restoreExe,interruptedExe).replace('Call BrownRestoreStorage','Abort "Simulated extraction failure"'));
 execFileSync(compiler,[interrupted],{stdio:'pipe'});
 assert.throws(()=>execFileSync(interruptedExe,[],{windowsHide:true,timeout:15000}));
 for(const file of ['data/chat.json','models/local.gguf','connectors/settings.json'])assert.equal(fs.readFileSync(path.join(fixture,file),'utf8'),'fixture');
 assert(!fs.existsSync(fixture+'.brown-update-backup'));
 // Never overwrite a recovery directory left by an earlier interrupted update.
 const backup=fixture+'.brown-update-backup';fs.mkdirSync(backup);fs.writeFileSync(path.join(backup,'sentinel'),'previous backup');
 assert.throws(()=>execFileSync(restoreExe,[],{windowsHide:true,timeout:15000}));
 assert.equal(fs.readFileSync(path.join(backup,'sentinel'),'utf8'),'previous backup');
 assert.equal(fs.readFileSync(path.join(fixture,'data/chat.json'),'utf8'),'fixture');
 // A non-removable application file must produce failure, preserve data and
 // retain the uninstaller; clearing the lock must allow a subsequent retry.
 fs.writeFileSync(path.join(fixture,'Brown AI.exe'),'fixture');fs.mkdirSync(path.join(fixture,'resources'),{recursive:true});
 const blocked=path.join(fixture,'resources/app.asar');fs.writeFileSync(blocked,'fixture');
 fs.writeFileSync(path.join(fixture,'Uninstall Brown AI.exe'),'fixture');
 const quote=value=>"'"+value.replace(/'/g,"''")+"'";
 const holdLock=`$lockedFile=[System.IO.File]::Open(${quote(blocked)},'Open','Read','None'); try { $testProcess=Start-Process -FilePath ${quote(exe)} -PassThru -Wait -WindowStyle Hidden; $testExit=$testProcess.ExitCode } finally { $lockedFile.Dispose() }; exit $testExit`;
 assert.throws(()=>execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',holdLock],{windowsHide:true,timeout:15000}));assert(fs.existsSync(path.join(fixture,'Uninstall Brown AI.exe')));assert(fs.existsSync(blocked));
 execFileSync(exe,[],{windowsHide:true,timeout:15000});assert(!fs.existsSync(blocked));
 assert.equal(fs.readFileSync(path.join(fixture,'data/chat.json'),'utf8'),'fixture');
 console.log('PASS: interrupted upgrade restoration, recovery-backup collision protection, blocked-file failure and retry.');
 console.log('PASS: compiled production removal macro removes binaries and preserves chats, models, connectors and unrelated files.');
}finally{assert(root.startsWith(path.join(os.tmpdir(),'brown-installer-test-')));fs.rmSync(root,{recursive:true,force:true});}
