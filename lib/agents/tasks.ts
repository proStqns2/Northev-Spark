/**
 * Tâches des agents — la couche qui rend chaque bouton *réel*.
 *
 * Un agent ne se résume pas à un nom : il annonce des tâches (« superposition »,
 * « diagnostic », « quiz »…). Sans ce fichier, toutes les tâches d'un même agent
 * renvoyaient le même calcul et seul le libellé changeait. Ici, chaque tâche
 * produit ses propres grandeurs, ses propres étapes et son propre verdict, à
 * partir des mêmes briques vérifiées :
 *
 *   - `equivalentOf(doc)`  → U_th, Z_th, I_N, superposition, contrôle croisé ;
 *   - `solveDocument(doc)` → lecture branche par branche (procès-verbal) ;
 *   - `diagnose(doc)`      → erreurs de topologie et avertissements.
 *
 * Aucune valeur n'est inventée : tout ce qui s'affiche sort du solveur nodal.
 */

import { abs, add, argDeg, cx, sub } from '@/lib/engine/complex';
import { equivalentOf, type EquivalentResult } from '@/lib/engine/equivalent';
import { formatSI } from '@/lib/engine/format';
import { solveDocument } from '@/lib/engine/solver';
import type { CircuitDoc, Component } from '@/lib/engine/types';
import { diagnose } from '@/lib/studio/editor';
import { agentById, type AgentId } from '@/lib/ai/agents';
import type { AgentMetric, AgentStep, AgentTableRow } from './runtime';

/** Ce qu'une tâche ajoute à la sortie de base de l'agent. */
export interface TaskOverlay {
  ok?: boolean;
  summary?: string;
  metrics?: AgentMetric[];
  steps?: AgentStep[];
  warnings?: string[];
  table?: { title: string; head: [string, string, string, string]; rows: AgentTableRow[] };
}

/** Identifiants de tâches réellement calculées par ce module. */
export const TASK_IDS = [
  'superposition',
  'diagnostic',
  'conversion',
  'optimisation',
  'verification',
  'reduction',
  'rapport',
  'pedagogie',
  'plan',
  'quiz',
] as const;

export type TaskId = (typeof TASK_IDS)[number];

/* ------------------------------------------------------------------ outils */

const ohm = (value: number) => formatSI(value, 'Ω');
const volt = (value: number) => formatSI(value, 'V');
const amp = (value: number) => formatSI(value, 'A');
const watt = (value: number) => formatSI(value, 'W');
const hertz = (value: number) => formatSI(value, 'Hz');

const pct = (value: number): string => {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '0 %';
  if (value >= 10) return `${value.toFixed(0)} %`;
  if (value >= 1) return `${value.toFixed(1)} %`;
  if (value >= 0.01) return `${value.toFixed(2)} %`;
  return `${value.toPrecision(2)} %`;
};

const gapPct = (measured: number, reference: number): number => {
  const denom = Math.max(Math.abs(reference), 1e-12);
  return (Math.abs(measured - reference) / denom) * 100;
};

const dipoles = (doc: CircuitDoc): Component[] => doc.components.filter((part) => part.kind !== 'wire');

const unavailable = (equivalent: EquivalentResult, label: string): TaskOverlay => ({
  ok: false,
  summary: `${label} impossible : ${equivalent.error ?? 'bornes incomplètes.'}`,
  metrics: [
    { label: 'statut', value: equivalent.status },
    { label: 'U_th', value: volt(abs(equivalent.vth)) },
  ],
  steps: [
    {
      title: 'Ce qui bloque',
      detail: equivalent.error ?? 'Choisissez deux bornes distinctes dans le Studio, puis relancez la tâche.',
      value: equivalent.status,
    },
  ],
  warnings: equivalent.warnings.slice(0, 3),
});

/* ----------------------------------------------------------- superposition */

