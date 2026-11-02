const assert=require('node:assert/strict');
const workflows=require('../src/renderer/message-workflows');
const {locate}=require('../src/renderer/evidence-viewer');
const session={messages:[{sender:'User',text:'Original request',attachments:[{path:'C:/data.pdf'}]},{sender:'Ultron',text:'Original answer'}]};
session.messages.forEach(workflows.identify);
const original=workflows.archive(session,1,'Regenerated response');
const anchor=session.messages[1].id;
session.messages[1]={...session.messages[1],text:'New answer'};
assert.equal(original.messages[0].text,'Original answer');
workflows.restore(session,original);
assert.equal(session.messages[1].text,'Original answer');
assert.equal(session.messages[1].id,anchor);
assert.equal(session.revisions[1].messages[0].text,'New answer');
const wrongBranch=structuredClone(session);wrongBranch.messages[0].id='different-request';
assert.throws(()=>workflows.restore(wrongBranch,original),/matching conversation branch/);
assert.equal(wrongBranch.revisions.length,session.revisions.length);
assert.deepEqual(locate('Heading\nExact source text\nFooter','Exact source text'),{start:8,end:25,line:2,endLine:2});
assert.equal(locate('Changed content','Exact source text'),null);
assert.equal(locate('Any content',''),null);
assert.equal(session.messages[1].isAi,true);
const newer=session.revisions[1];
for(let index=0;index<20;index++){
 session.messages[1].createdAt=new Date(Date.now()+index*1000).toISOString();session.messages[1].jobId='different-run-'+index;
 workflows.restore(session,newer);workflows.restore(session,original);
}
assert.equal(session.revisions.length,2,'Switching versions created duplicate snapshots');
const touched=session.updatedAt;assert.equal(workflows.restore(session,original),false);assert.equal(session.updatedAt,touched,'Restoring current content changed metadata');
const duplicate=structuredClone(original);duplicate.id='duplicate';duplicate.createdAt='2099-01-01';duplicate.label='Different reason';duplicate.messages[0].createdAt='2099-01-01';duplicate.messages[0].jobId='other-run';duplicate.messages[0].id='other-message-id';session.revisions.push(duplicate);
assert.equal(workflows.compact(session),1,'Timestamp/identity-only duplicates were kept');
const changedEvidence=structuredClone(original);changedEvidence.id='new-evidence';changedEvidence.messages[0].ragCitations=[{filePath:'C:/source.txt',text:'Different evidence'}];session.revisions.push(changedEvidence);assert.equal(workflows.compact(session),0,'Different evidence was discarded');
const changedContinuation=structuredClone(original);changedContinuation.id='continuation';changedContinuation.messages.push({isAi:false,text:'Different follow-up'});session.revisions.push(changedContinuation);assert.equal(workflows.compact(session),0,'Different continuation was discarded');
const activeText=session.messages[1].text;assert.equal(workflows.removeVersion(session,newer.id),true);assert.equal(workflows.removeVersion(session,newer.id),false);assert.equal(session.messages[1].text,activeText,'Deleting a saved version changed current chat');
const turnSession={messages:[{isAi:false,text:'First request'},{isAi:true,text:'First illustration'},{isAi:false,text:'Later request'},{isAi:true,text:'Later illustration'}]};turnSession.messages.forEach(workflows.identify);const later=turnSession.messages.slice(2);const turn=workflows.archive(turnSession,0,'Edited prompt',{scope:'turn',end:2});turnSession.messages[0].text='Edited request';turnSession.messages[1].text='Edited illustration';workflows.restore(turnSession,turn);assert.equal(turnSession.messages.length,4);assert.equal(turnSession.messages[1].text,'First illustration');assert.equal(turnSession.messages[2],later[0]);assert.equal(turnSession.messages[3],later[1]);
for(const messages of [[],[{isAi:false,text:'A request without an answer'}],[{isAi:true,text:'   '}],[{isAi:true,text:'<p><br></p>'}],[{isAi:true,text:'This response was interrupted when the app closed. Send a message to retry.'}],[{isAi:true,text:'This request reached its time limit.',jobState:'cancelled'}],[{isAi:true,text:'The request could not finish: out of memory',jobState:'failed'}]]){
 const empty={...original,messages};assert.equal(workflows.hasRestorableOutput(empty),false);const before=JSON.stringify(session);assert.throws(()=>workflows.restore(session,empty),/no generated result/);assert.equal(JSON.stringify(session),before,'Rejected restore mutated history');
}
assert.equal(workflows.hasRestorableOutput({messages:[{isAi:true,text:'A useful partial answer',jobState:'cancelled'}]}),true,'Useful stopped output was rejected');
assert.equal(workflows.hasRestorableOutput({messages:[{sender:'Ultron',text:'A saved legacy answer'}]}),true);
console.log('PASS: immutable message snapshots, reversible turn restore, empty/failed output guards, prefix isolation, legacy roles and exact source positions.');
