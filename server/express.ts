/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Northev Spark — service Express « leader du montage »
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Ce processus est le chef d'orchestre des valeurs R, C, L :
 *
 *   POST /api/v1/analyze   → construit le montage, résout l'équivalent
 *                            (Thévenin / Norton), les indicateurs R·C·L et le
 *                            tableau U / I / P par branche.
 *   GET  /api/v1/analyze   → même calcul, valeurs passées en query string
 *                            (`?r=4,7k&c=100n&l=10m&f=50`).
 *   POST /api/v1/preview   → rendu SVG du montage pour la vignette de la barre.
 *   GET  /api/v1/values    → valeurs par défaut, bornes et préfixes SI admis
 *                            (le studio s'en sert pour l'autocomplétion).
 *   GET  /api/v1/templates → gatabars de la bibliothèque, résolus à la volée.
 *   GET  /api/v1/health    → état de service (version du moteur, uptime).
 *
 * Il n'y a **qu'un seul moteur** : ce service importe `lib/engine` du dépôt et
 * les mêmes routes `lib/api` que Next. Il ne réimplémente aucun calcul ; il les
 * expose derrière Express, avec validation, cache et mesures de temps.
 *
 * Démarrage :
 *   npm run express            # http://0.0.0.0:4001  (+ relais Next si lancé)
 *   npm run express:prod       # tsx compilé, utilisé en production
 *
 * Le site Next reste servi sur son propre port : le studio appelle Express en
 * direct (`NEXT_PUBLIC_EXPRESS_URL`) et bascule automatiquement sur
 * `POST /api/values/analyze` si le service n'est pas joignable.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { buildValueModel, VALUE_DEFAULTS, type ValueModel } from '@/lib/express/model';
import { normalizeValueInput, validateValueInput } from '@/lib/express/params';
import { TEMPLATES } from '@/lib/data/templates';
import { circuitToSvg } from '@/lib/studio/export';
import { equivalentOf } from '@/lib/engine/equivalent';
import { formatSI } from '@/lib/engine/format';

const PORT = Number(process.env.EXPRESS_PORT ?? process.env.PORT ?? 4001);
const HOST = process.env.EXPRESS_HOST ?? '0.0.0.0';
const STARTED_AT = Date.now();

/** Origines autorisées (aperçu E2B, dev local, production configurable). */
const ALLOWED_ORIGIN = (process.env.EXPRESS_ALLOWED_ORIGIN ?? '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

/** Jeton facultatif : s'il est défini, les POST l'exigent (`x-spark-key`). */
const SERVICE_KEY = process.env.EXPRESS_SERVICE_KEY?.trim() ?? '';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '256kb' }));
app.use(express.text({ type: ['text/*', 'application/x-www-form-urlencoded'], limit: '64kb' }));

/* ------------------------------------------------------------------ utilitaires */

/** CORS ouvert aux origines d'aperçu (`*.e2b.app`, `*.e2b.dev`) et au dev local. */
function corsOrigin(origin: string | undefined): string {
  if (!origin) return '*';
  if (!ALLOWED_ORIGIN.length) {
    const preview = /^https?:\/\/([a-z0-9-]+\.)*(e2b\.app|e2b\.dev|localhost|127\.0\.0\.1)(:\d+)?$/i;
    return preview.test(origin) || origin === 'null' ? origin : '*';
  }
  if (ALLOWED_ORIGIN.includes(origin) || ALLOWED_ORIGIN.includes('*')) return origin;
  return ALLOWED_ORIGIN[0];
}

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', corsOrigin(req.headers.origin));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-spark-key');
  res.setHeader('Access-Control-Max-Age', '600');
  res.setHeader('X-Spark-Service', 'express');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

/** Petit journal : méthode, chemin, statut, durée. */
app.use((req, res, next) => {
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    console.log(
      `[express] ${req.method} ${req.originalUrl.split('?')[0]} → ${res.statusCode} · ${ms.toFixed(1)} ms`,
    );
  });
  next();
});

