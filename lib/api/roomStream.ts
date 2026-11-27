import {
  ensurePresence,
  findRoom,
  livePresence,
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

  return {
    async start() {
      const room = await findRoom(code);
      if (!room) return null;
      await ensurePresence(code, user);
      lastMessageId = room.messages.at(-1)?.id ?? '';
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
        .map((p) => `${p.id}:${p.name}:${p.color}:${p.activity ?? ''}:${p.idle ? 1 : 0}`)
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
            hover: cursor.hover ?? null,
            tool: cursor.tool ?? null,
            idle: age > CURSOR_TTL || Boolean(p.idle),
            fresh: age < 2500,
          };
        });
      const cursorSignature = cursors
        .map((c) => `${c.id}:${c.x.toFixed(1)}:${c.y.toFixed(1)}:${c.idle ? 1 : 0}:${c.tool ?? ''}`)
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

      return events;
    },
  };
}
