import type { ApiRoute } from '../http';

import {
  createCircuit,
  deleteCircuit,
  getCircuit,
  listCircuits,
  syncUserCloud,
  toggleStar,
  updateCircuit,
} from '@/lib/db/repo';
import { cachedEquivalent } from '@/lib/cache';
import { circuitDocSchema } from '@/lib/validation';
import type { CircuitDoc } from '@/lib/engine/types';
import { bodyOf, currentUser, fail } from '../helpers';

const PROJECT_ID = /^prj_[a-z0-9]{4,}$/i;

function lastResultOf(doc: CircuitDoc) {
  const eq = cachedEquivalent(doc);
  return eq.ok
    ? {
        vth: Math.hypot(eq.vth.re, eq.vth.im),
        rth: Math.hypot(eq.rth.re, eq.rth.im),
        inorton: Math.hypot(eq.inorton.re, eq.inorton.im),
        regime: doc.regime,
      }
    : undefined;
}

export const circuitRoutes: ApiRoute[] = [
['GET', '/api/circuits', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');

    let imported = 0;
    let cloud = false;
    if (request.query && (request.query as Record<string, string>).sync === '1') {
      const result = await syncUserCloud(user.id);
      imported = result.imported;
      cloud = result.cloud;
    }
    const q = request.query as Record<string, string> | undefined;
    const items = await listCircuits(user.id, {
      q: q?.q ?? undefined,
      starred: q?.starred === '1',
    });
    reply.header('Cache-Control', 'no-store');
    return reply.send({ circuits: items, synced: { imported, cloud } });
  }],

  ['POST', '/api/circuits', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');

    const body = bodyOf<{ doc?: unknown; notes?: unknown; templateSlug?: unknown; projectId?: unknown }>(request);
    const projectId =
      typeof body.projectId === 'string' && PROJECT_ID.test(body.projectId) ? body.projectId : undefined;
    const parsed = circuitDocSchema.safeParse(body.doc);
    if (!parsed.success) {
      return fail(reply, 422, 'Montage invalide : ' + (parsed.error.issues[0]?.message ?? ''), {
        issues: parsed.error.issues,
      });
    }
    const doc = parsed.data as CircuitDoc;
    const circuit = await createCircuit({
      ownerId: user.id,
      name: doc.name,
      notes: typeof body.notes === 'string' ? body.notes.slice(0, 2000) : (doc.notes ?? ''),
      doc,
      templateSlug: typeof body.templateSlug === 'string' ? body.templateSlug : undefined,
      projectId,
      lastResult: lastResultOf(doc),
    });
    return reply.code(201).send({ circuit });
  }],

  ['GET', '/api/circuits/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const { id } = request.params as { id: string };
    const circuit = await getCircuit(id, user.id);
    if (!circuit) return fail(reply, 404, 'Montage introuvable.');
    reply.header('Cache-Control', 'no-store');
    return reply.send({ circuit });
  }],

  ['PATCH', '/api/circuits/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const { id } = request.params as { id: string };
    const body = bodyOf<{
      doc?: unknown;
      notes?: unknown;
      starred?: unknown;
      status?: unknown;
      projectId?: unknown;
    }>(request);

    if (body.starred !== undefined && body.doc === undefined) {
      const starred = await toggleStar(id, user.id);
      if (starred === null) return fail(reply, 404, 'Montage introuvable.');
      return reply.send({ starred });
    }

    const patch: Record<string, unknown> = {};
    if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 2000);
    if (body.status === 'draft' || body.status === 'published' || body.status === 'archived') {
      patch.status = body.status;
    }
    if (body.projectId === null) patch.projectId = undefined;
    else if (typeof body.projectId === 'string' && PROJECT_ID.test(body.projectId)) {
      patch.projectId = body.projectId;
    }
    if (body.doc !== undefined) {
      const parsed = circuitDocSchema.safeParse(body.doc);
      if (!parsed.success) return fail(reply, 422, 'Montage invalide.');
      const doc = parsed.data as CircuitDoc;
      patch.doc = doc;
      patch.name = doc.name;
      const lastResult = lastResultOf(doc);
      if (lastResult) patch.lastResult = lastResult;
    }
    const circuit = await updateCircuit(id, user.id, patch);
    if (!circuit) return fail(reply, 404, 'Montage introuvable.');
    return reply.send({ circuit });
  }],

  ['DELETE', '/api/circuits/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const { id } = request.params as { id: string };
    const ok = await deleteCircuit(id, user.id);
    if (!ok) return fail(reply, 403, 'Suppression impossible.');
    return reply.send({ ok: true });
  }]
];

