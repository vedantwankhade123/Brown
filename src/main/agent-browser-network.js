const http = require('node:http');
const net = require('node:net');
const dns = require('node:dns').promises;

function isPublicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99)))
      || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100)))
      || (a === 203 && b === 0 && c === 113));
  }
  if (net.isIP(address) !== 6 || address.includes('%')) return false;
  const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase();
  const [first, second] = normalized.split(':').map(part => parseInt(part || '0', 16));
  return first >= 0x2000 && first <= 0x3fff
    && !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8))
    && first !== 0x2002 && !(first === 0x3fff && second < 0x1000);
}

function parsePublicUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Enter a valid public HTTP or HTTPS address.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only HTTP and HTTPS addresses without embedded credentials are supported.');
  }
  if (url.port && !['80', '443'].includes(url.port)) throw new Error('Only standard web ports are supported.');
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)
    || (!net.isIP(host) && !host.includes('.')) || (net.isIP(host) && !isPublicAddress(host))) {
    throw new Error('Local, private, and reserved network addresses are blocked.');
  }
  return url;
}

async function resolvePublicHost(host, lookup = dns.lookup) {
  const hostname = host.replace(/^\[|\]$/g, '');
  const addresses = net.isIP(hostname)
    ? [{ address: hostname, family: net.isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(entry => !isPublicAddress(entry.address))) {
    throw new Error('This host resolves to a private or reserved network address.');
  }
  return addresses[0];
}

async function createPublicProxy() {
  const sockets = new Set();
  const track = socket => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    socket.setTimeout(60000, () => socket.destroy());
    return socket;
  };
  const server = http.createServer(async (request, response) => {
    let upstream;
    try {
      const url = parsePublicUrl(request.url);
      if (url.protocol !== 'http:') throw new Error('Use CONNECT for TLS.');
      const target = await resolvePublicHost(url.hostname);
      if (request.destroyed) return;
      const headers = { ...request.headers, host: url.host };
      delete headers['proxy-authorization'];
      delete headers['proxy-connection'];
      // Connect to the validated IP, not the hostname, to prevent DNS rebinding.
      upstream = http.request({
        hostname: target.address, family: target.family, port: Number(url.port) || 80,
        path: url.pathname + url.search, method: request.method, headers, agent: false
      }, remote => {
        response.writeHead(remote.statusCode, remote.headers);
        remote.pipe(response);
      });
      upstream.on('socket', track);
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
      response.on('close', () => upstream.destroy());
      request.pipe(upstream);
    } catch (_) {
      response.writeHead(403, { 'content-type': 'text/plain' });
      response.end('Brown blocked this network destination.');
      upstream?.destroy();
    }
  });
  server.on('connect', async (request, client, head) => {
    try {
      const url = parsePublicUrl(`https://${request.url}`);
      if (url.pathname !== '/' || url.search || url.hash) throw new Error('Invalid tunnel destination.');
      const target = await resolvePublicHost(url.hostname);
      if (client.destroyed) return;
      const remote = track(net.connect({ host: target.address, family: target.family, port: Number(url.port) || 443 }));
      remote.once('connect', () => {
        if (client.destroyed) return remote.destroy();
        client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) remote.write(head);
        remote.pipe(client);
        client.pipe(remote);
      });
      remote.on('error', () => client.destroy());
      client.on('close', () => remote.destroy());
      remote.on('close', () => client.destroy());
    } catch (_) {
      client.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    }
  });
  server.on('connection', track);
  server.on('clientError', (_err, socket) => socket.destroy());
  server.maxConnections = 64;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    port: server.address().port,
    close() { for (const socket of sockets) socket.destroy(); server.close(); }
  };
}

module.exports = { isPublicAddress, parsePublicUrl, resolvePublicHost, createPublicProxy };
