/**
 * Verification test for the new context platform components:
 * 1. Agent Entity Tracker — entity registration, ordinal resolution, anaphora
 * 2. Agent Memory (new subsystems) — conversation state, tool exec, search, summary, durable, historical
 * 3. Agent Context Engine — 8-layer context builder, token budgeting, entity resolution
 * 4. RAG Engine — structure-aware chunking, BM25 hybrid retrieval
 */

const assert = require('assert');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.log(`✗ ${name}: ${e.message}`);
    failed++;
  }
}

// ═══════════════════════════════════════════
// Mock browser environment for IIFE modules
// ═══════════════════════════════════════════
const storage = {};
global.window = {
  localStorage: {
    getItem: (k) => storage[k] || null,
    setItem: (k, v) => { storage[k] = String(v); },
    removeItem: (k) => { delete storage[k]; }
  },
  currentSessionId: 'test-session-1',
  dispatchEvent: () => {},
  CustomEvent: class CustomEvent { constructor(type, opts) { this.type = type; this.detail = opts?.detail; } },
  conversationsStore: {
    'test-session-1': {
      messages: [
        { text: 'Find me the best restaurants in Tokyo', isAi: false },
        { text: '1. **Sushi Dai** - Located in Tsukiji, rated 4.8/5\n2. **Narisawa** - Modern Japanese, rated 4.7 stars\n3. **Den** - Creative kaiseki, $$$$\n4. **Gonpachi** - Known for yakitori, rated 4.5/5', isAi: true },
        { text: 'Tell me more about the second one', isAi: false },
        { text: 'Narisawa is a world-renowned restaurant by chef Yoshihiro Narisawa...', isAi: true },
        { text: 'Compare it with the third one', isAi: false },
        { text: 'Let me compare Narisawa and Den for you...', isAi: true },
        { text: 'What laptops are good for programming?', isAi: false },
        { text: '1. **MacBook Pro M3** - Best for macOS, 18h battery\n2. **ThinkPad X1 Carbon** - Excellent keyboard, Linux friendly\n3. **Framework Laptop 16** - Fully modular, upgradeable', isAi: true },
        { text: 'What is the weather today?', isAi: false },
        { text: 'The weather in your area is partly cloudy with a high of 28°C.', isAi: true },
        { text: 'Go back to the laptops', isAi: false },
        { text: 'Sure! Here are the laptops we discussed earlier...', isAi: true },
        { text: 'Open Chrome for me', isAi: false },
        { text: 'Opening Google Chrome...', isAi: true }
      ]
    }
  }
};

// ═══════════════════════════════════════════
// Test 1: Agent Entity Tracker
// ═══════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
console.log('Test Suite: Agent Entity Tracker');
console.log('═══════════════════════════════════════════\n');

require('../src/agent/agent-entity-tracker.js');
const tracker = window.UltronEntityTracker;

test('Entity tracker module loads', () => {
  assert(tracker, 'UltronEntityTracker should be defined');
  assert(typeof tracker.registerEntity === 'function');
  assert(typeof tracker.setCandidates === 'function');
  assert(typeof tracker.resolveReferences === 'function');
  assert(typeof tracker.extractEntitiesFromText === 'function');
});

test('Register individual entity', () => {
  const ent = tracker.registerEntity('test-session-1', {
    name: 'Sushi Dai',
    type: 'restaurant',
    ordinal: 1,
    summary: 'Located in Tsukiji, rated 4.8/5'
  });
  assert(ent, 'Should return registered entity');
  assert(ent.name === 'Sushi Dai');
  assert(ent.type === 'restaurant');
  assert(ent.ordinal === 1);
});

test('Set candidates from list', () => {
  const candidates = tracker.setCandidates('test-session-1', [
    { name: 'Sushi Dai', summary: 'Located in Tsukiji, rated 4.8/5' },
    { name: 'Narisawa', summary: 'Modern Japanese, rated 4.7 stars' },
    { name: 'Den', summary: 'Creative kaiseki, $$$$' },
    { name: 'Gonpachi', summary: 'Known for yakitori, rated 4.5/5' }
  ], 'restaurant');
  assert(candidates.length === 4, `Expected 4 candidates, got ${candidates.length}`);
  assert(candidates[0].ordinal === 1);
  assert(candidates[1].ordinal === 2);
  assert(candidates[2].ordinal === 3);
});

