'use client';

import { useMemo } from 'react';
import { CircuitDoc } from '@/lib/engine/types';
import { equivalentOf } from '@/lib/engine/equivalent';
import { solveDocument } from '@/lib/engine/solver';
import { documentSignature } from '@/lib/engine/signature';

/**
 * Résolution synchrone du montage côté client : les circuits restent petits,
 * et le moteur est déterministe (mêmes entrées → mêmes sorties).
 *
 * La résolution est mémorisée sur l'**empreinte électrique** du document et non
 * sur son identité : renommer le montage, sélectionner une pièce ou recevoir un
 * curseur ne relance plus la matrice MNA. Sur un montage de trente dipôles,
 * c'était le principal grain de sable.
 */
export function useCircuitEngine(doc: CircuitDoc) {
  const signature = useMemo(() => documentSignature(doc), [doc]);

  return useMemo(() => {
    const equivalent = equivalentOf(doc);
    const solution = solveDocument(doc, { sourcesOn: true });
    return { equivalent, solution };
    // `doc` est volontairement absent : la signature suffit, et elle change
    // dès qu'une grandeur utile bouge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
}
