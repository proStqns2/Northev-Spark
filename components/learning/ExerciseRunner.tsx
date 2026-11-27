'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, CircleHelp, ExternalLink, Lightbulb, RefreshCw, Timer, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  EXERCISE_KINDS,
  EXERCISE_LABELS,
  checkAnswer,
  makeExercise,
  type CheckResult,
  type Exercise,
  type ExerciseKind,
} from '@/lib/learning/exercises';

/**
 * Atelier d’exercices.
 *
 * Le composant ne calcule jamais l’XP : il envoie l’événement « exercice
 * résolu » à `/api/progress` et affiche ce que le serveur renvoie. Un exercice
 * raté rapporte quand même quelques points d’effort — le but est de faire
 * calculer, pas de punir.
 */

interface Feedback {
  result: CheckResult;
  xp: number;
  badges: string[];
  saved: boolean;
}

export function ExerciseRunner({ initialKind, initialId }: { initialKind?: ExerciseKind; initialId?: string }) {
  const [kind, setKind] = useState<ExerciseKind | 'mixte'>(initialKind ?? 'mixte');
  const [seed, setSeed] = useState(initialId ? `share:${initialId.replace(/^EX-/i, '')}` : 'depart');
  const [input, setInput] = useState('');
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [showSteps, setShowSteps] = useState(false);
  const [solved, setSolved] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const exercise = useMemo<Exercise>(
    () => makeExercise(seed, kind === 'mixte' ? undefined : kind),
    [seed, kind],
  );

  useEffect(() => {
    setInput('');
    setFeedback(null);
    setShowSteps(false);
    setElapsed(0);
    inputRef.current?.focus();
  }, [exercise.id]);

  useEffect(() => {
    if (feedback) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [feedback, exercise.id]);

  const submit = useCallback(async () => {
    if (feedback || busy || !input.trim()) return;
    setBusy(true);
    const result = checkAnswer(exercise, input);
    setAttempts((value) => value + 1);
    if (result.correct) {
      setSolved((value) => value + 1);
      setCombo((value) => {
        const next = value + 1;
        setBestCombo((best) => Math.max(best, next));
        return next;
      });
    } else {
      setCombo(0);
      setShowSteps(true);
    }

    let xp = 0;
    let badges: string[] = [];
    let saved = false;
    try {
      const response = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'drill',
          target: exercise.kind,
          score: result.correct ? 100 : 0,
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as { gainedXp?: number; newBadges?: { title: string }[] };
        xp = data.gainedXp ?? 0;
        badges = (data.newBadges ?? []).map((badge) => badge.title);
        saved = true;
      }
    } catch {
      saved = false;
    }

    setFeedback({ result, xp, badges, saved });
    setBusy(false);
  }, [busy, exercise, feedback, input]);

  function next() {
    setSeed(`${seed}-${solved}-${attempts}-${Date.now().toString(36)}`);
  }

  const accuracy = attempts ? Math.round((solved / attempts) * 100) : 0;

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
      <div className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setKind('mixte')}
              className={cn('chip', kind === 'mixte' && 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan')}
            >
              Mixte
            </button>
            {EXERCISE_KINDS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setKind(item)}
                className={cn('chip', kind === item && 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan')}
              >
                {EXERCISE_LABELS[item]}
              </button>
            ))}
          </div>
          <span className="font-mono text-[10px] text-fg-mute">{exercise.id}</span>
        </div>

        <div className="mt-3 rounded-xl border border-line/50 bg-ink-900/50 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[12.5px] font-semibold">{exercise.title}</h3>
            <span className="flex items-center gap-1 font-mono text-[10px] text-fg-mute">
              <Timer size={10} /> {elapsed}s
            </span>
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-fg-soft">{exercise.prompt}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {exercise.given.map((item) => (
              <span key={item.label} className="rounded-md border border-line/60 bg-ink-850/60 px-1.5 py-0.5 font-mono text-[10.5px]">
                <span className="text-spark-cyan">{item.label}</span> = {item.value}
              </span>
            ))}
          </div>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="mt-3 flex flex-wrap items-end gap-2"
        >
          <label className="min-w-[160px] flex-1">
            <span className="text-[10.5px] text-fg-mute">{exercise.ask}</span>
            <div className="mt-1 flex items-center gap-1.5">
              <input
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={Boolean(feedback) || busy}
                inputMode="decimal"
                placeholder="votre résultat"
                className="input w-full font-mono text-[13px]"
                aria-label={`${exercise.ask} en ${exercise.unit}`}
              />
              <span className="shrink-0 rounded-md border border-line/60 px-2 py-1.5 font-mono text-[11px] text-fg-soft">
                {exercise.unit}
              </span>
            </div>
          </label>
          {feedback ? (
            <button type="button" onClick={next} className="btn btn-primary h-[34px]">
              Suivant <ArrowRight size={13} />
            </button>
          ) : (
            <button type="submit" disabled={busy || !input.trim()} className="btn btn-primary h-[34px]">
              <Check size={13} /> Vérifier
            </button>
          )}
        </form>

        {feedback ? (
          <div
            className={cn(
              'mt-3 rounded-xl border p-2.5 text-[11.5px]',
              feedback.result.correct
                ? 'border-spark-green/40 bg-spark-green/[0.07] text-spark-green'
                : 'border-spark-rose/40 bg-spark-rose/[0.06] text-spark-rose',
            )}
          >
            <p className="flex items-center gap-1.5 font-medium">
              {feedback.result.correct ? <Check size={13} /> : <X size={13} />}
              {feedback.result.correct
                ? `Exact — écart ${feedback.result.deltaPercent.toFixed(1)} %`
                : `Écart de ${feedback.result.deltaPercent.toFixed(1)} % · attendu ${feedback.result.expected}`}
            </p>
            <p className="mt-1 text-[10.5px] text-fg-soft">
              +{feedback.xp} XP {feedback.saved ? 'enregistrés' : '— connectez-vous pour enregistrer la progression'}
              {feedback.badges.length ? ` · badge${feedback.badges.length > 1 ? 's' : ''} : ${feedback.badges.join(', ')}` : ''}
            </p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowSteps((value) => !value)} className="btn btn-sm border-line/60">
            <Lightbulb size={12} /> {showSteps ? 'Masquer la correction' : 'Voir la correction'}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSteps(false);
              next();
            }}
            className="btn btn-sm border-line/60"
          >
            <RefreshCw size={12} /> Autre tirage
          </button>
          <Link
            href={`/studio?template=${exercise.template}`}
            className="btn btn-sm border-line/60"
            title="Ouvrir le montage associé dans le studio"
          >
            <ExternalLink size={12} /> Vérifier dans le studio
          </Link>
        </div>

        {showSteps ? (
          <ol className="mt-3 space-y-1.5">
            {exercise.steps.map((step, index) => (
              <li key={step.math} className="rounded-lg border border-line/40 bg-ink-900/40 px-2.5 py-1.5">
                <p className="text-[10.5px] text-fg-mute">
                  {index + 1}. {step.text}
                </p>
                <p className="font-mono text-[11.5px] text-spark-cyan">{step.math}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      <aside className="space-y-2">
        <div className="panel p-3">
          <p className="text-[10px] uppercase tracking-wide text-fg-mute">Session</p>
          <dl className="mt-1.5 space-y-1 text-[11.5px]">
            <Row label="Résolus" value={`${solved}`} accent="#46e6a0" />
            <Row label="Essais" value={`${attempts}`} />
            <Row label="Réussite" value={`${accuracy} %`} accent="#38e1e6" />
            <Row label="Combo" value={`${combo}`} accent="#ffc266" />
            <Row label="Record" value={`${bestCombo}`} accent="#a479ff" />
          </dl>
        </div>
        <div className="panel p-3">
          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-fg-mute">
            <CircleHelp size={10} /> Comment ça marche
          </p>
          <ul className="mt-1.5 space-y-1 text-[10.5px] leading-relaxed text-fg-soft">
            <li>• Les valeurs changent à chaque tirage, la méthode reste la même.</li>
            <li>• Tolérance : 2 à 3 % selon le type de calcul (arrondis).</li>
            <li>• Virgule ou point acceptés, unités ignorées.</li>
            <li>• Un essai raté donne 4 XP, un sans-faute 25 XP.</li>
          </ul>
        </div>
        <div className="panel p-3">
          <p className="text-[10px] uppercase tracking-wide text-fg-mute">Partager</p>
          <p className="mt-1 break-all font-mono text-[10.5px] text-spark-cyan">/exercices?ex={exercise.id}</p>
          <Link href="/progression" className="btn btn-sm mt-2 w-full border-line/60">
            Ma progression <ArrowRight size={11} />
          </Link>
        </div>
      </aside>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-fg-mute">{label}</dt>
      <dd className="font-mono font-semibold" style={accent ? { color: accent } : undefined}>
        {value}
      </dd>
    </div>
  );
}
