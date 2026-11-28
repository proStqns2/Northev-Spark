/**
 * Tests de l'écriture collaborative côté serveur.
 *
 * Ils passent par le **vrai** dépôt (`lib/db/repo`) et un dossier de données
 * temporaire : ce qui est vérifié ici est exactement ce que fait
 * `PATCH /api/rooms/:code`. La garantie à tenir est simple : deux personnes
 * qui partent de la même révision et modifient deux dipôles différents
 * doivent se retrouver avec **les deux** dans le document, quelle que soit
 * l'ordre d'arrivée des requêtes.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dataDir = mkdtempSync(path.join(tmpdir(), 'northev-rooms-'));
process.env.DATA_DIR = dataDir;

type Repo = typeof import('./repo');
type Doc = {
  name: string;
  notes?: string;
  ground: string;
  terminals: { a: string | null; b: string | null };
  regime: 'dc' | 'ac';
  frequency: number;
  components: Array<{ id: string; kind: string; a: string; b: string; value: number; label?: string }>;
};

function user(id: string, name: string) {
  return { id, email: `${id}@lab.fr`, name, role: 'user' as const, avatar: id.slice(0, 2), theme: 'dark' };
}

const alice = user('u_alice', 'Alice');
const bob = user('u_bob', 'Bob');

function baseDoc(): Doc {
  return {
    name: 'Atelier test',
    notes: '',
    ground: '0,0',
    terminals: { a: '0,0', b: '8,0' },
    regime: 'dc',
    frequency: 50,
    components: [
      { id: 'E1', kind: 'vsource', a: '0,0', b: '0,4', value: 12 },
      { id: 'R1', kind: 'resistor', a: '0,4', b: '4,4', value: 500 },
      { id: 'R2', kind: 'resistor', a: '4,4', b: '8,0', value: 500 },
    ],
  };
}

describe('écriture collaborative côté serveur', () => {
  let r: Repo;

  before(async () => {
    // l'import est différé : le dépôt lit DATA_DIR au chargement du module
    r = await import('./repo');
  });

  after(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('cumule deux éditions concurrentes sans perdre la première', async () => {
    const room = await r.createRoom({ owner: alice, name: 'Test', circuitId: 'c_test', doc: baseDoc() });
    const revision = room.revision;
    const start = baseDoc();

    // Alice ajoute une résistance, en partant de `revision`
    const aliceDoc: Doc = {
      ...start,
      components: [...start.components, { id: 'R3', kind: 'resistor', a: '8,0', b: '8,4', value: 220 }],
    };
    const first = await r.applyRoomDoc(room.code, { doc: aliceDoc, baseRevision: revision, author: alice });
    assert.equal(first.ok, true);
    assert.equal(first.revision, revision + 1);

    // Bob n'a pas vu la révision d'Alice : il ajoute un condensateur et change R1
    const bobDoc: Doc = {
      ...start,
      components: [
        ...start.components.map((c) => (c.id === 'R1' ? { ...c, value: 1000 } : c)),
        { id: 'C1', kind: 'capacitor', a: '4,4', b: '4,8', value: 1e-6 },
      ],
    };
    const second = await r.applyRoomDoc(room.code, { doc: bobDoc, baseRevision: revision, author: bob });
    assert.equal(second.ok, true);
    assert.equal(second.merged, true, 'le client doit être réaligné');

    const merged = second.doc as Doc;
    const ids = merged.components.map((c) => c.id).sort();
    assert.deepEqual(ids, ['C1', 'E1', 'R1', 'R2', 'R3']);
    assert.equal(merged.components.find((c) => c.id === 'R1')?.value, 1000, 'la modification de Bob reste');
    assert.equal(merged.components.find((c) => c.id === 'R3')?.value, 220, 'l’ajout d’Alice reste');

    // et la salle relue par un troisième participant voit bien les deux
    const reread = await r.findRoom(room.code);
    assert.deepEqual(
      (reread?.doc as Doc).components.map((c) => c.id).sort(),
      ['C1', 'E1', 'R1', 'R2', 'R3'],
    );
  });

  it('ne ressuscite pas une pièce supprimée par un autre', async () => {
    const room = await r.createRoom({ owner: alice, name: 'Suppression', circuitId: 'c_del', doc: baseDoc() });
    const revision = room.revision;
    const start = baseDoc();

    // Alice supprime R2
    const aliceDoc: Doc = { ...start, components: start.components.filter((c) => c.id !== 'R2') };
    const first = await r.applyRoomDoc(room.code, { doc: aliceDoc, baseRevision: revision, author: alice });
    assert.equal(first.ok, true);

    // Bob change uniquement la valeur de R1 (il a encore R2 dans sa base)
    const bobDoc: Doc = {
      ...start,
      components: start.components.map((c) => (c.id === 'R1' ? { ...c, value: 47 } : c)),
    };
    const second = await r.applyRoomDoc(room.code, { doc: bobDoc, baseRevision: revision, author: bob });
    const merged = second.doc as Doc;
    assert.equal(merged.components.some((c) => c.id === 'R2'), false, 'R2 doit rester supprimée');
    assert.equal(merged.components.find((c) => c.id === 'R1')?.value, 47);
  });

  it('arbitre une collision et la signale', async () => {
    const room = await r.createRoom({ owner: alice, name: 'Collision', circuitId: 'c_col', doc: baseDoc() });
    const revision = room.revision;
    const start = baseDoc();

    const aliceDoc: Doc = {
      ...start,
      components: start.components.map((c) => (c.id === 'R1' ? { ...c, value: 100 } : c)),
    };
    await r.applyRoomDoc(room.code, { doc: aliceDoc, baseRevision: revision, author: alice });

    const bobDoc: Doc = {
      ...start,
      components: start.components.map((c) => (c.id === 'R1' ? { ...c, value: 900 } : c)),
    };
    const second = await r.applyRoomDoc(room.code, { doc: bobDoc, baseRevision: revision, author: bob });
    assert.ok((second.conflicts?.length ?? 0) > 0, 'la collision doit être signalée, pas silencieuse');
    // le serveur garde la version déjà enregistrée, et le client la reçoit
    assert.equal((second.doc as Doc).components.find((c) => c.id === 'R1')?.value, 100);
  });

  it('pose un verrou, le refuse au second et le libère', async () => {
    const room = await r.createRoom({ owner: alice, name: 'Verrous', circuitId: 'c_lock', doc: baseDoc() });

    const first = await r.lockComponent(room.code, 'R1', alice);
    assert.equal(first.granted, true);
    assert.equal(first.ttlMs > 0, true);

    const second = await r.lockComponent(room.code, 'R1', bob);
    assert.equal(second.granted, false);
    assert.equal(second.holder?.name, 'Alice');

    // réentrance : Alice peut prolonger son propre verrou
    assert.equal((await r.lockComponent(room.code, 'R1', alice)).granted, true);

    const afterRelease = await r.unlockComponents(room.code, alice, 'R1');
    assert.equal(Object.keys(afterRelease).length, 0);
    assert.equal((await r.lockComponent(room.code, 'R1', bob)).granted, true);
  });

  it('garde une frise de versions et sait restaurer', async () => {
    const room = await r.createRoom({ owner: alice, name: 'Frise', circuitId: 'c_hist', doc: baseDoc() });
    // `createRoom` renvoie l'objet vivant : on fige la révision avant d'écrire
    const initialRevision = room.revision;
    const start = baseDoc();
    const changed: Doc = {
      ...start,
      components: start.components.map((c) => (c.id === 'R1' ? { ...c, value: 1234 } : c)),
    };
    const write = await r.applyRoomDoc(room.code, { doc: changed, baseRevision: initialRevision, author: alice });
    assert.equal(write.ok, true);

    const versions = await r.roomHistory(room.code);
    assert.ok(versions.some((v) => v.revision === initialRevision), 'la version d’origine doit être dans la frise');

    const restore = await r.restoreRoomRevision(room.code, initialRevision, bob);
    assert.equal(restore.ok, true);
    assert.equal(restore.revision, (write.revision ?? 0) + 1);
    const restored = restore.doc as Doc;
    assert.equal(restored.components.find((c) => c.id === 'R1')?.value, 500);

    // l'état courant d'avant restauration n'est pas perdu
    const afterRestore = await r.roomHistory(room.code);
    assert.ok(afterRestore.some((v) => v.revision === write.revision));
  });

  it('compte les réactions sans doublon', async () => {
    const room = await r.createRoom({ owner: alice, name: 'Chat', circuitId: 'c_chat', doc: baseDoc() });
    await r.touchRoom(room.code, {
      messages: [{ id: 'm1', authorId: alice.id, authorName: alice.name, text: 'ok', at: new Date().toISOString() }],
    });
    assert.equal(await r.reactToMessage(room.code, bob, 'm1', '👍'), true);
    assert.equal(await r.reactToMessage(room.code, alice, 'm1', '👍'), true);
    const reread = await r.findRoom(room.code);
    assert.equal(reread?.messages[0]?.reactions?.['👍'].length, 2);
    // retirer sa propre réaction
    assert.equal(await r.reactToMessage(room.code, bob, 'm1', '👍'), true);
    const again = await r.findRoom(room.code);
    assert.deepEqual(again?.messages[0]?.reactions?.['👍'], [alice.id]);
  });
});
