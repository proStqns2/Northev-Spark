import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, ListChecks, Sparkles, Timer, Trophy } from 'lucide-react';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { userProgress } from '@/lib/db/progress';
import { QUIZ_BANK, QUIZ_MODULES, MODULE_LABEL } from '@/lib/learning/quiz-bank';
import { gradeOf } from '@/lib/learning/xp';
import { ProgressRing, StatCard } from '@/components/learning/visuals';

export const metadata: Metadata = {
  title: 'Quiz',
  description:
    'Quiz corrigés de l’Académie Northev Spark : huit thèmes, explications immédiates, score enregistré et badges à la clé.',
};

export const dynamic = 'force-dynamic';

export default async function QuizHubPage() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const progress = user ? await userProgress(user.id) : null;

  const attempts = progress ? Object.entries(progress.quizzes) : [];
  const average = attempts.length ? Math.round(attempts.reduce((sum, [, quiz]) => sum + quiz.best, 0) / attempts.length) : 0;
  const perfect = attempts.filter(([, quiz]) => quiz.best >= 100).length;

  return (
    <div className="academy-grid">
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="chip border-spark-violet/40 bg-spark-violet/10 text-spark-violet">
              <ListChecks size={12} /> Quiz
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Huit thèmes, correction immédiate</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-fg-soft">
              {QUIZ_BANK.length} questions rédigées et expliquées. Chaque quiz tire 8 questions dans son thème ; le
              score est enregistré et fait progresser votre maîtrise.
            </p>
          </div>
          <Link href="/academie" className="btn btn-sm border-line/60">
            Académie <ArrowRight size={12} />
          </Link>
        </header>

        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          <StatCard label="Quiz tentés" value={attempts.length} sub={`sur ${QUIZ_MODULES.length} thèmes`} accent="#a479ff" icon={<ListChecks size={15} />} />
          <StatCard label="Moyenne" value={`${average} %`} sub={average ? gradeOf(average).label : 'aucun score'} accent="#38e1e6" icon={<Timer size={15} />} />
          <StatCard label="Sans faute" value={perfect} sub="quiz à 100 %" accent="#46e6a0" icon={<Trophy size={15} />} />
          <StatCard label="Banque" value={QUIZ_BANK.length} sub="questions" accent="#ffc266" icon={<Sparkles size={15} />} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUIZ_MODULES.map((module) => {
            const best = progress?.quizzes[module]?.best;
            const questions = QUIZ_BANK.filter((question) => question.module === module).length;
            const grade = best !== undefined ? gradeOf(best) : null;
            return (
              <Link key={module} href={`/quiz/${module}`} className="panel card-hover flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-[13.5px] font-semibold">{MODULE_LABEL[module] ?? module}</h2>
                    <p className="mt-0.5 text-[10.5px] text-fg-mute">{questions} questions disponibles</p>
                  </div>
                  <ProgressRing
                    value={best !== undefined ? best / 100 : 0}
                    size={46}
                    stroke={5}
                    color={best === undefined ? '#5a6b7d' : best >= 75 ? '#46e6a0' : '#ffc266'}
                    label={best !== undefined ? `${best}%` : '—'}
                  />
                </div>
                <p className="mt-auto pt-2 text-[10.5px]" style={{ color: grade?.tone === 'good' ? '#46e6a0' : undefined }}>
                  {grade ? grade.label : 'Jamais tenté'}
                  {progress?.quizzes[module]?.attempts ? ` · ${progress.quizzes[module].attempts} tentative(s)` : ''}
                </p>
              </Link>
            );
          })}
        </div>

        <section className="panel mt-6 p-4">
          <h2 className="text-[13px] font-semibold">Comment ça marche</h2>
          <ul className="mt-2 grid gap-1.5 text-[11.5px] text-fg-soft sm:grid-cols-3">
            <li className="rounded-lg border border-line/50 p-2.5">
              1. Vous choisissez un thème : les 8 questions sont tirées au hasard dans sa banque.
            </li>
            <li className="rounded-lg border border-line/50 p-2.5">
              2. Chaque réponse est corrigée et expliquée immédiatement — pas de suspense inutile.
            </li>
            <li className="rounded-lg border border-line/50 p-2.5">
              3. À la fin, le score part au serveur et met à jour XP, maîtrise et badges.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
