/**
 * Identifiants d'emblèmes — liste pure, sans JSX.
 *
 * Séparée du composant pour que les tests (exécutés par Node, sans rendu
 * React) puissent vérifier que chaque agent possède un emblème distinct.
 */

export const EMBLEM_IDS = [
  'theo',
  'nora',
  'convert',
  'impeda',
  'coils',
  'sources',
  'lab',
  'hub',
  'dipoles',
  'volt',
  'mentor',
] as const;

export type EmblemId = (typeof EMBLEM_IDS)[number];

export function hasEmblem(id: string): id is EmblemId {
  return (EMBLEM_IDS as readonly string[]).includes(id);
}
