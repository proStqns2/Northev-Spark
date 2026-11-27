'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Eye, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { Confetti, ProgressRing } from './visuals';
import { gradeOf, scorePercent } from '@/lib/learning/xp';
import type { QuizQuestion } from '@/lib/learning/types';

/**
 * Quiz jouable.
 *
 * Le score n’est pas calculé uniquement côté client : à la fin, un événement
 * (`quiz`, score) part vers `/api/progress` et c’est le serveur qui décide de
 * l’XP et des badges. L’affichage optimiste reste immédiat.
 */
export function QuizRunner({
  module,
  title,
  questions,
  signedIn,
}: {
  module: string;
  title: string;
  questions: QuizQuestion[];
  signedIn: boolean;
}) {
  const { success, error } = useToast();
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState<Array<{ id: string; correct: boolean }>>([]);
  const [finished, setFinished] = useState(false);
  const [fire, setFire] = useState(0);
  const [gained, setGained] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const current = questions[index];
  const correctCount = answers.filter((answer) => answer.correct).length;
  const percent = scorePercent(correctCount, questions.length);
  const grade = gradeOf(percent);

  const submit = useCallback(
    async (finalPercent: number) => {
      if (!signedIn) return;
      setSaving(true);
      try {
        const response = await fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'quiz', target: module, score: finalPercent }),
        });
        const payload = (await response.json()) as { gainedXp?: number; newBadges?: Array<{ title: string }> };
        if (!response.ok) throw new Error('Enregistrement impossible.');
        setGained(payload.gainedXp ?? 0);
        if (payload.newBadges?.length) {
          setFire((value) => value + 1);
          for (const badge of payload.newBadges) success('Badge débloqué', badge.title);
        }
      } catch (e) {
        error('Progression non enregistrée', (e as Error).message);
      } finally {
        setSaving(false);
      }
    },
    [module, signedIn, success, error],
  );

  const choose = (choice: number) => {
    if (revealed) return;
    setPicked(choice);
    setRevealed(true);
    setAnswers((previous) => [...previous, { id: current.id, correct: choice === current.answer }]);
    if (choice === current.answer) setFire((value) => value + 1);
  };

  const next = () => {
    if (index + 1 >= questions.length) {
      const correct = answers.filter((answer) => answer.correct).length;
      const finalPercent = scorePercent(correct, questions.length);
      setFinished(true);
      void submit(finalPercent);
      return;
    }
    setIndex((value) => value + 1);
    setPicked(null);
    setRevealed(false);
  };

  const restart = () => {
    setIndex(0);
    setPicked(null);
    setRevealed(false);
    setAnswers([]);
    setFinished(false);
    setGained(null);
  };

  const progress = useMemo(() => (finished ? 1 : index / questions.length), [finished, index, questions.length]);

  if (!questions.length) {
    return (
      <div className="panel p-6 text-center text-[13px] text-fg-soft">
        Aucune question pour ce module pour le moment.
      </div>
    );
  }

  if (finished) {
    return (
      <div className="panel academy-grid relative overflow-hidden p-6 text-center">
        <Confetti fire={fire} />
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <ProgressRing value={percent / 100} size={120} color={percent >= 75 ? '#46e6a0' : percent >= 50 ? '#ffc266' : '#ff7d6b'} label={`${percent} %`} sub={`${correctCount}/${questions.length}`} />
          <h2 className="text-xl font-semibold">{grade.label}</h2>
          <p className="text-[12.5px] text-fg-soft">
            {percent === 100
              ? 'Sans faute. Le module est acquis — passez au suivant.'
              : percent >= 75
                ? 'Bonne maîtrise. Relisez les explications des questions manquées pour verrouiller le reste.'
                : 'Le socle n’est pas encore stable : reprenez la leçon du module avant de retenter.'}
          </p>
          {gained !== null ? (
            <p className="chip border-spark-green/40 bg-spark-green/10 text-spark-green">
              <Trophy size={11} /> +{gained} XP enregistrés
            </p>
          ) : null}
          {!signedIn ? (
            <p className="text-[11.5px] text-spark-amber">
              Connectez-vous pour enregistrer votre score et débloquer les badges.
            </p>
          ) : null}

          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <button type="button" onClick={restart} className="btn btn-sm border-line/60">
              <RotateCcw size={12} /> Rejouer
            </button>
            <Link href={`/academie/${module}`} className="btn btn-sm border-line/60">
              <Eye size={12} /> Revoir le module
            </Link>
            <Link href="/quiz" className="btn btn-primary btn-sm">
              Autre quiz <ArrowRight size={12} />
            </Link>
          </div>

          <ul className="mt-3 w-full space-y-1 text-left">
            {questions.map((question, position) => {
              const answer = answers[position];
              return (
                <li key={question.id} className="flex items-start gap-2 rounded-lg border border-line/50 px-2.5 py-1.5">
                  {answer?.correct ? (
                    <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-spark-green" />
                  ) : (
                    <XCircle size={13} className="mt-0.5 shrink-0 text-spark-red" />
                  )}
                  <span className="min-w-0 flex-1 text-[11px] leading-snug text-fg-soft">
                    {question.prompt}
                    <span className="mt-0.5 block text-[10px] text-fg-mute">
                      Réponse : {question.choices[question.answer]}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-5">
      <Confetti fire={fire} />
      <div className="flex items-center justify-between gap-3">
        <span className="chip">
          Question {index + 1} / {questions.length}
        </span>
        <span className="text-[11px] text-fg-mute">{title}</span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-800">
        <div className="h-full rounded-full bg-spark-cyan transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
      </div>

      <h2 className="mt-4 text-[15px] font-semibold leading-snug">{current.prompt}</h2>

      <ul className="mt-3 space-y-2">
        {current.choices.map((choice, position) => {
          const isAnswer = position === current.answer;
          const isPicked = picked === position;
          return (
            <li key={choice}>
              <button
                type="button"
                onClick={() => choose(position)}
                disabled={revealed}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-[12.5px] transition',
                  revealed && isAnswer && 'border-spark-green/60 bg-spark-green/10 text-spark-green',
                  revealed && isPicked && !isAnswer && 'border-spark-red/60 bg-spark-red/10 text-spark-red',
                  !revealed && 'border-line/60 hover:border-spark-cyan/50 hover:bg-ink-800/60',
                  revealed && !isAnswer && !isPicked && 'border-line/40 text-fg-mute',
                )}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-current/30 text-[10px] font-bold">
                  {String.fromCharCode(65 + position)}
                </span>
                <span className="min-w-0 flex-1">{choice}</span>
                {revealed && isAnswer ? <CheckCircle2 size={14} /> : null}
                {revealed && isPicked && !isAnswer ? <XCircle size={14} /> : null}
              </button>
            </li>
          );
        })}
      </ul>

      {revealed ? (
        <div className="animate-slide-in mt-3 rounded-xl border border-line/60 bg-ink-900/70 p-3">
          <p className="text-[11.5px] leading-relaxed text-fg-soft">{current.explanation}</p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10.5px] text-fg-mute">
              {answers[answers.length - 1]?.correct ? '+1 bonne réponse' : 'À revoir'}
            </span>
            <button type="button" onClick={next} className="btn btn-primary btn-sm" disabled={saving}>
              {index + 1 >= questions.length ? 'Voir le résultat' : 'Question suivante'} <ArrowRight size={12} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
