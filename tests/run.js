require('./local-diagnostic-export.test');
require('./local-diagnostics-ipc.test.cjs');
require('./local-inference.test');
require('./repetition-recovery.test');
require('./storage-diagnostics.test');
require('./storage-isolation.test');
require('./chat-corrections.test');
require('./chat-concurrency.test');
require('./session-focus.test');
require('./geometry-diagrams.test');
require('./chat-jobs.test');
require('./message-workflows.test');
require('./conversation-fulfillment.test');
const { runAll } = require('./security.test');
const { runAgentTests, runAsyncAgentTests } = require('./agent.test');
const { runPhase2Tests } = require('./phase2.test');
const { runAutonomyTests } = require('./autonomy.test');
const { runBrowserTests } = require('./agent-browser.test');
const { runSessionSidebarTests } = require('./session-sidebar.test');

console.log('=============================================');
console.log('Ultron Security Orchestration Test Suite');
console.log('=============================================\n');

runAll();

console.log('\n=============================================');
console.log('Ultron Agent Loop Test Suite');
console.log('=============================================\n');

runAgentTests();

(async () => {
  await require('./knowledge-base.test').runKnowledgeTests();
  await runSessionSidebarTests();
  await require('./session-meta.test').run();
  if (typeof runAsyncAgentTests === 'function') {
    await runAsyncAgentTests();
  }

  console.log('\n=============================================');
  console.log('Ultron Phase 2 Windows Enhancements Test Suite');
  console.log('=============================================\n');

  await runPhase2Tests();
  console.log('\n=============================================');
  console.log('Verification Success: All Windows Enhancements Active & Tested');
  console.log('=============================================');

  console.log('\n=============================================');
  console.log('Ultron Autonomy Upgrade Test Suite');
  console.log('=============================================\n');

  await runAutonomyTests();
  await runBrowserTests();
  await require('./answer-experience.test').run();
  await require('./search-onboarding.test').run();
  await require('./onboarding-profile.test').run();
  await require('./onboarding-voices.test').run();
  await require('./web-search.test').run();
  const { execFileSync } = require('child_process');
  const path = require('path');
  execFileSync(process.execPath, [path.join(__dirname, 'assets-gallery.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'request-cancellation.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'request-pipeline.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'execution-ledger.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'context-budget.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'capability-registry.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'skills-harness.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'model-recommender.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'model-compare.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'trust-boundary.test.js')], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'agent-taint-executor.test.js')], { stdio: 'inherit' });
  // Phase 7 eval harness self-test: hermetic (no live model) — verifies fixtures, module
  // loading and metadata-only report shaping for scripts/evaluate-local-chat.cjs.
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'evaluate-local-chat.cjs'), '--self-test'], { stdio: 'inherit' });
  execFileSync(process.execPath, [path.join(__dirname, 'knowledge-formats.test.js')], { stdio: 'inherit' });
  for (const file of ['companion-connection.test.js', 'connection-settings.test.js', 'desktop-responsiveness.test.js', 'desktop-speech-theme.test.js', 'speech-streaming.test.js', 'speech-pcm.test.js', 'speech-highlight.test.js', 'speech-chunk-cache.test.js', 'visual-loading-order.test.js', 'visual-bridge.test.js', 'visual-planner.test.js', 'visual-routing.test.js', 'visual-model-stream.test.js', 'prompt-routing.test.js', 'activity-status.test.js', 'conversation-context.test.js', 'message-copy.test.js', 'mention-dropdown.test.js', 'knowledge-context.test.js', 'knowledge-ipc.test.js', 'project-knowledge-updates.test.js', 'project-sidebar.test.js', 'chat-release.test.js', 'file-intent.test.js', 'file-workflow.test.js', 'desktop-priorities.test.js', 'updater.test.js', 'updater-flow.test.js', 'update-cache.test.js', 'onboarding-install-status.test.js', 'onboarding-setup-queue.test.js']) {
    execFileSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  }
  console.log('\n=============================================');
  console.log('Verification Success: Autonomy Upgrade Active & Tested');
  console.log('=============================================');
})();
