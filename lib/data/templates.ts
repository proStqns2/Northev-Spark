import { CircuitDoc, Component } from '@/lib/engine/types';

export interface Template {
  slug: string;
  title: string;
  subtitle: string;
  family:
    | 'thevenin-norton'
    | 'dipoles'
    | 'sources'
    | 'impedances'
    | 'ponts'
    | 'labo';
  accent: 'cyan' | 'violet' | 'amber' | 'green' | 'coral' | 'blue' | 'pink';
  shape: 'circle' | 'hex' | 'shield' | 'badge';
  difficulty: 'Découverte' | 'Intermédiaire' | 'Avancé';
  regime: 'dc' | 'ac';
  summary: string;
  teaching: string[];
  /** doc sans identifiants aléatoires pour un chargement déterministe */
  build: () => CircuitDoc;
}

const C = (
  id: string,
  kind: Component['kind'],
  a: string,
  b: string,
  value: number,
  extra: Partial<Component> = {},
): Component => ({ id, kind, a, b, value, ...extra });

const base = (name: string, regime: 'dc' | 'ac', frequency = 50): Omit<CircuitDoc, 'components' | 'ground' | 'terminals'> => ({
  name,
  regime,
  frequency,
});

/* ------------------------------------------------------------------ */
/*  Montages                                                           */
/* ------------------------------------------------------------------ */

const divideurThevenin = (): CircuitDoc => ({
  ...base('Diviseur de tension — Thévenin série', 'dc'),
  ground: '0,8',
  terminals: { a: '8,0', b: '0,8' },
  components: [
    C('E1', 'vsource', '0,0', '0,8', 12, { label: 'E = 12 V' }),
    C('R1', 'resistor', '0,0', '8,0', 1000, { label: 'R₁ = 1 kΩ' }),
    C('R2', 'resistor', '8,0', '8,8', 1000, { label: 'R₂ = 1 kΩ' }),
    C('W1', 'wire', '0,8', '8,8', 0),
  ],
});

const pontThevenin = (): CircuitDoc => ({
  ...base('Pont de Wheatstone — extraction de Thévenin', 'dc'),
  ground: '0,10',
  terminals: { a: '6,0', b: '4,0' },
  components: [
    C('E1', 'vsource', '0,0', '0,10', 10, { label: 'E = 10 V' }),
    C('R1', 'resistor', '0,0', '6,0', 1000, { label: 'R₁ = 1 kΩ' }),
    C('R2', 'resistor', '6,0', '6,10', 2200, { label: 'R₂ = 2,2 kΩ' }),
    C('R3', 'resistor', '0,0', '4,0', 1500, { label: 'R₃ = 1,5 kΩ' }),
    C('R4', 'resistor', '4,0', '4,10', 3000, { label: 'R₄ = 3 kΩ' }),
    C('W1', 'wire', '0,10', '6,10', 0),
    C('W2', 'wire', '0,10', '4,10', 0),
  ],
});

const nortonParallele = (): CircuitDoc => ({
  ...base('Source de courant — Norton parallèle', 'dc'),
  ground: '0,8',
  terminals: { a: '8,0', b: '0,8' },
  components: [
    C('I1', 'isource', '0,8', '0,0', 0.005, { label: 'I = 5 mA' }),
    C('R1', 'resistor', '0,0', '8,0', 2200, { label: 'R₁ = 2,2 kΩ' }),
    C('R2', 'resistor', '8,0', '8,8', 1000, { label: 'R₂ = 1 kΩ' }),
    C('W1', 'wire', '0,8', '8,8', 0),
  ],
});

const equivalenceTN = (): CircuitDoc => ({
  ...base('Équivalence T ⇄ N — même dipôle, deux modèles', 'dc'),
  ground: '0,8',
  terminals: { a: '7,2', b: '0,8' },
  components: [
    C('E1', 'vsource', '0,2', '0,8', 9, { label: 'E = 9 V' }),
    C('R1', 'resistor', '0,2', '4,2', 680, { label: 'R₁ = 680 Ω' }),
    C('R2', 'resistor', '4,2', '4,8', 330, { label: 'R₂ = 330 Ω' }),
    C('R3', 'resistor', '4,2', '7,2', 470, { label: 'R₃ = 470 Ω' }),
    C('R4', 'resistor', '7,2', '7,8', 220, { label: 'R₄ = 220 Ω' }),
    C('W1', 'wire', '0,8', '7,8', 0),
  ],
});

