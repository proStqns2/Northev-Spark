import { Component, ComponentKind } from '@/lib/engine/types';

export const GRID = 24;
export const PADDING = 72;
export const DEFAULT_COLS = 26;
export const DEFAULT_ROWS = 16;

export interface Point {
  x: number;
  y: number;
}

export const cellToPoint = (cell: string): Point | null => {
  const [x, y] = cell.split(',').map(Number);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return { x, y };
};

export const pointToCell = (x: number, y: number): string => `${Math.round(x)},${Math.round(y)}`;

export const stepToPx = (step: number) => ({ x: step * GRID, y: step * GRID });

/** Orientation d'un dipôle sur la grille */
export type Orientation = 'h' | 'v' | 'd';

export function orientationOf(c: Pick<Component, 'a' | 'b'>): Orientation {
  const a = cellToPoint(c.a);
  const b = cellToPoint(c.b);
  if (!a || !b) return 'h';
  if (a.y === b.y) return 'h';
  if (a.x === b.x) return 'v';
  return 'd';
}

/** Ordre des bornes pour un tracé stable (gauche→droite, haut→bas) */
export function orderedEnds(c: Pick<Component, 'a' | 'b'>): [Point, Point] {
  const a = cellToPoint(c.a) ?? { x: 0, y: 0 };
  const b = cellToPoint(c.b) ?? { x: 0, y: 0 };
  if (a.x < b.x || (a.x === b.x && a.y <= b.y)) return [a, b];
  return [b, a];
}

/** Longueur électrique d'une branche en cellules */
export function spanOf(c: Pick<Component, 'a' | 'b'>): number {
  const [a, b] = orderedEnds(c);
  return Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
}

export function withSpan(c: Pick<Component, 'a' | 'b'>, span: number): Pick<Component, 'a' | 'b'> {
  const [a] = orderedEnds(c);
  const [b0] = orderedEnds(c);
  const orientation = orientationOf(c);
  const other = cellToPoint(orientation === 'v' ? c.b : c.b)!;
  const end = orientation === 'v' ? { x: a.x, y: a.y + span } : { x: a.x + span, y: a.y };
  void b0;
  void other;
  return { a: pointToCell(a.x, a.y), b: pointToCell(end.x, end.y) };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cols: number;
  rows: number;
}

export function circuitBounds(components: Component[]) {
  let minX = 0;
  let minY = 0;
  let maxX = DEFAULT_COLS;
  let maxY = DEFAULT_ROWS;
  for (const c of components) {
    for (const cell of [c.a, c.b]) {
      const p = cellToPoint(cell);
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
  }
  return { minX: minX - 2, minY: minY - 2, maxX: maxX + 3, maxY: maxY + 3 };
}

/** Segments électriques : une branche (a,b) est un segment droit unique */
export function segmentOf(c: Pick<Component, 'a' | 'b'>): [Point, Point] {
  return orderedEnds(c);
}

export const KIND_EXTENT: Record<ComponentKind, number> = {
  vsource: 3,
  isource: 3,
  vcvs: 3,
  vccs: 3,
  resistor: 3,
  capacitor: 2,
  inductor: 3,
  lamp: 3,
  potentiometer: 3,
  wire: 1,
  switch: 2,
  ammeter: 2,
  voltmeter: 2,
};

/** Longueur minimale (en cellules) pour dessiner un symbole lisible */
export const minSpan = (kind: ComponentKind): number => KIND_EXTENT[kind] ?? 2;
