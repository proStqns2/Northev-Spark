import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, BadgeCheck, BookOpenCheck, Flame, ListChecks, Target, Trophy } from 'lucide-react';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { rankOf, userProgress, userTemplates } from '@/lib/db/progress';
import { MODULES, TOTAL_LESSONS, moduleLessonsMap, moduleQuizMap } from '@/lib/learning/curriculum';
import { BADGES } from '@/lib/learning/badges';
import { masteryOf, levelProgress, gradeOf } from '@/lib/learning/xp';
import { XpBar } from '@/components/learning/XpBar';
import { BadgeTile, MasteryRadar, ProgressRing, StatCard, StreakCalendar } from '@/components/learning/visuals';

export const metadata: Metadata = { title: 'Ma progression' };
export const dynamic = 'force-dynamic';

export default async function ProgressionPage() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  if (!user) redirect('/compte?mode=connexion&next=/progression');

  const [progress, templates, rank] = await Promise.all([userProgress(user.id), userTemplates(user.id), rankOf(user.id)]);
  const { level, next } = levelProgress(progress.xp);
  const mastery = masteryOf(progress, moduleLessonsMap(), moduleQuizMap());
  const doneLessons = Object.values(progress.lessons).filter((lesson) => lesson.done).length;
  const quizzes = Object.entries(progress.quizzes);
  const average = quizzes.length ? Math.round(quizzes.reduce((sum, [, quiz]) => sum + quiz.best, 0) / quizzes.length) : 0;
  const earned = Object.keys(progress.badges).length;

  const radar = MODULES.map((module) => ({
    module: module.slug,
    label: module.title.split(' ')[0],
    ratio: mastery.find((item) => item.module === module.slug)?.ratio ?? 0,
  }));

  return (
    <div className="academy-grid">
      <div className="mx-auto max-w-[1250px] px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="chip border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan">
              <Trophy size={12} /> {user.name}
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">Ma progression</h1>
            <p className="mt-1.5 text-[12.5px] text-fg-soft">
              Niveau {level.index} — {level.title}. {next ? `Encore ${next.minXp - progress.xp} XP avant « ${next.title} ».` : 'Sommet atteint.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/badges" className="btn btn-sm border-line/60">
              <BadgeCheck size={12} /> Badges
            </Link>
            <Link href="/classement" className="btn btn-primary btn-sm">
              Classement <ArrowRight size={12} />
            </Link>
          </div>
        </header>

        <section className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="panel p-4">
            <XpBar xp={progress.xp} />
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Leçons" value={`${doneLessons}/${TOTAL_LESSONS}`} accent="#38e1e6" icon={<BookOpenCheck size={15} />} />
              <StatCard label="Quiz" value={quizzes.length} sub={`moyenne ${average} % · ${gradeOf(average).label}`} accent="#a479ff" icon={<ListChecks size={15} />} />
              <StatCard label="Défis" value={Object.keys(progress.challenges).length} accent="#ffc266" icon={<Target size={15} />} />
              <StatCard label="Série" value={`${progress.streak} j`} sub={`record ${progress.bestStreak} j`} accent="#ff7d6b" icon={<Flame size={15} />} />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-line/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-fg-mute">Jours d’activité</p>
                <div className="mt-2">
                  <StreakCalendar days={progress.days} />
                </div>
              </div>
              <div className="rounded-xl border border-line/50 p-3">
                <p className="text-[11px] uppercase tracking-wide text-fg-mute">Badges & classement</p>
                <div className="mt-2 flex items-center gap-3">
                  <ProgressRing value={earned / BADGES.length} size={64} color="#46e6a0" label={`${earned}`} sub={`/${BADGES.length}`} />
                  <div className="text-[11.5px] text-fg-soft">
                    <p>
                      Rang <span className="font-semibold">{rank.rank}ᵉ</span> sur {rank.total}
                    </p>
                    <p className="text-fg-mute">{templates.length} montage(s) découvert(s)</p>
                    <Link href="/badges" className="mt-1 inline-flex text-[11px] text-spark-cyan hover:underline">
                      voir la collection
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="panel flex flex-col items-center p-4">
            <p className="text-[11px] uppercase tracking-wide text-fg-mute">Maîtrise</p>
            <MasteryRadar data={radar} size={240} />
            <ul className="mt-1 w-full space-y-1">
              {mastery
                .slice()
                .sort((a, b) => b.ratio - a.ratio)
                .slice(0, 3)
                .map((item) => (
                  <li key={item.module} className="flex items-center justify-between text-[10.5px] text-fg-soft">
                    <span className="truncate">{MODULES.find((module) => module.slug === item.module)?.title}</span>
                    <span className="text-fg-mute">{Math.round(item.ratio * 100)} %</span>
                  </li>
                ))}
            </ul>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-[13.5px] font-semibold">Détail par module</h2>
          <div className="mt-2 overflow-hidden rounded-xl border border-line/50">
            <table className="w-full text-[11.5px]">
              <thead className="bg-ink-900/70 text-left text-[10px] uppercase tracking-wide text-fg-mute">
                <tr>
                  <th className="px-3 py-2">Module</th>
                  <th className="px-3 py-2">Leçons</th>
                  <th className="px-3 py-2">Quiz</th>
                  <th className="px-3 py-2">Maîtrise</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {MODULES.map((module) => {
                  const lessons = moduleLessonsMap()[module.slug] ?? [];
                  const done = lessons.filter((slug) => progress.lessons[slug]?.done).length;
                  const quiz = progress.quizzes[module.slug]?.best;
                  const ratio = mastery.find((item) => item.module === module.slug)?.ratio ?? 0;
                  return (
                    <tr key={module.slug} className="border-t border-line/40">
                      <td className="px-3 py-2">{module.title}</td>
                      <td className="px-3 py-2 text-fg-soft">
                        {done}/{lessons.length}
                      </td>
                      <td className="px-3 py-2" style={{ color: quiz && quiz >= 75 ? '#46e6a0' : undefined }}>
                        {quiz !== undefined ? `${quiz} %` : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-block h-1.5 w-24 overflow-hidden rounded-full bg-ink-800">
                          <span className="block h-full rounded-full bg-spark-cyan" style={{ width: `${ratio * 100}%` }} />
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/academie/${module.slug}`} className="text-[11px] text-spark-cyan hover:underline">
                          ouvrir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-[13.5px] font-semibold">Derniers badges</h2>
            <Link href="/badges" className="text-[11px] text-spark-cyan hover:underline">
              tous les badges
            </Link>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {BADGES.filter((badge) => progress.badges[badge.id])
              .slice(-6)
              .map((badge) => (
                <BadgeTile key={badge.id} badge={badge} earnedAt={progress.badges[badge.id]} />
              ))}
            {earned === 0 ? (
              <p className="col-span-full rounded-xl border border-line/50 p-3 text-[11.5px] text-fg-soft">
                Aucun badge pour l’instant : terminez une leçon pour débloquer « Premier pas ».
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
