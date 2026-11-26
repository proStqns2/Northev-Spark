'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  CloudOff,
  Eye,
  EyeOff,
  Fingerprint,
  FolderOpen,
  History,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Palette,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  UserRound,
  Users,
  Bot,
} from 'lucide-react';
import { Avatar, AvatarPicker } from '@/components/ui/Avatar';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { CircuitThumbnail } from '@/components/studio/CircuitCanvas';
import { CircuitDoc } from '@/lib/engine/types';
import { formatSI } from '@/lib/engine/format';
import { formatDate, timeAgo, cn } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import type { SessionUser } from '@/lib/auth/session';

interface CircuitItem {
  id: string;
  name: string;
  notes: string;
  updatedAt: string;
  createdAt: string;
  starred: boolean;
  status: string;
  templateSlug?: string;
  lastResult?: { vth: number; rth: number; inorton: number; regime: 'dc' | 'ac' };
  collaborators: number;
  preview: string;
}

interface Props {
  mode: 'connexion' | 'inscription' | 'profile';
  user: SessionUser | null;
  circuits: CircuitItem[];
  cloud: boolean;
  initialTab?: (typeof TABS)[number]['id'];
}

export function AccountClient({ mode, user, circuits: initialCircuits, cloud, initialTab = 'historique' }: Props) {
  if (mode === 'profile' && user) {
    return <ProfileView user={user} initialCircuits={initialCircuits} cloud={cloud} initialTab={initialTab} />;
  }
  return (
    <AuthView
      initialMode={mode === 'inscription' ? 'inscription' : 'connexion'}
      cloud={cloud}
    />
  );
}

