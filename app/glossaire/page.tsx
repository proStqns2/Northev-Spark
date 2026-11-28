import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpen } from 'lucide-react';
import { GlossaryBrowser } from '@/components/learning/GlossaryBrowser';
import { GLOSSARY } from '@/lib/learning/glossary';

export const metadata: Metadata = {
  title: 'Glossaire',
  description:
    'Glossaire d’électrotechnique : 120 définitions reliées aux montages du studio, avec unités, formules et notions voisines.',
};

export default function GlossairePage() {
  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="chip border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan">
            <BookOpen size={12} /> Glossaire
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{GLOSSARY.length} définitions</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-soft">
            Le vocabulaire du cours, relié au studio : chaque fiche donne le sens commun, le détail utile, l’unité et
            les notions voisines. Les renvois sont cliquables.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/formules" className="btn btn-sm border-line/60">
            Formulaire <ArrowRight size={12} />
          </Link>
          <Link href="/academie" className="btn btn-primary btn-sm">
            Académie <ArrowRight size={12} />
          </Link>
        </div>
      </header>

      <div className="mt-5">
        <GlossaryBrowser />
      </div>
    </div>
  );
}