const theveninAC_RL = (): CircuitDoc => ({
  ...base('Thévenin AC — diviseur RL série', 'ac', 50),
  ground: '0,8',
  terminals: { a: '8,0', b: '0,8' },
  components: [
    C('E1', 'vsource', '0,0', '0,8', 0, {
      label: 'e(t) = 10·sin(2πft)',
      ac: { amplitude: 10, frequency: 50, phaseDeg: 0 },
    }),
    C('R1', 'resistor', '0,0', '4,0', 100, { label: 'R = 100 Ω' }),
    C('L1', 'inductor', '4,0', '8,0', 0.2, { label: 'L = 200 mH' }),
    C('R2', 'resistor', '8,0', '8,8', 220, { label: 'R₂ = 220 Ω' }),
    C('W1', 'wire', '0,8', '8,8', 0),
  ],
});

const nortonAC_RL = (): CircuitDoc => ({
  ...base('Norton AC — source de courant ∥ RL', 'ac', 50),
  ground: '0,8',
  terminals: { a: '8,0', b: '0,8' },
  components: [
    C('I1', 'isource', '0,8', '0,0', 0, {
      label: 'i(t) = 50 mA crête',
      ac: { amplitude: 0.05, frequency: 50, phaseDeg: 0 },
    }),
    C('R1', 'resistor', '0,0', '4,0', 330, { label: 'R = 330 Ω' }),
    C('L1', 'inductor', '4,0', '8,0', 0.1, { label: 'L = 100 mH' }),
    C('R2', 'resistor', '8,0', '8,8', 100, { label: 'R₂ = 100 Ω' }),
    C('W1', 'wire', '0,8', '8,8', 0),
  ],
});

const dipolesEquivalents = (): CircuitDoc => ({
  ...base('Dipôles équivalents — charges en série/parallèle', 'dc'),
  ground: '0,10',
  terminals: { a: '4,5', b: '0,10' },
  components: [
    C('E1', 'vsource', '0,10', '0,0', 24, { label: 'E = 24 V' }),
    C('R1', 'resistor', '0,0', '0,5', 120, { label: 'R₁ = 120 Ω' }),
    C('R2', 'resistor', '0,5', '0,10', 180, { label: 'R₂ = 180 Ω' }),
    C('R3', 'resistor', '4,0', '4,5', 220, { label: 'R₃ = 220 Ω' }),
    C('R4', 'resistor', '4,5', '4,10', 470, { label: 'R₄ = 470 Ω' }),
    C('W1', 'wire', '0,0', '4,0', 0),
    C('W2', 'wire', '0,10', '4,10', 0),
  ],
});

const laboCalcul = (): CircuitDoc => ({
  ...base('Laboratoire de calcul T-N — deux mailles', 'dc'),
  ground: '4,10',
  terminals: { a: '8,0', b: '4,10' },
  components: [
    C('E1', 'vsource', '0,0', '0,10', 18, { label: 'E₁ = 18 V' }),
    C('R1', 'resistor', '0,0', '4,0', 470, { label: 'R₁ = 470 Ω' }),
    C('R2', 'resistor', '4,0', '4,10', 1000, { label: 'R₂ = 1 kΩ' }),
    C('R3', 'resistor', '4,0', '8,0', 330, { label: 'R₃ = 330 Ω' }),
    C('I1', 'isource', '8,10', '8,0', 0.01, { label: 'I = 10 mA' }),
    C('R4', 'resistor', '8,0', '8,10', 680, { label: 'R₄ = 680 Ω' }),
    C('W1', 'wire', '0,10', '4,10', 0),
    C('W2', 'wire', '4,10', '8,10', 0),
  ],
});