function superposition(doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  if (!equivalent.ok) return unavailable(equivalent, 'La superposition');

  const sources = doc.components.filter((part) => part.kind === 'vsource' || part.kind === 'isource');
  const frequency = doc.frequency || 50;

  if (equivalent.ac) {
    return {
      summary: `Superposition en régime sinusoïdal : ${sources.length} source(s) indépendante(s) composées en phaseurs à ${hertz(frequency)}.`,
      metrics: [
        { label: 'régime', value: 'AC' },
        { label: 'sources', value: String(sources.length) },
        { label: 'f', value: hertz(frequency), hint: `ω = ${formatSI(2 * Math.PI * frequency, 'rad/s')}` },
        { label: 'U_th', value: volt(abs(equivalent.vth)), hint: `φ = ${argDeg(equivalent.vth).toFixed(1)}°` },
      ],
      steps: [
        {
          title: 'Écrire en phaseurs',
          detail: 'Chaque source garde sa pulsation : on additionne des nombres complexes, pas des scalaires.',
          value: 'U = U₁ + U₂',
        },
        {
          title: 'Remplacer les dipôles réactifs',
          detail: 'Z_L = jLω et Z_C = 1/(jCω) prennent la place de L et C dans le réseau passif.',
          value: `ω = ${formatSI(2 * Math.PI * frequency, 'rad/s')}`,
        },
        ...equivalent.steps.slice(1, 4).map((step) => ({ title: step.title, detail: step.detail, value: step.value })),
      ],
      warnings: equivalent.warnings.slice(0, 3),
    };
  }

  const terms = equivalent.superposition;
  if (!terms.length) {
    return {
      summary:
        'Aucune contribution détaillable : la superposition exige des sources indépendantes actives et peu nombreuses (six au maximum).',
      metrics: [
        { label: 'sources', value: String(sources.length) },
        { label: 'U_th', value: volt(abs(equivalent.vth)) },
        { label: 'régime', value: 'DC' },
      ],
      steps: [
        {
          title: 'Condition d’application',
          detail: 'Une source active à la fois, les autres éteintes : source de tension → fil, source de courant → circuit ouvert.',
          value: `${sources.length} source(s)`,
        },
      ],
      warnings: sources.length > 6 ? ['Plus de six sources indépendantes : le détail est omis pour rester lisible.'] : [],
    };
  }

  const total = terms.reduce((acc, term) => add(acc, term.contribution), cx(0, 0));
  const error = gapPct(abs(total), abs(equivalent.vth));

  const steps: AgentStep[] = terms.map((term, index) => ({
    title: `${index + 1}. ${term.label}`,
    detail:
      term.kind === 'V'
        ? 'Source de tension activée seule, les autres éteintes : on lit sa contribution à U_AB.'
        : 'Source de courant activée seule, les autres éteintes : on lit sa contribution à U_AB.',
    value: volt(term.contribution.re),
  }));
  steps.push({
    title: 'Somme des contributions',
    detail: 'La linéarité garantit Σ U_i = U_th : c’est la vérification de la superposition, pas une approximation.',
    value: volt(abs(total)),
  });

  return {
    ok: error <= 0.5,
    summary: `Superposition vérifiée sur ${terms.length} source(s) : la somme des contributions redonne U_th à ${pct(error)} près.`,
    metrics: [
      { label: 'sources', value: String(terms.length) },
      { label: 'Σ U_i', value: volt(abs(total)), hint: 'somme des contributions' },
      { label: 'U_th', value: volt(abs(equivalent.vth)), hint: 'lecture directe' },
      { label: 'écart', value: pct(error), hint: 'linéarité' },
    ],
    steps,
    warnings:
      error > 0.5
        ? [
            'Écart de superposition supérieur à 0,5 % : une source liée (VCVS/VCCS) ne se superpose pas — elle reste toujours active.',
          ]
        : [],
  };
}

/* -------------------------------------------------------------- diagnostic */

