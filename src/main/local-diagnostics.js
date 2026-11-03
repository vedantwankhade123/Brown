const os=require('os');
const fields=['temperature','num_ctx','num_predict','repeat_penalty','repeat_last_n'];
function cleanEvent(input={}){
 if(!input||typeof input!=='object')input={};
 const result={timestamp:typeof input.timestamp==='string'&&/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(input.timestamp)&&Number.isFinite(Date.parse(input.timestamp))?input.timestamp:new Date().toISOString()};
 for(const key of ['model','purpose','status','code'])if(typeof input[key]==='string'&&/^[\w.:/-]{1,160}$/.test(input[key]))result[key]=input[key];
 for(const key of ['loadMs','promptMs','generationMs','durationMs','tokens','httpStatus'])if(Number.isFinite(input[key])&&input[key]>=0)result[key]=input[key];
 result.settings={};for(const key of fields)if(Number.isFinite(input.settings?.[key]))result.settings[key]=input.settings[key];
 if(typeof input.thinking==='boolean'||['model-default','low','medium','high'].includes(input.thinking))result.thinking=input.thinking;
 return result;
}
function redact(value){return String(value).replace(/\bBearer\s+[^\s"']+/gi,'Bearer [REDACTED]').replace(/\bsk-[a-zA-Z0-9_-]{10,}/g,'[REDACTED]').replace(/\b(api[_ -]?key|password|secret|access[_ -]?token)\s*[:=]\s*[^\s,;]+/gi,'$1=[REDACTED]');}
function buildReport({version,electronVersion,environment,runtime,events=[],includeContent=false,messages=[]}){
 const report={schemaVersion:1,createdAt:new Date().toISOString(),privacy:{localOnly:true,includesConversation:includeContent===true,rawConfigurationIncluded:false,contentRedaction:includeContent?'best-effort; review before sharing':'not applicable'},app:{version,electronVersion,environment},system:{platform:os.platform(),arch:os.arch(),release:os.release(),memoryGB:Math.round(os.totalmem()/1024**3),freeMemoryGB:Math.round(os.freemem()/1024**3)},runtime,events:events.slice(-100).map(cleanEvent)};
 if(includeContent===true)report.conversation=(Array.isArray(messages)?messages:[]).slice(-100).filter(m=>m&&['user','assistant'].includes(m.role)&&typeof m.content==='string').map(m=>({role:m.role,content:redact(m.content).slice(0,20000)}));
 return report;
}
async function runtimeSnapshot(fetchImpl=fetch){
 const get=async route=>{try{const response=await fetchImpl('http://127.0.0.1:11434/api/'+route,{signal:AbortSignal.timeout(2000)});if(!response.ok)throw Error();return await response.json();}catch{return null;}};
 const [version,loaded,tags]=await Promise.all(['version','ps','tags'].map(get));
 const models=items=>(Array.isArray(items)?items:[]).slice(0,100).filter(m=>m&&typeof m==='object').map(m=>({name:String(m.name||'').slice(0,160),digest:String(m.digest||'').slice(0,100),size:Number.isFinite(m.size)?m.size:undefined,sizeVram:Number.isFinite(m.size_vram)?m.size_vram:undefined,capabilities:Array.isArray(m.capabilities)?m.capabilities.filter(v=>typeof v==='string').slice(0,10):[]}));
 return {endpoint:'http://127.0.0.1:11434',reachable:Boolean(version||loaded||tags),version:version?.version||null,loadedModels:models(loaded?.models),installedModels:models(tags?.models)};
}
module.exports={cleanEvent,buildReport,runtimeSnapshot};
