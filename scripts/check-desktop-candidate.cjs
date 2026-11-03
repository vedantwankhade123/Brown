// Read-only release preflight. Does not sign, upload, tag or publish anything.
// Unsigned deployments (our current reality) pass every check except signatures; pass
// --require-signing to make signatures mandatory again once a certificate exists.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),directory=path.resolve(process.argv.find((a,i)=>i>1&&!a.startsWith('--'))||path.join(root,'dist'));
const requireSigning=process.argv.includes('--require-signing');
const version=require(path.join(root,'package.json')).version;
const asar=require('@electron/asar'),yaml=require('js-yaml');
const sha=(file,algorithm='sha256',encoding='hex')=>crypto.createHash(algorithm).update(fs.readFileSync(file)).digest(encoding);
const archive=path.join(directory,'win-unpacked/resources/app.asar');
const findings=[],artifacts=[];
function check(name,fn){try{fn();findings.push({name,status:'passed'});}catch(error){findings.push({name,status:'blocked',reason:error.message});}}
check('Packaged version',()=>assert.equal(JSON.parse(asar.extractFile(archive,'package.json')).version,version));
check('Packaged source parity',()=>{
 function visit(folder){for(const entry of fs.readdirSync(folder,{withFileTypes:true})){const file=path.join(folder,entry.name);if(entry.isDirectory())visit(file);else{const relative=path.relative(root,file);assert(asar.extractFile(archive,relative).equals(fs.readFileSync(file)),'Packaged source differs: '+relative);}}}
 visit(path.join(root,'src'));
});
// src parity alone misses node_modules: under memory pressure the packer has byte-shifted
// dependency package.json files, killing the preload bridge while src/ stays intact.
check('Dependency package.json integrity',()=>{
 const packed=JSON.parse(asar.extractFile(archive,'package.json'));
 const deps=Object.keys(packed.dependencies||{});
 assert(deps.length>0,'packed package.json lists no production dependencies');
 const corrupt=[];
 for(const dep of deps){try{JSON.parse(asar.extractFile(archive,path.join('node_modules',dep,'package.json')).toString('utf8'));}catch(_){corrupt.push(dep);}}
 assert.equal(corrupt.length,0,'corrupt dependency package.json in asar (likely memory-pressure packing): '+corrupt.join(', '));
});
check('Download aliases',()=>{
 for(const [source,aliases] of [[`Brown AI Setup v${version}.exe`,['Brown-AI-Setup.exe',`Brown-AI-Setup-v${version}.exe`]],[`Brown AI v${version}.exe`,['Brown-AI-Portable.exe',`Brown-AI-v${version}.exe`]]]){
  const original=path.join(directory,source),hash=sha(original);
  for(const alias of aliases)assert.equal(sha(path.join(directory,alias)),hash,'Alias mismatch: '+alias);
  artifacts.push({name:source,bytes:fs.statSync(original).size,sha256:hash});
 }
});
check('Update manifest',()=>{
 const manifest=yaml.load(fs.readFileSync(path.join(directory,'latest.yml'),'utf8'));
 assert.equal(manifest.version,version);assert.equal(manifest.path,'Brown-AI-Setup.exe');
 const file=path.join(directory,manifest.path),hash=sha(file,'sha512','base64');
 assert.equal(manifest.sha512,hash);assert.equal(manifest.files[0].sha512,hash);assert.equal(manifest.files[0].url,manifest.path);assert.equal(manifest.files[0].size,fs.statSync(file).size);
});
if(requireSigning)for(const name of ['Brown-AI-Setup.exe','Brown-AI-Portable.exe'])check('Trusted timestamped signature: '+name,()=>require('./verify-windows-release.cjs').verifyWindowsRelease(path.join(directory,name)));
else findings.push({name:'Trusted timestamped signature',status:'skipped',reason:'unsigned deployment (--require-signing to enforce)'});
const sandboxResult=path.join(root,'output/installer-sandbox/results/result.json');
check('Clean-machine lifecycle',()=>{assert(fs.existsSync(sandboxResult),'Windows Sandbox validation has not run');const result=JSON.parse(fs.readFileSync(sandboxResult));assert.equal(result.passed,true);assert.equal(result.version,version);assert.equal(result.installerSha256.toLowerCase(),sha(path.join(directory,'Brown-AI-Setup.exe')),'Sandbox results must match this exact installer');});
const report={version,checkedAt:new Date().toISOString(),directory,published:false,checksPassed:findings.every(row=>row.status==='passed'),artifacts,findings};
fs.mkdirSync(path.join(root,'output'),{recursive:true});fs.writeFileSync(path.join(root,'output/desktop-candidate-readiness.json'),JSON.stringify(report,null,2));
for(const finding of findings)console.log(`${finding.status.toUpperCase()}: ${finding.name}${finding.reason?' - '+finding.reason:''}`);
if(!report.checksPassed)process.exitCode=1;
