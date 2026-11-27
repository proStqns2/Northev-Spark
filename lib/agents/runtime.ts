/**
 * Runtime des agents — le seul endroit où un agent « travaille ».
 *
 * Next.js et Express importent ce module : le résultat est donc identique
 * quel que soit le serveur qui répond, et un agent n'a *jamais* besoin d'une
 * clé d'API pour calculer. Chaque agent expose une fonction pure qui reçoit un
 * montage (ou des valeurs R · C · L) et rend : les grandeurs mesurées, les
 * étapes de raisonnement, les avertissements et le document utilisé.
 *
 * Le modèle de langage, s'il est activé, ne sert qu'à rédiger une explication :
 * il n'entre pas dans ce fichier.
 */

import { abs, argDeg, cx } from '@/lib/engine/complex';
import { equivalentOf, type EquivalentResult } from '@/lib/engine/equivalent';
import { formatSI } from '@/lib/engine/format';
import { solveDocument, type SolveResult } from '@/lib/engine/solver';
import type { CircuitDoc, Component } from '@/lib/engine/types';
import { buildValueModel, VALUE_DEFAULTS, type ValueModel } from '@/lib/express/model';
import { normalizeValueInput } from '@/lib/express/params';
import { templateDoc } from '@/lib/data/loadDoc';
import { AGENTS, agentById, type AgentId } from '@/lib/ai/agents';
import { diagnose } from '@/lib/studio/editor';

export interface AgentMetric {
  label: string;
  value: string;
  hint?: string;
}

export interface AgentStep {
  title: string;
  detail: string;
  value: string;
}

export interface AgentTableRow {
  label: string;
  u: string;
  i: string;
  p: string;
}

export interface AgentOutcome {
  agent: AgentId;
  name: string;
  role: string;
  task: string;
  ok: boolean;
  /** phrase de conclusion, en clair */
  summary: string;
  metrics: AgentMetric[];
  steps: AgentStep[];
  warnings: string[];
  table?: { title: string; head: [string, string, string, string]; rows: AgentTableRow[] };
  /** document sur lequel l'agent a travaillé : ouvrable dans le Studio */
  doc: CircuitDoc;
  /** lien direct vers l'atelier avec ce montage */
  studioHref: string;
  engine: { nodes: number; branches: number; ms: number; regime: 'dc' | 'ac' };
}

export interface AgentRunInput {
  task?: string;
  /** montage fourni par l'appelant ; sinon l'agent part de ses valeurs R · C · L */
  doc?: CircuitDoc;
  values?: unknown;
}

export interface AgentCatalogueEntry {
  id: AgentId;
  name: string;
  role: string;
  tagline: string;
  task: string;
  avatar: string;
  color: string;
  template: string;
  conversational: boolean;
  tasks: Array<{ id: string; label: string; description: string }>;
}

/** Catalogue lisible par les deux serveurs (aucun import de page côté client). */
export function agentCatalogue(): AgentCatalogueEntry[] {
  return AGENTS.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    tagline: agent.tagline,
    task: agent.task,
    avatar: agent.avatar,
    color: agent.color,
    template: agent.template,
    conversational: agent.conversational,
    tasks: agent.tasks.map((task) => ({ id: task.id, label: task.label, description: task.description })),
  }));
}

/* ------------------------------------------------------------------ outils */

const valueModelFor = (values: unknown): ValueModel => buildValueModel(normalizeValueInput(values ?? {}), 'runtime');

/**
 * Le document de travail, par ordre de priorité :
 *  1. le montage fourni par l'appelant (`doc`) ;
 *  2. les valeurs R · C · L explicitement demandées (`values`) ;
 *  3. le gabarit propre à l'agent (`template`) ;
 *  4. les valeurs par défaut.
 *
 * L'ordre 2 avant 3 est volontaire : si l'utilisateur saisit 4,7 kΩ / 100 nF,
 * il attend que *ce* montage soit calculé, pas la démonstration du gabarit.
 */
