const assert = require('node:assert/strict');
const { saveSelection, resume } = require('../src/renderer/onboarding-setup');
async function run() {
 const data = new Map(), calls = [], activity = [];
 const storage = { getItem: key => data.get(key), setItem: (k,v) => data.set(k,v), removeItem: k => data.delete(k) };
 let offline = true, installFails = false;
 const api = {
  queueOnboardingActivities: jobs => activity.push([...jobs]),
  checkOllamaInstalled: async () => ({ installed: false }),
  installOllama: async () => { calls.push('ollama'); return { success: !installFails }; },
  checkHuggingFaceSetup: async () => { calls.push('hf'); return { reachable: !offline }; },
 };
 const voices = { downloadAfterSetup: async choice => { calls.push(choice.id); } };
 saveSelection({ voice: { enabled: true, id: 'af_heart' }, ollama: true, huggingFace: true }, storage);
 assert.equal(calls.length, 0, 'Selection never starts installation');
 const task = resume({api,storage,voices}); assert.equal(resume({api,storage,voices}), task);
 await task;
 assert.deepEqual(activity[0], ['voice','ollama','hf']);
 assert.deepEqual(calls.sort(), ['af_heart','hf','ollama']);
 assert.deepEqual(JSON.parse(data.get('ultron-pending-setup-jobs')), [{ id:'hf' }]);
 offline = false; calls.length = 0;
 await resume({api,storage,voices}); assert.deepEqual(calls, ['hf']); assert.equal(data.size, 0);
 calls.length = 0;
 saveSelection({ voice: { enabled:false }, ollama:false, huggingFace:false }, storage);
 await resume({api,storage,voices}); assert.equal(calls.length, 0);
 installFails = true;
 saveSelection({ voice: { enabled:false }, ollama:true, huggingFace:false }, storage);
 await resume({api,storage,voices}); assert.deepEqual(JSON.parse(data.get('ultron-pending-setup-jobs')), [{id:'ollama'}]);
 console.log('PASS: selected setup jobs wait for Finish, queue together, deduplicate, fail independently, persist retries, and respect opt-outs');
}
module.exports = { run };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode=1; });
