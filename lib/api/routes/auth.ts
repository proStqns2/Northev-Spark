import type { ApiRoute } from '../http';
import { aiStatusForId } from '@/lib/ai/gate';

import { authenticate, createSession, createUser, destroySession } from '@/lib/db/repo';
import { cloudEnabled } from '@/lib/db/supabase';
import { loginSchema, registerSchema } from '@/lib/validation';
import { bodyOf, clearSessionCookie, currentUser, fail, getSessionToken, setSessionCookie } from '../helpers';

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  avatar: string;
  theme: string;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
    theme: user.theme,
  };
}

export const authRoutes: ApiRoute[] = [
['POST', '/api/auth/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Données invalides.', {
        issues: parsed.error.issues,
      });
    }
    const result = await createUser(parsed.data);
    if ('error' in result) {
      return fail(reply, 409, result.error, { code: result.code });
    }
    const token = await createSession(result.user.id);
    setSessionCookie(reply, token);
    return reply.send({ user: publicUser(result.user) });
  }],

  ['POST', '/api/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Données invalides.');
    }
    const user = await authenticate(parsed.data.email, parsed.data.password);
    if (!user) {
      return fail(reply, 401, 'Adresse e-mail ou mot de passe incorrect.');
    }
    const token = await createSession(user.id);
    setSessionCookie(reply, token);
    return reply.send({ user: publicUser(user) });
  }],

  ['POST', '/api/auth/logout', async (request, reply) => {
    const token = getSessionToken(request);
    if (token) await destroySession(token);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  }],

  ['GET', '/api/auth/me', async (request, reply) => {
    const user = await currentUser(request);
    reply.header('Cache-Control', 'no-store');
    return reply.send({ user, cloud: cloudEnabled() });
  }],

  [
    'GET',
    '/api/auth/status',
    async (_request, reply) => {
      const assistant = aiStatusForId(null);
      reply.header('Cache-Control', 'no-store');
      return reply.send({
        auth: 'ok',
        requiresAi: false,
        features: {
          studio: true,
          academy: true,
          lab: true,
          exercises: true,
          assistant: (await assistant).ready || (await assistant).enabled,
        },
        note: 'Le compte et le studio fonctionnent sans clé ni service IA.',
      });
    },
  ],
];
