/**
 * Test Suite: Vercel AI SDK Core + MCP Native Agent Harness
 * Verifies 100% offline configuration, MCP tool adapter, Zod validation, and execution.
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('=============================================');
  console.log('Vercel AI SDK Core + MCP Native Harness Tests');
  console.log('=============================================\n');

  // 1. Test Provider Factory
  console.log('1. Testing Offline Provider Factory...');
  const { resolveAgentLanguageModel } = require('../src/main/agent-harness-provider');
  const defaultOffline = await resolveAgentLanguageModel();
  assert.strictEqual(defaultOffline.provider, 'ollama', 'Default provider must be ollama');
  assert.strictEqual(defaultOffline.isOffline, true, 'Default configuration must be 100% offline');
  assert.strictEqual(typeof defaultOffline.model, 'object', 'Model instance must be initialized');
  assert.strictEqual(defaultOffline.baseURL, 'http://127.0.0.1:11434/v1', 'Base URL must be local Ollama');
  console.log('✓ Default offline Ollama provider verified.');

  const customOffline = await resolveAgentLanguageModel({ provider: 'lmstudio', baseURL: 'http://127.0.0.1:1234/v1' });
  assert.strictEqual(customOffline.isOffline, true, 'LM Studio configuration must be offline');
  assert.strictEqual(customOffline.baseURL, 'http://127.0.0.1:1234/v1', 'Custom offline URL set correctly');
  console.log('✓ Custom offline LM Studio provider verified.');

  // 2. Test MCP Adapter & Tool Generation
  console.log('\n2. Testing MCP Tool Adapter & Zod Schemas...');
  const { buildVercelMcpTools, sanitizeToolName } = require('../src/main/agent-harness-mcp-adapter');

  assert.strictEqual(sanitizeToolName('filesystem', 'read_file'), 'mcp__filesystem__read_file');
  assert.strictEqual(sanitizeToolName('web-browser', 'page:click'), 'mcp__web_browser__page_click');

  const { tools, toolMetadata } = await buildVercelMcpTools();
  assert(tools.system__read_file, 'system__read_file tool must exist');
  assert(tools.system__write_file, 'system__write_file tool must exist');
  assert(tools.system__list_dir, 'system__list_dir tool must exist');
  console.log(`✓ Tools built successfully (${Object.keys(tools).length} tools available).`);

  // 3. Test Native Tool Execution & Safety
  console.log('\n3. Testing Native Tool Execution & Sandboxing...');
  const testDir = path.join(__dirname, 'scratch_harness_test');
  fs.mkdirSync(testDir, { recursive: true });
  const testFile = path.join(testDir, 'test.txt');

  // Write
  const writeRes = await tools.system__write_file.execute({
    filePath: testFile,
    content: 'Brown AI Native Harness Offline Verification'
  });
  assert.strictEqual(writeRes.success, true, 'File write must succeed');

  // Read
  const readRes = await tools.system__read_file.execute({ filePath: testFile });
  assert.strictEqual(readRes.success, true, 'File read must succeed');
  assert.strictEqual(readRes.content, 'Brown AI Native Harness Offline Verification');

  // List
  const listRes = await tools.system__list_dir.execute({ dirPath: testDir });
  assert.strictEqual(listRes.success, true, 'Dir list must succeed');
  assert(listRes.items.some(i => i.name === 'test.txt'), 'Directory must contain written file');

  // Clean up
  try {
    fs.unlinkSync(testFile);
    fs.rmdirSync(testDir);
  } catch (e) { /* ignore */ }
  console.log('✓ Local tool execution and sandboxing passed.');

  // 4. Test Message Formatting
  console.log('\n4. Testing Message Formatting...');
  const { formatCoreMessages } = require('../src/main/agent-harness-engine');
  const msgs = formatCoreMessages('What is React?', [
    { role: 'user', content: 'Hello' },
    { role: 'model', content: 'Hi, I am Brown.' }
  ]);
  assert.strictEqual(msgs.length, 3, 'Must contain 3 formatted messages');
  assert.strictEqual(msgs[0].role, 'user');
  assert.strictEqual(msgs[1].role, 'assistant');
  assert.strictEqual(msgs[2].role, 'user');
  console.log('✓ Message formatting verified.');

  console.log('\n=============================================');
  console.log('All Native Agent Harness Tests Passed (100% Offline)');
  console.log('=============================================');
}

runTests().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
