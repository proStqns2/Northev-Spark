/**
 * Cœur de l'atelier de schémas — logique pure, sans React.
 *
 * Tout ce qui fait « poser une pièce, la déplacer, la relier » vit ici, sous
 * forme de fonctions pures : `(état, action) → nouvel état`. L'interface ne
 * fait que dessiner cet état et transmettre les gestes. Conséquence directe :
 * le placement et le câblage sont testables sans navigateur, et un bug
 * d'affichage ne peut plus empêcher de construire un montage.
 *
 * Repères :
 *  - la grille est en « cellules » entières (GRID pixels par cellule) ;
 *  - un dipôle occupe deux bornes alignées (horizontale, verticale, ou
 *    diagonale pour les sources liées) ;
 *  - un nœud est identifié par la cellule où il se trouve (`"x,y"`) ;
 *  - deux dipôles sont connectés dès qu'ils partagent une borne, et un fil
 *    (`kind: 'wire'`) relie deux nœuds quelconques.
 */

import {
  COMPONENT_META,
  DEFAULT_COMPONENT_VALUE,
  type CircuitDoc,
  type Component,
  type ComponentKind,
} from '@/lib/engine/types';
import { GRID } from '@/lib/studio/geometry';

/* ------------------------------------------------------------------ */
/* types                                                               */
/* ------------------------------------------------------------------ */

export type Tool =
  | { mode: 'select' }
  | { mode: 'place'; kind: ComponentKind }
  | { mode: 'wire' }
  | { mode: 'erase' }
  | { mode: 'ground' }
  | { mode: 'terminal'; which: 'a' | 'b' }
  | { mode: 'pan' };

export interface Cell {
  x: number;
  y: number;
}

export interface HistoryEntry {
  doc: CircuitDoc;
  /** libellé de l'action, affiché dans l'infobulle « annuler » */
  label: string;
}

export interface EditorState {
  doc: CircuitDoc;
  tool: Tool;
  selectedId: string | null;
  hoverId: string | null;
  /** premier nœud cliqué en mode fil */
  wireFrom: string | null;
  /** nœud survolé par la souris (surbrillance des connexions) */
  hoverNode: string | null;
  history: HistoryEntry[];
  future: HistoryEntry[];
  /** vrai si le document diffère de la dernière sauvegarde */
  dirty: boolean;
  /** compteur d'actions, utile pour les animations */
  revision: number;
}

export const HISTORY_LIMIT = 60;

/* ------------------------------------------------------------------ */
/* géométrie                                                           */
/* ------------------------------------------------------------------ */

export const cellKey = (x: number, y: number): string => `${Math.round(x)},${Math.round(y)}`;

export const parseCell = (cell: string): Cell | null => {
  if (typeof cell !== 'string' || !cell.includes(',')) return null;
  const [x, y] = cell.split(',').map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
};

export const snap = (value: number): number => Math.round(value);

/** Position en pixels du centre d'une cellule. */
export const cellCenter = (cell: Cell): Cell => ({ x: cell.x * GRID, y: cell.y * GRID });

/** Cellule la plus proche d'un point exprimé en pixels de la grille. */
export const cellFromPoint = (point: Cell): Cell => ({ x: snap(point.x / GRID), y: snap(point.y / GRID) });

export type Orientation = 'h' | 'v' | 'd';

export interface PartGeometry {
  a: Cell;
  b: Cell;
  aPx: Cell;
  bPx: Cell;
  centerPx: Cell;
  orientation: Orientation;
  /** longueur en cellules */
  span: number;
}

/** Géométrie d'un dipôle, partagée par le dessin et le test de survol. */
export function partGeometry(part: Pick<Component, 'a' | 'b'>): PartGeometry | null {
  const a = parseCell(part.a);
  const b = parseCell(part.b);
  if (!a || !b) return null;
  const orientation: Orientation = a.y === b.y ? 'h' : a.x === b.x ? 'v' : 'd';
  return {
    a,
    b,
    aPx: cellCenter(a),
    bPx: cellCenter(b),
    centerPx: { x: (a.x + b.x) * GRID * 0.5, y: (a.y + b.y) * GRID * 0.5 },
    orientation,
    span: Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1),
  };
}