function documentFor(agentId: AgentId, input: AgentRunInput): CircuitDoc {
  if (input.doc && input.doc.components?.length) return input.doc;
  if (input.values !== undefined && input.values !== null) return valueModelFor(input.values).doc;
  const agent = agentById(agentId);
  const template = templateDoc(agent?.template);
  if (template && template.components.length) return template;
  return valueModelFor(undefined).doc;
}

const ohm = (value: number) => formatSI(value, 'Ω');
const volt = (value: number) => formatSI(value, 'V');
const amp = (value: number) => formatSI(value, 'A');
const watt = (value: number) => formatSI(value, 'W');
const hertz = (value: number) => formatSI(value, 'Hz');

const number = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/** valeurs de L et C réellement présentes dans le montage */
function reactiveValues(doc: CircuitDoc): { l: number | null; c: number | null; r: number | null } {
  const of = (kind: Component['kind']) =>
    doc.components
      .filter((part) => part.kind === kind)
      .map((part) => number(part.value))
      .filter((value): value is number => value !== null && value > 0);
  const ls = of('inductor');
  const cs = of('capacitor');
  const rs = of('resistor');
  return { l: ls[0] ?? null, c: cs[0] ?? null, r: rs[0] ?? null };
}

function studioLink(doc: CircuitDoc): string {
  const { r, c, l } = reactiveValues(doc);
  if (r !== null && c !== null && l !== null) {
    return `/studio?values=${encodeURIComponent(`R=${r} C=${c} L=${l}`)}`;
  }
  return '/studio';
}

function stepsOf(equivalent: EquivalentResult): AgentStep[] {
  return equivalent.steps.map((step) => ({ title: step.title, detail: step.detail, value: step.value }));
}

/* ------------------------------------------------------------------ agents */

type Runner = (doc: CircuitDoc, input: AgentRunInput, task: string) => Omit<AgentOutcome, 'agent' | 'name' | 'role' | 'task' | 'doc' | 'studioHref' | 'engine'>;

/** Théo — modèle série (Thévenin) */
const theo: Runner = (doc, _input, task) => {
  const equivalent = equivalentOf(doc);
  const power = equivalent.powerMax;
  return {
    ok: equivalent.ok,
    task,
    summary: equivalent.ok
      ? `Le réseau vu de A–B se réduit à une source ${volt(abs(equivalent.vth))} en série avec ${ohm(abs(equivalent.rth))}${
          power ? ` ; la puissance transférable plafonne à ${watt(power)}.` : '.'
        }`
      : `Modèle série indisponible : ${equivalent.error ?? 'bornes incomplètes'}.`,
    metrics: [
      { label: 'U_th', value: volt(abs(equivalent.vth)), hint: 'tension à vide' },
      { label: 'R_th', value: ohm(abs(equivalent.rth)), hint: 'sources éteintes' },
      { label: 'I_N', value: amp(abs(equivalent.inorton)), hint: 'courant de court-circuit' },
      { label: 'P max', value: power ? watt(power) : '—', hint: 'adaptation' },
    ],
    steps: stepsOf(equivalent),
    warnings: equivalent.warnings,
  };
};

/** Nora — modèle parallèle (Norton) */
const nora: Runner = (doc, _input, task) => {
  const equivalent = equivalentOf(doc);
  return {
    ok: equivalent.ok,
    task,
    summary: equivalent.ok
      ? `Même dipôle, écriture parallèle : ${amp(abs(equivalent.inorton))} en parallèle avec ${ohm(abs(equivalent.rth))}.`
      : `Modèle parallèle indisponible : ${equivalent.error ?? 'bornes incomplètes'}.`,
    metrics: [
      { label: 'I_N', value: amp(abs(equivalent.inorton)), hint: 'courant de court-circuit' },
      { label: 'R_N', value: ohm(abs(equivalent.rth)), hint: '= R_th' },
      { label: 'U_th', value: volt(abs(equivalent.vth)), hint: 'vérification' },
      { label: 'court-circuit mesuré', value: equivalent.iscMeasured ? 'oui' : 'non', hint: 'recoupement' },
    ],
    steps: stepsOf(equivalent),
    warnings: equivalent.warnings,
  };
};

