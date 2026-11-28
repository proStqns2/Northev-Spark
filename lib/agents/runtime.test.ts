import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AGENTS } from '@/lib/ai/agents';
import { agentCatalogue, agentTeaser, runAgentLocally } from './runtime';

/**
 * Le runtime est la pièce partagée entre Next et Express : s'il est faux, les
 * deux serveurs mentent ensemble. Ces tests le prennent au mot.
 */

const ALL = AGENTS.map((agent) => agent.id);

describe('runtime des agents', () => {
  it('expose un catalogue complet (emblème + tâches)', () => {
    const catalogue = agentCatalogue();
    assert.equal(catalogue.length, AGENTS.length);
    for (const entry of catalogue) {
      assert.ok(entry.id);
      assert.ok(entry.name);
      assert.ok(entry.avatar.startsWith('/agents/'), `${entry.id} doit avoir un emblème`);
      assert.ok(entry.tasks.length > 0);
    }
  });

  it('exécute les dix agents sans lever d’exception', () => {
    for (const id of ALL) {
      const outcome = runAgentLocally(id, { values: { r: 1_000, c: 100e-9, l: 10e-3 } });
      assert.equal(outcome.agent, id);
      assert.ok(outcome.summary.length > 10, `${id} doit conclure en une phrase`);
      assert.ok(outcome.metrics.length > 0, `${id} doit produire des grandeurs`);
      assert.ok(outcome.studioHref.startsWith('/studio'));
    }
  });

  it('Théo et Nora lisent la même résistance équivalente', () => {
    const doc = runAgentLocally('theo').doc;
    const theo = runAgentLocally('theo', { doc });
    const nora = runAgentLocally('nora', { doc });
    const rth = theo.metrics.find((metric) => metric.label === 'R_th')?.value;
    const rn = nora.metrics.find((metric) => metric.label === 'R_N')?.value;
    assert.equal(rth, rn);
    assert.ok(theo.metrics.some((metric) => metric.label === 'U_th' && metric.value !== '—'));
  });

  it('la conversion T ⇄ N reste sous la tolérance', () => {
    const outcome = runAgentLocally('convert');
    const gap = Number((outcome.metrics.find((metric) => metric.label === 'écart')?.value ?? '9').replace(',', '.').replace('%', ''));
    assert.ok(Number.isFinite(gap));
    assert.ok(gap < 0.1, `écart ${gap} %`);
  });

  it('les bobines trouvent la résonance attendue', () => {
    const outcome = runAgentLocally('coils', { values: { l: 10e-3, c: 100e-9, r: 1_000 } });
    const f0 = outcome.metrics.find((metric) => metric.label === 'f₀')?.value ?? '';
    // 1 / (2π√(LC)) ≈ 5,03 kHz pour 10 mH et 100 nF
    assert.match(f0, /5[,.]0\d\s*kHz/, `f₀ = ${f0}`);
    const q = outcome.metrics.find((metric) => metric.label === 'Q')?.value ?? '';
    assert.ok(Number(q.replace(',', '.')) > 0.3);
  });

  it('le labo rend un tableau par branche', () => {
    const outcome = runAgentLocally('lab');
    assert.ok(outcome.table);
    assert.ok((outcome.table?.rows.length ?? 0) > 0);
    assert.ok(outcome.table?.rows.every((row) => row.u !== undefined));
  });

  it('le hub recoupe trois agents', () => {
    const outcome = runAgentLocally('hub');
    assert.ok(outcome.metrics.some((metric) => metric.label === 'concordance'));
    assert.equal(outcome.steps.length > 0, true);
  });

  it('refuse un identifiant inconnu', () => {
    assert.throws(() => runAgentLocally('inconnu' as never), /Agent inconnu/);
  });

  it('les aperçus de tuiles ne cassent pas la page', () => {
    const teasers = agentTeaser('theo');
    assert.equal(teasers.ok, true);
    assert.ok(teasers.headline.length > 10);
    assert.ok(teasers.metrics.length > 0);
  });

  it('respecte un document fourni par l’appelant', () => {
    const mine = runAgentLocally('theo').doc;
    const outcome = runAgentLocally('theo', {
      doc: { ...mine, name: 'Mon montage à moi' },
    });
    assert.equal(outcome.doc.name, 'Mon montage à moi');
    assert.ok(outcome.engine.nodes > 0);
  });
});