test('Resolve ordinal "the second one"', () => {
  const result = tracker.resolveReferences('test-session-1', 'Tell me more about the second one');
  assert(result.resolved === true, 'Should resolve');
  assert(result.entities.length >= 1, 'Should find at least one entity');
  assert(result.entities[0].name === 'Narisawa', `Expected Narisawa, got ${result.entities[0].name}`);
});

test('Resolve ordinal "#3"', () => {
  const result = tracker.resolveReferences('test-session-1', 'What about #3?');
  assert(result.resolved === true, 'Should resolve');
  assert(result.entities.length >= 1);
  assert(result.entities[0].name === 'Den', `Expected Den, got ${result.entities[0].name}`);
});

test('Resolve "the last one"', () => {
  const result = tracker.resolveReferences('test-session-1', 'Tell me about the last one');
  assert(result.resolved === true);
  assert(result.entities[0].name === 'Gonpachi', `Expected Gonpachi, got ${result.entities[0].name}`);
});

test('Resolve anaphora "it"', () => {
  const result = tracker.resolveReferences('test-session-1', 'What is its address?');
  assert(result.resolved === true);
  assert(result.entities.length >= 1);
});

test('Resolve comparative "compare"', () => {
  // Set fresh candidates so there are at least 2
  tracker.setCandidates('test-session-1', [
    { name: 'MacBook Pro', summary: 'Best for macOS' },
    { name: 'ThinkPad X1', summary: 'Excellent keyboard' }
  ], 'product');
  const result = tracker.resolveReferences('test-session-1', 'Compare them');
  assert(result.resolved === true);
  assert(result.entities.length >= 2, `Expected at least 2 entities for comparison, got ${result.entities.length}`);
});

test('Extract entities from numbered list text', () => {
  const text = '1. **Sushi Dai** - Located in Tsukiji\n2. **Narisawa** - Modern Japanese\n3. **Den** - Creative kaiseki';
  const entities = tracker.extractEntitiesFromText('test-session-2', text, 'restaurant');
  assert(entities.length === 3, `Expected 3, got ${entities.length}`);
  assert(entities[0].name === 'Sushi Dai');
  assert(entities[2].name === 'Den');
});

test('Augmented prompt includes entity context', () => {
  tracker.setCandidates('test-session-1', [
    { name: 'Alpha', summary: 'First item' },
    { name: 'Beta', summary: 'Second item' }
  ], 'product');
  const result = tracker.resolveReferences('test-session-1', 'Tell me about the first one');
  assert(result.augmentedPrompt.includes('[Resolved Entity References]'), 'Augmented prompt should contain resolved context');
  assert(result.augmentedPrompt.includes('Alpha'), 'Should reference Alpha');
});

// ═══════════════════════════════════════════
// Test 2: Agent Memory (new subsystems)
// ═══════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
console.log('Test Suite: Agent Memory (New Subsystems)');
console.log('═══════════════════════════════════════════\n');

require('../src/agent/agent-memory.js');
const memory = window.UltronAgentMemory;

test('Memory module loads with new functions', () => {
  assert(memory, 'UltronAgentMemory should be defined');
  assert(typeof memory.saveConversationState === 'function', 'Missing saveConversationState');
  assert(typeof memory.getConversationState === 'function', 'Missing getConversationState');
  assert(typeof memory.saveToolExecution === 'function', 'Missing saveToolExecution');
  assert(typeof memory.getToolExecutions === 'function', 'Missing getToolExecutions');
  assert(typeof memory.saveSearchResults === 'function', 'Missing saveSearchResults');
  assert(typeof memory.getSearchResults === 'function', 'Missing getSearchResults');
  assert(typeof memory.saveConversationSummary === 'function', 'Missing saveConversationSummary');
  assert(typeof memory.getConversationSummary === 'function', 'Missing getConversationSummary');
  assert(typeof memory.queryHistoricalMessages === 'function', 'Missing queryHistoricalMessages');
  assert(typeof memory.saveDurableMemory === 'function', 'Missing saveDurableMemory');
  assert(typeof memory.queryDurableMemories === 'function', 'Missing queryDurableMemories');
});

