'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Lightbulb, Sparkles, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { Confetti } from './visuals';
import type { Lesson, Module } from '@/lib/learning/types';

/**
 * Déroulé d’une leçon : étapes, questions de contrôle, ouverture du gabarit
 * correspondant dans le studio, puis validation qui enregistre l’XP.
 */
export function LessonRunner({
  module,
  lesson,
  nextSlug,
  signedIn,
  alreadyDone,
}: {
  module: Module;
  lesson: Lesson;
  nextSlug: string | null;
  signedIn: boolean;
  alreadyDone: boolean;
}) {
  const { success, error } = useToast();
  const [step, setStep] = useState(0);
  const [checked, setChecked] = useState<Record<string, { picked: number; ok: boolean }>>({});
  const [done, setDone] = useState(alreadyDone);
  const [saving, setSaving] = useState(false);
  const [fire, setFire] = useState(0);
  const [gained, setGained] = useState(0);

  const current = lesson.steps[step];
  const isLast = step === lesson.steps.length - 1;
  const checkState = current.check ? checked[current.id] : undefined;
  const blocked = Boolean(current.check && (!checkState || !checkState.ok));

  async function complete() {
    setSaving(true);
    try {
      if (signedIn) {
        const response = await fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'lesson', target: lesson.slug }),
        });
        const payload = (await response.json()) as { gainedXp?: number; newBadges?: Array<{ title: string }> };
        if (!response.ok) throw new Error('Enregistrement impossible.');
        setGained(payload.gainedXp ?? 0);
        if (payload.newBadges?.length) {
          setFire((value) => value + 1);
          for (const badge of payload.newBadges) success('Badge débloqué', badge.title);
        }
      }
      setDone(true);
      setFire((value) => value + 1);
    } catch (e) {
      error('Progression non enregistrée', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
      <div className="panel p-5">
        <Confetti fire={fire} />

        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/academie/${module.slug}`} className="chip hover:border-spark-cyan/50">
            {module.title}
          </Link>
          <span className="chip">
            {lesson.minutes} min · {lesson.xp} XP
          </span>
          {done ? (
            <span className="chip border-spark-green/40 bg-spark-green/10 text-spark-green">
              <CheckCircle2 size={11} /> terminée
            </span>
          ) : null}
        </div>

        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
        <p className="mt-1 text-[12.5px] leading-relaxed text-fg-soft">{lesson.goal}</p>

        <ol className="mt-4 flex items-center gap-1.5">
          {lesson.steps.map((item, position) => (
            <li key={item.id} className="flex-1">
              <button
                type="button"
                onClick={() => setStep(position)}
                aria-label={`Étape ${position + 1}`}
                className={cn(
                  'h-1.5 w-full rounded-full transition',
                  position <= step ? 'bg-spark-cyan' : 'bg-ink-800',
                )}
              />
            </li>
          ))}
        </ol>

        <section key={current.id} className="animate-slide-in mt-4">
          <h2 className="text-[14px] font-semibold">{current.title}</h2>
          <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-fg-soft">{current.body}</p>

          {current.tip ? (
            <p className="mt-2.5 flex items-start gap-2 rounded-lg border border-spark-amber/30 bg-spark-amber/[0.06] px-3 py-2 text-[11.5px] text-spark-amber">
              <Lightbulb size={13} className="mt-0.5 shrink-0" /> {current.tip}
            </p>
          ) : null}

          {current.template ? (
            <Link
              href={`/studio?template=${current.template}`}
              target="_blank"
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-spark-cyan/40 bg-spark-cyan/[0.07] px-3 py-2 text-[12px] text-spark-cyan transition hover:bg-spark-cyan/[0.12]"
            >
              <Sparkles size={13} /> Ouvrir le montage dans le studio <ArrowRight size={12} />
            </Link>
          ) : null}

          {current.check ? (
            <div className="mt-4 rounded-xl border border-line/60 bg-ink-900/60 p-3">
              <p className="text-[12px] font-medium">{current.check.prompt}</p>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {current.check.choices.map((choice, position) => {
                  const state = checked[current.id];
                  const isAnswer = position === current.check!.answer;
                  const isPicked = state?.picked === position;
                  return (
                    <li key={choice}>
                      <button
                        type="button"
                        disabled={Boolean(state)}
                        onClick={() => {
                          const ok = position === current.check!.answer;
                          setChecked((previous) => ({ ...previous, [current.id]: { picked: position, ok } }));
                          if (ok) setFire((value) => value + 1);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11.5px] transition',
                          state && isAnswer && 'border-spark-green/60 bg-spark-green/10 text-spark-green',
                          state && isPicked && !isAnswer && 'border-spark-red/60 bg-spark-red/10 text-spark-red',
                          !state && 'border-line/60 hover:border-spark-cyan/50',
                        )}
                      >
                        {state && isAnswer ? <CheckCircle2 size={12} /> : null}
                        {state && isPicked && !isAnswer ? <XCircle size={12} /> : null}
                        <span className="min-w-0 flex-1">{choice}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {checkState ? (
                <p className={cn('mt-2 text-[11px] leading-relaxed', checkState.ok ? 'text-spark-green' : 'text-spark-amber')}>
                  {checkState.ok ? 'Exact. ' : 'Pas encore : '}
                  {current.check.explanation}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>

        <div className="mt-5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep((value) => Math.max(0, value - 1))}
            disabled={step === 0}
            className="btn btn-sm border-line/60"
          >
            Précédent
          </button>

          {isLast ? (
            done ? (
              <span className="chip border-spark-green/40 bg-spark-green/10 text-spark-green">
                <CheckCircle2 size={11} /> +{gained || lesson.xp} XP
              </span>
            ) : (
              <button type="button" onClick={complete} disabled={blocked || saving} className="btn btn-primary btn-sm">
                {saving ? 'Enregistrement…' : 'Terminer la leçon'} <CheckCircle2 size={12} />
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => setStep((value) => value + 1)}
              disabled={blocked}
              className="btn btn-primary btn-sm"
            >
              Étape suivante <ArrowRight size={12} />
            </button>
          )}
        </div>

        {blocked ? (
          <p className="mt-2 text-[10.5px] text-fg-mute">
            Répondez correctement à la question de contrôle pour continuer.
          </p>
        ) : null}
      </div>

      <aside className="space-y-3">
        <div className="panel p-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-fg-mute">Étapes</p>
          <ol className="mt-2 space-y-1">
            {lesson.steps.map((item, position) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setStep(position)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] transition',
                    position === step ? 'bg-ink-800 text-fg' : 'text-fg-soft hover:bg-ink-800/60',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px]',
                      position < step || checked[item.id]?.ok
                        ? 'bg-spark-green/20 text-spark-green'
                        : position === step
                          ? 'bg-spark-cyan/20 text-spark-cyan'
                          : 'bg-ink-700 text-fg-mute',
                    )}
                  >
                    {position + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>

        {nextSlug ? (
          <Link href={`/academie/lecon/${nextSlug}`} className="panel card-hover block p-3.5">
            <p className="text-[10.5px] uppercase tracking-wide text-fg-mute">Leçon suivante</p>
            <p className="mt-1 flex items-center gap-1.5 text-[12.5px] font-medium text-spark-cyan">
              Continuer <ArrowRight size={12} />
            </p>
          </Link>
        ) : null}

        <Link href={`/quiz/${lesson.quizModule}`} className="panel card-hover block p-3.5">
          <p className="text-[10.5px] uppercase tracking-wide text-fg-mute">Vérifier</p>
          <p className="mt-1 text-[12.5px] font-medium">Quiz du module</p>
          <p className="mt-0.5 text-[10.5px] text-fg-mute">8 questions, explications immédiates.</p>
        </Link>
      </aside>
    </div>
  );
}
