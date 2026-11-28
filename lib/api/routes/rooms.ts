import type { ApiRoute } from '../http';

import { z } from 'zod';
import {
  applyRoomDoc,
  createCircuit,
  createRoom,
  findRoom,
  joinRoom,
  leaveRoom,
  listRoomsFor,
  livePresence,
  lockComponent,
  reactToMessage,
  renewRoomLocks,
  restoreRoomRevision,
  roomHistory,
  roomLiveState,
  setRoomTyping,
  touchRoom,
  unlockComponents,
  updateCursor,
  patchCursor,
  pushRoomSignal,
  roomSignalsFor,
  setRoomMedia,
} from '@/lib/db/repo';
import { publishRoomEvent } from '@/lib/db/supabase';
import { circuitDocSchema, roomCreateSchema, roomJoinSchema, roomPatchSchema } from '@/lib/validation';
import type { CircuitDoc } from '@/lib/engine/types';
import type { CursorState, PresenceRecord } from '@/lib/db/store';
import { cachedEquivalent } from '@/lib/cache';
import { bodyOf, currentUser, fail, NO_STORE } from '../helpers';
import { CURSOR_TTL, openRoomStream, TICK_MS } from '../roomStream';

const lockBodySchema = z.object({
  componentId: z.string().min(1).max(64),
  action: z.enum(['acquire', 'release', 'release-all', 'renew']),
});

const typingBodySchema = z.object({ active: z.boolean() });

const reactBodySchema = z.object({
  messageId: z.string().min(1).max(64),
  emoji: z.string().min(1).max(8),
});

const restoreBodySchema = z.object({ revision: z.number().int().min(0) });

const cursorBodySchema = z.object({
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  vx: z.number().finite().optional(),
  vy: z.number().finite().optional(),
  vw: z.number().finite().optional(),
  vh: z.number().finite().optional(),
  hover: z.string().max(64).nullable().optional(),
  tool: z.string().max(24).optional(),
  /** bouton enfoncé (clic en cours) */
  pressed: z.boolean().optional(),
  /** dipôle sélectionné chez l'utilisateur */
  selection: z.string().max(24).nullable().optional(),
  /** style de pointeur annoncé par le client */
  pointer: z.string().max(24).optional(),
  at: z.number().finite().optional(),
  activity: z.string().max(80).optional(),
  idle: z.boolean().optional(),
});

const mediaBodySchema = z.object({
  live: z.boolean(),
  mic: z.boolean().optional(),
  cam: z.boolean().optional(),
  session: z.string().max(40).optional(),
});

const signalKindSchema = z.enum(['hello', 'offer', 'answer', 'ice', 'bye']);

