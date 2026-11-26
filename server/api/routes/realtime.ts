import { randomBytes, createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { bodyOf, fail } from '../helpers';

/**
 * Temps réel invité (atelier Angular) — porté de `server/realtime.mjs`.
 *
 * Salles éphémères en mémoire (sans compte) : création via
 * `POST /rt/api/rooms`, synchronisation par WebSocket sur `/rt/ws/:code`.
 * Les salles de compte (persistantes, SSE) vivent dans `rooms.ts`.
 *
 * Protocole WebSocket :
 *   client → serveur : {type:'cursor'|'idle'|'activity'|'doc'|'chat'|'ping'}
 *   serveur → client : welcome | cursors | presence | revision | chat |
 *                      member-joined | member-left | room-closed | heartbeat
 */

const ORIGIN_TTL = 12_000;
const HEARTBEAT = 15_000;
const MAX_ROOMS = 200;
const TICK = 100;

const PALETTE = ['#38e1e6', '#a479ff', '#ffc266', '#46e6a0', '#ff7d6b', '#4f9dff', '#ff79c6', '#facc15'];

interface GuestPresence {
  id: string;
  name: string;
  avatar: string;
  color: string;
  activity: string;
  seenAt: number;
  cursor: { x: number; y: number; hover: string | null; tool: string; at: number } | null;
}

interface GuestRoom {
  code: string;
  name: string;
  ownerId: string;
  ownerName: string;
  projectId?: string;
  doc: unknown;
  revision: number;
  createdAt: string;
  updatedAt: string;
  presence: Map<string, GuestPresence>;
  messages: Array<{ id: string; authorId: string; authorName: string; text: string; at: string }>;
  sockets: Set<WebSocket>;
}

const rooms = new Map<string, GuestRoom>();

const now = () => new Date().toISOString();

function colorFor(id: string): string {
  const digest = createHash('sha1').update(id).digest();
  return PALETTE[digest[0] % PALETTE.length];
}

function inviteCode(): string {
  let code = String(10000 + Math.floor(Math.random() * 90000));
  let guard = 0;
  while (rooms.has(code) && guard++ < 500) code = String(10000 + Math.floor(Math.random() * 90000));
  return code;
}

function createRoom(input: {
  name?: string;
  ownerId?: string;
  ownerName?: string;
  projectId?: string;
  doc?: unknown;
}): GuestRoom {
  const code = inviteCode();
  const room: GuestRoom = {
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
  };
  rooms.set(code, room);
  if (rooms.size > MAX_ROOMS) {
    const oldest = [...rooms.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))[0];
    if (oldest && oldest.sockets.size === 0) rooms.delete(oldest.code);
  }
  return room;
}

function presenceList(room: GuestRoom) {
  const stamp = Date.now();
  return [...room.presence.values()]
    .filter((p) => stamp - p.seenAt < ORIGIN_TTL * 3)
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      activity: p.activity,
      idle: stamp - p.seenAt > 8000,
      cursor: p.cursor ? { ...p.cursor, fresh: stamp - p.cursor.at < ORIGIN_TTL } : undefined,
    }));
}

function cursorList(room: GuestRoom) {
  const stamp = Date.now();
  return [...room.presence.values()]
    .filter((p) => p.cursor && stamp - p.cursor.at < ORIGIN_TTL)
    .map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      avatar: p.avatar,
      x: p.cursor!.x,
      y: p.cursor!.y,
      hover: p.cursor!.hover ?? null,
      tool: p.cursor!.tool ?? 'select',
      idle: stamp - p.seenAt > 8000,
      fresh: true,
    }));
}

function send(ws: WebSocket, type: string, payload: Record<string, unknown>) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify({ type, at: now(), ...payload }));
  } catch {
    /* socket fermée */
  }
}

function broadcast(room: GuestRoom, type: string, payload: Record<string, unknown>, except?: WebSocket) {
  for (const client of room.sockets) {
    if (client === except) continue;
    send(client, type, payload);
  }
}

let lastCursorSignature = '';
let lastPresenceSignature = '';

