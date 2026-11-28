import {
  ensurePresence,
  findRoom,
  livePresence,
  roomSignalsFor,
} from '@/lib/db/repo';
import { expireLocks, lockSummary } from '@/lib/collab/locks';
import { sanitizeDoc } from '@/lib/collab/merge';
import type { CursorState, PresenceRecord } from '@/lib/db/store';
import type { SessionUser } from '@/lib/auth/session';

/**
 * Flux d'événements d'une salle de travail.
 *
 * Producteur unique, servi par le flux `ReadableStream` de
 * `app/api/rooms/[code]/events/route.ts` — donc entièrement dans Next.js.
 *
 * Chaque appel à `poll()` relit la salle et ne renvoie que ce qui a changé
 * (présence, curseurs, révision, dernier message), ce qui permet à plusieurs
 * instances de servir des clients différents tout en partageant le même état.
 */

export const CURSOR_TTL = 12000;
export const TICK_MS = 110; // ~9 rafraîchissements par seconde

export interface RoomStreamEvent {
  event: string;
  data: unknown;
}

export interface RoomStream {
  /** événement `ready` (salle absente → null) */
  start(): Promise<RoomStreamEvent[] | null>;
  /** ce qui a changé depuis le dernier appel */
  poll(): Promise<RoomStreamEvent[]>;
}

export function openRoomStream(code: string, user: SessionUser): RoomStream {
  let revision = 0;
  let lastPresenceSignature = '';
  let lastCursorSignature = '';
  let lastMessageId: string | null = null;
  let lastLockSignature = '';
  let lastTypingSignature = '';
  /* relais WebRTC : on ne renvoie que les signaux jamais transmis */
  let signalSince = Date.now();
  const emittedSignals = new Set<string>();

  return {
    async start() {
      const room = await findRoom(code);
      if (!room) return null;
      await ensurePresence(code, user);
      lastMessageId = room.messages.at(-1)?.id ?? '';
      // on tolère les signaux partis juste avant l'ouverture du flux
      signalSince = Date.now() - 1500;
      emittedSignals.clear();
      return [
        {
          event: 'ready',
          data: {
            code,
            user: { id: user.id, name: user.name },
            presence: livePresence(room) as PresenceRecord[],
          },
        },
      ];
    },

    async poll() {
      const room = await findRoom(code);
      if (!room) return [{ event: 'room-closed', data: { code } }];

      const events: RoomStreamEvent[] = [];
      const participants = livePresence(room);

      const presenceSignature = participants
        .map(
          (p) =>
            `${p.id}:${p.name}:${p.color}:${p.activity ?? ''}:${p.idle ? 1 : 0}:${
              p.media?.live ? `m${p.media.mic ? 1 : 0}${p.media.cam ? 1 : 0}` : ''
            }:${p.media?.session ?? ''}`,
        )
        .sort()
        .join('|');
      if (presenceSignature !== lastPresenceSignature) {
        lastPresenceSignature = presenceSignature;
        events.push({ event: 'presence', data: { participants } });
      }

      const now = Date.now();
      const cursors = participants
        .filter((p) => p.id !== user.id && p.cursor)
        .map((p) => {
          const cursor = p.cursor as CursorState;
          const age = now - (cursor.at ?? now);
          return {
            id: p.id,
            name: p.name,
            color: p.color,
            avatar: p.avatar,
            x: cursor.x,
            y: cursor.y,
            // fenêtre visible du pair (mini-carte « où regarde-t-il »)
            vx: cursor.vx ?? null,
            vy: cursor.vy ?? null,
            vw: cursor.vw ?? null,
            vh: cursor.vh ?? null,
            hover: cursor.hover ?? null,
            tool: cursor.tool ?? null,
            pointer: cursor.pointer ?? null,
            selection: cursor.selection ?? null,
            pressed: Boolean(cursor.pressed),
            idle: age > CURSOR_TTL || Boolean(p.idle),
            fresh: age < 2500,
            ageMs: age,
            media: p.media ? { live: p.media.live, mic: p.media.mic, cam: p.media.cam } : null,
          };
        });
      const cursorSignature = cursors
        .map(
          (c) =>
            `${c.id}:${c.x.toFixed(1)}:${c.y.toFixed(1)}:${c.idle ? 1 : 0}:${c.tool ?? ''}:${
              c.selection ?? ''
            }:${c.pressed ? 1 : 0}:${c.vw ? Math.round(c.vw) : 0}x${c.vh ? Math.round(c.vh) : 0}:${
              c.media?.live ? (c.media.cam ? 'c' : '') + (c.media.mic ? 'm' : '') : ''
            }`,
        )
        .join('|');
      if (cursorSignature !== lastCursorSignature) {
        lastCursorSignature = cursorSignature;
        events.push({ event: 'cursors', data: { cursors } });
      }

      if (room.revision !== revision) {
        const first = revision === 0;
        revision = room.revision;
        events.push({
          event: 'revision',
          data: {
            revision: room.revision,
            updatedAt: room.updatedAt,
            author: room.messages.at(-1)?.authorName,
            // le document accompagne la révision : plus besoin de re-sonder
            doc: first ? undefined : sanitizeDoc(room.doc as never),
            locks: lockSummary(expireLocks(room.locks ?? {}, now), now),
          },
        });
      }

      const locks = lockSummary(expireLocks(room.locks ?? {}, now), now);
      const lockSignature = locks.map((l) => `${l.componentId}:${l.userId}:${Math.round(l.ttlMs / 1000)}`).join('|');
      if (lockSignature !== lastLockSignature) {
        lastLockSignature = lockSignature;
        events.push({ event: 'locks', data: { locks } });
      }

      const typing = Object.entries(room.typing ?? {})
        .filter(([, entry]) => now - entry.at < 6_000)
        .map(([id, entry]) => ({ id, name: entry.name }));
      const typingSignature = typing.map((t) => `${t.id}:${t.name}`).sort().join('|');
      if (typingSignature !== lastTypingSignature) {
        lastTypingSignature = typingSignature;
        events.push({ event: 'typing', data: { typing } });
      }

      const lastMessage = room.messages.at(-1);
      if (lastMessage && lastMessage.id !== lastMessageId) {
        lastMessageId = lastMessage.id;
        events.push({
          event: 'chat',
          data: { message: lastMessage, messages: room.messages.slice(-40) },
        });
      }

      const pending = await roomSignalsFor(code, user.id, signalSince);
      const newSignals = pending.filter((signal) => !emittedSignals.has(signal.id));
      if (newSignals.length) {
        for (const signal of newSignals) {
          emittedSignals.add(signal.id);
          if (signal.at > signalSince) signalSince = signal.at;
        }
        // la mémoire du relais reste bornée (les signaux expirent en 45 s)
        if (emittedSignals.size > 400) {
          const keep = newSignals.map((signal) => signal.id);
          emittedSignals.clear();
          for (const id of keep) emittedSignals.add(id);
        }
        events.push({
          event: 'signal',
          data: {
            signals: newSignals.map((signal) => ({
              id: signal.id,
              from: signal.from,
              fromName: signal.fromName,
              kind: signal.kind,
              payload: signal.payload,
              at: signal.at,
            })),
          },
        });
      }

      return events;
    },
  };
}
