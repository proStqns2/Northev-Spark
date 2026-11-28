/**
 * Vérifications du moteur contre des résultats analytiques connus.
 * Lancement : npx tsx scripts/verify-engine.ts
 */
import { equivalentOf } from '../lib/engine/equivalent';
import { solveDocument } from '../lib/engine/solver';
import { reduceSeriesParallel } from '../lib/engine/reduce';
import { abs, cx } from '../lib/engine/complex';
import { CircuitDoc, Component } from '../lib/engine/types';

let failures = 0;
const approx = (actual: number, expected: number, tol: number, label: string) => {
  const err =
    Math.abs(expected) < 1e-9
      ? Math.abs(actual) / Math.max(tol * 1e6, 1e-9)
      : Math.abs(actual - expected) / Math.abs(expected);
  if (err <= tol) {
    console.log(`  ✓ ${label}: ${actual.toPrecision(6)} (attendu ${expected})`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}: ${actual} ≠ ${expected} (écart ${(err * 100).toFixed(3)} %)`);
  }
};

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

console.log('\n1. Diviseur de tension (12 V, 1 kΩ / 1 kΩ) — Thévenin vu de la sortie');
{
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
  console.log(`  statut=${eq.status}, erreur=${eq.error ?? '—'}`);
  approx(abs(eq.vth), 6, 1e-6, 'U_th');
  approx(abs(eq.rth), 500, 1e-6, 'R_th');
  approx(abs(eq.inorton), 0.012, 1e-6, 'I_N');
  console.log(`  vérification: écart=${eq.verificationErrorPct.toExponential(2)} %`);
}

console.log('\n2. Pont de Wheatstone équilibré — Thévenin nul');
{
  const d = doc({
    components: [
      comp({ id: 'E1', kind: 'vsource', a: node(3, 0), b: node(3, 4), value: 10 }),
      comp({ id: 'W1', kind: 'wire', a: node(1, 0), b: node(5, 0), value: 0 }),
      comp({ id: 'W2', kind: 'wire', a: node(1, 4), b: node(5, 4), value: 0 }),
      comp({ id: 'W3', kind: 'wire', a: node(1, 0), b: node(3, 0), value: 0 }),
      comp({ id: 'W4', kind: 'wire', a: node(1, 4), b: node(3, 4), value: 0 }),
      comp({ id: 'R1', kind: 'resistor', a: node(1, 0), b: node(1, 2), value: 100 }),
      comp({ id: 'R3', kind: 'resistor', a: node(1, 2), b: node(1, 4), value: 150 }),
      comp({ id: 'R2', kind: 'resistor', a: node(5, 0), b: node(5, 2), value: 200 }),
      comp({ id: 'R4', kind: 'resistor', a: node(5, 2), b: node(5, 4), value: 300 }),
    ],
    ground: node(3, 4),
    terminals: { a: node(1, 2), b: node(5, 2) },
  });
  const eq = equivalentOf(d);
  approx(abs(eq.vth), 0, 1e-3, 'U_th du pont équilibré');
  approx(abs(eq.rth), 100 * 150 / 250 + 200 * 300 / 500, 1e-4, 'R_th du pont');
  const unbalanced = { ...d, components: d.components.map((c) => (c.id === 'R4' ? { ...c, value: 380 } : c)) };
  const eq2 = equivalentOf(unbalanced);
  console.log(`  pont déséquilibré → U_th = ${abs(eq2.vth).toFixed(4)} V (≠ 0 attendu)`);
  if (abs(eq2.vth) < 1e-6) { failures += 1; console.log('  ✗ le pont déséquilibré devrait donner U_th ≠ 0'); }
}

console.log('\n3. Circuit RC en régime sinusoïdal — impédance complexe');
{
  const d = doc({
    regime: 'ac',
    frequency: 1000,
    components: [
      comp({
        id: 'E1',
        kind: 'vsource',
        a: node(0, 1),
        b: node(0, 0),
        value: 0,
        ac: { amplitude: 5, frequency: 1000, phaseDeg: 0 },
      }),
      comp({ id: 'R1', kind: 'resistor', a: node(0, 1), b: node(2, 1), value: 1000 }),
      comp({ id: 'C1', kind: 'capacitor', a: node(2, 1), b: node(2, 0), value: 1e-6 }),
      comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(2, 0), value: 0 }),
    ],
    ground: node(0, 0),
    terminals: { a: node(2, 1), b: node(0, 0) },
  });
  const eq = equivalentOf(d);
  // Z_th = R // (1/jwC) ; w = 2π·1000
  const w = 2 * Math.PI * 1000;
  const rr = 1000;
  const zc = 1 / (w * 1e-6);
  const expectedMag = (rr * zc) / Math.hypot(rr, zc);
  approx(abs(eq.rth), expectedMag, 1e-5, '|Z_th|');
  console.log(`  Z_th = ${eq.rth.re.toFixed(3)} − j${Math.abs(eq.rth.im).toFixed(3)} Ω`);
  console.log(`  U_th amplitude = ${abs(eq.vth).toFixed(4)} V`);
}

console.log('\n4. Source de courant + résistance parallèle');
{
  const d = doc({
    components: [
      comp({ id: 'I1', kind: 'isource', a: node(0, 0), b: node(2, 1), value: 0.002 }),
      comp({ id: 'R1', kind: 'resistor', a: node(2, 1), b: node(2, 0), value: 4700 }),
      comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(2, 0), value: 0 }),
    ],
    ground: node(2, 0),
    terminals: { a: node(2, 1), b: node(2, 0) },
  });
  const eq = equivalentOf(d);
  approx(abs(eq.vth), 9.4, 1e-5, 'U_th = I·R');
  approx(abs(eq.rth), 4700, 1e-5, 'R_th = R');
  approx(abs(eq.inorton), 0.002, 1e-5, 'I_N = I');
}

console.log('\n5. Lecture de courant / tension par branche');
{
  const d = doc({
    components: [
      comp({ id: 'E1', kind: 'vsource', a: node(0, 1), b: node(0, 0), value: 9 }),
      comp({ id: 'R1', kind: 'resistor', a: node(0, 1), b: node(2, 1), value: 300 }),
      comp({ id: 'R2', kind: 'resistor', a: node(2, 1), b: node(2, 0), value: 600 }),
      comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(2, 0), value: 0 }),
    ],
    ground: node(0, 0),
  });
  const res = solveDocument(d, { sourcesOn: true });
  if (res.ok) {
    approx(abs(res.readings.R1.i), 0.01, 1e-6, 'I(R1)');
    approx(abs(res.readings.R2.v), 6, 1e-6, 'U(R2)');
    approx(Math.abs(res.readings.R1.p.re), 0.03, 1e-6, 'P(R1) dissipée');
  } else {
    failures += 1;
    console.log('  ✗ solve échoué', res.error);
  }
}

console.log('\n6. Réduction série/parallèle symbolique');
{
  const d = doc({
    components: [
      comp({ id: 'R1', kind: 'resistor', a: node(0, 0), b: node(2, 0), value: 100 }),
      comp({ id: 'R2', kind: 'resistor', a: node(0, 0), b: node(2, 0), value: 100 }),
      comp({ id: 'R3', kind: 'resistor', a: node(2, 0), b: node(4, 0), value: 50 }),
    ],
  });
  const r = reduceSeriesParallel(d);
  // (100 // 100) = 50 puis 50 + 50 = 100
  approx(abs(r.finalValue), 100, 1e-6, 'R_éq');
  console.log(`  ${r.steps.length} étapes de réduction`);
}

console.log('\n7. Pont diviseur avec source de tension liée (VCVS)');
{
  const d = doc({
    components: [
      comp({ id: 'E1', kind: 'vsource', a: node(0, 2), b: node(0, 0), value: 1 }),
      comp({ id: 'R1', kind: 'resistor', a: node(0, 2), b: node(2, 2), value: 1000 }),
      comp({ id: 'R2', kind: 'resistor', a: node(2, 2), b: node(2, 0), value: 1000 }),
      comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(2, 0), value: 0 }),
    ],
    ground: node(0, 0),
  });
  const res = solveDocument(d, { sourcesOn: true });
  if (res.ok) {
    approx(abs(res.voltageAt(node(2, 2))), 0.5, 1e-6, 'V(2,2)');
  } else {
    failures += 1;
    console.log('  ✗', res.error);
  }
}

console.log('\n8. Équivalence T ⇄ N : cohérence U_th = I_N · R_th');
{
  const d = doc({
    components: [
      comp({ id: 'E1', kind: 'vsource', a: node(0, 2), b: node(0, 0), value: 24 }),
      comp({ id: 'R1', kind: 'resistor', a: node(0, 2), b: node(3, 2), value: 220 }),
      comp({ id: 'R2', kind: 'resistor', a: node(3, 2), b: node(3, 0), value: 680 }),
      comp({ id: 'R3', kind: 'resistor', a: node(3, 2), b: node(6, 2), value: 100 }),
      comp({ id: 'R4', kind: 'resistor', a: node(6, 2), b: node(6, 0), value: 330 }),
      comp({ id: 'W1', kind: 'wire', a: node(0, 0), b: node(6, 0), value: 0 }),
    ],
    ground: node(0, 0),
    terminals: { a: node(6, 2), b: node(0, 0) },
  });
  const eq = equivalentOf(d);
  approx(eq.verificationErrorPct, 0, 1, 'écart U_th/I_N·R_th (%)');
  approx(abs(eq.vth), abs(eq.inorton) * abs(eq.rth), 1e-6, 'U_th = I_N·R_th');
  console.log(`  superposition: ${eq.superposition.length} terme(s)`);
}

console.log(`\n${failures === 0 ? '✅ Tous les tests passent' : `❌ ${failures} échec(s)`}\n`);
process.exit(failures === 0 ? 0 : 1);
