import type { ApiRoute } from '../http';

import { z } from 'zod';
import {
  createCircuit,
  createRoom,
  ensurePresence,
  findRoom,
  joinRoom,
  leaveRoom,
  listRoomsFor,
  livePresence,
  touchRoom,
  updateCursor,
} from '@/lib/db/repo';
import { publishRoomEvent } from '@/lib/db/supabase';
import { circuitDocSchema, roomCreateSchema, roomJoinSchema, roomPatchSchema } from '@/lib/validation';
import type { CircuitDoc } from '@/lib/engine/types';
import type { CursorState, PresenceRecord } from '@/lib/db/store';
import { cachedEquivalent } from '@/lib/cache';
import { bodyOf, currentUser, fail, NO_STORE } from '../helpers';
import { CURSOR_TTL, openRoomStream, TICK_MS } from '../roomStream';

const cursorBodySchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  vx: z.number().finite().optional(),
  vy: z.number().finite().optional(),
  vw: z.number().finite().optional(),
  vh: z.number().finite().optional(),
  hover: z.string().max(64).nullable().optional(),
  tool: z.string().max(24).optional(),
  at: z.number().finite().optional(),
  activity: z.string().max(80).optional(),
  idle: z.boolean().optional(),
});

export interface RoomRouteOptions {
  /** sert le flux SSE (serveur autonome) ; false = flux fourni par l'hôte */
  sse: boolean;
}

