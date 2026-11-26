import type { FastifyInstance } from 'fastify';
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

export async function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (request, reply) => {
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
  });

  app.post('/api/auth/login', async (request, reply) => {
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
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = getSessionToken(request);
    if (token) await destroySession(token);
    clearSessionCookie(reply);
    return reply.send({ ok: true });
  });

  app.get('/api/auth/me', async (request, reply) => {
    const user = await currentUser(request);
    reply.header('Cache-Control', 'no-store');
    return reply.send({ user, cloud: cloudEnabled() });
  });
}