/** Équivalence — vérifie U_th = I_N · R_N dans les deux sens */
const convert: Runner = (doc, _input, task) => {
  const equivalent = equivalentOf(doc);
  const product = abs(equivalent.inorton) * abs(equivalent.rth);
  const gap = abs(equivalent.vth);
  const error = gap > 0 ? Math.abs(product - gap) / gap : 0;
  return {
    ok: equivalent.ok,
    task,
    summary: equivalent.ok
      ? `Les deux écritures concordent à ${(error * 100).toFixed(error < 0.01 ? 2 : 1)} % près : U_th = I_N · R_N.`
      : `Conversion impossible : ${equivalent.error ?? 'bornes incomplètes'}.`,
    metrics: [
      { label: 'U_th', value: volt(gap) },
      { label: 'I_N · R_N', value: volt(product) },
      { label: 'écart', value: `${(error * 100).toFixed(3)} %`, hint: 'tolérance 0,1 %' },
      { label: 'statut', value: equivalent.status },
    ],
    steps: stepsOf(equivalent),
    warnings: error > 0.001 ? [...equivalent.warnings, 'Écart supérieur à la tolérance : vérifiez la sonde de courant.'] : equivalent.warnings,
  };
};

/** Impéda — module, phase, réactances en sinusoïdal */
const impeda: Runner = (doc, input, task) => {
  const acDoc: CircuitDoc = doc.regime === 'ac' ? doc : { ...doc, regime: 'ac' };
  const equivalent = equivalentOf(acDoc);
  const model = valueModelFor(input.values);
  const omega = 2 * Math.PI * (acDoc.frequency || VALUE_DEFAULTS.f);
  const { l, c, r } = reactiveValues(acDoc);
  const xl = l !== null ? omega * l : null;
  const xc = c !== null ? 1 / (omega * c) : null;
  return {
    ok: equivalent.ok,
    task,
    summary: equivalent.ok
      ? `En sinusoïdal à ${hertz(acDoc.frequency || VALUE_DEFAULTS.f)} : Z_th = ${ohm(abs(equivalent.rth))} à ${argDeg(equivalent.rth).toFixed(1)}°.`
      : `Impédance indisponible : ${equivalent.error ?? 'bornes incomplètes'}.`,
    metrics: [
      { label: '|Z_th|', value: ohm(abs(equivalent.rth)) },
      { label: 'φ(Z_th)', value: `${argDeg(equivalent.rth).toFixed(1)}°` },
      { label: 'X_L', value: xl !== null ? ohm(xl) : '—', hint: `ω = ${formatSI(omega, 'rad/s')}` },
      { label: 'X_C', value: xc !== null ? ohm(xc) : '—' },
      { label: 'R', value: r !== null ? ohm(r) : model.input.r ? ohm(model.input.r) : '—' },
    ],
    steps: stepsOf(equivalent),
    warnings: equivalent.warnings,
  };
};

