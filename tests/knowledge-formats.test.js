const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process');
const parsers=require('../src/main/knowledge-parsers');
function zip(entries){
 const local=[],central=[];let offset=0;
 const crc=buffer=>{let c=0xffffffff;for(const byte of buffer){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 for(const [name,text] of Object.entries(entries)){const file=Buffer.from(name),body=Buffer.from(text),head=Buffer.alloc(30),record=Buffer.alloc(46);head.writeUInt32LE(0x04034b50);head.writeUInt16LE(20,4);head.writeUInt32LE(crc(body),14);head.writeUInt32LE(body.length,18);head.writeUInt32LE(body.length,22);head.writeUInt16LE(file.length,26);local.push(head,file,body);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt32LE(crc(body),16);record.writeUInt32LE(body.length,20);record.writeUInt32LE(body.length,24);record.writeUInt16LE(file.length,28);record.writeUInt32LE(offset,42);central.push(record,file);offset+=head.length+file.length+body.length;}
 const end=Buffer.alloc(22),directory=Buffer.concat(central);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);return Buffer.concat([...local,directory,end]);
}
function scannedPdf(jpeg){
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 800 180] /Resources << /XObject << /Img 4 0 R >> >> /Contents 5 0 R >>'),Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width 800 /Height 180 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'),jpeg,Buffer.from('\nendstream')]),Buffer.from('<< /Length 31 >>\nstream\nq 800 0 0 180 0 0 cm /Img Do Q\nendstream')];
 const parts=[Buffer.from('%PDF-1.4\n')],offsets=[];let size=parts[0].length;
 objects.forEach((body,i)=>{offsets.push(size);const item=Buffer.concat([Buffer.from((i+1)+' 0 obj\n'),body,Buffer.from('\nendobj\n')]);parts.push(item);size+=item.length;});parts.push(Buffer.from('xref\n0 6\n0000000000 65535 f \n'+offsets.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+size+'\n%%EOF'));return Buffer.concat(parts);
}
async function run(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'brown-formats-')),write=(name,data)=>{const file=path.join(root,name);fs.writeFileSync(file,data);return file;};
 try{
  const docx=write('report.docx',zip({'word/document.xml':'<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>Aurora revenue </w:t></w:r><w:r><w:t>is 42.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>हिंदी दस्तावेज़</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'}));
  assert((await parsers.extract(docx)).text.includes('Aurora revenue is 42.'));assert((await parsers.extract(docx)).text.includes('हिंदी'));
  const pptx=write('slides.pptx',zip({'ppt/slides/slide2.xml':'<a:p xmlns:a="urn:a"><a:r><a:t>Next milestone</a:t></a:r></a:p>','ppt/slides/slide1.xml':'<a:p xmlns:a="urn:a"><a:r><a:t>Launch plan</a:t></a:r></a:p>'}));const slides=await parsers.extract(pptx);assert.equal(slides.segments[0].slideNumber,1);assert(slides.text.includes('Launch plan'));
  const xlsx=write('sales.xlsx',zip({'xl/workbook.xml':'<workbook xmlns:r="urn:r"><sheets><sheet name="Revenue" r:id="rId7"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="rId7" Target="worksheets/sheet3.xml"/></Relationships>','xl/sharedStrings.xml':'<sst><si><t>Quarter</t></si></sst>','xl/worksheets/sheet3.xml':'<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>42</v></c></row><row><c r="A2" t="inlineStr"><is><t>Q2</t></is></c><c r="B2"><f>B1*2</f><v>84</v></c></row></sheetData></worksheet>'}));const sheet=await parsers.extract(xlsx);assert.equal(sheet.segments[0].sheetName,'Revenue');assert(sheet.text.includes('A1: Quarter | B1: 42'));assert(sheet.text.includes('B2: 84'));
  const odt=write('notes.odt',zip({'content.xml':'<office:document xmlns:office="urn:o" xmlns:text="urn:t"><text:h>Heading</text:h><text:p>First paragraph</text:p><text:h>Second heading</text:h></office:document>'}));assert.match((await parsers.extract(odt)).text,/Heading\nFirst paragraph\nSecond heading/);
  assert((await parsers.extract(write('notes.rtf','{\\rtf1\\ansi{\\fonttbl{\\f0 Hidden font;}}Hello \\u945?\\par Revenue 42}'))).text.includes('Hello α\nRevenue 42'));
  assert.equal((await parsers.extract(write('unicode.txt',Buffer.concat([Buffer.from([255,254]),Buffer.from('हिंदी स्रोत','utf16le')])))).text,'हिंदी स्रोत');
  const image=write('diagram.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF1kAAAAASUVORK5CYII=','base64'));
  assert.equal((await parsers.extract(image,{ocr:async()=>({segments:[{text:'Invoice total 560'}]})})).text,'Invoice total 560');
  const metadata=await parsers.extract(image,{ocr:async()=>{throw Error('OCR unavailable');}});assert.equal(metadata.extraction,'metadata');assert(metadata.text.includes('have not been interpreted'));assert(metadata.warnings.some(w=>w.includes('OCR unavailable')));
  await assert.rejects(()=>parsers.extract(write('broken.docx','not a zip')));await assert.rejects(()=>parsers.extract(write('broken.png','not an image')));await assert.rejects(()=>parsers.extract(write('legacy.doc','not supported')));
  const file=path.resolve('src/main/rag-engine.js'),mod={exports:{}};new Function('require','module','exports',fs.readFileSync(file,'utf8'))(name=>name==='electron'?{app:{getPath:()=>root}}:require(name.startsWith('./')?path.resolve('src/main',name):name),mod,mod.exports);
  const rag=mod.exports;const result=await rag.addSources([docx,pptx,xlsx]);assert(result.success);assert((await rag.searchKnowledge('हिंदी दस्तावेज़',{sourcePaths:[docx]})).results.some(r=>r.fileName==='report.docx'));
  assert((await rag.searchKnowledge('milestone',{sourcePaths:[pptx]})).results.some(r=>r.slideNumber===2));assert((await rag.searchKnowledge('Revenue',{sourcePaths:[xlsx]})).results.some(r=>r.sheetName==='Revenue'));
  assert((await rag.readEvidence(docx)).content.includes('Aurora'));const noChange=await rag.refreshChangedFiles();assert.equal(noChange.updated,0);
  if(process.platform==='win32'){
   const target=path.join(root,'ocr.png'),jpg=path.join(root,'ocr.jpg'),script="$ProgressPreference='SilentlyContinue'; Add-Type -AssemblyName System.Drawing; $image=New-Object Drawing.Bitmap 800,180; $g=[Drawing.Graphics]::FromImage($image); $g.Clear([Drawing.Color]::White); $font=New-Object Drawing.Font 'Arial',36; $g.DrawString('Invoice total 560',$font,[Drawing.Brushes]::Black,20,50); $image.Save('"+target.replace(/'/g,"''")+"',[Drawing.Imaging.ImageFormat]::Png); $image.Save('"+jpg.replace(/'/g,"''")+"',[Drawing.Imaging.ImageFormat]::Jpeg); $font.Dispose(); $g.Dispose(); $image.Dispose()";
   execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:15000});
   const recognized=await parsers.windowsOcr(target);assert(recognized.segments.some(s=>s.text.includes('560')),'Windows OCR failed its actual image fixture');
   const scanned=write('scan.pdf',scannedPdf(fs.readFileSync(jpg)));const recognizedPdf=await parsers.extract(scanned);assert(recognizedPdf.segments.some(s=>s.pageNumber===1&&s.extraction==='ocr'&&s.text.includes('560')),'Scanned PDF did not render into offline OCR');
  }
  console.log('PASS: Office/OpenDocument/RTF/Unicode extraction, real Windows OCR, safe failures, location-aware scoped retrieval and incremental updates.');
 }finally{if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('brown-formats-'))throw Error('Unexpected fixture cleanup target');fs.rmSync(root,{recursive:true,force:true});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
