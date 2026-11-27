/**
 * Garde-fou du plan du site.
 *
 * Reproduit le reproche exact : « il y a des pages que je ne peux pas
 * ouvrir ». Chaque lien affiché par la barre du haut ou le pied de page doit
 * correspondre à une page **réellement présente** dans `app/`, en page ou en
 * route handler. Un lien mort fait échouer la suite avant la mise en ligne.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';

import { ALL_LINKS, FOOTER_EXTRA, GROUPS, PRIMARY } from './site';

const APP = path.join(process.cwd(), 'app');

/** `/studio` → app/studio/page.tsx, etc. */
function pageExists(href: string): boolean {
  const clean = href.split('?')[0].replace(/^\//, '');
  const target = clean ? path.join(APP, clean) : APP;
  if (!existsSync(target)) return false;
  if (!statSync(target).isDirectory()) return false;
  for (const name of ['page.tsx', 'page.ts', 'page.jsx', 'route.ts']) {
    if (existsSync(path.join(target, name))) return true;
  }
  return false;
}

describe('plan du site', () => {
  it('ne contient aucun lien mort', () => {
    const missing = ALL_LINKS.filter((link) => !pageExists(link.href)).map((link) => link.href);
    assert.deepEqual(missing, [], `pages absentes : ${missing.join(', ')}`);
  });

  it('couvre toutes les entrées de navigation', () => {
    const navigated = [...PRIMARY, ...GROUPS.flatMap((group) => group.items), ...FOOTER_EXTRA];
    assert.equal(ALL_LINKS.length, PRIMARY.length + GROUPS.flatMap((group) => group.items).length);
    for (const link of navigated) assert.ok(link.href.startsWith('/'), `${link.href} doit être interne`);
  });

  it('n’a pas de doublon', () => {
    const hrefs = ALL_LINKS.map((link) => link.href);
    assert.equal(new Set(hrefs).size, hrefs.length);
  });

  it('garde les quatre accès directs', () => {
    assert.deepEqual(
      PRIMARY.map((link) => link.href),
      ['/studio', '/academie', '/projets', '/multiwork'],
    );
  });

  it('donne un libellé et une phrase à chaque entrée', () => {
    for (const link of ALL_LINKS) {
      assert.ok(link.label.length > 1, `${link.href} sans libellé`);
      assert.ok(link.hint.length > 8, `${link.href} sans description`);
    }
  });
});
