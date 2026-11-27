import { COMPONENT_META, type CircuitDoc, type Component, type ComponentKind } from './types';

/**
 * Code d'équivalence d'un montage.
 *
 * Le studio dessinait le schéma et donnait U_th / Z_th / I_N, mais ne montrait
 * jamais **la description textuelle** du montage — celle qu'on écrit en cours,
 * qu'on colle dans un simulateur SPICE ou qu'on recopie dans un compte-rendu.
 * Ce module la produit de façon canonique et déterministe :
 *
 *  - la masse devient le nœud `0` ;
 *  - les bornes A et B sont nommées dès qu'elles existent ;
 *  - les autres nœuds sont numérotés de gauche à droite puis de haut en bas,
 *    donc deux personnes qui décrivent le même schéma obtiennent le même code ;
 *  - chaque dipôle reçoit un identifiant SPICE (`R1`, `C2`, `E1`…).
 *
 * Le texte final contient deux colonnes : la version lisible avec unités
 * (`R1 1 2 500 Ω`) et des lignes SPICE pures, utilisables telles quelles.
 */

const PREFIX: Record<ComponentKind, string> = {
  resistor: 'R',
  capacitor: 'C',
  inductor: 'L',
  vsource: 'E',
  isource: 'I',
  wire: 'W',
  switch: 'S',
  ammeter: 'A',
  voltmeter: 'V',
  lamp: 'LA',
  potentiometer: 'P',
  vcvs: 'G',
  vccs: 'F',
};

export interface NetlistNode {
  /** nom affiché : `0`, `1`, `2`… */
  id: string;
  /** cellule de grille d'origine (`"4,2"`), utile pour pointer le schéma */
  cell: string | null;
  ground: boolean;
  terminalA: boolean;
  terminalB: boolean;
}

export interface NetlistEntry {
  /** identifiant SPICE : `R1`, `C2`, `E1`… */
  id: string;
  kind: ComponentKind;
  label: string;
  from: string;
  to: string;
  /** nœuds de commande des sources liées */
  ctrl?: { from: string; to: string };
  value: number;
  unit: string;
  /** valeur formatée en notation d'ingénieur : `4,7 kΩ`, `1 µF` */
  display: string;
  /** ligne lisible : `R1 1 2 4,7 kΩ` */
  line: string;
  /** ligne SPICE : `R1 1 2 4700` */
  spice: string;
}

export interface EquivalenceSummary {
  /** tension de Thévenin, en volts */
  vth?: number;
  /** résistance (ou impédance) de Thévenin, en ohms */
  rth?: number;
  /** courant de Norton, en ampères */
  inorton?: number;
}

export interface EquivalenceCode {
  title: string;
  regime: 'dc' | 'ac';
  frequency: number;
  nodes: NetlistNode[];
  entries: NetlistEntry[];
  /** le texte complet, prêt à copier */
  text: string;
  /** même chose, sans les commentaires : utilisable dans un simulateur */
  spice: string;
  summary: EquivalenceSummary | null;
}

const SUPERS: Record<number, string> = {
  [-24]: 'y',
  [-21]: 'z',
  [-18]: 'a',
  [-15]: 'f',
  [-12]: 'p',
  [-9]: 'n',
  [-6]: 'µ',
  [-3]: 'm',
  [0]: '',
  [3]: 'k',
  [6]: 'M',
  [9]: 'G',
  [12]: 'T',
};

/** Formate une valeur en notation d'ingénieur, virgule française. */
export function formatEngineering(value: number, unit = ''): string {
  if (!Number.isFinite(value)) return `—${unit ? ` ${unit}` : ''}`;
  if (value === 0) return `0${unit ? ` ${unit}` : ''}`;
  const sign = value < 0 ? '−' : '';
  const magnitude = Math.abs(value);
  const exponent = Math.floor(Math.log10(magnitude) / 3) * 3;
  const shifted = Math.min(Math.max(exponent, -24), 12);
  const mantissa = magnitude / 10 ** shifted;
  // trois chiffres significatifs suffisent pour un énoncé, et un entier reste entier
  const rounded = Number(mantissa.toFixed(mantissa < 10 ? 2 : 1));
  const text = String(rounded).replace('.', ',');
  return `${sign}${text}${SUPERS[shifted] ? ` ${SUPERS[shifted]}` : ''}${unit ? `${SUPERS[shifted] ? '' : ' '}${unit}` : ''}`;
}

/** Valeur brute pour SPICE (pas de préfixe bizarre, pas de virgule). */
export function spiceValue(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (value === 0) return '0';
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) return value.toExponential(4);
  return String(Number(value.toPrecision(6)));
}

