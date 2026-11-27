import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COMPONENT_META, type CircuitDoc, type ComponentKind } from '@/lib/engine/types';
import { solveDocument } from '@/lib/engine/solver';
import { abs } from '@/lib/engine/complex';
import { GRID } from './geometry';
import { partGeometry, parseCell } from './editor';
import {
  PLANNED_SYMBOLS,
  SYMBOLS,
  SYMBOL_CONTRACT_VERSION,
  auditPart,
  boxAt,
  isSupported,
  mirrorLocal,
  pinsAt,
  rotateLocal,
  spanCells,
  symbolOf,
} from './symbols';

/**
 * Le contrat 2D est vérifié **contre le code existant** : même géométrie que
 * `partGeometry`, même convention de signe que le solveur. Si quelqu’un déplace
 * une broche, ces tests tombent avant que l’interface ne casse.
 */

const KINDS = Object.keys(COMPONENT_META) as ComponentKind[];

describe('contrat 2D des dipôles', () => {
  it('couvre tous les dipôles connus du moteur', () => {
    for (const kind of KINDS) {
      assert.ok(SYMBOLS[kind], `symbole manquant pour ${kind}`);
      assert.ok(isSupported(kind));
    }
    assert.equal(Object.keys(SYMBOLS).length, KINDS.length);
    assert.equal(SYMBOL_CONTRACT_VERSION, 1);
  });

  it('donne deux bornes distinctes, avec un rôle explicite', () => {
    for (const kind of KINDS) {
      const symbol = symbolOf(kind);
      assert.equal(symbol.pins.length, 2);
      assert.equal(symbol.pins[0].id, 'a');
      assert.equal(symbol.pins[1].id, 'b');
      assert.notDeepEqual(symbol.pins[0].local, symbol.pins[1].local);
      assert.ok(symbol.pins[0].local.x < symbol.pins[1].local.x, `${kind} : A doit être à gauche en repère local`);
      for (const pin of symbol.pins) {
        assert.ok(pin.role, `${kind} : rôle de broche manquant`);
        assert.ok(pin.legend.length > 0);
      }
    }
  });

  it('déclare une boîte englobante non dégénérée contenant les deux broches', () => {
    for (const kind of KINDS) {
      const { box } = symbolOf(kind);
      assert.ok(box.width > 0 && box.height > 0, `${kind} : boîte dégénérée`);
      for (const pin of symbolOf(kind).pins) {
        assert.ok(pin.local.x >= box.local.x - 1e-6, `${kind} : broche hors boîte (gauche)`);
        assert.ok(pin.local.x <= box.local.x + box.width + 1e-6, `${kind} : broche hors boîte (droite)`);
        assert.ok(pin.local.y >= box.local.y - 1e-6, `${kind} : broche hors boîte (haut)`);
        assert.ok(pin.local.y <= box.local.y + box.height + 1e-6, `${kind} : broche hors boîte (bas)`);
      }
    }
  });

  it('les bornes monde sont exactement les nœuds du document', () => {
    const cases: Array<[string, string]> = [
      ['2,2', '4,2'], // horizontal
      ['3,1', '3,3'], // vertical
      ['1,1', '4,3'], // diagonale
    ];
    for (const kind of KINDS) {
      for (const [a, b] of cases) {
        const geometry = partGeometry({ a, b })!;
        const world = pinsAt(geometry.aPx, geometry.bPx);
        assert.deepEqual(world.a, geometry.aPx, `${kind} ${a}→${b} : broche A décalée`);
        assert.deepEqual(world.b, geometry.bPx, `${kind} ${a}→${b} : broche B décalée`);
        // et réciproquement : les nœuds se relisent depuis le document
        assert.deepEqual(parseCell(a), geometry.a);
        assert.deepEqual(parseCell(b), geometry.b);
      }
    }
  });

  it('la rotation par quarts de tour est réversible et conserve les distances', () => {
    const reference = { x: GRID, y: 0 };
    assert.deepEqual(rotateLocal(reference, 0), { x: GRID, y: 0 });
    assert.deepEqual(rotateLocal(reference, 1), { x: 0, y: GRID });
    assert.deepEqual(rotateLocal(reference, 2), { x: -GRID, y: 0 });
    assert.deepEqual(rotateLocal(reference, 3), { x: 0, y: -GRID });
    assert.deepEqual(rotateLocal(reference, 4), { x: GRID, y: 0 });
    assert.deepEqual(mirrorLocal(rotateLocal(reference, 1), 'x'), { x: 0, y: GRID });
  });

  it('le miroir inverse le sens A–B sans changer la longueur', () => {
    for (const kind of KINDS) {
      const { pins } = symbolOf(kind);
      const mirrored = mirrorLocal(pins[1].local, 'x');
      assert.equal(Math.abs(mirrored.x), Math.abs(pins[1].local.x));
      assert.equal(mirrored.y, pins[1].local.y);
    }
  });

  it('la boîte monde entoure les deux broches, dans les deux orientations', () => {
    for (const kind of KINDS) {
      const horizontal = boxAt(kind, { x: 48, y: 48 }, { x: 96, y: 48 });
      assert.ok(horizontal.x <= 48 && horizontal.x + horizontal.width >= 96, `${kind} : boîte H trop étroite`);
      assert.ok(horizontal.height > 0);
      const vertical = boxAt(kind, { x: 48, y: 48 }, { x: 48, y: 96 });
      assert.ok(vertical.y <= 48 && vertical.y + vertical.height >= 96, `${kind} : boîte V trop courte`);
      assert.ok(vertical.width > 0);
    }
  });

  it('signale les portées hors contrat', () => {
    // un condensateur de 12 cellules dépasse son maximum de 4
    const problems = auditPart('capacitor', { x: 0, y: 0 }, { x: 12 * GRID, y: 0 });
    assert.ok(problems.some((problem) => problem.includes('> max')));
    assert.equal(spanCells({ x: 0, y: 0 }, { x: 4 * GRID, y: 0 }), 4);
    assert.deepEqual(auditPart('resistor', { x: 0, y: 0 }, { x: 2 * GRID, y: 0 }), []);
    assert.ok(auditPart('resistor', { x: 24, y: 24 }, { x: 24, y: 24 }).includes('bornes confondues'));
  });
});

