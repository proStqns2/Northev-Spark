/**
 * Vérifie que le WebSocket passe bien par le proxy du dev-server Angular
 * (même chemin que le navigateur : ws://localhost:4300/rt/ws/<code>).
 */
import http from 'node:http';
import { randomBytes } from 'node:crypto';

const HOST = 'localhost';
const PORT = 4300;

const created = await fetch(`http://${HOST}:${PORT}/rt/api/rooms`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'Proxy WS',
    ownerId: 'u_proxy',
    ownerName: 'Proxy',
    doc: { name: 'p', components: [], ground: 'gnd', terminals: { a: null, b: null }, regime: 'dc', frequency: 50 },
  }),
}).then((r) => r.json());
console.log('atelier :', created.code);

function open(userId, userName) {
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64');
    const req = http.request({
      host: HOST,
      port: PORT,
      path: `/rt/ws/${created.code}?userId=${userId}&userName=${encodeURIComponent(userName)}`,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': key,
        'Sec-WebSocket-Version': '13',
      },
    });
    req.on('upgrade', (_res, socket) => {
      const messages = [];
      socket.on('data', (chunk) => {
        let offset = 0;
        while (offset + 2 <= chunk.length) {
          const second = chunk[offset + 1];
          let len = second & 0x7f;
          let cursor = offset + 2;
          if (len === 126) {
            len = chunk.readUInt16BE(cursor);
            cursor += 2;
          }
          if (cursor + len > chunk.length) break;
          const text = chunk.subarray(cursor, cursor + len).toString('utf8');
          offset = cursor + len;
          try {
            messages.push(JSON.parse(text));
          } catch {
            /* ignore */
          }
        }
      });
      resolve({
        messages,
        send(payload) {
          const data = Buffer.from(JSON.stringify(payload));
          const mask = randomBytes(4);
          const masked = Buffer.from(data);
          for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4];
          const header =
            data.length < 126
              ? Buffer.from([0x81, 0x80 | data.length])
              : Buffer.from([0x81, 0x80 | 126, data.length >> 8, data.length & 0xff]);
          socket.write(Buffer.concat([header, mask, masked]));
        },
        close: () => socket.end(),
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const a = await open('u_ada', 'Ada');
const b = await open('u_grace', 'Grace');
await new Promise((r) => setTimeout(r, 400));
for (let i = 0; i < 5; i += 1) {
  b.send({ type: 'cursor', x: 3 + i, y: 5 + i, tool: 'place' });
  await new Promise((r) => setTimeout(r, 140));
}
b.send({ type: 'chat', text: 'hello depuis Angular' });
await new Promise((r) => setTimeout(r, 600));

const types = [...new Set(a.messages.map((m) => m.type))];
const cursors = a.messages.filter((m) => m.type === 'cursors');
console.log('types reçus par Ada :', types.join(', '));
console.log('événements cursors  :', cursors.length);
console.log('dernier curseur     :', JSON.stringify(cursors.at(-1)?.cursors?.[0]));
console.log('chat                :', a.messages.some((m) => m.type === 'chat') ? 'OK' : 'MANQUANT');
a.close();
b.close();
process.exit(0);
