/**
 * Contrat 2D des dipôles — **normatif, sans réécriture du rendu existant**.
 *
 * Ce module décrit ce que tout symbole de l'atelier doit respecter. Il ne
 * dessine rien : `components/studio/editor/PartGlyph.tsx` garde ses tracés
 * validés, et `lib/studio/editor.ts` garde `partGeometry`. On ajoute une
 * couche de description que le rendu, l'accrochage et le solveur peuvent citer.
 *
 * Règles (elles sont testées dans `symbols.test.ts`) :
 *
 *  1. **Deux bornes exactes** — `pinA` et `pinB` sont confondues avec les
 *     centres des nœuds `Component.a` et `Component.b`. Aucun décalage : les
 *     fils ne peuvent pas « flotter » à côté de la broche.
 *  2. **Repère local stable** — origine au centre du symbole, axe +x orienté de
 *     A vers B. Le parent applique la rotation ; aucun symbole ne code sa
 *     propre orientation en dur.
 *  3. **Boîte englobante** en coordonnées locales, utilisable pour le survol,
 *     la sélection et l'export SVG.
 *  4. **Convention de signe explicite**, alignée sur le solveur :
 *     - source de tension : `V(a) − V(b) = E` (le + est en A) ;
 *     - source de courant : injection `+I` au nœud A, `−I` en B (le courant
 *       sort par A) ;
 *     - dipôles passifs : convention récepteur, courant de référence A → B.
 *  5. **Séparation rendu / métier** : ce fichier ne contient ni valeur, ni état
 *     de composant. La valeur vit dans `Component.value`, l'état visuel dans
 *     les props du rendu (`closed`, `selected`, `ghost`).
 *
 * Les dipôles que le solveur ne sait pas encore traiter (diode, Zener, LED,
 * fusible, transistor) sont déclarés dans `PLANNED_SYMBOLS` avec leur motif de
 * refus : ils ne sont **pas** exposés comme s'ils fonctionnaient.
 */

import type { ComponentKind } from '@/lib/engine/types';
import { GRID } from './geometry';

export const SYMBOL_CONTRACT_VERSION = 1 as const;

export interface Vec {
  x: number;
  y: number;
}

/** Rôle électrique d'une borne. */
export type PinRole = 'anode' | 'cathode' | 'plus' | 'minus' | 'terminal' | 'gate' | 'common';

export interface SymbolPin {
  /** identifiant aligné sur `Component.a` / `Component.b` */
  id: 'a' | 'b';
  role: PinRole;
  /** position locale (origine = centre du symbole, +x de A vers B) */
  local: Vec;
  /** libellé affiché à côté de la broche */
  legend: string;
}

export interface SymbolBox {
  /** coin supérieur gauche, en coordonnées locales */
  local: Vec;
  width: number;
  height: number;
}

export interface Polarity {
  /** polarité + : borne A ou borne B */
  plus: 'a' | 'b';
  /** sens de la flèche de courant de référence */
  arrow: 'a-b' | 'b-a' | null;
  /** ce que le solveur applique, en une phrase */
  solver: string;
}

export type SymbolFamily = 'passif' | 'source' | 'connexion' | 'mesure' | 'liee';

export interface Dipole2D {
  kind: ComponentKind;
  /** nom canonique (français) */
  slug: string;
  family: SymbolFamily;
  pins: [SymbolPin, SymbolPin];
  box: SymbolBox;
  /** portée admise, en cellules de grille */
  span: { min: number; max: number };
  polarity: Polarity | null;
  /** états visuels admis — l'état ne modifie jamais `Component.value` */
  states?: ReadonlyArray<'closed' | 'open'>;
  /** rayon d'accrochage à la grille, en pixels */
  snapRadius: number;
  /** remarque de dessin (repère, flèche, point) */
  notes: string;
}

/* ------------------------------------------------------------------ local */

/** Demi-portée nominale du symbole : 2 cellules = 48 px. */
export const HALF_SPAN = GRID;
/** Demi-hauteur du corps du symbole (pour la boîte englobante). */
const BODY_HALF_HEIGHT = 14;

const pin = (id: 'a' | 'b', role: PinRole, legend: string, half = HALF_SPAN): SymbolPin => ({
  id,
  role,
  local: { x: id === 'a' ? -half : half, y: 0 },
  legend,
});

const box = (width: number, height: number, offsetY = -BODY_HALF_HEIGHT): SymbolBox => ({
  local: { x: -width / 2, y: offsetY },
  width,
  height,
});

const passif = (notes: string): Polarity => ({
  plus: 'a',
  arrow: 'a-b',
  solver: 'Convention récepteur : le courant de référence entre par A et sort par B ; U(a,b) = V(a) − V(b).',
});

