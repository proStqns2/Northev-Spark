import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, FlaskConical, Sparkles } from 'lucide-react';
import { Lab } from '@/components/lab/Lab';

export const metadata: Metadata = {
  title: 'Laboratoire',
  description:
    'Laboratoire virtuel : oscilloscope, diagramme de Bode, dimensionnement de filtres en série E24 et compensation du facteur de puissance.',
};

export default function LaboPage() {
  return (
    <div className="mx-auto max-w-[1150px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="chip border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan">
            <FlaskConical size={12} /> Laboratoire
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Instruments virtuels</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-soft">
            Quatre instruments pour voir la théorie bouger : oscilloscope, Bode, dimensionnement normalisé et
            compensation d’énergie. Tout se règle au curseur, tout se recalcule instantanément.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/academie" className="btn btn-sm border-line/60">
            Cours <ArrowRight size={12} />
          </Link>
          <Link href="/studio" className="btn btn-primary btn-sm">
            <Sparkles size={12} /> Studio
          </Link>
        </div>
      </header>

      <div className="mt-5">
        <Lab />
      </div>
    </div>
  );
}
