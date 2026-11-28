/**
 * Construction d'un montage à partir d'une description en français.
 *
 * Deux moteurs, dans cet ordre :
 *
 *  1. **Moteur local** (toujours disponible, instantané, gratuit) : un
 *     routeur de intentions reconnaît le type de montage demandé et charge le
 *     gabarit correspondant, éventuellement adapté aux valeurs citées.
 *  2. **Modèle** (si l'assistant est activé et qu'une clé existe) : on demande
 *     un document JSON, puis on le **valide** avec le même schéma que l'API.
 *     Un JSON invalide ne casse rien : on retombe sur le moteur local en
 *     expliquant pourquoi.
 *
 * Le résultat est toujours un `CircuitDoc` calculable par le solveur : c'est
 * la différence entre « l'IA raconte » et « l'IA produit quelque chose qui
 * marche ».
 */

import type { CircuitDoc } from '@/lib/engine/types';
import { circuitDocSchema } from '@/lib/validation';
import { templateDoc } from '@/lib/data/loadDoc';
import { TEMPLATES } from '@/lib/data/templates';
import { solveDocument } from '@/lib/engine/solver';
import { diagnose } from '@/lib/studio/editor';
import { askModel } from './providers';

export type BuildSource = 'local' | 'modele';

export interface BuildResult {
  ok: boolean;
  doc?: CircuitDoc;
  source: BuildSource;
  /** pourquoi ce gabarit / cette réponse */
  explanation: string;
  /** ce que le modèle a répondu, même si le JSON était invalide */
  raw?: string;
  model?: string;
  provider?: string;
  /** messages du contrôle de cohérence après fabrication */
  issues: Array<{ level: string; message: string }>;
  warnings: string[];
  error?: string;
  ms: number;
}

export interface BuildOptions {
  prompt: string;
  /** valeurs imposées éventuelles, ex. { E: 24, R1: 1000 } */
  values?: Record<string, number>;
  provider?: 'auto' | 'openai' | 'gemini' | 'openrouter';
  personalKeys?: { gemini?: string; openai?: string; openrouter?: string };
  /** false = moteur local seulement (défaut si l'assistant est éteint) */
  allowModel?: boolean;
  timeoutMs?: number;
}

/* ------------------------------------------------------------------ */
/* moteur local                                                        */
/* ------------------------------------------------------------------ */

interface Intent {
  slug: string;
  reason: string;
  pattern: RegExp;
}

/**
 * Intentions reconnues, de la plus spécifique à la plus générale.
 * L'ordre compte : « pont diviseur » doit passer avant « pont ».
 */
const INTENTS: Intent[] = [
  { pattern: /diviseur\s+de\s+(tension|courant)/i, slug: 'thevenin-serie', reason: 'diviseur de tension reconnu' },
  { pattern: /pont\s+diviseur/i, slug: 'thevenin-serie', reason: 'pont diviseur' },
  { pattern: /wheatstone/i, slug: 'pont-wheatstone', reason: 'pont de Wheatstone' },
  { pattern: /pont\s+capacitif/i, slug: 'pont-capacitif', reason: 'pont capacitif' },
  { pattern: /millman/i, slug: 'millman', reason: 'théorème de Millman' },
  { pattern: /superposition/i, slug: 'superposition', reason: 'superposition' },
  { pattern: /transform\w*\s+de\s+sources?/i, slug: 'transformation-sources', reason: 'transformation de sources' },
  { pattern: /(équivalent|equivalent)\w*\s+(tn|th[ée]venin|norton)/i, slug: 'equivalence-tn', reason: 'équivalence Thévenin/Norton' },
  { pattern: /norton/i, slug: 'norton-parallele', reason: 'modèle de Norton' },
  { pattern: /th[ée]venin/i, slug: 'thevenin-serie', reason: 'modèle de Thévenin' },
  { pattern: /r[ée]sonance|rlc|filtre/i, slug: 'bobines-impedances', reason: 'circuit résonant / filtres' },
  { pattern: /bobine|inductance|\bl\b/i, slug: 'bobines-impedances', reason: 'bobines en régime sinusoïdal' },
  { pattern: /condensateur|capacit[ée]|rc\b/i, slug: 'labo-calcul-tn', reason: 'charge de condensateur' },
  { pattern: /sources?\s+li[ée]es|vcvs|vccs|gain/i, slug: 'sources-liees', reason: 'sources liées' },
  { pattern: /dip[oô]les?\s+[ée]quivalents?/i, slug: 'dipoles-equivalents', reason: 'dipôles équivalents' },
  { pattern: /parall[èe]le/i, slug: 'norton-parallele', reason: 'montage parallèle' },
  { pattern: /s[ée]rie/i, slug: 'thevenin-serie', reason: 'montage série' },
  { pattern: /hub|biblioth[èe]que|exemple/i, slug: 'hub-equivalence', reason: 'galerie d’exemples' },
];

