'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bot, Check, Loader2, Power, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Réglages de l'assistant.
 *
 * Le composant ne fait rien tant que l'utilisateur n'a pas cliqué : pas
 * d'appel au chargement vers un modèle, pas de dépendance cachée. L'état
 * affiché vient de `/api/ai/status`, qui ne coûte rien (lecture de la
 * configuration et du consentement).
 */

interface AiStatus {
  enabled: boolean;
  configured: boolean;
  consented: boolean;
  ready: boolean;
  providers: { openai: boolean; gemini: boolean; openrouter: boolean };
  model?: string;
  reason?: string;
}

const AGENTS = [
  { id: 'prof', label: 'Professeur', hint: 'explique pas à pas' },
  { id: 'architecte', label: 'Architecte', hint: 'propose un montage' },
  { id: 'verificateur', label: 'Vérificateur', hint: 'relit le calcul' },
  { id: 'coach', label: 'Coach', hint: 'oriente les révisions' },
];

export function AssistantClient() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [agent, setAgent] = useState('prof');
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/ai/status', { cache: 'no-store' });
      const data = (await response.json()) as { assistant: AiStatus };
      setStatus(data.assistant);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle() {
    if (!status) return;
    setToggling(true);
    setError(null);
    try {
      const response = await fetch('/api/ai/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !status.consented }),
      });
      const data = (await response.json()) as { assistant?: AiStatus; error?: string };
      if (!response.ok) {
        setError(data.error ?? 'Réglage refusé par le serveur.');
        return;
      }
      if (data.assistant) setStatus(data.assistant);
    } catch {
      setError('Serveur injoignable.');
    } finally {
      setToggling(false);
    }
  }

  async function ask() {
    if (!question.trim() || asking) return;
    setAsking(true);
    setError(null);
    setReply(null);
    try {
      const response = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent, task: question.trim(), question: question.trim() }),
      });
      const data = (await response.json()) as { reply?: string; error?: string; code?: string };
      if (!response.ok) {
        setError(
          data.code === 'AI_OFF'
            ? `${data.error ?? 'Assistant désactivé.'}`
            : (data.error ?? 'Requête refusée.'),
        );
        return;
      }
      setReply(data.reply ?? 'Pas de réponse.');
    } catch {
      setError('Serveur injoignable.');
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[1.15fr_1fr]">
      <section className="panel p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold">État de l’assistant</h2>
            <p className="mt-0.5 text-[11px] text-fg-mute">Trois conditions indépendantes du reste du site.</p>
          </div>
          {loading ? <Loader2 size={14} className="animate-spin text-fg-mute" /> : null}
        </div>

        <ul className="mt-3 space-y-1.5">
          <Condition
            label="Interrupteur serveur"
            ok={Boolean(status?.enabled)}
            detail={
              status?.enabled
                ? 'Autorisé par la configuration.'
                : 'Désactivé : aucune route IA ne répondra, même avec une clé.'
            }
          />
          <Condition
            label="Clé fournisseur"
            ok={Boolean(status?.configured)}
            detail={
              status?.configured
                ? `Fournisseurs : ${Object.entries(status.providers)
                    .filter(([, value]) => value)
                    .map(([key]) => key)
                    .join(', ')}${status.model ? ` · ${status.model}` : ''}`
                : 'Aucune clé serveur ou personnelle : l’assistant reste en veille.'
            }
          />
          <Condition
            label="Votre consentement"
            ok={Boolean(status?.consented)}
            detail={status?.consented ? 'Vous avez activé l’assistant sur ce compte.' : 'Désactivé par défaut.'}
          />
        </ul>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void toggle()}
            disabled={toggling || loading}
            className={cn('btn btn-sm', status?.consented ? 'border-line/60' : 'btn-primary')}
          >
            {toggling ? <Loader2 size={12} className="animate-spin" /> : <Power size={12} />}
            {status?.consented ? 'Désactiver l’assistant' : 'Activer l’assistant'}
          </button>
          <Link href="/studio" className="btn btn-sm border-line/60">
            Continuer sans IA
          </Link>
        </div>

        {status?.reason ? (
          <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-line/60 bg-ink-900/40 px-2.5 py-2 text-[10.5px] leading-relaxed text-fg-soft">
            <AlertTriangle size={11} className="mt-0.5 shrink-0 text-spark-amber" />
            {status.reason}
          </p>
        ) : null}

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Info title="Le compte" body="Créer un compte, se connecter et changer de mot de passe ne passent par aucun service IA." />
          <Info title="Le studio" body="Poser, câbler, déplacer et calculer est 100 % local (solveur MNA dans le navigateur et sur le serveur)." />
          <Info title="L’académie" body="Leçons, quiz, exercices et défis sont générés par le code du dépôt, sans modèle." />
          <Info title="Les clés" body="Vos clés personnelles sont chiffrées et ne sont jamais renvoyées au navigateur." />
        </div>
      </section>

      <section className="panel flex flex-col p-4">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-spark-violet" />
          <h2 className="text-[13px] font-semibold">Tester l’assistant</h2>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-fg-mute">
          Rien ne part tant que vous ne cliquez pas « Envoyer ». Si l’assistant est éteint, vous recevez le message
          de refus du serveur — jamais une erreur silencieuse.
        </p>

        <div className="mt-2 flex flex-wrap gap-1">
          {AGENTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setAgent(item.id)}
              title={item.hint}
              className={cn(
                'chip',
                agent === item.id && 'border-spark-violet/60 bg-spark-violet/10 text-spark-violet',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={4}
          placeholder="Exemple : explique pourquoi Rth ne dépend pas de la source éteinte…"
          className="input mt-2 w-full resize-none text-[12px]"
        />

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void ask()}
            disabled={asking || !question.trim() || !status?.ready}
            className="btn btn-primary btn-sm"
          >
            {asking ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Envoyer
          </button>
          <button type="button" onClick={() => {
            setQuestion('');
            setReply(null);
            setError(null);
          }} className="btn btn-sm border-line/60">
            <X size={12} /> Effacer
          </button>
          <span className="ml-auto flex items-center gap-1 text-[9.5px] text-fg-mute">
            <ShieldCheck size={10} />
            {status?.ready ? 'prêt' : 'verrouillé'}
          </span>
        </div>

        {error ? (
          <p className="mt-2 rounded-lg border border-spark-rose/40 bg-spark-rose/[0.06] px-2.5 py-2 text-[10.5px] leading-relaxed text-spark-rose">
            {error}
          </p>
        ) : null}

        {reply ? (
          <div className="mt-2 rounded-lg border border-spark-violet/30 bg-spark-violet/[0.05] px-2.5 py-2">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-spark-violet">
              <Bot size={11} /> Réponse
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[11.5px] leading-relaxed text-fg-soft">{reply}</p>
          </div>
        ) : null}

        <p className="mt-auto pt-2 text-[9.5px] leading-relaxed text-fg-mute">
          Sans clé ni consentement, cet écran reste un mode d’emploi : c’est volontaire. Le but est que vous ne
          soyez jamais bloqué par une fonctionnalité dont vous n’avez pas besoin.
        </p>
      </section>
    </div>
  );
}

function Condition({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-start gap-2 rounded-lg border border-line/50 px-2.5 py-1.5">
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
          ok ? 'bg-spark-green/15 text-spark-green' : 'bg-ink-800 text-fg-mute',
        )}
      >
        {ok ? <Check size={10} /> : <X size={10} />}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium">{label}</span>
        <span className="block text-[10px] leading-snug text-fg-mute">{detail}</span>
      </span>
    </li>
  );
}

function Info({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-line/40 bg-ink-900/30 px-2 py-1.5">
      <p className="text-[10.5px] font-medium">{title}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-fg-mute">{body}</p>
    </div>
  );
}
