'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, CircuitBoard, Flame, Send, Target, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { Confetti } from './visuals';
import type { Challenge } from '@/lib/learning/types';

/**
 * Carte du défi quotidien : saisie numérique, tolérance, verdict immédiat
 * et enregistrement côté serveur en cas de réussite.
 */
export function ChallengeCard({
  challenge,
  signedIn,
  solved,
}: {
  challenge: Challenge;
  signedIn: boolean;
  solved: boolean;
}) {
  const { success, error, info } = useToast();
  const [value, setValue] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'ok' | 'ko' | 'done'>(solved ? 'done' : 'idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [fire, setFire] = useState(0);

  async function submit() {
    const numeric = Number(value.replace(',', '.').replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(numeric)) {
      info('Entrez une valeur numérique', 'Exemple : 500 ou 6.25');
      return;
    }
    if (!signedIn) {
      info('Connexion requise', 'Créez un compte pour valider le défi.');
      return;
    }
    setState('sending');
    try {
      const response = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer: numeric }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        gainedXp?: number;
        target?: { value: number; unit: string; label: string };
        newBadges?: Array<{ title: string }>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Envoi impossible.');
      if (payload.ok) {
        setState('done');
        setFire((v) => v + 1);
        setFeedback(`+${payload.gainedXp ?? 0} XP`);
        success('Défi relevé', `${challenge.target.label} = ${challenge.target.value} ${challenge.target.unit}`);
        for (const badge of payload.newBadges ?? []) success('Badge débloqué', badge.title);
      } else {
        setState('ko');
        setFeedback('Tolérance dépassée — reprenez le calcul.');
      }
    } catch (e) {
      setState('idle');
      error('Défi non validé', (e as Error).message);
    }
  }

  return (
    <div className="panel academy-grid relative overflow-hidden p-4">
      <Confetti fire={fire} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip border-spark-amber/40 bg-spark-amber/10 text-spark-amber">
          <Flame size={11} /> Défi du {new Date(`${challenge.date}T00:00:00Z`).toLocaleDateString('fr-FR')}
        </span>
        <span className="chip">
          <Target size={11} /> {challenge.title}
        </span>
        <span className="chip">+{challenge.reward} XP</span>
        {state === 'done' ? (
          <span className="chip border-spark-green/40 bg-spark-green/10 text-spark-green">
            <CheckCircle2 size={11} /> résolu
          </span>
        ) : null}
      </div>

      <p className="mt-2.5 text-[12.5px] leading-relaxed text-fg-soft">{challenge.brief}</p>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[150px]">
          <span className="block text-[10.5px] text-fg-mute">
            Votre réponse pour {challenge.target.label} (tolérance ±{challenge.target.tolerance} {challenge.target.unit})
          </span>
          <span className="mt-1 flex items-center gap-1.5 rounded-xl border border-line/60 bg-ink-900/70 px-2.5 py-1.5">
            <input
              value={value}
              onChange={(event) => {
                setValue(event.target.value);
                if (state === 'ko') setState('idle');
              }}
              inputMode="decimal"
              placeholder="0"
              disabled={state === 'done'}
              className="w-full bg-transparent text-[13px] outline-none"
            />
            <span className="text-[11px] text-fg-mute">{challenge.target.unit}</span>
          </span>
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={state === 'sending' || state === 'done'}
          className={cn('btn btn-sm', state === 'done' ? 'border-spark-green/40 text-spark-green' : 'btn-primary')}
        >
          {state === 'done' ? (
            <>
              <CheckCircle2 size={12} /> validé
            </>
          ) : state === 'sending' ? (
            'Vérification…'
          ) : (
            <>
              <Send size={12} /> Valider
            </>
          )}
        </button>

        <Link href={`/studio?template=${challenge.template}`} target="_blank" className="btn btn-sm border-line/60">
          <CircuitBoard size={12} /> Ouvrir le montage
        </Link>
      </div>

      {state === 'ko' ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-spark-red">
          <XCircle size={12} /> {feedback}
        </p>
      ) : null}
      {state === 'done' ? (
        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-spark-green">
          <CheckCircle2 size={12} /> {feedback ?? 'Déjà résolu aujourd’hui'} — réponse : {challenge.target.value}{' '}
          {challenge.target.unit}
        </p>
      ) : null}
    </div>
  );
}
