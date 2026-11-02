const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../src/renderer/renderer.js'), 'utf8');
async function run() {
  let calls = [], resolveRequest;
  const c = vm.createContext({console, Date, extractPlainTextFromMessage: text => String(text),
    isThinkingMarkup: () => false, isGenericOrFragmentTitle: () => false,
    conversationsStore: { a: {id:'a',title:'Old title',titleLocked:true,messages:[{isAi:false,text:'First topic'},{isAi:true,text:'First answer'}]} },
    currentSessionId:'a', isAwaitingResponse:false, window:{}, renderSessionPanel(){},
    touchSession(){}, saveConversationsToDisk(){}, updateSessionTitle(){},logTrace(){},
    scheduleAiSessionMeta(){},
    queryOfflineLLM: async (prompt, history, intent, system) => {
      calls.push(prompt);
      if (resolveRequest) return await new Promise(resolve => { resolveRequest = resolve; });
      return system.startsWith('Summarize this portion') ? 'A summary of the portion.' : JSON.stringify({title:'Whole Chat',description:'The conversation covers its topics and resulting decisions.'});
    }
  });
  vm.runInContext(source.slice(source.indexOf('const _aiSessionMetaInFlight ='), source.indexOf('function normalizeConversationStore(')),c);
  await c.generateAiSessionMeta('a');
  assert(c.isSessionMetaFresh(c.conversationsStore.a));
  assert.equal(c.conversationsStore.a.aiMeta.title,'Whole Chat');
  assert.equal(c.conversationsStore.a.title,'Old title','manually renamed chat stays intact');
  const stamp=c.conversationsStore.a.aiMeta.ts;
  await c.generateAiSessionMeta('a');assert.equal(calls.length,1,'unchanged revisit reuses summary');
  assert.equal(c.conversationsStore.a.aiMeta.ts,stamp);
  c.conversationsStore.a.messages[1].text='Edited answer';
  assert(!c.isSessionMetaFresh(c.conversationsStore.a),'same-count edits invalidate summary');
  await c.generateAiSessionMeta('a');assert.equal(calls.length,2);
  const previous=c.conversationsStore.a.aiMeta;
  c.conversationsStore.a.messages[1].text='A new revision';
  resolveRequest=true;
  const pending=c.generateAiSessionMeta('a');
  c.conversationsStore.a.messages[1].text='Changed while summarizing';
  resolveRequest(JSON.stringify({title:'Stale result',description:'This result must not replace newer conversation content.'}));
  await pending;
  assert.equal(c.conversationsStore.a.aiMeta,previous,'in-flight stale result cannot overwrite saved summary');
  resolveRequest=null;
  const long={messages:Array.from({length:60},(_,i)=>({isAi:i%2===1,text:`TURN${i} `+'conversation '.repeat(30)}))};
  const digest=c.buildSessionMetaDigest(long);
  assert(digest.indexOf('TURN0 ')<digest.indexOf('TURN59 '));
  calls=[];await c.querySessionMetaFromHistory(digest,'Final card');
  assert(calls.some(text=>text.includes('TURN0 ')) && calls.some(text=>text.includes('TURN59 ')), 'old and new conversation content reaches summarizer');
  assert(calls.every(text=>text.length<6100),'long histories use bounded inputs');
  console.log('PASS: summary freshness, same-count edits, saved timestamps, full ordered history, long-chat chunking and custom titles.');
}
if(require.main===module)run().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={run};
