import type { CircuitDoc } from '@/lib/engine/types';

/**
 * Canal de collaboration multi-onglets (BroadcastChannel).
 *
 * Synchronise le montage entre les onglets d'un même navigateur, sans
 * serveur ni clé : idéal pour tester le mode Multiworks immédiatement.
 * La collaboration entre appareils différents passe par le serveur
 * (SSE/WebSocket, voir hooks/useCollaboration).
 *
 * Messages :
 *   doc      — le montage complet a changé dans un autre onglet
 *   lock     — un composant est en cours d'édition (verrou souple)
 *   activity — journal d'activité (« Ryad a ajouté R1 »)
 *   cursor   — position du curseur d'un autre onglet
 */

export interface LockInfo {
  componentId: string;
  userId: string;
  userName: string;
  color: string;
}

export interface ActivityEntry {
  id: string;
  userName: string;
  text: string;
  at: string;
}

export type CollabMessage =
  | { kind: 'doc'; doc: CircuitDoc; sender: string }
  | { kind: 'lock'; lock: LockInfo | null; sender: string }
  | { kind: 'activity'; entry: ActivityEntry; sender: string }
  | { kind: 'cursor'; x: number; y: number; sender: string; name: string; color: string }
  | { kind: 'bye'; sender: string };

const CHANNEL_NAME = 'northev-collab';

export function openChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return null;
  try {
    return new BroadcastChannel(CHANNEL_NAME);
  } catch {
    return null;
  }
}

export function postMessage(channel: BroadcastChannel | null, message: CollabMessage): void {
  if (!channel) return;
  try {
    channel.postMessage(message);
  } catch {
    /* canal fermé */
  }
}
