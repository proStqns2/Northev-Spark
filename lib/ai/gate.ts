/**
 * Porte d'entrée de l'assistant IA — séparée du compte et du studio.
 *
 * Principe : **créer un compte, se connecter, dessiner un montage et calculer
 * ne dépendent jamais de l'IA**. L'assistant est une zone à part, avec :
 *
 *  1. un interrupteur serveur (`AI_ASSISTANT_ENABLED`) ;
 *  2. un consentement explicite et révocable par utilisateur (`prefs.ai`) ;
 *  3. des quotas propres et un message d'erreur qui renvoie vers /assistant.
 *
 * Sans clé fournisseur, l'application reste complète : le solveur, l'académie,
 * le laboratoire et les exercices sont entièrement locaux.
 */

import { findUserById } from '@/lib/db/repo';
import type { StoredUser } from '@/lib/db/store';
import { providerStatus } from './providers';
import { geminiStatus } from './gemini';

export interface AiStatus {
  /** l'assistant est-il authorisé côté serveur ? */
  enabled: boolean;
  /** au moins un fournisseur a-t-il une clé utilisable ? */
  configured: boolean;
  /** l'utilisateur a-t-il donné son accord ? */
  consented: boolean;
  /** le client peut-il envoyer une requête maintenant ? */
  ready: boolean;
  providers: { openai: boolean; gemini: boolean; openrouter: boolean };
  model?: string;
  reason?: string;
}

const OFF_MESSAGE =
  'L’assistant IA est désactivé sur ce serveur. Le studio, l’académie et le laboratoire fonctionnent sans lui.';

/** Interrupteur serveur : explicite (`on`) ou implicite si une clé existe. */
export function aiServerEnabled(): boolean {
  const flag = (process.env.AI_ASSISTANT_ENABLED ?? '').toLowerCase();
  if (flag === 'off' || flag === '0' || flag === 'false') return false;
  if (flag === 'on' || flag === '1' || flag === 'true') return true;
  const providers = providerStatus();
  return Boolean(providers.openai || providers.gemini || providers.openrouter);
}

export function aiStatusForUser(user: StoredUser | null): AiStatus {
  const providers = providerStatus();
  const configured = Boolean(providers.openai || providers.gemini || providers.openrouter);
  const enabled = aiServerEnabled();
  const consented = Boolean(user?.prefs?.ai);
  const gemini = geminiStatus();
  const model = 'model' in gemini ? gemini.model : undefined;
  const base: AiStatus = { enabled, configured, consented, ready: enabled && configured && consented, providers, model };
  if (!enabled) return { ...base, reason: OFF_MESSAGE };
  if (!configured) {
    return {
      ...base,
      reason:
        'Aucune clé de fournisseur n’est configurée (ni côté serveur, ni dans votre compte). L’assistant reste donc en veille : tout le reste du site fonctionne.',
    };
  }
  if (user && !consented) {
    return {
      ...base,
      reason:
        'Vous n’avez pas encore activé l’assistant. Il est désactivé par défaut : activez-le depuis /assistant si vous le souhaitez.',
    };
  }
  return base;
}

export async function aiStatusForId(userId: string | null): Promise<AiStatus> {
  if (!userId) return aiStatusForUser(null);
  const user = await findUserById(userId);
  return aiStatusForUser(user ?? null);
}

export interface AiGateResult {
  ok: boolean;
  status: AiStatus;
}

/**
 * Vérifie qu'un appel IA est autorisé. Le refus est explicite (code + lien),
 * pour que l'interface puisse proposer l'activation au lieu d'échouer.
 */
export async function gateAi(userId: string | null): Promise<AiGateResult> {
  const status = await aiStatusForId(userId);
  return { ok: status.ready, status };
}

/** Message prêt à afficher quand la porte est fermée. */
export function gateMessage(status: AiStatus): string {
  if (!status.enabled) return OFF_MESSAGE;
  if (!status.configured) {
    return 'Assistant indisponible : aucune clé fournisseur configurée. Ajoutez une clé dans /compte ou activez-la côté serveur.';
  }
  if (!status.consented) return 'Activez d’abord l’assistant dans /assistant (il est désactivé par défaut).';
  return 'Assistant indisponible.';
}
