import { readSessionToken } from '@/lib/auth/session';
import { ensurePresence, findRoom, livePresence, resolveSession } from '@/lib/db/repo';
import { PresenceRecord } from '@/lib/db/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ code: string }> };

const CURSOR_TTL = 12000;
const TICK_MS = 110; // ~9 rafraîchissements par seconde

/**
 * Flux Server-Sent Events de l'atelier.
 * - `presence`  : participants (nom, couleur, avatar, activité)
 * - `cursors`   : positions interpolées des curseurs, en diff (10 Hz)
 * - `revision`  : le montage a changé (déclenche un rafraîchissement)
 * - `chat`      : nouveau message
 * Un curseur n'est renvoyé que s'il a bougé : le flux reste très léger.
 */
export async function GET(request: Request, { params }: Params) {
  const { code } = await params;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return new Response('Non authentifié', { status: 401 });

  const room = await findRoom(code);
  if (!room) return new Response('Atelier introuvable', { status: 404 });

  await ensurePresence(code, user);

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let revision = 0;
      let lastPresenceSignature = '';
      let lastCursorSignature = '';
      let lastMessageId = room.messages.at(-1)?.id ?? '';

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const current = await findRoom(code);
          if (!current) {
            send('room-closed', { code });
            cleanup();
            return;
          }

          const participants = livePresence(current);
          const presenceSignature = participants
            .map((p) => `${p.id}:${p.name}:${p.color}:${p.activity ?? ''}:${p.idle ? 1 : 0}`)
            .sort()
            .join('|');
          if (presenceSignature !== lastPresenceSignature) {
            lastPresenceSignature = presenceSignature;
            send('presence', { participants });
          }

          const now = Date.now();
          const cursors = participants
            .filter((p) => p.id !== user.id && p.cursor)
            .map((p) => {
              const cursor = p.cursor!;
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
                idle: age > CURSOR_TTL || p.idle,
                fresh: age < 2500,
              };
            });
          const cursorSignature = cursors
            .map((c) => `${c.id}:${c.x.toFixed(1)}:${c.y.toFixed(1)}:${c.idle ? 1 : 0}:${c.tool ?? ''}`)
            .join('|');
          if (cursorSignature !== lastCursorSignature) {
            lastCursorSignature = cursorSignature;
            send('cursors', { cursors });
          }

          if (current.revision !== revision) {
            revision = current.revision;
            send('revision', {
              revision: current.revision,
              updatedAt: current.updatedAt,
              author: current.messages.at(-1)?.authorName,
            });
          }

          const lastMessage = current.messages.at(-1);
          if (lastMessage && lastMessage.id !== lastMessageId) {
            lastMessageId = lastMessage.id;
            send('chat', { message: lastMessage, messages: current.messages.slice(-40) });
          }
        } catch {
          /* on retentera au prochain battement */
        }
      };

      const interval = setInterval(tick, TICK_MS);
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          closed = true;
        }
      }, 15000);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        clearInterval(heartbeat);
        cleanup();
      });

      send('ready', {
        code,
        user: { id: user.id, name: user.name },
        presence: livePresence(room) as PresenceRecord[],
      });
      void tick();
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
