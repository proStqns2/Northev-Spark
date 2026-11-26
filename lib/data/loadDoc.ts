import { CircuitDoc } from '@/lib/engine/types';
import { TEMPLATES } from './templates';
import { sanitizeDoc } from '@/lib/studio/doc';

export function templateDoc(slug: string | undefined): CircuitDoc | null {
  if (!slug) return null;
  const template = TEMPLATES.find((t) => t.slug === slug);
  if (!template) return null;
  return sanitizeDoc(template.build());
}
