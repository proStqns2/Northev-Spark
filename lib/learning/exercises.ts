/**
 * Générateur d’exercices numériques.
 *
 * Chaque exercice est tiré d’un montage réel du studio et calculé avec les
 * mêmes lois. Les valeurs sont pseudo-aléatoires mais **déterministes** : une
 * graine suffit à reproduire exactement l’énoncé, ce qui permet de partager un
 * exercice par son identifiant (`EX-3f2a`).
 */

export type ExerciseKind =
  | 'divider'
  | 'series'
  | 'rc-charge'
  | 'rl-time'
  | 'impedance-rc'
  | 'rms'
  | 'reactive'
  | 'wheatstone'
  | 'norton'
  | 'resonance';

export interface ExerciseStep {
  text: string;
  math: string;
}

export interface Exercise {
  /** identifiant partageable, ex. EX-8K2M */
  id: string;
  kind: ExerciseKind;
  title: string;
  /** énoncé en une phrase */
  prompt: string;
  /** données fournies */
  given: { label: string; value: string }[];
  /** ce qui est demandé */
  ask: string;
  unit: string;
  /** réponse attendue, dans l’unité demandée */
  answer: number;
  /** tolérance relative (0,02 = 2 %) */
  tolerance: number;
  steps: ExerciseStep[];
  /** gabarit du studio à ouvrir pour vérifier */
  template: string;
}

const KINDS: ExerciseKind[] = [
  'divider',
  'series',
  'rc-charge',
  'rl-time',
  'impedance-rc',
  'rms',
  'reactive',
  'wheatstone',
  'norton',
  'resonance',
];

const KIND_LABEL: Record<ExerciseKind, string> = {
  divider: 'Diviseur de tension',
  series: 'Résistances en série',
  'rc-charge': 'Charge d’un condensateur',
  'rl-time': 'Constante de temps RL',
  'impedance-rc': 'Impédance R + C série',
  rms: 'Valeur efficace',
  reactive: 'Puissance réactive',
  wheatstone: 'Pont de Wheatstone',
  norton: 'Thévenin → Norton',
  resonance: 'Résonance LC',
};

/* ------------------------------------------------------------------ */
/* aléa déterministe                                                    */
/* ------------------------------------------------------------------ */

function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function makeRandom(seed: string): () => number {
  let state = hash(seed) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function pick<T>(random: () => number, values: T[]): T {
  return values[Math.floor(random() * values.length) % values.length];
}

function between(random: () => number, min: number, max: number, decimals = 0): number {
  const value = min + random() * (max - min);
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------------ */
/* formatage                                                            */
/* ------------------------------------------------------------------ */

export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e6) return `${(value / 1e6).toFixed(digits)} M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(digits)} k`;
  if (abs > 0 && abs < 0.01) return value.toExponential(2);
  return value.toFixed(digits);
}

function idFrom(seed: string): string {
  const value = hash(seed).toString(36).toUpperCase();
  return `EX-${value.slice(0, 4)}`;
}

/* ------------------------------------------------------------------ */
/* fabriques                                                            */
/* ------------------------------------------------------------------ */

function buildDivider(random: () => number, seed: string): Exercise {
  const e = pick(random, [5, 9, 12, 15, 24]);
  const r1 = pick(random, [1, 2.2, 3.3, 4.7, 6.8, 10]);
  const r2 = pick(random, [1, 1.5, 2.2, 3.3, 4.7, 6.8]);
  const u2 = (e * r2) / (r1 + r2);
  return {
    id: idFrom(seed),
    kind: 'divider',
    title: KIND_LABEL.divider,
    prompt: `Un diviseur de tension alimenté par E = ${e} V comporte R1 = ${r1} kΩ et R2 = ${r2} kΩ. Quelle tension mesure-t-on aux bornes de R2 ?`,
    given: [
      { label: 'E', value: `${e} V` },
      { label: 'R1', value: `${r1} kΩ` },
      { label: 'R2', value: `${r2} kΩ` },
    ],
    ask: 'Tension aux bornes de R2',
    unit: 'V',
    answer: u2,
    tolerance: 0.02,
    steps: [
      { text: 'Le diviseur à vide donne le rapport des résistances.', math: 'U2 = E · R2 / (R1 + R2)' },
      { text: 'Les kΩ se simplifient : le rapport est sans unité.', math: `U2 = ${e} × ${r2} / (${r1} + ${r2})` },
      { text: 'Résultat numérique.', math: `U2 = ${u2.toFixed(3)} V` },
    ],
    template: 'thevenin-serie',
  };
}

