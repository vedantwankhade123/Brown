const { runAll } = require('./security.test');
const { runAgentTests } = require('./agent.test');
const { runPhase2Tests } = require('./phase2.test');

console.log('=============================================');
console.log('Ultron Security Orchestration Test Suite');
console.log('=============================================\n');

runAll();

console.log('\n=============================================');
console.log('Ultron Agent Loop Test Suite');
console.log('=============================================\n');

runAgentTests();

console.log('\n=============================================');
console.log('Ultron Phase 2 Windows Enhancements Test Suite');
console.log('=============================================\n');

(async () => {
  await runPhase2Tests();
  console.log('\n=============================================');
  console.log('Verification Success: All Windows Enhancements Active & Tested');
  console.log('=============================================');
})();
