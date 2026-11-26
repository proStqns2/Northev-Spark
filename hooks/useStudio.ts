'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { CircuitDoc } from '@/lib/engine/types';
import { cloneDoc, moveComponent, rotateComponent, sanitizeDoc, updateComponent } from '@/lib/studio/doc';

interface HistoryState {
  past: CircuitDoc[];
  present: CircuitDoc;
  future: CircuitDoc[];
  dirty: boolean;
}

type Action =
  | { type: 'set'; doc: CircuitDoc; commit?: boolean; reset?: boolean }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved' };

const MAX_HISTORY = 60;

function reducer(state: HistoryState, action: Action): HistoryState {
  switch (action.type) {
    case 'set': {
      if (action.reset) {
        return { past: [], present: action.doc, future: [], dirty: false };
      }
      if (action.commit === false) {
        // modification continue (drag) : pas d'entrée d'historique
        return { ...state, present: action.doc, dirty: true };
      }
      return {
        past: [...state.past.slice(-MAX_HISTORY), state.present],
        present: action.doc,
        future: [],
        dirty: true,
      };
    }
    case 'undo': {
      if (!state.past.length) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future].slice(0, MAX_HISTORY),
        dirty: true,
      };
    }
    case 'redo': {
      if (!state.future.length) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
        dirty: true,
      };
    }
    case 'saved':
      return { ...state, dirty: false };
    default:
      return state;
  }
}

export function useStudio(initial: CircuitDoc) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initial,
    future: [],
    dirty: false,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirtySince = useRef<number | null>(null);

  const setDoc = useCallback((doc: CircuitDoc, options?: { commit?: boolean }) => {
    dispatch({ type: 'set', doc, commit: options?.commit });
  }, []);

  const reset = useCallback((doc: CircuitDoc) => {
    dispatch({ type: 'set', doc, reset: true });
    setSelectedId(null);
  }, []);

  const undo = useCallback(() => dispatch({ type: 'undo' }), []);
  const redo = useCallback(() => dispatch({ type: 'redo' }), []);

  const selected = useMemo(
    () => state.present.components.find((c) => c.id === selectedId) ?? null,
    [state.present.components, selectedId],
  );

  const patchSelected = useCallback((patch: Parameters<typeof updateComponent>[2]) => {
    dispatch({
      type: 'set',
      doc: updateComponent(state.present, selectedId ?? '', patch),
      commit: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.present, selectedId]);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    dispatch({
      type: 'set',
      doc: {
        ...state.present,
        components: state.present.components.filter((c) => c.id !== selectedId),
      },
      commit: true,
    });
    setSelectedId(null);
  }, [state.present, selectedId]);

  const duplicateSelected = useCallback(() => {
    if (!selected) return;
    const copy = {
      ...structuredClone(selected),
      id: `${selected.id}_c${Math.random().toString(36).slice(2, 5)}`,
      label: `${selected.label ?? selected.id} (copie)`,
    };
    const [x, y] = copy.a.split(',').map(Number);
    const [x2, y2] = copy.b.split(',').map(Number);
    copy.a = `${x},${y + 2}`;
    copy.b = `${x2},${y2 + 2}`;
    dispatch({
      type: 'set',
      doc: sanitizeDoc({ ...state.present, components: [...state.present.components, copy] }),
      commit: true,
    });
    setSelectedId(copy.id);
  }, [selected, state.present]);

  const rotateSelected = useCallback(() => {
    if (!selected) return;
    dispatch({
      type: 'set',
      doc: rotateComponent(state.present, selected.id),
      commit: true,
    });
  }, [selected, state.present]);

  const flipSelected = useCallback(() => {
    if (!selected) return;
    dispatch({
      type: 'set',
      doc: updateComponent(state.present, selected.id, { a: selected.b, b: selected.a }),
      commit: true,
    });
  }, [selected, state.present]);

  const nudgeSelected = useCallback(
    (dx: number, dy: number) => {
      if (!selectedId) return;
      dispatch({ type: 'set', doc: moveComponent(state.present, selectedId, dx, dy), commit: true });
    },
    [state.present, selectedId],
  );

  useEffect(() => {
    if (state.dirty && dirtySince.current === null) dirtySince.current = Date.now();
    if (!state.dirty) dirtySince.current = null;
  }, [state.dirty]);

  return {
    doc: state.present,
    setDoc,
    reset,
    selected,
    selectedId,
    setSelectedId,
    patchSelected,
    removeSelected,
    duplicateSelected,
    rotateSelected,
    flipSelected,
    nudgeSelected,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    dirty: state.dirty,
    saving,
    setSaving,
    markSaved: () => dispatch({ type: 'saved' }),
    snapshot: () => cloneDoc(state.present),
  };
}
