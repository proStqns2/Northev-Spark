import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, Dumbbell, Zap } from 'lucide-react';
import { ExerciseRunner } from '@/components/learning/ExerciseRunner';
import { EXERCISE_KINDS, EXERCISE_LABELS } from '@/lib/learning/exercises';

export const metadata: Metadata = {
  title: 'Exercices',
  description:
    'Générateur d’exercices numériques : diviseurs, constantes de temps, impédances, résonance, Norton — valeurs tirées au hasard et correction détaillée.',
};

export default async function ExercicesPage({
  searchParams,
}: {
  searchParams: Promise<{ ex?: string }>;
}) {
  const { ex } = await searchParams;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="chip border-spark-amber/40 bg-spark-amber/10 text-spark-amber">
            <Dumbbell size={12} /> Entraînement
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Exercices à l’infini</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-soft">
            Dix familles de calcul, valeurs tirées au hasard, correction détaillée en trois étapes et 25 XP par réussite.
            Chaque énoncé renvoie au montage du studio qui permet de le vérifier.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/quiz" className="btn btn-sm border-line/60">
            Quiz <ArrowRight size={12} />
          </Link>
          <Link href="/defis" className="btn btn-primary btn-sm">
            <Zap size={12} /> Défi du jour
          </Link>
        </div>
      </header>

      <nav className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-1 text-[10.5px] text-fg-mute">
        {EXERCISE_KINDS.map((kind) => (
          <span key={kind} className="chip shrink-0">
            {EXERCISE_LABELS[kind]}
          </span>
        ))}
      </nav>

      <div className="mt-4">
        <ExerciseRunner initialId={ex} />
      </div>
    </div>
  );
}
