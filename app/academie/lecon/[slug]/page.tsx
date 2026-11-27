import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { readSessionToken } from '@/lib/auth/session';
import { resolveSession } from '@/lib/db/repo';
import { userProgress } from '@/lib/db/progress';
import { lessonBySlug, nextLesson } from '@/lib/learning/curriculum';
import { LessonRunner } from '@/components/learning/LessonRunner';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = lessonBySlug(slug);
  return { title: found ? found.lesson.title : 'Leçon' };
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = lessonBySlug(slug);
  if (!found) notFound();

  const token = await readSessionToken();
  const user = token ? await resolveSession(token) : null;
  const progress = user ? await userProgress(user.id) : null;
  const following = nextLesson(slug);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <LessonRunner
        module={found.module}
        lesson={found.lesson}
        nextSlug={following?.lesson.slug ?? null}
        signedIn={Boolean(user)}
        alreadyDone={Boolean(progress?.lessons[slug]?.done)}
      />
    </div>
  );
}