/** Rectangle englobant (en pixels de grille) d'un ensemble de dipôles. */
export function docBounds(doc: CircuitDoc): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of doc.components) {
    const geometry = partGeometry(part);
    if (!geometry) continue;
    minX = Math.min(minX, geometry.aPx.x, geometry.bPx.x);
    minY = Math.min(minY, geometry.aPx.y, geometry.bPx.y);
    maxX = Math.max(maxX, geometry.aPx.x, geometry.bPx.x);
    maxY = Math.max(maxY, geometry.aPx.y, geometry.bPx.y);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 480, maxY: 288, width: 480, height: 288 };
  const pad = GRID * 2.5;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
    width: Math.max(320, maxX - minX + pad * 2),
    height: Math.max(200, maxY - minY + pad * 2),
  };
}

/* ------------------------------------------------------------------ */
/* lecture du document                                                 */
/* ------------------------------------------------------------------ */

/** Tous les nœuds utilisés par le montage (bornes de dipôles + masse + sondes). */
export function nodesOf(doc: CircuitDoc): string[] {
  const nodes = new Set<string>();
  for (const part of doc.components) {
    if (part.a) nodes.add(part.a);
    if (part.b) nodes.add(part.b);
    if (part.ctrl?.a) nodes.add(part.ctrl.a);
    if (part.ctrl?.b) nodes.add(part.ctrl.b);
  }
  if (doc.ground) nodes.add(doc.ground);
  return [...nodes];
}

/** Combien de bornes se raccordent à chaque nœud. */
export function degreeMap(doc: CircuitDoc): Map<string, number> {
  const degrees = new Map<string, number>();
  for (const node of nodesOf(doc)) degrees.set(node, 0);
  for (const part of doc.components) {
    if (part.a) degrees.set(part.a, (degrees.get(part.a) ?? 0) + 1);
    if (part.b) degrees.set(part.b, (degrees.get(part.b) ?? 0) + 1);
    if (part.ctrl?.a) degrees.set(part.ctrl.a, (degrees.get(part.ctrl.a) ?? 0) + 1);
    if (part.ctrl?.b) degrees.set(part.ctrl.b, (degrees.get(part.ctrl.b) ?? 0) + 1);
  }
  return degrees;
}

/** Composants dont l'une des bornes touche la cellule donnée. */
export function partsAtNode(doc: CircuitDoc, node: string): Component[] {
  return doc.components.filter(
    (part) => part.a === node || part.b === node || part.ctrl?.a === node || part.ctrl?.b === node,
  );
}

/** Premier dipôle dont la boîte englobante contient la cellule (hors fils). */
export function partAtCell(doc: CircuitDoc, cell: Cell, options: { includeWires?: boolean } = {}): Component | null {
  for (let index = doc.components.length - 1; index >= 0; index -= 1) {
    const part = doc.components[index];
    if (part.kind === 'wire' && !options.includeWires) continue;
    const geometry = partGeometry(part);
    if (!geometry) continue;
    const minX = Math.min(geometry.a.x, geometry.b.x);
    const maxX = Math.max(geometry.a.x, geometry.b.x);
    const minY = Math.min(geometry.a.y, geometry.b.y);
    const maxY = Math.max(geometry.a.y, geometry.b.y);
    if (cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY) {
      // un dipôle diagonal ne contient que ses deux extrémités
      if (geometry.orientation === 'd') {
        if ((cell.x === geometry.a.x && cell.y === geometry.a.y) || (cell.x === geometry.b.x && cell.y === geometry.b.y)) {
          return part;
        }
        continue;
      }
      return part;
    }
  }
  return null;
}

/** Nœud le plus proche d'une cellule, dans un rayon donné. */
export function nearestNode(doc: CircuitDoc, cell: Cell, radius = 0): string | null {
  let best: { node: string; distance: number } | null = null;
  for (const node of nodesOf(doc)) {
    const point = parseCell(node);
    if (!point) continue;
    const distance = Math.hypot(point.x - cell.x, point.y - cell.y);
    if (distance <= radius + 1e-6 && (!best || distance < best.distance)) best = { node, distance };
  }
  return best?.node ?? null;
}

/* ------------------------------------------------------------------ */
/* consultations                                                       */
/* ------------------------------------------------------------------ */

export function selectedPart(state: EditorState): Component | null {
  if (!state.selectedId) return null;
  return state.doc.components.find((part) => part.id === state.selectedId) ?? null;
}