export const roomRoutes: ApiRoute[] = [
// ---- liste des ateliers de l'utilisateur
  ['GET', '/api/rooms', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const rooms = await listRoomsFor(user.id);
    reply.header('Cache-Control', 'no-store');
    return reply.send({
      rooms: rooms.map((r) => ({
        code: r.code,
        name: r.name,
        circuitId: r.circuitId,
        ownerId: r.ownerId,
        ownerName: r.ownerName,
        projectId: r.projectId,
        participants: Object.values(r.presence),
        revision: r.revision,
        updatedAt: r.updatedAt,
      })),
    });
  }],

  // ---- création d'un atelier (à partir d'un montage ou d'un document)
  ['POST', '/api/rooms', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = roomCreateSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Montage invalide.');
    }
    const doc = circuitDocSchema.parse(parsed.data.doc) as CircuitDoc;
    const eq = cachedEquivalent(doc);

    let circuitId = parsed.data.circuitId;
    if (!circuitId) {
      const circuit = await createCircuit({
        ownerId: user.id,
        name: doc.name,
        notes: doc.notes ?? '',
        doc,
        lastResult: eq.ok
          ? {
              vth: Math.hypot(eq.vth.re, eq.vth.im),
              rth: Math.hypot(eq.rth.re, eq.rth.im),
              inorton: Math.hypot(eq.inorton.re, eq.inorton.im),
              regime: doc.regime,
            }
          : undefined,
      });
      circuitId = circuit.id;
    }

    const room = await createRoom({
      owner: user,
      name: parsed.data.name,
      circuitId,
      doc,
      projectId: parsed.data.projectId,
    });
    return reply.code(201).send({
      code: room.code,
      name: room.name,
      circuitId: room.circuitId,
      projectId: room.projectId,
      revision: room.revision,
      createdAt: room.createdAt,
    });
  }],

  // ---- rejoindre un atelier par son code
  ['POST', '/api/rooms/join', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = roomJoinSchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Code invalide.');
    const result = await joinRoom(parsed.data.code, user);
    if ('error' in result) return fail(reply, 404, result.error, { code: result.code });
    return reply.send({
      code: result.room.code,
      name: result.room.name,
      circuitId: result.room.circuitId,
      ownerName: result.room.ownerName,
      participants: Object.entries(result.room.presence).map(([id, p]) => ({ id, ...p })),
      revision: result.room.revision,
      updatedAt: result.room.updatedAt,
    });
  }],

  // ---- détail / sondage (rev) / mise à jour / départ
  ['GET', '/api/rooms/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const query = (request.query ?? {}) as Record<string, string>;
    const since = Number(query.rev ?? '0');
    const isPoll = 'rev' in query;

    const user = await currentUser(request);
    const room = await findRoom(code);
    if (!room) {
      return fail(reply, 404, 'Atelier introuvable ou fermé.', { code: 'room_not_found' });
    }
    const presence = livePresence(room);

    if (isPoll) {
      if (user) {
        const previous = room.presence[user.id];
        room.presence[user.id] = {
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          color: previous?.color ?? '#38e1e6',
          at: new Date().toISOString(),
          cursor: previous?.cursor,
          idle: previous?.idle,
          activity: previous?.activity,
          seenAt: Date.now(),
        };
        await touchRoom(code, { presence: room.presence });
      }
      reply.header('Cache-Control', NO_STORE['Cache-Control']);
      return reply.send({
        code: room.code,
        name: room.name,
        revision: room.revision,
        changed: room.revision > since,
        doc: room.revision > since ? room.doc : undefined,
        participants: presence,
        messages: room.messages.slice(-40),
        ownerId: room.ownerId,
        ownerName: room.ownerName,
        circuitId: room.circuitId,
        projectId: room.projectId,
      });
    }

    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({
      code: room.code,
      name: room.name,
      revision: room.revision,
      doc: room.doc,
      participants: presence,
      messages: room.messages.slice(-40),
      ownerId: room.ownerId,
      ownerName: room.ownerName,
      circuitId: room.circuitId,
    });
  }],

  ['PATCH', '/api/rooms/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const room = await findRoom(code);
    if (!room) return fail(reply, 404, 'Atelier introuvable ou fermé.');
    const parsed = roomPatchSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Données invalides.');
    }

    const messages = [...room.messages];
    if (parsed.data.message) {
      messages.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        authorId: user.id,
        authorName: user.name,
        text: parsed.data.message,
        at: new Date().toISOString(),
      });
    }

    const doc = parsed.data.doc as CircuitDoc | undefined;
    const updated = await touchRoom(code, {
      doc: doc ?? room.doc,
      name: parsed.data.name ?? room.name,
      messages: messages.slice(-80),
      revision: room.revision + 1,
      presence: {
        ...room.presence,
        [user.id]: {
          ...room.presence[user.id],
          id: user.id,
          name: user.name,
          avatar: user.avatar,
          color: room.presence[user.id]?.color ?? '#38e1e6',
          at: new Date().toISOString(),
          seenAt: Date.now(),
        },
      },
    });

    void publishRoomEvent({
      code,
      kind: doc ? 'doc' : 'chat',
      userId: user.id,
      data: { revision: updated?.revision },
    }).catch(() => undefined);

    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({ revision: updated?.revision ?? room.revision + 1, savedAt: updated?.updatedAt });
  }],

  ['DELETE', '/api/rooms/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    await leaveRoom(code, user.id);
    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({ ok: true });
  }],

  // ---- curseur (appelé à ~10 Hz par le studio)
  ['POST', '/api/rooms/:code/cursor', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = cursorBodySchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'Curseur invalide.');
    const data = parsed.data;

    const hidden =
      data.idle === true ||
      data.x === undefined ||
      data.y === undefined ||
      (data.x === 0 && data.y === 0);
    const cursor: CursorState | null = hidden
      ? null
      : {
          x: data.x as number,
          y: data.y as number,
          vx: data.vx,
          vy: data.vy,
          vw: data.vw,
          vh: data.vh,
          hover: data.hover ?? null,
          tool: data.tool,
          at: Date.now(),
        };

    const presenceRev = await updateCursor(code, user, cursor, data.activity);
    if (presenceRev === null) return fail(reply, 404, 'Atelier introuvable ou fermé.');
    reply.header('Cache-Control', 'no-store');
    return reply.send({ ok: true, rev: presenceRev });
  }]
];