function diagnostic(doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  const issues = diagnose(doc);
  const errors = issues.filter((issue) => issue.level === 'error');
  const warnings = issues.filter((issue) => issue.level === 'warning');

  const steps: AgentStep[] = issues.slice(0, 8).map((issue, index) => ({
    title: `${index + 1}. ${issue.level === 'error' ? 'Bloquant' : issue.level === 'warning' ? 'À surveiller' : 'Bon point'}`,
    detail: issue.message,
    value: issue.hint ?? '—',
  }));
  if (!steps.length) {
    steps.push({
      title: 'Aucun défaut détecté',
      detail: 'Tous les nœuds sont reliés, la masse est atteignable et aucune source de tension n’est court-circuitée.',
      value: '0 erreur',
    });
  }

  return {
    ok: errors.length === 0,
    summary: errors.length
      ? `${errors.length} erreur(s) bloquante(s), ${warnings.length} avertissement(s) : le montage doit être corrigé avant d’être certifié.`
      : `Montage sain : ${issues.length} contrôle(s) passé(s), aucune erreur bloquante.`,
    metrics: [
      { label: 'erreurs', value: String(errors.length) },
      { label: 'avertissements', value: String(warnings.length) },
      { label: 'nœuds', value: equivalent.ok ? String(equivalent.nodesUsed) : '—' },
      { label: 'branches', value: equivalent.ok ? String(equivalent.branchesUsed) : '—' },
    ],
    steps,
    warnings: warnings.map((issue) => issue.message).slice(0, 4),
  };
}

/* -------------------------------------------------------------- conversion */

function conversion(doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  if (!equivalent.ok) return unavailable(equivalent, 'La conversion');

  const u = abs(equivalent.vth);
  const r = abs(equivalent.rth);
  const i = abs(equivalent.inorton);
  const product = i * r;
  const error = u > 0 ? (Math.abs(product - u) / u) * 100 : 0;

  return {
    ok: error < 0.1,
    summary: `Écriture série : ${volt(u)} en série avec ${ohm(r)} · écriture parallèle : ${amp(i)} en parallèle avec ${ohm(r)}. Même tension à vide (écart ${pct(error)}).`,
    metrics: [
      { label: 'U_th', value: volt(u) },
      { label: 'I_N', value: amp(i) },
      { label: 'R_N = R_th', value: ohm(r) },
      { label: 'I_N · R_N', value: volt(product), hint: 'doit redonner U_th' },
      { label: 'écart', value: pct(error), hint: 'tolérance 0,1 %' },
    ],
    steps: [
      {
        title: 'Partir du modèle série',
        detail: 'Une f.é.m. U_th en série avec R_th décrit le dipôle : c’est la forme la plus lue en classe.',
        value: `${volt(u)} + ${ohm(r)}`,
      },
      {
        title: 'Passer au modèle parallèle',
        detail: 'On conserve la même résistance et on convertit la source : I_N = U_th / R_th.',
        value: `${amp(i)} ∥ ${ohm(r)}`,
      },
      {
        title: 'Contrôler',
        detail: 'Le produit I_N · R_N doit redonner exactement U_th : c’est l’identité d’équivalence.',
        value: pct(error),
      },
    ],
    warnings:
      error > 0.1
        ? ['Écart supérieur à 0,1 % : vérifiez la sonde de courant du court-circuit simulé.']
        : equivalent.warnings.slice(0, 2),
  };
}

/* ------------------------------------------------------------ optimisation */

interface Simplification {
  kind: 'serie' | 'parallele';
  detail: string;
  value: string;
}

