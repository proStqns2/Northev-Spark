'use client';

import { useSyncExternalStore } from 'react';
import { speakingSnapshot, subscribeSpeaking } from '@/lib/collab/mediaBus';

/**
 * Qui parle en ce moment (visio d'atelier), lu depuis le bus média.
 * Les composants du plan s'y abonnent pour dessiner un anneau sur le curseur
 * et sur la pilule du participant, sans faire descendre l'état de la salle.
 */
const EMPTY: Record<string, boolean> = {};

export function useSpeaking(): Record<string, boolean> {
  return useSyncExternalStore(subscribeSpeaking, speakingSnapshot, () => EMPTY);
}