function keyIsValid(header: string | undefined): boolean {
  if (!SERVICE_KEY) return true;
  if (!header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(SERVICE_KEY);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function requireKey(req: Request, res: Response, next: NextFunction) {
  if (!keyIsValid(req.headers['x-spark-key'] as string | undefined)) {
    res.status(401).json({ error: 'Clé de service absente ou invalide (en-tête x-spark-key).' });
    return;
  }
  next();
}

/** Rassemble les entrées : corps JSON, texte libre ou query string. */
function readInput(req: Request): unknown {
  if (req.method === 'GET') return req.query;
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') {
    const body = req.body as Record<string, unknown>;
    return body.values ?? body;
  }
  return {};
}

/** Cache court : deux frappes identiques ne recalculent pas. */
const CACHE_MAX = 200;
const cache = new Map<string, { at: number; model: ValueModel }>();
const CACHE_TTL = 30_000;

function analyze(input: unknown): ValueModel {
  const normalized = normalizeValueInput(input);
  const problems = validateValueInput(normalized);
  if (problems.length) {
    const error = new Error(problems.join(' '));
    (error as Error & { status?: number }).status = 422;
    throw error;
  }
  const key = JSON.stringify(normalized);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.model;
  const model = buildValueModel(normalized, 'express');
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), model });
  return model;
}

/* --------------------------------------------------------------------- routes */

const VERSION = '1.0.0';

app.get('/api/v1/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'northev-spark-express',
    version: VERSION,
    engine: 'MNA complexe — lib/engine du dépôt, aucune copie',
    uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000),
    cacheEntries: cache.size,
    keyRequired: Boolean(SERVICE_KEY),
  });
});

app.get('/api/v1/values', (_req, res) => {
  res.json({
    defaults: VALUE_DEFAULTS,
    ranges: {
      r: { min: 1e-3, max: 1e9, unit: 'Ω' },
      c: { min: 1e-15, max: 1, unit: 'F' },
      l: { min: 1e-12, max: 1e3, unit: 'H' },
      e: { min: -1e4, max: 1e4, unit: 'V' },
      i: { min: -1e3, max: 1e3, unit: 'A' },
    },
    prefixes: ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G'],
    presets: {
      r: [10, 100, 470, 1_000, 2_200, 10_000, 47_000, 100_000],
      c: [10e-12, 1e-9, 10e-9, 100e-9, 1e-6, 10e-6, 100e-6],
      l: [1e-6, 100e-6, 1e-3, 10e-3, 100e-3, 1],
      f: [50, 60, 100, 1_000, 10_000],
    },
  });
});

app.get('/api/v1/analyze', (req, res, next) => {
  try {
    const model = analyze(req.query);
    res.setHeader('Cache-Control', 'public, max-age=15');
    res.json(serialize(model));
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/analyze', requireKey, (req, res, next) => {
  try {
    const model = analyze(readInput(req));
    res.setHeader('Cache-Control', 'no-store');
    const source = typeof req.body === 'object' && req.body ? (req.body as { source?: string }).source : undefined;
    res.json({ ...serialize(model), source: source === 'studio' ? 'express' : 'express' });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/preview', requireKey, (req, res, next) => {
  try {
    const model = analyze(readInput(req));
    const svg = circuitToSvg(model.doc, model.equivalent, {
      showLabels: true,
      showValues: true,
      theme: (req.body?.theme ?? req.query.theme) === 'light' ? 'light' : 'dark',
    });
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(svg);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/templates', (_req, res) => {
  res.json({
    count: TEMPLATES.length,
    templates: TEMPLATES.map((template) => {
      const doc = template.build();
      const equivalent = equivalentOf(doc);
      return {
        slug: template.slug,
        title: template.title,
        subtitle: template.subtitle,
        family: template.family,
        regime: template.regime,
        components: doc.components.length,
        equivalent: equivalent.ok
          ? {
              vth: formatSI(Math.hypot(equivalent.vth.re, equivalent.vth.im), 'V', { digits: 3 }),
              rth: formatSI(Math.hypot(equivalent.rth.re, equivalent.rth.im), 'Ω', { digits: 3 }),
              inorton: formatSI(Math.hypot(equivalent.inorton.re, equivalent.inorton.im), 'A', { digits: 3 }),
            }
          : null,
      };
    }),
  });
});

/** Relais vers le site Next : Express reste le point d'entrée unique en prod. */
const NEXT_URL = (process.env.NEXT_INTERNAL_URL ?? '').trim();
if (NEXT_URL) {
  app.use(async (req, res) => {
    try {
      const target = new URL(req.originalUrl, NEXT_URL);
      const response = await fetch(target, {
        method: req.method,
        headers: { ...(req.headers as Record<string, string>), host: new URL(NEXT_URL).host },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body ?? {}),
        redirect: 'manual',
      });
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'content-encoding') res.setHeader(key, value);
      });
      const body = Buffer.from(await response.arrayBuffer());
      res.end(body);
    } catch (error) {
      res.status(502).json({ error: `Site Next inaccessible : ${(error as Error).message}` });
    }
  });
}