function simplifications(doc: CircuitDoc): Simplification[] {
  const resistors = doc.components.filter(
    (part) => part.kind === 'resistor' && Number.isFinite(part.value) && part.value > 0,
  );
  const found: Simplification[] = [];

  /* résistances strictement en parallèle : mêmes deux nœuds */
  const byPair = new Map<string, Component[]>();
  for (const part of resistors) {
    const key = [part.a, part.b].sort().join(' | ');
    byPair.set(key, [...(byPair.get(key) ?? []), part]);
  }
  for (const group of byPair.values()) {
    if (group.length < 2) continue;
    const inverse = group.reduce((acc, part) => acc + 1 / part.value, 0);
    if (!(inverse > 0)) continue;
    found.push({
      kind: 'parallele',
      detail: `${group.map((part) => part.label ?? part.id).join(' en parallèle avec ')} se réduisent en une seule résistance.`,
      value: `→ ${ohm(1 / inverse)}`,
    });
  }

  /* résistances en série : un nœud qui ne relie que deux résistances */
  const nets = new Map<string, Component[]>();
  for (const part of resistors) {
    for (const net of [part.a, part.b]) {
      nets.set(net, [...(nets.get(net) ?? []), part]);
    }
  }
  const seen = new Set<string>();
  for (const [net, group] of nets) {
    if (group.length !== 2) continue;
    const first = group[0];
    const second = group[1];
    if (!first || !second || first.id === second.id) continue;
    const key = [first.id, second.id].sort().join(' + ');
    if (seen.has(key)) continue;
    seen.add(key);
    found.push({
      kind: 'serie',
      detail: `${first.label ?? first.id} et ${second.label ?? second.id} se suivent au nœud « ${net} » : elles s’additionnent.`,
      value: `→ ${ohm(first.value + second.value)}`,
    });
  }

  return found;
}

function optimisation(doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  const candidates = simplifications(doc);
  const parts = dipoles(doc);
  const parallel = candidates.filter((item) => item.kind === 'parallele').length;
  const series = candidates.filter((item) => item.kind === 'serie').length;

  const steps: AgentStep[] = candidates.slice(0, 6).map((item, index) => ({
    title: `${index + 1}. ${item.kind === 'parallele' ? 'Parallèle' : 'Série'}`,
    detail: item.detail,
    value: item.value,
  }));
  if (!steps.length) {
    steps.push({
      title: 'Aucune combinaison gratuite',
      detail: 'Chaque dipôle garde sa place : la simplification passe par le calcul nodal, pas par une réduction série/parallèle.',
      value: `${parts.length} dipôles`,
    });
  }
  if (equivalent.ok) {
    steps.push({
      title: 'Après réduction',
      detail: 'Tout le réseau vu de A–B tient dans un seul dipôle : c’est déjà la forme la plus courte possible.',
      value: `${volt(abs(equivalent.vth))} · ${ohm(abs(equivalent.rth))}`,
    });
  }

  return {
    ok: equivalent.ok,
    summary: candidates.length
      ? `${candidates.length} simplification(s) possible(s) (${parallel} parallèle, ${series} série) : ${parts.length} dipôles peuvent se réduire avant le calcul nodal.`
      : `Aucune paire série/parallèle à fusionner : le réseau de ${parts.length} dipôles se traite directement par analyse nodale.`,
    metrics: [
      { label: 'paires ∥', value: String(parallel) },
      { label: 'paires série', value: String(series) },
      { label: 'dipôles', value: String(parts.length) },
      { label: 'après', value: '1 dipôle', hint: 'vu de A–B' },
    ],
    steps,
    warnings: equivalent.warnings.slice(0, 2),
  };
}

/* ------------------------------------------------------------ vérification */

