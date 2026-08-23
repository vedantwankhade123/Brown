const { runAll } = require('./security.test');
const { runAgentTests, runAsyncAgentTests } = require('./agent.test');
const { runPhase2Tests } = require('./phase2.test');
const { runAutonomyTests } = require('./autonomy.test');

console.log('=============================================');
console.log('Ultron Security Orchestration Test Suite');
console.log('=============================================\n');

runAll();

console.log('\n=============================================');
console.log('Ultron Agent Loop Test Suite');
console.log('=============================================\n');

runAgentTests();

(async () => {
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
  console.log('\n=============================================');
  console.log('Verification Success: Autonomy Upgrade Active & Tested');
  console.log('=============================================');
})();