export function canUndo(state: EditorState): boolean {
  return state.history.length > 0;
}

export function canRedo(state: EditorState): boolean {
  return state.future.length > 0;
}

/* ------------------------------------------------------------------ */
/* cycle de vie                                                        */
/* ------------------------------------------------------------------ */

export function createEditor(doc: CircuitDoc, tool: Tool = { mode: 'select' }): EditorState {
  return {
    doc,
    tool,
    selectedId: null,
    hoverId: null,
    wireFrom: null,
    hoverNode: null,
    history: [],
    future: [],
    dirty: false,
    revision: 0,
  };
}

/** Pousse l'état courant dans l'historique et applique la modification. */
export function commit(state: EditorState, doc: CircuitDoc, label: string): EditorState {
  return {
    ...state,
    doc,
    history: [...state.history, { doc: state.doc, label }].slice(-HISTORY_LIMIT),
    future: [],
    dirty: true,
    revision: state.revision + 1,
  };
}

/** Variante sans historique (déplacement continu pendant un glisser). */
export function live(state: EditorState, doc: CircuitDoc): EditorState {
  return { ...state, doc, dirty: true, revision: state.revision + 1 };
}

export function undo(state: EditorState): EditorState {
  const entry = state.history[state.history.length - 1];
  if (!entry) return state;
  return {
    ...state,
    doc: entry.doc,
    history: state.history.slice(0, -1),
    future: [{ doc: state.doc, label: entry.label }, ...state.future].slice(0, HISTORY_LIMIT),
    revision: state.revision + 1,
    selectedId: null,
    wireFrom: null,
  };
}

export function redo(state: EditorState): EditorState {
  const entry = state.future[0];
  if (!entry) return state;
  return {
    ...state,
    doc: entry.doc,
    history: [...state.history, { doc: state.doc, label: entry.label }].slice(-HISTORY_LIMIT),
    future: state.future.slice(1),
    revision: state.revision + 1,
  };
}

export function setTool(state: EditorState, tool: Tool): EditorState {
  return { ...state, tool, wireFrom: null, hoverNode: null };
}

export function select(state: EditorState, id: string | null): EditorState {
  return { ...state, selectedId: id };
}

export function markSaved(state: EditorState): EditorState {
  return { ...state, dirty: false };
}

export function replaceDoc(state: EditorState, doc: CircuitDoc, label = 'Nouveau document'): EditorState {
  return { ...commit(state, doc, label), selectedId: null, wireFrom: null };
}

/* ------------------------------------------------------------------ */
/* placement                                                           */
/* ------------------------------------------------------------------ */

function isFree(doc: CircuitDoc, cell: Cell): boolean {
  return !partAtCell(doc, cell);
}

/**
 * Cherche une paire de cellules libre pour un dipôle horizontal partant de la
 * cellule cliquée. Si les deux cellules sont occupées, on décale vers la
 * droite puis vers le bas — poser une pièce ne doit jamais « échouer
 * silencieusement ».
 */
export function findSpan(doc: CircuitDoc, start: Cell, orientation: 'h' | 'v' = 'h'): { a: Cell; b: Cell } {
  // un dipôle occupe deux cellules : 48 px, assez pour que le symbole
  // reste lisible et cliquable au doigt
  const offset = orientation === 'h' ? { x: 2, y: 0 } : { x: 0, y: 2 };
  const candidates: Cell[] = [start];
  for (let step = 1; step <= 12; step += 1) {
    candidates.push({ x: start.x + step, y: start.y });
    candidates.push({ x: start.x - step, y: start.y });
    candidates.push({ x: start.x, y: start.y + step });
    candidates.push({ x: start.x, y: start.y - step });
  }
  for (const candidate of candidates) {
    const end = { x: candidate.x + offset.x, y: candidate.y + offset.y };
    if (isFree(doc, candidate) && isFree(doc, end)) return { a: candidate, b: end };
  }
  return { a: start, b: { x: start.x + offset.x, y: start.y + offset.y } };
}

let placementCounter = 0;

