import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  CircuitBoard,
  Flame,
  GraduationCap,
  ListChecks,
  Sparkles,
  Target,
  Trophy,
  Dumbbell,
} from 'lucide-react';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { academyStats, leaderboard, rankOf, userProgress, userTemplates } from '@/lib/db/progress';
import { MODULES, TOTAL_LESSONS, TOTAL_XP } from '@/lib/learning/curriculum';
import { BADGES } from '@/lib/learning/badges';
import { GLOSSARY } from '@/lib/learning/glossary';
import { FORMULAS } from '@/lib/learning/formulas';
import { challengeFor } from '@/lib/learning/challenges';
import { masteryOf, todayIso } from '@/lib/learning/xp';
import { moduleLessonsMap, moduleQuizMap } from '@/lib/learning/curriculum';
import { QUIZ_MODULES, MODULE_LABEL } from '@/lib/learning/quiz-bank';
import { XpBar } from '@/components/learning/XpBar';
import { MasteryRadar, ProgressRing, StatCard, StreakCalendar } from '@/components/learning/visuals';
import { ChallengeCard } from '@/components/learning/ChallengeCard';

export const metadata: Metadata = {
  title: 'Académie',
  description:
    'Parcours guidé Northev Spark : 8 modules, 20 leçons jouables, quiz corrigés, défis quotidiens, badges et classement.',
};

export const dynamic = 'force-dynamic';

const ACCENT: Record<string, string> = {
  cyan: '#38e1e6',
  violet: '#a479ff',
  amber: '#ffc266',
  green: '#46e6a0',
  pink: '#ff79c6',
};

