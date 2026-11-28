/**
 * Coffre à clés API utilisateur.
 *
 * Les clés sont chiffrées en AES-256-GCM avec une clé dérivée d'un secret
 * serveur (`SECRET_KEY`, ou à défaut `SUPABASE_SERVICE_ROLE_KEY`).
 * Le clair n'est jamais renvoyé par une API : seule une empreinte
 * (`sk-…4f2a`) est affichée pour que l'utilisateur reconnaisse sa clé.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

function masterKey(): Buffer | null {
  const secret = process.env.SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (secret.length < 16) return null;
  return createHash('sha256').update(`northev-vault:${secret}`).digest();
}

export function vaultAvailable(): boolean {
  return masterKey() !== null;
}

/** chiffre une clé ; renvoie `null` si aucun secret serveur n'est configuré */
export function sealSecret(plain: string): string | null {
  const key = masterKey();
  if (!key) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

export function openSecret(sealed: string | undefined): string | null {
  if (!sealed) return null;
  const key = masterKey();
  if (!key) return null;
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const iv = Buffer.from(parts[1], 'base64url');
    const encrypted = Buffer.from(parts[2], 'base64url');
    const tag = Buffer.from(parts[3], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** empreinte affichable : `AIza…8A` — ne révèle pas la clé */
export function fingerprint(plain: string): string {
  if (plain.length <= 10) return '••••';
  return `${plain.slice(0, 4)}…${plain.slice(-4)}`;
}

/** comparaison à temps constant d'un candidat avec l'empreinte enregistrée */
export function matchesFingerprint(plain: string, stored: string): boolean {
  const a = Buffer.from(fingerprint(plain));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** validateurs de format (refus précoce des clés manifestement fausses) */
export const KEY_FORMAT: Record<'gemini' | 'openai', RegExp> = {
  gemini: /^(AIza[0-9A-Za-z_\-]{30,60}|AQ\.[0-9A-Za-z_\-]{20,})$/,
  openai: /^sk-[0-9A-Za-z_\-]{20,}$/,
};
