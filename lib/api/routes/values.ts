import type { ApiRoute } from '../http';

import { VALUE_DEFAULTS, VALUE_RANGES, buildValueModel } from '@/lib/express/model';
import { normalizeValueInput, validateValueInput } from '@/lib/express/params';
import { bodyOf, fail } from '../helpers';

/**
 * Barre de valeurs R · C · L — API du site.
 *
 * Le calcul lui-même vit dans `lib/express/model` (partagé avec le service
 * Express). Cette route a deux rôles :
 *  1. servir le studio quand le service Express n'est pas lancé ;
 *  2. **relayer** vers Express (`EXPRESS_URL`) quand il tourne : le service
 *     reste alors le leader du montage, et la réponse porte `source: 'express'`.
 */

const EXPRESS_URL = (process.env.EXPRESS_URL ?? process.env.NEXT_PUBLIC_EXPRESS_URL ?? '')
  .trim()
  .replace(/\/$/, '');
const FORWARD_TIMEOUT_MS = 2500;

const hasExpress = () => Boolean(EXPRESS_URL);

async function forwardToExpress(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown; query?: string },
): Promise<unknown | null> {
  if (!hasExpress()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const query = init.query ? `?${init.query}` : '';
    const response = await fetch(`${EXPRESS_URL}${path}${query}`, {
      method: init.method,
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.EXPRESS_SERVICE_KEY ? { 'x-spark-key': process.env.EXPRESS_SERVICE_KEY } : {}),
      },
      body: init.method === 'POST' ? JSON.stringify(init.body ?? {}) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export const valueRoutes: ApiRoute[] = [
  [
    'POST',
    '/api/values/analyze',
    async (request, reply) => {
      const body = bodyOf<Record<string, unknown>>(request);
      const payload = body.values ?? body;

      const forwarded = await forwardToExpress('/api/v1/analyze', {
        method: 'POST',
        body: { ...(typeof payload === 'object' ? payload : { values: payload }) },
      });
      if (forwarded) {
        reply.header('X-Spark-Service', 'express');
        return reply.send(forwarded);
      }

      const input = normalizeValueInput(payload);
      const problems = validateValueInput(input);
      if (problems.length) return fail(reply, 422, problems.join(' '));

      const model = buildValueModel(input, 'next');
      reply.header('X-Spark-Service', 'next');
      return reply.send(model);
    },
  ],
  [
    'GET',
    '/api/values/analyze',
    async (request, reply) => {
      const query = new URLSearchParams(request.query).toString();
      const forwarded = await forwardToExpress('/api/v1/analyze', { method: 'GET', query });
      if (forwarded) {
        reply.header('X-Spark-Service', 'express');
        return reply.send(forwarded);
      }
      const input = normalizeValueInput(request.query);
      const problems = validateValueInput(input);
      if (problems.length) return fail(reply, 422, problems.join(' '));
      reply.header('X-Spark-Service', 'next');
      return reply.send(buildValueModel(input, 'next'));
    },
  ],
  [
    'GET',
    '/api/values/defaults',
    async (_request, reply) => {
      const forwarded = await forwardToExpress('/api/v1/values', { method: 'GET' });
      if (forwarded) return reply.send(forwarded);
      return reply.send({
        defaults: VALUE_DEFAULTS,
        ranges: VALUE_RANGES,
        prefixes: ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G'],
        presets: {
          r: [10, 100, 470, 1_000, 2_200, 10_000, 47_000, 100_000],
          c: [10e-12, 1e-9, 10e-9, 100e-9, 1e-6, 10e-6, 100e-6],
          l: [1e-6, 100e-6, 1e-3, 10e-3, 100e-3, 1],
          f: [50, 60, 100, 1_000, 10_000],
        },
      });
    },
  ],
];
