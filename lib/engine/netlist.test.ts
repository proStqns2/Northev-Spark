/**
 * Tests du code d'équivalence.
 *
 * Le contrat est double : le texte doit être **juste** (nœuds, valeurs, unités)
 * et **stable** (même montage → même code, sans quoi deux élèves ne peuvent pas
 * comparer leurs copies).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { equivalenceCode, formatEngineering, netlistNodes, spiceValue } from './netlist';
import type { CircuitDoc } from './types';

function divider(): CircuitDoc {
  return {
    name: 'Pont diviseur',
    ground: '0,0',
    terminals: { a: '2,0', b: '0,0' },
    regime: 'dc',
    frequency: 50,
    components: [
      { id: 'p1', kind: 'vsource', a: '0,0', b: '0,2', value: 12, label: 'E' },
      { id: 'p2', kind: 'resistor', a: '0,2', b: '2,2', value: 500, label: 'R1' },
      { id: 'p3', kind: 'resistor', a: '2,2', b: '2,0', value: 4700, label: 'R2' },
    ],
  };
}

describe('notation d’ingénieur', () => {
  it('place les préfixes usuels', () => {
    assert.equal(formatEngineering(500, 'Ω'), '500 Ω');
    assert.equal(formatEngineering(4700, 'Ω'), '4,7 kΩ');
    assert.equal(formatEngineering(1e-6, 'F'), '1 µF');
    assert.equal(formatEngineering(2.2e-3, 'H'), '2,2 mH');
    assert.equal(formatEngineering(0, 'V'), '0 V');
    assert.equal(formatEngineering(-12, 'V'), '−12 V');
  });

  it('reste lisible pour SPICE', () => {
    assert.equal(spiceValue(500), '500');
    assert.equal(spiceValue(1e-6), '1.0000e-6');
    assert.equal(spiceValue(Infinity), '0');
  });
});

describe('nœuds', () => {
  it('nomme la masse 0, puis A et B, puis l’ordre de lecture', () => {
    const nodes = netlistNodes(divider());
    assert.deepEqual(
      nodes.map((node) => [node.id, node.cell, node.ground]),
      [
        ['0', '0,0', true],
        ['1', '2,0', false],
        ['2', '0,2', false],
        ['3', '2,2', false],
      ],
    );
    assert.equal(nodes.find((node) => node.cell === '2,0')?.terminalA, true);
    assert.equal(nodes.find((node) => node.cell === '0,0')?.terminalB, true);
  });

  it('ignore les cellules vides et les doublons', () => {
    const doc = divider();
    doc.components.push({ id: 'p4', kind: 'wire', a: '0,0', b: '0,0', value: 0 });
    const nodes = netlistNodes(doc);
    assert.equal(nodes.length, 4);
  });
});

describe('code d’équivalence', () => {
  it('écrit un dipôle par ligne, avec unité et nœuds', () => {
    const code = equivalenceCode(divider());
    assert.deepEqual(
      code.entries.map((entry) => entry.line),
      ['E1 0 2 12 V', 'R1 2 3 500 Ω', 'R2 3 1 4,7 kΩ'],
    );
    assert.deepEqual(
      code.entries.map((entry) => entry.id),
      ['E1', 'R1', 'R2'],
    );
    assert.match(code.text, /code d’équivalence/);
    assert.match(code.text, /Pont diviseur — continu/);
    assert.match(code.text, /Masse 0 \(nœud 0\) · A = 1 · B = 0/);
    assert.match(code.text, /3 nœud\(s\) hors masse · 3 dipôle\(s\)/);
  });

  it('produit des lignes SPICE pures, recopiables', () => {
    const code = equivalenceCode(divider());
    assert.equal(code.spice.split('\n')[1], 'R1 2 3 500');
    assert.equal(code.spice.split('\n')[0], 'E1 0 2 12');
  });

  it('ajoute l’équivalent de Thévenin quand on le fournit', () => {
    const code = equivalenceCode(divider(), { vth: 6, rth: 500, inorton: 0.012 });
    assert.match(code.text, /U_th = 6 V · Z_th = 500 Ω · I_N = 12 mA/);
  });

  it('est déterministe : deux appels donnent le même texte', () => {
    const a = equivalenceCode(divider());
    const b = equivalenceCode(divider());
    assert.equal(a.text, b.text);
    // et l'ordre des pièces dans le document ne change pas la numérotation des nœuds
    const shuffled = divider();
    shuffled.components.reverse();
    assert.equal(equivalenceCode(shuffled).nodes.map((n) => n.id).join(), a.nodes.map((n) => n.id).join());
  });

  it('gère un montage vide sans planter', () => {
    const code = equivalenceCode({
      name: '',
      ground: '',
      terminals: { a: null, b: null },
      regime: 'ac',
      frequency: 1000,
      components: [],
    });
    assert.equal(code.entries.length, 0);
    assert.equal(code.nodes.length, 0);
    assert.match(code.text, /0 nœud\(s\) hors masse · 0 dipôle\(s\)/);
    assert.match(code.text, /alternatif 1 kHz/);
  });

  it('nomme les nœuds de commande des sources liées', () => {
    const doc = divider();
    doc.components.push({
      id: 'p5',
      kind: 'vcvs',
      a: '0,2',
      b: '2,2',
      value: 2,
      ctrl: { a: '0,0', b: '2,0' },
    });
    const entry = equivalenceCode(doc).entries.at(-1);
    assert.equal(entry?.line, 'G1 2 3 2 0 1');
  });
});
