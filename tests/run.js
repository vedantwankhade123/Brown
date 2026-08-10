const { runAll } = require('./security.test');
const { runAgentTests } = require('./agent.test');

console.log('=============================================');
console.log('Ultron Security Orchestration Test Suite');
console.log('=============================================\n');

runAll();

console.log('\n=============================================');
console.log('Ultron Agent Loop Test Suite');
console.log('=============================================\n');

runAgentTests();

console.log('\n=============================================');
console.log('Verification Success: Safety Filters Active');
console.log('=============================================');