function buildSeries(random: () => number, seed: string): Exercise {
  const r1 = between(random, 10, 80);
  const r2 = between(random, 10, 80);
  const r3 = between(random, 10, 80);
  const e = pick(random, [12, 24, 48]);
  const total = r1 + r2 + r3;
  const current = (e / total) * 1000;
  return {
    id: idFrom(seed),
    kind: 'series',
    title: KIND_LABEL.series,
    prompt: `Trois résistances R1 = ${r1} Ω, R2 = ${r2} Ω et R3 = ${r3} Ω sont en série sous E = ${e} V. Quel courant circule dans le circuit ?`,
    given: [
      { label: 'E', value: `${e} V` },
      { label: 'R1', value: `${r1} Ω` },
      { label: 'R2', value: `${r2} Ω` },
      { label: 'R3', value: `${r3} Ω` },
    ],
    ask: 'Courant du circuit',
    unit: 'mA',
    answer: current,
    tolerance: 0.02,
    steps: [
      { text: 'En série, les résistances s’additionnent.', math: `Req = ${r1} + ${r2} + ${r3} = ${total.toFixed(0)} Ω` },
      { text: 'La loi d’Ohm donne le courant.', math: `I = E / Req = ${e} / ${total.toFixed(0)}` },
      { text: 'Conversion en milliampères.', math: `I = ${current.toFixed(2)} mA` },
    ],
    template: 'norton-parallele',
  };
}

function buildRcCharge(random: () => number, seed: string): Exercise {
  const r = pick(random, [1, 2.2, 4.7, 10, 22, 47]);
  const c = pick(random, [1, 2.2, 4.7, 10, 22, 47]);
  const tauMs = r * c;
  return {
    id: idFrom(seed),
    kind: 'rc-charge',
    title: KIND_LABEL['rc-charge'],
    prompt: `Un condensateur C = ${c} µF charge à travers R = ${r} kΩ. Quelle est la constante de temps du montage ?`,
    given: [
      { label: 'R', value: `${r} kΩ` },
      { label: 'C', value: `${c} µF` },
    ],
    ask: 'Constante de temps τ',
    unit: 'ms',
    answer: tauMs,
    tolerance: 0.02,
    steps: [
      { text: 'τ vaut le produit R·C.', math: 'τ = R · C' },
      { text: 'kΩ × µF = ms : les préfixes se compensent.', math: `τ = ${r} × ${c} = ${tauMs.toFixed(2)} ms` },
      { text: 'Au bout de 5τ, la charge est considérée terminée.', math: `5τ = ${(5 * tauMs).toFixed(1)} ms` },
    ],
    template: 'labo-calcul-tn',
  };
}

function buildRl(random: () => number, seed: string): Exercise {
  const l = pick(random, [10, 22, 47, 100, 220]);
  const r = pick(random, [10, 22, 47, 100, 220]);
  const tauMs = l / r;
  return {
    id: idFrom(seed),
    kind: 'rl-time',
    title: KIND_LABEL['rl-time'],
    prompt: `Une bobine L = ${l} mH est en série avec R = ${r} Ω. Quelle est la constante de temps électrique du circuit ?`,
    given: [
      { label: 'L', value: `${l} mH` },
      { label: 'R', value: `${r} Ω` },
    ],
    ask: 'Constante de temps τ',
    unit: 'ms',
    answer: tauMs,
    tolerance: 0.02,
    steps: [
      { text: 'Pour une inductance, τ = L / R.', math: 'τ = L / R' },
      { text: 'mH divisé par Ω donne des ms.', math: `τ = ${l} / ${r} = ${tauMs.toFixed(3)} ms` },
      { text: 'Le courant atteint 63 % de sa valeur finale à τ.', math: `I(τ) = 0,632 · If` },
    ],
    template: 'bobines-impedances',
  };
}

function buildImpedance(random: () => number, seed: string): Exercise {
  const r = pick(random, [100, 220, 470, 1000, 2200]);
  const c = pick(random, [10, 22, 47, 100, 220]);
  const f = pick(random, [50, 100, 500, 1000, 5000]);
  const reactance = 1 / (2 * Math.PI * f * c * 1e-9);
  const z = Math.hypot(r, reactance);
  return {
    id: idFrom(seed),
    kind: 'impedance-rc',
    title: KIND_LABEL['impedance-rc'],
    prompt: `Un circuit série comporte R = ${r} Ω et C = ${c} nF à f = ${f} Hz. Quel est le module de l’impédance totale ?`,
    given: [
      { label: 'R', value: `${r} Ω` },
      { label: 'C', value: `${c} nF` },
      { label: 'f', value: `${f} Hz` },
    ],
    ask: 'Module |Z|',
    unit: 'Ω',
    answer: z,
    tolerance: 0.03,
    steps: [
      { text: 'Le condensateur oppose une réactance inverse à la fréquence.', math: `Xc = 1 / (2π · f · C) = ${reactance.toFixed(1)} Ω` },
      { text: 'Les deux tensions sont en quadrature : on compose par Pythagore.', math: '|Z| = √(R² + Xc²)' },
      { text: 'Résultat numérique.', math: `|Z| = ${z.toFixed(1)} Ω` },
    ],
    template: 'bobines-impedances',
  };
}

