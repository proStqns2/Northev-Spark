/**
 * Tests unitaires du moteur MNA (Thévenin / Norton).
 *
 * Lancement : npm test   (node:test + tsx, zéro dépendance supplémentaire)
 *
 * Cas couverts (spec §5.3) :
 *   (a) diviseur de tension simple
 *   (b) pont de Wheatstone (équilibré puis déséquilibré)
 *   (c) circuit multi-sources (superposition)
 *   (d) réseau RC / RLC en régime sinusoïdal (impédance complexe)
 * + cohérence T ⇄ N, diagnostics d'erreur, cas limites.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { equivalentOf } from './equivalent';
import { solveDocument } from './solver';
import { abs, arg, cx } from './complex';
import { loadEquivalent } from './load';
import type { CircuitDoc, Component } from './types';

const node = (x: number, y: number) => `${x},${y}`;
const comp = (p: Partial<Component> & { id: string; kind: Component['kind']; a: string; b: string; value: number }): Component => p;

const doc = (partial: Partial<CircuitDoc> & { components: Component[] }): CircuitDoc => ({
  name: 'test',
  ground: '',
  terminals: { a: null, b: null },
  regime: 'dc',
  frequency: 50,
  ...partial,
});

/** égalité relative (tolérance), robuste près de zéro (bruit numérique) */
const approx = (actual: number, expected: number, tol = 1e-6) => {
  const diff = Math.abs(actual - expected);
  const scale = Math.max(Math.abs(expected), 1e-6);
  assert.ok(
    diff / scale <= tol || diff <= 1e-7,
    `${actual} ≠ ${expected} (écart ${diff / scale})`,
  );
};