test('Conversation state: save and retrieve', () => {
  memory.saveConversationState('test-session-1', 'currentTopic', 'restaurants');
  const val = memory.getConversationState('test-session-1', 'currentTopic');
  assert(val === 'restaurants', `Expected 'restaurants', got '${val}'`);
});

test('Tool execution: save and retrieve', () => {
  memory.saveToolExecution('test-session-1', {
    tool: 'WEB_SEARCH',
    input: 'best restaurants in Tokyo',
    output: 'Found 10 results',
    success: true
  });
  const execs = memory.getToolExecutions('test-session-1', 5);
  assert(execs.length >= 1, 'Should have at least 1 tool execution');
  assert(execs[execs.length - 1].tool === 'WEB_SEARCH');
});

test('Search results: save and retrieve', () => {
  memory.saveSearchResults('test-session-1', {
    query: 'best restaurants in Tokyo',
    results: [
      { title: 'Sushi Dai', url: 'https://example.com/sushi', snippet: 'Famous sushi restaurant' },
      { title: 'Narisawa', url: 'https://example.com/narisawa', snippet: 'Modern Japanese cuisine' }
    ],
    source: 'web'
  });
  const results = memory.getSearchResults('test-session-1', 5);
  assert(results.length >= 1, 'Should have at least 1 search result');
  assert(results[results.length - 1].query === 'best restaurants in Tokyo');
});

test('Conversation summary: save and retrieve', () => {
  memory.saveConversationSummary('test-session-1', 'The user asked about restaurants in Tokyo and then switched to laptops for programming.');
  const summary = memory.getConversationSummary('test-session-1');
  assert(summary, 'Should have a summary');
  assert(summary.text.includes('restaurants'), 'Summary should mention restaurants');
  assert(summary.turnsCovered >= 1);
});

test('Historical message query', () => {
  const results = memory.queryHistoricalMessages('test-session-1', 'restaurant Tokyo', 3);
  assert(results.length >= 1, 'Should find at least 1 matching message');
  assert(results[0].text.includes('restaurant') || results[0].text.includes('Tokyo'), 'Result should be relevant');
});

test('Durable memory: save and query', () => {
  memory.saveDurableMemory('preference', 'User prefers dark mode', { category: 'ui' });
  memory.saveDurableMemory('fact', 'User lives in Mumbai', { category: 'location' });
  const results = memory.queryDurableMemories('dark mode', 5);
  assert(results.length >= 1, 'Should find the dark mode preference');
  assert(results[0].content.includes('dark mode'));
});

test('Durable memory deduplication', () => {
  memory.saveDurableMemory('preference', 'User prefers dark mode', { category: 'ui' });
  memory.saveDurableMemory('preference', 'User prefers dark mode', { category: 'ui' });
  const results = memory.queryDurableMemories('dark mode', 10);
  assert(results.length === 1, `Expected 1 (deduplicated), got ${results.length}`);
});

test('Existing memory functions still work', () => {
  // Test old functions are preserved
  assert(typeof memory.pushTaskMemory === 'function', 'Missing pushTaskMemory');
  assert(typeof memory.loadWorkflows === 'function', 'Missing loadWorkflows');
  assert(typeof memory.registerArtifact === 'function', 'Missing registerArtifact');
  assert(typeof memory.hasAlwaysAllow === 'function', 'Missing hasAlwaysAllow');
  assert(typeof memory.loadUserPreferences === 'function', 'Missing loadUserPreferences');
  assert(typeof memory.getFormattedPreferencesPrompt === 'function', 'Missing getFormattedPreferencesPrompt');

  // Functional test
  memory.pushTaskMemory('Test task entry');
  const snippet = memory.getTaskMemorySnippet(1);
  assert(snippet.includes('Test task entry'), 'Task memory should work');
});