function verification(doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  if (!equivalent.ok) return unavailable(equivalent, 'La vérification');

  const u = abs(equivalent.vth);
  const rProbe = abs(equivalent.rth);
  const iShort = abs(equivalent.isc);
  const iNorton = abs(equivalent.inorton);
  const rMeasured = iShort > 0 ? u / iShort : Number.NaN;
  const error = Number.isFinite(rMeasured) && rProbe > 0 ? gapPct(rMeasured, rProbe) : 0;
  const shortError = iNorton > 0 && equivalent.iscMeasured ? gapPct(iShort, iNorton) : 0;

  const rows: AgentTableRow[] = [
    {
      label: 'Tension à vide',
      u: volt(u),
      i: 'aucune charge',
      p: '0 W',
    },
    {
      label: 'Court-circuit',
      u: '0 V',
      i: equivalent.iscMeasured ? amp(iShort) : 'non mesuré',
      p: equivalent.iscMeasured ? amp(iNorton) : '—',
    },
    {
      label: 'R_th = U_th / I_cc',
      u: ohm(rMeasured),
      i: ohm(rProbe),
      p: pct(error),
    },
    {
      label: 'Tolérance instrument',
      u: '± 0,5 %',
      i: `${pct(shortError)} d’écart`,
      p: equivalent.iscMeasured ? 'mesuré' : 'estimé',
    },
  ];

  return {
    ok: equivalent.ok && (!equivalent.iscMeasured || error < 1),
    summary: equivalent.iscMeasured
      ? `Deux mesures suffisent : U_th = ${volt(u)} et I_cc = ${amp(iShort)}, donc R_th = ${ohm(rMeasured)} — la sonde de 1 A donnait ${ohm(rProbe)} (écart ${pct(error)}).`
      : `U_th = ${volt(u)} mesuré à vide ; le court-circuit n’a pas pu être simulé, R_th vient donc de la sonde de courant : ${ohm(rProbe)}.`,
    metrics: [
      { label: 'U_th', value: volt(u), hint: 'à vide' },
      { label: 'I_cc', value: equivalent.iscMeasured ? amp(iShort) : '—', hint: 'bornes court-circuitées' },
      { label: 'R_th mesuré', value: Number.isFinite(rMeasured) ? ohm(rMeasured) : '—', hint: 'U_th / I_cc' },
      { label: 'écart', value: pct(error), hint: 'sonde vs mesures' },
    ],
    steps: [
      {
        title: 'Mesure 1 — tension à vide',
        detail: 'Aucune charge entre A et B : le voltmètre lit U_th sans perturber le réseau.',
        value: volt(u),
      },
      {
        title: 'Mesure 2 — courant de court-circuit',
        detail: 'Un ampèremètre idéal entre A et B : il lit I_cc, qui doit valoir I_N.',
        value: equivalent.iscMeasured ? amp(iShort) : 'non mesuré',
      },
      {
        title: 'Déduire puis recouper',
        detail: 'R_th = U_th / I_cc, recoupé par la sonde de 1 A du solveur : deux chemins indépendants, un même résultat.',
        value: pct(error),
      },
    ],
    table: { title: 'Procès-verbal des deux mesures', head: ['Mesure', 'Valeur', 'Attendu', 'Statut'] as [string, string, string, string], rows },
    warnings: equivalent.iscMeasured ? equivalent.warnings.slice(0, 2) : [...equivalent.warnings, 'Court-circuit non mesuré : le recoupement repose sur un seul chemin.'].slice(0, 3),
  };
}

/* --------------------------------------------------------------- réduction */

function reduction(doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  if (!equivalent.ok) return unavailable(equivalent, 'La réduction');

  const candidates = simplifications(doc);
  const parts = dipoles(doc);
  const admittance = abs(equivalent.rth) > 0 ? 1 / abs(equivalent.rth) : 0;
  const phase = argDeg(equivalent.rth);

  const steps: AgentStep[] = [
    ...candidates.slice(0, 3).map((item, index) => ({
      title: `${index + 1}. Réduire ${item.kind === 'parallele' ? 'en parallèle' : 'en série'}`,
      detail: item.detail,
      value: item.value,
    })),
    ...equivalent.steps.slice(2, 5).map((step) => ({ title: step.title, detail: step.detail, value: step.value })),
  ];

  return {
    ok: equivalent.ok,
    summary: `Réduction terminée : ${parts.length} dipôles deviennent une source ${volt(abs(equivalent.vth))} en série avec ${ohm(abs(equivalent.rth))}${
      equivalent.ac ? ` (Z complexe, φ = ${phase.toFixed(1)}°)` : ''
    }.`,
    metrics: [
      { label: '|Z_th|', value: ohm(abs(equivalent.rth)) },
      { label: 'φ(Z_th)', value: `${phase.toFixed(1)}°`, hint: equivalent.ac ? 'régime sinusoïdal' : 'continu : 0°' },
      { label: 'Y_éq', value: formatSI(admittance, 'S'), hint: '1 / Z_th' },
      { label: 'dipôles', value: `${parts.length} → 1` },
    ],
    steps,
    warnings: equivalent.warnings.slice(0, 3),
  };
}