describe('MNA — équivalent Thévenin / Norton', () => {
  it('(a) diviseur de tension : U_th = 6 V, R_th = 500 Ω, I_N = 12 mA', () => {
    const d = doc({
      components: [
        comp({ id: 'E1', kind: 'vsource', a: node(0, 1), b: node(0, 0), value: 12 }),
        comp({ id: 'R1', kind: 'resistor', a: node(0, 1), b: node(2, 1), value: 1000 }),
        comp({ id: 'R2', kind: 'resistor', a: node(2, 1), b: node(2, 0), value: 1000 }),
        comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(2, 0), value: 0 }),
      ],
      ground: node(0, 0),
      terminals: { a: node(2, 1), b: node(0, 0) },
    });
    const eq = equivalentOf(d);
    assert.equal(eq.ok, true, eq.error);
    approx(abs(eq.vth), 6);
    approx(abs(eq.rth), 500);
    approx(abs(eq.inorton), 0.012);
    // cohérence interne : U_th = I_N · R_th
    approx(abs(cx(eq.inorton.re * eq.rth.re - eq.inorton.im * eq.rth.im, eq.inorton.re * eq.rth.im + eq.inorton.im * eq.rth.re)), 6, 1e-6);
    assert.ok(eq.verificationErrorPct < 1e-6, `vérification ${eq.verificationErrorPct} %`);
    assert.ok(eq.steps.length > 0, 'étapes pédagogiques générées');
  });

  it('(b) pont de Wheatstone équilibré : U_th ≈ 0, R_th = 180 Ω', () => {
    // R1/R3 = 100/150 = 200/300 = R2/R4 → pont équilibré
    const build = (r4: number) =>
      doc({
        components: [
          comp({ id: 'E1', kind: 'vsource', a: node(3, 0), b: node(3, 4), value: 10 }),
          comp({ id: 'W1', kind: 'wire', a: node(1, 0), b: node(5, 0), value: 0 }),
          comp({ id: 'W2', kind: 'wire', a: node(1, 4), b: node(5, 4), value: 0 }),
          comp({ id: 'W3', kind: 'wire', a: node(1, 0), b: node(3, 0), value: 0 }),
          comp({ id: 'W4', kind: 'wire', a: node(1, 4), b: node(3, 4), value: 0 }),
          comp({ id: 'R1', kind: 'resistor', a: node(1, 0), b: node(1, 2), value: 100 }),
          comp({ id: 'R3', kind: 'resistor', a: node(1, 2), b: node(1, 4), value: 150 }),
          comp({ id: 'R2', kind: 'resistor', a: node(5, 0), b: node(5, 2), value: 200 }),
          comp({ id: 'R4', kind: 'resistor', a: node(5, 2), b: node(5, 4), value: r4 }),
        ],
        ground: node(3, 4),
        terminals: { a: node(1, 2), b: node(5, 2) },
      });
    const balanced = equivalentOf(build(300));
    assert.equal(balanced.ok, true, balanced.error);
    approx(abs(balanced.vth), 0, 1e-6);
    // R_th = (R1‖R3) + (R2‖R4) = 60 + 120 = 180 Ω
    approx(abs(balanced.rth), (100 * 150) / 250 + (200 * 300) / 500, 1e-6);

    const unbalanced = equivalentOf(build(380));
    assert.equal(unbalanced.ok, true, unbalanced.error);
    assert.ok(abs(unbalanced.vth) > 1e-3, 'pont déséquilibré : U_th non nul');
  });

  it('(c) superposition multi-sources : deux sources indépendantes', () => {
    const d = doc({
      components: [
        comp({ id: 'E1', kind: 'vsource', a: node(0, 2), b: node(0, 0), value: 12 }),
        comp({ id: 'I1', kind: 'isource', a: node(2, 2), b: node(2, 0), value: 0.002 }),
        comp({ id: 'R1', kind: 'resistor', a: node(0, 2), b: node(2, 2), value: 1000 }),
        comp({ id: 'R2', kind: 'resistor', a: node(2, 2), b: node(2, 0), value: 4700 }),
        comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(2, 0), value: 0 }),
      ],
      ground: node(0, 0),
      terminals: { a: node(2, 2), b: node(0, 0) },
    });
    const eq = equivalentOf(d);
    assert.equal(eq.ok, true, eq.error);
    // contributions additives : la superposition décompose les sources
    assert.ok(eq.superposition.length >= 2, `termes de superposition : ${eq.superposition.length}`);
    const sum = eq.superposition.reduce(
      (acc, t) => cx(acc.re + t.contribution.re, acc.im + t.contribution.im),
      cx(0, 0),
    );
    approx(abs(sum), abs(eq.vth), 1e-6);
  });

  it('(d) régime sinusoïdal RC : impédance complexe |Z| et phase', () => {
    const d = doc({
      regime: 'ac',
      frequency: 1000,
      components: [
        comp({ id: 'E1', kind: 'vsource', a: node(0, 1), b: node(0, 0), value: 10, ac: { amplitude: 10, frequency: 1000, phaseDeg: 0 } }),
        comp({ id: 'R1', kind: 'resistor', a: node(0, 1), b: node(2, 1), value: 100 }),
        comp({ id: 'C1', kind: 'capacitor', a: node(2, 1), b: node(2, 0), value: 1e-6 }),
        comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(2, 0), value: 0 }),
      ],
      ground: node(0, 0),
      terminals: { a: node(2, 1), b: node(0, 0) },
    });
    const eq = equivalentOf(d);
    assert.equal(eq.ok, true, eq.error);
    assert.equal(eq.ac, true);
    // Z_th = R // (1/jωC) ; à 1 kHz, |1/jωC| ≈ 159,2 Ω → |Z| ≈ 84,7 Ω
    const omega = 2 * Math.PI * 1000;
    const zc = 1 / (omega * 1e-6);
    const expected = (100 * zc) / Math.hypot(100, zc);
    approx(abs(eq.rth), expected, 1e-6);
    // la partie imaginaire est capacitive (négative)
    assert.ok(eq.rth.im < 0, `Z_th capacitive attendue, im = ${eq.rth.im}`);
    // forme polaire cohérente
    approx(abs(eq.rth), Math.hypot(eq.rth.re, eq.rth.im), 1e-9);
    assert.ok(Number.isFinite(arg(eq.rth)));
  });

  it('(d2) bobine en AC : Z_L = jωL inductive', () => {
    const d = doc({
      regime: 'ac',
      frequency: 50,
      components: [
        comp({ id: 'E1', kind: 'vsource', a: node(0, 1), b: node(0, 0), value: 5, ac: { amplitude: 5, frequency: 50, phaseDeg: 0 } }),
        comp({ id: 'L1', kind: 'inductor', a: node(0, 1), b: node(2, 1), value: 0.1 }),
        comp({ id: 'R1', kind: 'resistor', a: node(2, 1), b: node(2, 0), value: 50 }),
        comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(2, 0), value: 0 }),
      ],
      ground: node(0, 0),
      terminals: { a: node(2, 1), b: node(0, 0) },
    });
    const eq = equivalentOf(d);
    assert.equal(eq.ok, true, eq.error);
    // Z_th = 50 // jωL ; ωL = 2π·50·0,1 ≈ 31,4 Ω
    const xl = 2 * Math.PI * 50 * 0.1;
    const expected = (50 * xl) / Math.hypot(50, xl);
    approx(abs(eq.rth), expected, 1e-6);
    assert.ok(eq.rth.im > 0, `Z_th inductive attendue, im = ${eq.rth.im}`);
  });

  it('diagnostics : bornes manquantes, masse absente, circuit ouvert', () => {
    const base = [
      comp({ id: 'E1', kind: 'vsource', a: node(0, 1), b: node(0, 0), value: 12 }),
      comp({ id: 'R1', kind: 'resistor', a: node(0, 1), b: node(2, 1), value: 1000 }),
      comp({ id: 'R2', kind: 'resistor', a: node(2, 1), b: node(2, 0), value: 1000 }),
    ];
    // bornes non choisies
    const noTerminals = equivalentOf(doc({ components: base, ground: node(0, 0), terminals: { a: null, b: null } }));
    assert.equal(noTerminals.ok, false);
    assert.match(noTerminals.error ?? '', /bornes/i);

    // masse absente : le solveur auto-sélectionne une référence (robuste, sans plantage)
    const noGround = equivalentOf(doc({ components: base, ground: '', terminals: { a: node(2, 1), b: node(0, 0) } }));
    assert.equal(noGround.ok, true, noGround.error);
    assert.ok(Number.isFinite(abs(noGround.vth)));

    // A == B
    const sameTerminal = equivalentOf(
      doc({ components: base, ground: node(0, 0), terminals: { a: node(2, 1), b: node(2, 1) } }),
    );
    assert.equal(sameTerminal.ok, false);
    assert.match(sameTerminal.error ?? '', /confondues|distincts/i);
  });

  it('solveDocument : tensions nodales et lectures de branche', () => {
    const d = doc({
      components: [
        comp({ id: 'E1', kind: 'vsource', a: node(0, 1), b: node(0, 0), value: 12 }),
        comp({ id: 'R1', kind: 'resistor', a: node(0, 1), b: node(2, 1), value: 1000 }),
        comp({ id: 'R2', kind: 'resistor', a: node(2, 1), b: node(2, 0), value: 1000 }),
        comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(2, 0), value: 0 }),
      ],
      ground: node(0, 0),
      terminals: { a: node(2, 1), b: node(0, 0) },
    });
    const sol = solveDocument(d, { sourcesOn: true });
    if (!sol.ok) assert.fail(sol.error);
    assert.equal(sol.ok, true);
    approx(abs(sol.nodeVoltages[node(2, 1)]), 6);
    approx(abs(sol.readings.R1.i), 0.006);
    approx(abs(sol.readings.R2.v), 6);
  });
});

