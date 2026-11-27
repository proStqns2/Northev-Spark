import type { CircuitDoc } from './types';

/**
 * Empreinte « électrique » d'un montage.
 *
 * Le studio recalculait tout à chaque changement d'objet dans React : renommer
 * le montage, déplacer le curseur de sélection ou recevoir un message du chat
 * suffisait à relancer une résolution complète (O(n³) sur la matrice MNA).
 * C'était l'une des causes du lag ressenti.
 *
 * Cette empreinte ne retient que ce qui **change le résultat** : topologie
 * (bornes a/b, commandes), type, valeur, interrupteur, masse, bornes, régime,
 * fréquence. Le nom, les notes et les identifiants de pièces en sont exclus.
 */
export function documentSignature(doc: CircuitDoc): string {
  const parts = doc.components
    .map((part) => {
      const ctrl = part.ctrl ? `${part.ctrl.a}>${part.ctrl.b}` : '-';
      return [
        part.kind,
        part.a,
        part.b,
        ctrl,
        part.value,
        part.closed === false ? 'o' : 'c',
      ].join('|');
    })
    // l'ordre du tableau n'a aucune influence sur le système linéaire
    .sort()
    .join(';');

  return [
    doc.regime,
    doc.frequency,
    doc.ground,
    doc.terminals.a ?? '-',
    doc.terminals.b ?? '-',
    parts,
  ].join('#');
}
