'use client';

import { useMemo } from 'react';
import { CircuitDoc } from '@/lib/engine/types';
import { equivalentOf } from '@/lib/engine/equivalent';
import { solveDocument } from '@/lib/engine/solver';

/**
 * Résolution synchrone du montage côté client : les circuits restent petits,
 * et le moteur est déterministe (mêmes entrées → mêmes sorties).
 */
export function useCircuitEngine(doc: CircuitDoc) {
  return useMemo(() => {
    const equivalent = equivalentOf(doc);
    const solution = solveDocument(doc, { sourcesOn: true });
    return { equivalent, solution };
  }, [doc]);
}