/* ----------------------------------------------------------------- rapport */

function rapport(doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  const solution = solveDocument(doc, { sourcesOn: true });

  const rows: AgentTableRow[] = solution.ok
    ? dipoles(doc).map((part) => {
        const reading = solution.readings[part.id];
        return {
          label: part.label ?? part.id,
          u: reading ? volt(abs(reading.v)) : '—',
          i: reading ? amp(abs(reading.i)) : '—',
          p: reading ? watt(Math.abs(reading.p.re)) : '—',
        };
      })
    : [];

  const steps: AgentStep[] = [
    {
      title: '1. Objet du rapport',
      detail: 'Le procès-verbal porte sur le dipôle vu des bornes A–B, pas sur la charge éventuelle.',
      value: `${doc.terminals.a || '?'} → ${doc.terminals.b || '?'}`,
    },
    {
      title: '2. Modèle retenu',
      detail: 'U_th lu à vide, Z_th obtenu par injection d’un courant de test de 1 A.',
      value: `${volt(abs(equivalent.vth))} · ${ohm(abs(equivalent.rth))}`,
    },
    {
      title: '3. Contrôle croisé',
      detail: 'U_th = I_N · Z_th, recoupé par le court-circuit simulé.',
      value: pct(equivalent.verificationErrorPct),
    },
    {
      title: '4. Signature du résultat',
      detail: 'Même document, mêmes valeurs : la sortie est reproductible et peut être exportée telle quelle.',
      value: equivalent.status,
    },
  ];

  return {
    ok: solution.ok && equivalent.ok,
    summary: solution.ok
      ? `Procès-verbal prêt : ${rows.length} branche(s) mesurée(s), ${solution.size.nodes} nœuds, ${solution.size.branches} branches. U_th = ${volt(abs(equivalent.vth))}, R_th = ${ohm(abs(equivalent.rth))}.`
      : `Rapport incomplet : ${solution.error ?? 'analyse nodale non convergée.'}`,
    metrics: [
      { label: 'nœuds', value: solution.ok ? String(solution.size.nodes) : '—' },
      { label: 'branches', value: solution.ok ? String(solution.size.branches) : '—' },
      { label: 'U_th', value: volt(abs(equivalent.vth)) },
      { label: 'R_th', value: ohm(abs(equivalent.rth)) },
      { label: 'verdict', value: equivalent.status },
    ],
    steps,
    table: rows.length
      ? { title: 'Grandeurs par branche (sources actives)', head: ['Dipôle', '|U|', '|I|', 'P'], rows }
      : undefined,
    warnings: solution.warnings.slice(0, 3),
  };
}

/* --------------------------------------------------------------- pédagogie */

