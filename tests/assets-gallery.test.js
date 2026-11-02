const assert=require('node:assert/strict');
const {collect,remove,category}=require('../src/renderer/assets-gallery');
const sessions={
  one:{title:'Project brief',projectId:'demo',messages:[{isAi:false,attachments:[{name:'brief.pdf',path:'D:\\Docs\\brief.pdf',size:2048},{name:'photo.png',dataUrl:'data:image/png;base64,AAAA',isImage:true}]}],activity:{uploads:[{name:'brief.pdf',messageIndex:0},{name:'photo.png',messageIndex:0}]}},
  two:{title:'Review',messages:[{isAi:false,references:[{name:'brief.pdf',path:'d:/docs/brief.pdf'}]},{isAi:true,ragCitations:[{fileName:'not-an-upload.txt'}]}]},
  older:{title:'Legacy',messages:[],activity:{uploads:[{name:'legacy.zip',messageIndex:0}]}},
  duplicateName:{title:'Different file',messages:[{isAi:false,attachments:[{name:'brief.pdf',path:'D:/Other/brief.pdf'}]}]}
};
const assets=collect(sessions);assert.equal(assets.length,4,'deduplicates a shared path and avoids duplicate upload history');
const pdf=assets.find(asset=>asset.path==='D:\\Docs\\brief.pdf');assert.equal(pdf.chats.length,2);assert.equal(pdf.category,'PDFs');assert.equal(pdf.refs.length,2);
assert(!assets.some(asset=>asset.name==='not-an-upload.txt'),'retrieved citations are not user assets');
assert.equal(category({name:'component.jsx'}),'Code');assert.equal(category({name:'sheet.xlsx'}),'Documents');assert.equal(category({name:'archive.zip'}),'Other');
remove(sessions,pdf);assert.equal(collect(sessions).length,3);assert.equal(sessions.one.messages[0].attachments.length,1);assert.equal(sessions.two.messages[0].references.length,0);assert.equal(sessions.one.activity.uploads.length,1);assert.equal(sessions.duplicateName.messages[0].attachments.length,1,'same filename at another path is preserved');
const legacy=collect(sessions).find(asset=>asset.name==='legacy.zip');remove(sessions,legacy);assert.equal(sessions.older.activity.uploads.length,0);
const reloaded=JSON.parse(JSON.stringify(sessions));assert.equal(collect(reloaded).length,2,'gallery survives chat persistence');
console.log('PASS: asset collection across chats, file families, linked uses, deduplication, legacy records, persisted deletion and unrelated-file preservation.');
const fs=require('node:fs'),vm=require('node:vm');
const renderer=fs.readFileSync(require.resolve('../src/renderer/renderer'),'utf8');
const context=vm.createContext({window:{crypto:{randomUUID:()=> 'asset-test'}},isAwaitingResponse:false,_processingSessionId:null,currentSessionId:'chat',conversationsStore:{chat:{messages:[]}},_promptMentions:{files:[{name:'notes.md',path:'D:/notes.md'}]},nowIso:()=>new Date().toISOString(),touchSession(){},rebuildSessionHistoryList(){},saveConversationsToDisk(){},renderSessionPanel(){}});
const start=renderer.indexOf('function appendChatMessage('),end=renderer.indexOf('// Generate a rolling summary',start);vm.runInContext(renderer.slice(start,end),context);
context.appendChatMessage('User','Review this PDF',false,{skipRender:true,attachments:[{name:'brief.pdf',path:'D:/brief.pdf',type:'application/pdf',size:1024}]});
const saved=JSON.parse(JSON.stringify(context.conversationsStore));assert.equal(saved.chat.messages[0].attachments[0].path,'D:/brief.pdf');assert.equal(saved.chat.messages[0].references[0].name,'notes.md');assert.equal(collect(saved).length,2);
assert(renderer.includes('{ attachments: msg.attachments, skipTrackUploads: true }'),'chat reload restores attachments without duplicating upload activity');
console.log('PASS: actual chat message persistence retains attachment metadata and explicitly mentioned files.');
