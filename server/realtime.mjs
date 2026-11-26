/**
 * Northev Spark — serveur temps réel (Node pur, zéro dépendance).
 *
 * Rôle : service de collaboration autonome pour le studio.
 *  - WebSocket natif (`/ws`) pour curseurs + présence + révisions (le plus rapide)
 *  - API REST de secours (`/api/*`) quand un client ne peut pas ouvrir de socket
 *  - Partage le même format de montage (`CircuitDoc`) que Next.js
 *
 * Démarrage :  node server/realtime.mjs        (port 4100 par défaut)
 *              PORT=5000 node server/realtime.mjs
 *
 * Le serveur ne calcule pas le montage : il synchronise. Le calcul (MNA
 * complexe) reste dans `lib/engine/`, appelé côté Next.js.
 */

import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4100);
const ORIGIN_TTL = 12_000; // un curseur disparaît après 12 s d'inactivité
const HEARTBEAT = 15_000;
const MAX_ROOMS = 200;
const TICK = 100; // cadence de diffusion des curseurs (10 Hz)

const PALETTE = ['#38e1e6', '#a479ff', '#ffc266', '#46e6a0', '#ff7d6b', '#4f9dff', '#ff79c6', '#facc15'];

/** couleur déterministe : même utilisateur = même couleur partout */
function colorFor(id) {
  const digest = createHash('sha1').update(id).digest();
  return PALETTE[digest[0] % PALETTE.length];
}

/** salle = code à 5 chiffres */
const rooms = new Map();

function now() {
  return new Date().toISOString();
}

function inviteCode() {
  let code = String(10000 + Math.floor(Math.random() * 90000));
  let guard = 0;
  while (rooms.has(code) && guard++ < 500) code = String(10000 + Math.floor(Math.random() * 90000));
  return code;
}

function createRoom(input) {
  const code = inviteCode();
  const room = {
    code,
    name: input.name ?? 'Atelier sans titre',
    ownerId: input.ownerId ?? 'anon',
    ownerName: input.ownerName ?? 'Anonyme',
    projectId: input.projectId,
    doc: input.doc ?? null,
    revision: 1,
    createdAt: now(),
    updatedAt: now(),
    presence: new Map(),
    messages: [],
    sockets: new Set(),
    dirty: false,
  };
  rooms.set(code, room);
  if (rooms.size > MAX_ROOMS) {
    const oldest = [...rooms.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
    if (oldest && oldest.sockets.size === 0) rooms.delete(oldest.code);
  }
  return room;
}

function presenceList(room) {
  const stamp = Date.now();
  return [...room.presence.values()]
    .filter((p) => stamp - p.seenAt < ORIGIN_TTL * 3)
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      activity: p.activity,
      idle: stamp - p.seenAt > 8_000,
      cursor: p.cursor ? { ...p.cursor, fresh: stamp - p.cursor.at < ORIGIN_TTL } : undefined,
    }));
}

function cursorList(room) {
  const stamp = Date.now();
  return [...room.presence.values()]
    .filter((p) => p.cursor && stamp - p.cursor.at < ORIGIN_TTL)
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      avatar: p.avatar,
      x: p.cursor.x,
      y: p.cursor.y,
      hover: p.cursor.hover ?? null,
      tool: p.cursor.tool ?? 'select',
      idle: stamp - p.seenAt > 8_000,
      fresh: true,
    }));
}

/* ------------------------------------------------------------------ */
/*  WebSocket minimal (RFC 6455)                                       */
/* ------------------------------------------------------------------ */

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function acceptKey(key) {
  return createHash('sha1').update(key + WS_GUID).digest('base64');
}

function encodeFrame(payload, opcode = 0x1) {
  const data = Buffer.from(payload);
  const len = data.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, data]);
}

