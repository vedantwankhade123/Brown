const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { isPublicAddress, parsePublicUrl, resolvePublicHost, createPublicProxy } = require('../src/main/agent-browser-network');

async function runBrowserTests() {
  for (const ip of ['0.0.0.0', '10.2.3.4', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '198.19.1.1', '224.0.0.1', '255.255.255.255', '192.0.2.1', '198.51.100.1', '203.0.113.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:7f00:1::1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ['2001::1', '2001:1::1', '2001:1ff::1', '3fff::1', 'fe80::1%eth0']) assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2001:4860:4860::8888', '2606:4700:4700::1111']) assert.equal(isPublicAddress(ip), true, ip);
  for (const url of ['file:///C:/secrets', 'javascript:alert(1)', 'data:text/html,test', 'https://localhost/', 'https://127.1/', 'https://2130706433/', 'https://0x7f000001/', 'https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://service.local/', 'https://user:password@example.com/', 'https://example.com:11434/']) {
    assert.throws(() => parsePublicUrl(url), undefined, url);
  }
  assert.equal(parsePublicUrl('https://example.com/path?q=test').hostname, 'example.com');
  await assert.rejects(resolvePublicHost('example.com', async () => [{ address: '127.0.0.1', family: 4 }]));
  await assert.rejects(resolvePublicHost('example.com', async () => [{ address: '8.8.8.8', family: 4 }, { address: '10.1.1.1', family: 4 }]));
  assert.equal((await resolvePublicHost('example.com', async () => [{ address: '8.8.8.8', family: 4 }])).address, '8.8.8.8');
  const proxy = await createPublicProxy();
  try {
    const status = await new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: proxy.port, path: 'http://127.0.0.1/', method: 'GET' }, res => { res.resume(); resolve(res.statusCode); });
      req.on('error', reject); req.end();
    });
    assert.equal(status, 403);
    const tunnel = await new Promise((resolve, reject) => {
      const client = net.connect(proxy.port, '127.0.0.1', () => client.write('CONNECT 169.254.169.254:443 HTTP/1.1\r\nHost: 169.254.169.254:443\r\n\r\n'));
      client.once('data', data => { resolve(data.toString()); client.destroy(); });
      client.on('error', reject);
    });
    assert.match(tunnel, /403 Forbidden/);
  } finally { proxy.close(); }
  console.log('Browser network policy: public address validation, DNS rebinding, HTTP and CONNECT denial passed.');
}

if (require.main === module) runBrowserTests().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { runBrowserTests };
