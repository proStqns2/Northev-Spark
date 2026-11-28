/**
 * L'empreinte doit être stable quand rien d'électrique ne change, et changer
 * dès qu'une grandeur utile bouge — c'est ce qui autorise à mémoïser la
 * résolution sans afficher de résultats périmés.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { documentSignature } from './signature';
import type { CircuitDoc } from './types';

function doc(): CircuitDoc {
  return {
    name: 'Pont',
    ground: '0,0',
    terminals: { a: '2,0', b: '0,0' },
    regime: 'dc',
    frequency: 50,
    components: [
      { id: 'p1', kind: 'vsource', a: '0,0', b: '0,2', value: 12 },
      { id: 'p2', kind: 'resistor', a: '0,2', b: '2,2', value: 500 },
      { id: 'p3', kind: 'resistor', a: '2,2', b: '2,0', value: 500 },
    ],
  };
}

describe('empreinte électrique', () => {
  it('ignore le nom, les notes et les identifiants', () => {
    const a = doc();
    const b = doc();
    b.name = 'Autre nom';
    b.notes = 'une note';
    b.components[1].id = 'zzz';
    b.components[1].label = 'R1';
    assert.equal(documentSignature(a), documentSignature(b));
  });

  it('ignore l’ordre des pièces dans le document', () => {
    const a = doc();
    const b = doc();
    b.components.reverse();
    assert.equal(documentSignature(a), documentSignature(b));
  });

  it('change dès qu’une valeur bouge', () => {
    const a = doc();
    const b = doc();
    b.components[2].value = 501;
    assert.notEqual(documentSignature(a), documentSignature(b));
  });

  it('change quand la topologie change', () => {
    const a = doc();
    const b = doc();
    b.components[2].b = '4,0';
    assert.notEqual(documentSignature(a), documentSignature(b));
  });

  it('change quand masse, bornes, régime ou fréquence changent', () => {
    const base = documentSignature(doc());
    for (const patch of [
      (d: CircuitDoc) => {
        d.ground = '2,2';
      },
      (d: CircuitDoc) => {
        d.terminals.a = '0,2';
      },
      (d: CircuitDoc) => {
        d.regime = 'ac';
      },
      (d: CircuitDoc) => {
        d.frequency = 1000;
      },
    ]) {
      const variant = doc();
      patch(variant);
      assert.notEqual(documentSignature(variant), base);
    }
  });

  it('distingue un interrupteur ouvert d’un interrupteur fermé', () => {
    const a = doc();
    const b = doc();
    a.components.push({ id: 's', kind: 'switch', a: '0,2', b: '0,4', value: 0, closed: true });
    b.components.push({ id: 's', kind: 'switch', a: '0,2', b: '0,4', value: 0, closed: false });
    assert.notEqual(documentSignature(a), documentSignature(b));
  });
});
