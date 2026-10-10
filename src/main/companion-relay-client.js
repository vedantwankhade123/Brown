'use strict';
const WebSocket = require('ws');
const { hash } = require('./companion-crypto');
class CompanionRelayClient {
  constructor(url, owner, handle) { this.url = url; this.owner = owner; this.handle = handle; this.stopped = false; this.delay = 1000; this.connect(); }
  connect() {
    if (this.stopped) return;
    const socket = this.socket = new WebSocket(this.url, { maxPayload: 64 * 1024 * 1024, handshakeTimeout: 8000 });
    socket.on('open', () => { this.delay = 1000; socket.send(JSON.stringify({ type: 'register', room: hash(this.owner), owner: this.owner })); });
    socket.on('message', async data => {
      try {
        const message = JSON.parse(data);
        if (message.type !== 'request') return;
        const envelope = await this.handle(message.envelope);
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'response', requestId: message.requestId, envelope }));
      } catch { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'failure' })); }
    });
    socket.on('error', () => {});
    socket.on('close', () => { if (!this.stopped) { this.timer = setTimeout(() => this.connect(), this.delay + Math.random() * 500); this.delay = Math.min(30000, this.delay * 2); } });
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.socket?.terminate(); }
}
module.exports = { CompanionRelayClient };