/** Identifiant court et lisible (`R4`, `C2`, `E1`…). */
export function nextLabel(doc: CircuitDoc, kind: ComponentKind): string {
  const meta = COMPONENT_META[kind];
  const prefix = meta.symbol === '—' ? 'X' : meta.symbol;
  const used = new Set(doc.components.filter((part) => part.kind === kind).map((part) => part.label ?? ''));
  let index = 1;
  while (used.has(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

export interface PlaceResult {
  state: EditorState;
  component: Component | null;
}

/** Pose un dipôle à la cellule demandée (avec valeur par défaut). */
export function placePart(
  state: EditorState,
  kind: ComponentKind,
  start: Cell,
  options: { orientation?: 'h' | 'v'; value?: number } = {},
): PlaceResult {
  const orientation = options.orientation ?? (kind === 'vsource' || kind === 'isource' ? 'v' : 'h');
  const { a, b } = findSpan(state.doc, start, orientation);
  placementCounter += 1;
  const component: Component = {
    id: `p${Date.now().toString(36)}${placementCounter.toString(36)}`,
    kind,
    a: cellKey(a.x, a.y),
    b: cellKey(b.x, b.y),
    value: options.value ?? DEFAULT_COMPONENT_VALUE(kind),
    label: nextLabel(state.doc, kind),
    ...(kind === 'switch' ? { closed: true } : {}),
    ...(kind === 'vsource' || kind === 'isource' ? { ac: undefined } : {}),
  };
  const doc: CircuitDoc = {
    ...state.doc,
    components: [...state.doc.components, component],
    // premier dipôle posé : on prend sa borne A comme masse par défaut,
    // sinon le solveur refuse de calculer un montage flottant.
    ground: state.doc.ground || component.a,
  };
  return { state: { ...commit(state, doc, `Poser ${COMPONENT_META[kind].label}`), selectedId: component.id }, component };
}

/** Ajoute un fil entre deux nœuds (sans doublon ni fil nul). */
export function addWire(doc: CircuitDoc, from: string, to: string): { doc: CircuitDoc; added: boolean } {
  if (!from || !to || from === to) return { doc, added: false };
  const exists = doc.components.some(
    (part) =>
      part.kind === 'wire' &&
      ((part.a === from && part.b === to) || (part.a === to && part.b === from)),
  );
  if (exists) return { doc, added: false };
  const wire: Component = {
    id: `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    kind: 'wire',
    a: from,
    b: to,
    value: 0,
    label: undefined,
  };
  return { doc: { ...doc, components: [...doc.components, wire] }, added: true };
}

/** Point d'entrée du mode fil : mémorise le premier nœud. */
export function startWire(state: EditorState, node: string): EditorState {
  return { ...state, wireFrom: node, hoverNode: node };
}

/** Termine le fil sur un second nœud. */
export function finishWire(state: EditorState, node: string): { state: EditorState; message: string } {
  if (!state.wireFrom) return { state: startWire(state, node), message: 'Première extrémité posée.' };
  if (state.wireFrom === node) return { state: { ...state, wireFrom: null }, message: 'Fil annulé (même borne).' };
  const { doc, added } = addWire(state.doc, state.wireFrom, node);
  if (!added) return { state: { ...state, wireFrom: null }, message: 'Ces bornes sont déjà reliées.' };
  return {
    state: { ...commit(state, doc, 'Tracer un fil'), wireFrom: null },
    message: 'Fil ajouté.',
  };
}

export function cancelWire(state: EditorState): EditorState {
  return { ...state, wireFrom: null };
}

/* ------------------------------------------------------------------ */
/* édition                                                             */
/* ------------------------------------------------------------------ */

export function movePart(state: EditorState, id: string, delta: Cell, options: { commit?: boolean } = {}): EditorState {
  if (delta.x === 0 && delta.y === 0) return state;
  const doc: CircuitDoc = {
    ...state.doc,
    components: state.doc.components.map((part) => {
      if (part.id !== id) return part;
      const a = parseCell(part.a);
      const b = parseCell(part.b);
      if (!a || !b) return part;
      const next: Component = {
        ...part,
        a: cellKey(a.x + delta.x, a.y + delta.y),
        b: cellKey(b.x + delta.x, b.y + delta.y),
      };
      if (part.ctrl?.a && part.ctrl?.b) {
        const ca = parseCell(part.ctrl.a);
        const cb = parseCell(part.ctrl.b);
        if (ca && cb) {
          next.ctrl = { a: cellKey(ca.x + delta.x, ca.y + delta.y), b: cellKey(cb.x + delta.x, cb.y + delta.y) };
        }
      }
      return next;
    }),
  };
  return options.commit === false ? live(state, doc) : commit(state, doc, 'Déplacer');
}

/** Déplace un nœud entier (et tout ce qui s'y raccorde) : c'est ce qui
 *  permet d'écarter proprement deux branches d'un montage. */
export function moveNode(state: EditorState, node: string, delta: Cell): EditorState {
  const target = parseCell(node);
  if (!target) return state;
  const to = cellKey(target.x + delta.x, target.y + delta.y);
  const doc: CircuitDoc = {
    ...state.doc,
    components: state.doc.components.map((part) => ({
      ...part,
      a: part.a === node ? to : part.a,
      b: part.b === node ? to : part.b,
      ctrl:
        part.ctrl && (part.ctrl.a === node || part.ctrl.b === node)
          ? {
              a: part.ctrl.a === node ? to : part.ctrl.a,
              b: part.ctrl.b === node ? to : part.ctrl.b,
            }
          : part.ctrl,
    })),
    ground: state.doc.ground === node ? to : state.doc.ground,
    terminals: {
      a: state.doc.terminals.a === node ? to : state.doc.terminals.a,
      b: state.doc.terminals.b === node ? to : state.doc.terminals.b,
    },
  };
  return commit(state, doc, 'Déplacer un nœud');
}

/** Pivote un dipôle autour de sa borne A (horizontal ↔ vertical). */
export function rotatePart(state: EditorState, id: string): EditorState {
  const doc: CircuitDoc = {
    ...state.doc,
    components: state.doc.components.map((part) => {
      if (part.id !== id) return part;
      const a = parseCell(part.a);
      const b = parseCell(part.b);
      if (!a || !b) return part;
      const vertical = a.x === b.x;
      const span = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
      return {
        ...part,
        b: vertical ? cellKey(a.x + span, a.y) : cellKey(a.x, a.y + span),
      };
    }),
  };
  return commit(state, doc, 'Pivoter');
}

/** Inverse les deux bornes du dipôle (polarité des sources, sens des mesures). */
export function flipPart(state: EditorState, id: string): EditorState {
  const doc: CircuitDoc = {
    ...state.doc,
    components: state.doc.components.map((part) => (part.id === id ? { ...part, a: part.b, b: part.a } : part)),
  };
  return commit(state, doc, 'Inverser les bornes');
}

export function updatePart(state: EditorState, id: string, patch: Partial<Component>, label = 'Modifier'): EditorState {
  const doc: CircuitDoc = {
    ...state.doc,
    components: state.doc.components.map((part) => (part.id === id ? { ...part, ...patch } : part)),
  };
  return commit(state, doc, label);
}

export function removePart(state: EditorState, id: string): EditorState {
  const doc: CircuitDoc = { ...state.doc, components: state.doc.components.filter((part) => part.id !== id) };
  return { ...commit(state, doc, 'Supprimer'), selectedId: state.selectedId === id ? null : state.selectedId };
}

export function duplicatePart(state: EditorState, id: string): EditorState {
  const part = state.doc.components.find((item) => item.id === id);
  if (!part) return state;
  const a = parseCell(part.a);
  const b = parseCell(part.b);
  if (!a || !b) return state;
  const { a: na, b: nb } = { a: { x: a.x, y: a.y + 2 }, b: { x: b.x, y: b.y + 2 } };
  const copy: Component = {
    ...part,
    id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    a: cellKey(na.x, na.y),
    b: cellKey(nb.x, nb.y),
    ctrl: undefined,
    label: nextLabel(state.doc, part.kind),
  };
  const doc: CircuitDoc = { ...state.doc, components: [...state.doc.components, copy] };
  return { ...commit(state, doc, 'Dupliquer'), selectedId: copy.id };
}

export function setGround(state: EditorState, node: string): EditorState {
  return commit(state, { ...state.doc, ground: node }, 'Changer la masse');
}

export function setTerminal(state: EditorState, which: 'a' | 'b', node: string): EditorState {
  return commit(
    state,
    { ...state.doc, terminals: { ...state.doc.terminals, [which]: node } },
    `Borne ${which.toUpperCase()}`,
  );
}

/** Fusionne deux nœuds : tout ce qui touchait `from` touche désormais `to`. */
export function mergeNodes(state: EditorState, from: string, to: string): EditorState {
  if (!from || !to || from === to) return state;
  const doc: CircuitDoc = {
    ...state.doc,
    components: state.doc.components.map((part) => ({
      ...part,
      a: part.a === from ? to : part.a,
      b: part.b === from ? to : part.b,
      ctrl:
        part.ctrl && (part.ctrl.a === from || part.ctrl.b === from)
          ? { a: part.ctrl.a === from ? to : part.ctrl.a, b: part.ctrl.b === from ? to : part.ctrl.b }
          : part.ctrl,
    })),
    ground: state.doc.ground === from ? to : state.doc.ground,
    terminals: {
      a: state.doc.terminals.a === from ? to : state.doc.terminals.a,
      b: state.doc.terminals.b === from ? to : state.doc.terminals.b,
    },
  };
  // les fils devenus nuls disparaissent
  const cleaned: CircuitDoc = { ...doc, components: doc.components.filter((part) => !(part.kind === 'wire' && part.a === part.b)) };
  return commit(state, cleaned, 'Fusionner les nœuds');
}

export function setRegime(state: EditorState, regime: 'dc' | 'ac', frequency?: number): EditorState {
  return commit(
    state,
    { ...state.doc, regime, frequency: frequency ?? state.doc.frequency ?? 50 },
    regime === 'ac' ? 'Régime alternatif' : 'Régime continu',
  );
}

export function renameDoc(state: EditorState, name: string): EditorState {
  return { ...live(state, { ...state.doc, name }), dirty: true };
}

/** Vide le montage en conservant le nom et le régime. */
export function clearDoc(state: EditorState): EditorState {
  return replaceDoc(
    state,
    {
      ...state.doc,
      components: [],
      ground: '',
      terminals: { a: null, b: null },
    },
    'Vider le montage',
  );
}

/* ------------------------------------------------------------------ */
/* diagnostics                                                         */
/* ------------------------------------------------------------------ */

export type IssueLevel = 'error' | 'warning' | 'info';

export interface Issue {
  level: IssueLevel;
  message: string;
  /** identifiant du dipôle ou du nœud concerné */
  target?: string;
  /** conseil d'action immédiat */
  hint?: string;
}

/**
 * Contrôle de cohérence avant calcul. Chaque message est rédigé pour être
 * compréhensible sans être ingénieur : c'est le principal retour d'erreur de
 * l'atelier.
 */
export function diagnose(doc: CircuitDoc): Issue[] {
  const issues: Issue[] = [];
  const parts = doc.components.filter((part) => part.kind !== 'wire');
  const wires = doc.components.filter((part) => part.kind === 'wire');

  if (doc.components.length === 0) {
    issues.push({
      level: 'info',
      message: 'Le plan est vide.',
      hint: 'Cliquez sur un dipôle dans la palette, puis sur le plan pour le poser.',
    });
    return issues;
  }

  if (parts.length === 0) {
    issues.push({ level: 'warning', message: 'Il n’y a que des fils : aucun dipôle à calculer.' });
  }

  const hasSource = parts.some((part) => part.kind === 'vsource' || part.kind === 'isource');
  if (!hasSource) {
    issues.push({
      level: 'warning',
      message: 'Aucune source dans le montage.',
      hint: 'Ajoutez une source de tension (E) ou de courant (I) pour alimenter le circuit.',
    });
  }

  if (!doc.ground) {
    issues.push({
      level: 'error',
      message: 'La masse n’est pas définie.',
      hint: 'Choisissez l’outil « Masse » puis cliquez sur un nœud.',
    });
  } else if (!nodesOf(doc).includes(doc.ground)) {
    issues.push({
      level: 'error',
      message: 'La masse pointe sur un nœud qui n’existe plus.',
      hint: 'Recliquez sur un nœud avec l’outil « Masse ».',
    });
  }

  const degrees = degreeMap(doc);
  for (const part of parts) {
    for (const end of [part.a, part.b]) {
      const degree = degrees.get(end) ?? 0;
      if (degree <= 1) {
        issues.push({
          level: 'warning',
          message: `${part.label ?? part.kind} a une borne isolée (${end}).`,
          target: part.id,
          hint: 'Reliez-la avec l’outil « Fil » ou en déplaçant la pièce sur un autre nœud.',
        });
      }
    }
  }

  // court-circuit franc entre les bornes d'une source idéale de tension
  for (const part of parts) {
    if (part.kind !== 'vsource') continue;
    if (part.a === part.b) {
      issues.push({ level: 'error', message: 'Une source de tension a ses deux bornes sur le même nœud.', target: part.id });
    }
  }

  // boucle de fils seuls (masse reliée à elle-même par des fils) : bénin mais
  // symptomatique d'un montage mal fermé
  if (wires.length > 0 && parts.length > 0) {
    const used = new Set<string>();
    for (const wire of wires) {
      used.add(wire.a);
      used.add(wire.b);
    }
    if (used.size === 1) issues.push({ level: 'info', message: 'Tous les fils partent du même nœud.' });
  }

  if (!doc.terminals.a || !doc.terminals.b) {
    if (doc.terminals.a === doc.terminals.b && doc.terminals.a) {
      issues.push({ level: 'warning', message: 'Les bornes A et B sont confondues.' });
    } else {
      issues.push({
        level: 'info',
        message: 'Les bornes de sortie A et B ne sont pas définies.',
        hint: 'Sans elles, la résistance équivalente n’a pas de point de mesure.',
      });
    }
  }

  if (issues.length === 0) {
    issues.push({ level: 'info', message: 'Montage cohérent : le calcul est disponible.' });
  }
  return issues;
}

/** Résumé court pour la barre d'état. */
export function docSummary(doc: CircuitDoc): string {
  const parts = doc.components.filter((part) => part.kind !== 'wire').length;
  const wires = doc.components.length - parts;
  return `${parts} dipôle${parts > 1 ? 's' : ''} · ${wires} fil${wires > 1 ? 's' : ''} · ${nodesOf(doc).length} nœuds`;
}

/* ------------------------------------------------------------------ */
/* clavier                                                             */
/* ------------------------------------------------------------------ */

/** Raccourci clavier → action, appliqué par la coquille React. */
export type ShortcutAction =
  | { type: 'select' }
  | { type: 'place'; kind: ComponentKind }
  | { type: 'wire' }
  | { type: 'erase' }
  | { type: 'ground' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'delete' }
  | { type: 'duplicate' }
  | { type: 'rotate' }
  | { type: 'flip' }
  | { type: 'escape' }
  | { type: 'solve' }
  | { type: 'save' };

const KEY_KINDS: Record<string, ComponentKind> = {
  r: 'resistor',
  c: 'capacitor',
  l: 'inductor',
  e: 'vsource',
  i: 'isource',
  k: 'switch',
  a: 'ammeter',
  g: 'voltmeter',
  p: 'potentiometer',
  h: 'lamp',
};

export function shortcutFor(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
}): ShortcutAction | null {
  const key = event.key.toLowerCase();
  const meta = Boolean(event.ctrlKey || event.metaKey);
  if (meta && key === 'z') return event.shiftKey ? { type: 'redo' } : { type: 'undo' };
  if (meta && key === 'y') return { type: 'redo' };
  if (meta && key === 'd') return { type: 'duplicate' };
  if (meta && key === 's') return { type: 'save' };
  if (meta && key === 'enter') return { type: 'solve' };
  if (key === 'escape') return { type: 'escape' };
  if (key === 'delete' || key === 'backspace') return { type: 'delete' };
  if (key === 'enter') return { type: 'solve' };
  // `r` pose une résistance (usage le plus fréquent) ; la rotation est sur
  // `t` (tourner) et sur Maj+R
  if (key === 't' || (key === 'r' && event.shiftKey)) return { type: 'rotate' };
  if (key === 'm') return { type: 'ground' };
  if (key === 'x') return { type: 'flip' };
  if (key === 'v') return { type: 'select' };
  if (key === 'w') return { type: 'wire' };
  if (key === 'suppr') return { type: 'erase' };
  const kind = KEY_KINDS[key];
  if (kind) return { type: 'place', kind };
  return null;
}

/* ------------------------------------------------------------------ */
/* export                                                              */
/* ------------------------------------------------------------------ */

export function toJson(state: EditorState): string {
  return JSON.stringify(state.doc, null, 2);
}

export function fromJson(text: string): CircuitDoc | null {
  try {
    const parsed = JSON.parse(text) as CircuitDoc;
    if (!parsed || !Array.isArray(parsed.components)) return null;
    return parsed;
  } catch {
    return null;
  }
}
