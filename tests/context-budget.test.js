const assert=require('node:assert/strict');
const budget=require('../src/renderer/context-budget');
const context=require('../src/renderer/conversation-context');
const {createLedger}=require('../src/renderer/execution-ledger');

// --- Section A: deterministic budgeter -------------------------------------
(() => {
  // usable() prefers verified model metadata and falls back conservatively.
  const model=budget.usable(8192);
  assert.equal(model.source,'model');assert.equal(model.tokens,8192);
  assert.equal(model.usableTokens,8192-budget.OUTPUT_RESERVE_TOKENS);
  assert.equal(model.chars,Math.floor(model.usableTokens*budget.CHARS_PER_TOKEN));
  const fb=budget.usable(0);
  assert.equal(fb.source,'fallback');assert.equal(fb.tokens,budget.FALLBACK_CONTEXT_TOKENS);
  assert(budget.usable(null).source==='fallback'&&budget.usable(undefined).source==='fallback');
  // A tiny verified window still keeps a 512-token floor so the request is never starved.
  assert.equal(budget.usable(400).usableTokens,512);

  // allocate() admits in priority order, truncates required, omits optional.
  const small=budget.allocate({contextWindowTokens:400,sections:[
    {section:'contract',chars:1000,required:true,reason:'safety first'},
    {section:'request',chars:5000,required:true,reason:'always admitted'},
    {section:'skills',chars:100,required:false,reason:'router-selected'}
  ]});
  assert.equal(small.limit,budget.usable(400).chars);assert.equal(small.source,'model');
  assert(small.allocations[0].included&&!small.allocations[0].truncated);
  assert(small.allocations[1].included&&small.allocations[1].truncated,'required section truncated not dropped');
  assert(/truncated/.test(small.allocations[1].reason));
  assert(!small.allocations[2].included&&/omitted/.test(small.allocations[2].reason),'optional section omitted with reason');
  assert.equal(small.remaining,0);

  // Zero-char section is reported empty, not silently injected.
  const empty=budget.allocate({contextWindowTokens:8192,sections:[{section:'evidence',chars:0}]});
  assert(!empty.allocations[0].included&&/empty/.test(empty.allocations[0].reason));

  // historyBudget caps history at MAX_HISTORY_SHARE and respects reservedChars.
  const shared=budget.historyBudget({contextWindowTokens:8192,reservedChars:1000});
  assert.equal(shared.maxChars,Math.floor(shared.limit*budget.MAX_HISTORY_SHARE),'history capped at half the window');
  const squeezed=budget.historyBudget({contextWindowTokens:8192,reservedChars:shared.limit-756});
  assert.equal(squeezed.maxChars,756,'reserved content shrinks the history budget');
  assert.equal(budget.historyBudget({contextWindowTokens:0}).source,'fallback');
})();

// --- Section B: traceable history selection --------------------------------
(() => {
  // Long chat under a small budget: recent turns admitted, older turns omitted.
  const long=Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',text:`Turn ${i} discusses the deployment pipeline with enough words to be meaningful.`}));
  const trace=[];const picked=context.history(long,'summarize the discussion',{maxChars:1200,trace});
  assert(picked.length>=1&&picked.length<long.length,'small budget cannot admit every turn');
  const total=picked.reduce((n,m)=>n+m.content.length,0);assert(total<=1200,'history stays within the char budget');
  assert.equal(trace.filter(t=>t.included).length,picked.length);
  assert(trace.filter(t=>!t.included).length>0,'omitted turns are traced, not silently dropped');

  // A correction keeps the original request that produced the rejected answer.
  const corrected=[
    {role:'user',text:'Write a poem about the monsoon rain'},
    {role:'assistant',text:'The rain falls softly on the tin roof, monsoon drums at dusk.'},
    {role:'user',text:'this is not what i asked, try again'}
  ];
  const ct=[];const csel=context.history(corrected,'this is not what i asked, try again',{maxChars:8000,trace:ct});
  assert(csel.some(m=>m.content.includes('Write a poem about the monsoon rain')),'correction preserves the original request');
  assert(ct.some(t=>t.included&&t.reason==='correction-original-request'));

  // A referenced earlier fact is pinned ahead of pure recency. The referenced
  // answer must sit outside the latest-two-turn window to earn its own reason.
  const refs=[
    {role:'user',text:'explain caching'},
    {role:'assistant',text:'An ephemeral cache lives only briefly and then expires.'},
    {role:'user',text:'now tell me about databases'},
    {role:'assistant',text:'Databases store rows, tables and indexes for fast lookup.'},
    {role:'user',text:'what does ephemeral mean'}
  ];
  const rt=[];context.history(refs,'what does ephemeral mean',{maxChars:8000,trace:rt});
  assert(rt.some(t=>t.included&&t.reason==='referenced-artifact'&&t.chars>0),'referenced answer pinned');
  assert(rt.some(t=>t.included&&t.reason==='preceding-request-for-referenced-answer'),'the request behind the referenced answer is kept');

  // A language follow-up keeps the prior assistant answer as context.
  const lang=[
    {role:'user',text:'Write a haiku about autumn'},
    {role:'assistant',text:'Crisp leaves drift downward'}
  ];
  const lsel=context.history(lang,'in hindi please',{maxChars:8000});
  assert.equal(lsel.length,2,'both prior turns admitted for a language follow-up');
  assert(lsel.some(m=>m.role==='assistant'&&m.content.includes('Crisp leaves')));
})();

// --- Section C: ledger stores metadata-only history counts -----------------
(() => {
  const ledger=createLedger({requestId:'r1',sessionId:'s1',provider:'ollama',model:'llama3'});
  ledger.contextBudget({limit:23756,source:'model',allocations:[
    {section:'system-safety-contract',chars:5000,included:true,reason:'safety and response contract reserved first'},
    {section:'conversation-history',chars:0,included:false,reason:'nothing selected'}
  ],historyTrace:[
    {index:0,included:true,excerpted:false},{index:1,included:true,excerpted:true},{index:2,included:false}
  ]});
  const s=ledger.summary();
  assert.equal(s.contextBudget.history.admitted,2);
  assert.equal(s.contextBudget.history.omitted,1);
  assert.equal(s.contextBudget.history.excerpted,1);
  assert.equal(s.contextBudget.allocatedChars,5000,'only included sections count toward allocated chars');
  assert.equal(s.contextBudget.source,'model');
  assert.equal(s.privacy.includesConversation,false);
  // The summary must not leak section reasons or any turn text.
  const json=JSON.stringify(s);
  assert(!json.includes('safety and response contract'),'summary excludes allocation reason prose');
  assert(!json.includes('monsoon')&&!json.includes('ephemeral'));

  // Without a trace the counts stay zero rather than undefined.
  const bare=createLedger({requestId:'r2',sessionId:'s2'});
  bare.contextBudget({limit:1000,source:'fallback',allocations:[]});
  assert.deepEqual(bare.summary().contextBudget.history,{admitted:0,omitted:0,excerpted:0});
})();

console.log('PASS: context budgeter priority/truncation, traceable history selection (recency, correction, reference, language), and metadata-only ledger counts.');
