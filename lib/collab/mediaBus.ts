'use client';

/**
 * Petit bus d'événements pour l'état « en train de parler ».
 *
 * La visio vit dans `useMediaCall` (côté salle), mais les pilules de présence et
 * les curseurs sont dessinés très bas dans le plan (`CircuitCanvas`). Plutôt que
 * de faire traverser cinq composants à un booléen qui change plusieurs fois par
 * seconde, on publie ici et les composants intéressés s'abonnent.
 */

const listeners = new Set<(speaking: Record<string, boolean>) => void>();
let current: Record<string, boolean> = {};

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(current);
    } catch {
      /* un abonné fautif ne doit pas couper le bus */
    }
  }
}

export function publishSpeaking(id: string, speaking: boolean): void {
  if (!id) return;
  if (Boolean(current[id]) === speaking) return;
  current = { ...current, [id]: speaking };
  emit();
}

export function clearSpeaking(): void {
  if (!Object.keys(current).length) return;
  current = {};
  emit();
}

export function speakingSnapshot(): Record<string, boolean> {
  return current;
}

export function subscribeSpeaking(
  listener: (speaking: Record<string, boolean>) => void,
): () => void {
  listeners.add(listener);
  listener(current);
  return () => {
    listeners.delete(listener);
  };
}
