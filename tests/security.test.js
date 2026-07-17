const assert = require('assert');
const { isPathBlacklisted, isCommandBlacklisted, verifyAndResolvePath } = require('../src/main/security');

function testPathBlacklist() {
  console.log('Running Path Blacklist tests...');
  
  const blacklisted = [
    'C:\\Windows\\System32\\cmd.exe',
    'c:\\windows\\temp',
    'C:\\Program Files\\Nodejs\\node.exe',
    'C:\\Program Files (x86)\\Steam\\steam.exe',
    'C:\\Users\\john\\AppData\\Local\\Microsoft\\Windows\\UsrClass.dat'
  ];
  
  const safe = [
    'D:\\Ultron\\src\\main\\security.js',
    'C:\\Users\\john\\Documents\\notes.txt',
    'C:\\local_agent_sandbox\\test.txt'
  ];

  for (const path of blacklisted) {
    assert.strictEqual(isPathBlacklisted(path), true, `Expected blacklisted: ${path}`);
  }

  for (const path of safe) {
    assert.strictEqual(isPathBlacklisted(path), false, `Expected safe: ${path}`);
  }
  
  console.log('✓ Path Blacklist tests passed.');
}

function testCommandBlacklist() {
  console.log('Running Command Blacklist tests...');
  
  const blocked = [
    'reg add HKCU\\Software\\MyKey /v MyValue',
    'REG DELETE HKLM\\Software\\Test',
    'setx PATH "%PATH%;C:\\tools"',
    'env'
  ];
  
  const allowed = [
    'dir',
    'echo "hello"',
    'python main.py'
  ];

  for (const cmd of blocked) {
    assert.strictEqual(isCommandBlacklisted(cmd), true, `Expected blocked command: ${cmd}`);
  }

  for (const cmd of allowed) {
    assert.strictEqual(isCommandBlacklisted(cmd), false, `Expected allowed command: ${cmd}`);
  }
  
  console.log('✓ Command Blacklist tests passed.');
}

function testMockRedirection() {
  console.log('Running Mock Redirection tests...');
  
  // Set mock environment
  process.env.PROCESS_ENV_MOCK = 'true';
  
  try {
    const inputPath = 'D:\\Ultron\\workspace\\data.json';
    const resolved = verifyAndResolvePath(inputPath, true);
    
    // We expect it to redirect mapping to C:\local_agent_sandbox
    assert.ok(resolved.startsWith('C:\\local_agent_sandbox'), `Expected redirected path to start with mock root: ${resolved}`);
    assert.ok(resolved.includes('workspace'), `Expected path to preserve directory fragments: ${resolved}`);
    
    console.log(`✓ Path redirected correctly from "${inputPath}" to "${resolved}".`);
  } finally {
    // Clean up
    delete process.env.PROCESS_ENV_MOCK;
  }
  
  console.log('✓ Mock Redirection tests passed.');
}

function runAll() {
  try {
    testPathBlacklist();
    testCommandBlacklist();
    testMockRedirection();
    console.log('\nAll security tests completed successfully.');
  } catch (error) {
    console.error('\n❌ Test execution failed:');
    console.error(error);
    process.exit(1);
  }
}

module.exports = { runAll };