const transformationSources = (): CircuitDoc => ({
  ...base('Transformation de sources — E ⟷ I', 'dc'),
  ground: '0,10',
  terminals: { a: '8,0', b: '0,10' },
  components: [
    C('E1', 'vsource', '0,0', '0,10', 15, { label: 'E = 15 V' }),
    C('R1', 'resistor', '0,0', '4,0', 150, { label: 'R₁ = 150 Ω (série)' }),
    C('R2', 'resistor', '4,0', '4,10', 390, { label: 'R₂ = 390 Ω (parallèle)' }),
    C('R3', 'resistor', '4,0', '8,0', 270, { label: 'R₃ = 270 Ω' }),
    C('R4', 'resistor', '8,0', '8,10', 560, { label: 'R₄ = 560 Ω' }),
    C('W1', 'wire', '0,10', '8,10', 0),
    C('W2', 'wire', '4,0', '8,0', 0),
  ],
});

const hubPrincipal = (): CircuitDoc => ({
  ...base('Hub principal — réseau complet à 3 mailles', 'dc'),
  ground: '0,10',
  terminals: { a: '10,0', b: '0,10' },
  components: [
    C('E1', 'vsource', '0,0', '0,10', 20, { label: 'E₁ = 20 V' }),
    C('R1', 'resistor', '0,0', '4,0', 220, { label: 'R₁ = 220 Ω' }),
    C('R2', 'resistor', '4,0', '4,10', 470, { label: 'R₂ = 470 Ω' }),
    C('R3', 'resistor', '4,0', '7,0', 330, { label: 'R₃ = 330 Ω' }),
    C('I1', 'isource', '7,10', '7,0', 0.008, { label: 'I = 8 mA' }),
    C('R4', 'resistor', '7,0', '7,10', 820, { label: 'R₄ = 820 Ω' }),
    C('R5', 'resistor', '7,0', '10,0', 150, { label: 'R₅ = 150 Ω' }),
    C('R6', 'resistor', '10,0', '10,10', 560, { label: 'R₆ = 560 Ω' }),
    C('W1', 'wire', '0,10', '7,10', 0),
    C('W2', 'wire', '7,10', '10,10', 0),
  ],
});

const bobinesImpedances = (): CircuitDoc => ({
  ...base('Bobines & impédances — RLC série', 'ac', 100),
  ground: '0,8',
  terminals: { a: '8,0', b: '0,8' },
  components: [
    C('E1', 'vsource', '0,0', '0,8', 0, {
      label: 'e(t) = 12·sin(2πft)',
      ac: { amplitude: 12, frequency: 100, phaseDeg: 0 },
    }),
    C('R1', 'resistor', '0,0', '3,0', 100, { label: 'R = 100 Ω' }),
    C('L1', 'inductor', '3,0', '6,0', 0.25, { label: 'L = 250 mH' }),
    C('C1', 'capacitor', '6,0', '8,0', 4.7e-6, { label: 'C = 4,7 µF' }),
    C('R2', 'resistor', '8,0', '8,8', 470, { label: 'R₂ = 470 Ω' }),
    C('W1', 'wire', '0,8', '8,8', 0),
  ],
});

const sourcesLiees = (): CircuitDoc => ({
  ...base('Sources liées — VCVS et VCCS', 'dc'),
  ground: '0,10',
  terminals: { a: '10,0', b: '0,10' },
  components: [
    C('E1', 'vsource', '0,0', '0,10', 5, { label: 'E = 5 V' }),
    C('R1', 'resistor', '0,0', '4,0', 1000, { label: 'R₁ = 1 kΩ' }),
    C('R2', 'resistor', '4,0', '4,10', 2000, { label: 'R₂ = 2 kΩ' }),
    C('E2', 'vcvs', '4,0', '7,0', 0, {
      label: 'μ = 3 · V(1)',
      gain: 3,
      ctrl: { a: '4,0', b: '0,10' },
    }),
    C('R3', 'resistor', '7,0', '7,10', 470, { label: 'R₃ = 470 Ω' }),
    C('I2', 'vccs', '10,0', '10,10', 0, {
      label: 'g = 2 mS · V(2)',
      gain: 0.002,
      ctrl: { a: '7,0', b: '0,10' },
    }),
    C('R4', 'resistor', '10,0', '10,10', 330, { label: 'R₄ = 330 Ω' }),
    C('W1', 'wire', '0,10', '7,10', 0),
    C('W2', 'wire', '7,10', '10,10', 0),
  ],
});

