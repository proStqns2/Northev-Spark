import { readSessionToken } from '@/lib/auth/session';
import { findRoom, resolveSession } from '@/lib/db/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ code: string }> };

/**
 * Flux Server-Sent Events de l'atelier : les changements de révision, la
 * présence et le chat sont poussés en temps réel vers les navigateurs.
 * Aucune dépendance externe n'est requise (fonctionne derrière un proxy Next).
 */
export async function GET(request: Request, { params }: Params) {
  const { code } = await params;
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) return new Response('Non authentifié', { status: 401 });

  const room = await findRoom(code);
  if (!room) return new Response('Atelier introuvable', { status: 404 });

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      let revision = 0;
      let presenceSignature = '';

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
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
          const participants = Object.entries(current.presence).map(([id, p]) => ({ id, ...p }));
          const signature = participants
            .map((p) => `${p.id}:${p.name}:${p.at}`)
            .sort()
            .join('|');
          if (current.revision !== revision) {
            revision = current.revision;
            send('revision', {
              revision: current.revision,
              updatedAt: current.updatedAt,
              messages: current.messages.slice(-1),
            });
          }
          if (signature !== presenceSignature) {
            presenceSignature = signature;
            send('presence', { participants });
          }
          send('ping', { t: Date.now() });
        } catch {
          // on retentera au prochain battement
        }
      };

      const interval = setInterval(tick, 2500);
      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
      }, 15000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      };

      request.signal.addEventListener('abort', cleanup);
      send('ready', { code, user: { id: user.id, name: user.name } });
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
