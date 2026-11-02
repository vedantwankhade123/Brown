// Offline, format-aware extraction. Never decode binary documents as UTF-8.
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const {DOMParser}=require('linkedom');
const TEXT=new Set('.txt .md .markdown .json .jsonl .csv .tsv .js .ts .jsx .tsx .py .html .htm .css .xml .yaml .yml .sql .sh .bat .ps1 .ini .cfg .log .java .go .rs .c .h .cpp .hpp .cs .php .rb .vue .svelte .toml .tex'.split(' '));
const OFFICE=new Set(['.docx','.pptx','.xlsx','.odt','.ods','.odp']);
const IMAGES=new Set(['.png','.jpg','.jpeg','.webp','.bmp','.tif','.tiff','.gif']);
const extensions=new Set([...TEXT,...OFFICE,...IMAGES,'.pdf','.rtf']);
const VERSION=2,MAX_TEXT=2_000_000;
const limitFor=file=>TEXT.has(path.extname(file).toLowerCase())?2_000_000:32_000_000;
const xml=value=>{if(/<!DOCTYPE|<!ENTITY/i.test(value))throw Error('External XML entities are not supported.');return new DOMParser().parseFromString(value,'text/xml');};
const all=(doc,tag)=>Array.from(doc.getElementsByTagName(tag));
const childText=(doc,tag)=>all(doc,tag).map(node=>node.textContent).join('');
function decode(buffer){
 let value;if(buffer[0]===0xff&&buffer[1]===0xfe)value=buffer.subarray(2).toString('utf16le');
 else if(buffer[0]===0xfe&&buffer[1]===0xff){const copy=Buffer.from(buffer.subarray(2));if(copy.length%2)throw Error('Invalid UTF-16 text.');copy.swap16();value=copy.toString('utf16le');}
 else value=buffer.toString('utf8').replace(/^\uFEFF/,'');
 if(value.includes('\0')||(value.match(/\uFFFD/g)||[]).length>Math.max(3,value.length*.01))throw Error('Unrecognized text encoding or binary content. Export this file as UTF-8 text.');return value;
}
async function readZip(buffer){
 const yauzl=require('yauzl');
 return new Promise((resolve,reject)=>yauzl.fromBuffer(buffer,{lazyEntries:true},(error,zip)=>{
  if(error)return reject(error);const entries=new Map();let size=0,count=0,done=false;
  const fail=error=>{if(done)return;done=true;zip.close();reject(error);};zip.on('error',fail);zip.on('end',()=>{if(!done){done=true;resolve(entries);}});
  zip.on('entry',entry=>{
   if(++count>10000)return fail(Error('Document has too many archive entries.'));
   const name=entry.fileName;
   if(!/^(?:word\/(?:document|footnotes|endnotes|header\d+|footer\d+)\.xml|ppt\/slides\/slide\d+\.xml|xl\/(?:workbook|sharedStrings|worksheets\/sheet\d+)\.xml|xl\/_rels\/workbook\.xml\.rels|content\.xml)$/.test(name))return zip.readEntry();
   if(entry.uncompressedSize>8_000_000||(size+=entry.uncompressedSize)>24_000_000)return fail(Error('Expanded document exceeds the safe extraction limit.'));
   zip.openReadStream(entry,(err,stream)=>{if(err)return fail(err);let bytes=0;const parts=[];stream.on('error',fail);stream.on('data',part=>{bytes+=part.length;if(bytes>8_000_000){stream.destroy();fail(Error('Expanded document entry is too large.'));}else parts.push(part);});stream.on('end',()=>{if(done)return;entries.set(name,Buffer.concat(parts).toString('utf8'));zip.readEntry();});});
  });zip.readEntry();
 }));
}
async function office(buffer,ext){
 const entries=await readZip(buffer),segments=[];
 if(ext==='.docx'){
  if(!entries.has('word/document.xml'))throw Error('This is not a valid DOCX document.');
  for(const [name,value] of entries)if(name.startsWith('word/')){const doc=xml(value);const text=all(doc,'w:p').map(p=>all(p,'w:t').map(t=>t.textContent).join('')).filter(Boolean).join('\n');if(text)segments.push({text,location:name});}
 }else if(ext==='.pptx'){
  for(const [name,value] of [...entries].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})))if(name.startsWith('ppt/slides/')){const slideNumber=Number(name.match(/slide(\d+)/)[1]);segments.push({text:all(xml(value),'a:p').map(p=>childText(p,'a:t')).join('\n'),slideNumber});}
 }else if(ext==='.xlsx'){
  const strings=entries.has('xl/sharedStrings.xml')?all(xml(entries.get('xl/sharedStrings.xml')),'si').map(si=>childText(si,'t')):[];
  const relationships=new Map(entries.has('xl/_rels/workbook.xml.rels')?all(xml(entries.get('xl/_rels/workbook.xml.rels')),'Relationship').map(r=>[r.getAttribute('Id'),path.posix.normalize('xl/'+r.getAttribute('Target')).replace(/^xl\/xl\//,'xl/')]):[]);
  const names=new Map(entries.has('xl/workbook.xml')?all(xml(entries.get('xl/workbook.xml')),'sheet').map(s=>[relationships.get(s.getAttribute('r:id')),s.getAttribute('name')]):[]);
  for(const [name,value] of [...entries].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true})))if(name.startsWith('xl/worksheets/')){const sheetNumber=Number(name.match(/sheet(\d+)/)[1]),sheetName=names.get(name)||'Sheet '+sheetNumber;
   const rows=all(xml(value),'row').map(row=>all(row,'c').map(cell=>{const type=cell.getAttribute('t'),raw=childText(cell,'v');const value=type==='s'?strings[Number(raw)]||'':type==='inlineStr'?childText(cell,'t'):raw;return (cell.getAttribute('r')||'cell')+': '+value+(childText(cell,'f')&&!raw?' [Formula has no saved value]':'');}).join(' | ')).join('\n');segments.push({text:sheetName+'\n'+rows,sheetName});}
 }else{
  if(!entries.has('content.xml'))throw Error('This is not a valid OpenDocument file.');const doc=xml(entries.get('content.xml'));
  segments.push({text:Array.from(doc.querySelectorAll('*')).filter(node=>['text:h','text:p'].includes(node.tagName)).map(node=>node.textContent).join('\n')});
 }
 const embedded=[...entries.values()].some(value=>/<(?:w:drawing|p:pic|c:chart|drawing|draw:image|draw:object)\b/.test(value));
 return {segments,extraction:'document-xml',warnings:embedded?['Embedded images, charts and drawing objects are not interpreted by the Office text parser.']:[]};
}
function rtf(buffer){
 // Decode RTF control groups without indexing font tables, pictures or binary objects.
 const source=buffer.toString('latin1'),stack=[];let skip=false,uc=1,fallback=0,out='';
 for(let i=0;i<source.length;i++){
  const c=source[i];if(c==='{'){stack.push({skip,uc});continue;}if(c==='}'){({skip,uc}=stack.pop()||{skip:false,uc:1});continue;}
  if(c!=='\\'){if(fallback)fallback--;else if(!skip&&c!=='\r'&&c!=='\n')out+=c;continue;}
  const rest=source.slice(i+1);if(rest[0]==='*'){skip=true;i++;continue;}if(/[{}\\]/.test(rest[0]||'')){if(!skip)out+=rest[0];i++;continue;}
  const hex=rest.match(/^'([a-f\d]{2})/i);if(hex){if(fallback)fallback--;else if(!skip)out+=new TextDecoder('windows-1252').decode(Uint8Array.of(parseInt(hex[1],16)));i+=3;continue;}
  const token=rest.match(/^([a-z]+)(-?\d+)? ?/i);if(!token){i++;continue;}i+=token[0].length;const word=token[1],value=Number(token[2]);
  if(['fonttbl','colortbl','stylesheet','info','pict','object'].includes(word))skip=true;
  if(word==='bin'){i+=Math.max(0,value);continue;}if(skip)continue;if(word==='uc')uc=Math.max(0,Math.min(8,value));else if(word==='u'){out+=String.fromCharCode(value<0?value+65536:value);fallback=uc;}else if(['par','line','row'].includes(word))out+='\n';else if(['tab','cell'].includes(word))out+='\t';
 }
 return out;
}
function windowsOcr(file,pages=[]){
 if(process.platform!=='win32')return Promise.reject(Error('Offline OCR requires Windows OCR on this build.'));
 // Electron can read this inside app.asar; PowerShell cannot execute an asar path.
 const source=fs.readFileSync(path.join(__dirname,'../../scripts/knowledge-ocr.ps1'),'utf8');
 const selected=pages.filter(value=>Number.isInteger(value)&&value>0&&value<=200).slice(0,12).join(',');
 const command="& {\n"+source+"\n} -InputPath '"+file.replace(/'/g,"''")+"' -Pages '"+selected+"'";
 return new Promise((resolve,reject)=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,timeout:90000,maxBuffer:4_000_000,encoding:'utf8'},(err,stdout,stderr)=>{
  if(err)return reject(Error('Offline OCR failed or timed out: '+String(stderr||err.message).trim().slice(0,350)));
  try{resolve(JSON.parse(stdout.replace(/^\uFEFF/,'').trim()));}catch{reject(Error('Offline OCR returned an invalid result.'));}
 }));
}
async function pdf(buffer,file,ocr){
 // pdf.js' bundled require discovery differs between Node and Electron builds.
 // Supply actual canvas primitives when its automatic polyfill cannot load them.
 if(!globalThis.DOMMatrix||!globalThis.ImageData||!globalThis.Path2D){
  try{const canvas=require('@napi-rs/canvas');for(const key of ['DOMMatrix','ImageData','Path2D'])if(!globalThis[key])globalThis[key]=canvas[key];}catch{/* PDF extraction reports a clear failure if native support is unavailable. */}
 }
 const {PDFParse}=require('pdf-parse'),parser=new PDFParse({data:new Uint8Array(buffer)});let result;
 try{result=await parser.getText({first:200});}finally{await parser.destroy();}
 const pages=(result.pages||[]).map(p=>({text:String(p.text||'').trim(),pageNumber:p.num||p.pageNumber})),missing=pages.filter(p=>!p.text),warnings=[];
 if(result.total>200)warnings.push('Only the first 200 PDF pages were extracted.');
 if(missing.length||!pages.length){
  try{const recognized=await ocr(file,missing.slice(0,12).map(p=>p.pageNumber).filter(Boolean));for(const p of recognized.segments||[]){const old=pages.find(x=>x.pageNumber===p.pageNumber);if(old)Object.assign(old,p,{extraction:'ocr'});else pages.push({...p,extraction:'ocr'});}warnings.push(...(recognized.warnings||[]));}
  catch(error){warnings.push(error.message);}
  if(missing.length>12)warnings.push('Only 12 scanned pages were processed by OCR in this pass.');
 }
 return {segments:pages.filter(p=>p.text).sort((a,b)=>a.pageNumber-b.pageNumber),extraction:'pdf-text',warnings};
}
async function extract(file,{ocr=windowsOcr}={}){
 const ext=path.extname(file).toLowerCase();if(!extensions.has(ext))throw Error('Unsupported format. Convert it to a supported document or text format.');
 const stat=await fs.promises.stat(file);if(!stat.isFile()||stat.size>limitFor(file))throw Error('File exceeds the '+Math.round(limitFor(file)/1e6)+' MB '+(TEXT.has(ext)?'text':'document/image')+' indexing limit.');
 const buffer=await fs.promises.readFile(file);let result;
 if(OFFICE.has(ext))result=await office(buffer,ext);
 else if(ext==='.pdf')result=await pdf(buffer,file,ocr);
 else if(IMAGES.has(ext)){
  const valid=ext==='.png'?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):['.jpg','.jpeg'].includes(ext)?buffer[0]===255&&buffer[1]===216:ext==='.webp'?buffer.toString('ascii',0,4)==='RIFF'&&buffer.toString('ascii',8,12)==='WEBP':ext==='.bmp'?buffer.toString('ascii',0,2)==='BM':['.tif','.tiff'].includes(ext)?['II*\0','MM\0*'].includes(buffer.toString('latin1',0,4)):buffer.toString('ascii',0,3)==='GIF';
  if(!valid)throw Error('Invalid or damaged image file. Its content does not match its file format.');
  try{result={...await ocr(file),extraction:'ocr',kind:'image'};}catch(error){result={segments:[],warnings:[error.message],extraction:'metadata',kind:'image'};}
  if(!result.segments?.some(s=>s.text?.trim())){result.segments=[{text:'Image file: '+path.basename(file)+'\nNo readable text was extracted. Visual contents have not been interpreted.'}];result.extraction='metadata';result.warnings=[...(result.warnings||[]),'Image indexed by filename only; select a local vision model and mention this file to inspect its contents.'];}
 }else if(ext==='.rtf')result={segments:[{text:rtf(buffer)}],extraction:'rtf'};
 else{let text=decode(buffer);if(['.html','.htm'].includes(ext)){const doc=new DOMParser().parseFromString(text,'text/html');doc.querySelectorAll('script,style,noscript').forEach(n=>n.remove());text=doc.body.textContent||doc.documentElement.textContent;}result={segments:[{text}],extraction:'text'};}
 let remaining=MAX_TEXT;const segments=[];for(const segment of result.segments||[]){const text=String(segment.text||'').trim();if(!text)continue;if(remaining<=0)break;segments.push({...segment,text:text.slice(0,remaining)});remaining-=text.length;}
 if(remaining<0)result.warnings=[...(result.warnings||[]),'Extracted text was capped at 2 million characters.'];
 return {...result,segments,text:segments.map(s=>(s.pageNumber?'[Page '+s.pageNumber+']\n':s.slideNumber?'[Slide '+s.slideNumber+']\n':'')+s.text).join('\n\n')};
}
module.exports={extract,extensions,limitFor,IMAGES,VERSION,windowsOcr};
