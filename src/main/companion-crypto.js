'use strict';
const crypto = require('crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function key(secret) {
  if (!/^[a-f0-9]{48,64}$/.test(secret)) throw Error('Invalid companion key');
  return crypto.createHash('sha256').update(secret).digest();
}
function seal(secret, keyId, id, direction, payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(secret), iv);
  cipher.setAAD(Buffer.from(`brown-v2:${direction}:${keyId}:${id}`));
  const data = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final(), cipher.getAuthTag()]);
  return { v: 2, keyId, id, iv: iv.toString('base64'), data: data.toString('base64') };
}
function open(secret, envelope, direction) {
  if (envelope.v !== 2 || !/^[a-f0-9]{16,64}$/.test(envelope.id) || !/^[a-f0-9]{16,64}$/.test(envelope.keyId)) throw Error('Invalid envelope');
  const iv = Buffer.from(envelope.iv, 'base64'), data = Buffer.from(envelope.data, 'base64');
  if (iv.length !== 12 || data.length < 16 || data.length > 48 * 1024 * 1024) throw Error('Invalid encrypted payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(secret), iv);
  decipher.setAAD(Buffer.from(`brown-v2:${direction}:${envelope.keyId}:${envelope.id}`));
  decipher.setAuthTag(data.subarray(-16));
  return JSON.parse(Buffer.concat([decipher.update(data.subarray(0, -16)), decipher.final()]).toString());
}
function endpoint(raw, relay = false) {
  if (!raw) return '';
  const url = new URL(raw);
  const octets = /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) ? url.hostname.split('.').map(Number) : [];
  const local = url.hostname === 'localhost' || (octets.length === 4 && octets.every(n => n <= 255)
    && (octets[0] === 127 || octets[0] === 10 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)));
  if (url.username || url.password || url.search || url.hash || !((relay ? url.protocol === 'wss:' : url.protocol === 'https:') || (local && (relay ? url.protocol === 'ws:' : url.protocol === 'http:')))) throw Error('Use a secure remote URL (local development may use HTTP/WS).');
  return url.toString().replace(/\/$/, '');
}
module.exports = { hash, seal, open, endpoint };
