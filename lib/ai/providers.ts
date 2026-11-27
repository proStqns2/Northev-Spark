import { CircuitDoc } from '@/lib/engine/types';
import { equivalentOf } from '@/lib/engine/equivalent';
import { formatPhasor, formatSI } from '@/lib/engine/format';
import { abs } from '@/lib/engine/complex';
import { AgentId } from './agents';
import { AgentReply, runLocalAgent } from './local';

export type Provider = 'openai' | 'gemini' | 'openrouter' | 'local';

/** clés apportées par l'utilisateur (coffre chiffré), prioritaires sur l'environnement */
export type PersonalKeys = { openai?: string; gemini?: string; openrouter?: string };

export function providerStatus(personal: PersonalKeys = {}) {
  return {
    openai: Boolean(personal.openai || process.env.OPENAI_API_KEY),
    gemini: Boolean(personal.gemini || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    openrouter: Boolean(personal.openrouter || process.env.OPENROUTER_API_KEY),
    local: true,
  };
}

const SYSTEM_PROMPT = `Tu es un agent IA intégré à Northev Spark, un studio de circuits électriques francophone.
Tu réponds en français, en texte brut (sans markdown lourd), de façon dense, technique et vérifiable.
Tu ne dois jamais inventer de valeurs : les valeurs exactes te sont fournies dans le contexte, calcule uniquement à partir d'elles.
Ton rôle : expliquer l'équivalent de Thévenin / Norton d'un montage, vérifier la cohérence des calculs, et rester pédagogique.
Si une donnée manque, dis-le explicitement au lieu de supposer.
Longueur cible : 120 à 220 mots, structuré en paragraphes courts ou en liste numérotée.`;

function buildContext(agent: AgentId, task: string, doc: CircuitDoc, question?: string): string {
  const eq = equivalentOf(doc);
  const lines: string[] = [];
  lines.push(`Agent : ${agent} · tâche : ${task}`);
  lines.push(`Montage : ${doc.name} · régime : ${doc.regime === 'ac' ? `sinusoïdal ${doc.frequency} Hz` : 'continu'}`);
  lines.push(`Bornes : A=${doc.terminals.a ?? '—'} B=${doc.terminals.b ?? '—'} · masse=${doc.ground || 'auto'}`);
  lines.push(
    `Composants (${doc.components.length}) : ` +
      doc.components
        .map(
          (c) =>
            `${c.id}[${c.kind}] ${formatSI(c.value, '')}${c.kind === 'vsource' || c.kind === 'isource' ? (c.kind === 'vsource' ? 'V' : 'A') : ''} entre ${c.a} et ${c.b}`,
        )
        .join(' ; '),
  );
  if (eq.ok) {
    lines.push(
      `Résultats du solveur nodal (vérifiés) : U_th=${formatPhasor(eq.vth)} · Z_th=${formatSI(abs(eq.rth), 'Ω')} (angle ${((Math.atan2(eq.rth.im, eq.rth.re) * 180) / Math.PI).toFixed(2)}°) · I_N=${formatPhasor(eq.inorton, 'A')} · écart de vérification=${eq.verificationErrorPct.toExponential(2)} %`,
    );
    if (eq.superposition.length) {
      lines.push(
        'Superposition : ' +
          eq.superposition
            .map((s) => `${s.label} contribue ${formatPhasor(s.contribution)}`)
            .join(' ; '),
      );
    }
    if (eq.warnings.length) lines.push(`Avertissements : ${eq.warnings.join(' | ')}`);
  } else {
    lines.push(`Le solveur n'a pas pu conclure : ${eq.error}`);
  }
  if (question) lines.push(`Question de l'utilisateur : ${question}`);
  return lines.join('\n');
}

/**
 * Appel générique à un fournisseur, avec repli automatique.
 *
 * Contrairement à `runAgent`, cette fonction ne suppose pas de document
 * existant : c'est le point d'entrée utilisé pour *fabriquer* un montage à
 * partir d'une description. Les clés personnelles priment sur celles du
 * serveur ; aucune clé n'apparaît dans la réponse ni dans les journaux.
 */
export async function askModel(
  system: string,
  user: string,
  options: {
    provider?: 'auto' | 'openai' | 'gemini' | 'openrouter';
    personalKeys?: PersonalKeys;
    timeoutMs?: number;
    maxTokens?: number;
  } = {},
): Promise<{ text: string; provider: 'openai' | 'gemini' | 'openrouter'; model: string }> {
  const personal = options.personalKeys ?? {};
  const status = providerStatus(personal);
  const requested = options.provider ?? 'auto';
  const order: Array<'openai' | 'gemini' | 'openrouter'> =
    requested === 'auto' ? ['gemini', 'openai', 'openrouter'] : [requested];

  const available = order.filter((provider) => status[provider]);
  if (!available.length) {
    throw new Error(
      'Aucun fournisseur configuré. Renseignez GEMINI_API_KEY, OPENAI_API_KEY ou OPENROUTER_API_KEY (ou une clé personnelle dans /compte).',
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
  let lastError: Error | null = null;
  try {
    for (const provider of available) {
      try {
        const text =
          provider === 'openai'
            ? await callOpenAI(system, user, controller.signal, personal.openai)
            : provider === 'gemini'
              ? await callGemini(system, user, controller.signal, personal.gemini)
              : await callOpenRouter(system, user, controller.signal, personal.openrouter ?? personal.openai);
        const model =
          provider === 'openai'
            ? process.env.OPENAI_MODEL || 'gpt-4o-mini'
            : provider === 'gemini'
              ? process.env.GEMINI_MODEL || 'gemini-2.5-flash'
              : process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
        return { text, provider, model };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Appel fournisseur échoué.');
      }
    }
  } finally {
    clearTimeout(timeout);
  }
  throw lastError ?? new Error('Aucun fournisseur disponible.');
}

async function callOpenAI(
  system: string,
  user: string,
  signal: AbortSignal,
  personalKey?: string,
): Promise<string> {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${personalKey || process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 700,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal,
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Réponse OpenAI vide.');
  return text;
}

/**
 * OpenRouter — passerelle unique vers des dizaines de modèles
 * (format « OpenAI compatible »). La clé `sk-or-v1-…` reste côté serveur.
 * Modèle par défaut : un modèle rapide et bon marché, surchargeable par
 * OPENROUTER_MODEL. Les en-têtes HTTP-Referer / X-Title identifient l'app.
 */
async function callOpenRouter(
  system: string,
  user: string,
  signal: AbortSignal,
  personalKey?: string,
): Promise<string> {
  const model = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${personalKey || process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.APP_URL || 'https://northev-spark.vercel.app',
      'X-Title': 'Northev Spark',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
    signal,
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${detail.replace(/sk-or-[A-Za-z0-9\-]+/g, 'sk-or-***').slice(0, 180)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('Réponse OpenRouter vide.');
  return text;
}

async function callGemini(
  system: string,
  user: string,
  signal: AbortSignal,
  personalKey?: string,
): Promise<string> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const key = personalKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 800 },
      }),
      signal,
    },
  );
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Réponse Gemini vide.');
  return text;
}