/** Bobines & impédances — résonance et facteur de qualité */
const coils: Runner = (doc, input, task) => {
  const acDoc: CircuitDoc = doc.regime === 'ac' ? doc : { ...doc, regime: 'ac' };
  const { l, c, r } = reactiveValues(acDoc);
  const model = valueModelFor(input.values);
  const L = l ?? model.input.l;
  const C = c ?? model.input.c;
  const R = r ?? model.input.r;
  const f0 = L > 0 && C > 0 ? 1 / (2 * Math.PI * Math.sqrt(L * C)) : null;
  const q = f0 && R > 0 ? (2 * Math.PI * f0 * L) / R : null;
  const bandwidth = f0 && q && q > 0 ? f0 / q : null;
  return {
    ok: f0 !== null,
    task,
    summary: f0 !== null
      ? `Le circuit résonne à ${hertz(f0)}${q ? ` avec Q = ${q.toFixed(2)} et une bande passante de ${hertz(bandwidth ?? 0)}` : ''}.`
      : 'Résonance indéfinie : il faut à la fois une bobine et un condensateur.',
    metrics: [
      { label: 'f₀', value: f0 !== null ? hertz(f0) : '—', hint: '1 / (2π√(LC))' },
      { label: 'Q', value: q !== null ? q.toFixed(2) : '—', hint: 'sélectivité' },
      { label: 'Δf', value: bandwidth !== null ? hertz(bandwidth) : '—', hint: 'f₀ / Q' },
      { label: 'L', value: ohm(2 * Math.PI * (f0 ?? 0) * L), hint: 'X_L à f₀' },
      { label: 'C', value: ohm(C > 0 ? 1 / (2 * Math.PI * (f0 ?? 1) * C) : NaN), hint: 'X_C à f₀' },
    ],
    steps: [
      {
        title: 'Fréquence propre',
        detail: 'On annule la partie imaginaire de l’impédance série : ω₀L = 1/(ω₀C).',
        value: f0 !== null ? hertz(f0) : '—',
      },
      {
        title: 'Facteur de qualité',
        detail: 'Rapport entre la réactance et la résistance à la résonance.',
        value: q !== null ? q.toFixed(2) : '—',
      },
      {
        title: 'Bande passante',
        detail: 'Largeur de la bande à −3 dB autour de f₀.',
        value: bandwidth !== null ? hertz(bandwidth) : '—',
      },
    ],
    warnings: l === null || c === null ? ['Montage incomplet : une bobine et un condensateur sont nécessaires.'] : [],
  };
};

/** Transformation de sources — E série R ⇄ I parallèle R */
const sources: Runner = (doc, _input, task) => {
  const resistors = doc.components.filter((part) => part.kind === 'resistor');
  const emfs = doc.components.filter((part) => part.kind === 'vsource');
  const currents = doc.components.filter((part) => part.kind === 'isource');
  const r = resistors.length ? Math.abs(resistors[0].value) : null;
  const e = emfs.length ? Math.abs(emfs[0].value) : null;
  const i = currents.length ? Math.abs(currents[0].value) : null;
  const converted = e !== null && r ? e / r : i !== null && r ? i * r : null;
  return {
    ok: r !== null && (e !== null || i !== null),
    task,
    summary:
      e !== null && r
        ? `La source de ${volt(e)} en série avec ${ohm(r)} devient une source de ${amp(e / r)} en parallèle avec ${ohm(r)}.`
        : i !== null && r
          ? `La source de ${amp(i)} en parallèle avec ${ohm(r)} devient une source de ${volt(i * r)} en série avec ${ohm(r)}.`
          : 'Transformation impossible : il faut une source et une résistance.',
    metrics: [
      { label: 'sources de tension', value: String(emfs.length) },
      { label: 'sources de courant', value: String(currents.length) },
      { label: 'résistances', value: String(resistors.length) },
      { label: 'grandeur convertie', value: converted !== null ? formatSI(converted, e !== null ? 'A' : 'V') : '—' },
    ],
    steps: [
      {
        title: 'Choisir le dipôle',
        detail: 'Une source et une résistance en série forment un dipôle de Thévenin ; en parallèle, un dipôle de Norton.',
        value: `${emfs.length} E · ${currents.length} I · ${resistors.length} R`,
      },
      {
        title: 'Appliquer la conversion',
        detail: 'On conserve la résistance et on échange E = R · I.',
        value: converted !== null ? formatSI(converted, e !== null ? 'A' : 'V') : '—',
      },
      {
        title: 'Vérifier les bornes',
        detail: 'Le comportement vu de l’extérieur ne change pas : même U à vide, même I en court-circuit.',
        value: r !== null ? ohm(r) : '—',
      },
    ],
    warnings: [],
  };
};

