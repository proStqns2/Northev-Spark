import type { Metadata } from 'next';
import { BibliothequeClient } from './BibliothequeClient';
import { TEMPLATES } from '@/lib/data/templates';
import { cachedEquivalent } from '@/lib/cache';
import { abs } from '@/lib/engine/complex';

export const metadata: Metadata = {
  title: 'Bibliothèque de montages',
  description:
    'Quinze montages prêts à analyser : diviseur de Thévenin, Norton parallèle, pont de Wheatstone, RLC en alternatif, sources liées, Millman…',
};

export default function BibliothequePage() {
  const items = TEMPLATES.map((template) => {
    const doc = template.build();
    const eq = cachedEquivalent(doc);
    return {
      slug: template.slug,
      title: template.title,
      subtitle: template.subtitle,
      family: template.family,
      accent: template.accent,
      shape: template.shape,
      difficulty: template.difficulty,
      regime: template.regime,
      summary: template.summary,
      teaching: template.teaching,
      componentCount: doc.components.length,
      expected: eq.ok
        ? {
            vth: formatOrDash(abs(eq.vth)),
            rth: formatOrDash(abs(eq.rth)),
            inorton: Number.isFinite(abs(eq.inorton)) ? formatOrDash(abs(eq.inorton)) : '∞',
            status: eq.status,
          }
        : null,
      preview: JSON.stringify(doc),
    };
  });

  return <BibliothequeClient templates={items} />;
}

function formatOrDash(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  if (value === 0) return '0';
  return Number(value.toPrecision(4)).toLocaleString('fr-FR', { maximumFractionDigits: 3 });
}