/**
 * Table canonique. Toute nouvelle sorte de dipôle doit y figurer **avant**
 * d'apparaître dans la palette.
 */
export const SYMBOLS: Record<ComponentKind, Dipole2D> = {
  resistor: {
    kind: 'resistor',
    slug: 'Résistance',
    family: 'passif',
    pins: [pin('a', 'terminal', 'A'), pin('b', 'terminal', 'B')],
    box: box(2 * HALF_SPAN, 2 * BODY_HALF_HEIGHT, -14),
    span: { min: 1, max: 6 },
    polarity: passif('Aucune polarité ; zigzag centré sur l’axe A–B.'),
    snapRadius: GRID * 0.5,
    notes: 'Zigzag américain (IEEE). Norme IEC : rectangle — même boîte, même broches.',
  },
  capacitor: {
    kind: 'capacitor',
    slug: 'Condensateur',
    family: 'passif',
    pins: [pin('a', 'terminal', 'A'), pin('b', 'terminal', 'B')],
    box: box(2 * HALF_SPAN, 2 * 11, -11),
    span: { min: 1, max: 4 },
    polarity: passif('Armatures non polarisées : identité A/B conservée pour rester compatible avec les chimiques.'),
    snapRadius: GRID * 0.5,
    notes: 'Deux armatures perpendiculaires à l’axe A–B, écart 10 px constant quelle que soit la portée.',
  },
  inductor: {
    kind: 'inductor',
    slug: 'Bobine',
    family: 'passif',
    pins: [pin('a', 'terminal', 'A'), pin('b', 'terminal', 'B')],
    box: box(2 * HALF_SPAN, 2 * 10, -10),
    span: { min: 1, max: 4 },
    polarity: passif('Convention récepteur ; la f.é.m. auto-induite s’écrit −L·di/dt dans le solveur.'),
    snapRadius: GRID * 0.5,
    notes: 'Quatre arcs (ou trois selon la portée) centrés ; le point de polarité n’est pas dessiné.',
  },
  vsource: {
    kind: 'vsource',
    slug: 'Source de tension',
    family: 'source',
    pins: [pin('a', 'plus', '+'), pin('b', 'minus', '−')],
    box: box(2 * HALF_SPAN, 2 * 15, -15),
    span: { min: 2, max: 4 },
    polarity: {
      plus: 'a',
      arrow: 'b-a',
      solver: 'Branche MNA (a → b) avec rhs = E : V(a) − V(b) = E. Le + est en A, le courant sort par A.',
    },
    snapRadius: GRID * 0.5,
    notes: 'Disque + signes ; la valeur E est affichée à côté, jamais dans le symbole.',
  },
  isource: {
    kind: 'isource',
    slug: 'Source de courant',
    family: 'source',
    pins: [pin('a', 'plus', 'A'), pin('b', 'minus', 'B')],
    box: box(2 * HALF_SPAN, 2 * 15, -15),
    span: { min: 2, max: 4 },
    polarity: {
      plus: 'a',
      arrow: 'a-b',
      solver: 'Injections : +I au nœud A, −I au nœud B — le courant sort par A.',
    },
    snapRadius: GRID * 0.5,
    notes: 'Disque + flèche ; la flèche pointe vers A (sortie), jamais vers le corps du symbole.',
  },
  wire: {
    kind: 'wire',
    slug: 'Fil',
    family: 'connexion',
    pins: [pin('a', 'terminal', 'A'), pin('b', 'terminal', 'B')],
    box: box(2 * HALF_SPAN, 2, -1),
    span: { min: 1, max: 12 },
    polarity: null,
    snapRadius: GRID * 0.5,
    notes: 'Trait plein ; deux fils superposés sont fusionnés par `addWire`, jamais empilés.',
  },
  switch: {
    kind: 'switch',
    slug: 'Interrupteur',
    family: 'connexion',
    pins: [pin('a', 'terminal', 'A'), pin('b', 'terminal', 'B')],
    box: box(2 * HALF_SPAN, 2 * 12, -12),
    span: { min: 1, max: 4 },
    polarity: null,
    states: ['closed', 'open'],
    snapRadius: GRID * 0.5,
    notes: 'Fermé = trait continu (résistance nulle) ; ouvert = segment incliné. Seul `closed` change le dessin.',
  },
  ammeter: {
    kind: 'ammeter',
    slug: 'Ampèremètre',
    family: 'mesure',
    pins: [pin('a', 'plus', '+'), pin('b', 'minus', '−')],
    box: box(2 * HALF_SPAN, 2 * 13, -13),
    span: { min: 2, max: 4 },
    polarity: {
      plus: 'a',
      arrow: 'a-b',
      solver: 'Presque un fil (résistance ~0) : le courant affiché est celui de A vers B.',
    },
    snapRadius: GRID * 0.5,
    notes: 'Cercle + « A » ; le calibre est une propriété de mesure, pas une donnée du montage.',
  },
  voltmeter: {
    kind: 'voltmeter',
    slug: 'Voltmètre',
    family: 'mesure',
    pins: [pin('a', 'plus', '+'), pin('b', 'minus', '−')],
    box: box(2 * HALF_SPAN, 2 * 13, -13),
    span: { min: 2, max: 4 },
    polarity: {
      plus: 'a',
      arrow: null,
      solver: 'Résistance interne élevée ; la tension affichée est V(a) − V(b).',
    },
    snapRadius: GRID * 0.5,
    notes: 'Cercle + « V ». Branché en parallèle : ne jamais le placer en série dans un montage de puissance.',
  },
  lamp: {
    kind: 'lamp',
    slug: 'Lampe',
    family: 'passif',
    pins: [pin('a', 'terminal', 'A'), pin('b', 'terminal', 'B')],
    box: box(2 * HALF_SPAN, 2 * 13, -13),
    span: { min: 2, max: 4 },
    polarity: passif('Lampe = résistance non linéaire en pratique ; le solveur la traite comme R constante.'),
    snapRadius: GRID * 0.5,
    notes: 'Cercle + croix ; l’éclat (opacité) traduit la puissance, il ne modifie pas la donnée.',
  },
  potentiometer: {
    kind: 'potentiometer',
    slug: 'Potentiomètre',
    family: 'passif',
    pins: [pin('a', 'terminal', 'A'), pin('b', 'terminal', 'B')],
    box: box(2 * HALF_SPAN, 2 * BODY_HALF_HEIGHT, -14),
    span: { min: 2, max: 4 },
    polarity: passif('Rhéostat à deux bornes : la position du curseur n’est pas encore une donnée du solveur.'),
    snapRadius: GRID * 0.5,
    notes: 'Rectangle + flèche oblique. Le troisième point (curseur) sera ajouté avec `ctrl` si besoin.',
  },
  vcvs: {
    kind: 'vcvs',
    slug: 'Source de tension liée',
    family: 'liee',
    pins: [pin('a', 'plus', '+'), pin('b', 'minus', '−')],
    box: box(2 * HALF_SPAN, 2 * 15, -15),
    span: { min: 2, max: 4 },
    polarity: {
      plus: 'a',
      arrow: 'b-a',
      solver: 'E = k · (V(cp) − V(cn)) ; bornes de commande dans `Component.ctrl`, jamais dans les broches.',
    },
    snapRadius: GRID * 0.5,
    notes: 'Losange + signes. Les broches de commande ne sont pas des broches de puissance.',
  },
  vccs: {
    kind: 'vccs',
    slug: 'Source de courant liée',
    family: 'liee',
    pins: [pin('a', 'plus', 'A'), pin('b', 'minus', 'B')],
    box: box(2 * HALF_SPAN, 2 * 15, -15),
    span: { min: 2, max: 4 },
    polarity: {
      plus: 'a',
      arrow: 'a-b',
      solver: 'I = g · (V(cp) − V(cn)), injecté en A et retiré en B.',
    },
    snapRadius: GRID * 0.5,
    notes: 'Losange + flèche. Même convention de sortie que la source de courant indépendante.',
  },
};

