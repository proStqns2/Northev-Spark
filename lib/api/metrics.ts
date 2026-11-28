/**
 * Métriques applicatives.
 *
 * Un anneau de mesures suffit pour répondre aux questions qui comptent en
 * exploitation : quelle route est lente, quel taux d’erreur, combien de
 * requêtes par minute. Aucun service externe, aucune dépendance : le coût
 * d’un enregistrement est de quelques microsecondes.
 */

export interface RequestSample {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  at: number;
}

export interface SlowEntry {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  at: number;
}

export interface ErrorEntry {
  method: string;
  path: string;
  status: number;
  message: string;
  at: number;
}

const MAX_SAMPLES = 600;
const MAX_SLOW = 12;
const MAX_ERRORS = 25;

const samples: RequestSample[] = [];
const slow: SlowEntry[] = [];
const errors: ErrorEntry[] = [];

const counters = {
  total: 0,
  ok: 0,
  clientError: 0,
  serverError: 0,
  rateLimited: 0,
  notModified: 0,
};

const byMethod: Record<string, number> = {};
const byPath = new Map<string, { count: number; totalMs: number; maxMs: number; errors: number }>();
const startedAt = Date.now();

/** Les identifiants dynamiques sont regroupés pour ne pas exploser la table. */
export function normalizePath(pathname: string): string {
  return pathname
    .replace(/\/prj_[A-Za-z0-9]+/g, '/:projet')
    .replace(/\/cir_[A-Za-z0-9]+/g, '/:circuit')
    .replace(/\/u_[A-Za-z0-9]+/g, '/:utilisateur')
    .replace(/\/[A-Z0-9]{6,8}(?=\/|$)/g, '/:code')
    .replace(/\/(rooms|projets|projets-prives)\/[^/]+/g, '/$1/:code');
}

export function recordRequest(sample: RequestSample): void {
  const path = normalizePath(sample.path);
  const entry: RequestSample = { ...sample, path };

  counters.total += 1;
  if (sample.status === 304) counters.notModified += 1;
  else if (sample.status === 429) counters.rateLimited += 1;
  else if (sample.status >= 500) counters.serverError += 1;
  else if (sample.status >= 400) counters.clientError += 1;
  else counters.ok += 1;

  byMethod[sample.method] = (byMethod[sample.method] ?? 0) + 1;

  const aggregate = byPath.get(path) ?? { count: 0, totalMs: 0, maxMs: 0, errors: 0 };
  aggregate.count += 1;
  aggregate.totalMs += sample.durationMs;
  aggregate.maxMs = Math.max(aggregate.maxMs, sample.durationMs);
  if (sample.status >= 400) aggregate.errors += 1;
  byPath.set(path, aggregate);

  samples.push(entry);
  if (samples.length > MAX_SAMPLES) samples.shift();

  if (sample.durationMs >= 250) {
    slow.push({ ...entry });
    slow.sort((a, b) => b.durationMs - a.durationMs);
    if (slow.length > MAX_SLOW) slow.length = MAX_SLOW;
  }

  if (sample.status >= 500) {
    errors.push({
      method: entry.method,
      path: entry.path,
      status: entry.status,
      message: `statut ${entry.status}`,
      at: entry.at,
    });
    if (errors.length > MAX_ERRORS) errors.shift();
  }
}

export function recordError(method: string, path: string, status: number, message: string): void {
  errors.push({ method, path: normalizePath(path), status, message: message.slice(0, 300), at: Date.now() });
  if (errors.length > MAX_ERRORS) errors.shift();
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * ratio)));
  return Math.round(sorted[index] * 100) / 100;
}

export interface MetricsSnapshot {
  uptimeSeconds: number;
  startedAt: string;
  counter: typeof counters;
  perMinute: number;
  byMethod: Record<string, number>;
  latency: { p50: number; p90: number; p95: number; p99: number; max: number; average: number };
  routes: Array<{ path: string; count: number; averageMs: number; maxMs: number; errors: number }>;
  slowest: SlowEntry[];
  recentErrors: ErrorEntry[];
  sampleWindow: number;
}

export function metricsSnapshot(): MetricsSnapshot {
  const durations = samples.map((sample) => sample.durationMs);
  const uptimeSeconds = Math.round((Date.now() - startedAt) / 1000);
  const average = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;

  const routes = [...byPath.entries()]
    .map(([path, value]) => ({
      path,
      count: value.count,
      averageMs: Math.round((value.totalMs / Math.max(value.count, 1)) * 100) / 100,
      maxMs: Math.round(value.maxMs * 100) / 100,
      errors: value.errors,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 24);

  return {
    uptimeSeconds,
    startedAt: new Date(startedAt).toISOString(),
    counter: { ...counters },
    perMinute: Math.round((counters.total / Math.max(uptimeSeconds, 1)) * 60 * 100) / 100,
    byMethod: { ...byMethod },
    latency: {
      p50: percentile(durations, 0.5),
      p90: percentile(durations, 0.9),
      p95: percentile(durations, 0.95),
      p99: percentile(durations, 0.99),
      max: Math.round(Math.max(0, ...durations) * 100) / 100,
      average: Math.round(average * 100) / 100,
    },
    routes,
    slowest: slow.slice(0, 8),
    recentErrors: errors.slice(-10).reverse(),
    sampleWindow: samples.length,
  };
}

export function resetMetrics(): void {
  samples.length = 0;
  slow.length = 0;
  errors.length = 0;
  counters.total = 0;
  counters.ok = 0;
  counters.clientError = 0;
  counters.serverError = 0;
  counters.rateLimited = 0;
  counters.notModified = 0;
  byPath.clear();
  for (const key of Object.keys(byMethod)) delete byMethod[key];
}
