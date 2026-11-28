import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { CircuitDoc, Component } from '@/lib/engine/types';
import { diffDocs, mergeDocs, sanitizeDoc } from './merge';

const part = (id: string, patch: Partial<Component> = {}): Component => ({
  id,
  kind: 'resistor',
  a: `${id}-a`,
  b: `${id}-b`,
  value: 1_000,
  label: id.toUpperCase(),
  ...patch,
});

const doc = (components: Component[], patch: Partial<CircuitDoc> = {}): CircuitDoc => ({
  name: 'Atelier',
  notes: '',
  components,
  ground: components[0]?.a ?? '',
  terminals: { a: null, b: null },
  regime: 'dc',
  frequency: 50,
  ...patch,
});

describe('fusion à trois branches', () => {
  it('cumule deux modifications indépendantes', () => {
    const base = doc([part('r1'), part('r2')]);
    const mine = doc([part('r1', { value: 2_200 }), part('r2')]); // je change R1
    const theirs = doc([part('r1'), part('r2', { value: 470 })]); // l'autre change R2

    const result = mergeDocs({ base, mine, theirs });
    assert.equal(result.doc.components.length, 2);
    assert.equal(result.doc.components.find((c) => c.id === 'r1')?.value, 2_200);
    assert.equal(result.doc.components.find((c) => c.id === 'r2')?.value, 470);
    assert.equal(result.conflicts.length, 0);
    assert.equal(result.changed, true);
  });

  it('ajoute les pièces créées par le client sans perdre celles du serveur', () => {
    const base = doc([part('r1')]);
    const mine = doc([part('r1'), part('r3')]);
    const theirs = doc([part('r1')]);

    const result = mergeDocs({ base, mine, theirs });
    assert.deepEqual(result.doc.components.map((c) => c.id), ['r1', 'r3']);
    assert.equal(result.stats.added, 1);
  });

  it('une suppression côté client survit à une écriture serveur ailleurs', () => {
    const base = doc([part('r1'), part('r2')]);
    const mine = doc([part('r1')]); // je supprime R2
    const theirs = doc([part('r1', { value: 3_300 }), part('r2')]); // l'autre modifie R1

    const result = mergeDocs({ base, mine, theirs });
    assert.deepEqual(result.doc.components.map((c) => c.id), ['r1']);
    assert.equal(result.doc.components[0].value, 3_300);
    assert.equal(result.stats.removed, 1);
  });

  it('signale une vraie collision sur le même dipôle et garde la version serveur', () => {
    const base = doc([part('r1')]);
    const mine = doc([part('r1', { value: 100 })]);
    const theirs = doc([part('r1', { value: 200 })]);

    const result = mergeDocs({ base, mine, theirs, actor: 'Nora' });
    assert.equal(result.doc.components[0].value, 200);
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].componentId, 'r1');
    assert.equal(result.conflicts[0].kept, 'theirs');
    assert.match(result.conflicts[0].mine, /100/);
    assert.match(result.conflicts[0].theirs, /200/);
  });

  it('ne ressuscite pas une pièce supprimée par le serveur', () => {
    const base = doc([part('r1'), part('r2')]);
    const mine = doc([part('r1'), part('r2')]); // je n'ai pas vu la suppression
    const theirs = doc([part('r1')]); // le serveur a supprimé R2

    const result = mergeDocs({ base, mine, theirs });
    assert.deepEqual(result.doc.components.map((c) => c.id), ['r1']);
  });

  it('signale la suppression concurrente d’une pièce modifiée', () => {
    const base = doc([part('r1'), part('r2')]);
    const mine = doc([part('r1')]); // je supprime R2
    const theirs = doc([part('r1'), part('r2', { value: 9_100 })]); // il la modifie

    const result = mergeDocs({ base, mine, theirs });
    assert.deepEqual(result.doc.components.map((c) => c.id), ['r1', 'r2']);
    assert.equal(result.conflicts[0].field, 'suppression');
  });

  it('fusionne les champs du document champ par champ', () => {
    const base = doc([part('r1')], { name: 'Atelier', frequency: 50 });
    const mine = doc([part('r1')], { name: 'Mon nom', frequency: 50 });
    const theirs = doc([part('r1')], { name: 'Atelier', frequency: 1_000 });

    const result = mergeDocs({ base, mine, theirs });
    assert.equal(result.doc.name, 'Mon nom');
    assert.equal(result.doc.frequency, 1_000);
    assert.equal(result.stats.docFields, 1);
    assert.equal(result.conflicts.length, 0);
  });

  it('est idempotent : rejouer la même fusion ne change rien', () => {
    const base = doc([part('r1'), part('r2')]);
    const mine = doc([part('r1', { value: 2_200 }), part('r2')]);
    const first = mergeDocs({ base, mine, theirs: base });
    const second = mergeDocs({ base: first.doc, mine, theirs: first.doc });
    assert.deepEqual(second.doc, first.doc);
    assert.equal(second.changed, false);
    assert.equal(second.conflicts.length, 0);
  });

  it('converge quel que soit l’ordre des contributeurs', () => {
    const base = doc([part('r1'), part('r2')]);
    const alice = doc([part('r1', { value: 2_200 }), part('r2')]);
    const bob = doc([part('r1'), part('r2', { value: 470 })]);

    const ab = mergeDocs({ base, mine: alice, theirs: bob });
    const ba = mergeDocs({ base, mine: bob, theirs: alice });
    const values = (d: CircuitDoc) => d.components.map((c) => `${c.id}:${c.value}`).sort();
    assert.deepEqual(values(ab.doc), values(ba.doc));
  });

  it('accepte une première écriture sans base', () => {
    const mine = doc([part('r1')]);
    const result = mergeDocs({ base: null, mine, theirs: doc([]) });
    assert.deepEqual(result.doc.components.map((c) => c.id), ['r1']);
  });

  it('ignore un document corrompu au lieu de casser l’atelier', () => {
    const broken = { name: 42, components: [null, { id: 3 }, part('r1')] } as unknown as CircuitDoc;
    const clean = sanitizeDoc(broken);
    assert.equal(clean.name, 'Montage');
    assert.equal(clean.components.length, 1);
    assert.equal(clean.regime, 'dc');

    const result = mergeDocs({ base: doc([part('r1')]), mine: broken, theirs: doc([part('r1')]) });
    assert.equal(result.doc.components.length, 1);
  });

  it('produit un diff lisible pour l’historique', () => {
    const before = doc([part('r1'), part('r2')]);
    const after = doc([part('r1', { value: 10 }), part('r3')]);
    const diff = diffDocs(before, after);
    assert.deepEqual(diff.added, ['R3']);
    assert.deepEqual(diff.removed, ['R2']);
    assert.deepEqual(diff.updated, ['R1']);
  });
});