/* ==================================================================== AUTH */
function AuthView({ initialMode, cloud }: { initialMode: 'connexion' | 'inscription'; cloud: boolean }) {
  const [mode, setMode] = useState<'connexion' | 'inscription'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { success } = useToast();

  const strength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password) || /[^a-zA-Z0-9]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (password.length >= 12) score++;
    return score;
  }, [password]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (mode === 'inscription' && password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const endpoint = mode === 'inscription' ? '/api/auth/register' : '/api/auth/login';
      const body =
        mode === 'inscription' ? { name, email, password } : { email, password };
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Échec de l’authentification.');
      success(
        mode === 'inscription' ? 'Compte créé' : 'Connexion réussie',
        mode === 'inscription'
          ? 'Bienvenue sur Northev Spark : votre historique est prêt.'
          : `Ravi de vous revoir, ${payload.user.name}.`,
      );
      router.push('/compte');
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-[1180px] gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_440px] lg:py-16">
      <div className="hidden flex-col justify-center lg:flex">
        <span className="chip w-fit border-spark-cyan/40 bg-spark-cyan/[0.08] text-spark-cyan">
          <Fingerprint size={12} /> Comptes & historique
        </span>
        <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight">
          Vos montages,
          <br />
          votre progression.
        </h1>
        <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-fg-soft">
          Un compte Northev Spark conserve l’historique de vos circuits, leurs résultats d’équivalence et les
          collaborateurs invités. Vos mots de passe sont hachés avec scrypt : jamais stockés en clair.
        </p>

        <ul className="mt-7 space-y-3">
          {[
            { icon: History, title: 'Historique versionné', body: 'Chaque sauvegarde conserve le montage et son dernier U_th / Z_th / I_N.' },
            { icon: Users, title: 'Ateliers multiwork', body: 'Invitez un binôme avec un code à 5 chiffres et retrouvez la session.' },
            { icon: Cloud, title: 'Synchronisation Supabase', body: cloud ? 'Base cloud détectée : l’historique est synchronisé.' : 'Mode démo local actif — ajoutez vos clés Supabase pour la synchronisation cloud.' },
            { icon: Sparkles, title: 'Agents IA', body: 'Débloquez les cinq agents spécialisés du hub premium.' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line/60 bg-ink-850 text-spark-cyan">
                  <Icon size={14} />
                </span>
                <div>
                  <p className="text-[13px] font-medium">{item.title}</p>
                  <p className="text-[12px] leading-relaxed text-fg-mute">{item.body}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-8 flex items-center gap-1.5 text-[11px] text-fg-mute">
          <CloudOff size={12} /> Aucune carte bancaire, aucun e-mail de vérification en mode démo.
        </p>
      </div>

      <div className="panel p-5 sm:p-6">
        <div className="relative grid grid-cols-2 gap-1 rounded-xl border border-line/60 bg-ink-950/50 p-1">
          <span
            className="absolute inset-y-1 w-[calc(50%-4px)] rounded-lg bg-ink-800 transition-transform duration-300"
            style={{ transform: mode === 'connexion' ? 'translateX(4px)' : 'translateX(calc(100% + 4px))' }}
          />
          <button
            type="button"
            onClick={() => setMode('connexion')}
            className={cn('relative z-10 rounded-lg py-2 text-[13px] font-medium transition', mode === 'connexion' ? 'text-fg' : 'text-fg-mute')}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => setMode('inscription')}
            className={cn('relative z-10 rounded-lg py-2 text-[13px] font-medium transition', mode === 'inscription' ? 'text-fg' : 'text-fg-mute')}
          >
            Créer un compte
          </button>
        </div>

        <h2 className="mt-5 text-lg font-semibold tracking-tight">
          {mode === 'connexion' ? 'Content de vous revoir' : 'Ouvrez votre laboratoire'}
        </h2>
        <p className="mt-1 text-[12px] text-fg-mute">
          {mode === 'connexion'
            ? 'Reprenez vos montages là où vous les avez laissés.'
            : 'Un e-mail, un mot de passe, et votre historique commence ici.'}
        </p>

        <form onSubmit={submit} className="mt-4 space-y-3">
          {mode === 'inscription' ? (
            <Field icon={UserRound} label="Nom ou pseudo">
              <input
                required
                minLength={2}
                maxLength={48}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                className="field border-0 bg-transparent px-0 py-1 focus:ring-0"
                autoComplete="name"
              />
            </Field>
          ) : null}

          <Field icon={Mail} label="Adresse e-mail">
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.fr"
              className="field border-0 bg-transparent px-0 py-1 focus:ring-0"
              autoComplete="email"
            />
          </Field>

          <Field icon={Lock} label="Mot de passe">
            <div className="flex flex-1 items-center gap-2">
              <input
                required
                type={show ? 'text' : 'password'}
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'inscription' ? '8 caractères minimum' : '••••••••'}
                className="field flex-1 border-0 bg-transparent px-0 py-1 focus:ring-0"
                autoComplete={mode === 'inscription' ? 'new-password' : 'current-password'}
              />
              <button type="button" onClick={() => setShow((v) => !v)} className="text-fg-mute hover:text-fg" aria-label="Afficher le mot de passe">
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </Field>

          {mode === 'inscription' ? (
            <>
              <div className="flex gap-1">
                {[0, 1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1 flex-1 rounded-full transition',
                      strength > i
                        ? strength >= 3
                          ? 'bg-spark-green'
                          : 'bg-spark-amber'
                        : 'bg-line/60',
                    )}
                  />
                ))}
              </div>
              <Field icon={Lock} label="Confirmation">
                <input
                  required
                  type={show ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Retapez le mot de passe"
                  className="field border-0 bg-transparent px-0 py-1 focus:ring-0"
                  autoComplete="new-password"
                />
              </Field>
            </>
          ) : null}

          {error ? (
            <p className="flex items-start gap-1.5 rounded-lg border border-spark-coral/40 bg-spark-coral/[0.08] px-2.5 py-2 text-[11.5px] text-spark-coral">
              <AlertCircle size={13} className="mt-0.5 shrink-0" /> {error}
            </p>
          ) : null}

          <button type="submit" disabled={loading} className="btn btn-primary w-full">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            {loading
              ? 'Traitement…'
              : mode === 'connexion'
                ? 'Se connecter'
                : 'Créer mon compte gratuit'}
          </button>
        </form>

        {/* Compte de démonstration */}
        <div className="mt-3 rounded-xl border border-line/50 bg-ink-850/40 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-mute">Compte de démonstration</p>
          <p className="mt-1 font-mono text-[11px] text-fg-soft">demo@northev.fr · demo1234</p>
          <div className="mt-1.5 flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setMode('connexion');
                setEmail('demo@northev.fr');
                setPassword('demo1234');
              }}
              className="btn btn-sm flex-1"
            >
              Pré-remplir
            </button>
            <button
              type="button"
              onClick={async () => {
                const response = await fetch('/api/auth/login', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ email: 'demo@northev.fr', password: 'demo1234' }),
                });
                if (response.ok) {
                  router.push('/compte');
                  router.refresh();
                } else {
                  setError('Le compte de démonstration n’existe pas encore : créez-le avec demo@northev.fr / demo1234.');
                }
              }}
              className="btn btn-sm flex-1 border-spark-cyan/40 text-spark-cyan"
            >
              Se connecter
            </button>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-fg-mute">
            Ce compte existe-t-il ? S’il ne s’est jamais connecté, créez-le d’abord via l’onglet « Créer un compte ».
          </p>
        </div>

        <p className="mt-4 text-center text-[10.5px] leading-relaxed text-fg-mute">
          En continuant, vous acceptez que vos montages soient conservés sur ce serveur pour votre historique.
        </p>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-xl border border-line/60 bg-ink-950/60 px-3 py-2.5 focus-within:border-spark-cyan/60">
      <Icon size={15} className="mt-1.5 shrink-0 text-fg-mute" />
      <div className="min-w-0 flex-1">
        <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-fg-mute">{label}</span>
        {children}
      </div>
    </label>
  );
}

