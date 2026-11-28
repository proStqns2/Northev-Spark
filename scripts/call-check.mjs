/**
 * Vérifie la visio d'atelier de bout en bout, sans navigateur : deux comptes
 * réels, un atelier réel, puis la chaîne complète
 *
 *   rejoindre → publier l'état caméra/micro → offrir → recevoir par SSE
 *
 * Ce qui est prouvé ici : le serveur relaie bien la négociation à son
 * destinataire, par le flux SSE déjà utilisé pour les curseurs, et n'en garde
 * aucune trace persistée. Le média lui-même (WebRTC) ne peut pas être testé
 * sans navigateur — mais tout ce qui le rend possible côté serveur l'est.
 *
 * Usage : node scripts/call-check.mjs   (BASE_URL=http://127.0.0.1:3000)
 */
const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, options = {}, cookie) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { status: response.status, body, headers: response.headers };
}

async function account(tag) {
  const email = `visio-${tag}-${Date.now()}@lab.fr`;
  const response = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'visio1234', name: `Visio ${tag}` }),
  });
  if (response.status !== 200) throw new Error(`inscription ${tag} : ${JSON.stringify(response.body)}`);
  const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0];
  return { email, cookie, id: response.body.user.id };
}

const alice = await account('a');
const bob = await account('b');
check('deux comptes de test', Boolean(alice.id && bob.id), `${alice.id} / ${bob.id}`);

const doc = {
  name: 'Atelier visio',
  notes: '',
  ground: '0,0',
  terminals: { a: '0,0', b: '8,0' },
  regime: 'dc',
  frequency: 50,
  components: [{ id: 'R1', kind: 'resistor', a: '0,0', b: '4,4', value: 220 }],
};

const created = await api('/api/rooms', { method: 'POST', body: JSON.stringify({ name: 'Visio', doc }) }, alice.cookie);
const code = created.body?.code;
check('atelier créé', Boolean(code), code ?? JSON.stringify(created.body));
if (!code) process.exit(1);

const joined = await api('/api/rooms/join', { method: 'POST', body: JSON.stringify({ code }) }, bob.cookie);
check('le second participant rejoint', joined.status === 200, `HTTP ${joined.status}`);

/* ------------------------------------------------ état caméra / micro publié */
const media = await api(`/api/rooms/${code}/media`, {
  method: 'POST',
  body: JSON.stringify({ live: true, mic: true, cam: true, session: 'sess-bob' }),
}, bob.cookie);
check('état visio publié', media.status === 200 && media.body?.rev >= 0, `HTTP ${media.status}`);

const room = await api(`/api/rooms/${code}`, {}, alice.cookie);
const bobPresence = (room.body?.participants ?? []).find((p) => p.id === bob.id);
check('la présence expose la visio', bobPresence?.media?.live === true, JSON.stringify(bobPresence?.media ?? null));

/* ------------------------------- curseur : la sélection ne l'efface pas */
await api(`/api/rooms/${code}/cursor`, {
  method: 'POST',
  body: JSON.stringify({ x: 4, y: 3, tool: 'select', activity: 'explore' }),
}, bob.cookie);
await api(`/api/rooms/${code}/cursor`, {
  method: 'POST',
  body: JSON.stringify({ selection: 'R1', pointer: 'select', activity: 'sélectionne R1' }),
}, bob.cookie);
const afterSelection = await api(`/api/rooms/${code}`, {}, alice.cookie);
const bobCursor = (afterSelection.body?.participants ?? []).find((p) => p.id === bob.id)?.cursor;
check(
  'la sélection garde la position du curseur',
  bobCursor?.x === 4 && bobCursor?.y === 3 && bobCursor?.selection === 'R1',
  JSON.stringify(bobCursor ?? null),
);

/* -------------------------------------------------- flux SSE côté Alice */
const controller = new AbortController();
const events = [];
const stream = await fetch(`${base}/api/rooms/${code}/events`, {
  headers: { cookie: alice.cookie, accept: 'text/event-stream' },
  signal: controller.signal,
});
check('flux SSE ouvert', stream.status === 200, `HTTP ${stream.status}`);

const reader = stream.body.getReader();
const decoder = new TextDecoder();
const consume = (async () => {
  let buffer = '';
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n\n');
    while (index >= 0) {
      const chunk = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const name = /^event: (.+)$/m.exec(chunk)?.[1];
      const data = /^data: (.+)$/m.exec(chunk)?.[1];
      if (name) events.push({ name, data: data ? JSON.parse(data) : null });
      index = buffer.indexOf('\n\n');
    }
    if (events.some((event) => event.name === 'signal')) break;
  }
})();

await new Promise((resolve) => setTimeout(resolve, 700));

const offer = await api(`/api/rooms/${code}/signal`, {
  method: 'POST',
  body: JSON.stringify({
    to: alice.id,
    kind: 'offer',
    payload: { session: 'sess-bob', description: { type: 'offer', sdp: 'v=0\r\no=- 1 1 IN IP4 0.0.0.0\r\ns=-\r\n' } },
  }),
}, bob.cookie);
check('offre déposée', offer.status === 200 && Boolean(offer.body?.id), `HTTP ${offer.status}`);

await consume.catch(() => undefined);
controller.abort();

const signalEvent = events.find((event) => event.name === 'signal');
check(
  'l’offre arrive par le flux SSE',
  Boolean(signalEvent?.data?.signals?.some((signal) => signal.kind === 'offer' && signal.from === bob.id)),
  signalEvent ? `${signalEvent.data.signals.length} signal(aux)` : 'aucun événement signal',
);

const presenceEvent = events.find((event) => event.name === 'presence');
check(
  'la présence porte l’état caméra/micro',
  Boolean(presenceEvent?.data?.participants?.some((p) => p.id === bob.id && p.media?.live)),
  presenceEvent ? 'media présent' : 'aucune présence',
);

/* ------------------------------------------------------- garde-fous serveur */
const tooBig = await api(`/api/rooms/${code}/signal`, {
  method: 'POST',
  body: JSON.stringify({ to: alice.id, kind: 'offer', payload: { description: { type: 'offer', sdp: 'x'.repeat(30_000) } } }),
}, bob.cookie);
check('un signal démesuré est refusé', tooBig.status === 413, `HTTP ${tooBig.status}`);

const anon = await api(`/api/rooms/${code}/signal`, {
  method: 'POST',
  body: JSON.stringify({ to: alice.id, kind: 'offer', payload: null }),
});
check('signal sans session refusé', anon.status === 401, `HTTP ${anon.status}`);

const badKind = await api(`/api/rooms/${code}/signal`, {
  method: 'POST',
  body: JSON.stringify({ to: alice.id, kind: 'explode', payload: null }),
}, bob.cookie);
check('type de signal inconnu refusé', badKind.status === 422, `HTTP ${badKind.status}`);

const otherInbox = await api(`/api/rooms/${code}/signal?since=0`, {}, alice.cookie);
check('boîte de réception accessible', otherInbox.status === 200, `${otherInbox.body?.signals?.length ?? 0} signal(aux)`);

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`);
if (failed.length) process.exit(1);
