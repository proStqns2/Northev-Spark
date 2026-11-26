import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { aiSchema } from '@/lib/validation';
import { CircuitDoc } from '@/lib/engine/types';
import { runAgent, PersonalKeys } from '@/lib/ai/providers';
import { userSealedKey } from '@/lib/db/repo';
import { openSecret } from '@/lib/auth/vault';
import { AGENTS } from '@/lib/ai/agents';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    agents: AGENTS,
    providers: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    },
  });
}

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

export async function POST(request: Request) {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) {
    return NextResponse.json(
      { error: 'Le hub d’agents IA est réservé aux comptes connectés.' },
      { status: 401 },
    );
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = aiSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Données invalides.' },
      { status: 422 },
    );
  }
  const personalKeys = await personalKeysOf(user.id);
  const reply = await runAgent({
    agent: parsed.data.agent,
    task: parsed.data.task,
    doc: parsed.data.doc as CircuitDoc | undefined,
    question: parsed.data.question,
    provider: parsed.data.provider,
    personalKeys,
  });
  return NextResponse.json({ reply }, { headers: { 'Cache-Control': 'no-store' } });
}
