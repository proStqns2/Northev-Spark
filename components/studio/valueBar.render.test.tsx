/**
 * Test de rendu de la barre de valeurs R · C · L et de la vignette de montage.
 *
 * Aucun navigateur : rendu statique par react-dom/server. Objectif : garantir
 * que la barre s'affiche avec ses trois champs (R, C, L), ses raccourcis et son
 * badge de service, et que les symboles SVG du montage construit sont émis.
 */
import React from 'react';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { ValueBar } from './ValueBar';
import { buildValueModel } from '@/lib/express/model';
import { SYMBOL_SVG } from '@/lib/studio/symbolSvg';

describe('barre de valeurs R · C · L', () => {
  const html = renderToStaticMarkup(<ValueBar onApply={() => undefined} compact />);

  it('rend les champs R, C et L', () => {
    assert.match(html, /Barre de valeurs R, C, L du montage/);
    assert.match(html, /Résistance/);
    assert.match(html, /Condensateur/);
    assert.match(html, /Bobine/);
  });

  it('propose les préfixes, les valeurs usuelles et le chargement', () => {
    assert.match(html, /kΩ/);
    assert.match(html, /nF/);
    assert.match(html, /mH/);
    assert.match(html, /usuelles/);
    assert.match(html, /Charger/);
    assert.match(html, /Ajouter/);
  });

  it('affiche l’état du service', () => {
    assert.match(html, /prêt|express|moteur next/);
  });

  it('le montage construit produit un SVG de chaque symbole', () => {
    const model = buildValueModel({ r: 1000, c: 1e-6, l: 10e-3, e: 12, f: 1000 });
    for (const component of model.doc.components) {
      const svg = SYMBOL_SVG[component.kind]('#38e1e6');
      assert.ok(svg.includes('<'), `symbole vide pour ${component.kind}`);
    }
  });
});
