/**
 * Test de rendu du panneau « Schéma équivalent » (Thévenin / Norton + R_L).
 *
 * Aucun navigateur n'est requis : le composant est rendu en HTML statique par
 * react-dom/server. Objectif : garantir qu'il ne lève pas au rendu et que les
 * grandeurs clés (U_th, Z_th, I_N, R_L, U_L, I_L, P_L) sont bien affichées,
 * y compris en régime sinusoïdal et dans l'état « non calculable ».
 */
import React from 'react';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { cx } from '@/lib/engine/complex';
import type { EquivalentResult } from '@/lib/engine/equivalent';
import { EquivalentSchematic } from './EquivalentSchematic';

// Le tsconfig du projet est en `jsx: preserve` (Next) : le transpileur appelle
// React.createElement sans l'importer. On l'expose donc globalement.
(globalThis as unknown as { React: typeof React }).React = React;

const result = (over: Partial<EquivalentResult>): EquivalentResult => ({
  ok: true,
  status: 'ok',
  vth: cx(6, 0),
  rth: cx(500, 0),
  inorton: cx(0.012, 0),
  isc: cx(0.012, 0),
  iscMeasured: true,
  vthCheck: cx(6, 0),
  verificationErrorPct: 0,
  warnings: [],
  steps: [],
  superposition: [],
  nodesUsed: 3,
  branchesUsed: 4,
  ac: false,
  degenerate: false,
  ...over,
});

const flat = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('EquivalentSchematic — rendu', () => {
  it('régime continu : U_th, Z_th, I_N et simulateur R_L', () => {
    const html = renderToStaticMarkup(
      <EquivalentSchematic equivalent={result({})} regime="dc" />,
    );
    const text = flat(html);
    assert.match(text, /6 V/); // U_th
    assert.match(text, /500 Ω/); // Z_th
    assert.match(text, /12 mA/); // I_N
    assert.match(text, /R_L/);
    assert.match(html, /type="range"/);
    assert.match(text, /U_L/);
    assert.match(text, /I_L/);
    assert.match(text, /P_L/);
  });

  it('régime sinusoïdal : module et phase', () => {
    const html = renderToStaticMarkup(
      <EquivalentSchematic
        equivalent={result({ vth: cx(10, 0), rth: cx(30, 40), ac: true })}
        regime="ac"
      />,
    );
    const text = flat(html);
    assert.match(text, /sinusoïdal/);
    assert.match(text, /50 Ω/); // |Z_th|
    assert.match(text, /∠/); // phase affichée
  });

  it('résultat non calculable : état vide explicite, pas de simulateur', () => {
    const html = renderToStaticMarkup(
      <EquivalentSchematic
        equivalent={result({ ok: false, error: 'Bornes A et B non définies', status: 'incomplete' })}
        regime="dc"
      />,
    );
    const text = flat(html);
    assert.match(text, /en attente/);
    assert.doesNotMatch(html, /type="range"/);
  });

  it('charge adaptée : R_L = |Z_th| signale le transfert maximal', () => {
    // 500 Ω de charge dessinée par défaut ? Le curseur démarre à ~500 Ω.
    const html = renderToStaticMarkup(
      <EquivalentSchematic equivalent={result({})} regime="dc" />,
    );
    const text = flat(html);
    assert.match(text, /transfert maximal/);
    assert.match(text, /P_max/);
  });
});