const pontCapacitif = (): CircuitDoc => ({
  ...base('Pont de condensateurs — diviseur capacitif', 'ac', 1000),
  ground: '0,8',
  terminals: { a: '6,0', b: '0,8' },
  components: [
    C('E1', 'vsource', '0,0', '0,8', 0, {
      label: 'e(t) = 10 V crête · 1 kHz',
      ac: { amplitude: 10, frequency: 1000, phaseDeg: 0 },
    }),
    C('C1', 'capacitor', '0,0', '6,0', 100e-9, { label: 'C₁ = 100 nF' }),
    C('C2', 'capacitor', '6,0', '6,8', 220e-9, { label: 'C₂ = 220 nF' }),
    C('R1', 'resistor', '6,4', '6,8', 10000, { label: 'R = 10 kΩ' }),
    C('W1', 'wire', '0,8', '6,8', 0),
    C('W2', 'wire', '6,0', '6,4', 0),
  ],
});

const superposition = (): CircuitDoc => ({
  ...base('Superposition — deux sources indépendantes', 'dc'),
  ground: '0,10',
  terminals: { a: '5,0', b: '0,10' },
  components: [
    C('E1', 'vsource', '0,0', '0,10', 12, { label: 'E₁ = 12 V' }),
    C('R1', 'resistor', '0,0', '5,0', 220, { label: 'R₁ = 220 Ω' }),
    C('E2', 'vsource', '10,0', '10,10', 6, { label: 'E₂ = 6 V' }),
    C('R2', 'resistor', '10,0', '5,0', 470, { label: 'R₂ = 470 Ω' }),
    C('R3', 'resistor', '5,0', '5,10', 680, { label: 'R₃ = 680 Ω' }),
    C('W1', 'wire', '0,10', '10,10', 0),
  ],
});

const millman = (): CircuitDoc => ({
  ...base('Théorème de Millman — trois sources', 'dc'),
  ground: '0,10',
  terminals: { a: '4,4', b: '0,10' },
  components: [
    C('E1', 'vsource', '0,10', '0,4', 12, { label: 'E₁ = 12 V' }),
    C('R1', 'resistor', '0,4', '4,4', 100, { label: 'R₁ = 100 Ω' }),
    C('E2', 'vsource', '8,10', '8,4', 5, { label: 'E₂ = 5 V' }),
    C('R2', 'resistor', '8,4', '4,4', 220, { label: 'R₂ = 220 Ω' }),
    C('E3', 'vsource', '12,10', '12,4', 9, { label: 'E₃ = 9 V' }),
    C('R3', 'resistor', '12,4', '4,4', 470, { label: 'R₃ = 470 Ω' }),
    C('W1', 'wire', '0,10', '12,10', 0),
  ],
});

/* ------------------------------------------------------------------ */
/*  Catalogue                                                          */
/* ------------------------------------------------------------------ */

