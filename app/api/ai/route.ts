import { NextResponse } from 'next/server';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { aiSchema } from '@/lib/validation';
import { CircuitDoc } from '@/lib/engine/types';
import { runAgent } from '@/lib/ai/providers';
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
  const reply = await runAgent({
    agent: parsed.data.agent,
    task: parsed.data.task,
    doc: parsed.data.doc as CircuitDoc | undefined,
    question: parsed.data.question,
    provider: parsed.data.provider,
  });
  return NextResponse.json({ reply }, { headers: { 'Cache-Control': 'no-store' } });
}
