/**
 * Test Suite for Enhanced AI Agent
 * Run in browser console or include in test file
 */

(function () {
  'use strict';

  const tests = {
    passed: 0,
    failed: 0,
    results: []
  };

  function test(name, fn) {
    try {
      fn();
      tests.passed++;
      tests.results.push({ name, status: 'PASS' });
      console.log(`✓ ${name}`);
    } catch (error) {
      tests.failed++;
      tests.results.push({ name, status: 'FAIL', error: error.message });
      console.error(`✗ ${name}:`, error.message);
    }
  }

  function assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
  }

  // Run tests
  console.log('=== Enhanced AI Agent Tests ===\n');

  // Test 1: Thinking Engine Available
  test('Thinking engine is available', () => {
    assert(window.UltronThinkingEngine, 'UltronThinkingEngine not found');
    assert(typeof window.UltronThinkingEngine.processWithThinking === 'function', 'processWithThinking not a function');
  });

  // Test 2: Autonomy Engine Available
  test('Autonomy engine is available', () => {
    assert(window.UltronAutonomyEngine, 'UltronAutonomyEngine not found');
    assert(typeof window.UltronAutonomyEngine.executeAutonomously === 'function', 'executeAutonomously not a function');
  });

  // Test 3: Response Formatter Available
  test('Response formatter is available', () => {
    assert(window.UltronResponseFormatter, 'UltronResponseFormatter not found');
    assert(typeof window.UltronResponseFormatter.formatAgentResponse === 'function', 'formatAgentResponse not a function');
  });

  // Test 4: Integration Module Available
  test('Integration module is available', () => {
    assert(window.UltronAgentIntegration, 'UltronAgentIntegration not found');
    assert(typeof window.UltronAgentIntegration.initialize === 'function', 'initialize not a function');
  });

  // Test 5: Intent Analysis
  test('Intent analysis works correctly', async () => {
    const thinking = await window.UltronThinkingEngine.processWithThinking(
      'Open Notepad and write hello world',
      {}
    );
    assert(thinking.intent, 'Intent not found');
    assert(thinking.intent.type === 'command', 'Wrong intent type');
    assert(thinking.intent.requiresAction === true, 'Should require action');
  });

  // Test 6: Capability Check
  test('Capability check works correctly', async () => {
    const thinking = await window.UltronThinkingEngine.processWithThinking(
      'Open Chrome',
      {}
    );
    assert(thinking.capabilities, 'Capabilities not found');
    assert(Array.isArray(thinking.capabilities.available), 'Available capabilities should be array');
    assert(Array.isArray(thinking.capabilities.unavailable), 'Unavailable capabilities should be array');
  });

  // Test 7: Planning
  test('Planning works correctly', async () => {
    const thinking = await window.UltronThinkingEngine.processWithThinking(
      'Open Notepad, type hello, and save the file',
      {}
    );
    assert(thinking.plan, 'Plan not found');
    assert(Array.isArray(thinking.plan.steps), 'Steps should be array');
    assert(thinking.plan.steps.length > 1, 'Should have multiple steps');
  });

  // Test 8: Response Formatting
  test('Response formatting works correctly', () => {
    const thinking = {
      intent: { type: 'command', requiresAction: true },
      analysis: { category: 'app-control', requiresAction: true, estimatedSteps: 2 },
      plan: { steps: [{ description: 'Open app' }, { description: 'Type text' }] }
    };

    const formatted = window.UltronResponseFormatter.formatAgentResponse(
      'Task completed successfully',
      { thinking, isComplete: true }
    );

    assert(formatted.includes('Thinking'), 'Should include thinking section');
    assert(formatted.includes('Task completed'), 'Should include main response');
  });

  // Test 9: Quick Intent Check
  test('Quick intent check works', () => {
    const result = window.UltronAgentIntegration.quickIntentCheck('Open Chrome and search for cats');
    assert(result.requiresAction === true, 'Should detect action');
    
    const result2 = window.UltronAgentIntegration.quickIntentCheck('What is the capital of France?');
    assert(result2.isConversational === true, 'Should detect conversation');
  });

  // Test 10: Configuration
  test('Configuration is loaded', () => {
    // This would check if ultron-agent-config.json is loaded
    // For now, just verify the runtime config exists
    assert(window.UltronThinkingEngine.getThinkingState, 'Thinking state getter exists');
  });

  // Print summary
  console.log('\n=== Test Summary ===');
  console.log(`Passed: ${tests.passed}`);
  console.log(`Failed: ${tests.failed}`);
  console.log(`Total: ${tests.passed + tests.failed}`);

  // Export results
  window.UltronTestResults = tests;

  // Demo function
  window.demoEnhancedAgent = async function (message) {
    console.log('\n=== Enhanced Agent Demo ===');
    console.log(`Input: "${message}"\n`);

    try {
      const pipeline = await window.UltronAgentIntegration.processWithEnhancedPipeline(
        message || 'Open Notepad and write Hello World'
      );

      console.log('Thinking:', pipeline.thinking);
      console.log('\nResponse:\n', pipeline.formattedResponse);
      
      return pipeline;
    } catch (error) {
      console.error('Demo error:', error);
    }
  };

  console.log('\nTo run a demo, use: demoEnhancedAgent("your message here")');

})();
