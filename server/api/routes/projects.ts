import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  addProjectMember,
  attachCircuitsToProject,
  createCircuit,
  createProject,
  deleteProject,
  findUserByEmail,
  getProject,
  listCircuits,
  listProjects,
  updateProject,
} from '@/lib/db/repo';
import { TEMPLATES } from '@/lib/data/templates';
import { templateDoc } from '@/lib/data/loadDoc';
import { bodyOf, currentUser, fail } from '../helpers';

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(400).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(24).optional(),
  templateSlug: z.string().max(64).optional(),
  starterCircuits: z.array(z.string().max(64)).max(12).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(400).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  icon: z.string().max(24).optional(),
  archived: z.boolean().optional(),
});

const attachSchema = z.object({ circuitIds: z.array(z.string().max(64)).min(1).max(50) });

const memberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  role: z.enum(['editor', 'viewer']).optional(),
});

export async function registerProjectRoutes(app: FastifyInstance) {
  app.get('/api/projects', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const projects = await listProjects(user.id);
    reply.header('Cache-Control', 'no-store');
    return reply.send({
      projects: projects.map((p) => ({
        ...p,
        memberCount: p.members.length,
        isOwner: p.ownerId === user.id,
      })),
      templates: TEMPLATES.map((t) => ({ slug: t.slug, title: t.title, subtitle: t.subtitle, accent: t.accent })),
    });
  });

  app.post('/api/projects', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const parsed = createSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Données invalides.');
    }
    const project = await createProject({
      owner: user,
      name: parsed.data.name,
      description: parsed.data.description,
      color: parsed.data.color,
      icon: parsed.data.icon,
    });

    const slugs = parsed.data.starterCircuits?.length
      ? parsed.data.starterCircuits
      : parsed.data.templateSlug
        ? [parsed.data.templateSlug]
        : [];
    for (const slug of slugs) {
      const doc = templateDoc(slug);
      if (!doc) continue;
      await createCircuit({
        ownerId: user.id,
        name: doc.name,
        notes: doc.notes ?? '',
        doc,
        templateSlug: slug,
        projectId: project.id,
      });
    }
    return reply.code(201).send({ project });
  });

  app.get('/api/projects/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const { id } = request.params as { id: string };
    const project = await getProject(id, user.id);
    if (!project) return fail(reply, 404, 'Projet introuvable.');

    const circuits = await listCircuits(user.id, { projectId: id });
    const summary = (await listProjects(user.id)).find((p) => p.id === id);

    reply.header('Cache-Control', 'no-store');
    return reply.send({
      project: {
        ...project,
        isOwner: project.ownerId === user.id,
        circuits: summary?.circuits ?? circuits.length,
        openRooms: summary?.openRooms ?? 0,
        lastActivity: summary?.lastActivity ?? project.updatedAt,
      },
      circuits: circuits.map((c) => ({
        id: c.id,
        name: c.name,
        notes: c.notes,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        starred: c.starred,
        status: c.status,
        lastResult: c.lastResult,
        collaborators: c.collaborators.length,
        preview: c.doc,
      })),
    });
  });

  app.patch('/api/projects/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const { id } = request.params as { id: string };
    const parsed = patchSchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'Données invalides.');
    const ok = await updateProject(id, user.id, parsed.data);
    if (!ok) return fail(reply, 403, 'Modification refusée.');
    return reply.send({ ok: true });
  });

  app.delete('/api/projects/:id', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const { id } = request.params as { id: string };
    const ok = await deleteProject(id, user.id);
    if (!ok) return fail(reply, 403, 'Suppression réservée au propriétaire.');
    return reply.send({ ok: true });
  });

  app.post('/api/projects/:id/circuits', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const { id } = request.params as { id: string };
    const parsed = attachSchema.safeParse(bodyOf(request));
    if (!parsed.success) return fail(reply, 422, 'Sélection invalide.');
    const moved = await attachCircuitsToProject(id, user.id, parsed.data.circuitIds);
    return reply.send({ moved });
  });

  app.post('/api/projects/:id/members', async (request, reply) => {
    const user = await currentUser(request);
    if (!user) return fail(reply, 401, 'Non authentifié.');
    const { id } = request.params as { id: string };
    const parsed = memberSchema.safeParse(bodyOf(request));
    if (!parsed.success) {
      return fail(reply, 422, parsed.error.issues[0]?.message ?? 'Données invalides.');
    }
    const project = await getProject(id, user.id);
    if (!project) return fail(reply, 404, 'Projet introuvable.');
    const target = await findUserByEmail(parsed.data.email);
    if (!target) {
      return fail(
        reply,
        404,
        'Aucun compte ne correspond à cette adresse. Demandez-lui de créer un compte Northev Spark.',
      );
    }
    const ok = await addProjectMember(id, user.id, {
      id: target.id,
      name: target.name,
      role: parsed.data.role,
    });
    if (!ok) return fail(reply, 403, 'Invitation impossible (droits insuffisants).');
    return reply.send({ ok: true, member: { id: target.id, name: target.name } });
  });
}