function buildRms(random: () => number, seed: string): Exercise {
  const peak = pick(random, [12, 24, 48, 120, 230, 325]);
  const rms = peak / Math.SQRT2;
  return {
    id: idFrom(seed),
    kind: 'rms',
    title: KIND_LABEL.rms,
    prompt: `Une tension sinusoïdale pure a une amplitude de crête Umax = ${peak} V. Quelle est sa valeur efficace ?`,
    given: [{ label: 'Umax', value: `${peak} V` }],
    ask: 'Valeur efficace',
    unit: 'V',
    answer: rms,
    tolerance: 0.02,
    steps: [
      { text: 'Pour un sinus, l’efficace vaut la crête divisée par √2.', math: 'U = Umax / √2' },
      { text: '√2 ≈ 1,414.', math: `U = ${peak} / 1,414` },
      { text: 'Résultat numérique.', math: `U = ${rms.toFixed(2)} V` },
    ],
    template: 'equivalence-tn',
  };
}

function buildReactive(random: () => number, seed: string): Exercise {
  const p = pick(random, [1000, 2000, 5000, 8000, 12000]);
  const cos = pick(random, [0.6, 0.7, 0.75, 0.8, 0.85]);
  const phi = Math.acos(cos);
  const q = p * Math.tan(phi);
  return {
    id: idFrom(seed),
    kind: 'reactive',
    title: KIND_LABEL.reactive,
    prompt: `Une installation consomme P = ${(p / 1000).toFixed(1)} kW avec cos φ = ${cos}. Quelle puissance réactive absorbe-t-elle ?`,
    given: [
      { label: 'P', value: `${(p / 1000).toFixed(1)} kW` },
      { label: 'cos φ', value: `${cos}` },
    ],
    ask: 'Puissance réactive Q',
    unit: 'var',
    answer: q,
    tolerance: 0.03,
    steps: [
      { text: 'Le déphasage se déduit du cosinus.', math: `φ = arccos(${cos}) = ${((phi * 180) / Math.PI).toFixed(1)}°` },
      { text: 'La réactive est la part perpendiculaire de la puissance.', math: 'Q = P · tan φ' },
      { text: 'Résultat numérique.', math: `Q = ${q.toFixed(0)} var` },
    ],
    template: 'millman',
  };
}

function buildWheatstone(random: () => number, seed: string): Exercise {
  const r1 = pick(random, [100, 220, 470, 1000]);
  const r2 = pick(random, [220, 470, 1000, 2200]);
  const r3 = pick(random, [470, 1000, 2200, 4700]);
  const rx = (r2 * r3) / r1;
  return {
    id: idFrom(seed),
    kind: 'wheatstone',
    title: KIND_LABEL.wheatstone,
    prompt: `Un pont de Wheatstone est à l’équilibre avec R1 = ${r1} Ω, R2 = ${r2} Ω et R3 = ${r3} Ω. Quelle est la résistance inconnue Rx ?`,
    given: [
      { label: 'R1', value: `${r1} Ω` },
      { label: 'R2', value: `${r2} Ω` },
      { label: 'R3', value: `${r3} Ω` },
    ],
    ask: 'Résistance inconnue Rx',
    unit: 'Ω',
    answer: rx,
    tolerance: 0.02,
    steps: [
      { text: 'À l’équilibre, les produits croisés sont égaux.', math: 'R1 · Rx = R2 · R3' },
      { text: 'On isole l’inconnue.', math: `Rx = ${r2} × ${r3} / ${r1}` },
      { text: 'Résultat numérique.', math: `Rx = ${rx.toFixed(0)} Ω` },
    ],
    template: 'pont-wheatstone',
  };
}