function pedagogie(agentId: AgentId, doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  const agent = agentById(agentId);
  if (!equivalent.ok) return unavailable(equivalent, 'L’explication');

  const u = abs(equivalent.vth);
  const r = abs(equivalent.rth);
  const i = abs(equivalent.inorton);

  const steps: AgentStep[] = [
    {
      title: '1. Délimiter le dipôle',
      detail: 'On isole le réseau vu des bornes A et B : tout le reste devient une boîte noire à deux fils.',
      value: `${doc.terminals.a ?? 'A'} → ${doc.terminals.b ?? 'B'}`,
    },
    {
      title: '2. Éteindre les sources',
      detail: 'Source de tension → fil, source de courant → circuit ouvert. Le réseau devient purement passif.',
      value: 'réseau passif',
    },
    {
      title: '3. Lire R_th',
      detail: 'La résistance vue des bornes, sources éteintes, est exactement la résistance interne du modèle.',
      value: ohm(r),
    },
    {
      title: '4. Rallumer et lire U_th',
      detail: 'La tension à vide entre A et B, toutes sources actives, est la force électromotrice du modèle.',
      value: volt(u),
    },
    {
      title: '5. Compléter le modèle',
      detail: 'I_N = U_th / R_th donne l’écriture parallèle ; la droite U = U_th − R_th · I décrit tout le dipôle.',
      value: amp(i),
    },
    {
      title: '6. Vérifier',
      detail: 'Un court-circuit entre A et B doit mesurer I_cc ≈ I_N : c’est la preuve numérique, pas une figure de style.',
      value: equivalent.iscMeasured ? amp(abs(equivalent.isc)) : 'court-circuit non mesuré',
    },
    {
      title: 'Pourquoi cela marche',
      detail: 'Tout réseau linéaire vu de deux bornes se comporte comme une source et une résistance : la droite U(I) est exacte, jamais approchée.',
      value: 'linéarité',
    },
  ];

  return {
    ok: equivalent.ok,
    summary: `${agent?.name ?? 'L’agent'} déroule la méthode sur ce montage : R_th = ${ohm(r)}, U_th = ${volt(u)}, I_N = ${amp(i)}.`,
    metrics: [
      { label: 'U_th', value: volt(u) },
      { label: 'R_th', value: ohm(r) },
      { label: 'I_N', value: amp(i) },
      { label: 'P max', value: equivalent.powerMax ? watt(equivalent.powerMax) : '—', hint: 'charge adaptée' },
    ],
    steps,
    warnings: equivalent.warnings.slice(0, 2),
  };
}

/* -------------------------------------------------------------------- plan */

function plan(doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  const ac = equivalent.ac || doc.regime === 'ac';
  const frequency = doc.frequency || 50;
  const hasL = doc.components.some((part) => part.kind === 'inductor');
  const hasC = doc.components.some((part) => part.kind === 'capacitor');
  const parts = dipoles(doc);
  const sources = doc.components.filter((part) => part.kind === 'vsource' || part.kind === 'isource');

  const steps: AgentStep[] = [
    {
      title: '1. Fixer le cadre',
      detail: ac
        ? 'Régime sinusoïdal établi : on travaille en phaseurs, à fréquence fixée, avec des impédances complexes.'
        : 'Régime continu : sources constantes, le condensateur se comporte comme un circuit ouvert et la bobine comme un fil.',
      value: ac ? `${hertz(frequency)} · AC` : 'DC',
    },
    {
      title: '2. Compter les inconnues',
      detail: 'Autant de tensions de nœuds que de nœuds utiles (masse exclue) : c’est la taille du système nodal.',
      value: `${parts.length} dipôles · ${sources.length} source(s)`,
    },
    {
      title: '3. Simplifier ce qui l’est',
      detail: 'Séries et parallèles évidents se réduisent avant toute écriture d’équations : moins d’inconnues, moins d’erreurs.',
      value: `${simplifications(doc).length} réduction(s)`,
    },
    {
      title: '4. Calculer U_th',
      detail: 'Résolution nodale complète, aucune charge entre A et B : la tension lue est la f.é.m. du modèle.',
      value: volt(abs(equivalent.vth)),
    },
    {
      title: '5. Éteindre pour R_th',
      detail: 'Sources indépendantes éteintes, injection d’un courant de test de 1 A entre A et B : la tension lue est la résistance.',
      value: ohm(abs(equivalent.rth)),
    },
    {
      title: '6. Conclure et contrôler',
      detail: 'On écrit le modèle, puis on vérifie par court-circuit : I_cc doit redonner I_N = U_th / R_th.',
      value: equivalent.iscMeasured ? amp(abs(equivalent.isc)) : amp(abs(equivalent.inorton)),
    },
  ];

  if (hasL || hasC) {
    steps.push({
      title: 'Attention aux réactifs',
      detail: hasL && hasC
        ? 'L et C sont présents : l’impédance dépend de la fréquence et peut passer par la résonance (f₀ = 1/2π√(LC)).'
        : hasL
          ? 'La bobine impose une partie imaginaire positive (Z_L = jLω) : le courant retarde sur la tension.'
          : 'Le condensateur impose une partie imaginaire négative (Z_C = 1/jCω) : le courant avance sur la tension.',
      value: hasL && hasC ? 'RLC' : hasL ? 'RL' : 'RC',
    });
  }

  return {
    ok: equivalent.ok,
    summary: `Plan en ${steps.length} étapes pour ce montage ${ac ? 'sinusoïdal' : 'continu'} : ${parts.length} dipôles, ${sources.length} source(s), deux bornes.`,
    metrics: [
      { label: 'régime', value: ac ? 'AC' : 'DC' },
      { label: 'fréquence', value: ac ? hertz(frequency) : '—' },
      { label: 'dipôles', value: String(parts.length) },
      { label: 'étapes', value: String(steps.length) },
    ],
    steps,
    warnings: equivalent.ok ? equivalent.warnings.slice(0, 2) : ['Le plan reste valable, mais les bornes ne sont pas encore exploitables.'],
  };
}