/** décode un ou plusieurs trames d'un buffer ; renvoie [messages, reste] */
function decodeFrames(buffer) {
  const messages = [];
  let offset = 0;
  while (offset + 2 <= buffer.length) {
    const first = buffer[offset];
    const second = buffer[offset + 1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let cursor = offset + 2;
    if (length === 126) {
      if (cursor + 2 > buffer.length) break;
      length = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (length === 127) {
      if (cursor + 8 > buffer.length) break;
      length = Number(buffer.readBigUInt64BE(cursor));
      cursor += 8;
    }
    const maskKey = masked ? buffer.subarray(cursor, cursor + 4) : null;
    if (masked) cursor += 4;
    if (cursor + length > buffer.length) break;
    const payload = Buffer.from(buffer.subarray(cursor, cursor + length));
    if (maskKey) {
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= maskKey[i % 4];
    }
    offset = cursor + length;
    if (opcode === 0x8) {
      messages.push({ opcode: 'close' });
    } else if (opcode === 0x9) {
      messages.push({ opcode: 'ping', payload });
    } else if (opcode === 0x1 || opcode === 0x0) {
      try {
        messages.push({ opcode: 'text', data: JSON.parse(payload.toString('utf8')) });
      } catch {
        messages.push({ opcode: 'raw', data: payload.toString('utf8') });
      }
    }
  }
  return [messages, buffer.subarray(offset)];
}

/* ------------------------------------------------------------------ */
/*  Diffusion                                                          */
/* ------------------------------------------------------------------ */

function send(ws, type, payload) {
  if (ws.closed || ws.socket.destroyed) return;
  try {
    ws.socket.write(encodeFrame(JSON.stringify({ type, at: now(), ...payload })));
  } catch {
    ws.closed = true;
  }
}

function broadcast(room, type, payload, except) {
  for (const client of room.sockets) {
    if (client === except) continue;
    send(client, type, payload);
  }
}

let lastCursorSignature = '';
let lastPresenceSignature = '';

setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.sockets.size) continue;
    const stamp = Date.now();

    // purge des présences expirées
    for (const [id, p] of room.presence) {
      if (stamp - p.seenAt > ORIGIN_TTL * 3) room.presence.delete(id);
    }

    const cursors = cursorList(room);
    const cursorSignature = `${room.code}:${JSON.stringify(cursors)}`;
    if (cursorSignature !== lastCursorSignature) {
      lastCursorSignature = cursorSignature;
      broadcast(room, 'cursors', { code: room.code, cursors });
    }

    const presence = presenceList(room);
    const presenceSignature = `${room.code}:${JSON.stringify(presence.map((p) => [p.id, p.idle, p.activity]))}`;
    if (presenceSignature !== lastPresenceSignature) {
      lastPresenceSignature = presenceSignature;
      broadcast(room, 'presence', { code: room.code, participants: presence });
    }
  }
}, TICK).unref();

setInterval(() => {
  for (const room of rooms.values()) {
    for (const client of room.sockets) send(client, 'heartbeat', { code: room.code });
  }
}, HEARTBEAT).unref();

/* ------------------------------------------------------------------ */
/*  HTTP + upgrade                                                     */
/* ------------------------------------------------------------------ */

const JSON_HEAD = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
  'Cache-Control': 'no-store',
};

