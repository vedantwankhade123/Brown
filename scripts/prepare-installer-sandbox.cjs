const fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..'),kit=path.join(root,'output/installer-sandbox'),results=path.join(kit,'results');
fs.mkdirSync(results,{recursive:true});
const version=require(path.join(root,'package.json')).version;
const dist=path.join(root,'dist');
// The upgrade path is validated against whatever release users actually run today; v1.0.19
// is the newest published installer on GitHub, so that is the "previous" for a fresh
// deploy. When a newer release is live, pass PREVIOUS_SETUP=<path> to prepare-installer-sandbox.
const previous=path.join(root,process.env.PREVIOUS_SETUP||path.join('dist-desktop-previous','Brown AI Setup v1.0.19.exe'));
const latestSetup=path.join(dist,`Brown AI Setup v${version}.exe`);
for(const f of [latestSetup,previous]){if(!fs.existsSync(f)){console.error('Missing installer for sandbox kit: '+f);process.exit(1);}}
const hash=file=>require('crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fileVersion=file=>require('child_process').execFileSync('powershell.exe',['-NoProfile','-Command',`(Get-Item -LiteralPath '${file.replace(/'/g,"''")}').VersionInfo.ProductVersion`],{encoding:'utf8'}).trim();
fs.writeFileSync(path.join(kit,'checksums.json'),JSON.stringify({latest:hash(latestSetup),previous:hash(previous),latestVersion:version,previousVersion:fileVersion(previous)},null,2));
fs.copyFileSync(path.join(root,'tests/installer-sandbox.ps1'),path.join(kit,'installer-sandbox.ps1'));
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const map=(host,guest,readOnly)=>`<MappedFolder><HostFolder>${escape(host)}</HostFolder><SandboxFolder>${guest}</SandboxFolder><ReadOnly>${readOnly}</ReadOnly></MappedFolder>`;
const config=`<Configuration><Networking>Disable</Networking><ClipboardRedirection>Disable</ClipboardRedirection><MappedFolders>${map(dist,'C:\\BrownValidation\\Latest',true)}${map(path.dirname(previous),'C:\\BrownValidation\\Previous',true)}${map(kit,'C:\\BrownValidation\\Harness',true)}${map(results,'C:\\BrownValidation\\Results',false)}</MappedFolders><LogonCommand><Command>powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\BrownValidation\\Harness\\installer-sandbox.ps1</Command></LogonCommand></Configuration>`;
fs.writeFileSync(path.join(kit,'Brown-installer-validation.wsb'),config);
console.log('Prepared Windows Sandbox test: '+path.join(kit,'Brown-installer-validation.wsb'));
console.log('  latest  : '+latestSetup);
console.log('  previous: '+previous);