export function localBuild(prompt: string, values: Record<string, number> = {}): BuildResult {
  const started = Date.now();
  const match = INTENTS.find((intent) => intent.pattern.test(prompt));
  const slug = match?.slug ?? 'thevenin-serie';
  const doc = templateDoc(slug);

  if (!doc) {
    return {
      ok: false,
      source: 'local',
      explanation: `Aucun gabarit pour « ${prompt} ».`,
      issues: [],
      warnings: [],
      error: 'Gabarit indisponible.',
      ms: Date.now() - started,
    };
  }

  const adapted = adaptValues(doc, prompt, values);
  const issues = diagnose(adapted.doc);
  const solution = solveDocument(adapted.doc, { sourcesOn: true });
  const warnings: string[] = [];
  if (!solution.ok) warnings.push(`Le solveur signale : ${solution.error}`);
  if (adapted.changes.length) warnings.push(`Valeurs imposées : ${adapted.changes.join(', ')}.`);

  return {
    ok: true,
    doc: adapted.doc,
    source: 'local',
    explanation: `Montage « ${doc.name} » chargé (${match?.reason ?? 'gabarit de base'}). ${
      adapted.changes.length ? 'Valeurs adaptées à votre demande.' : 'Vous pouvez tout déplacer et tout régler.'
    }`,
    issues: issues.map((issue) => ({ level: issue.level, message: issue.message })),
    warnings,
    ms: Date.now() - started,
  };
}

/** Adapte quelques valeurs si l'énoncé cite des nombres (`12 V`, `1 kΩ`…). */
function adaptValues(
  doc: CircuitDoc,
  prompt: string,
  explicit: Record<string, number>,
): { doc: CircuitDoc; changes: string[] } {
  const changes: string[] = [];
  const copy: CircuitDoc = structuredClone(doc);

  const voltages = [...prompt.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:v|volts?)\b/gi)].map((match) =>
    Number(match[1].replace(',', '.')),
  );
  const ohms = [...prompt.matchAll(/(\d+(?:[.,]\d+)?)\s*(k|m)?\s*(?:ω|ohms?)\b/gi)].map((match) => {
    const scale = match[2]?.toLowerCase() === 'k' ? 1000 : match[2]?.toLowerCase() === 'm' ? 1e-3 : 1;
    return Number(match[1].replace(',', '.')) * scale;
  });

  if (voltages.length) {
    const source = copy.components.find((part) => part.kind === 'vsource');
    if (source) {
      source.value = voltages[0];
      changes.push(`source = ${voltages[0]} V`);
    }
  }

  if (ohms.length) {
    const resistors = copy.components.filter((part) => part.kind === 'resistor');
    resistors.forEach((resistor, index) => {
      if (ohms[index] !== undefined) {
        resistor.value = ohms[index];
        changes.push(`${resistor.label ?? `R${index + 1}`} = ${ohms[index]} Ω`);
      }
    });
  }

  for (const [key, value] of Object.entries(explicit)) {
    const target = copy.components.find((part) => (part.label ?? '').startsWith(key));
    if (target && Number.isFinite(value)) {
      target.value = value;
      changes.push(`${key} = ${value} ${target.kind === 'vsource' ? 'V' : ''}`.trim());
    }
  }

  return { doc: copy, changes };
}

/* ------------------------------------------------------------------ */
/* moteur modèle                                                       */
/* ------------------------------------------------------------------ */

const SYSTEM_PROMPT = `Tu es un professeur d'électrotechnique qui construit des schémas calculables.
Tu réponds UNIQUEMENT par un objet JSON, sans commentaire, sans balise Markdown.

Schéma attendu :
{
  "name": string,
  "regime": "dc" | "ac",
  "frequency": number,                    // Hz, utile en ac
  "ground": "x,y",                        // nœud de masse, obligatoire
  "terminals": { "a": "x,y", "b": "x,y" },// point de mesure de Thévenin
  "components": [
    {
      "kind": "resistor" | "capacitor" | "inductor" | "vsource" | "isource" | "wire" | "switch" | "ammeter" | "voltmeter" | "lamp" | "potentiometer" | "vcvs" | "vccs",
      "a": "x,y",                          // borne A sur une grille entière
      "b": "x,y",                          // borne B, alignée avec A (même x ou même y)
      "value": number,                     // Ω, F, H, V ou A
      "label": string,
      "closed": boolean,                   // interrupteurs seulement
      "ac": { "amplitude": number, "frequency": number, "phaseDeg": number }
    }
  ]
}

Règles impératives :
- coordonnées entières entre 1 et 22, chaque dipôle sur deux nœuds DISTINCTS ;
- les connexions se font en partageant les mêmes coordonnées de bornes ;
- utilise "wire" pour relier deux nœuds non adjacents ;
- au moins une source, une masse, et un chemin fermé ;
- 4 à 12 dipôles, lisible sur une grille de 24 px par cellule ;
- valeurs réalistes (1 kΩ, 10 kΩ, 12 V, 100 nF…).`;

