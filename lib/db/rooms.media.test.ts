/**
 * Tests serveur de la visio d'atelier : état caméra/micro dans la présence et
 * boîte aux lettres de signalisation WebRTC.
 *
 * Ce qui est vérifié ici est exactement ce que font `POST /api/rooms/:code/media`
 * et `POST /api/rooms/:code/signal`, avec le vrai dépôt et un dossier de données
 * temporaire. Deux garanties : la visio ne laisse aucune trace persistée, et un
 * signal n'est jamais remis à quelqu'un d'autre qu'à son destinataire.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'northev-media-'));
process.env.DATA_DIR = dataDir;

type Repo = typeof import('./repo');

function user(id: string, name: string) {
  return { id, email: `${id}@lab.fr`, name, role: 'user' as const, avatar: id.slice(0, 2), theme: 'dark' };
}

const alice = user('u_alice', 'Alice');
const bob = user('u_bob', 'Bob');
const carol = user('u_carol', 'Carol');

const doc = {
  name: 'Visio',
  notes: '',
  ground: '0,0',
  terminals: { a: '0,0', b: '8,0' },
  regime: 'dc' as const,
  frequency: 50,
  components: [{ id: 'R1', kind: 'resistor', a: '0,0', b: '4,4', value: 220 }],
};

describe('visio d’atelier côté serveur', () => {
  let r: Repo;
  let code = '';

  before(async () => {
    r = await import('./repo');
    const room = await r.createRoom({ owner: alice, name: 'Test visio', circuitId: 'c_media', doc });
    code = room.code;
    await r.joinRoom(code, bob);
    await r.joinRoom(code, carol);
  });

  after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('inscrit la visio dans la présence relayée aux autres', async () => {
    await r.setRoomMedia(code, alice, { live: true, mic: true, cam: true, session: 's-alice' });
    const room = await r.findRoom(code);
    assert.ok(room);
    const participants = r.livePresence(room);
    const mine = participants.find((p) => p.id === alice.id);
    assert.equal(mine?.media?.live, true);
    assert.equal(mine?.media?.cam, true);
    assert.equal(mine?.media?.session, 's-alice');
  });

  it('conserve la visio quand le curseur bouge', async () => {
    await r.updateCursor(code, alice, { x: 3, y: 4, tool: 'select', at: Date.now() }, 'explore');
    const room = await r.findRoom(code);
    const mine = r.livePresence(room as NonNullable<typeof room>).find((p) => p.id === alice.id);
    assert.equal(mine?.media?.live, true, 'le mouvement de curseur ne coupe pas la caméra');
    assert.equal(mine?.cursor?.x, 3);
  });

  it('met à jour la sélection sans effacer la position du curseur', async () => {
    await r.updateCursor(code, bob, { x: 6, y: 2, tool: 'select', at: Date.now() }, 'explore');
    const rev = await r.patchCursor(code, bob, { selection: 'R1', pointer: 'select' }, 'sélectionne R1');
    assert.equal(typeof rev, 'number');
    const room = await r.findRoom(code);
    const mine = r.livePresence(room as NonNullable<typeof room>).find((p) => p.id === bob.id);
    assert.equal(mine?.cursor?.x, 6, 'la position reste');
    assert.equal(mine?.cursor?.y, 2);
    assert.equal(mine?.cursor?.selection, 'R1');
    assert.equal(mine?.activity, 'sélectionne R1');
    assert.equal(mine?.idle, false, 'publier une sélection ne met pas le pair en veille');
  });

  it('retire la visio quand on quitte l’appel, sans toucher au curseur', async () => {
    await r.setRoomMedia(code, alice, { live: false });
    const room = await r.findRoom(code);
    const mine = r.livePresence(room as NonNullable<typeof room>).find((p) => p.id === alice.id);
    assert.equal(mine?.media, undefined);
    assert.equal(mine?.cursor?.x, 3, 'le curseur reste en place');
  });

  it('ne livre un signal qu’à son destinataire', async () => {
    const offer = await r.pushRoomSignal(code, alice, {
      to: bob.id,
      kind: 'offer',
      payload: { description: { type: 'offer', sdp: 'v=0' } },
    });
    assert.ok(offer);

    const forBob = await r.roomSignalsFor(code, bob.id, 0);
    assert.equal(forBob.some((s) => s.id === offer.id), true);
    const forCarol = await r.roomSignalsFor(code, carol.id, 0);
    assert.equal(forCarol.some((s) => s.id === offer.id), false);
    const forAlice = await r.roomSignalsFor(code, alice.id, 0);
    assert.equal(forAlice.some((s) => s.id === offer.id), false, 'on ne se relit pas soi-même');
  });

  it('diffuse un hello à tous sauf à son auteur', async () => {
    const hello = await r.pushRoomSignal(code, bob, {
      kind: 'hello',
      payload: { session: 's-bob', cam: true, mic: true },
    });
    assert.ok(hello);
    for (const other of [alice.id, carol.id]) {
      const inbox = await r.roomSignalsFor(code, other, 0);
      assert.equal(inbox.some((s) => s.id === hello.id), true);
    }
    const own = await r.roomSignalsFor(code, bob.id, 0);
    assert.equal(own.some((s) => s.id === hello.id), false);
  });

  it('filtre par horodatage : un flux ne revoit pas les signaux déjà transmis', async () => {
    const before = Date.now();
    const ice = await r.pushRoomSignal(code, carol, {
      to: alice.id,
      kind: 'ice',
      payload: { candidate: null },
    });
    assert.ok(ice);
    const recent = await r.roomSignalsFor(code, alice.id, before);
    assert.equal(recent.some((s) => s.id === ice.id), true);
    const after_ = await r.roomSignalsFor(code, alice.id, ice.at + 1);
    assert.equal(after_.some((s) => s.id === ice.id), false);
  });

  it('garde la boîte aux lettres bornée et volatile (rien sur disque)', async () => {
    for (let index = 0; index < 260; index += 1) {
      await r.pushRoomSignal(code, bob, { to: alice.id, kind: 'ice', payload: { n: index } });
    }
    const room = await r.findRoom(code);
    const stored = (room as NonNullable<typeof room>).signals ?? [];
    assert.ok(stored.length <= 240, `boîte bornée (${stored.length})`);
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(path.join(dataDir, 'db.json'), 'utf8').catch(() => '{}');
    // la persistance est déclenchée pour d'autres raisons : ce qui compte est
    // qu'aucun signal n'y figure
    assert.equal(raw.includes('"signals"'), false);
  });
});
