/** Test bout-en-bout du serveur temps réel : 2 clients WebSocket, 1 curseur. */
import { randomBytes } from 'node:crypto';
import http from 'node:http';

const PORT = process.env.PORT ?? 4100;
const BASE = `http://localhost:${PORT}`;

const res = await fetch(`${BASE}/api/rooms`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'Atelier WS',
    ownerId: 'u_ada',
    ownerName: 'Ada',
    doc: { name: 'Test', components: [], ground: 'gnd', terminals: { a: null, b: null }, regime: 'dc', frequency: 50 },
  }),
});
const { code } = await res.json();
console.log('atelier créé :', code);

function connect(userId, userName) {
  const inbox = [];
  let handler = null;
  const client = {
    socket: null,
    inbox,
    send(payload) {
      const data = Buffer.from(JSON.stringify(payload));
      const mask = randomBytes(4);
      const masked = Buffer.from(data);
      for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4];
      let header;
      if (data.length < 126) {
        header = Buffer.from([0x81, 0x80 | data.length]);
      } else {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 0x80 | 126;
        header.writeUInt16BE(data.length, 2);
      }
      client.socket.write(Buffer.concat([header, mask, masked]));
    },
    listen(fn) {
      handler = fn;
      inbox.splice(0).forEach(fn);
    },
  };
  return new Promise((resolve, reject) => {
    const key = randomBytes(16).toString('base64');
    const req = http.request(
      {
        port: PORT,
        path: `/ws/${code}?userId=${userId}&userName=${encodeURIComponent(userName)}`,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13',
        },
      },
      (r) => r.resume(),
    );
    req.on('upgrade', (_res, socket) => {
      client.socket = socket;
      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        let offset = 0;
        while (offset + 2 <= buffer.length) {
          const len0 = buffer[offset + 1] & 0x7f;
          let cursor = offset + 2;
          let len = len0;
          if (len0 === 126) {
            len = buffer.readUInt16BE(cursor);
            cursor += 2;
          } else if (len0 === 127) {
            len = Number(buffer.readBigUInt64BE(cursor));
            cursor += 8;
          }
          if (cursor + len > buffer.length) break;
          const payload = buffer.subarray(cursor, cursor + len).toString();
          offset = cursor + len;
          try {
            const message = JSON.parse(payload);
            if (handler) handler(message);
            else inbox.push(message);
          } catch {
            /* ignore */
          }
        }
        buffer = buffer.subarray(offset);
      });
      resolve(client);
    });
    req.on('error', reject);
    req.end();
  });
}

const events = [];
const ada = await connect('u_ada', 'Ada');
const grace = await connect('u_grace', 'Grace');
ada.listen((msg) => events.push(['ada', msg]));
grace.listen((msg) => events.push(['grace', msg]));

await new Promise((r) => setTimeout(r, 400));
for (let i = 0; i < 6; i += 1) {
  grace.send({ type: 'cursor', x: 4 + i, y: 2 + i, hover: 'R1', tool: 'place', activity: 'place une résistance' });
  await new Promise((r) => setTimeout(r, 120));
}
grace.send({ type: 'chat', text: 'Le pont est prêt ?' });
await new Promise((r) => setTimeout(r, 700));

const received = events.filter(([who]) => who === 'ada').map(([, m]) => m);
console.log('welcome ada :', received.find((m) => m.type === 'welcome') ? 'OK' : 'MANQUANT');
const cursorEvent = received.filter((m) => m.type === 'cursors').at(-1);
console.log('cursors reçus :', received.filter((m) => m.type === 'cursors').length);
console.log('dernier curseur :', JSON.stringify(cursorEvent?.cursors?.[0]));
console.log('chat :', received.filter((m) => m.type === 'chat').length ? 'OK' : 'MANQUANT');
console.log('présence :', JSON.stringify(received.filter((m) => m.type === 'presence').at(-1)?.participants?.map((p) => [p.name, p.activity])));

ada.socket.end();
grace.socket.end();
process.exit(0);
