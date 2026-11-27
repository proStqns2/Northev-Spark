import { CircuitDoc, Component, ComponentKind } from '@/lib/engine/types';
import { equivalentOf, type EquivalentResult } from '@/lib/engine/equivalent';
import { omegaOf, solveDocument, type Reading, type SolveResult } from '@/lib/engine/solver';
import { abs } from '@/lib/engine/complex';
import { sanitizeDoc } from '@/lib/studio/doc';

/**
 * Modèle partagé de la « barre de valeurs » R, C, L (… E, I₀).
 *
 * La même fonction sert :
 *  - au studio Next (`POST /api/values/analyze`) ;
 *  - au service Express (`POST /api/v1/analyze`) qui est le *leader* public
 *    du montage (voir `server/express.ts`).
 *
 * Elle construit un montage canonique — source E, résistance interne R,
 * condensateur C et bobine L en série entre les bornes A et B — puis laisse
 * le solveur MNA du site calculer l'équivalent de Thévenin / Norton.
 * Aucun résultat n'est inventé : tout sort du moteur du dépôt.
 */

export type ValueInput = {
  /** résistance série (Ω) — défaut 1 kΩ */
  r?: number;
  /** capacité (F) — défaut 100 nF */
  c?: number;
  /** inductance (H) — défaut 10 mH */
  l?: number;
  /** f.é.m. de la source (V) — défaut 12 V */
  e?: number;
  /** courant de la source, variante Norton (A) — ignoré si `e` est fourni */
  i?: number;
  /** fréquence d'étude (Hz) — défaut 50 Hz */
  f?: number;
  /** régime : continu ou sinusoïdal établi */
  regime?: 'dc' | 'ac';
  /** force la présence du bloc alternatif sur la source (utile en mode continu) */
  ac?: boolean;
  /** nom libre du montage */
  name?: string;
  /** valeurs proposées en une ligne « R=4,7k C=100n L=10m » */
  values?: string;
};

export interface ValueMetrics {
  /** fréquence angulaire d'étude (rad/s) */
  omega: number;
  /** réactance capacitive |Xc| = 1/(ωC), Ω */
  xc: number | null;
  /** réactance inductive Xl = ωL, Ω */
  xl: number | null;
  /** module de l'impédance série Z = R + j(ωL − 1/ωC), Ω */
  zSeries: number | null;
  /** phase de Z en degrés */
  zPhaseDeg: number | null;
  /** module du courant série U/|Z|, A */
  iSeries: number | null;
  /** pulsation de résonance 1/√(LC), rad/s */
  omega0: number | null;
  /** fréquence de résonance, Hz */
  f0: number | null;
  /** facteur de qualité Q = (1/R)·√(L/C) */
  quality: number | null;
  /** constante de temps RC (s) */
  tauRC: number | null;
  /** constante de temps L/R (s) */
  tauRL: number | null;
  /** fréquence de coupure du filtre RC, Hz */
  fcRC: number | null;
  /** fréquence de coupure du filtre RL, Hz */
  fcRL: number | null;
  /** puissance maximale transférable |U_th|²/(4·Re Z_th), W */
  powerMax: number | null;
  /** vrai si la Charge R_L = |Z_th| donne bien le maximum */
  matched: boolean;
}

export interface BranchReading {
  id: string;
  label: string;
  kind: ComponentKind;
  /** tension efficace/crête mesurée aux bornes, V */
  voltage: number;
  /** courant, A */
  current: number;
  /** puissance active, W */
  power: number;
}

export interface ValueModel {
  ok: boolean;
  status: EquivalentResult['status'];
  error?: string;
  input: {
    r: number;
    c: number;
    l: number;
    e: number;
    i: number;
    f: number;
    regime: 'dc' | 'ac';
    name: string;
  };
  doc: CircuitDoc;
  equivalent: EquivalentResult;
  metrics: ValueMetrics;
  branches: BranchReading[];
  warnings: string[];
  /** identifiant du service qui a répondu (express | next) */
  source?: string;
  /** temps de calcul serveur, ms */
  durationMs?: number;
}

export const VALUE_DEFAULTS = {
  r: 1_000,
  c: 100e-9,
  l: 10e-3,
  e: 12,
  i: 10e-3,
  /** 1 kHz : à cette fréquence R, L et C ont tous trois un effet lisible */
  f: 1_000,
} as const;

/** Bornes acceptées pour chaque grandeur (évite les valeurs absurdes ou nulles). */
export const VALUE_RANGES: Record<'r' | 'c' | 'l' | 'e' | 'i', { min: number; max: number; unit: string; letter: string }> = {
  r: { min: 1e-3, max: 1e9, unit: 'Ω', letter: 'R' },
  c: { min: 1e-15, max: 1, unit: 'F', letter: 'C' },
  l: { min: 1e-12, max: 1e3, unit: 'H', letter: 'L' },
  e: { min: -1e4, max: 1e4, unit: 'V', letter: 'E' },
  i: { min: -1e3, max: 1e3, unit: 'A', letter: 'I₀' },
};

