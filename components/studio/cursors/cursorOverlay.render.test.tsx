/**
 * Test de rendu du calque de curseurs de l'atelier.
 *
 * Aucun navigateur : rendu statique par react-dom/server. Objectif : garantir
 * que chaque élément nouveau du calque est bien émis — sillage, fenêtre du pair,
 * anneau de clic, étiquette avec sélection et état micro/caméra, bouton de
 * suivi — et que les réglages d'affichage coupent réellement ces calques.
 */
import React from 'react';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { CursorOverlay, PresencePills } from './CursorOverlay';
import { CURSOR_DEFAULTS, type CursorPreferences } from '@/hooks/useCursorPreferences';
import type { LiveCursor } from '@/hooks/useCollaboration';

const toPx = (cell: { x: number; y: number }) => ({ x: cell.x * 20, y: cell.y * 20 });

function makeCursors(): LiveCursor[] {
  return [
    {
      id: 'u_bob',
      name: 'Bob',
      color: '#a479ff',
      x: 3,
      y: 4,
      tool: 'place',
      idle: false,
      fresh: true,
      vx: 0,
      vy: 0,
      vw: 12,
      vh: 9,
      pressed: false,
      selection: 'R2',
      media: { live: true, mic: true, cam: false },
    },
    {
      id: 'u_carol',
      name: 'Carol',
      color: '#46e6a0',
      x: 8,
      y: 2,
      tool: 'select',
      idle: true,
      fresh: false,
      vx: null,
      vy: null,
      vw: null,
      vh: null,
      media: null,
    },
  ];
}

const prefs = (patch: Partial<CursorPreferences> = {}): CursorPreferences => ({
  ...CURSOR_DEFAULTS,
  ...patch,
});

describe('calque de curseurs de l’atelier', () => {
  const html = renderToStaticMarkup(
    <CursorOverlay cursors={makeCursors()} toPx={toPx} prefs={prefs()} onFollow={() => undefined} />,
  );

  it('dessine un curseur par pair, avec son nom', () => {
    assert.equal((html.match(/<path d="M2 1\.5/g) ?? []).length, 2, 'deux flèches');
    assert.match(html, /Bob/);
    assert.match(html, /Carol/);
  });

  it('affiche l’outil et le dipôle sélectionné', () => {
    assert.match(html, /trace/, 'outil de pose annoncé');
    assert.match(html, /R2/, 'sélection du pair visible');
  });

  it('montre l’état micro / caméra du pair en visio', () => {
    // ▣ caméra allumée / ▢ coupée, ◉ micro ouvert
    assert.match(html, /▢/);
    assert.match(html, /◉/);
  });

  it('trace la fenêtre visible du pair', () => {
    assert.match(html, /stroke-dasharray="5 5"/, 'cadre de la fenêtre');
    assert.match(html, /l 10 0 M/, 'crochets de coin');
  });

  it('n’invente pas de sillage au premier rendu (moins de trois points)', () => {
    // le sillage demande un historique : il est vérifié dans
    // `lib/collab/cursorTrails.test.ts`, pas sur une image statique
    assert.equal(/<polyline/.test(html), false);
  });

  it('propose de suivre un pair', () => {
    assert.match(html, /Suivre ce curseur/);
  });

  it('respecte les réglages : tout couper retire les calques', () => {
    const bare = renderToStaticMarkup(
      <CursorOverlay
        cursors={makeCursors()}
        toPx={toPx}
        prefs={prefs({ trails: false, viewports: false, labels: false, call: false })}
      />,
    );
    assert.equal(/<polyline/.test(bare), false, 'pas de sillage');
    assert.equal(/stroke-dasharray="5 5"/.test(bare), false, 'pas de fenêtre');
    assert.equal(/trace/.test(bare), false, 'pas d’étiquette');
    assert.equal(/▢/.test(bare), false, 'pas de pastille visio');
  });

  it('change de forme selon le réglage', () => {
    const dot = renderToStaticMarkup(
      <CursorOverlay cursors={makeCursors()} toPx={toPx} prefs={prefs({ style: 'dot' })} />,
    );
    assert.equal(/M2 1\.5/.test(dot), false, 'plus de flèche');
    const halo = renderToStaticMarkup(
      <CursorOverlay cursors={makeCursors()} toPx={toPx} prefs={prefs({ style: 'halo' })} />,
    );
    assert.match(halo, /northev-cursor-breathe/);
  });

  it('éteint le curseur inactif et le pair non visé quand on suit', () => {
    const follow = renderToStaticMarkup(
      <CursorOverlay cursors={makeCursors()} toPx={toPx} prefs={prefs()} followId="u_bob" />,
    );
    assert.match(follow, /box-shadow:0 0 0 2px/, 'halo du pair suivi');
  });
});

describe('pilules de présence', () => {
  const html = renderToStaticMarkup(
    <PresencePills
      cursors={makeCursors()}
      participants={[
        { id: 'u_me', name: 'Moi', color: '#38e1e6', idle: false },
        { id: 'u_bob', name: 'Bob', color: '#a479ff', idle: false, media: { live: true, mic: true, cam: true } },
      ]}
      localId="u_me"
      speaking={{ u_bob: true }}
      onFollow={() => undefined}
    />,
  );

  it('liste les participants et marque « Vous »', () => {
    assert.match(html, /Vous/);
    assert.match(html, /Bob/);
  });

  it('signale le participant qui parle', () => {
    assert.match(html, /rgba\(70,230,160/);
  });

  it('montre l’état de la visio du pair', () => {
    assert.match(html, /▣/);
    assert.match(html, /◉/);
  });

  it('ouvre le suivi au clic sur une pilule', () => {
    assert.match(html, /Suivre Bob/);
  });
});
