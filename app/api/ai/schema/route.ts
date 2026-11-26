import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession, userKeyInfo, userSealedKey } from '@/lib/db/repo';
import { openSecret } from '@/lib/auth/vault';
import { circuitDocSchema } from '@/lib/validation';
import { CircuitDoc } from '@/lib/engine/types';
import { generateEquivalentSchema, geminiStatus } from '@/lib/ai/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET  /api/ai/schema   → état de la configuration (jamais la clé)
 * POST /api/ai/schema   → schéma équivalent proposé par Gemini,
 *                         validé puis recalculé par le solveur local
 */

const bodySchema = z.object({
  doc: circuitDocSchema,
  question: z.string().max(600).optional(),
  shape: z.enum(['thevenin', 'norton', 'auto']).optional(),
});

export async function GET() {
  const status = geminiStatus();
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const personal = user ? (await userKeyInfo(user.id)).gemini : null;

  return NextResponse.json(
    {
      configured: status.configured || Boolean(personal),
      source: personal ? 'compte' : status.configured ? 'serveur' : 'aucune',
      model: status.configured ? status.model : 'gemini-2.5-flash',
      personalKey: personal?.fingerprint ?? null,
      reason: status.configured || personal ? undefined : status.reason,
      provider: 'gemini',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) {
    return NextResponse.json({ error: 'Connectez-vous pour utiliser l’assistant Gemini.' }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Montage invalide.' },
      { status: 422 },
    );
  }

  // priorité : clé personnelle de l'utilisateur (chiffrée), puis clé serveur
  const sealed = await userSealedKey(user.id, 'gemini');
  const personalKey = openSecret(sealed);
  const status = geminiStatus();
  if (!status.configured && !personalKey) {
    return NextResponse.json(
      {
        error:
          status.reason +
          ' Vous pouvez aussi enregistrer votre propre clé depuis votre compte (elle sera chiffrée).',
        configured: false,
      },
      { status: 503 },
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

  const httpStatus = result.error ? 502 : 200;
  return NextResponse.json(result, { status: httpStatus, headers: { 'Cache-Control': 'no-store' } });
}