/** Labo T–N — analyse nodale complète, tableau par branche */
const lab: Runner = (doc, _input, task) => {
  const equivalent = equivalentOf(doc);
  const solution: SolveResult = solveDocument(doc, { sourcesOn: true });
  const rows: AgentTableRow[] =
    solution.ok
      ? doc.components
          .filter((part) => part.kind !== 'wire')
          .map((part) => {
            const reading = solution.readings[part.id];
            return {
              label: part.label ?? part.id,
              u: reading ? volt(abs(reading.v)) : '—',
              i: reading ? amp(abs(reading.i)) : '—',
              p: reading ? watt(Math.abs(reading.p.re)) : '—',
            };
          })
      : [];
  return {
    ok: solution.ok,
    task,
    summary: solution.ok
      ? `Analyse nodale convergée : ${solution.size.nodes} nœuds, ${solution.size.branches} branches, masse en ${solution.ground}.`
      : `Analyse impossible : ${solution.error}`,
    metrics: [
      { label: 'nœuds', value: solution.ok ? String(solution.size.nodes) : '—' },
      { label: 'branches', value: solution.ok ? String(solution.size.branches) : '—' },
      { label: 'U_th', value: volt(abs(equivalent.vth)) },
      { label: 'R_th', value: ohm(abs(equivalent.rth)) },
    ],
    steps: stepsOf(equivalent),
    warnings: solution.warnings,
    table: rows.length
      ? { title: 'Grandeurs par branche', head: ['Dipôle', '|U|', '|I|', 'P'], rows }
      : undefined,
  };
};

/** Hub central — passe les autres agents en revue et signale les divergences */
const hub: Runner = (doc, input, task) => {
  const theoOut = theo(doc, input, task);
  const noraOut = nora(doc, input, task);
  const convertOut = convert(doc, input, task);
  const consistent = theoOut.ok && noraOut.ok && convertOut.ok;
  return {
    ok: consistent,
    task,
    summary: consistent
      ? 'Les trois lectures (Thévenin, Norton, conversion) concordent : le dipôle équivalent est fiable.'
      : 'Une des lectures a échoué : le réseau est incomplet ou les bornes A–B ne sont pas définies.',
    metrics: [
      ...theoOut.metrics.slice(0, 2),
      { label: 'concordance', value: consistent ? 'oui' : 'non', hint: '3 agents' },
      { label: 'contrôles', value: '3 agents', hint: 'Théo · Nora · Équivalence' },
    ],
    steps: convertOut.steps,
    warnings: [...theoOut.warnings, ...noraOut.warnings],
  };
};

/** Scanner de dipôles — nature DC/AC de chaque branche */
const dipoles: Runner = (doc, _input, task) => {
  const groups = new Map<string, Component[]>();
  for (const part of doc.components) {
    const key = part.kind;
    groups.set(key, [...(groups.get(key) ?? []), part]);
  }
  const rows: AgentTableRow[] = [...groups.entries()].map(([kind, parts]) => ({
    label: `${kind} ×${parts.length}`,
    u: '—',
    i: '—',
    p: '—',
  }));
  const issues = diagnose(doc);
  return {
    ok: issues.every((issue) => issue.level !== 'error'),
    task,
    summary: `${doc.components.length} dipôles répartis en ${groups.size} familles ; ${issues.length} remarque(s) de contrôleur.`,
    metrics: [
      { label: 'dipôles', value: String(doc.components.length) },
      { label: 'familles', value: String(groups.size) },
      { label: 'nœuds', value: String(new Set(doc.components.flatMap((part) => [part.a, part.b])).size) },
      { label: 'erreurs', value: String(issues.filter((issue) => issue.level === 'error').length) },
    ],
    steps: issues.slice(0, 6).map((issue) => ({
      title: issue.level === 'error' ? 'Erreur' : issue.level === 'warning' ? 'Avertissement' : 'Contrôle',
      detail: issue.hint ?? 'Vérification automatique du montage.',
      value: issue.message,
    })),
    warnings: issues.filter((issue) => issue.level !== 'info').map((issue) => issue.message),
    table: rows.length ? { title: 'Familles de dipôles', head: ['Famille', '|U|', '|I|', 'P'], rows } : undefined,
  };
};

