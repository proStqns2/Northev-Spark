import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hachage des mots de passe : scrypt (N=16384, r=8, p=1) — standard recommandé
 * par OWASP pour le stockage en base. Aucun mot de passe en clair n'est conservé.
 */
const KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password.normalize('NFKC'), salt, KEYLEN, SCRYPT_OPTIONS);
  return `scrypt$${salt}$${hash.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, salt, digest] = stored.split('$');
    if (scheme !== 'scrypt' || !salt || !digest) return false;
    const expected = Buffer.from(digest, 'hex');
    const actual = scryptSync(password.normalize('NFKC'), salt, expected.length, SCRYPT_OPTIONS);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Code multiwork à 5 chiffres, sans zéro initial */
export function inviteCode(): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const digits = randomBytes(5);
    let code = '';
    for (let i = 0; i < 5; i++) code += String(digits[i] % 10);
    if (code[0] !== '0' && code !== '00000' && new Set(code).size > 1) return code;
  }
  return '48213';
}

export function isInviteCode(value: string): boolean {
  return /^[1-9][0-9]{4}$/.test(value);
}
