import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { AGENTS } from '@/lib/ai/agents';
import { EMBLEM_IDS, hasEmblem } from '@/lib/ai/emblems';
import { templateDoc } from '@/lib/data/loadDoc';
import { runAgentLocally } from './runtime';
import { TASK_IDS, isTaskImplemented, taskOverlay } from './tasks';

/**
 * Deux promesses de la page Agents sont vérifiées ici, sans navigateur :
 *
 *  1. chaque agent *fonctionne* — il répond sur chacune de ses tâches ;
 *  2. changer de tâche change le *résultat*, pas seulement le libellé.
 *
 * Le calcul étant local et déterministe (aucune clé, aucun réseau), ces tests
 * sont aussi une preuve que les onze agents tournent hors ligne.
 */

describe('tâches des agents', () => {
  it('implémente chaque tâche annoncée par un agent', () => {
    const declared = new Set(AGENTS.flatMap((agent) => agent.tasks.map((task) => task.id)));
    assert.ok(declared.size >= 8, `seulement ${declared.size} tâches déclarées`);
    for (const id of declared) {
      if (id === 'equivalence') continue; // couverte par le runner de base de l'agent
      assert.ok(isTaskImplemented(id), `tâche « ${id} » annoncée mais sans calcul`);
    }
    assert.equal(new Set(TASK_IDS).size, TASK_IDS.length);
  });

  it('exécute chaque agent sur chacune de ses tâches', () => {
    for (const agent of AGENTS) {
      for (const task of agent.tasks) {
        const outcome = runAgentLocally(agent.id, { task: task.id });
        assert.equal(outcome.agent, agent.id);
        assert.equal(outcome.task, task.id, `${agent.id} ne renvoie pas la tâche demandée`);
        assert.ok(outcome.summary.length > 20, `${agent.id}/${task.id} : résumé trop court`);
        assert.ok(outcome.metrics.length >= 2, `${agent.id}/${task.id} : aucune grandeur`);
        assert.ok(outcome.steps.length >= 2, `${agent.id}/${task.id} : aucune étape`);
        assert.ok(outcome.studioHref.startsWith('/studio'), `${agent.id} : lien Studio invalide`);
        assert.ok(
          outcome.metrics.every((metric) => metric.value.length > 0),
          `${agent.id}/${task.id} : grandeur vide`,
        );
      }
    }
  });

  it('change réellement la sortie quand la tâche change', () => {
    for (const agent of AGENTS) {
      const summaries = new Set(agent.tasks.map((task) => runAgentLocally(agent.id, { task: task.id }).summary));
      assert.equal(
        summaries.size,
        agent.tasks.length,
        `${agent.id} : deux tâches différentes rendent le même résumé`,
      );
    }
  });

  it('justifie la superposition par la somme des contributions', () => {
    const outcome = runAgentLocally('theo', { task: 'superposition' });
    const metric = outcome.metrics.find((entry) => entry.label === 'écart');
    assert.ok(metric, 'la superposition doit publier son écart');
    const value = Number(metric.value.replace(',', '.').replace(/\s*%$/, ''));
    assert.ok(Number.isFinite(value), `écart illisible : ${metric.value}`);
    assert.ok(value < 0.5, `écart de superposition ${metric.value}`);
    assert.ok(outcome.steps.some((step) => step.title.includes('Somme des contributions')));
  });

  it('recoupe les deux mesures du laboratoire', () => {
    const outcome = runAgentLocally('lab', { task: 'verification' });
    assert.ok(outcome.table, 'le procès-verbal doit produire un tableau');
    assert.ok((outcome.table?.rows.length ?? 0) >= 3);
    assert.ok(outcome.metrics.some((metric) => metric.label === 'R_th mesuré' || metric.label === 'R_th'));
    assert.ok(outcome.metrics.some((metric) => metric.label === 'écart'));
  });

  it('corrige le quiz de bout en bout', () => {
    const outcome = runAgentLocally('mentor', { task: 'quiz' });
    /* la sortie conserve aussi les étapes de base de l'agent : on isole les questions */
    const questions = outcome.steps.filter((step) => step.title.startsWith('Question'));
    assert.equal(questions.length, 4);
    assert.ok(questions.every((step) => step.value.length > 1 && step.value !== '—'));
    assert.equal(outcome.metrics.find((metric) => metric.label === 'questions')?.value, '4');
  });

  it('détaille la contribution de chaque source', () => {
    const doc = runAgentLocally('sources').doc;
    const sources = doc.components.filter((part) => part.kind === 'vsource' || part.kind === 'isource');
    const outcome = runAgentLocally('sources', { task: 'superposition' });
    assert.ok(sources.length > 0);
    assert.ok(outcome.steps.length >= sources.length, 'une étape par source au minimum');
  });

  it('annonce clairement une tâche impossible', () => {
    const doc = runAgentLocally('theo').doc;
    const broken = { ...doc, terminals: { a: '', b: '' } };
    const overlay = taskOverlay('theo', 'verification', broken);
    assert.ok(overlay);
    assert.equal(overlay.ok, false);
    assert.match(overlay.summary ?? '', /impossible/i);
    const diagnostic = taskOverlay('theo', 'diagnostic', broken);
    assert.ok(diagnostic?.metrics?.some((metric) => metric.label === 'erreurs'));
  });

  it('donne à chaque agent un emblème et un gabarit qui existent', () => {
    const ids = AGENTS.map((agent) => agent.id);
    assert.equal(new Set(ids).size, ids.length, 'deux agents partagent le même identifiant');
    assert.equal(EMBLEM_IDS.length, ids.length, 'un agent n’a pas d’emblème');
    for (const id of ids) assert.ok(hasEmblem(id), `${id} n’a pas d’emblème vectoriel`);

    const templates = new Set<string>();
    for (const agent of AGENTS) {
      const doc = templateDoc(agent.template);
      assert.ok(doc && doc.components.length > 0, `${agent.id} → gabarit « ${agent.template} » introuvable`);
      templates.add(agent.template);
    }
    assert.equal(templates.size, AGENTS.length, 'deux agents ouvrent le même montage');
  });
});
