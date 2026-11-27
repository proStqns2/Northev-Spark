import type { ApiRoute } from '../http';

import { z } from 'zod';
import { userKeyInfo, userSealedKey } from '@/lib/db/repo';
import { aiSchema, circuitDocSchema } from '@/lib/validation';
import type { CircuitDoc } from '@/lib/engine/types';
import { runAgent, type PersonalKeys } from '@/lib/ai/providers';
import { openSecret } from '@/lib/auth/vault';
import { AGENTS } from '@/lib/ai/agents';
import { generateEquivalentSchema, geminiStatus } from '@/lib/ai/gemini';
import { rebalanceDoc } from '@/lib/engine/rebalance';
import { bodyOf, currentUser, fail } from '../helpers';
import { aiStatusForId, gateAi, gateMessage } from '@/lib/ai/gate';
import { updateUser } from '@/lib/db/repo';

/**
 * Déchiffre les clés du coffre de l'utilisateur.
 * Une clé illisible (SECRET_KEY changé) est ignorée sans casser l'appel :
 * on retombe alors sur les clés serveur puis sur le moteur local.
 */
async function personalKeysOf(userId: string): Promise<PersonalKeys> {
  const [gemini, openai] = await Promise.all([
    userSealedKey(userId, 'gemini'),
    userSealedKey(userId, 'openai'),
  ]);
  const keys: PersonalKeys = {};
  const g = openSecret(gemini);
  if (g) keys.gemini = g;
  const o = openSecret(openai);
  if (o) {
    keys.openai = o;
    // une clé `sk-or-v1-…` déposée dans le champ OpenAI est une clé OpenRouter
    if (o.startsWith('sk-or-')) {
      keys.openrouter = o;
      delete keys.openai;
    }
  }
  return keys;
}

const balanceSchema = z.object({ doc: circuitDocSchema });
const schemaBodySchema = z.object({
  doc: circuitDocSchema,
  question: z.string().max(600).optional(),
  shape: z.enum(['thevenin', 'norton', 'auto']).optional(),
});

export const aiRoutes: ApiRoute[] = [
  [
    'GET',
    '/api/ai/status',
    async (request, reply) => {
      const user = await currentUser(request);
      reply.header('Cache-Control', 'no-store');
      return reply.send({ assistant: await aiStatusForId(user?.id ?? null) });
    },
  ],

  [
    'POST',
    '/api/ai/consent',
    async (request, reply) => {
      const user = await currentUser(request);
      if (!user) return fail(reply, 401, 'Connectez-vous pour régler l’assistant.');
      const body = bodyOf<{ enabled?: unknown }>(request);
      if (typeof body.enabled !== 'boolean') return fail(reply, 422, 'Champ « enabled » attendu (booléen).');
      await updateUser(user.id, { prefs: { ai: body.enabled } });
      reply.header('Cache-Control', 'no-store');
      return reply.send({ assistant: await aiStatusForId(user.id) });
    },
  ],

['GET', '/api/ai', async (_request, reply) => {
    return reply.send({
      agents: AGENTS,
      providers: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
        openrouter: Boolean(process.env.OPENROUTER_API_KEY),
      },
    });
  }],

  ['POST', '/api/ai', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) {
      return fail(reply, 401, 'Le hub d’agents IA est réservé aux comptes connectés.');
    }
    const gate = await gateAi(user.id);
    if (!gate.ok) {
      return fail(reply, 403, gateMessage(gate.status), { code: 'AI_OFF', assistant: gate.status, href: '/assistant' });
    }
    const parsed = aiSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Données invalides.');
    }
    const personalKeys = await personalKeysOf(user.id);
    const reply2 = await runAgent({
      agent: parsed.data.agent,
      task: parsed.data.task,
      doc: parsed.data.doc as CircuitDoc | undefined,
      question: parsed.data.question,
      provider: parsed.data.provider,
      personalKeys,
    });
    reply.header('Cache-Control', 'no-store');
    return reply.send({ reply: reply2 });
  }],

  ['POST', '/api/ai/balance', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) {
      return fail(reply, 401, 'Connectez-vous pour rééquilibrer un montage.');
    }
    const parsed = balanceSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Montage invalide.');
    }
    const result = rebalanceDoc(parsed.data.doc as CircuitDoc);
    reply.header('Cache-Control', 'no-store');
    return reply.send(result);
  }],

  ['GET', '/api/ai/schema', async (request, reply) => {
    const status = geminiStatus();
    const user = await currentUser(request);
    const personal = user ? (await userKeyInfo(user.id)).gemini : null;
    reply.header('Cache-Control', 'no-store');
    return reply.send({
      configured: status.configured || Boolean(personal),
      source: personal ? 'compte' : status.configured ? 'serveur' : 'aucune',
      model: status.configured ? status.model : 'gemini-2.5-flash',
      personalKey: personal?.fingerprint ?? null,
      reason: status.configured || personal ? undefined : status.reason,
      provider: 'gemini',
    });
  }],

  ['POST', '/api/ai/schema', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) {
      return fail(reply, 401, 'Connectez-vous pour utiliser l’assistant Gemini.');
    }
    const gate = await gateAi(user.id);
    if (!gate.ok) {
      return fail(reply, 403, gateMessage(gate.status), { code: 'AI_OFF', assistant: gate.status, href: '/assistant' });
    }
    const parsed = schemaBodySchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Montage invalide.');
    }

    // priorité : clé personnelle de l'utilisateur (chiffrée), puis clé serveur
    const sealed = await userSealedKey(user.id, 'gemini');
    const personalKey = openSecret(sealed);
    const status = geminiStatus();
    if (!status.configured && !personalKey) {
      return fail(
        reply,
        503,
        status.reason +
          ' Vous pouvez aussi enregistrer votre propre clé depuis votre compte (elle sera chiffrée).',
        { configured: false },
      );
    }

    const result = await generateEquivalentSchema(
      {
        doc: parsed.data.doc as CircuitDoc,
        question: parsed.data.question,
        shape: parsed.data.shape,
      },
      { apiKey: personalKey ?? undefined, keySource: personalKey ? 'user' : 'server' },
    );
    reply.header('Cache-Control', 'no-store');
    return reply.code(result.error ? 502 : 200).send(result);
  }]
];