const tickTimer = setInterval(() => {
  for (const room of rooms.values()) {
    if (!room.sockets.size) continue;
    const stamp = Date.now();
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
}, TICK);
tickTimer.unref();

const heartbeatTimer = setInterval(() => {
  for (const room of rooms.values()) {
    for (const client of room.sockets) send(client, 'heartbeat', { code: room.code });
  }
}, HEARTBEAT);
heartbeatTimer.unref();

function handleMessage(room: GuestRoom, client: WebSocket, presence: GuestPresence, payload: Record<string, unknown>) {
  switch (payload.type) {
    case 'cursor': {
      presence.cursor = {
        x: Number(payload.x ?? 0),
        y: Number(payload.y ?? 0),
        hover: (payload.hover as string | null) ?? null,
        tool: (payload.tool as string) ?? 'select',
        at: Date.now(),
      };
      presence.seenAt = Date.now();
      if (payload.activity) presence.activity = String(payload.activity);
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
        { code: room.code, revision: room.revision, author: presence.id, authorName: presence.name, doc: room.doc },
        client,
      );
      break;
    }
    case 'chat': {
      if (!payload.text) break;
      const message = {
        id: `m_${randomBytes(4).toString('hex')}`,
        authorId: presence.id,
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

export async function registerRealtimeRoutes(app: FastifyInstance) {
  // ---- santé du service temps réel
  app.get('/rt/health', async (_request, reply) => {
    return reply.send({
      ok: true,
      service: 'northev-realtime',
      version: '1.0.0',
      rooms: rooms.size,
      sockets: [...rooms.values()].reduce((sum, r) => sum + r.sockets.size, 0),
      uptime: Math.round(process.uptime()),
      transport: 'ws',
    });
  });

  // ---- liste des ateliers invités
  app.get('/rt/api/rooms', async (_request, reply) => {
    return reply.send({
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
  });

  // ---- création d'un atelier invité
  app.post('/rt/api/rooms', async (request, reply) => {
    const body = bodyOf<{ name?: string; ownerId?: string; ownerName?: string; projectId?: string; doc?: unknown }>(request);
    if (!body.doc) return fail(reply, 422, 'Montage requis (doc).');
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
    return reply.code(201).send({ code: room.code, name: room.name, revision: room.revision, createdAt: room.createdAt });
  });

  // ---- détail / patch / fermeture
  app.get('/rt/api/rooms/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const room = rooms.get(code);
    if (!room) return fail(reply, 404, 'Atelier introuvable.');
    return reply.send({
      code: room.code,
      name: room.name,
      doc: room.doc,
      revision: room.revision,
      projectId: room.projectId,
      participants: presenceList(room),
      messages: room.messages.slice(-50),
      updatedAt: room.updatedAt,
    });
  });

  app.patch('/rt/api/rooms/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const room = rooms.get(code);
    if (!room) return fail(reply, 404, 'Atelier introuvable.');
    const body = bodyOf<{ doc?: unknown; name?: string; authorId?: string; authorName?: string }>(request);
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
    return reply.send({ ok: true, revision: room.revision });
  });

  app.delete('/rt/api/rooms/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const room = rooms.get(code);
    if (!room) return fail(reply, 404, 'Atelier introuvable.');
    room.sockets.forEach((client) => send(client, 'room-closed', { code: room.code }));
    room.sockets.forEach((client) => client.close());
    rooms.delete(room.code);
    return reply.send({ closed: true });
  });

  // ---- chat (repli HTTP)
  app.post('/rt/api/rooms/:code/chat', async (request, reply) => {
    const { code } = request.params as { code: string };
    const room = rooms.get(code);
    if (!room) return fail(reply, 404, 'Atelier introuvable.');
    const body = bodyOf<{ text?: string; authorId?: string; authorName?: string }>(request);
    if (!body.text) return fail(reply, 422, 'Message vide.');
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
    return reply.code(201).send({ message });
  });

  // ---- présence (repli HTTP)
  app.post('/rt/api/rooms/:code/presence', async (request, reply) => {
    const { code } = request.params as { code: string };
    const room = rooms.get(code);
    if (!room) return fail(reply, 404, 'Atelier introuvable.');
    const body = bodyOf<{
      userId?: string;
      userName?: string;
      activity?: string;
      cursor?: { x: number; y: number; hover?: string | null; tool?: string };
    }>(request);
    if (!body.userId) return fail(reply, 422, 'userId requis.');
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
    return reply.send({
      participants: presenceList(room),
      cursors: cursorList(room),
      revision: room.revision,
    });
  });

  // ---- WebSocket temps réel
  app.get('/rt/ws/:code', { websocket: true }, (socket, request) => {
    const { code } = request.params as { code: string };
    const room = rooms.get(code);
    if (!room) {
      socket.close(1008, 'Atelier introuvable');
      return;
    }
    const query = (request.query ?? {}) as Record<string, string>;
    const userId = query.userId ?? `guest_${randomBytes(3).toString('hex')}`;
    const userName = query.userName ?? 'Invité';

    room.sockets.add(socket);

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

    send(socket, 'welcome', {
      code,
      userId,
      color: presence.color,
      doc: room.doc,
      revision: room.revision,
      participants: presenceList(room),
      messages: room.messages.slice(-50),
    });
    broadcast(room, 'presence', { code, participants: presenceList(room) }, socket);
    broadcast(room, 'member-joined', { code, name: presence.name, id: presence.id }, socket);

    socket.on('message', (data: Buffer) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (payload && typeof payload === 'object') handleMessage(room, socket, presence, payload);
    });

    const cleanup = () => {
      room.sockets.delete(socket);
      presence.seenAt = 0;
      presence.cursor = null;
      broadcast(room, 'presence', { code, participants: presenceList(room) });
      broadcast(room, 'member-left', { code, name: presence.name, id: presence.id });
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
  });
}