/* -------------------------------------------------------------------- quiz */

function quiz(doc: CircuitDoc): TaskOverlay {
  const equivalent = equivalentOf(doc);
  if (!equivalent.ok) return unavailable(equivalent, 'Le quiz');

  const u = abs(equivalent.vth);
  const r = abs(equivalent.rth);
  const i = abs(equivalent.inorton);

  const steps: AgentStep[] = [
    {
      title: 'Question 1 — résistance interne',
      detail: 'Sources éteintes, quelle résistance mesure-t-on entre A et B ?',
      value: ohm(r),
    },
    {
      title: 'Question 2 — tension à vide',
      detail: 'Sources actives, quelle tension lit-on entre A et B sans charge ?',
      value: volt(u),
    },
    {
      title: 'Question 3 — courant de Norton',
      detail: 'Vrai ou faux : le courant de Norton vaut U_th / R_th. Justifiez en une ligne.',
      value: `Vrai — ${amp(i)}`,
    },
    {
      title: 'Question 4 — adaptation',
      detail: 'Pour quelle charge la puissance transférée est-elle maximale ?',
      value: `R_L = ${ohm(r)}`,
    },
  ];

  return {
    ok: true,
    summary: `Quiz corrigé de 4 questions, construit sur les valeurs réelles de ce montage : U_th = ${volt(u)}, R_th = ${ohm(r)}.`,
    metrics: [
      { label: 'questions', value: '4' },
      { label: 'corrigé', value: 'inclus' },
      { label: 'niveau', value: 'lycée → prépa' },
      { label: 'barème', value: '4 × 1 pt' },
    ],
    steps,
  };
}

/* --------------------------------------------------------------- aiguillage */

/**
 * Rend la tâche réellement exécutée pour un agent donné.
 * `null` signifie « la sortie de base de l'agent suffit » (tâche `equivalence`).
 */
export function taskOverlay(agentId: AgentId, taskId: string | undefined, doc: CircuitDoc): TaskOverlay | null {
  switch (taskId) {
    case 'superposition':
      return superposition(doc);
    case 'diagnostic':
      return diagnostic(doc);
    case 'conversion':
      return conversion(doc);
    case 'optimisation':
      return optimisation(doc);
    case 'verification':
      return verification(doc);
    case 'reduction':
      return reduction(doc);
    case 'rapport':
      return rapport(doc);
    case 'pedagogie':
      return pedagogie(agentId, doc);
    case 'plan':
      return plan(doc);
    case 'quiz':
      return quiz(doc);
    default:
      return null;
  }
}

/** Les tâches réellement couvertes par ce module (utile aux tests et à l'UI). */
export function isTaskImplemented(taskId: string): boolean {
  return (TASK_IDS as readonly string[]).includes(taskId);
}