export default async function AcademiePage() {
  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;

  const [progress, templates, rows, stats] = await Promise.all([
    user ? userProgress(user.id) : Promise.resolve(null),
    user ? userTemplates(user.id) : Promise.resolve([]),
    leaderboard(5),
    academyStats(),
  ]);

  const rank = user ? await rankOf(user.id) : null;
  const doneLessons = progress ? Object.values(progress.lessons).filter((lesson) => lesson.done).length : 0;
  const mastery = masteryOf(progress ?? { lessons: {}, quizzes: {}, challenges: {} }, moduleLessonsMap(), moduleQuizMap());
  const challenge = challengeFor(todayIso());
  const solved = progress ? Boolean(progress.challenges[challenge.id]) : false;

  const radar = MODULES.map((module) => ({
    module: module.slug,
    label: module.title.split(' ')[0],
    ratio: mastery.find((item) => item.module === module.slug)?.ratio ?? 0,
  }));

  return (
    <div className="academy-grid">
      <div className="mx-auto max-w-[1450px] px-4 py-8 sm:px-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="chip border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan">
              <GraduationCap size={12} /> Académie
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Apprendre en construisant
            </h1>
            <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-fg-soft">
              {MODULES.length} modules · {TOTAL_LESSONS} leçons jouables · {TOTAL_XP} XP à gagner ·{' '}
              {BADGES.length} badges · un défi qui change chaque jour. Chaque leçon ouvre le montage correspondant
              dans le studio.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/quiz" className="btn btn-sm border-line/60">
              <ListChecks size={13} /> Quiz
            </Link>
            <Link href="/defis" className="btn btn-sm border-line/60">
              <Target size={13} /> Défis
            </Link>
            <Link href="/progression" className="btn btn-primary btn-sm">
              <Trophy size={13} /> Ma progression
            </Link>
          </div>
        </header>

        <section className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="panel p-4">
            {user && progress ? (
              <XpBar xp={progress.xp} />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[13px] font-semibold">Progression non enregistrée</p>
                  <p className="mt-0.5 text-[11.5px] text-fg-soft">
                    Créez un compte gratuit pour conserver vos XP, vos badges et votre série.
                  </p>
                </div>
                <Link href="/compte?mode=inscription" className="btn btn-primary btn-sm">
                  Créer un compte <ArrowRight size={12} />
                </Link>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <StatCard label="Leçons" value={doneLessons} sub={`sur ${TOTAL_LESSONS}`} accent="#38e1e6" icon={<BookOpenCheck size={15} />} />
              <StatCard
                label="Quiz réussis"
                value={progress ? Object.keys(progress.quizzes).length : 0}
                sub={`moyenne ${progress ? Math.round(Object.values(progress.quizzes).reduce((sum, quiz) => sum + quiz.best, 0) / Math.max(1, Object.keys(progress.quizzes).length)) : 0} %`}
                accent="#a479ff"
                icon={<ListChecks size={15} />}
              />
              <StatCard
                label="Série"
                value={`${progress?.streak ?? 0} j`}
                sub={`record ${progress?.bestStreak ?? 0} j`}
                accent="#ffc266"
                icon={<Flame size={15} />}
              />
              <StatCard
                label="Badges"
                value={progress ? Object.keys(progress.badges).length : 0}
                sub={`sur ${BADGES.length}`}
                accent="#46e6a0"
                icon={<BadgeCheck size={15} />}
              />
            </div>

            <div className="mt-3">
              <StreakCalendar days={progress?.days ?? []} />
            </div>
          </div>

          <div className="panel flex flex-col items-center justify-center p-4">
            <p className="text-[11px] uppercase tracking-wide text-fg-mute">Maîtrise par module</p>
            <MasteryRadar data={radar} size={250} />
            <p className="mt-1 text-center text-[10.5px] text-fg-mute">
              60 % leçons + 40 % quiz — la zone pleine indique les modules solides.
            </p>
          </div>
        </section>

        <section className="mt-4">
          <ChallengeCard challenge={challenge} signedIn={Boolean(user)} solved={solved} />
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Les 8 modules</h2>
              <p className="text-[11.5px] text-fg-mute">Dans l’ordre conseillé — chaque module se termine par un quiz.</p>
            </div>
            <Link href="/bibliotheque" className="text-[11.5px] text-spark-cyan hover:underline">
              Voir les 15 montages
            </Link>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {MODULES.map((module) => {
              const color = ACCENT[module.accent] ?? '#38e1e6';
              const lessons = moduleLessonsMap()[module.slug] ?? [];
              const done = lessons.filter((slug) => progress?.lessons[slug]?.done).length;
              const ratio = lessons.length ? done / lessons.length : 0;
              const quiz = progress?.quizzes[module.slug]?.best;
              return (
                <article key={module.slug} className="panel card-hover flex flex-col p-4" style={{ borderColor: `${color}33` }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wide" style={{ color }}>
                        {module.level}
                      </p>
                      <h3 className="mt-0.5 truncate text-[14px] font-semibold">{module.title}</h3>
                    </div>
                    <ProgressRing value={ratio} size={44} stroke={5} color={color} label={`${done}/${lessons.length}`} />
                  </div>

                  <p className="mt-1.5 line-clamp-2 min-h-[32px] text-[11px] leading-snug text-fg-soft">{module.subtitle}</p>

                  <ul className="mt-2 space-y-0.5">
                    {module.lessons.map((lesson) => (
                      <li key={lesson.slug}>
                        <Link
                          href={`/academie/lecon/${lesson.slug}`}
                          className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[11px] text-fg-soft transition hover:text-fg"
                        >
                          <span
                            className="h-1 w-1 shrink-0 rounded-full"
                            style={{ background: progress?.lessons[lesson.slug]?.done ? '#46e6a0' : 'rgba(255,255,255,0.2)' }}
                          />
                          <span className="min-w-0 flex-1 truncate">{lesson.title}</span>
                          <span className="text-[9.5px] text-fg-mute">{lesson.minutes}′</span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-auto flex items-center gap-1.5 pt-2.5">
                    <Link href={`/academie/${module.slug}`} className="btn btn-ghost btn-sm flex-1 justify-center text-[10.5px]">
                      Module <ArrowRight size={10} />
                    </Link>
                    <Link
                      href={`/quiz/${module.slug}`}
                      className="btn btn-ghost btn-sm flex-1 justify-center text-[10.5px]"
                      style={{ color: quiz ? '#46e6a0' : undefined }}
                    >
                      {quiz !== undefined ? `${quiz} %` : 'Quiz'}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="mt-8 grid gap-3 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
                <Trophy size={14} className="text-spark-amber" /> Classement
              </h2>
              {rank ? (
                <span className="chip text-[10px]">
                  vous : {rank.rank}ᵉ / {rank.total}
                </span>
              ) : null}
            </div>
            <ol className="mt-2 space-y-1">
              {rows.length ? (
                rows.map((row, index) => (
                  <li key={row.userId} className="flex items-center gap-2 text-[11.5px]">
                    <span className="w-4 text-right text-fg-mute">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className="text-[10.5px] text-spark-amber">{row.xp} XP</span>
                  </li>
                ))
              ) : (
                <li className="text-[11.5px] text-fg-mute">Personne n’a encore marqué de points — soyez le premier.</li>
              )}
            </ol>
            <Link href="/classement" className="btn btn-ghost btn-sm mt-2 w-full justify-center text-[10.5px]">
              Classement complet <ArrowRight size={10} />
            </Link>
          </div>

          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
                <Sparkles size={14} className="text-spark-violet" /> Quiz par thème
              </h2>
              <Link href="/quiz" className="text-[11px] text-spark-cyan hover:underline">
                tout voir
              </Link>
            </div>
            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {QUIZ_MODULES.map((module) => (
                <Link
                  key={module}
                  href={`/quiz/${module}`}
                  className="flex items-center justify-between rounded-lg border border-line/50 px-2.5 py-1.5 text-[11.5px] transition hover:border-spark-cyan/50"
                >
                  <span className="truncate">{MODULE_LABEL[module] ?? module}</span>
                  <span className="text-[10px] text-fg-mute">
                    {progress?.quizzes[module] ? `${progress.quizzes[module].best} %` : '—'}
                  </span>
                </Link>
              ))}
            </div>

            <div className="mt-3 grid gap-1.5 sm:grid-cols-3">
              <Link href="/glossaire" className="rounded-lg border border-line/50 px-2.5 py-1.5 text-[11.5px] transition hover:border-spark-cyan/50">
                Glossaire · {GLOSSARY.length} entrées
              </Link>
              <Link href="/formules" className="rounded-lg border border-line/50 px-2.5 py-1.5 text-[11.5px] transition hover:border-spark-cyan/50">
                Formulaire · {FORMULAS.length} fiches
              </Link>
              <Link href="/badges" className="rounded-lg border border-line/50 px-2.5 py-1.5 text-[11.5px] transition hover:border-spark-cyan/50">
                Badges · {BADGES.length}
              </Link>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-line/50 p-2 text-center">
                <p className="text-[15px] font-semibold">{stats.learners}</p>
                <p className="text-[9.5px] text-fg-mute">apprenants</p>
              </div>
              <div className="rounded-lg border border-line/50 p-2 text-center">
                <p className="text-[15px] font-semibold">{stats.lessonsDone}</p>
                <p className="text-[9.5px] text-fg-mute">leçons finies</p>
              </div>
              <div className="rounded-lg border border-line/50 p-2 text-center">
                <p className="text-[15px] font-semibold">{stats.badgesEarned}</p>
                <p className="text-[9.5px] text-fg-mute">badges</p>
              </div>
              <div className="rounded-lg border border-line/50 p-2 text-center">
                <p className="text-[15px] font-semibold">{stats.xpTotal}</p>
                <p className="text-[9.5px] text-fg-mute">XP cumulés</p>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-3 sm:grid-cols-3">
          <Link href="/studio" className="panel card-hover flex items-center gap-3 p-4">
            <CircuitBoard size={18} className="text-spark-cyan" />
            <div>
              <p className="text-[12.5px] font-medium">Construire</p>
              <p className="text-[10.5px] text-fg-mute">Studio complet, 15 gabarits</p>
            </div>
          </Link>
          <Link href="/exercices" className="panel card-hover flex items-center gap-3 p-4">
            <Dumbbell size={18} className="text-spark-green" />
            <div>
              <p className="text-[12.5px] font-medium">Exercices</p>
              <p className="text-[10.5px] text-fg-mute">10 familles, tirages infinis</p>
            </div>
          </Link>
          <Link href="/defis" className="panel card-hover flex items-center gap-3 p-4">
            <Target size={18} className="text-spark-amber" />
            <div>
              <p className="text-[12.5px] font-medium">Défi du jour</p>
              <p className="text-[10.5px] text-fg-mute">+{challenge.reward} XP si vous trouvez</p>
            </div>
          </Link>
          <Link href="/progression" className="panel card-hover flex items-center gap-3 p-4">
            <Trophy size={18} className="text-spark-violet" />
            <div>
              <p className="text-[12.5px] font-medium">Progression</p>
              <p className="text-[10.5px] text-fg-mute">Radar, série, historique</p>
            </div>
          </Link>
        </section>

        {templates.length ? (
          <p className="mt-6 text-[10.5px] text-fg-mute">
            {templates.length} montage{templates.length > 1 ? 's' : ''} découvert{templates.length > 1 ? 's' : ''} sur 15 —
            chaque visite débloque un badge de gabarit.
          </p>
        ) : null}
      </div>
    </div>
  );
}