/** Volt / Mentor — vérifie le montage et propose la prochaine étape */
const mentor: Runner = (doc, _input, task) => {
  const issues = diagnose(doc);
  const equivalent = equivalentOf(doc);
  const errors = issues.filter((issue) => issue.level === 'error');
  const next = errors.length
    ? errors[0].hint ?? errors[0].message
    : !doc.terminals.a || !doc.terminals.b
      ? 'Choisissez les bornes A et B pour lire le modèle équivalent.'
      : 'Le montage est complet : ouvrez le Studio pour modifier les valeurs.';
  return {
    ok: errors.length === 0,
    task,
    summary: errors.length === 0 ? 'Montage cohérent : aucune erreur bloquante détectée.' : `${errors.length} erreur(s) à corriger avant de calculer.`,
    metrics: [
      { label: 'erreurs', value: String(errors.length) },
      { label: 'avertissements', value: String(issues.filter((issue) => issue.level === 'warning').length) },
      { label: 'U_th', value: volt(abs(equivalent.vth)) },
      { label: 'R_th', value: ohm(abs(equivalent.rth)) },
    ],
    steps: [
      ...issues.slice(0, 5).map((issue) => ({
        title: issue.level === 'error' ? 'À corriger' : issue.level === 'warning' ? 'À surveiller' : 'Bon point',
        detail: issue.hint ?? 'Contrôle automatique.',
        value: issue.message,
      })),
      { title: 'Prochaine étape', detail: 'Suite logique du montage.', value: next },
    ],
    warnings: issues.filter((issue) => issue.level === 'warning').map((issue) => issue.message),
  };
};

const RUNNERS: Record<AgentId, Runner> = {
  theo,
  nora,
  convert,
  impeda,
  coils,
  sources,
  lab,
  hub,
  dipoles,
  volt: mentor,
  mentor,
};

/**
 * Exécute un agent. Aucun accès réseau, aucune clé : c'est du calcul local
 * déterministe, donc utilisable hors ligne, sur téléphone, et testable.
 */
export function runAgentLocally(agentId: AgentId, input: AgentRunInput = {}): AgentOutcome {
  const started = Date.now();
  const definition = agentById(agentId);
  if (!definition) throw new Error(`Agent inconnu : ${agentId}`);
  const doc = documentFor(agentId, input);
  const task = input.task ?? definition.task;
  const runner = RUNNERS[agentId] ?? mentor;
  const outcome = runner(doc, input, task);
  const solution = solveDocument(doc, { sourcesOn: true });
  return {
    ...outcome,
    agent: agentId,
    name: definition.name,
    role: definition.role,
    task,
    doc,
    studioHref: studioLink(doc),
    engine: {
      nodes: solution.ok ? solution.size.nodes : 0,
      branches: solution.ok ? solution.size.branches : 0,
      ms: Date.now() - started,
      regime: doc.regime === 'ac' ? 'ac' : 'dc',
    },
  };
}

/** Version « résumé » pour un affichage en liste (tuiles de la page agents). */
export function agentTeaser(agentId: AgentId): { ok: boolean; headline: string; metrics: AgentMetric[] } {
  try {
    const outcome = runAgentLocally(agentId);
    return { ok: outcome.ok, headline: outcome.summary, metrics: outcome.metrics.slice(0, 2) };
  } catch (error) {
    return { ok: false, headline: error instanceof Error ? error.message : 'Agent indisponible.', metrics: [] };
  }
}

export const AGENT_IDS: AgentId[] = AGENTS.map((agent) => agent.id);
export type { AgentId };
export { cx };