export async function buildFromPrompt(options: BuildOptions): Promise<BuildResult> {
  const started = Date.now();
  const prompt = options.prompt.trim().slice(0, 600);
  if (!prompt) {
    return {
      ok: false,
      source: 'local',
      explanation: 'Décrivez le montage en une phrase.',
      issues: [],
      warnings: [],
      error: 'Description vide.',
      ms: 0,
    };
  }

  const local = localBuild(prompt, options.values ?? {});

  if (!options.allowModel) {
    return { ...local, explanation: `${local.explanation} (Moteur local : l’assistant n’est pas activé.)` };
  }

  try {
    const answer = await askModel(
      SYSTEM_PROMPT,
      `Construis ce montage : ${prompt}\n\nRappel : JSON pur, aucune phrase autour.`,
      { provider: options.provider ?? 'auto', personalKeys: options.personalKeys, timeoutMs: options.timeoutMs ?? 25_000 },
    );
    const parsed = extractJson(answer.text);
    if (!parsed) {
      return {
        ...local,
        raw: answer.text.slice(0, 500),
        provider: answer.provider,
        model: answer.model,
        explanation: `${local.explanation} Le modèle n’a pas renvoyé de JSON exploitable, le moteur local a pris le relais.`,
        warnings: [...local.warnings, 'Réponse du modèle ignorée (format inattendu).'],
        ms: Date.now() - started,
      };
    }

    const validated = circuitDocSchema.safeParse(parsed);
    if (!validated.success) {
      return {
        ...local,
        raw: answer.text.slice(0, 500),
        provider: answer.provider,
        model: answer.model,
        explanation: `${local.explanation} Le montage proposé par le modèle ne respectait pas le schéma (${validated.error.issues[0]?.message ?? 'champ manquant'}), le moteur local a pris le relais.`,
        warnings: [...local.warnings, 'Montage du modèle rejeté par la validation.'],
        ms: Date.now() - started,
      };
    }

    const doc = validated.data as CircuitDoc;
    const issues = diagnose(doc);
    const errors = issues.filter((issue) => issue.level === 'error');
    const solution = solveDocument(doc, { sourcesOn: true });

    // un montage qui ne se calcule pas n'est pas « réussi » : on préfère le
    // gabarit local, qui est garanti calculable.
    if (errors.length || !solution.ok) {
      return {
        ...local,
        raw: answer.text.slice(0, 500),
        provider: answer.provider,
        model: answer.model,
        explanation: `${local.explanation} Le montage du modèle ne se calcule pas${
          errors.length ? ` (${errors[0].message})` : ''
        }, le gabarit local a été conservé.`,
        warnings: [...local.warnings, 'Montage du modèle non calculable.'],
        ms: Date.now() - started,
      };
    }

    return {
      ok: true,
      doc: { ...doc, name: doc.name || 'Montage proposé' },
      source: 'modele',
      explanation: `Montage proposé par ${answer.provider} (${answer.model}) et vérifié par le solveur : ${doc.components.length} dipôles, calcul disponible.`,
      raw: answer.text.slice(0, 1200),
      provider: answer.provider,
      model: answer.model,
      issues: issues.map((issue) => ({ level: issue.level, message: issue.message })),
      warnings: solution.warnings ?? [],
      ms: Date.now() - started,
    };
  } catch (error) {
    return {
      ...local,
      explanation: `${local.explanation} Modèle injoignable (${error instanceof Error ? error.message.slice(0, 140) : 'erreur'}), le moteur local a répondu.`,
      warnings: [...local.warnings, 'Assistant indisponible : repli local.'],
      ms: Date.now() - started,
    };
  }
}

/** Extrait le premier objet JSON équilibré d'une réponse de modèle. */
export function extractJson(text: string): unknown | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(candidate.slice(start, index + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Exemples affichés dans l'atelier : ils tiennent tous en une ligne. */
export const BUILD_EXAMPLES: Array<{ label: string; prompt: string }> = [
  { label: 'Diviseur 12 V → 3 V', prompt: 'Un diviseur de tension alimenté en 12 V qui donne 3 V en sortie.' },
  { label: 'Thévenin + charge', prompt: 'Un générateur de Thévenin avec une résistance de charge, pour mesurer Eth et Rth.' },
  { label: 'Norton parallèle', prompt: 'Deux résistances en parallèle alimentées par une source de courant (modèle de Norton).' },
  { label: 'Pont de Wheatstone', prompt: 'Un pont de Wheatstone à quatre résistances pour mesurer une résistance inconnue.' },
  { label: 'RC + coupure', prompt: 'Un circuit RC série en alternatif à 1 kHz avec un condensateur de 100 nF.' },
  { label: 'Millman', prompt: 'Deux sources de tension et une résistance, à résoudre par le théorème de Millman.' },
];

/** Liste des gabarits disponibles, pour l'aide de l'atelier. */
export function templateCatalogue(): Array<{ slug: string; title: string }> {
  return TEMPLATES.map((template) => ({ slug: template.slug, title: template.title }));
}