/* ================================================================= PROFILE */
const TABS = [
  { id: 'historique', label: 'Historique', icon: History },
  { id: 'profil', label: 'Profil', icon: UserRound },
  { id: 'apparence', label: 'Apparence', icon: Palette },
  { id: 'securite', label: 'Sécurité', icon: ShieldCheck },
  { id: 'cles', label: 'Clés IA', icon: KeyRound },
] as const;


/* ============================================================== CLÉS API */
/**
 * Gestion des clés IA personnelles.
 * La clé saisie ici part en HTTPS vers le serveur, qui la chiffre
 * (AES-256-GCM) : elle n'est jamais renvoyée au navigateur, seule son
 * empreinte (« AQ.A…yl8A ») est réaffichée.
 */
function ApiKeysPanel() {
  const [info, setInfo] = useState<{
    vault: boolean;
    serverGemini: boolean;
    keys: { gemini: { fingerprint: string; updatedAt: string } | null; openai: { fingerprint: string; updatedAt: string } | null };
    providers?: { gemini: boolean; openrouter: boolean; openai: boolean };
  } | null>(null);
  const [drafts, setDrafts] = useState({ gemini: '', openai: '' });
  const [busy, setBusy] = useState<'gemini' | 'openai' | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const { success, error } = useToast();

  const load = useCallback(async () => {
    const response = await fetch('/api/profile/keys', { cache: 'no-store' });
    if (response.ok) setInfo(await response.json());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(provider: 'gemini' | 'openai') {
    const key = drafts[provider].trim();
    if (!key) return;
    setBusy(provider);
    setFeedback(null);
    try {
      const response = await fetch('/api/profile/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Enregistrement impossible.');
      setDrafts((d) => ({ ...d, [provider]: '' }));
      setFeedback({ tone: 'ok', text: `Clé ${provider} chiffrée et enregistrée (${payload.fingerprint}).` });
      success('Clé enregistrée', 'Elle est chiffrée côté serveur et ne sera plus affichée en clair.');
      await load();
    } catch (e) {
      setFeedback({ tone: 'bad', text: (e as Error).message });
      error('Clé refusée', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(provider: 'gemini' | 'openai') {
    const response = await fetch(`/api/profile/keys?provider=${provider}`, { method: 'DELETE' });
    if (response.ok) {
      success('Clé supprimée', 'Le serveur reprend sa clé par défaut si elle existe.');
      await load();
    }
  }

  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_300px]">
      <section className="panel p-4">
        <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Sparkles size={14} className="text-spark-violet" /> Clés IA personnelles
        </h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-fg-mute">
          Votre clé permet au bouton <strong className="text-fg-soft">Gemini</strong> du studio de générer des schémas
          équivalents avec votre propre quota. Elle est chiffrée en AES-256-GCM et n’est jamais renvoyée au navigateur.
        </p>

        {info ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(
              [
                { id: 'gemini', label: 'Gemini', on: info.providers?.gemini },
                { id: 'openrouter', label: 'OpenRouter', on: info.providers?.openrouter },
                { id: 'openai', label: 'OpenAI', on: info.providers?.openai },
              ] as const
            ).map((item) => (
              <span
                key={item.id}
                className={cn(
                  'chip font-mono text-[10px]',
                  item.on
                    ? 'border-spark-green/40 bg-spark-green/10 text-spark-green'
                    : 'border-line/60 text-fg-mute',
                )}
                title={
                  item.on
                    ? 'Ce fournisseur répondra : clé serveur ou clé personnelle présente.'
                    : 'Aucune clé pour ce fournisseur : les agents répondent alors avec le moteur local.'
                }
              >
                {item.on ? '●' : '○'} {item.label}
              </span>
            ))}
          </div>
        ) : null}

        {info && !info.vault ? (
          <p className="mt-2 rounded-lg border border-spark-amber/40 bg-spark-amber/[0.07] p-2 text-[10.5px] text-spark-amber">
            Coffre désactivé : définissez <code className="rounded bg-ink-850 px-1">SECRET_KEY</code> (≥ 16 caractères)
            dans les variables du serveur pour activer l’enregistrement chiffré.
          </p>
        ) : null}

        {(['gemini', 'openai'] as const).map((provider) => {
          const current = info?.keys?.[provider] ?? null;
          return (
            <div key={provider} className="mt-3 rounded-xl border border-line/50 bg-ink-850/40 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[12px] font-medium capitalize">
                  {provider === 'gemini' ? <Sparkles size={12} className="text-spark-violet" /> : <Bot size={12} className="text-spark-green" />}
                  {provider}
                </p>
                {current ? (
                  <span className="chip border-spark-green/40 bg-spark-green/10 font-mono text-[10px] text-spark-green">
                    {current.fingerprint}
                  </span>
                ) : (
                  <span className="chip text-[10px]">
                    {provider === 'gemini' && info?.serverGemini ? 'clé serveur active' : 'non configurée'}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <input
                  type="password"
                  value={drafts[provider]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [provider]: e.target.value }))}
                  placeholder={provider === 'gemini' ? 'AIza… ou AQ.…' : 'sk-…'}
                  className="field min-w-[180px] flex-1 font-mono text-[11px]"
                  autoComplete="off"
                  spellCheck={false}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void save(provider);
                  }}
                />
                <button
                  type="button"
                  onClick={() => save(provider)}
                  disabled={busy === provider || !drafts[provider].trim()}
                  className="btn btn-primary btn-sm"
                >
                  {busy === provider ? <Loader2 size={12} className="animate-spin" /> : <KeyRound size={12} />}
                  Enregistrer
                </button>
                {current ? (
                  <button type="button" onClick={() => remove(provider)} className="btn btn-sm border-spark-coral/40 text-spark-coral">
                    Supprimer
                  </button>
                ) : null}
              </div>

              {current ? (
                <p className="mt-1.5 text-[10px] text-fg-mute">
                  Enregistrée le {new Date(current.updatedAt).toLocaleString('fr-FR')}
                </p>
              ) : null}
            </div>
          );
        })}

        {feedback ? (
          <p
            className={cn(
              'mt-2.5 rounded-lg border p-2 text-[10.5px]',
              feedback.tone === 'ok'
                ? 'border-spark-green/40 bg-spark-green/[0.07] text-spark-green'
                : 'border-spark-coral/40 bg-spark-coral/[0.07] text-spark-coral',
            )}
          >
            {feedback.text}
          </p>
        ) : null}
      </section>

      <section className="panel p-4">
        <h2 className="text-[13px] font-semibold">Ce qu’il faut savoir</h2>
        <ul className="mt-2 space-y-1.5 text-[10.5px] leading-relaxed text-fg-soft">
          <li>• La clé circule une seule fois, en HTTPS, vers le route handler Node.</li>
          <li>• Elle est stockée chiffrée ; seule une empreinte est affichée.</li>
          <li>• Sans clé personnelle, le serveur utilise sa propre clé si elle existe.</li>
          <li>• Toute proposition de schéma est recalculée par le solveur avant acceptation.</li>
          <li>• Une clé exposée doit être révoquée dans Google AI Studio.</li>
        </ul>
        <div className="mt-2.5 rounded-lg border border-line/40 bg-ink-950/50 p-2.5">
          <p className="text-[10px] leading-relaxed text-fg-mute">
            Rappel : ne collez jamais une clé dans un champ public, un dépôt git ou un message. Si c’est arrivé,
            révoquez-la et générez-en une nouvelle.
          </p>
        </div>
      </section>
    </div>
  );
}

