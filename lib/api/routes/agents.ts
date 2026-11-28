import type { ApiRoute } from '../http';

import { agentCatalogue, runAgentLocally, type AgentId } from '@/lib/agents/runtime';
import { AGENTS } from '@/lib/ai/agents';
import type { CircuitDoc } from '@/lib/engine/types';
import { bodyOf, fail } from '../helpers';

/**
 * Agents — API du site (Next.js) avec délégation au service Express.
 *
 * Architecture voulue : **un seul runtime** (`lib/agents/runtime.ts`) exposé par
 * deux serveurs.
 *
 *   navigateur → /api/agents/:id/run  (Next.js)
 *                     ├─ Express présent  → POST :4001/api/v1/agents/:id/run  (source: express)
 *                     └─ Express absent   → exécution locale              (source: next)
 *
 * Le calcul est identique dans les deux cas : Express n'est pas un second
 * moteur, c'est le même module chargé dans un autre processus. La réponse
 * indique toujours qui a répondu (`servedBy`) et pourquoi, ce qui rend
 * l'intégration vérifiable depuis l'interface.
 */

const EXPRESS_URL = (process.env.EXPRESS_URL ?? process.env.NEXT_PUBLIC_EXPRESS_URL ?? '')
  .trim()
  .replace(/\/$/, '');
const FORWARD_TIMEOUT_MS = Number(process.env.EXPRESS_TIMEOUT_MS ?? 1800);

const isAgentId = (value: string): value is AgentId => AGENTS.some((agent) => agent.id === value);

async function forward(path: string, init: { method: 'GET' | 'POST'; body?: unknown }): Promise<unknown | null> {
  if (!EXPRESS_URL) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORWARD_TIMEOUT_MS);
  try {
    const response = await fetch(`${EXPRESS_URL}${path}`, {
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

export const agentRoutes: ApiRoute[] = [
  [
    'GET',
    '/api/agents',
    async (_request, reply) => {
      const remote = await forward('/api/v1/agents', { method: 'GET' });
      reply.header('Cache-Control', 'no-store');
      reply.header('X-Spark-Service', remote ? 'express' : 'next');
      return reply.send({
        ok: true,
        servedBy: remote ? 'express' : 'next',
        express: { configured: Boolean(EXPRESS_URL), reachable: Boolean(remote) },
        agents: agentCatalogue(),
      });
    },
  ],

  [
    'GET',
    '/api/agents/health',
    async (_request, reply) => {
      const started = Date.now();
      const remote = await forward('/api/v1/health', { method: 'GET' });
      reply.header('Cache-Control', 'no-store');
      return reply.send({
        ok: true,
        next: { alive: true },
        express: {
          configured: Boolean(EXPRESS_URL),
          reachable: Boolean(remote),
          latencyMs: Date.now() - started,
          url: EXPRESS_URL || null,
        },
      });
    },
  ],

  [
    'POST',
    '/api/agents/:id/run',
    async (request, reply) => {
      const id = request.params.id ?? '';
      if (!isAgentId(id)) return fail(reply, 404, `Agent inconnu : ${id}.`);

      const body = bodyOf<{ task?: string; doc?: CircuitDoc; values?: unknown; agent?: string }>(request);
      const payload = { task: body.task, doc: body.doc, values: body.values };

      const remote = (await forward(`/api/v1/agents/${id}/run`, { method: 'POST', body: payload })) as
        | { outcome?: unknown }
        | null;
      reply.header('Cache-Control', 'no-store');
      if (remote?.outcome) {
        reply.header('X-Spark-Service', 'express');
        return reply.send({ ok: true, servedBy: 'express', outcome: remote.outcome });
      }
      try {
        const outcome = runAgentLocally(id, payload);
        reply.header('X-Spark-Service', 'next');
        return reply.send({
          ok: true,
          servedBy: 'next',
          fallbackReason: EXPRESS_URL ? 'service Express injoignable ou en erreur' : 'EXPRESS_URL non défini',
          outcome,
        });
      } catch (error) {
        return fail(reply, 500, error instanceof Error ? error.message : 'Exécution impossible.');
      }
    },
  ],

  [
    'GET',
    '/api/agents/:id/run',
    async (request, reply) => {
      const id = request.params.id ?? '';
      if (!isAgentId(id)) return fail(reply, 404, `Agent inconnu : ${id}.`);
      try {
        const outcome = runAgentLocally(id, { task: request.query.task });
        reply.header('Cache-Control', 'no-store');
        reply.header('X-Spark-Service', 'next');
        return reply.send({ ok: true, servedBy: 'next', outcome });
      } catch (error) {
        return fail(reply, 500, error instanceof Error ? error.message : 'Exécution impossible.');
      }
    },
  ],
];
