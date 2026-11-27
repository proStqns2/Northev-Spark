import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Calculator, Sigma } from 'lucide-react';
import { FORMULAS, formulasByCategory } from '@/lib/learning/formulas';

export const metadata: Metadata = {
  title: 'Formulaire',
  description:
    'Formulaire complet : 60 relations d’électrotechnique avec variables, unités et exemple numérique vérifié.',
};

export default function FormulesPage() {
  const groups = formulasByCategory();

  return (
    <div className="mx-auto max-w-[1150px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="chip border-spark-violet/40 bg-spark-violet/10 text-spark-violet">
            <Sigma size={12} /> Formulaire
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">{FORMULAS.length} relations</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-soft">
            Chaque fiche donne l’expression, le sens de chaque symbole et un exemple numérique. Les six familles
            couvrent le continu, l’alternatif, les réseaux, la puissance, les transitoires et les filtres.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/glossaire" className="btn btn-sm border-line/60">
            Glossaire <ArrowRight size={12} />
          </Link>
          <Link href="/studio" className="btn btn-primary btn-sm">
            <Calculator size={12} /> Vérifier dans le studio
          </Link>
        </div>
      </header>

      <nav className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1">
        {groups.map((group) => (
          <a key={group.category} href={`#${group.category}`} className="chip shrink-0">
            {group.label} · {group.items.length}
          </a>
        ))}
      </nav>

      <div className="mt-5 space-y-7">
        {groups.map((group) => (
          <section key={group.category} id={group.category}>
            <h2 className="text-[14px] font-semibold">
              {group.label} <span className="text-[10.5px] font-normal text-fg-mute">{group.items.length} fiches</span>
            </h2>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((formula) => (
                <article key={formula.id} className="panel flex flex-col p-3.5">
                  <h3 className="text-[12.5px] font-semibold">{formula.title}</h3>
                  <p className="mt-1.5 rounded-lg border border-spark-cyan/30 bg-spark-cyan/[0.06] px-2.5 py-1.5 font-mono text-[12px] text-spark-cyan">
                    {formula.expression}
                  </p>
                  <p className="mt-1.5 text-[11px] leading-snug text-fg-soft">{formula.description}</p>
                  <dl className="mt-2 space-y-0.5">
                    {formula.variables.map((variable) => (
                      <div key={variable.symbol} className="flex items-baseline gap-1.5 text-[10.5px]">
                        <dt className="font-mono text-spark-violet">{variable.symbol}</dt>
                        <dd className="min-w-0 flex-1 text-fg-mute">
                          {variable.meaning}
                          {variable.unit ? ` (${variable.unit})` : ''}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-auto pt-2 text-[10.5px] text-fg-mute">
                    <span className="text-spark-amber">exemple :</span> {formula.example}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
