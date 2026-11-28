/**
 * Gemini — génération de schémas équivalents (côté SERVEUR uniquement).
 *
 * La clé ne quitte jamais le processus Node : elle est lue dans
 * `GEMINI_API_KEY` (ou `GOOGLE_API_KEY`) et n'est jamais renvoyée au client,
 * ni dans les erreurs, ni dans les logs.
 *
 * Sécurité : la réponse du modèle est traitée comme une donnée non fiable.
 *  - JSON extrait, puis validé par `schemaDocSchema` (zod) ;
 *  - les valeurs numériques sont bornées et les types de composants limités ;
 *  - le résultat est **recalculé** par le solveur local avant d'être affiché :
 *    si l'écart avec U_th / Z_th attendu dépasse la tolérance, le schéma est
 *    rejeté et le modèle local prend le relais.
 */

import { z } from 'zod';
import { CircuitDoc, ComponentKind } from '@/lib/engine/types';
import { equivalentOf } from '@/lib/engine/equivalent';
import { abs } from '@/lib/engine/complex';
import { formatSI } from '@/lib/engine/format';

export type GeminiStatus =
  | { configured: false; reason: string }
  | { configured: true; model: string; endpoint: string };

export function geminiKey(): string | undefined {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return key && key.trim().length > 20 ? key.trim() : undefined;
}

export function geminiStatus(): GeminiStatus {
  const key = geminiKey();
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (!key) {
    return {
      configured: false,
      reason:
        'Aucune clé Gemini côté serveur. Ajoutez GEMINI_API_KEY dans .env.local (ou dans les variables du projet Vercel) puis redémarrez.',
    };
  }
  return {
    configured: true,
    model,
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
  };
}

/** ne jamais laisser fuir la clé dans un message d'erreur */
function redact(message: string): string {
  return message.replace(/key=[A-Za-z0-9_\-]+/g, 'key=***').slice(0, 240);
}

export interface GeminiSchemaRequest {
  doc: CircuitDoc;
  question?: string;
  /** modèle équivalent imposé par l'utilisateur */
  shape?: 'thevenin' | 'norton' | 'auto';
}

export interface GeminiSchemaResult {
  ok: boolean;
  /** schéma proposé, validé et recalculé localement */
  doc?: CircuitDoc;
  /** texte d'explication du modèle */
  explanation: string;
  model: string;
  /** écarts de contrôle entre le schéma proposé et le montage d'origine */
  check?: {
    vthExpected: number;
    vthProposed: number;
    rthExpected: number;
    rthProposed: number;
    deviationPct: number;
    accepted: boolean;
  };
  warning?: string;
  error?: string;
}

const SCHEMA_SHAPE = `{
  "name": "string — nom court du schéma équivalent",
  "explanation": "string — 60 à 140 mots en français : pourquoi ce schéma est équivalent",
  "doc": {
    "name": "string",
    "regime": "dc" | "ac",
    "frequency": number,
    "ground": "gnd",
    "terminals": { "a": "n1", "b": "gnd" },
    "components": [
      { "id": "R1", "kind": "resistor", "a": "n1", "b": "gnd", "value": 1000 }
    ]
  }
}`;

const SYSTEM = `Tu es un professeur d'électrotechnique intégré à Northev Spark.
Mission : construire le SCHÉMA ÉQUIVALENT (Thévenin ou Norton) d'un montage donné.
Règles absolues :
- Réponds UNIQUEMENT par un objet JSON valide, sans texte avant ni après, sans balises markdown.
- Les kinds autorisés : vsource, isource, resistor, capacitor, inductor, wire.
- Les nœuds sont des chaînes ("n1", "n2", "gnd") ; "ground" doit valoir "gnd".
- Le schéma proposé doit contenir au maximum 3 composants (source + impédance interne + charge éventuelle).
- En régime AC, les impédances internes complexes se construisent avec resistor + inductor/capacitor en série.
- Valeurs en unités SI de base : ohms, farads, henrys, volts, ampères.
- N'invente JAMAIS les valeurs : utilise exactement U_th, Z_th, R_th, I_N fournis dans le contexte.
- "explanation" est en français, sans formule LaTeX, en texte simple.
Format attendu :
${SCHEMA_SHAPE}`;

