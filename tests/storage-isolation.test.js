const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(require.resolve('../src/main/paths'),'utf8');
function fixture(packaged,files={}){
 const store=new Map(Object.entries(files)),dirs=new Set(),reads=[];
 const user=packaged?'C:\\Local\\UltronData':'C:\\Local\\UltronDataDev';
 const io={existsSync:p=>store.has(p)||dirs.has(p),mkdirSync:p=>dirs.add(p),writeFileSync:(p,v)=>store.set(p,String(v)),unlinkSync:p=>store.delete(p),readFileSync:p=>{reads.push(p);if(!store.has(p))throw Error('Missing');return store.get(p);},realpathSync:p=>p};
 const environment={LOCALAPPDATA:'C:\\Local',USERPROFILE:'C:\\User'};
 const sandbox={module:{exports:{}},console,process:{env:environment,cwd:()=> 'D:\\Source'},require:name=>name==='electron'?{app:{isPackaged:packaged,getPath:key=>key==='exe'?'C:\\Apps\\Brown\\Brown.exe':user}}:name==='fs'?io:name==='path'?path.win32:name==='os'?{}:require(name)};
 vm.runInNewContext(source,sandbox);
 return {api:sandbox.module.exports,store,reads,environment};
}
const legacy='C:\\Local\\UltronDataDev\\data\\config.json';
let f=fixture(true,{[legacy]:JSON.stringify({customDataDir:'D:\\Source\\brown-local\\data',ultronRoot:'D:\\Source\\brown-local'})});
f.environment.ULTRON_DATA_DIR='D:\\Source\\brown-local\\data';
assert.equal(f.api.getUltronRuntimeRoot(),'C:\\Apps\\Brown\\data','Inherited development environment must not override production data');
let snapshot=f.api.getStoragePathsSnapshot();assert(!f.reads.includes(legacy),'Production read the development legacy config');assert.equal(snapshot.agentDataDir,'C:\\Apps\\Brown\\data');
assert.throws(()=>f.api.updateAgentDataDir('D:\\Source\\brown-local\\data'),/separate data folder/);
assert.throws(()=>f.api.updateConnectorsDir('C:\\Local\\UltronDataDev\\connectors'),/separate data folder/);
// A custom opposite-profile folder is detected by canonical ancestry, not just its name.
f=fixture(true,{'C:\\Local\\UltronDataDev\\storage-profile.json':JSON.stringify({agentDataDir:'E:\\Scratch\\private',connectorsDir:'E:\\Scratch\\tools'})});
assert.throws(()=>f.api.updateAgentDataDir('e:\\scratch\\PRIVATE\\nested'),/separate data folder/);
assert.throws(()=>f.api.updateAgentDataDir('E:\\Scratch'),/separate data folder/);
assert.doesNotThrow(()=>f.api.updateAgentDataDir('E:\\Scratchpad'));
// Existing profiles that point into dev storage fall back without touching dev data.
f=fixture(true,{'C:\\Apps\\Brown\\data\\storage-config.json':JSON.stringify({ultronRoot:'D:\\Source\\brown-local',modelsDir:'D:\\Source\\brown-local\\models'})});
snapshot=f.api.getStoragePathsSnapshot();assert.equal(snapshot.agentDataDir,'C:\\Apps\\Brown\\data');assert.equal(snapshot.modelsDir,'D:\\Source\\brown-local\\models','Model sharing must remain possible');assert(snapshot.isolationWarnings.length);assert.equal(snapshot.runtimeModelDirectoryVerified,false);
f=fixture(false);assert.throws(()=>f.api.updateAgentDataDir('C:\\Local\\UltronData\\data'),/separate data folder/);
assert.equal(f.api.getStoragePathsSnapshot().agentDataDir,'D:\\Source\\brown-local\\data');
console.log('PASS: production/dev legacy isolation, named and custom overlap guards, safe fallback, shared model paths and explicit runtime diagnostics.');