/** Numérote les nœuds : masse d'abord, puis A, B, puis ordre de lecture. */
export function netlistNodes(doc: CircuitDoc): NetlistNode[] {
  const cells = new Set<string>();
  for (const part of doc.components) {
    for (const cell of [part.a, part.b, part.ctrl?.a, part.ctrl?.b]) {
      if (cell && cell.trim()) cells.add(cell);
    }
  }
  if (doc.ground) cells.add(doc.ground);
  if (doc.terminals.a) cells.add(doc.terminals.a);
  if (doc.terminals.b) cells.add(doc.terminals.b);

  const priority = (cell: string) => {
    if (cell === doc.ground) return 0;
    if (cell === doc.terminals.a) return 1;
    if (cell === doc.terminals.b) return 2;
    return 3;
  };
  const position = (cell: string) => {
    const [x, y] = cell.split(',').map((part) => Number(part));
    return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
  };

  const ordered = [...cells].sort((left, right) => {
    const byPriority = priority(left) - priority(right);
    if (byPriority !== 0) return byPriority;
    const a = position(left);
    const b = position(right);
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    return left.localeCompare(right);
  });

  let counter = 0;
  return ordered.map((cell) => {
    const ground = cell === doc.ground;
    const id = ground ? '0' : String((counter += 1));
    return {
      id,
      cell,
      ground,
      terminalA: cell === doc.terminals.a,
      terminalB: cell === doc.terminals.b,
    };
  });
}

function unitOf(kind: ComponentKind): string {
  const meta = COMPONENT_META[kind];
  return meta?.unit ?? '';
}

/** Étiquette lisible d'une pièce (son `label`, sinon l'identifiant). */
function labelOf(part: Component): string {
  return part.label?.trim() || part.id;
}

/**
 * Construit le code d'équivalence complet du montage.
 *
 * Fonction pure : même document → même texte, octet pour octet.
 */
export function equivalenceCode(doc: CircuitDoc, summary?: EquivalenceSummary): EquivalenceCode {
  const nodes = netlistNodes(doc);
  const byCell = new Map(nodes.map((node) => [node.cell, node.id]));
  const nodeName = (cell: string | null | undefined): string => {
    if (!cell) return '0';
    return byCell.get(cell) ?? cell;
  };

  const counters = new Map<string, number>();
  const entries: NetlistEntry[] = doc.components.map((part) => {
    const prefix = PREFIX[part.kind] ?? 'X';
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    const id = `${prefix}${next}`;
    /**
     * Une source liée n'a pas d'unité de dipôle : son gain est un rapport
     * (V/V pour une VCVS, A/V pour une VCCS). On laisse donc la colonne vide
     * pour que la ligne garde la forme SPICE (`G1 n+ n- nc+ nc- gain`),
     * sans jeton parasite entre les nœuds de commande.
     */
    const unit = part.ctrl ? '' : unitOf(part.kind);
    const display = formatEngineering(part.value, unit);
    const from = nodeName(part.a);
    const to = nodeName(part.b);
    const ctrl = part.ctrl ? { from: nodeName(part.ctrl.a), to: nodeName(part.ctrl.b) } : undefined;
    const tail = ctrl ? ` ${ctrl.from} ${ctrl.to}` : '';
    return {
      id,
      kind: part.kind,
      label: labelOf(part),
      from,
      to,
      ctrl,
      value: part.value,
      unit,
      display,
      line: `${id} ${from} ${to} ${display}${tail}`,
      spice: `${id} ${from} ${to} ${spiceValue(part.value)}${tail}`,
    };
  });

  const regime = doc.regime === 'ac' ? `alternatif ${formatEngineering(doc.frequency, 'Hz')}` : 'continu';
  const terminalLine = [
    `Masse 0${doc.ground ? ` (nœud ${nodeName(doc.ground)})` : ''}`,
    `A = ${doc.terminals.a ? nodeName(doc.terminals.a) : '—'}`,
    `B = ${doc.terminals.b ? nodeName(doc.terminals.b) : '—'}`,
  ].join(' · ');

  const header = [
    `* Northev Spark — code d’équivalence`,
    `* ${doc.name?.trim() || 'Montage sans titre'} — ${regime}`,
    `* ${terminalLine}`,
  ];

  const summaryLines: string[] = [];
  if (summary && (summary.vth !== undefined || summary.rth !== undefined || summary.inorton !== undefined)) {
    const bits: string[] = [];
    if (summary.vth !== undefined) bits.push(`U_th = ${formatEngineering(summary.vth, 'V')}`);
    if (summary.rth !== undefined) bits.push(`Z_th = ${formatEngineering(summary.rth, 'Ω')}`);
    if (summary.inorton !== undefined) bits.push(`I_N = ${formatEngineering(summary.inorton, 'A')}`);
    summaryLines.push(`* Équivalent de Thévenin : ${bits.join(' · ')}`);
  }

  const foot = [
    `* ${nodes.filter((node) => !node.ground).length} nœud(s) hors masse · ${entries.length} dipôle(s)`,
  ];

  const text = [...header, '', ...entries.map((entry) => entry.line), '', ...summaryLines, ...foot].join('\n');
  const spice = [...entries.map((entry) => entry.spice)].join('\n');

  return {
    title: doc.name?.trim() || 'Montage sans titre',
    regime: doc.regime,
    frequency: doc.frequency,
    nodes,
    entries,
    text,
    spice,
    summary: summary ?? null,
  };
}