/** Dipôles présents dans la feuille de style mais **pas** dans le solveur. */
export interface PlannedSymbol {
  slug: string;
  family: SymbolFamily;
  /** modèle actuel le plus proche, sans invention d’API */
  fallback: ComponentKind;
  reason: string;
}

export const PLANNED_SYMBOLS: readonly PlannedSymbol[] = [
  {
    slug: 'Diode',
    family: 'passif',
    fallback: 'switch',
    reason:
      'Modèle non linéaire (Shockley) absent du solveur nodal : une diode se comporte comme un interrupteur ouvert ou fermé selon le sens du courant. À implémenter avec itérations de Newton, pas en réutilisant le MNA linéaire.',
  },
  {
    slug: 'Diode Zener',
    family: 'passif',
    fallback: 'vsource',
    reason: 'Se décompose en diode + source de tension de claquage ; nécessite le modèle diode.',
  },
  {
    slug: 'LED',
    family: 'passif',
    fallback: 'lamp',
    reason: 'Diode électroluminescente : même non-linéarité que la diode, plus un seuil de tension directe.',
  },
  {
    slug: 'Transistor bipolaire',
    family: 'liee',
    fallback: 'vcvs',
    reason: 'Trois broches et un modèle (Ebers-Moll) hors du contrat à deux bornes ; la source liée en est l’approximation linéaire déjà disponible.',
  },
  {
    slug: 'Résistance fusible',
    family: 'passif',
    fallback: 'resistor',
    reason: 'Comportement identique à une résistance tant que le courant reste sous le calibre : peut être décrit par `resistor` + note.',
  },
];