function json(res, status, body) {
  res.writeHead(status, JSON_HEAD);
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 8e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve(null);
      }
    });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, JSON_HEAD);
    return res.end();
  }

  // ---- santé
  if (url.pathname === '/health') {
    return json(res, 200, {
      ok: true,
      service: 'northev-realtime',
      version: '1.0.0',
      rooms: rooms.size,
      sockets: [...rooms.values()].reduce((sum, r) => sum + r.sockets.size, 0),
      uptime: Math.round(process.uptime()),
      transport: 'ws',
    });
  }

  // ---- liste des ateliers
  if (url.pathname === '/api/rooms' && req.method === 'GET') {
    return json(res, 200, {
      rooms: [...rooms.values()].map((r) => ({
        code: r.code,
        name: r.name,
        ownerName: r.ownerName,
        projectId: r.projectId,
        revision: r.revision,
        participants: presenceList(r).length,
        updatedAt: r.updatedAt,
      })),
    });
  }

  // ---- création
  if (url.pathname === '/api/rooms' && req.method === 'POST') {
    const body = await readBody(req);
    if (!body || !body.doc) return json(res, 422, { error: 'Montage requis (doc).' });
    const room = createRoom({
      name: body.name,
      ownerId: body.ownerId,
      ownerName: body.ownerName,
      projectId: body.projectId,
      doc: body.doc,
    });
    if (body.ownerId) {
      room.presence.set(body.ownerId, {
        id: body.ownerId,
        name: body.ownerName ?? 'Anonyme',
        avatar: 'circuit',
        color: colorFor(body.ownerId),
        activity: 'a ouvert l’atelier',
        seenAt: Date.now(),
        cursor: null,
      });
    }
    return json(res, 201, { code: room.code, name: room.name, revision: room.revision, createdAt: room.createdAt });
  }

  // ---- détail / patch / fermeture
  const roomMatch = url.pathname.match(/^\/api\/rooms\/(\d{5})$/);
  if (roomMatch) {
    const room = rooms.get(roomMatch[1]);
    if (!room) return json(res, 404, { error: 'Atelier introuvable.' });
    if (req.method === 'GET') {
      return json(res, 200, {
        code: room.code,
        name: room.name,
        doc: room.doc,
        revision: room.revision,
        projectId: room.projectId,
        participants: presenceList(room),
        messages: room.messages.slice(-50),
        updatedAt: room.updatedAt,
      });
    }
    if (req.method === 'PATCH') {
      const body = await readBody(req);
      if (!body) return json(res, 400, { error: 'Requête invalide.' });
      if (body.doc) {
        room.doc = body.doc;
        room.revision += 1;
        room.updatedAt = now();
        broadcast(room, 'revision', {
          code: room.code,
          revision: room.revision,
          author: body.authorId ?? null,
          authorName: body.authorName ?? null,
          doc: room.doc,
        });
      }
      if (body.name) room.name = String(body.name).slice(0, 120);
      return json(res, 200, { ok: true, revision: room.revision });
    }
    if (req.method === 'DELETE') {
      room.sockets.forEach((client) => send(client, 'room-closed', { code: room.code }));
      room.sockets.forEach((client) => client.socket.end());
      rooms.delete(room.code);
      return json(res, 200, { closed: true });
    }
  }

  // ---- chat (repli HTTP)
  const chatMatch = url.pathname.match(/^\/api\/rooms\/(\d{5})\/chat$/);
  if (chatMatch && req.method === 'POST') {
    const room = rooms.get(chatMatch[1]);
    if (!room) return json(res, 404, { error: 'Atelier introuvable.' });
    const body = await readBody(req);
    if (!body?.text) return json(res, 422, { error: 'Message vide.' });
    const message = {
      id: `m_${randomBytes(4).toString('hex')}`,
      authorId: body.authorId ?? 'anon',
      authorName: body.authorName ?? 'Anonyme',
      text: String(body.text).slice(0, 500),
      at: now(),
    };
    room.messages.push(message);
    if (room.messages.length > 200) room.messages.shift();
    broadcast(room, 'chat', { code: room.code, message });
    return json(res, 201, { message });
  }

  // ---- présence (repli HTTP, un point toutes les 2 s)
  const pingMatch = url.pathname.match(/^\/api\/rooms\/(\d{5})\/presence$/);
  if (pingMatch && req.method === 'POST') {
    const room = rooms.get(pingMatch[1]);
    if (!room) return json(res, 404, { error: 'Atelier introuvable.' });
    const body = await readBody(req);
    if (!body?.userId) return json(res, 422, { error: 'userId requis.' });
    const current = room.presence.get(body.userId) ?? {
      id: body.userId,
      name: body.userName ?? 'Anonyme',
      avatar: 'circuit',
      color: colorFor(body.userId),
      activity: 'est présent',
      seenAt: Date.now(),
      cursor: null,
    };
    current.seenAt = Date.now();
    current.name = body.userName ?? current.name;
    if (body.activity) current.activity = body.activity;
    if (body.cursor) {
      current.cursor = {
        x: Number(body.cursor.x),
        y: Number(body.cursor.y),
        hover: body.cursor.hover ?? null,
        tool: body.cursor.tool ?? 'select',
        at: Date.now(),
      };
    }
    room.presence.set(body.userId, current);
    return json(res, 200, {
      participants: presenceList(room),
      cursors: cursorList(room),
      revision: room.revision,
    });
  }

  json(res, 404, { error: 'Route inconnue.', path: url.pathname });
});

