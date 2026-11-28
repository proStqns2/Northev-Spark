import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Clock, ListChecks, Sparkles } from 'lucide-react';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { userProgress } from '@/lib/db/progress';
import { MODULES, moduleBySlug } from '@/lib/learning/curriculum';
import { questionsFor, MODULE_LABEL } from '@/lib/learning/quiz-bank';
import { ProgressRing } from '@/components/learning/visuals';

export const dynamic = 'force-dynamic';

const ACCENT: Record<string, string> = {
  cyan: '#38e1e6',
  violet: '#a479ff',
  amber: '#ffc266',
  green: '#46e6a0',
  pink: '#ff79c6',
};

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module: slug } = await params;
  const module = moduleBySlug(slug);
  return { title: module ? module.title : 'Module' };
}

export default async function ModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module: slug } = await params;
  const module = moduleBySlug(slug);
  if (!module) notFound();

  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const progress = user ? await userProgress(user.id) : null;

  const color = ACCENT[module.accent] ?? '#38e1e6';
  const done = module.lessons.filter((lesson) => progress?.lessons[lesson.slug]?.done).length;
  const ratio = module.lessons.length ? done / module.lessons.length : 0;
  const quizScore = progress?.quizzes[module.slug]?.best;
  const questionCount = questionsFor(module.slug, 8).length;
  const index = MODULES.findIndex((item) => item.slug === module.slug);
  const previous = MODULES[index - 1];
  const next = MODULES[index + 1];

  return (
    <div className="academy-grid">
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        <Link href="/academie" className="inline-flex items-center gap-1.5 text-[12px] text-fg-mute transition hover:text-fg">
          <ArrowLeft size={13} /> Académie
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span
              className="chip"
              style={{ borderColor: `${color}55`, background: `${color}15`, color }}
            >
              {module.level} · {module.lessons.length} leçons
            </span>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{module.title}</h1>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-fg-soft">{module.subtitle}</p>
          </div>
          <div className="flex items-center gap-3">
            <ProgressRing value={ratio} size={78} color={color} label={`${done}/${module.lessons.length}`} sub="leçons" />
            <div className="text-[11.5px] text-fg-soft">
              <p>
                Quiz : <span className="font-semibold" style={{ color: quizScore ? '#46e6a0' : undefined }}>{quizScore !== undefined ? `${quizScore} %` : 'jamais tenté'}</span>
              </p>
              <p className="text-fg-mute">{questionCount} questions disponibles</p>
            </div>
          </div>
        </header>

        <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section>
            <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
              <BookOpen size={14} className="text-spark-cyan" /> Leçons
            </h2>
            <ol className="mt-2 space-y-2">
              {module.lessons.map((lesson, position) => {
                const state = progress?.lessons[lesson.slug];
                return (
                  <li key={lesson.slug}>
                    <Link href={`/academie/lecon/${lesson.slug}`} className="panel card-hover flex items-start gap-3 p-3.5">
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold"
                        style={{
                          background: state?.done ? 'rgba(70,230,160,0.14)' : 'rgba(255,255,255,0.04)',
                          color: state?.done ? '#46e6a0' : 'rgba(255,255,255,0.5)',
                        }}
                      >
                        {state?.done ? <CheckCircle2 size={14} /> : position + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium">{lesson.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-fg-soft">{lesson.goal}</p>
                        <p className="mt-1 flex items-center gap-2 text-[10px] text-fg-mute">
                          <Clock size={10} /> {lesson.minutes} min · {lesson.xp} XP · {lesson.steps.length} étapes
                        </p>
                      </div>
                      <ArrowRight size={14} className="mt-1 shrink-0 text-fg-mute" />
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>

          <aside className="space-y-3">
            <div className="panel p-4">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold">
                <ListChecks size={13} className="text-spark-violet" /> Quiz du module
              </h2>
              <p className="mt-1 text-[11.5px] text-fg-soft">{MODULE_LABEL[module.slug] ?? module.title}</p>
              <p className="mt-1 text-[10.5px] text-fg-mute">
                8 questions tirées de la banque, explication immédiate, score enregistré.
              </p>
              <Link href={`/quiz/${module.slug}`} className="btn btn-primary btn-sm mt-2.5 w-full justify-center">
                {quizScore !== undefined ? 'Retenter le quiz' : 'Commencer le quiz'} <ArrowRight size={12} />
              </Link>
            </div>

            <div className="panel p-4">
              <h2 className="flex items-center gap-2 text-[13px] font-semibold">
                <Sparkles size={13} className="text-spark-amber" /> Méthode
              </h2>
              <p className="mt-1 text-[11.5px] leading-relaxed text-fg-soft">
                Lisez l’étape, manipulez le montage dans le studio quand il est proposé, puis répondez à la question de
                contrôle. La leçon ne se valide qu’avec la bonne réponse : c’est une garantie d’ancrage.
              </p>
            </div>

            <div className="flex gap-2">
              {previous ? (
                <Link href={`/academie/${previous.slug}`} className="btn btn-sm flex-1 justify-center border-line/60">
                  <ArrowLeft size={11} /> {previous.title.split(' ')[0]}
                </Link>
              ) : null}
              {next ? (
                <Link href={`/academie/${next.slug}`} className="btn btn-sm flex-1 justify-center border-line/60">
                  {next.title.split(' ')[0]} <ArrowRight size={11} />
                </Link>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