/* ------------------------------------------------------------------ outils */

const KIND_LIST = Object.keys(SYMBOLS) as ComponentKind[];

/** Vrai si le solveur et le rendu gèrent ce dipôle. */
export function isSupported(kind: string): kind is ComponentKind {
  return (KIND_LIST as string[]).includes(kind);
}

/** Description canonique d’un dipôle ; lève si le type est inconnu. */
export function symbolOf(kind: ComponentKind): Dipole2D {
  const symbol = SYMBOLS[kind];
  if (!symbol) throw new Error(`Symbole inconnu : ${kind}`);
  return symbol;
}

/**
 * Bornes en coordonnées monde.
 *
 * Par contrat, elles sont **confondues** avec les centres des nœuds : aucune
 * transformation ne peut les décaler, quelle que soit l’orientation (la
 * diagonale est admise, comme dans `partGeometry`).
 */
export function pinsAt(aPx: Vec, bPx: Vec): { a: Vec; b: Vec } {
  return { a: { ...aPx }, b: { ...bPx } };
}

/** Boîte englobante monde, alignée sur l’axe A–B, élargie du corps du symbole. */
export function boxAt(kind: ComponentKind, aPx: Vec, bPx: Vec): { x: number; y: number; width: number; height: number } {
  const { box: local } = symbolOf(kind);
  const minX = Math.min(aPx.x, bPx.x) - Math.abs(local.width) / 2 + local.width / 2;
  const minY = Math.min(aPx.y, bPx.y);
  const width = Math.abs(bPx.x - aPx.x);
  const height = Math.abs(bPx.y - aPx.y);
  // le corps dépasse perpendiculairement à l’axe
  const pad = Math.max(Math.abs(local.width) / 2, Math.abs(local.height) / 2);
  const horizontal = Math.abs(bPx.y - aPx.y) < 1e-6;
  return horizontal
    ? { x: minX, y: minY - pad, width, height: height + 2 * pad }
    : { x: minX - pad, y: minY, width: width + 2 * pad, height };
}

/** Rotation locale par quarts de tour (0..3), sens trigonométrique à l’écran. */
export function rotateLocal(point: Vec, quarterTurns: number): Vec {
  const turns = ((Math.round(quarterTurns) % 4) + 4) % 4;
  let { x, y } = point;
  for (let turn = 0; turn < turns; turn += 1) {
    const nextX = -y;
    const nextY = x;
    // `+ 0` évite les « -0 » qui cassent les comparaisons strictes
    x = nextX + 0;
    y = nextY + 0;
  }
  return { x: x + 0, y: y + 0 };
}

/** Miroir local : `'x'` inverse l’axe A–B, `'y'` inverse la perpendiculaire. */
export function mirrorLocal(point: Vec, axis: 'x' | 'y'): Vec {
  return axis === 'x' ? { x: -point.x + 0, y: point.y } : { x: point.x, y: -point.y + 0 };
}

/** Longueur d’un dipôle en pixels de grille. */
export function spanPx(aPx: Vec, bPx: Vec): number {
  return Math.hypot(bPx.x - aPx.x, bPx.y - aPx.y);
}

/** Portée exprimée en cellules (pour vérifier `span.min`/`span.max`). */
export function spanCells(aPx: Vec, bPx: Vec): number {
  return spanPx(aPx, bPx) / GRID;
}

/**
 * Contrôle de cohérence d’un dipôle posé : portée admise, deux bornes
 * distinctes, boîte non dégénérée. Renvoie la liste des écarts (vide = conforme).
 */
export function auditPart(kind: ComponentKind, aPx: Vec, bPx: Vec): string[] {
  const problems: string[] = [];
  const symbol = symbolOf(kind);
  if (aPx.x === bPx.x && aPx.y === bPx.y) problems.push('bornes confondues');
  const cells = spanCells(aPx, bPx);
  if (cells < symbol.span.min - 1e-6) problems.push(`portée ${cells.toFixed(2)} < min ${symbol.span.min}`);
  if (cells > symbol.span.max + 1e-6) problems.push(`portée ${cells.toFixed(2)} > max ${symbol.span.max}`);
  const world = boxAt(kind, aPx, bPx);
  if (!(world.width > 0) || !(world.height > 0)) problems.push('boîte dégénérée');
  return problems;
}