/* ---- poignée de main WebSocket ---- */
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const match = url.pathname.match(/^\/ws\/(\d{5})$/);
  if (!match) {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  const code = match[1];
  const room = rooms.get(code);
  const key = req.headers['sec-websocket-key'];
  if (!room || !key) {
    socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
    return;
  }

  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey(String(key))}\r\n\r\n`,
  );

  const userId = url.searchParams.get('userId') ?? `guest_${randomBytes(3).toString('hex')}`;
  const userName = url.searchParams.get('userName') ?? 'Invité';
  const client = { socket, userId, closed: false };
  room.sockets.add(client);

  const presence =
    room.presence.get(userId) ??
    {
      id: userId,
      name: userName,
      avatar: 'circuit',
      color: colorFor(userId),
      activity: 'vient de rejoindre',
      seenAt: Date.now(),
      cursor: null,
    };
  presence.seenAt = Date.now();
  room.presence.set(userId, presence);

  send(client, 'welcome', {
    code,
    userId,
    color: presence.color,
    doc: room.doc,
    revision: room.revision,
    participants: presenceList(room),
    messages: room.messages.slice(-50),
  });
  broadcast(room, 'presence', { code, participants: presenceList(room) }, client);
  broadcast(room, 'member-joined', { code, name: presence.name, id: presence.id }, client);

  let buffer = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    const [messages, rest] = decodeFrames(buffer);
    buffer = rest;
    for (const message of messages) {
      if (message.opcode === 'ping') {
        socket.write(encodeFrame(message.payload, 0xa));
        continue;
      }
      if (message.opcode === 'close') {
        client.closed = true;
        room.sockets.delete(client);
        socket.end();
        return;
      }
      if (message.opcode !== 'text') continue;
      const payload = message.data;
      if (!payload || typeof payload !== 'object') continue;
      handleMessage(room, client, presence, payload);
    }
  });

  const cleanup = () => {
    client.closed = true;
    room.sockets.delete(client);
    presence.seenAt = 0;
    presence.cursor = null;
    broadcast(room, 'presence', { code, participants: presenceList(room) });
    broadcast(room, 'member-left', { code, name: presence.name, id: presence.id });
  };
  socket.on('close', cleanup);
  socket.on('error', cleanup);
});

function handleMessage(room, client, presence, payload) {
  switch (payload.type) {
    case 'cursor': {
      presence.cursor = {
        x: Number(payload.x ?? 0),
        y: Number(payload.y ?? 0),
        hover: payload.hover ?? null,
        tool: payload.tool ?? 'select',
        at: Date.now(),
      };
      presence.seenAt = Date.now();
      if (payload.activity) presence.activity = payload.activity;
      break;
    }
    case 'idle': {
      presence.cursor = null;
      break;
    }
    case 'activity': {
      presence.activity = String(payload.activity ?? '').slice(0, 90);
      presence.seenAt = Date.now();
      break;
    }
    case 'doc': {
      if (!payload.doc) break;
      room.doc = payload.doc;
      room.revision += 1;
      room.updatedAt = now();
      broadcast(
        room,
        'revision',
        {
          code: room.code,
          revision: room.revision,
          author: client.userId,
          authorName: presence.name,
          doc: room.doc,
        },
        client,
      );
      break;
    }
    case 'chat': {
      if (!payload.text) break;
      const message = {
        id: `m_${randomBytes(4).toString('hex')}`,
        authorId: client.userId,
        authorName: presence.name,
        text: String(payload.text).slice(0, 500),
        at: now(),
      };
      room.messages.push(message);
      if (room.messages.length > 200) room.messages.shift();
      broadcast(room, 'chat', { code: room.code, message });
      break;
    }
    case 'ping': {
      presence.seenAt = Date.now();
      send(client, 'pong', { code: room.code });
      break;
    }
    default:
      break;
  }
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ Northev realtime — http://0.0.0.0:${PORT}`);
  console.log(`   WebSocket : ws://0.0.0.0:${PORT}/ws/<code>`);
  console.log(`   REST      : GET /health · POST /api/rooms · POST /api/rooms/:code/presence`);
});