describe('simulateur de charge R_L', () => {
  it('diviseur chargé : U_th, Z_th puis R_L = Z_th donne la moitié', () => {
    // U_th = 6 V, Z_th = 500 Ω (diviseur 1 kΩ / 1 kΩ sur 12 V)
    const vth = cx(6, 0);
    const zth = cx(500, 0);

    // charge ouverte (R_L énorme) → U_L ≈ U_th
    approx(loadEquivalent(vth, zth, 1e9).uL.re, 6, 1e-6);

    // R_L = Z_th → adaptation : U_L = U_th / 2, P_L = P_max
    const matched = loadEquivalent(vth, zth, 500);
    approx(matched.uL.re, 3);
    approx(abs(matched.iL), 0.006);
    approx(matched.pL, 0.018);
    assert.equal(matched.atMax, true);

    // P_max = U_th² / (4 Z_th) = 36 / 2000 = 18 mW
    approx(matched.pMax, 0.018);
    approx(matched.pL, matched.pMax);

    // court-circuit franc → U_L = 0, I_L = I_N
    approx(loadEquivalent(vth, zth, 0).uL.re, 0);
    approx(abs(loadEquivalent(vth, zth, 0).iL), 0.012);
  });

  it('charge AC : R_L en série avec Z_th complexe', () => {
    // Z_th = 300 + j400 (|Z| = 500), U_th = 10 V
    const vth = cx(10, 0);
    const zth = cx(300, 400);
    const load = loadEquivalent(vth, zth, 500);
    approx(load.zthMagnitude, 500);
    // |I| = 10 / |300+j400 + 500| = 10 / |800+j400| = 10 / 894,427
    approx(abs(load.iL), 10 / Math.hypot(800, 400));
    approx(load.pL, abs(load.iL) ** 2 * 500);
    assert.equal(load.atMax, true);
  });
});
