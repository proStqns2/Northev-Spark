import type { FastifyInstance } from 'fastify';
import { TEMPLATES, FAMILY_LABEL } from '@/lib/data/templates';
import { cachedEquivalent } from '@/lib/cache';
import { abs } from '@/lib/engine/complex';

export async function registerTemplateRoutes(app: FastifyInstance) {
  app.get('/api/templates', async (_request, reply) => {
    const items = TEMPLATES.map((t) => {
      const doc = t.build();
      const eq = cachedEquivalent(doc);
      return {
        slug: t.slug,
        title: t.title,
        subtitle: t.subtitle,
        family: t.family,
        familyLabel: FAMILY_LABEL[t.family],
        accent: t.accent,
        shape: t.shape,
        difficulty: t.difficulty,
        regime: t.regime,
        summary: t.summary,
        teaching: t.teaching,
        components: doc.components.length,
        expected: eq.ok
          ? {
              vth: abs(eq.vth),
              rth: abs(eq.rth),
              inorton: abs(eq.inorton),
              status: eq.status,
            }
          : null,
      };
    });
    return reply.send({ templates: items });
  });
}
