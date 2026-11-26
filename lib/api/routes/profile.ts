import type { ApiRoute } from '../http';

import { z } from 'zod';
import { changePassword, setUserKey, updateUser, userKeyInfo } from '@/lib/db/repo';
import { profileSchema } from '@/lib/validation';
import { MIN_PASSWORD } from '@/lib/auth/config';
import { KEY_FORMAT, fingerprint, sealSecret, vaultAvailable } from '@/lib/auth/vault';
import { geminiKey } from '@/lib/ai/gemini';
import { providerStatus } from '@/lib/ai/providers';
import { bodyOf, currentUser, fail } from '../helpers';

const passwordSchema = z.object({
  current: z.string().min(1).max(200),
  next: z.string().min(MIN_PASSWORD).max(200),
});

const keyBodySchema = z.object({
  provider: z.enum(['gemini', 'openai']),
  key: z.string().trim().min(10).max(200),
});

export const profileRoutes: ApiRoute[] = [
['GET', '/api/profile', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    reply.header('Cache-Control', 'no-store');
    return reply.send({ user });
  }],

  ['PATCH', '/api/profile', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = profileSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Données invalides.');
    }
    const updated = await updateUser(user.id, parsed.data);
    return reply.send({ user: updated });
  }],

  ['PUT', '/api/profile', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = passwordSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`);
    }
    const result = await changePassword(user.id, parsed.data.current, parsed.data.next);
    if (!result.ok) return fail(reply, 403, result.error);
    return reply.send({ ok: true, reauth: true });
  }],

  // ---- clés API personnelles (coffre chiffré) ----

  ['GET', '/api/profile/keys', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const info = await userKeyInfo(user.id);
    const server = providerStatus();
    reply.header('Cache-Control', 'no-store');
    return reply.send({
      vault: vaultAvailable(),
      serverGemini: Boolean(geminiKey()),
      keys: info,
      providers: {
        gemini: Boolean(info?.gemini) || server.gemini,
        openrouter: Boolean(server.openrouter),
        openai: Boolean(info?.openai) || server.openai,
      },
    });
  }],

  ['POST', '/api/profile/keys', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = keyBodySchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'Clé invalide.');
    if (!KEY_FORMAT[parsed.data.provider].test(parsed.data.key)) {
      return fail(
        reply,
        422,
        parsed.data.provider === 'gemini'
          ? 'Format de clé Gemini inattendu (AIza… ou AQ.…). Vérifiez la copie.'
          : 'Format de clé OpenAI inattendu (sk-…).',
      );
    }
    if (!vaultAvailable()) {
      return fail(
        reply,
        503,
        'Coffre indisponible : définissez SECRET_KEY (≥ 16 caractères) dans les variables du serveur pour chiffrer les clés.',
      );
    }
    const sealed = sealSecret(parsed.data.key);
    if (!sealed) return fail(reply, 500, 'Chiffrement impossible.');
    const ok = await setUserKey(user.id, parsed.data.provider, {
      sealed,
      fingerprint: fingerprint(parsed.data.key),
    });
    if (!ok) return fail(reply, 404, 'Utilisateur introuvable.');
    return reply.send({
      ok: true,
      provider: parsed.data.provider,
      fingerprint: fingerprint(parsed.data.key),
      note: 'Clé chiffrée (AES-256-GCM). Elle ne sera plus jamais renvoyée en clair.',
    });
  }],

  ['DELETE', '/api/profile/keys', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const provider = (request.query as Record<string, string> | undefined)?.provider;
    if (provider !== 'gemini' && provider !== 'openai') {
      return fail(reply, 422, 'Fournisseur inconnu.');
    }
    await setUserKey(user.id, provider, null);
    return reply.send({ ok: true, removed: provider });
  }]
];

