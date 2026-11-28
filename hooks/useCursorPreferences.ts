'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Réglages d'affichage des curseurs distants.
 *
 * L'atelier se partage à deux ou trois : certains veulent tout voir (fenêtre du
 * pair, sillage, étiquette), d'autres trouvent cela bavard sur un montage serré.
 * Ces réglages sont donc explicites, persistés dans le navigateur et partagés
 * entre le plan, les pilules de présence et le bouton de réglage.
 */

export type CursorStyle = 'pointer' | 'dot' | 'halo';

export interface CursorPreferences {
  style: CursorStyle;
  /** traînée du curseur (les dernières positions) */
  trails: boolean;
  /** cadre de la fenêtre visible de chaque pair */
  viewports: boolean;
  /** étiquette nom + outil */
  labels: boolean;
  /** pastilles micro / caméra sur chaque curseur */
  call: boolean;
  /** 0.8 → 1.4 */
  scale: number;
}

export const CURSOR_DEFAULTS: CursorPreferences = {
  style: 'pointer',
  trails: true,
  viewports: true,
  labels: true,
  call: true,
  scale: 1,
};

const STORAGE_KEY = 'northev.cursors.v1';

let state: CursorPreferences = CURSOR_DEFAULTS;
let hydrated = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function read(): void {
  if (hydrated || typeof window === 'undefined') return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<CursorPreferences>;
    const style = parsed.style;
    state = {
      style: style === 'dot' || style === 'halo' || style === 'pointer' ? style : state.style,
      trails: typeof parsed.trails === 'boolean' ? parsed.trails : state.trails,
      viewports: typeof parsed.viewports === 'boolean' ? parsed.viewports : state.viewports,
      labels: typeof parsed.labels === 'boolean' ? parsed.labels : state.labels,
      call: typeof parsed.call === 'boolean' ? parsed.call : state.call,
      scale:
        typeof parsed.scale === 'number' && parsed.scale >= 0.8 && parsed.scale <= 1.4
          ? parsed.scale
          : state.scale,
    };
    emit();
  } catch {
    /* réglage illisible : on garde les valeurs par défaut */
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function updateCursorPreferences(patch: Partial<CursorPreferences>): void {
  state = { ...state, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* navigation privée : le réglage reste valable pour la session */
  }
  emit();
}

export function resetCursorPreferences(): void {
  updateCursorPreferences(CURSOR_DEFAULTS);
}

export function cursorPreferencesSnapshot(): CursorPreferences {
  return state;
}

export function useCursorPreferences(): {
  prefs: CursorPreferences;
  update: (patch: Partial<CursorPreferences>) => void;
  reset: () => void;
} {
  read();
  const prefs = useSyncExternalStore(
    subscribe,
    cursorPreferencesSnapshot,
    () => CURSOR_DEFAULTS,
  );
  const update = useCallback((patch: Partial<CursorPreferences>) => updateCursorPreferences(patch), []);
  const reset = useCallback(() => resetCursorPreferences(), []);
  return { prefs, update, reset };
}