// ═══════════════════════════════════════════
// Test 3: Agent Context Engine
// ═══════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
console.log('Test Suite: Agent Context Engine');
console.log('═══════════════════════════════════════════\n');

require('../src/agent/agent-context-engine.js');
const engine = window.UltronContextEngine;

test('Context engine module loads', () => {
  assert(engine, 'UltronContextEngine should be defined');
  assert(typeof engine.buildContext === 'function');
  assert(typeof engine.processResponse === 'function');
  assert(typeof engine.buildSummaryPrompt === 'function');
  assert(typeof engine.needsSummaryUpdate === 'function');
  assert(typeof engine.estimateTokens === 'function');
});

test('Token estimation is reasonable', () => {
  const tokens = engine.estimateTokens('Hello world, this is a test sentence.');
  assert(tokens > 5, `Expected > 5 tokens, got ${tokens}`);
  assert(tokens < 20, `Expected < 20 tokens, got ${tokens}`);
});

test('Context window detection defaults', () => {
  const small = engine.getContextWindowSize('ollama', 'llama3.2');
  assert(small > 0, 'Should return positive context window');
  const large = engine.getContextWindowSize('openai', 'gpt-4o');
  assert(large >= 131072, `Expected >= 131072 for GPT-4o, got ${large}`);
});

test('buildContext returns layered result', () => {
  // Set up entity candidates for this session
  tracker.setCandidates('test-session-1', [
    { name: 'Sushi Dai', summary: 'Great sushi in Tsukiji' },
    { name: 'Narisawa', summary: 'Modern Japanese fine dining' }
  ], 'restaurant');

  const result = engine.buildContext({
    userPrompt: 'Tell me about the first one',
    sessionId: 'test-session-1',
    provider: 'ollama',
    modelId: 'phi4',
    currentMode: 'chat',
    recentMessages: [
      { role: 'user', content: 'Find restaurants in Tokyo' },
      { role: 'assistant', content: '1. Sushi Dai 2. Narisawa' }
    ]
  });

  assert(result, 'Should return a result');
  assert(result.layers, 'Should have layers');
  assert(result.budget, 'Should have budget info');
  assert(result.budget.contextWindow > 0, 'Context window should be positive');
  assert(result.totalTokenEstimate > 0, 'Should estimate some tokens');
  assert(result.userPromptAugmented, 'Should have augmented prompt');
});

test('buildContext includes system context block with entity candidates', () => {
  tracker.setCandidates('test-session-1', [
    { name: 'Alpha', summary: 'First' },
    { name: 'Beta', summary: 'Second' }
  ], 'product');

  const result = engine.buildContext({
    userPrompt: 'Tell me more about them',
    sessionId: 'test-session-1',
    provider: 'ollama',
    modelId: 'phi4'
  });

  assert(result.systemContextBlock, 'Should have system context block');
  // At minimum, it should include entity candidates or memory layers
  assert(result.systemContextBlock.length > 0, 'System context block should not be empty');
});

test('buildContext resolves entity references', () => {
  tracker.setCandidates('test-session-1', [
    { name: 'AlphaProduct', summary: 'First product' },
    { name: 'BetaProduct', summary: 'Second product' }
  ], 'product');

  const result = engine.buildContext({
    userPrompt: 'Tell me about the second one',
    sessionId: 'test-session-1',
    provider: 'ollama',
    modelId: 'phi4'
  });

  assert(result.resolvedEntities.length >= 1, 'Should resolve at least one entity');
  assert(result.resolvedEntities[0].name === 'BetaProduct', `Expected BetaProduct, got ${result.resolvedEntities[0].name}`);
});

test('buildContext stays within budget', () => {
  const result = engine.buildContext({
    userPrompt: 'A'.repeat(10000), // Big prompt
    sessionId: 'test-session-1',
    provider: 'ollama',
    modelId: 'llama3.2', // 8192 context
    recentMessages: Array(20).fill(null).map((_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'Test message '.repeat(50)
    }))
  });

  assert(result.budget.used <= result.budget.usableBudget,
    `Used ${result.budget.used} exceeds budget ${result.budget.usableBudget}`);
});