function ProfileView({
  user,
  initialCircuits,
  cloud,
  initialTab = 'historique',
}: {
  user: SessionUser;
  initialCircuits: CircuitItem[];
  cloud: boolean;
  initialTab?: (typeof TABS)[number]['id'];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>(initialTab);
  const [circuits, setCircuits] = useState(initialCircuits);
  const [query, setQuery] = useState('');
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [name, setName] = useState(user.name);
  const [avatar, setAvatar] = useState(user.avatar);
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const router = useRouter();
  const { success, error, info } = useToast();

  const filtered = useMemo(
    () =>
      circuits
        .filter((c) => (onlyStarred ? c.starred : true))
        .filter((c) => (query ? c.name.toLowerCase().includes(query.toLowerCase()) : true)),
    [circuits, query, onlyStarred],
  );

  async function syncCloud() {
    setSyncing(true);
    try {
      const response = await fetch('/api/circuits?sync=1');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Synchronisation impossible.');
      setCircuits(payload.circuits);
      success(
        'Historique à jour',
        payload.synced?.cloud
          ? `${payload.synced.imported} montage(s) importé(s) depuis Supabase.`
          : 'Stockage local : aucun montage cloud à importer.',
      );
    } catch (e) {
      error('Synchronisation impossible', (e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  async function toggleStar(id: string) {
    const response = await fetch(`/api/circuits/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred: true }),
    });
    if (!response.ok) return;
    const payload = await response.json();
    setCircuits((list) => list.map((c) => (c.id === id ? { ...c, starred: payload.starred } : c)));
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Supprimer définitivement « ${name} » ?`)) return;
    const response = await fetch(`/api/circuits/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      error('Suppression impossible');
      return;
    }
    setCircuits((list) => list.filter((c) => c.id !== id));
    info('Montage supprimé', `« ${name} » a été retiré de votre historique.`);
  }

  async function saveProfile() {
    setSavingProfile(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, avatar }),
      });
      if (!response.ok) throw new Error('Enregistrement refusé.');
      success('Profil mis à jour', 'Vos modifications sont visibles dans tout le studio.');
      router.refresh();
    } catch (e) {
      error('Échec', (e as Error).message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword() {
    setSavingPassword(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current: currentPassword, next: nextPassword }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Changement refusé.');
      setCurrentPassword('');
      setNextPassword('');
      success('Mot de passe modifié', 'Reconnectez-vous avec vos nouveaux identifiants.');
      setTimeout(() => router.push('/compte?mode=connexion'), 1200);
    } catch (e) {
      error('Échec', (e as Error).message);
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <header className="panel flex flex-wrap items-center gap-4 p-4 sm:p-5">
        <Avatar name={user.name} avatar={avatar} size={54} ring />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{user.name}</h1>
            <span className="chip border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan">
              {cloud ? <Cloud size={11} /> : <CloudOff size={11} />} {cloud ? 'Supabase actif' : 'Mode démo local'}
            </span>
          </div>
          <p className="text-[12px] text-fg-mute">{user.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/studio" className="btn btn-sm">
            <Sparkles size={13} /> Studio
          </Link>
          <button type="button" onClick={syncCloud} disabled={syncing} className="btn btn-sm">
            <RefreshCw size={13} className={cn(syncing && 'animate-spin')} /> Synchroniser
          </button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-1 border-b border-line/60">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] font-medium transition',
                tab === item.id ? 'border-spark-cyan text-fg' : 'border-transparent text-fg-mute hover:text-fg-soft',
              )}
            >
              <Icon size={14} /> {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'historique' ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-line/60 bg-ink-900/70 px-2.5 py-2">
              <Search size={13} className="text-fg-mute" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher un montage…"
                className="w-full bg-transparent text-[12.5px] outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => setOnlyStarred((v) => !v)}
              className={cn('btn btn-sm', onlyStarred && 'border-spark-amber/60 text-spark-amber')}
            >
              <Star size={13} className={onlyStarred ? 'fill-spark-amber' : ''} /> Favoris
            </button>
            <span className="chip">{filtered.length} / {circuits.length}</span>
          </div>

          {filtered.length ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((circuit) => {
                let doc: CircuitDoc | null = null;
                try {
                  doc = JSON.parse(circuit.preview) as CircuitDoc;
                } catch {
                  doc = null;
                }
                return (
                  <article key={circuit.id} className="panel group overflow-hidden">
                    <div className="relative h-[112px] border-b border-line/50 bg-ink-950/50">
                      {doc ? <CircuitThumbnail doc={doc} /> : null}
                      <button
                        type="button"
                        onClick={() => toggleStar(circuit.id)}
                        className={cn(
                          'absolute right-2 top-2 rounded-md border border-line/60 bg-ink-900/85 p-1 transition',
                          circuit.starred ? 'text-spark-amber' : 'text-fg-mute hover:text-fg',
                        )}
                        aria-label="Favori"
                      >
                        <Star size={12} className={circuit.starred ? 'fill-spark-amber' : ''} />
                      </button>
                    </div>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-[13px] font-medium">{circuit.name}</h3>
                          <p className="text-[10px] text-fg-mute">
                            {timeAgo(circuit.updatedAt)} · {formatDate(circuit.createdAt)}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded px-1.5 py-0.5 text-[8.5px] uppercase tracking-wider',
                            circuit.status === 'published'
                              ? 'bg-spark-green/15 text-spark-green'
                              : 'bg-ink-800 text-fg-mute',
                          )}
                        >
                          {circuit.status === 'published' ? 'publié' : 'brouillon'}
                        </span>
                      </div>
                      {circuit.lastResult ? (
                        <div className="mt-2 grid grid-cols-3 gap-1 border-t border-line/40 pt-2 font-mono text-[9px]">
                          <div>
                            <p className="text-fg-mute">U_th</p>
                            <p className="text-spark-cyan">{formatSI(circuit.lastResult.vth, 'V')}</p>
                          </div>
                          <div>
                            <p className="text-fg-mute">Z_th</p>
                            <p className="text-spark-violet">{formatSI(circuit.lastResult.rth, 'Ω')}</p>
                          </div>
                          <div>
                            <p className="text-fg-mute">I_N</p>
                            <p className="text-spark-amber">{formatSI(circuit.lastResult.inorton, 'A')}</p>
                          </div>
                        </div>
                      ) : null}
                      {circuit.collaborators ? (
                        <p className="mt-1.5 flex items-center gap-1 text-[10px] text-fg-mute">
                          <Users size={10} /> {circuit.collaborators} collaborateur(s)
                        </p>
                      ) : null}
                      <div className="mt-2.5 flex gap-1.5">
                        <Link href={`/studio?circuit=${circuit.id}`} className="btn btn-sm flex-1">
                          <FolderOpen size={12} /> Ouvrir
                        </Link>
                        <button
                          type="button"
                          onClick={() => remove(circuit.id, circuit.name)}
                          className="btn btn-sm px-2 hover:border-spark-coral/50 hover:text-spark-coral"
                          aria-label="Supprimer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="panel mt-3 flex flex-col items-center gap-2 p-10 text-center">
              <History size={22} className="text-fg-mute" />
              <p className="text-sm font-medium">Aucun montage enregistré {onlyStarred ? 'en favori' : ''}.</p>
              <p className="max-w-sm text-[12px] text-fg-mute">
                Ouvrez un gabarit de la bibliothèque, modifiez-le, puis appuyez sur « Enregistrer » (Ctrl+S).
              </p>
              <Link href="/bibliotheque" className="btn btn-sm mt-1">
                Parcourir la bibliothèque <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {tab === 'profil' ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="panel p-4">
            <h2 className="text-[13px] font-semibold">Identité</h2>
            <p className="text-[11.5px] text-fg-mute">Ce nom apparaît sur les ateliers multiwork et les exports.</p>
            <label className="mt-3 block">
              <span className="label-xs">Nom affiché</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="field mt-1" maxLength={48} />
            </label>
            <label className="mt-2 block">
              <span className="label-xs">Adresse e-mail</span>
              <input value={user.email} readOnly className="field mt-1 opacity-60" />
            </label>
            <div className="mt-2">
              <span className="label-xs">Avatar</span>
              <div className="mt-1.5">
                <AvatarPicker value={avatar} onChange={setAvatar} />
              </div>
            </div>
            <button type="button" onClick={saveProfile} disabled={savingProfile} className="btn btn-primary btn-sm mt-3">
              {savingProfile ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Enregistrer
            </button>
          </section>

          <section className="panel p-4">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
              <Settings2 size={14} /> Préférences du studio
            </h2>
            <p className="text-[11.5px] text-fg-mute">
              Ces réglages sont mémorisés dans ce navigateur et appliqués à l’ouverture du studio.
            </p>
            <div className="mt-3 space-y-2">
              <PrefToggle label="Afficher la grille" storageKey="grid" defaultValue />
              <PrefToggle label="Animer les électrons" storageKey="flow" defaultValue />
              <div className="flex items-center justify-between rounded-lg border border-line/50 bg-ink-850/50 px-2.5 py-2">
                <span className="text-[12px] text-fg-soft">Vitesse des électrons</span>
                <input
                  type="range"
                  min={0.3}
                  max={2.5}
                  step={0.1}
                  defaultValue={1}
                  className="w-28"
                  onChange={(e) => {
                    window.localStorage.setItem('northev.speed', e.target.value);
                  }}
                />
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-line/40 bg-ink-900/50 p-2.5">
              <p className="flex items-center gap-1 text-[11px] font-medium text-fg-soft">
                <CheckCircle2 size={12} className="text-spark-green" /> Compte créé le {formatDate(circuitDateFallback(user))}
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">
                Votre rôle actuel : <span className="text-fg-soft">{user.role === 'pro' ? 'Premium' : 'Standard'}</span>.
                Les agents IA premium restent accessibles en démonstration.
              </p>
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'apparence' ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="panel p-4">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
              <Palette size={14} /> Thème de travail
            </h2>
            <p className="text-[11.5px] text-fg-mute">
              Quatre ambiances, appliquées immédiatement à tout le site et à vos exports si vous le souhaitez.
            </p>
            <div className="mt-3">
              <ThemeSwitcher initial={user.theme} persistToProfile compact={false} />
            </div>
          </section>
          <section className="panel p-4">
            <h2 className="text-[13px] font-semibold">Aperçu du canvas</h2>
            <p className="text-[11.5px] text-fg-mute">La grille, les nœuds et les couleurs de dipôles suivent le thème.</p>
            <div className="mt-3 h-[210px] overflow-hidden rounded-xl border border-line/60 canvas-grid bg-ink-950/60">
              <div className="flex h-full items-center justify-center">
                <div className="text-center">
                  <p className="font-mono text-[11px] text-spark-cyan">R · C · L · E · I</p>
                  <p className="mt-1 text-[10.5px] text-fg-mute">Les teintes s’adaptent automatiquement.</p>
                </div>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'cles' ? <ApiKeysPanel /> : null}

      {tab === 'securite' ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <section className="panel p-4">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold">
              <KeyRound size={14} /> Changer de mot de passe
            </h2>
            <p className="text-[11.5px] text-fg-mute">
              Le changement révoque toutes vos sessions actives : vous devrez vous reconnecter.
            </p>
            <label className="mt-3 block">
              <span className="label-xs">Mot de passe actuel</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="field mt-1"
                autoComplete="current-password"
              />
            </label>
            <label className="mt-2 block">
              <span className="label-xs">Nouveau mot de passe</span>
              <input
                type="password"
                value={nextPassword}
                onChange={(e) => setNextPassword(e.target.value)}
                className="field mt-1"
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <button
              type="button"
              onClick={changePassword}
              disabled={savingPassword || !currentPassword || nextPassword.length < 8}
              className="btn btn-primary btn-sm mt-3"
            >
              {savingPassword ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Mettre à jour
            </button>
          </section>

          <section className="panel p-4">
            <h2 className="text-[13px] font-semibold">Détails techniques</h2>
            <dl className="mt-2.5 space-y-1.5 font-mono text-[10.5px]">
              {[
                ['Hachage', 'scrypt · N=16384, r=8, p=1'],
                ['Session', 'cookie httpOnly · 30 jours'],
                ['Identifiant', user.id],
                ['Stockage', cloud ? 'Supabase + cache local' : 'JSON local (.data)'],
                ['Rôle', user.role],
              ].map(([key, value]) => (
                <div key={key} className="flex items-start justify-between gap-3 border-b border-line/30 pb-1.5">
                  <dt className="text-fg-mute">{key}</dt>
                  <dd className="max-w-[62%] break-all text-right text-fg-soft">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2.5 flex items-start gap-1.5 text-[10.5px] leading-relaxed text-fg-mute">
              <ShieldCheck size={12} className="mt-0.5 shrink-0 text-spark-green" />
              Aucune clé d’API n’est exposée au navigateur : les appels OpenAI / Gemini sont faits côté serveur.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function circuitDateFallback(user: SessionUser): string {
  void user;
  return new Date().toISOString();
}

function PrefToggle({
  label,
  storageKey,
  defaultValue,
}: {
  label: string;
  storageKey: string;
  defaultValue: boolean;
}) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return defaultValue;
    const raw = window.localStorage.getItem(`northev.pref.${storageKey}`);
    return raw === null ? defaultValue : raw === '1';
  });
  return (
    <button
      type="button"
      onClick={() => {
        const next = !value;
        setValue(next);
        window.localStorage.setItem(`northev.pref.${storageKey}`, next ? '1' : '0');
      }}
      className="flex w-full items-center justify-between rounded-lg border border-line/50 bg-ink-850/50 px-2.5 py-2"
    >
      <span className="text-[12px] text-fg-soft">{label}</span>
      <span className={cn('relative h-5 w-9 rounded-full transition', value ? 'bg-spark-cyan/80' : 'bg-ink-700')}>
        <span
          className="absolute top-0.5 h-4 w-4 rounded-full bg-ink-950 transition"
          style={{ left: value ? 18 : 2 }}
        />
      </span>
    </button>
  );
}