function buildContext({ doc, question, shape }: GeminiSchemaRequest): string {
  const eq = equivalentOf(doc);
  const lines: string[] = [];
  lines.push(`Montage d'origine : ${doc.name}`);
  lines.push(`Régime : ${doc.regime === 'ac' ? `sinusoïdal, fréquence ${doc.frequency} Hz` : 'continu (DC)'}`);
  lines.push(`Bornes d'étude : A = ${doc.terminals.a ?? '—'}, B = ${doc.terminals.b ?? doc.ground ?? '—'}`);
  lines.push(`Masse : ${doc.ground || '—'}`);
  lines.push(
    'Composants : ' +
      doc.components
        .map((c) => `${c.id} [${c.kind}] = ${formatSI(c.value, '')} entre ${c.a} et ${c.b}`)
        .join(' ; '),
  );
  if (eq.ok) {
    lines.push(
      `Résultats CERTIFIÉS par le solveur (à réutiliser tels quels) : U_th = ${formatSI(abs(eq.vth), 'V', { digits: 6 })} ` +
        `(partie réelle ${eq.vth.re.toFixed(6)}, imaginaire ${eq.vth.im.toFixed(6)}), ` +
        `Z_th = ${formatSI(abs(eq.rth), 'Ω', { digits: 6 })} (re ${eq.rth.re.toFixed(6)}, im ${eq.rth.im.toFixed(6)}), ` +
        `I_N = ${formatSI(abs(eq.inorton), 'A', { digits: 6 })}.`,
    );
  } else {
    lines.push(`Le solveur ne conclut pas : ${eq.error ?? 'montage incomplet'}. Propose un schéma prudent et explique l'hypothèse.`);
  }
  lines.push(`Modèle équivalent demandé : ${shape ?? 'auto'} (${shape === 'norton' ? 'source de courant en parallèle' : 'source de tension en série'}).`);
  if (question?.trim()) lines.push(`Question de l'utilisateur : ${question.trim()}`);
  return lines.join('\n');
}

/** extrait le premier objet JSON équilibré d'une réponse éventuellement bavarde */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/gi, '').trim();
  const start = cleaned.indexOf('{');
  if (start < 0) throw new Error('Aucun JSON dans la réponse du modèle.');
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === '\\') {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(cleaned.slice(start, i + 1));
    }
  }
  throw new Error('JSON incomplet dans la réponse du modèle.');
}

const ALLOWED: ComponentKind[] = ['vsource', 'isource', 'resistor', 'capacitor', 'inductor', 'wire'];

const componentSchema = z.object({
  id: z.string().trim().min(1).max(24),
  kind: z.string(),
  a: z.string().trim().min(1).max(24),
  b: z.string().trim().min(1).max(24),
  value: z.number().finite().min(-1e9).max(1e9),
});

const docSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  regime: z.enum(['dc', 'ac']).optional(),
  frequency: z.number().finite().min(0).max(1e9).optional(),
  ground: z.string().optional(),
  terminals: z.object({ a: z.string().nullable().optional(), b: z.string().nullable().optional() }).optional(),
  components: z.array(componentSchema).min(1).max(12),
});

const replySchema = z.object({
  name: z.string().max(120).optional(),
  explanation: z.string().max(2000).optional(),
  doc: docSchema,
});

/**
 * Appel bas niveau : un seul aller-retour Gemini.
 * Exporté pour permettre les tests sans réseau (injection de fetch).
 */
export async function callGeminiRaw(
  system: string,
  user: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  explicitKey?: string,
): Promise<string> {
  const key = explicitKey ?? geminiKey();
  if (!key) throw new Error('Clé Gemini absente.');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const response = await fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
      signal,
    },
  );
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Gemini ${response.status} : ${redact(detail)}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    promptFeedback?: { blockReason?: string };
  };
  if (data.promptFeedback?.blockReason) {
    throw new Error(`Requête bloquée par Gemini (${data.promptFeedback.blockReason}).`);
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) throw new Error('Réponse Gemini vide.');
  return text;
}

/** normalise + borne la proposition du modèle en un CircuitDoc sûr */
export function normalizeProposedDoc(
  raw: z.infer<typeof docSchema>,
  fallback: CircuitDoc,
): CircuitDoc {
  const components = raw.components
    .filter((c) => ALLOWED.includes(c.kind as ComponentKind))
    .map((c) => ({
      id: c.id.replace(/[^A-Za-z0-9_]/g, '').slice(0, 12) || `X${Math.random().toString(36).slice(2, 5)}`,
      kind: c.kind as ComponentKind,
      a: c.a,
      b: c.b,
      value: c.kind === 'wire' ? 0 : c.value,
    }));

  return {
    name: (raw.name ?? fallback.name ?? 'Schéma équivalent').slice(0, 120),
    notes: 'Schéma proposé par Gemini, vérifié par le solveur Northev.',
    components,
    ground: raw.ground && raw.ground.trim() ? raw.ground.trim() : 'gnd',
    terminals: {
      a: raw.terminals?.a ?? null,
      b: raw.terminals?.b ?? null,
    },
    regime: raw.regime ?? fallback.regime,
    frequency: raw.frequency ?? fallback.frequency,
  };
}

