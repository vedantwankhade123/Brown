'use strict';
// Opaque encrypted envelopes only. Put behind a TLS reverse proxy for internet use.
const http = require('http');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');
function createRelay() {
  const server = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"service":"Brown encrypted companion relay"}'); });
  const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 * 1024 });
  const rooms = new Map(), pending = new Map();
  wss.on('connection', socket => {
    socket.alive = true;
    socket.on('pong', () => { socket.alive = true; });
    const handshake = setTimeout(() => socket.close(1008), 10000);
    socket.on('message', data => {
      try {
        const m = JSON.parse(data);
        if (m.type === 'register') {
          if (socket.room || socket.client || !/^[a-f0-9]{64}$/.test(m.owner || '') || crypto.createHash('sha256').update(m.owner).digest('hex') !== m.room) throw Error();
          clearTimeout(handshake);
          const previous = rooms.get(m.room); if (previous) previous.close();
          socket.room = m.room; rooms.set(m.room, socket);
          socket.send(JSON.stringify({ type: 'registered' }));
        } else if (m.type === 'request' && !socket.room && !socket.client) {
          clearTimeout(handshake);
          socket.client = true;
          const desktop = rooms.get(m.room);
          if (!desktop || desktop.readyState !== WebSocket.OPEN) { socket.send('{"type":"offline"}'); return socket.close(); }
          if (pending.size >= 128 || !m.envelope || JSON.stringify(m.envelope).length > 48 * 1024 * 1024) throw Error();
          const requestId = crypto.randomBytes(16).toString('hex');
          const timer = setTimeout(() => { pending.delete(requestId); socket.close(1013, 'Request timed out'); }, 180000);
          pending.set(requestId, { socket, desktop, timer }); socket.requestId = requestId;
          desktop.send(JSON.stringify({ type: 'request', requestId, envelope: m.envelope }));
        } else if (m.type === 'response' && socket.room) {
          const p = pending.get(m.requestId);
          if (!p || p.desktop !== socket) return;
          pending.delete(m.requestId); clearTimeout(p.timer);
          if (p.socket.readyState === WebSocket.OPEN) { p.socket.send(JSON.stringify({ type: 'response', envelope: m.envelope })); p.socket.close(); }
        } else throw Error();
      } catch { socket.close(1008, 'Invalid relay message'); }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(handshake);
      if (socket.room && rooms.get(socket.room) === socket) rooms.delete(socket.room);
      for (const [id, p] of pending) if (p.socket === socket || p.desktop === socket) { clearTimeout(p.timer); pending.delete(id); if (p.socket !== socket) p.socket.close(1013, 'Desktop offline'); }
    });
  });
  const heartbeat = setInterval(() => { for (const socket of wss.clients) { if (!socket.alive) socket.terminate(); else { socket.alive = false; socket.ping(); } } }, 30000);
  heartbeat.unref();
  return { server, close() { clearInterval(heartbeat); for (const s of wss.clients) s.terminate(); wss.close(); server.close(); } };
}
if (require.main === module) { const relay = createRelay(); relay.server.listen(Number(process.env.BROWN_RELAY_PORT || 49300), process.env.BROWN_RELAY_HOST || '127.0.0.1', () => console.log('Brown relay listening')); }
module.exports = { createRelay };
