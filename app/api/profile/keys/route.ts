import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession, setUserKey, userKeyInfo } from '@/lib/db/repo';
import { KEY_FORMAT, fingerprint, sealSecret, vaultAvailable } from '@/lib/auth/vault';
import { geminiKey } from '@/lib/ai/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Clés API personnelles de l'utilisateur.
 *
 *  GET    → empreintes seulement (« AIza…8A »), jamais le clair
 *  POST   → enregistre une clé chiffrée (AES-256-GCM)
 *  DELETE → supprime la clé personnelle (retour à la clé serveur)
 */

const bodySchema = z.object({
  provider: z.enum(['gemini', 'openai']),
  key: z.string().trim().min(10).max(200),
});

async function guard() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  return user;
}

export async function GET() {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const info = await userKeyInfo(user.id);
  return NextResponse.json(
    {
      vault: vaultAvailable(),
      serverGemini: Boolean(geminiKey()),
      keys: info,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Requête invalide.' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Clé invalide.' }, { status: 422 });
  }
  if (!KEY_FORMAT[parsed.data.provider].test(parsed.data.key)) {
    return NextResponse.json(
      {
        error:
          parsed.data.provider === 'gemini'
            ? 'Format de clé Gemini inattendu (AIza… ou AQ.…). Vérifiez la copie.'
            : 'Format de clé OpenAI inattendu (sk-…).',
      },
      { status: 422 },
    );
  }
  if (!vaultAvailable()) {
    return NextResponse.json(
      {
        error:
          'Coffre indisponible : définissez SECRET_KEY (≥ 16 caractères) dans les variables du serveur pour chiffrer les clés.',
      },
      { status: 503 },
    );
  }

  const sealed = sealSecret(parsed.data.key);
  if (!sealed) return NextResponse.json({ error: 'Chiffrement impossible.' }, { status: 500 });

  const ok = await setUserKey(user.id, parsed.data.provider, {
    sealed,
    fingerprint: fingerprint(parsed.data.key),
  });
  if (!ok) return NextResponse.json({ error: 'Utilisateur introuvable.' }, { status: 404 });

  return NextResponse.json({
    ok: true,
    provider: parsed.data.provider,
    fingerprint: fingerprint(parsed.data.key),
    note: 'Clé chiffrée (AES-256-GCM). Elle ne sera plus jamais renvoyée en clair.',
  });
}

export async function DELETE(request: Request) {
  const user = await guard();
  if (!user) return NextResponse.json({ error: 'Non authentifié.' }, { status: 401 });

  const provider = new URL(request.url).searchParams.get('provider');
  if (provider !== 'gemini' && provider !== 'openai') {
    return NextResponse.json({ error: 'Fournisseur inconnu.' }, { status: 422 });
  }
  await setUserKey(user.id, provider, null);
  return NextResponse.json({ ok: true, removed: provider });
}