function buildNorton(random: () => number, seed: string): Exercise {
  const eth = between(random, 4, 30, 1);
  const rth = pick(random, [10, 22, 47, 100, 220]);
  const norton = (eth / rth) * 1000;
  return {
    id: idFrom(seed),
    kind: 'norton',
    title: KIND_LABEL.norton,
    prompt: `Un générateur équivalent de Thévenin vaut Eth = ${eth} V et Rth = ${rth} Ω. Quel est le courant du générateur de Norton équivalent ?`,
    given: [
      { label: 'Eth', value: `${eth} V` },
      { label: 'Rth', value: `${rth} Ω` },
    ],
    ask: 'Courant de court-circuit In',
    unit: 'mA',
    answer: norton,
    tolerance: 0.02,
    steps: [
      { text: 'Le courant de Norton est le courant de court-circuit.', math: 'In = Eth / Rth' },
      { text: 'La résistance reste identique dans les deux modèles.', math: 'Rn = Rth' },
      { text: 'Résultat numérique.', math: `In = ${norton.toFixed(1)} mA` },
    ],
    template: 'equivalence-tn',
  };
}

function buildResonance(random: () => number, seed: string): Exercise {
  const l = pick(random, [10, 22, 47, 100, 220]);
  const c = pick(random, [10, 22, 47, 100, 220]);
  const f0 = 1 / (2 * Math.PI * Math.sqrt(l * 1e-3 * c * 1e-9));
  return {
    id: idFrom(seed),
    kind: 'resonance',
    title: KIND_LABEL.resonance,
    prompt: `Un circuit LC série utilise L = ${l} mH et C = ${c} nF. À quelle fréquence entre-t-il en résonance ?`,
    given: [
      { label: 'L', value: `${l} mH` },
      { label: 'C', value: `${c} nF` },
    ],
    ask: 'Fréquence de résonance f₀',
    unit: 'Hz',
    answer: f0,
    tolerance: 0.03,
    steps: [
      { text: 'À la résonance, les réactances s’annulent.', math: 'Lω = 1/(Cω) donc ω₀ = 1/√(LC)' },
      { text: 'On divise par 2π pour obtenir des hertz.', math: 'f₀ = 1 / (2π√(LC))' },
      { text: 'Résultat numérique.', math: `f₀ = ${f0.toFixed(0)} Hz` },
    ],
    template: 'bobines-impedances',
  };
}

const BUILDERS: Record<ExerciseKind, (random: () => number, seed: string) => Exercise> = {
  divider: buildDivider,
  series: buildSeries,
  'rc-charge': buildRcCharge,
  'rl-time': buildRl,
  'impedance-rc': buildImpedance,
  rms: buildRms,
  reactive: buildReactive,
  wheatstone: buildWheatstone,
  norton: buildNorton,
  resonance: buildResonance,
};

/** Construit un exercice à partir d’une graine ; `kind` optionnel. */
export function makeExercise(seed = 'demo', kind?: ExerciseKind): Exercise {
  const random = makeRandom(seed);
  const chosen = kind ?? pick(random, KINDS);
  return BUILDERS[chosen](random, seed);
}

/** Exercice à partir d’un identifiant partageable (`EX-XXXX`). */
export function exerciseFromId(id: string): Exercise {
  const cleaned = id.trim().toUpperCase().replace(/^EX-/, '');
  return makeExercise(`share:${cleaned}`);
}

export interface CheckResult {
  correct: boolean;
  deltaPercent: number;
  expected: string;
}

/** Vérifie une réponse saisie librement (virgule ou point, unités en trop acceptées). */
export function checkAnswer(exercise: Exercise, raw: string): CheckResult {
  const normalized = raw
    .replace(/\s/g, '')
    .replace(',', '.')
    .replace(/[^0-9eE+\-.]/g, '');
  const value = Number(normalized);
  if (!Number.isFinite(value) || normalized === '') {
    return { correct: false, deltaPercent: 100, expected: `${exercise.answer.toFixed(2)} ${exercise.unit}` };
  }
  const delta = Math.abs(value - exercise.answer) / Math.max(Math.abs(exercise.answer), 1e-9);
  return {
    correct: delta <= exercise.tolerance,
    deltaPercent: delta * 100,
    expected: `${exercise.answer.toFixed(2)} ${exercise.unit}`,
  };
}

/** Série d’exercices consécutifs (une graine, N tirages sans doublon de type). */
export function exerciseSeries(seed: string, count = 5): Exercise[] {
  const list: Exercise[] = [];
  let index = 0;
  while (list.length < count) {
    const exercise = makeExercise(`${seed}:${index}`);
    if (!list.some((item) => item.kind === exercise.kind)) list.push(exercise);
    index += 1;
    if (index > count * 6) break;
  }
  return list;
}

export const EXERCISE_KINDS = KINDS;
export const EXERCISE_LABELS = KIND_LABEL;