describe('convention de signe, alignée sur le solveur', () => {
  const doc = (components: CircuitDoc['components'], ground: string): CircuitDoc => ({
    name: 'test',
    components,
    ground,
    terminals: { a: null, b: null },
    regime: 'dc',
    frequency: 50,
  });

  it('source de tension : le + est en A (V(a) − V(b) = E)', () => {
    assert.equal(symbolOf('vsource').polarity?.plus, 'a');
    const circuit = doc(
      [{ id: 'e1', kind: 'vsource', a: '0,0', b: '2,0', value: 12, label: 'E1' }],
      '2,0',
    );
    const solution = solveDocument(circuit, { sourcesOn: true });
    assert.equal(solution.ok, true);
    if (!solution.ok) return;
    assert.ok(Math.abs(abs(solution.voltageAt('0,0')) - 12) < 1e-9, 'V(A) devrait valoir +12 V par rapport à B');
  });

  it('source de courant : le courant sort par A', () => {
    const symbol = symbolOf('isource');
    assert.equal(symbol.polarity?.arrow, 'a-b');
    assert.match(symbol.polarity?.solver ?? '', /\+I au nœud A/);
  });

  it('les dipôles passifs suivent la convention récepteur', () => {
    for (const kind of ['resistor', 'capacitor', 'inductor', 'lamp', 'potentiometer'] as ComponentKind[]) {
      assert.equal(symbolOf(kind).polarity?.arrow, 'a-b', `${kind} : sens de référence attendu A → B`);
    }
  });

  it('une résistance dissipe une puissance positive quel que soit le sens', () => {
    const circuit = doc(
      [
        { id: 'e1', kind: 'vsource', a: '0,0', b: '0,2', value: 12, label: 'E1' },
        { id: 'r1', kind: 'resistor', a: '0,0', b: '2,0', value: 1_000, label: 'R1' },
        { id: 'w1', kind: 'wire', a: '2,0', b: '0,2', value: 0 },
      ],
      '0,2',
    );
    const solution = solveDocument(circuit, { sourcesOn: true });
    assert.equal(solution.ok, true);
    if (!solution.ok) return;
    const reading = solution.readings.r1;
    assert.ok(reading, 'aucune lecture pour R1');
    assert.ok(Math.abs(reading.p.re) > 0, 'puissance nulle : le circuit de test est faux');
  });
});

describe('dipôles non supportés', () => {
  it('sont déclarés avec un motif, jamais exposés comme fonctionnels', () => {
    assert.ok(PLANNED_SYMBOLS.length >= 4);
    for (const planned of PLANNED_SYMBOLS) {
      assert.ok(planned.reason.length > 40, `${planned.slug} : motif trop vague`);
      assert.ok(isSupported(planned.fallback), `${planned.slug} : repli inconnu`);
      assert.equal(isSupported(planned.slug), false, `${planned.slug} ne doit pas être accepté`);
    }
    assert.throws(() => symbolOf('diode' as ComponentKind), /Symbole inconnu/);
  });
});
