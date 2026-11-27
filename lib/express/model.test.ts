/**
 * Tests de la barre de valeurs R · C · L (modèle + lecture des entrées).
 *
 * Lancement : npm test
 *
 * Cas couverts :
 *   (a) notation d'ingénieur : `4,7k`, `100nF`, `10 mH`, `1e-6`
 *   (b) montage canonique : diviseur R / (L ∥ C), bornes et masse valides
 *   (c) cohérence analytique en sinusoïdal : U_th = E·|Z_LC|/|R + Z_LC|
 *   (d) indicateurs : f₀ = 1/(2π√(LC)), Q = (1/R)√(L/C), X_L, X_C
 *   (e) comportement en continu (bobine = fil → sortie nulle)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildValueModel } from './model';
import { normalizeValueInput, parseEngineerValue, validateValueInput } from './params';
import { abs } from '@/lib/engine/complex';

const close = (a: number, b: number, tolerance = 1e-6) => {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  assert.ok(Math.abs(a - b) / scale < tolerance, `${a} ≠ ${b} (tol ${tolerance})`);
};

describe('lecture des valeurs (notation d’ingénieur)', () => {
  it('accepte les préfixes SI et la virgule décimale', () => {
    close(parseEngineerValue('4,7k') as number, 4700);
    close(parseEngineerValue('100nF') as number, 100e-9, 1e-12);
    close(parseEngineerValue('10 mH') as number, 10e-3);
    close(parseEngineerValue('2.2kΩ') as number, 2200);
    close(parseEngineerValue('1e-6') as number, 1e-6);
    assert.equal(parseEngineerValue('μ'), null);
  });

  it('normalise un texte libre et une query string', () => {
    const fromText = normalizeValueInput('R=4,7k C=100n L=10m f=2k');
    const fromCommas = normalizeValueInput('R=1k, C=1u, L=1m');
    close(fromText.r as number, 4700);
    close(fromText.c as number, 100e-9);
    close(fromText.l as number, 10e-3);
    close(fromText.f as number, 2000);

    close(fromCommas.r as number, 1000);
    close(fromCommas.c as number, 1e-6);
    close(fromCommas.l as number, 1e-3);

    const fromQuery = normalizeValueInput({ r: '1k', c: '1u', l: '1m', frequency: '50' });
    close(fromQuery.r as number, 1000);
    close(fromQuery.c as number, 1e-6);
    close(fromQuery.f as number, 50);
  });

  it('signale les valeurs interdites', () => {
    const problems = validateValueInput({ r: 0, c: 1e-9, l: 1e-3 });
    assert.ok(problems.length >= 1);
    assert.ok(problems[0].includes('R'));
  });
});

describe('modèle du montage R · C · L', () => {
  const input = { r: 1000, c: 1e-6, l: 10e-3, e: 12, f: 1000, regime: 'ac' as const };

  it('construit un diviseur R / (L ∥ C) fermé', () => {
    const model = buildValueModel(input);
    // source + R + L + C + 3 fils de liaison
    assert.equal(model.doc.components.length, 7);
    assert.equal(model.doc.ground, '0,10');
    assert.equal(model.doc.terminals.a, '8,4');
    assert.ok(model.doc.components.some((c) => c.kind === 'resistor'));
    assert.ok(model.doc.components.some((c) => c.kind === 'capacitor'));
    assert.ok(model.doc.components.some((c) => c.kind === 'inductor'));
    assert.equal(model.status, 'ok');
    assert.ok(model.ok);
  });

  it('retrouve U_th et Z_th par le calcul analytique', () => {
    const model = buildValueModel(input);
    const omega = 2 * Math.PI * 1000;
    const xl = omega * 10e-3;
    const xc = 1 / (omega * 1e-6);
    // Z_LC = jXl ∥ (−jXc) → |Z_LC| = Xl·Xc/|Xl − Xc| (module, phase ∓90°)
    const zlcMag = (xl * xc) / Math.abs(xl - xc);
    const impedance = Math.hypot(1000, zlcMag); // R et Z_LC en quadrature
    const expectedVth = (12 * zlcMag) / impedance;
    const expectedZth = (1000 * zlcMag) / impedance;
    close(abs(model.equivalent.vth), expectedVth, 1e-4);
    close(abs(model.equivalent.rth), expectedZth, 1e-4);
    close(abs(model.equivalent.vth) / abs(model.equivalent.rth), abs(model.equivalent.inorton), 1e-4);
  });

  it('calcule f₀, Q et les réactances', () => {
    const model = buildValueModel(input);
    const f0 = 1 / (2 * Math.PI * Math.sqrt(10e-3 * 1e-6));
    close(model.metrics.f0 as number, f0, 1e-9);
    close(model.metrics.quality as number, Math.sqrt(10e-3 / 1e-6) / 1000, 1e-9);
    close(model.metrics.xl as number, 2 * Math.PI * 1000 * 10e-3, 1e-9);
    close(model.metrics.xc as number, 1 / (2 * Math.PI * 1000 * 1e-6), 1e-9);
    assert.ok((model.metrics.powerMax ?? 0) > 0);
  });

  it('le courant réel circule dans R, L et C', () => {
    const model = buildValueModel(input);
    const byId = new Map(model.branches.map((branch) => [branch.id, branch]));
    for (const id of ['R1', 'L1', 'C1']) {
      const branch = byId.get(id);
      assert.ok(branch, `branche ${id} absente`);
      assert.ok(branch!.current > 1e-6, `courant trop faible dans ${id}`);
    }
    // le courant du générateur vu des bornes est I_N (lu sur la branche de test)
    close(model.equivalent.inorton.re, 0.012, 1e-6);
  });

  it('en continu la bobine court-circuite la sortie', () => {
    const model = buildValueModel({ ...input, regime: 'dc' });
    assert.equal(model.status, 'shorted');
    assert.equal(model.doc.regime, 'dc');
    assert.ok(abs(model.equivalent.vth) < 1e-6);
  });
});