const signalBodySchema = z.object({
  to: z.string().max(64).nullable().optional(),
  kind: signalKindSchema,
  payload: z.unknown().optional(),
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
    const live = await roomLiveState(code);

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
        locks: live.locks,
        typing: live.typing,
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
      locks: live.locks,
      typing: live.typing,
    });
  }],

  ['PATCH', '/api/rooms/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const exists = await findRoom(code);
    if (!exists) return fail(reply, 404, 'Atelier introuvable ou fermé.');
    const parsed = roomPatchSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Données invalides.');
    }
    const doc = parsed.data.doc as CircuitDoc | undefined;
    reply.header('Cache-Control', NO_STORE['Cache-Control']);

    // 1. le document passe par la fusion à trois branches : jamais d'écrasement
    let write: Awaited<ReturnType<typeof applyRoomDoc>> | null = null;
    if (doc) {
      write = await applyRoomDoc(code, {
        doc,
        baseRevision: parsed.data.baseRevision,
        author: user,
      });
      if (!write.ok) return fail(reply, 409, write.error ?? 'Écriture refusée.');
      void publishRoomEvent({
        code,
        kind: 'doc',
        userId: user.id,
        data: { revision: write.revision, author: user.name, stats: write.stats },
      }).catch(() => undefined);
    }

    // 2. le reste (nom, message) ne touche pas à la révision : discuter ne doit
    //    pas faire croire à un nouveau montage
    const room = await findRoom(code);
    if (!room) return fail(reply, 404, 'Atelier introuvable ou fermé.');
    if (parsed.data.name || parsed.data.message) {
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
      await touchRoom(code, {
        name: parsed.data.name ?? room.name,
        messages: messages.slice(-80),
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
      if (parsed.data.message) {
        void publishRoomEvent({
          code,
          kind: 'chat',
          userId: user.id,
          data: { text: parsed.data.message.slice(0, 120) },
        }).catch(() => undefined);
      }
    }

    const live = await roomLiveState(code);
    return reply.send({
      revision: write?.revision ?? room.revision,
      savedAt: write?.updatedAt ?? room.updatedAt,
      /** document réellement stocké : le client s'aligne dessus */
      doc: write?.doc,
      merged: Boolean(write?.merged),
      stats: write?.stats,
      conflicts: write?.conflicts ?? [],
      locks: live.locks,
    });
  }],

  // ---- verrous souples par dipôle
  ['POST', '/api/rooms/:code/locks', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = lockBodySchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'Demande de verrou invalide.');
    reply.header('Cache-Control', NO_STORE['Cache-Control']);

    if (parsed.data.action === 'renew') {
      return reply.send({ ok: true, locks: await renewRoomLocks(code, user) });
    }
    if (parsed.data.action === 'release') {
      const locks = await unlockComponents(code, user, parsed.data.componentId);
      void publishRoomEvent({ code, kind: 'lock', userId: user.id, data: { locks } }).catch(() => undefined);
      return reply.send({ ok: true, locks });
    }
    if (parsed.data.action === 'release-all') {
      const locks = await unlockComponents(code, user);
      void publishRoomEvent({ code, kind: 'lock', userId: user.id, data: { locks } }).catch(() => undefined);
      return reply.send({ ok: true, locks });
    }

    const result = await lockComponent(code, parsed.data.componentId, user);
    void publishRoomEvent({ code, kind: 'lock', userId: user.id, data: { locks: result.locks } }).catch(
      () => undefined,
    );
    if (!result.granted) {
      return reply.code(409).send({
        error: `${result.holder?.name ?? 'Quelqu’un'} travaille déjà sur ce dipôle.`,
        granted: false,
        holder: result.holder,
        locks: result.locks,
      });
    }
    return reply.send({ granted: true, locks: result.locks, ttlMs: result.ttlMs });
  }],

  // ---- « en train d’écrire… »
  ['POST', '/api/rooms/:code/typing', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = typingBodySchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'Signal de saisie invalide.');
    await setRoomTyping(code, user, parsed.data.active);
    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({ ok: true });
  }],

  // ---- frise des versions + restauration
  ['GET', '/api/rooms/:code/history', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const room = await findRoom(code);
    if (!room) return fail(reply, 404, 'Atelier introuvable ou fermé.');
    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({ revision: room.revision, versions: await roomHistory(code) });
  }],

  ['POST', '/api/rooms/:code/history', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = restoreBodySchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'Version invalide.');
    const result = await restoreRoomRevision(code, parsed.data.revision, user);
    if (!result.ok) return fail(reply, 404, result.error ?? 'Version introuvable.');
    void publishRoomEvent({
      code,
      kind: 'doc',
      userId: user.id,
      data: { revision: result.revision, restored: parsed.data.revision },
    }).catch(() => undefined);
    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({ ok: true, revision: result.revision, doc: result.doc });
  }],

  // ---- réactions sur les messages
  ['POST', '/api/rooms/:code/react', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = reactBodySchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'Réaction invalide.');
    const ok = await reactToMessage(code, user, parsed.data.messageId, parsed.data.emoji);
    if (!ok) return fail(reply, 404, 'Message introuvable.');
    const room = await findRoom(code);
    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({ ok: true, messages: room?.messages.slice(-40) ?? [] });
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

    // sans coordonnées, c'est une mise à jour partielle (sélection, outil) :
    // la position du pair ne doit pas être effacée pour autant
    const partial = data.idle !== true && data.x === undefined && data.y === undefined;
    if (partial) {
      const rev = await patchCursor(
        code,
        user,
        {
          ...(data.selection === undefined ? {} : { selection: data.selection ?? null }),
          ...(data.pointer === undefined ? {} : { pointer: data.pointer }),
          ...(data.hover === undefined ? {} : { hover: data.hover ?? null }),
          ...(data.pressed === undefined ? {} : { pressed: data.pressed }),
        },
        data.activity,
      );
      if (rev === null) return fail(reply, 404, 'Atelier introuvable ou fermé.');
      reply.header('Cache-Control', 'no-store');
      return reply.send({ ok: true, rev });
    }

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
          pressed: data.pressed,
          selection: data.selection ?? null,
          pointer: data.pointer,
          at: Date.now(),
        };

    const presenceRev = await updateCursor(code, user, cursor, data.activity);
    if (presenceRev === null) return fail(reply, 404, 'Atelier introuvable ou fermé.');
    reply.header('Cache-Control', 'no-store');
    return reply.send({ ok: true, rev: presenceRev });
  }],

  // ---- état de la visio (caméra + micro) : volatil, jamais persisté
  ['POST', '/api/rooms/:code/media', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = mediaBodySchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'État visio invalide.');
    const rev = await setRoomMedia(code, user, parsed.data);
    if (rev === null) return fail(reply, 404, 'Atelier introuvable ou fermé.');
    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({ ok: true, rev });
  }],

  // ---- relève des signaux (repli quand le flux SSE n'est pas disponible)
  ['GET', '/api/rooms/:code/signal', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const query = (request.query ?? {}) as Record<string, string>;
    const since = Number(query.since ?? '0');
    const signals = await roomSignalsFor(code, user.id, Number.isFinite(since) ? since : 0);
    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({
      signals: signals.map((signal) => ({
        id: signal.id,
        from: signal.from,
        fromName: signal.fromName,
        kind: signal.kind,
        payload: signal.payload,
        at: signal.at,
      })),
    });
  }],

  // ---- signalisation WebRTC relayée par le serveur d'atelier
  ['POST', '/api/rooms/:code/signal', async (request, reply) => {
    const { code } = request.params as { code: string };
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = signalBodySchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'Signal invalide.');
    // garde-fou : une offre SDP pèse quelques kilo-octets, pas plus
    let size = 0;
    try {
      size = JSON.stringify(parsed.data.payload ?? null).length;
    } catch {
      return fail(reply, 422, 'Signal illisible.');
    }
    if (size > 24_000) return fail(reply, 413, 'Signal trop volumineux.');
    const signal = await pushRoomSignal(code, user, parsed.data);
    if (!signal) return fail(reply, 404, 'Atelier introuvable ou fermé.');
    reply.header('Cache-Control', NO_STORE['Cache-Control']);
    return reply.send({ ok: true, id: signal.id, at: signal.at });
  }]
];

