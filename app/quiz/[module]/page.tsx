import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { questionsFor, MODULE_LABEL, QUIZ_BANK } from '@/lib/learning/quiz-bank';
import { moduleBySlug } from '@/lib/learning/curriculum';
import { QuizRunner } from '@/components/learning/QuizRunner';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
  const { module } = await params;
  return { title: `Quiz — ${MODULE_LABEL[module] ?? module}` };
}

export default async function QuizModulePage({ params }: { params: Promise<{ module: string }> }) {
  const { module } = await params;
  const available = QUIZ_BANK.filter((question) => question.module === module);
  if (!available.length) notFound();

  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const questions = questionsFor(module, 8);
  const linked = moduleBySlug(module);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/quiz" className="inline-flex items-center gap-1.5 text-[12px] text-fg-mute transition hover:text-fg">
          <ArrowLeft size={13} /> Tous les quiz
        </Link>
        {linked ? (
          <Link href={`/academie/${linked.slug}`} className="inline-flex items-center gap-1.5 text-[11.5px] text-spark-cyan hover:underline">
            <BookOpen size={12} /> Revoir le module
          </Link>
        ) : null}
      </div>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{MODULE_LABEL[module] ?? module}</h1>
      <p className="mt-1 text-[12.5px] text-fg-soft">
        {questions.length} questions · correction et explication après chaque réponse · score enregistré à la fin.
      </p>

      <div className="mt-4">
        <QuizRunner module={module} title={MODULE_LABEL[module] ?? module} questions={questions} signedIn={Boolean(user)} />
      </div>
    </div>
  );
}
