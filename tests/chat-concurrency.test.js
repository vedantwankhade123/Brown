const assert=require('node:assert/strict');
const {create,concurrency}=require('../src/renderer/chat-jobs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const high={totalGB:64,freeGB:48,cpuCores:16,gpuVramGB:24,cpu:10};
const payload={provider:'ollama',model:'local',modelSize:2*1024**3};
(async()=>{
 assert.equal(concurrency({}),1);
 assert.equal(concurrency({totalGB:8}),1);
 assert.equal(concurrency({totalGB:16}),2);
 assert.equal(concurrency({totalGB:32}),3);
 assert.equal(concurrency({...high,totalGB:32}),4);
 assert.equal(concurrency(high),5);
 assert.equal(concurrency({...high,cpuOnly:true}),3);
 assert.equal(concurrency({...high,maxConcurrent:2}),2);
 assert.equal(concurrency({...high,maxConcurrent:99}),5);
 let metrics={...high};const gates=new Map();
 const q=create({resources:async()=>metrics,execute:job=>new Promise(resolve=>gates.set(job.id,resolve)),pollMs:100000});
 for(let i=0;i<7;i++)q.submit({id:String(i),sessionId:String(i),payload:{...payload}});
 await tick();assert.equal(gates.size,5);assert.equal(q.get('5').state,'queued');
 q.cancel('1');await tick();assert.equal(q.get('5').state,'running');assert.equal(q.get('6').state,'queued');
 gates.get('0')({text:'done'});await tick();assert.equal(q.get('6').state,'running');
 assert.throws(()=>q.submit({id:'6',sessionId:'other',payload}),/Duplicate/);
 q.dispose();assert.throws(()=>q.submit({id:'new',sessionId:'new',payload}),/closed/);
 // Starting jobs reserve against the same free-memory sample.
 const reserved=create({resources:async()=>({...high,freeGB:4}),execute:()=>new Promise(()=>{}),pollMs:100000});
 for(let i=0;i<3;i++)reserved.submit({id:String(i),sessionId:String(i),payload:{...payload}});
 await tick();assert.equal(reserved.list().filter(j=>j.state==='running').length,1);reserved.dispose();
 // A blocked local job does not starve cloud requests; cloud stays capped at two.
 const cloud=create({resources:async()=>({totalGB:8,freeGB:2}),execute:()=>new Promise(()=>{}),pollMs:100000});
 for(let i=0;i<2;i++)cloud.submit({id:'l'+i,sessionId:'l'+i,payload:{...payload}});
 for(let i=0;i<3;i++)cloud.submit({id:'c'+i,sessionId:'c'+i,payload:{provider:'openai',model:'remote'}});
 await tick();assert.equal(cloud.get('l1').state,'queued');assert.equal(cloud.get('c0').state,'running');assert.equal(cloud.get('c1').state,'running');assert.equal(cloud.get('c2').state,'queued');cloud.dispose();
 // Missing/broken telemetry falls back to one local slot and queues expire.
 const broken=create({resources:async()=>{throw Error('offline');},execute:()=>new Promise(()=>{}),queueTimeoutMs:20,pollMs:100000});
 broken.submit({id:'a',sessionId:'a',payload});broken.submit({id:'b',sessionId:'b',payload});await tick();assert.equal(broken.get('a').state,'running');await new Promise(resolve=>setTimeout(resolve,35));assert.equal(broken.get('b').state,'failed');assert.match(broken.get('b').result.text,/waited too long/);broken.dispose();
 let attempts=0;
 const busy=create({resources:async()=>high,execute:async()=>{attempts++;throw Error('HTTP 503 server busy');},runtimeBackoffMs:5,pollMs:100000});
 busy.submit({id:'busy',sessionId:'busy',payload});await tick();assert.equal(busy.get('busy').state,'queued');assert.match(busy.get('busy').reason,/service/);await new Promise(resolve=>setTimeout(resolve,10));await busy.wake();await tick();assert.equal(attempts,2);assert.equal(busy.get('busy').state,'failed');busy.dispose();
 console.log('PASS: hardware tiers, five-slot ceiling, FIFO refill, user caps, memory reservations, cloud isolation, telemetry fallback and bounded queue waits.');
})().catch(error=>{console.error(error);process.exitCode=1;});
