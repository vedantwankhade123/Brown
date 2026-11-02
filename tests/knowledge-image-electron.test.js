const {app}=require('electron'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'brown-image-rag-'));app.setPath('userData',root);
 let code=0;
 try{
  const {createCanvas}=require('@napi-rs/canvas'),canvas=createCanvas(800,180),context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,800,180);context.fillStyle='black';context.font='40px Arial';context.fillText('Invoice total 560',20,90);
  const file=path.join(root,'invoice.png');fs.writeFileSync(file,canvas.toBuffer('image/png'));const rag=require('../src/main/rag-engine');
  const imported=await rag.addSources([file]);assert(imported.success&&imported.totalFiles===1);
  const evidence=await rag.readEvidence(file,{includeImage:true});assert(evidence.success&&evidence.content.includes('560'));assert.equal(evidence.image?.mimeType,'image/png',evidence.imageError||'No native thumbnail returned');assert(evidence.image.data.length>0);
  const plain=await rag.readEvidence(file);assert(!plain.image,'Preview was read without an explicit vision request');
  assert.equal((await rag.readEvidence(path.join(root,'unindexed.png'),{includeImage:true})).success,false);
  assert((await rag.searchKnowledge('Invoice total')).results.some(row=>row.kind==='image'&&row.extraction==='ocr'));
  console.log('PASS: actual indexed-image OCR, native bounded vision previews, metadata retrieval and unindexed-path isolation.');
 }catch(error){console.error(error);code=1;}
 finally{if(path.dirname(path.resolve(root))===path.resolve(os.tmpdir())&&path.basename(root).startsWith('brown-image-rag-'))fs.rmSync(root,{recursive:true,force:true});}
 app.exit(code);
});
