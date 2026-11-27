/**
 * Tests de la géométrie du document : rotation à quart de tour.
 *
 * Le montage ne stocke pas d'angle : l'orientation d'un dipôle est portée par
 * la position de sa borne B. On vérifie donc que quatre rotations ramènent au
 * montage d'origine et qu'un quart de tour échange bien horizontal/vertical.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendDoc, emptyDoc, rotateComponent } from './doc';
import { orientationOf } from './geometry';
import type { CircuitDoc, Component } from '@/lib/engine/types';

const component = (): Component =>
  ({ id: 'R1', kind: 'resistor', a: '4,4', b: '8,4', value: 1000, label: 'R1' }) as Component;

const withComponent = (c: Component): CircuitDoc =>
  ({ ...emptyDoc('rotation'), components: [c] }) as CircuitDoc;

const first = (doc: CircuitDoc): Component => doc.components[0];

describe('rotation des dipôles', () => {
  it('un quart de tour fait passer un dipôle horizontal en vertical', () => {
    const doc = withComponent(component());
    assert.equal(orientationOf(first(doc)), 'h');
    const rotated = rotateComponent(doc, 'R1');
    assert.equal(orientationOf(first(rotated)), 'v');
    // la borne A ne bouge pas : c'est le pivot
    assert.equal(first(rotated).a, '4,4');
  });

  it('quatre quarts de tour ramènent au montage d’origine', () => {
    const start = withComponent(component());
    let doc = start;
    for (let i = 0; i < 4; i += 1) doc = rotateComponent(doc, 'R1');
    assert.equal(first(doc).a, first(start).a);
    assert.equal(first(doc).b, first(start).b);
    assert.equal(first(doc).value, first(start).value);
  });

  it('les quatre orientations sont distinctes deux à deux', () => {
    const seen = new Set<string>();
    let doc = withComponent(component());
    for (let i = 0; i < 4; i += 1) {
      seen.add(`${first(doc).a}|${first(doc).b}`);
      doc = rotateComponent(doc, 'R1');
    }
    assert.equal(seen.size, 4);
  });

  it('un identifiant inconnu ne modifie rien', () => {
    const doc = withComponent(component());
    const same = rotateComponent(doc, 'R99');
    assert.deepEqual(same.components, doc.components);
  });
});


describe('ajout d’un bloc de montage', () => {
  it('préserve le document d’origine et décale les connexions avec des identifiants distincts', () => {
    const original = {
      ...withComponent(component()),
      ground: '4,4',
      terminals: { a: '4,4', b: '8,4' },
    };
    const block = {
      ...withComponent({ ...component(), a: '-2,4', b: '2,4' }),
      frequency: 1_000,
      regime: 'ac' as const,
    };
    const merged = appendDoc(original, block);
    assert.deepEqual(merged, {
      ...original,
      components: [...original.components, { ...first(block), id: 'R1_2', a: '12,4', b: '16,4' }],
    });
    const twice = appendDoc(merged, block);
    assert.deepEqual(twice.components.map((part) => part.id), ['R1', 'R1_2', 'R1_3']);
    assert.equal(twice.components[2].a, '20,4');
  });

  it('garde les réglages et les bornes du bloc quand le plan est vide', () => {
    const block = {
      ...withComponent(component()),
      ground: '4,4',
      terminals: { a: '4,4', b: '8,4' },
      regime: 'ac' as const,
      frequency: 1_000,
    };
    assert.deepEqual(appendDoc(emptyDoc(), block), block);
  });
});