export const TEMPLATES: Template[] = [
  {
    slug: 'thevenin-serie',
    title: 'Thévenin : série',
    subtitle: 'Diviseur R₁–R₂',
    family: 'thevenin-norton',
    accent: 'amber',
    shape: 'circle',
    difficulty: 'Découverte',
    regime: 'dc',
    summary:
      'Le montage d’entrée par excellence : une source E et deux résistances en série. On extrait le modèle (E_th, R_th) vu de la sortie.',
    teaching: [
      'U_th = E · R₂ / (R₁ + R₂)',
      'R_th = R₁ ∥ R₂',
      'Le modèle de Thévenin ne dépend pas de la charge.',
    ],
    build: divideurThevenin,
  },
  {
    slug: 'norton-parallele',
    title: 'Norton : parallèle',
    subtitle: 'Source de courant + R',
    family: 'thevenin-norton',
    accent: 'cyan',
    shape: 'circle',
    difficulty: 'Découverte',
    regime: 'dc',
    summary:
      'Une source de courant idéale en parallèle avec une résistance : le modèle de Norton est immédiat, I_N est le courant source.',
    teaching: ['I_N = I', 'R_N = R₁ ∥ R₂', 'U_th = I_N · R_N'],
    build: nortonParallele,
  },
  {
    slug: 'equivalence-tn',
    title: 'Équivalence T ⇄ N',
    subtitle: 'Deux modèles, un seul dipôle',
    family: 'thevenin-norton',
    accent: 'violet',
    shape: 'shield',
    difficulty: 'Intermédiaire',
    regime: 'dc',
    summary:
      'Un réseau à deux mailles ; calculez son Thévenin puis vérifiez que le Norton associé redonne exactement la même caractéristique U(I).',
    teaching: ['U_th = R_N · I_N', 'R_N = R_th', 'Équivalence stricte aux bornes'],
    build: equivalenceTN,
  },
  {
    slug: 'thevenin-ac-rl',
    title: 'Thévenin AC : série RL',
    subtitle: 'Impédance complexe',
    family: 'impedances',
    accent: 'amber',
    shape: 'hex',
    difficulty: 'Intermédiaire',
    regime: 'ac',
    summary:
      'En sinusoïdal établi, Thévenin devient complexe : Z_th = R ∥ jLω et U_th un phaseur. Idéal pour voir l’influence de la fréquence.',
    teaching: ['Z_L = jLω', 'Z_th = R + jLω', 'Le module dépend de f'],
    build: theveninAC_RL,
  },
  {
    slug: 'norton-ac-rl',
    title: 'Norton AC : parallèle RL',
    subtitle: 'Admittance complexe',
    family: 'impedances',
    accent: 'green',
    shape: 'circle',
    difficulty: 'Intermédiaire',
    regime: 'ac',
    summary:
      'La forme de Norton est souvent la plus naturelle en parallèle : les admittances s’ajoutent, Y = 1/R + 1/(jLω).',
    teaching: ['Y = G + 1/(jLω)', 'I_N = phaseur de courant', 'Z_th = 1/Y'],
    build: nortonAC_RL,
  },
  {
    slug: 'dipoles-equivalents',
    title: 'Dipôles équivalents',
    subtitle: 'Série / parallèle',
    family: 'dipoles',
    accent: 'coral',
    shape: 'circle',
    difficulty: 'Découverte',
    regime: 'dc',
    summary:
      'Deux branches parallèles de résistances : entraînez-vous à réduire le réseau à un seul dipôle équivalent avant le calcul nodal.',
    teaching: ['R_série = ΣR', 'R_parallèle = (R₁R₂)/(R₁+R₂)', 'R_éq = branche ∥ branche'],
    build: dipolesEquivalents,
  },
  {
    slug: 'labo-calcul-tn',
    title: 'Labo de calcul : T-N',
    subtitle: 'Deux mailles, deux sources',
    family: 'labo',
    accent: 'amber',
    shape: 'circle',
    difficulty: 'Intermédiaire',
    regime: 'dc',
    summary:
      'Un vrai laboratoire : source de tension et source de courant dans deux mailles. Superposition et Thévenin doivent converger.',
    teaching: ['Superposition', 'Loi des mailles', 'Théorème de Millman'],
    build: laboCalcul,
  },
  {
    slug: 'transformation-sources',
    title: 'Transformation de sources',
    subtitle: 'E ⟷ I',
    family: 'sources',
    accent: 'coral',
    shape: 'hex',
    difficulty: 'Intermédiaire',
    regime: 'dc',
    summary:
      'Transformer une source de tension en source de courant (et inversement) pour simplifier le réseau avant l’équivalence.',
    teaching: ['E = I·R', 'I = E/R', 'Valable uniquement avec R en série/parallèle'],
    build: transformationSources,
  },
  {
    slug: 'hub-equivalence',
    title: 'Hub principal : équivalence',
    subtitle: 'Réseau à 3 mailles',
    family: 'thevenin-norton',
    accent: 'blue',
    shape: 'badge',
    difficulty: 'Avancé',
    regime: 'dc',
    summary:
      'Le montage de synthèse : six résistances, deux sources, trois mailles. Le solveur nodal et la réduction doivent confirmer le résultat.',
    teaching: ['Analyse nodale', 'Thévenin vu d’un nœud interne', 'Bilan de puissance'],
    build: hubPrincipal,
  },
  {
    slug: 'bobines-impedances',
    title: 'Bobines & impédances',
    subtitle: 'RLC série en CA',
    family: 'impedances',
    accent: 'cyan',
    shape: 'circle',
    difficulty: 'Avancé',
    regime: 'ac',
    summary:
      'R, L et C en série : observez l’impédance complexe, le déphasage courant/tension et le comportement à la résonance.',
    teaching: ['Z = R + j(Lω − 1/Cω)', 'Résonance ω₀ = 1/√(LC)', 'Facteur de qualité Q'],
    build: bobinesImpedances,
  },
  {
    slug: 'pont-wheatstone',
    title: 'Pont de Wheatstone',
    subtitle: 'Équilibre & Thévenin',
    family: 'ponts',
    accent: 'coral',
    shape: 'circle',
    difficulty: 'Intermédiaire',
    regime: 'dc',
    summary:
      'Le pont de Wheatstone : ici R₁·R₄ ≠ R₂·R₃, les points milieux ne sont pas au même potentiel. Extrayez le Thévenin vu entre eux, puis cherchez la condition d’équilibre.',
    teaching: ['Condition d’équilibre R₁R₄ = R₂R₃', 'U_th = 0 quand le pont est équilibré', 'Sensibilité du déséquilibre'],
    build: pontThevenin,
  },
  {
    slug: 'sources-liees',
    title: 'Sources liées',
    subtitle: 'VCVS & VCCS',
    family: 'sources',
    accent: 'coral',
    shape: 'hex',
    difficulty: 'Avancé',
    regime: 'dc',
    summary:
      'Une source de tension contrôlée par une tension et une source de courant contrôlée par une tension : le solveur MNA les traite exactement.',
    teaching: ['E = μ·V_c', 'I = g·V_c', 'MNA étendue'],
    build: sourcesLiees,
  },
  {
    slug: 'pont-capacitif',
    title: 'Diviseur capacitif',
    subtitle: 'Impédances en CA',
    family: 'impedances',
    accent: 'green',
    shape: 'circle',
    difficulty: 'Avancé',
    regime: 'ac',
    summary:
      'Deux condensateurs en série : la tension se répartit à l’inverse des capacités. Un grand classique des filtres.',
    teaching: ['Z_C = 1/(jCω)', 'Diviseur capacitif', 'La charge R perturbe la mesure'],
    build: pontCapacitif,
  },
  {
    slug: 'superposition',
    title: 'Superposition',
    subtitle: 'Deux sources, une sortie',
    family: 'thevenin-norton',
    accent: 'blue',
    shape: 'hex',
    difficulty: 'Intermédiaire',
    regime: 'dc',
    summary:
      'Deux f.é.m. alimentent le même nœud : le théorème de superposition décompose la tension de sortie en une somme de contributions. Le studio affiche chaque terme dans le panneau Équivalent.',
    teaching: ['Une source active à la fois', 'Somme des contributions', 'Vérifie U_th final'],
    build: superposition,
  },
  {
    slug: 'millman',
    title: 'Théorème de Millman',
    subtitle: 'Trois sources en parallèle',
    family: 'labo',
    accent: 'violet',
    shape: 'shield',
    difficulty: 'Intermédiaire',
    regime: 'dc',
    summary:
      'Trois branches source + résistance en parallèle : la tension du nœud commun est la moyenne pondérée des f.é.m. par les conductances.',
    teaching: ['V = Σ(Eᵢ/Rᵢ) / Σ(1/Rᵢ)', 'Généralisation de Millman', 'Thévenin direct au nœud'],
    build: millman,
  },
];

export const templateBySlug = (slug: string): Template | undefined =>
  TEMPLATES.find((t) => t.slug === slug);

export const FAMILY_LABEL: Record<Template['family'], string> = {
  'thevenin-norton': 'Thévenin · Norton',
  dipoles: 'Dipôles équivalents',
  sources: 'Transformation de sources',
  impedances: 'Bobines & impédances',
  ponts: 'Ponts & équilibre',
  labo: 'Laboratoire de calcul',
};
