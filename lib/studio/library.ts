'use client';

import { CircuitDoc } from '@/lib/engine/types';
import { sanitizeDoc } from './doc';

export interface LibraryEntry {
  id: string;
  name: string;
  doc: CircuitDoc;
  savedAt: string;
  starred?: boolean;
}

const KEY = 'northev.library.v1';
const WORKSPACE_KEY = 'northev.workspace.v1';

export function loadLibrary(): LibraryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveToLibrary(doc: CircuitDoc, name?: string): LibraryEntry {
  const entry: LibraryEntry = {
    id: `lib_${Math.random().toString(36).slice(2, 9)}`,
    name: name ?? doc.name,
    doc: { ...doc, name: name ?? doc.name },
    savedAt: new Date().toISOString(),
  };
  const library = [entry, ...loadLibrary().filter((item) => item.name !== entry.name)].slice(0, 40);
  persist(library);
  return entry;
}

export function removeFromLibrary(id: string) {
  persist(loadLibrary().filter((item) => item.id !== id));
}

function persist(library: LibraryEntry[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(library));
  } catch {
    // quota dépassé : on ignore silencieusement
  }
}

/** Sauvegarde locale du brouillon courant (résilience rechargement) */
export function saveWorkspace(doc: CircuitDoc) {
  try {
    window.localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({ doc, at: new Date().toISOString() }),
    );
  } catch {
    /* ignore */
  }
}

export function loadWorkspace(): CircuitDoc | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { doc: CircuitDoc };
    return parsed.doc ? sanitizeDoc(parsed.doc) : null;
  } catch {
    return null;
  }
}

export function clearWorkspace() {
  try {
    window.localStorage.removeItem(WORKSPACE_KEY);
  } catch {
    /* ignore */
  }
}
