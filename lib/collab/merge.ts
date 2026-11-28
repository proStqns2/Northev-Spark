/**
 * Fusion collaborative de montages — le cœur du Multiwork.
 *
 * Jusqu'ici, un atelier acceptait un `PATCH` avec le document complet : le
 * dernier qui écrivait écrasait le travail des autres. Deux personnes qui
 * déplaçaient chacune une résistance perdaient une des deux actions.
 *
 * Ce module fait une **fusion à trois branches** : base (ce que le client
 * croyait), mien (ce qu'il envoie), leur (ce que le serveur a déjà). Chaque
 * dipôle est comparé séparément, champ par champ pour les propriétés du
 * document. Résultat : les modifications indépendantes se cumulent, et seules
 * les vraies collisions sont signalées à l'interface.
 *
 * Le module est **pur** : aucun accès réseau, aucune horloge murale, aucune
 * dépendance à Next.js. Il est donc testable et peut tourner côté client.
 */

import type { CircuitDoc, Component } from '@/lib/engine/types';

export interface MergeStats {
  /** dipôles ajoutés par la fusion */
  added: number;
  /** dipôles supprimés par la fusion */
  removed: number;
  /** dipôles dont une propriété a été conservée depuis « mien » */
  updated: number;
  /** propriétés du document (nom, masse, bornes…) reprises depuis « mien » */
  docFields: number;
}

export interface MergeConflict {
  scope: 'component' | 'doc';
  /** identifiant du dipôle concerné, absent pour un champ de document */
  componentId?: string;
  /** libellé lisible : « R1 », « masse »… */
  label: string;
  field: string;
  mine: string;
  theirs: string;
  /** qui a été retenu */
  kept: 'mine' | 'theirs';
}

export interface MergeResult {
  doc: CircuitDoc;
  stats: MergeStats;
  conflicts: MergeConflict[];
  /** vrai si la fusion diffère du document serveur (donc s'il faut diffuser) */
  changed: boolean;
}

const DOC_FIELDS = ['name', 'notes', 'ground', 'terminals', 'regime', 'frequency'] as const;
type DocField = (typeof DOC_FIELDS)[number];

const stable = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
};

const sameComponent = (a: Component | undefined, b: Component | undefined): boolean => {
  if (!a || !b) return a === b;
  return stable(a) === stable(b);
};

const byId = (doc: CircuitDoc | null): Map<string, Component> => {
  const map = new Map<string, Component>();
  for (const part of doc?.components ?? []) map.set(part.id, part);
  return map;
};

const emptyDoc = (): CircuitDoc => ({
  name: 'Montage',
  notes: '',
  components: [],
  ground: '',
  terminals: { a: null, b: null },
  regime: 'dc',
  frequency: 50,
});

/** Détail lisible d’une divergence, pour l’afficher dans l’atelier. */
function describeComponent(part: Component): string {
  const bits = [`${part.kind}`, `${part.a}→${part.b}`];
  if (Number.isFinite(part.value)) bits.push(`${part.value}`);
  if (part.label) bits.unshift(part.label);
  return bits.join(' · ');
}

/**
 * Fusion à trois branches.
 *
 * `base` peut être `null` (base oubliée, hors de la frise, ou premier client
 * ancien format) : dans ce cas on fait une **union** — les ajouts du client
 * sont conservés, rien n'est supprimé, puisque sans base on ne peut pas
 * attribuer une suppression à un camp plutôt qu'à l'autre.
 */
