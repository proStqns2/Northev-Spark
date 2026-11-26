import type { FastifyInstance } from 'fastify';
import { providerStatus } from '@/lib/ai/providers';
import { cloudEnabled } from '@/lib/db/supabase';
import { TEMPLATES } from '@/lib/data/templates';
import { circuitDocSchema, importSchema } from '@/lib/validation';
import { DEFAULT_COMPONENT_VALUE, type CircuitDoc, type COMPONENT_META } from '@/lib/engine/types';
import { templateDoc } from '@/lib/data/loadDoc';
import { cachedEquivalent } from '@/lib/cache';
import { abs } from '@/lib/engine/complex';
import { bodyOf, fail } from '../helpers';

export async function registerMiscRoutes(app: FastifyInstance) {
  app.get('/api/health', async (_request, reply) => {
    const providers = providerStatus();
    return reply.send({
      ok: true,
      app: 'northev-spark',
      version: '1.0.0',
      engine: 'MNA complexe — continu & sinusoïdal établi',
      templates: TEMPLATES.length,
      integrations: {
        supabase: cloudEnabled(),
        openai: providers.openai,
        gemini: providers.gemini,
        localAgents: true,
      },
      time: new Date().toISOString(),
    });
  });

  app.post('/api/import', async (request, reply) => {
    const body = bodyOf<{ text?: string; doc?: unknown; name?: string; fromTemplate?: string }>(request);

    if (body.fromTemplate) {
      const doc = templateDoc(body.fromTemplate);
      if (!doc) return fail(reply, 404, 'Gabarit introuvable.');
      if (body.name) doc.name = body.name;
      const eq = cachedEquivalent(doc);
      return reply.send({
        doc,
        stats: {
          components: doc.components.length,
          equivalent: eq.ok ? { vth: abs(eq.vth), rth: abs(eq.rth), inorton: abs(eq.inorton) } : null,
        },
      });
    }

    if (body.doc) {
      const parsed = importSchema.safeParse({ doc: body.doc, name: body.name, fromTemplate: body.fromTemplate });
      if (!parsed.success) return fail(reply, 422, 'Document JSON invalide.');
      const doc = parsed.data.doc as CircuitDoc;
      if (body.name) doc.name = body.name;
      const eq = cachedEquivalent(doc);
      return reply.send({
        doc,
        stats: {
          components: doc.components.length,
          equivalent: eq.ok ? { vth: abs(eq.vth), rth: abs(eq.rth), inorton: abs(eq.inorton) } : null,
        },
      });
    }

    const text = (body.text ?? '').trim();
    if (!text) {
      return fail(reply, 422, 'Collez un export JSON ou une liste de composants (référence, A, B, valeur).');
    }

    try {
      const maybeJson = JSON.parse(text);
      const parsed = circuitDocSchema.safeParse(maybeJson?.doc ?? maybeJson);
      if (parsed.success) {
        const doc = parsed.data as CircuitDoc;
        if (body.name) doc.name = body.name;
        const eq = cachedEquivalent(doc);
        return reply.send({
          doc,
          stats: {
            components: doc.components.length,
            equivalent: eq.ok ? { vth: abs(eq.vth), rth: abs(eq.rth), inorton: abs(eq.inorton) } : null,
          },
        });
      }
    } catch {
      // pas du JSON → format texte
    }

    const result = parseTextImport(text, body.name);
    if ('error' in result) return fail(reply, 422, result.error, { warnings: result.warnings });
    return reply.send(result);
  });
}

const KIND_ALIASES: Record<string, keyof typeof COMPONENT_META> = {
  r: 'resistor', resistor: 'resistor', resistance: 'resistor', resistorc: 'resistor',
  c: 'capacitor', capacitor: 'capacitor', capa: 'capacitor', condensateur: 'capacitor',
  l: 'inductor', inductor: 'inductor', bobine: 'inductor', coil: 'inductor',
  v: 'vsource', vsource: 'vsource', voltage: 'vsource', tension: 'vsource', e: 'vsource', source: 'vsource',
  i: 'isource', isource: 'isource', current: 'isource', courant: 'isource',
  wire: 'wire', w: 'wire', fil: 'wire', gnd: 'wire', masse: 'wire',
  sw: 'switch', switch: 'switch', interrupteur: 'switch', s: 'switch', k: 'switch',
  lamp: 'lamp', lampe: 'lamp', lp: 'lamp', la: 'lamp',
  amp: 'ammeter', ammeter: 'ammeter', a: 'ammeter',
  volt: 'voltmeter', voltmeter: 'voltmeter',
  pot: 'potentiometer', potentiometer: 'potentiometer', p: 'potentiometer',
};