/** Page d'accueil du service : documentation minimale et lisible. */
app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Northev Spark · service Express</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;background:#060b14;color:#e9f0fc;font:14px/1.6 ui-sans-serif,system-ui,sans-serif;
       display:flex;align-items:center;justify-content:center;min-height:100vh;padding:32px}
  main{max-width:680px;width:100%}
  h1{font-size:24px;margin:0 0 6px}
  p{color:#9db0c9;margin:0 0 22px}
  code{font-family:ui-monospace,monospace;background:#0d1826;border:1px solid #20334d;
       border-radius:6px;padding:2px 6px;color:#38e1e6}
  ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}
  li{background:#0b1421;border:1px solid #1d2f47;border-radius:10px;padding:10px 12px}
  li b{color:#e9f0fc;font-weight:600}
  li span{display:block;color:#8ba0bb;font-size:12.5px}
  a{color:#38e1e6}
</style></head><body><main>
<h1>⚡ Northev Spark — service Express</h1>
<p>Le chef d'orchestre des montages <b>R · C · L</b>. Même moteur nodal que le site,
exposé en JSON.</p>
<ul>
  <li><b>GET /api/v1/analyze?r=4,7k&amp;c=100n&amp;l=10m&amp;f=50</b><span>équivalent Thévenin/Norton + indicateurs</span></li>
  <li><b>POST /api/v1/analyze</b><span>corps JSON { r, c, l, e, f, regime }</span></li>
  <li><b>POST /api/v1/preview</b><span>SVG du montage construit</span></li>
  <li><b>GET /api/v1/values</b><span>défauts, bornes, préfixes SI</span></li>
  <li><b>GET /api/v1/templates</b><span>bibliothèque résolue</span></li>
  <li><b>GET /api/v1/health</b><span>état du service</span></li>
</ul>
<p style="margin-top:22px">Le studio : <a href="/studio">/studio</a></p>
</main></body></html>`);
});

/* ---------------------------------------------------------------- gestion d'erreur */

app.use((req, res) => {
  res.status(404).json({ error: `Route inconnue : ${req.method} ${req.path}` });
});

app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  const status = error.status ?? 500;
  if (status >= 500) console.error('[express] erreur', error);
  res.status(status).json({ error: error.message || 'Erreur interne du service.' });
});

/* ---------------------------------------------------------------- sérialisation */

/** Les complexes se sérialisent en { re, im } : le front lit re/im directement. */
function serialize(model: ValueModel) {
  return {
    ...model,
    engine: { name: 'MNA', version: VERSION, ac: model.input.regime === 'ac' },
  };
}

const server = app.listen(PORT, HOST, () => {
  console.log(`▸ Service Express sur http://${HOST}:${PORT}`);
  console.log(`  · analyse   POST /api/v1/analyze   · GET /api/v1/analyze?r=1k&c=100n&l=10m`);
  console.log(`  · vignette  POST /api/v1/preview`);
  if (SERVICE_KEY) console.log('  · en-tête x-spark-key requis pour les POST');
  if (NEXT_URL) console.log(`  · relais Next → ${NEXT_URL}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n[express] ${signal} reçu, arrêt propre.`);
    server.close(() => process.exit(0));
  });
}

export { app, server };