/**
 * Génère un schéma équivalent, le valide, le recalcule et le compare au montage
 * d'origine. Tolérance d'acceptation : 8 % sur U_th et Z_th.
 */
export async function generateEquivalentSchema(
  input: GeminiSchemaRequest,
  options: { fetchImpl?: typeof fetch; tolerancePct?: number; apiKey?: string; keySource?: 'user' | 'server' } = {},
): Promise<GeminiSchemaResult> {
  const status = geminiStatus();
  const usingUserKey = Boolean(options.apiKey);
  if (!status.configured && !usingUserKey) {
    return { ok: false, explanation: '', model: 'local', error: status.reason };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  const model = status.configured ? status.model : process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  try {
    const text = await callGeminiRaw(
      SYSTEM,
      buildContext(input),
      controller.signal,
      options.fetchImpl,
      options.apiKey,
    );
    const json = extractJson(text);
    const parsed = replySchema.safeParse(json);
    if (!parsed.success) {
      return {
        ok: false,
        explanation: '',
        model,
        error: `Réponse du modèle non conforme : ${parsed.error.issues[0]?.message ?? 'structure invalide'}.`,
      };
    }

    const proposed = normalizeProposedDoc(parsed.data.doc, input.doc);
    if (!proposed.components.length) {
      return { ok: false, explanation: parsed.data.explanation ?? '', model, error: 'Schéma vide proposé.' };
    }

    // ---- contrôle indépendant : on recalcule les deux montages
    const original = equivalentOf(input.doc);
    const candidate = equivalentOf(proposed);
    const tolerance = options.tolerancePct ?? 8;

    if (!candidate.ok) {
      return {
        ok: false,
        explanation: parsed.data.explanation ?? '',
        model,
        doc: proposed,
        error: `Le schéma proposé ne se calcule pas : ${candidate.error ?? 'incomplet'}.`,
      };
    }

    const vthExpected = original.ok ? abs(original.vth) : NaN;
    const rthExpected = original.ok ? abs(original.rth) : NaN;
    const vthProposed = abs(candidate.vth);
    const rthProposed = abs(candidate.rth);
    const ac = input.doc.regime === 'ac';
    /**
     * Écart relatif. Deux valeurs infinies sont considérées comme identiques
     * (Z_th = ∞ signifie « boucle ouverte » des deux côtés).
     */
    const deviation = (a: number, b: number) => {
      const fa = Number.isFinite(a);
      const fb = Number.isFinite(b);
      if (!fa && !fb) return 0;
      if (!fa || !fb) return 100;
      if (Math.max(a, b) <= 1e-12) return 0;
      return (Math.abs(a - b) / Math.max(a, b)) * 100;
    };
    /**
     * En DC, un schéma de Thévenin mesuré à vide donne Z_th = ∞ (boucle
     * ouverte) alors que la résistance interne est en série : la comparaison
     * porte alors sur U_th et I_N, seules grandeurs observables dans les deux
     * topologies. En AC, Z_th est directement mesurable, on l'inclut.
     */
    const inExpected = original.ok ? abs(original.inorton) : NaN;
    const inProposed = abs(candidate.inorton);
    const checks = [deviation(vthExpected, vthProposed), deviation(inExpected, inProposed)];
    if (ac) checks.push(deviation(rthExpected, rthProposed));
    const deviationPct = Math.max(...checks);
    const accepted = original.ok ? deviationPct <= tolerance : true;

    return {
      ok: accepted,
      doc: proposed,
      explanation:
        (parsed.data.explanation ?? '').trim() ||
        'Schéma équivalent généré et recalculé par le solveur Northev Spark.',
      model,
      check: {
        vthExpected,
        vthProposed,
        rthExpected,
        rthProposed,
        deviationPct: Number(deviationPct.toFixed(3)),
        accepted,
      },
      warning: accepted
        ? undefined
        : `Écart trop important (${deviationPct.toFixed(1)} % > ${tolerance} %) : le schéma proposé est affiché à titre indicatif mais n'est pas certifié équivalent.`,
    };
  } catch (error) {
    const message = (error as Error).message;
    return {
      ok: false,
      explanation: '',
      model,
      error: /aborted|AbortError/i.test(message)
        ? 'Gemini n’a pas répondu dans les 30 s.'
        : /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|network/i.test(message)
          ? 'Le serveur n’a pas pu joindre generativelanguage.googleapis.com. Vérifiez la connexion sortante de l’hébergement (sur Vercel l’appel fonctionne ; un sandbox hors ligne renverra cette erreur).'
          : redact(message),
    };
  } finally {
    clearTimeout(timeout);
  }
}