const SI_MULTIPLIERS: Record<string, number> = {
  p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9,
};

function parseSiValue(raw: string, warnings: string[], ref: string): number | null {
  const cleaned = raw.replace(/,/g, '.').replace(/(Ω|V|A|F|H|Ohm|ohm)/gi, '').trim();
  const match = cleaned.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*([pnuµmkKMG]?)$/i);
  if (!match) {
    warnings.push(`Valeur illisible pour ${ref} : « ${raw} » — valeur par défaut appliquée.`);
    return null;
  }
  return Number(match[1]) * (SI_MULTIPLIERS[match[2] ?? ''] ?? 1);
}

type ImportOk = {
  doc: CircuitDoc & { name: string };
  stats: { components: number; equivalent: { vth: number; rth: number; inorton: number } | null };
  warnings: string[];
};
type ImportErr = { error: string; warnings: string[] };

function parseTextImport(text: string, forcedName?: string): ImportOk | ImportErr {
  const components: Array<{ id: string; kind: keyof typeof COMPONENT_META; a: string; b: string; value: number }> = [];
  const warnings: string[] = [];
  let name = forcedName ?? 'Montage importé';

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    if (line.startsWith('#')) {
      if (forcedName) continue;
      name = line.replace(/^#+\s*/, '').slice(0, 120) || name;
      continue;
    }
    const parts = line.split(/[\s;|\t]+/).filter(Boolean);
    if (parts.length < 4) {
      warnings.push(`Ligne ignorée (format attendu : réf A B valeur) : « ${line.slice(0, 40)} »`);
      continue;
    }
    const [refRaw, aRaw, bRaw, valueRaw] = parts;
    const ref = refRaw.replace(/[^A-Za-z0-9_]/g, '') || 'X';
    const kindKey = ref.replace(/[0-9]+$/, '').toLowerCase();
    const kind = KIND_ALIASES[kindKey] ?? KIND_ALIASES[ref.toLowerCase()];
    if (!kind) {
      warnings.push(`Composant « ${ref} » inconnu (utilisez R, C, L, E, I, W…).`);
      continue;
    }
    const value = parseSiValue(valueRaw, warnings, ref);
    const norm = (cell: string) => cell.replace(/;/g, ',').replace(/[()]/g, '');
    const a = norm(aRaw);
    const b = norm(bRaw);
    if (!/^-?\d+,-?\d+$/.test(a) || !/^-?\d+,-?\d+$/.test(b)) {
      warnings.push(`Nœuds illisibles pour ${ref} : « ${aRaw} » / « ${bRaw} » (format attendu x,y).`);
      continue;
    }
    components.push({ id: ref, kind, a, b, value: value ?? DEFAULT_COMPONENT_VALUE(kind) });
  }

  if (!components.length) {
    return { error: 'Aucun composant reconnu dans le texte fourni.', warnings };
  }

  const nodeSet = new Set<string>();
  const degree = new Map<string, number>();
  components.forEach((c) => {
    nodeSet.add(c.a);
    nodeSet.add(c.b);
    degree.set(c.a, (degree.get(c.a) ?? 0) + 1);
    degree.set(c.b, (degree.get(c.b) ?? 0) + 1);
  });
  const nodes = [...nodeSet];
  const ground = nodes[0] ?? '0,0';
  const sourceNodes = new Set<string>();
  components.forEach((c) => {
    if (c.kind === 'vsource') {
      sourceNodes.add(c.a);
      sourceNodes.add(c.b);
    }
  });
  const candidates = nodes
    .filter((n) => n !== ground)
    .sort((a, b) => {
      const touchA = sourceNodes.has(a) ? 1 : 0;
      const touchB = sourceNodes.has(b) ? 1 : 0;
      if (touchA !== touchB) return touchA - touchB;
      const dA = Math.abs((degree.get(a) ?? 0) - 2);
      const dB = Math.abs((degree.get(b) ?? 0) - 2);
      if (dA !== dB) return dA - dB;
      return (degree.get(b) ?? 0) - (degree.get(a) ?? 0);
    });
  const terminalA = candidates[0] ?? components[0].b;
  const doc: CircuitDoc & { name: string } = {
    name,
    components,
    ground,
    terminals: { a: terminalA, b: ground },
    regime: 'dc',
    frequency: 50,
  };
  const eq = cachedEquivalent(doc);
  return {
    doc,
    stats: {
      components: doc.components.length,
      equivalent: eq.ok ? { vth: abs(eq.vth), rth: abs(eq.rth), inorton: abs(eq.inorton) } : null,
    },
    warnings,
  };
}