test('processResponse extracts entities from numbered lists', () => {
  const entities = engine.processResponse('test-session-3',
    '1. **MacBook Pro** - Great for coding\n2. **ThinkPad X1** - Best keyboard\n3. **Framework 16** - Modular design',
    'product'
  );
  assert(entities.length === 3, `Expected 3 entities, got ${entities.length}`);
});

test('buildSummaryPrompt generates valid prompt', () => {
  const prompt = engine.buildSummaryPrompt([
    { text: 'Find restaurants', isAi: false },
    { text: 'Here are 5 restaurants...', isAi: true }
  ]);
  assert(prompt.includes('Summarize') || prompt.includes('summary'), 'Should contain summarization instruction');
  assert(prompt.includes('restaurant'), 'Should include message content');
});

test('needsSummaryUpdate logic', () => {
  assert(engine.needsSummaryUpdate('test-session-1', 5) === false, 'Should not need summary for short conversations');
  // After saving a summary with turnsCovered, it should track properly
  memory.saveConversationSummary('test-session-need-update', 'Test summary');
  assert(engine.needsSummaryUpdate('test-session-need-update', 25) === true, 'Should need summary for 25-turn conversation after 1 turn summary');
});

// ═══════════════════════════════════════════
// Test 4: RAG Engine (structure-aware chunking + BM25)
// ═══════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
console.log('Test Suite: RAG Engine (Hybrid Retrieval)');
console.log('═══════════════════════════════════════════\n');

const rag = require('../src/main/rag-engine.js');

test('RAG module loads with all expected functions', () => {
  assert(typeof rag.searchKnowledge === 'function');
  assert(typeof rag.addSources === 'function');
  assert(typeof rag.indexTextContent === 'function');
  assert(typeof rag.getStats === 'function');
});

test('Structure-aware indexing: markdown document', async () => {
  const mdContent = `# Introduction

This is the introduction section with important context about the project.

## Architecture

The system uses a layered architecture with 8 context layers.
Each layer is prioritized and token-budgeted.

## Entity Tracking

Entities like restaurants, products, and files are tracked across conversation turns.
Ordinal references (#1, #2, the second one) resolve to tracked entities.

## Memory System

The memory system includes task memory, conversation state, tool executions,
search results, rolling summaries, durable memories, and artifact registries.
`;

  const result = await rag.indexTextContent('test-md-doc', 'architecture.md', mdContent);
  assert(result.success === true, 'Indexing should succeed');
  assert(result.chunksAdded >= 1, `Expected >= 1 chunks, got ${result.chunksAdded}`);
});

test('BM25 hybrid search finds relevant chunks', async () => {
  const searchResult = await rag.searchKnowledge('entity tracking ordinal references');
  assert(searchResult.success === true);
  assert(searchResult.results.length > 0, 'Should find relevant results');
  // The top result should be about entity tracking
  const topResult = searchResult.results[0];
  assert(topResult.text.toLowerCase().includes('entity') || topResult.text.toLowerCase().includes('ordinal'),
    'Top result should be about entity tracking');
  assert(typeof topResult.score === 'number', 'Score should be a number');
  assert(topResult.score > 0, 'Score should be positive');
});

test('BM25 hybrid search returns empty for irrelevant queries', async () => {
  const searchResult = await rag.searchKnowledge('quantum physics black holes');
  assert(searchResult.success === true);
  // Should return 0 or very low-scored results
  if (searchResult.results.length > 0) {
    assert(searchResult.results[0].score < 0.3, 'Irrelevant query should have low scores');
  }
});

test('BM25 hybrid search with topK option', async () => {
  const searchResult = await rag.searchKnowledge('memory system architecture', { topK: 2 });
  assert(searchResult.success === true);
  assert(searchResult.results.length <= 2, `Expected <= 2 results with topK=2, got ${searchResult.results.length}`);
});

// ═══════════════════════════════════════════
// Results
// ═══════════════════════════════════════════
console.log('\n═══════════════════════════════════════════');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All context platform tests passed!\n');
}
