const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const ragEngine = require('../src/main/rag-engine');
const { UltronMultiProviderHub } = require('../src/agent/multi-provider-hub');
const desktopSync = require('../src/main/desktop-sync-server');

async function runPhase2Tests() {
  console.log('Running Multi-Provider Hub tests...');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('gpt-4o'), 'openai');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('o3-mini'), 'openai');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('claude-3-7-sonnet-20250219'), 'anthropic');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('claude-3-5-haiku-20241022'), 'anthropic');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('deepseek-reasoner'), 'deepseek');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('deepseek-chat'), 'deepseek');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('llama-3.3-70b-versatile'), 'groq');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('deepseek-r1-distill-llama-70b'), 'groq');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('hf.co/bartowski/Llama-3.2-1B-Instruct-GGUF:Q4_K_M'), 'huggingface');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('phi3:latest'), 'ollama');
  assert.strictEqual(UltronMultiProviderHub.detectProviderForModel('mistral:latest'), 'ollama');
  console.log('✓ Multi-Provider Hub detection passed.');

  console.log('Running Hugging Face Hub Provider tests...');
  const { searchHuggingFaceGgufModels } = require('../src/main/huggingface-service');
  const hfResults = await searchHuggingFaceGgufModels('llama', 2);
  assert.ok(Array.isArray(hfResults));
  console.log('✓ Hugging Face Hub Provider tests passed.');

  console.log('Running Local Vector RAG Engine tests...');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ultron-rag-test-'));
  const testFilePath = path.join(tmpDir, 'project_architecture.md');
  fs.writeFileSync(testFilePath, `
# Ultron Architecture Document
Ultron is an autonomous desktop AI agent for Windows with local Ollama support.
It features a full duplex voice pipeline with VAD interruption and Kokoro neural speech synthesis.
The local vector RAG engine chunks markdown files and calculates cosine similarity across term frequencies.
Database connection strings and secure API keys are stored in encrypted application data.
`);

  await ragEngine.clearIndex();

  const addRes = await ragEngine.addSources([tmpDir]);
  assert.strictEqual(addRes.success, true);
  assert.strictEqual(addRes.sources.length, 1);

  const reindexRes = await ragEngine.reindexAll();
  assert.strictEqual(reindexRes.success, true);
  assert.ok(reindexRes.totalChunks > 0, 'Should have indexed at least 1 vector chunk');

  const searchRes = await ragEngine.searchKnowledge('How does the local vector RAG engine work and calculate similarity?', 2);
  assert.strictEqual(searchRes.success, true);
  assert.ok(searchRes.results.length > 0, 'Should find matching chunks');
  assert.ok(searchRes.results[0].score > 0.05, 'Top match score should be > 0.05');
  assert.ok(searchRes.results[0].snippet.includes('cosine similarity'), 'Snippet should contain relevant text');

  await ragEngine.clearIndex();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✓ Local Vector RAG Engine tests passed.');

  console.log('Running Desktop Sync & Companion Hub tests...');
  const pairCodeRes = desktopSync.createDesktopPairCode();
  assert.strictEqual(pairCodeRes.success, true);
  assert.strictEqual(pairCodeRes.code.length, 4);
  assert.ok(pairCodeRes.expiresIn <= 60);

  const initialDevices = desktopSync.listPairedDevices();
  assert.ok(Array.isArray(initialDevices));
  console.log('✓ Desktop Sync & Companion Hub tests passed.');
}

module.exports = { runPhase2Tests };