export async function runAgent(input: {
  agent: AgentId;
  task: string;
  doc?: CircuitDoc;
  question?: string;
  provider?: 'auto' | 'openai' | 'gemini' | 'openrouter' | 'local';
  /** clés du coffre de l'utilisateur — jamais journalisées ni renvoyées */
  personalKeys?: PersonalKeys;
}): Promise<AgentReply> {
  const local = runLocalAgent(input.agent, input.task, input.doc, input.question);
  const personal = input.personalKeys ?? {};
  const status = providerStatus(personal);
  const requested = input.provider ?? 'auto';

  const useProvider: Provider =
    requested === 'local' || !input.doc
      ? 'local'
      : requested === 'openai'
        ? status.openai
          ? 'openai'
          : 'local'
        : requested === 'gemini'
          ? status.gemini
            ? 'gemini'
            : 'local'
          : requested === 'openrouter'
            ? status.openrouter
              ? 'openrouter'
              : 'local'
            : /* auto */ status.openrouter
              ? 'openrouter'
              : status.openai
                ? 'openai'
                : status.gemini
                  ? 'gemini'
                  : 'local';

  if (useProvider === 'local') {
    return { ...local, provider: 'local', warning: requested !== 'local' && requested !== 'auto' ? 'Fournisseur demandé indisponible : réponse du moteur local.' : local.warning };
  }

  const context = buildContext(input.agent, input.task, input.doc!, input.question);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const text =
      useProvider === 'openai'
        ? await callOpenAI(SYSTEM_PROMPT, context, controller.signal, personal.openai)
        : useProvider === 'openrouter'
          ? await callOpenRouter(SYSTEM_PROMPT, context, controller.signal, personal.openrouter)
          : await callGemini(SYSTEM_PROMPT, context, controller.signal, personal.gemini);
    return {
      ...local,
      provider: useProvider,
      body: text,
      headline: local.headline,
      warning: undefined,
    };
  } catch (error) {
    return {
      ...local,
      provider: 'local',
      warning: `Appel ${useProvider} impossible (${(error as Error).message.slice(0, 120)}). Réponse calculée localement.`,
    };
  } finally {
    clearTimeout(timeout);
  }
}
