import { findRoom } from '@/lib/db/repo';
import { currentUserFromHeaders } from '@/lib/api/helpers';
import { CURSOR_TTL, TICK_MS, openRoomStream } from '@/lib/api/roomStream';

/**
 * Flux Server-Sent Events d'un atelier, servi directement par Next.
 *
 * L'état partagé est relu à chaque battement, donc deux instances
 * différentes diffusent la même salle.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  request: Request,
  context: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await context.params;

  const user = await currentUserFromHeaders(request.headers);
  if (!user) return Response.json({ error: 'Non authentifié' }, { status: 401 });

  const room = await findRoom(code);
  if (!room) return Response.json({ error: 'Atelier introuvable' }, { status: 404 });

  const stream = openRoomStream(code, user);
  const ready = await stream.start();
  if (!ready) return Response.json({ error: 'Atelier introuvable' }, { status: 404 });

  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const stop = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        if (heartbeat) clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* déjà fermé */
        }
      };

      const tick = async () => {
        if (closed) return;
        try {
          for (const event of await stream.poll()) {
            send(event.event, event.data);
            if (event.event === 'room-closed') {
              stop();
              return;
            }
          }
        } catch {
          /* on retentera au prochain battement */
        }
      };

      for (const event of ready) send(event.event, event.data);
      interval = setInterval(tick, TICK_MS);
      heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': keep-alive\n\n'));
        } catch {
          closed = true;
        }
      }, 15000);
      void tick();

      request.signal.addEventListener('abort', stop);
    },
    cancel() {
      if (interval) clearInterval(interval);
      if (heartbeat) clearInterval(heartbeat);
      interval = null;
      heartbeat = null;
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      // la sonde de curseurs expirés reste côté client ; on rappelle la TTL
      'X-Cursor-TTL': String(CURSOR_TTL),
    },
  });
}