export function mergeDocs(input: {
  base: CircuitDoc | null;
  mine: CircuitDoc;
  theirs: CircuitDoc;
  /** nom de l’auteur, seulement pour les messages de conflit */
  actor?: string;
}): MergeResult {
  const base = input.base ? sanitizeDoc(input.base) : null;
  const mine = sanitizeDoc(input.mine);
  const theirs = sanitizeDoc(input.theirs);
  const stats: MergeStats = { added: 0, removed: 0, updated: 0, docFields: 0 };
  const conflicts: MergeConflict[] = [];

  const baseParts = byId(base);
  const mineParts = byId(mine);
  const theirParts = byId(theirs);

  const merged: Component[] = [];
  const seen = new Set<string>();

  // 1. on parcourt le document serveur : c'est lui qui fixe l'ordre des pièces
  for (const part of theirs.components) {
    const id = part.id;
    seen.add(id);
    const fromMine = mineParts.get(id);
    const fromBase = baseParts.get(id);
    const serverChanged = !sameComponent(part, fromBase);
    const clientChanged = !sameComponent(fromMine, fromBase);

    if (!clientChanged) {
      merged.push(part);
      continue;
    }
    if (!serverChanged) {
      // le serveur n'a pas touché ce dipôle : la version du client l'emporte
      if (fromMine) {
        merged.push(fromMine);
        stats.updated += 1;
      } else {
        // suppression demandée par le client
        stats.removed += 1;
      }
      continue;
    }
    if (sameComponent(fromMine, part)) {
      merged.push(part);
      continue;
    }
    if (!fromMine) {
      // le client a supprimé, le serveur a modifié : on garde la pièce et on le dit
      conflicts.push({
        scope: 'component',
        componentId: id,
        label: part.label ?? id,
        field: 'suppression',
        mine: 'supprimé',
        theirs: describeComponent(part),
        kept: 'theirs',
      });
      merged.push(part);
      continue;
    }
    // les deux ont modifié le même dipôle : le serveur l'emporte, l'interface prévient
    conflicts.push({
      scope: 'component',
      componentId: id,
      label: part.label ?? fromMine.label ?? id,
      field: 'dipôle',
      mine: describeComponent(fromMine),
      theirs: describeComponent(part),
      kept: 'theirs',
    });
    merged.push(part);
  }

  // 2. pièces créées par le client : ajoutées à la fin, triées pour converger
  const additions = mine.components
    .filter((part) => !seen.has(part.id))
    .filter((part) => {
      const fromBase = baseParts.get(part.id);
      const fromTheirs = theirParts.get(part.id);
      if (!fromBase || fromTheirs) return true;
      // le serveur a supprimé cette pièce : on ne la ressuscite pas
      if (!sameComponent(part, fromBase)) {
        conflicts.push({
          scope: 'component',
          componentId: part.id,
          label: part.label ?? part.id,
          field: 'suppression',
          mine: describeComponent(part),
          theirs: 'supprimé',
          kept: 'theirs',
        });
      }
      return false;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const part of additions) merged.push(part);
  stats.added = additions.length;

  const components = merged;

  // 4. champs du document, un par un
  const doc: CircuitDoc = { ...theirs, components };
  for (const field of DOC_FIELDS) {
    const pick = pickField(field, base, mine, theirs, conflicts);
    if (pick.fromMine) stats.docFields += 1;
    (doc as unknown as Record<string, unknown>)[field] = pick.value;
  }

  return { doc, stats, conflicts, changed: stable(doc) !== stable(theirs) };
}

function pickField(
  field: DocField,
  base: CircuitDoc | null,
  mine: CircuitDoc,
  theirs: CircuitDoc,
  conflicts: MergeConflict[],
): { value: unknown; fromMine: boolean } {
  const mineValue = mine[field];
  const theirValue = theirs[field];
  if (stable(mineValue) === stable(theirValue)) return { value: theirValue, fromMine: false };
  const baseValue = base ? base[field] : undefined;
  if (stable(mineValue) === stable(baseValue)) return { value: theirValue, fromMine: false };
  if (stable(theirValue) === stable(baseValue)) return { value: mineValue, fromMine: true };
  conflicts.push({
    scope: 'doc',
    label: field,
    field,
    mine: String(stable(mineValue)).slice(0, 60),
    theirs: String(stable(theirValue)).slice(0, 60),
    kept: 'theirs',
  });
  return { value: theirValue, fromMine: false };
}

/* ------------------------------------------------------------------ outils */

/** Normalise un document entrant : bornes, tableaux, champs requis. */
export function sanitizeDoc(doc: CircuitDoc): CircuitDoc {
  const fallback = emptyDoc();
  if (!doc || typeof doc !== 'object') return fallback;
  const components = Array.isArray(doc.components)
    ? doc.components.filter(
        (part): part is Component =>
          Boolean(part) &&
          typeof part.id === 'string' &&
          typeof part.kind === 'string' &&
          typeof part.a === 'string' &&
          typeof part.b === 'string',
      )
    : [];
  return {
    ...fallback,
    ...doc,
    name: typeof doc.name === 'string' && doc.name.trim() ? doc.name.slice(0, 120) : fallback.name,
    notes: typeof doc.notes === 'string' ? doc.notes.slice(0, 4000) : '',
    components,
    ground: typeof doc.ground === 'string' ? doc.ground : '',
    terminals: {
      a: doc.terminals?.a ?? null,
      b: doc.terminals?.b ?? null,
    },
    regime: doc.regime === 'ac' ? 'ac' : 'dc',
    frequency: Number.isFinite(doc.frequency) ? doc.frequency : 50,
  };
}

/** Diff lisible entre deux documents, utilisé par l’historique. */
export function diffDocs(before: CircuitDoc | null, after: CircuitDoc): { added: string[]; removed: string[]; updated: string[] } {
  const a = byId(before);
  const b = byId(after);
  const added: string[] = [];
  const removed: string[] = [];
  const updated: string[] = [];
  for (const [id, part] of b) {
    if (!a.has(id)) added.push(part.label ?? id);
    else if (!sameComponent(a.get(id), part)) updated.push(part.label ?? id);
  }
  for (const [id, part] of a) if (!b.has(id)) removed.push(part.label ?? id);
  return { added, removed, updated };
}
