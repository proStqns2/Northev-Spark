export type ComponentKind =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'vsource'
  | 'isource'
  | 'wire'
  | 'switch'
  | 'ammeter'
  | 'voltmeter'
  | 'lamp'
  | 'potentiometer'
  | 'vcvs'
  | 'vccs';

export type Regime = 'dc' | 'ac';

export interface AcSpec {
  /** amplitude crête (V ou A) */
  amplitude: number;
  /** fréquence en Hz */
  frequency: number;
  /** phase en degrés */
  phaseDeg: number;
}

export interface Component {
  id: string;
  kind: ComponentKind;
  /** identifiant du nœud de la borne A (grille "x,y") */
  a: string;
  /** identifiant du nœud de la borne B (grille "x,y") */
  b: string;
  /** R (Ω), C (F), L (H), E (V), I (A), gain (sans unité) */
  value: number;
  label?: string;
  /** source alternative (sinusoïdale) */
  ac?: AcSpec;
  /** interrupteur fermé */
  closed?: boolean;
  /** gain des sources liées */
  gain?: number;
  /** nœuds de commande des sources liées */
  ctrl?: { a: string; b: string };
}

export interface Terminals {
  a: string | null;
  b: string | null;
}

export interface CircuitDoc {
  id?: string;
  name: string;
  notes?: string;
  components: Component[];
  /** nœud de référence (masse) */
  ground: string;
  terminals: Terminals;
  regime: Regime;
  /** fréquence d'étude en Hz pour le régime AC */
  frequency: number;
  createdAt?: string;
  updatedAt?: string;
}

export const COMPONENT_META: Record<
  ComponentKind,
  {
    label: string;
    symbol: string;
    unit: string;
    defaultValue: number;
    color: string;
    group: 'sources' | 'passifs' | 'connexions' | 'mesure' | 'liees';
    hint: string;
  }
> = {
  vsource: {
    label: 'Source de tension',
    symbol: 'E',
    unit: 'V',
    defaultValue: 12,
    color: '#ffc266',
    group: 'sources',
    hint: 'F.é.m. idéale — devient un fil quand on éteint les sources.',
  },
  isource: {
    label: 'Source de courant',
    symbol: 'I',
    unit: 'A',
    defaultValue: 2,
    color: '#4f9dff',
    group: 'sources',
    hint: 'Courant imposé — devient un circuit ouvert quand on l’éteint.',
  },
  resistor: {
    label: 'Résistance',
    symbol: 'R',
    unit: 'Ω',
    defaultValue: 1000,
    color: '#38e1e6',
    group: 'passifs',
    hint: 'Loi d’Ohm : u = R·i.',
  },
  capacitor: {
    label: 'Condensateur',
    symbol: 'C',
    unit: 'F',
    defaultValue: 1e-6,
    color: '#46e6a0',
    group: 'passifs',
    hint: 'Impédance complexe Z = 1/(jωC).',
  },
  inductor: {
    label: 'Bobine',
    symbol: 'L',
    unit: 'H',
    defaultValue: 10e-3,
    color: '#a479ff',
    group: 'passifs',
    hint: 'Impédance complexe Z = jωL, fil en continu.',
  },
  potentiometer: {
    label: 'Potentiomètre',
    symbol: 'P',
    unit: 'Ω',
    defaultValue: 10000,
    color: '#ff79c6',
    group: 'passifs',
    hint: 'Résistance réglable (rhéostat).',
  },
  lamp: {
    label: 'Lampe',
    symbol: 'Lp',
    unit: 'Ω',
    defaultValue: 220,
    color: '#ffd166',
    group: 'passifs',
    hint: 'Charge résistive avec puissance dissipée affichée.',
  },
  wire: {
    label: 'Fil',
    symbol: '—',
    unit: '',
    defaultValue: 0,
    color: '#9fb6d6',
    group: 'connexions',
    hint: 'Relie deux points équipotentiels.',
  },
  switch: {
    label: 'Interrupteur',
    symbol: 'K',
    unit: '',
    defaultValue: 0,
    color: '#cbd5e1',
    group: 'connexions',
    hint: 'Ouvert = circuit coupé, fermé = fil.',
  },
  ammeter: {
    label: 'Ampèremètre',
    symbol: 'A',
    unit: 'A',
    defaultValue: 0,
    color: '#8fb6ff',
    group: 'mesure',
    hint: 'Résistance nulle : mesure le courant de branche.',
  },
  voltmeter: {
    label: 'Voltmètre',
    symbol: 'V',
    unit: 'V',
    defaultValue: 0,
    color: '#8fb6ff',
    group: 'mesure',
    hint: 'Résistance infinie : mesure la tension entre ses bornes.',
  },
  vcvs: {
    label: 'Source de tension liée',
    symbol: 'μ',
    unit: 'V/V',
    defaultValue: 2,
    color: '#ff9b6b',
    group: 'liees',
    hint: 'E = μ·(V₊ − V₋) — VCVS.',
  },
  vccs: {
    label: 'Source de courant liée',
    symbol: 'g',
    unit: 'A/V',
    defaultValue: 0.01,
    color: '#ff9b6b',
    group: 'liees',
    hint: 'I = g·(V₊ − V₋) — VCCS.',
  },
};

export const DEFAULT_COMPONENT_VALUE = (kind: ComponentKind) =>
  COMPONENT_META[kind].defaultValue;

export const BLANK_DOC: CircuitDoc = {
  name: 'Nouveau montage',
  components: [],
  ground: '',
  terminals: { a: null, b: null },
  regime: 'dc',
  frequency: 50,
};
