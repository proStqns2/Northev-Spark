import { CircuitDoc } from '@/lib/engine/types';
import { EquivalentResult, equivalentOf } from '@/lib/engine/equivalent';
import { solveDocument } from '@/lib/engine/solver';

/**
 * Cache de résolution (process) : les documents de circuits sont de petite
 * taille, la clé est leur JSON normalisé. 400 entrées suffisent largement
 * pour une session de travail et évitent de recalculer à chaque rendu.
 */
const MAX = 400;
const equivalents = new Map<string, EquivalentResult>();
const solutions = new Map<string, ReturnType<typeof solveDocument>>();

const keyOf = (doc: CircuitDoc): string => {
  const { name, notes, id, ...rest } = doc;
  void name;
  void notes;
  void id;
  return JSON.stringify(rest);
};

function remember<T>(map: Map<string, T>, key: string, value: T): T {
  if (map.size >= MAX) {
    const first = map.keys().next().value;
    if (first !== undefined) map.delete(first);
  }
  map.set(key, value);
  return value;
}

export function cachedEquivalent(doc: CircuitDoc): EquivalentResult {
  const key = keyOf(doc);
  const hit = equivalents.get(key);
  if (hit) return hit;
  return remember(equivalents, key, equivalentOf(doc));
}

export function cachedSolve(doc: CircuitDoc) {
  const key = keyOf(doc);
  const hit = solutions.get(key);
  if (hit) return hit;
  return remember(solutions, key, solveDocument(doc, { sourcesOn: true }));
}
