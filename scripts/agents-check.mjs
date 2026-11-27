/**
 * Contrôle d'intégration Next.js ⇄ Express pour les agents.
 *
 * Trois preuves, dans cet ordre :
 *   1. `/api/agents` liste les agents et annonce qui répond ;
 *   2. chaque agent s'exécute via Next et rend des grandeurs mesurées ;
 *   3. quand le service Express tourne, le même appel est **délégué** et la
 *      réponse porte `servedBy: 'express'` — sans changer de résultat.
 *
 * Usage : BASE_URL=http://127.0.0.1:3000 node scripts/agents-check.mjs
 *         EXPRESS_URL=http://127.0.0.1:4001 (facultatif, 3e partie seulement)
 */
const base = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const expressUrl = (process.env.EXPRESS_URL ?? '').replace(/\/$/, '');

const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok });
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const json = async (path, init) => {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 160) };
  }
  return { status: response.status, body, headers: response.headers };
};

/* ---------------------------------------------------------------- 1. catalogue */
const catalogue = await json('/api/agents');
check('GET /api/agents répond 200', catalogue.status === 200, `HTTP ${catalogue.status}`);
const agents = catalogue.body?.agents ?? [];
check('le catalogue contient les onze agents', agents.length >= 11, `${agents.length} agents`);
check(
  'chaque agent a son emblème et ses tâches',
  agents.every((agent) => agent.avatar?.startsWith('/agents/') && (agent.tasks?.length ?? 0) > 0),
);
check(
  'le serveur qui répond est annoncé',
  ['next', 'express'].includes(catalogue.body?.servedBy),
  String(catalogue.body?.servedBy),
);

/* ---------------------------------------------------------------- 2. exécution */
const ids = agents.map((agent) => agent.id);
let executed = 0;
let failures = [];
for (const id of ids) {
  const run = await json(`/api/agents/${id}/run`, { method: 'POST', body: JSON.stringify({}) });
  const outcome = run.body?.outcome;
  const ok = run.status === 200 && Boolean(outcome) && outcome.metrics?.length > 0;
  if (ok) executed += 1;
  else failures.push(`${id} (HTTP ${run.status}${run.body?.error ? ` · ${run.body.error}` : ''})`);
}
check(
  'les agents s’exécutent tous par l’API',
  executed === ids.length,
  failures.length ? failures.join(', ') : `${executed}/${ids.length}`,
);

const theo = await json('/api/agents/theo/run', { method: 'POST', body: JSON.stringify({}) });
const theoOutcome = theo.body?.outcome;
check('Théo renvoie U_th et R_th', Boolean(theoOutcome?.metrics?.some((m) => m.label === 'U_th')));
check('Théo joint un lien vers le Studio', Boolean(theoOutcome?.studioHref?.startsWith('/studio')));
check(
  'la sortie indique le moteur et le temps de calcul',
  typeof theoOutcome?.engine?.ms === 'number' && theoOutcome.engine.ms < 2000,
  `${theoOutcome?.engine?.ms} ms`,
);

const convert = await json('/api/agents/convert/run', { method: 'POST', body: JSON.stringify({}) });
const gap = convert.body?.outcome?.metrics?.find((metric) => metric.label === 'écart')?.value ?? '';
check('Équivalence mesure l’écart T ⇄ N', /%/.test(gap), gap);

const coils = await json('/api/agents/coils/run', {
  method: 'POST',
  body: JSON.stringify({ values: { r: 1000, c: 1e-7, l: 1e-2 } }),
});
const f0 = coils.body?.outcome?.metrics?.find((metric) => metric.label === 'f₀')?.value ?? '';
check('Bobines calcule f₀ à partir des valeurs imposées', /5[,.]0\d/.test(f0), f0);

/* -------------------------------------------- 2 bis. une tâche = un calcul */
const superposition = await json('/api/agents/theo/run', {
  method: 'POST',
  body: JSON.stringify({ task: 'superposition' }),
});
const superpositionGap = superposition.body?.outcome?.metrics?.find((metric) => metric.label === 'écart')?.value ?? '';
check(
  'la tâche « superposition » publie son écart de linéarité',
  /%/.test(superpositionGap),
  superpositionGap,
);
check(
  'la somme des contributions est détaillée',
  (superposition.body?.outcome?.steps ?? []).some((step) => /Somme des contributions/.test(step.title)),
);

const quiz = await json('/api/agents/mentor/run', { method: 'POST', body: JSON.stringify({ task: 'quiz' }) });
const quizSteps = quiz.body?.outcome?.steps ?? [];
check(
  'la tâche « quiz » corrige quatre questions',
  quizSteps.length === 4 && quizSteps.every((step) => /^Question/.test(step.title)),
  `${quizSteps.length} questions`,
);

const verification = await json('/api/agents/lab/run', {
  method: 'POST',
  body: JSON.stringify({ task: 'verification' }),
});
check(
  'la tâche « verification » rend un procès-verbal',
  (verification.body?.outcome?.table?.rows?.length ?? 0) >= 3,
  `${verification.body?.outcome?.table?.rows?.length ?? 0} lignes`,
);

const taskDiff = await json('/api/agents/theo/run', { method: 'POST', body: JSON.stringify({ task: 'diagnostic' }) });
check(
  'deux tâches ne rendent pas le même résumé',
  taskDiff.body?.outcome?.summary !== superposition.body?.outcome?.summary,
);

const unknown = await json('/api/agents/pirate/run', { method: 'POST', body: JSON.stringify({}) });
check('un agent inconnu est refusé (404)', unknown.status === 404, `HTTP ${unknown.status}`);

const health = await json('/api/agents/health');
check(
  'GET /api/agents/health décrit les deux serveurs',
  health.status === 200 && health.body?.next?.alive === true && Boolean(health.body?.express),
  `express ${health.body?.express?.reachable ? 'joignable' : 'muet'}`,
);

/* ---------------------------------------------------------------- 3. délégation */
if (expressUrl) {
  const direct = await fetch(`${expressUrl}/api/v1/agents`, { headers: { 'Content-Type': 'application/json' } })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  check('Express sert /api/v1/agents', Boolean(direct?.agents?.length), `${direct?.agents?.length ?? 0} agents`);

  const remote = await fetch(`${expressUrl}/api/v1/agents/theo/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
  check('Express exécute un agent', Boolean(remote?.outcome?.metrics?.length), remote?.outcome?.name ?? '—');

  // même montage des deux côtés → mêmes grandeurs
  const viaNext = await json('/api/agents/theo/run', { method: 'POST', body: JSON.stringify({}) });
  const nextMetrics = viaNext.body?.outcome?.metrics ?? [];
  const remoteMetrics = remote?.outcome?.metrics ?? [];
  check(
    'les deux serveurs donnent les mêmes grandeurs',
    nextMetrics.length === remoteMetrics.length &&
      nextMetrics.every((metric, index) => metric.label === remoteMetrics[index]?.label && metric.value === remoteMetrics[index]?.value),
    nextMetrics.map((metric) => `${metric.label}=${metric.value}`).join(' · '),
  );
  check(
    'Next délègue à Express quand il est joignable',
    viaNext.body?.servedBy === 'express',
    `servedBy = ${viaNext.body?.servedBy}`,
  );
} else {
  console.log('· partie délégation ignorée (EXPRESS_URL non défini)');
}

const passed = results.filter((result) => result.ok).length;
console.log(`\n${passed}/${results.length} contrôles passés`);
process.exit(passed === results.length ? 0 : 1);