const finite = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const round = (value: number, digits = 10): number => {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const safeDiv = (a: number, b: number): number | null =>
  Number.isFinite(a) && Number.isFinite(b) && b !== 0 ? a / b : null;

const sqrt = (value: number): number | null => (value > 0 ? Math.sqrt(value) : null);

/**
 * Construit le montage canonique de la barre de valeurs : **diviseur R / (L ∥ C)**.
 *
 * Grille (cellules de 24 px) :
 *
 *    (0,4) ──── [R] ──── (8,4) ─────(14,4)     nœud A = (8,4)
 *      │                    │            │
 *     [E]                  [L]          [C]     L et C en parallèle
 *      │                    │            │
 *    (0,10)──────────────(8,10)───────(14,10)  rail de masse = borne B
 *
 * Boucle fermée : la source débite réellement à travers R puis L ∥ C, donc le
 * tableau U/I/P par branche est parlant. Aux bornes A-B :
 *
 *   U_th = E · Z_LC / (R + Z_LC)        Z_th = R ∥ Z_LC
 *   Z_LC = (jωL) / (1 − ω²LC)           résonance à ω₀ = 1/√(LC)
 *
 * En sinusoïdal R, L et C agissent tous les trois ; en continu la bobine se
 * comporte comme un fil (la sortie tombe à 0 V — c'est la leçon du mode DC).
 */
export function valueDoc(input: ValueInput): CircuitDoc {
  const r = finite(input.r) ?? VALUE_DEFAULTS.r;
  const c = finite(input.c) ?? VALUE_DEFAULTS.c;
  const l = finite(input.l) ?? VALUE_DEFAULTS.l;
  const f = Math.max(0, finite(input.f) ?? VALUE_DEFAULTS.f);
  // Par défaut : sinusoïdal, seul régime où les trois grandeurs agissent.
  const regime: 'dc' | 'ac' = input.regime === 'dc' ? 'dc' : 'ac';
  const useNorton = !finite(input.e) && finite(input.i) !== null;
  const amplitude = useNorton ? (finite(input.i) as number) : (finite(input.e) ?? VALUE_DEFAULTS.e);

  // En sinusoïdal la phaseur vient de `ac`, sinon de `value` : on les aligne
  // pour que le studio réaffiche la même valeur dans les deux cas.
  const hasAcBlock = regime === 'ac' || Boolean(input.ac);

  const source: Component = useNorton
    ? {
        id: 'I1',
        kind: 'isource',
        a: '0,10',
        b: '0,4',
        value: Math.abs(amplitude) || VALUE_DEFAULTS.i,
        label: 'I₀',
        ...(regime === 'ac' ? { ac: { amplitude: Math.abs(amplitude), frequency: f, phaseDeg: 0 } } : {}),
      }
    : {
        id: 'E1',
        kind: 'vsource',
        a: '0,4',
        b: '0,10',
        value: amplitude,
        label: 'E',
        ...(hasAcBlock ? { ac: { amplitude: Math.abs(amplitude), frequency: f, phaseDeg: 0 } } : {}),
      };

  const components: Component[] = [
    source,
    { id: 'R1', kind: 'resistor', a: '0,4', b: '8,4', value: r, label: 'R' },
    { id: 'L1', kind: 'inductor', a: '8,4', b: '8,10', value: l, label: 'L' },
    { id: 'C1', kind: 'capacitor', a: '14,4', b: '14,10', value: c, label: 'C' },
    { id: 'W1', kind: 'wire', a: '8,4', b: '14,4', value: 0, label: 'haut' },
    { id: 'W2', kind: 'wire', a: '0,10', b: '8,10', value: 0, label: 'retour' },
    { id: 'W3', kind: 'wire', a: '8,10', b: '14,10', value: 0, label: 'retour' },
  ];

  return sanitizeDoc({
    name: input.name?.slice(0, 120) || 'Montage R · C · L — barre de valeurs',
    notes: 'Diviseur R / (L ∥ C) de la barre de valeurs — la source débite réellement, bornes A-B en sortie.',
    components,
    ground: '0,10',
    terminals: { a: '8,4', b: '0,10' },
    regime,
    frequency: f,
  });
}

/** Lit une branche du solveur (U, I, P) en modules exploitables en JSON. */
function branchOf(readings: Record<string, Reading>, component: Component): BranchReading | null {
  const reading = readings[component.id];
  if (!reading) return null;
  // une branche idéale (fil) n'a pas de courant propre exploitable
  if (![reading.v.re, reading.v.im, reading.i.re, reading.i.im].every(Number.isFinite)) return null;
  return {
    id: component.id,
    label: component.label ?? component.id,
    kind: component.kind,
    voltage: round(abs(reading.v), 12),
    current: round(abs(reading.i), 12),
    power: round(Number.isFinite(reading.p.re) ? reading.p.re : 0, 12),
  };
}

/** Indicateurs électriques dérivés des valeurs R, C, L, E/I, f. */
export function valueMetrics(input: ValueInput, doc: CircuitDoc, equivalent: EquivalentResult): ValueMetrics {
  const r = finite(input.r) ?? VALUE_DEFAULTS.r;
  const c = finite(input.c) ?? VALUE_DEFAULTS.c;
  const l = finite(input.l) ?? VALUE_DEFAULTS.l;
  const f = Math.max(0, finite(input.f) ?? VALUE_DEFAULTS.f);
  const omega = doc.regime === 'ac' ? omegaOf(doc) : 2 * Math.PI * f;

  const xc = omega > 0 && c > 0 ? safeDiv(1, omega * c) : null;
  const xl = omega > 0 && l > 0 ? omega * l : null;

  const zSeries =
    xc !== null && xl !== null ? Math.hypot(r, xl - xc) : xc !== null ? Math.hypot(r, xc) : xl !== null ? Math.hypot(r, xl) : null;

  const zPhaseDeg = zSeries && zSeries > 0 ? (Math.atan2((xl ?? 0) - (xc ?? 0), r) * 180) / Math.PI : null;

  const amplitude = Math.abs(finite(input.e) ?? (finite(input.i) ?? VALUE_DEFAULTS.e));
  const iSeries = zSeries && zSeries > 0 ? safeDiv(amplitude, zSeries) : null;

  const omega0 = c > 0 && l > 0 ? safeDiv(1, Math.sqrt(l * c)) : null;
  const f0 = omega0 ? safeDiv(omega0, 2 * Math.PI) : null;
  const quality = r > 0 && c > 0 && l > 0 ? safeDiv(Math.sqrt(l / c), r) : null;

  const tauRC = r > 0 && c > 0 ? r * c : null;
  const tauRL = r > 0 && l > 0 ? safeDiv(l, r) : null;
  const fcRC = tauRC ? safeDiv(1, 2 * Math.PI * tauRC) : null;
  const fcRL = tauRL ? safeDiv(1, 2 * Math.PI * tauRL) : null;

  const zth = equivalent.ok ? abs(equivalent.rth) : Number.NaN;
  const vth = equivalent.ok ? abs(equivalent.vth) : Number.NaN;
  const powerMax = Number.isFinite(equivalent.powerMax)
    ? (equivalent.powerMax as number)
    : Number.isFinite(vth) && Number.isFinite(zth) && zth > 0
      ? (vth * vth) / (4 * zth)
      : null;

  return {
    omega: round(omega, 12),
    xc: xc === null ? null : round(xc, 12),
    xl: xl === null ? null : round(xl, 12),
    zSeries: zSeries === null ? null : round(zSeries, 12),
    zPhaseDeg: zPhaseDeg === null ? null : round(zPhaseDeg, 6),
    iSeries: iSeries === null ? null : round(iSeries, 12),
    omega0: omega0 === null ? null : round(omega0, 12),
    f0: f0 === null ? null : round(f0, 12),
    quality: quality === null ? null : round(quality, 9),
    tauRC: tauRC === null ? null : round(tauRC, 15),
    tauRL: tauRL === null ? null : round(tauRL, 15),
    fcRC: fcRC === null ? null : round(fcRC, 9),
    fcRL: fcRL === null ? null : round(fcRL, 9),
    powerMax,
    matched: Boolean(equivalent.ok && Number.isFinite(zth) && zth > 0 && Number.isFinite(powerMax)),
  };
}

/** Résout complètement la barre de valeurs (modèle prêt à sérialiser). */
export function buildValueModel(input: ValueInput, source = 'next'): ValueModel {
  const started = Date.now();
  const doc = valueDoc(input);
  const equivalent = equivalentOf(doc);
  const solution: SolveResult = solveDocument(doc, { sourcesOn: true });

  const branches: BranchReading[] =
    solution.ok
      ? doc.components
          .map((component) => branchOf(solution.readings, component))
          .filter((x): x is BranchReading => x !== null)
      : [];

  const r = finite(input.r) ?? VALUE_DEFAULTS.r;
  const c = finite(input.c) ?? VALUE_DEFAULTS.c;
  const l = finite(input.l) ?? VALUE_DEFAULTS.l;
  const e = finite(input.e);
  const i = finite(input.i);
  const useNorton = e === null && i !== null;

  return {
    ok: equivalent.ok,
    status: equivalent.status,
    error: equivalent.error,
    input: {
      r,
      c,
      l,
      e: useNorton ? 0 : (e ?? VALUE_DEFAULTS.e),
      i: useNorton ? (i as number) : 0,
      f: Math.max(0, finite(input.f) ?? VALUE_DEFAULTS.f),
      regime: doc.regime,
      name: doc.name,
    },
    doc,
    equivalent,
    metrics: valueMetrics(input, doc, equivalent),
    branches,
    warnings: equivalent.warnings,
    source,
    durationMs: Date.now() - started,
  };
}

export { solveDocument };
export type { Reading };
