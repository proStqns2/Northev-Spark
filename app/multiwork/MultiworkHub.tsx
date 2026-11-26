'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Check,
  CircleDot,
  Cloud,
  Copy,
  DoorOpen,
  Hash,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  Radio,
  Send,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import { CircuitDoc } from '@/lib/engine/types';
import { StudioShell } from '@/components/studio/StudioShell';
import { useCollaboration, type LiveCursor, type LiveParticipant } from '@/hooks/useCollaboration';
import { sanitizeDoc } from '@/lib/studio/doc';
import { TileGlyph } from '@/components/marketing/TileGlyph';
import { cn, timeAgo } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

interface ProjectOption {
  id: string;
  name: string;
  color: string;
  rooms: Array<{ code: string; name: string; participants: number }>;
}

interface RoomSummary {
  code: string;
  name: string;
  ownerName: string;
  ownerId: string;
  projectId?: string;
  participants: Array<{ id: string; name: string; color: string }>;
  revision: number;
  updatedAt: string;
}

interface Props {
  user: { id: string; name: string; avatar: string };
  initialCode: string | null;
  rooms: RoomSummary[];
  projects: ProjectOption[];
  templates: Array<{
    slug: string;
    title: string;
    subtitle: string;
    accent: string;
    shape: string;
    regime: 'dc' | 'ac';
  }>;
}

type Phase = 'lobby' | 'creating' | 'joined';

export function MultiworkHub({ user, initialCode, rooms, projects, templates }: Props) {
  const [phase, setPhase] = useState<Phase>(initialCode ? 'joined' : 'lobby');
  const [code, setCode] = useState(initialCode ?? '');
  const [joining, setJoining] = useState(false);
  const [doc, setDoc] = useState<CircuitDoc | null>(null);
  const [roomName, setRoomName] = useState('');
  const [ownerId, setOwnerId] = useState<string>('');
  const [initialMessages, setInitialMessages] = useState<
    Array<{ id: string; authorId: string; authorName: string; text: string; at: string }>
  >([]);
  const [chatOpen, setChatOpen] = useState(true);
  const [chatText, setChatText] = useState('');
  const [newRoomTemplate, setNewRoomTemplate] = useState(templates[0]?.slug ?? '');
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomProject, setNewRoomProject] = useState('');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [creating, setCreating] = useState(false);
  const pushedDocRef = useRef<string>('');
  const revisionRef = useRef(0);
  const [revision, setRevision] = useState(0);
  const setRevisionRef = useCallback((value: number) => {
    revisionRef.current = value;
    setRevision(value);
  }, []);
  const { success, error, info } = useToast();
  const router = useRouter();

  /* ------------------------------------------------------------- chargement */
  const loadRoom = useCallback(
    async (target: string, opts: { silent?: boolean } = {}) => {
      const response = await fetch(`/api/rooms/${target}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Atelier introuvable ou fermé.');
      const payload = await response.json();
      setDoc(sanitizeDoc(payload.doc as CircuitDoc));
      setRoomName(payload.name);
      setOwnerId(payload.ownerId);
      setInitialMessages(payload.messages ?? []);
      setRevisionRef(payload.revision);
      setCode(target);
      setPhase('joined');
      if (!opts.silent) success('Atelier rejoint', `Code ${target} · ${payload.participants.length} participant(s).`);
    },
    [success],
  );

  useEffect(() => {
    if (!initialCode) return;
    void loadRoom(initialCode).catch((e: Error) => {
      error('Connexion impossible', e.message);
      setPhase('lobby');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------- collaboration */
  const collaboration = useCollaboration({
    code: phase === 'joined' ? code : null,
    enabled: phase === 'joined' && Boolean(code),
    localId: user.id,
    onRemoteDoc: (remote, meta) => {
      setDoc(sanitizeDoc(remote));
      setRevision(meta.revision);
      if (meta.author) info(`Mise à jour de ${meta.author}`, 'Le montage distant a été appliqué.');
    },
  });

  const participants: LiveParticipant[] = collaboration.participants;
  interface ChatMessage {
    id: string;
    authorId: string;
    authorName: string;
    text: string;
    at: string;
  }
  const messages = useMemo<ChatMessage[]>(() => {
    const merged = new Map<string, ChatMessage>();
    for (const message of [...initialMessages, ...collaboration.messages]) merged.set(message.id, message);
    return [...merged.values()].sort((a, b) => a.at.localeCompare(b.at));
  }, [initialMessages, collaboration.messages]);
  const connected = collaboration.connected;
  const remoteCursors: LiveCursor[] = collaboration.remoteCursors;

  /* ----------------------------------------------------- push des modifications */
  const onDocChange = useCallback(
    (next: CircuitDoc, commit: boolean) => {
      if (!commit || !code) return;
      pushedDocRef.current = JSON.stringify(next);
      void collaboration.pushDoc(next);
    },
    [code, collaboration],
  );

  /* ------------------------------------------------------------------ actions */
  async function joinRoom(target?: string) {
    const finalCode = (target ?? code).trim();
    if (!/^[1-9][0-9]{4}$/.test(finalCode)) {
      error('Code invalide', 'Le code d’atelier contient exactement 5 chiffres (sans zéro initial).');
      return;
    }
    setJoining(true);
    try {
      const response = await fetch('/api/rooms/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: finalCode }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Atelier introuvable.');
      await loadRoom(finalCode);
      router.replace(`/multiwork?code=${finalCode}`);
    } catch (e) {
      error('Code refusé', (e as Error).message);
    } finally {
      setJoining(false);
    }
  }

  async function createRoom() {
    const template = templates.find((t) => t.slug === newRoomTemplate);
    setCreating(true);
    try {
      const buildResponse = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoomName.trim() || template?.title || 'Atelier sans titre',
          doc: await templateDocToDoc(newRoomTemplate),
          projectId: newRoomProject || undefined,
        }),
      });
      const payload = await buildResponse.json();
      if (!buildResponse.ok) throw new Error(payload.error ?? 'Création impossible.');
      setDoc(null);
      setCode(payload.code);
      await loadRoom(payload.code, { silent: true });
      success('Atelier créé', `Partagez le code ${payload.code} avec vos collaborateurs.`);
      router.replace(`/multiwork?code=${payload.code}`);
    } catch (e) {
      error('Création impossible', (e as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function leaveRoom() {
    if (!code) return;
    await fetch(`/api/rooms/${code}`, { method: 'DELETE' });
    setPhase('lobby');
    setDoc(null);
    setCode('');
    router.replace('/multiwork');
    info('Atelier quitté', ownerId === user.id ? 'Vous étiez l’hôte : l’atelier est fermé si personne ne reste.' : 'Vous pouvez revenir avec le même code.');
  }

  async function sendMessage() {
    if (!chatText.trim() || !code) return;
    await collaboration.sendMessage(chatText);
    setChatText('');
  }

  async function copyInvite() {
    const link = `${window.location.origin}/multiwork?code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      success('Lien copié', 'Envoyez-le à votre binôme : il entrera directement dans l’atelier.');
    } catch {
      info('Copie manuelle', link);
    }
  }

  const isOwner = ownerId === user.id;

  /* ------------------------------------------------------------------- vues */
  if (phase === 'joined' && doc) {
    return (
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2 border-b border-line/60 bg-ink-900/70 px-3 py-1.5 text-[11px]">
          <span className="flex items-center gap-1.5 font-mono text-fg-soft">
            <Hash size={11} className="text-spark-violet" /> {code}
          </span>
          <span className="text-fg-mute">· rév. {revision}</span>
          <span
            className={cn(
              'flex items-center gap-1 rounded-full border px-2 py-0.5',
              connected
                ? 'border-spark-green/40 bg-spark-green/10 text-spark-green'
                : 'border-spark-coral/40 bg-spark-coral/10 text-spark-coral',
            )}
          >
            {connected ? <Wifi size={10} /> : <WifiOff size={10} />}
            {connected ? 'temps réel' : 'reconnexion…'}
          </span>
          <span className="flex items-center gap-1 text-fg-mute">
            <Users size={10} /> {participants.length} en ligne
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={copyInvite} className="btn btn-sm btn-ghost px-2">
              <Copy size={12} /> Inviter
            </button>
            <button
              type="button"
              onClick={() => setChatOpen((v) => !v)}
              className={cn('btn btn-sm px-2', chatOpen && 'border-spark-cyan/50 text-spark-cyan')}
            >
              <MessageSquare size={12} /> Chat
            </button>
            <button type="button" onClick={leaveRoom} className="btn btn-sm btn-ghost px-2 text-fg-mute hover:text-spark-coral">
              <LogOut size={12} /> Quitter
            </button>
          </div>
        </div>

        <div className="flex">
          <div className="min-w-0 flex-1">
            <StudioShell
              mode="room"
              initialDoc={doc}
              user={{ id: user.id, name: user.name }}
              roomCode={code}
              onDocChange={onDocChange}
              onlineCollaborators={participants.map((p) => ({ id: p.id, name: p.name, color: p.color }))}
              collaboration={{
                cursors: remoteCursors,
                participants,
                connected: collaboration.connected,
                transport: collaboration.transport,
                publishCursor: collaboration.publishCursor,
                remoteRevision: revision,
                lastAuthor: collaboration.lastAuthor,
              }}
            />
          </div>

          {chatOpen ? (
            <aside className="hidden w-[270px] shrink-0 border-l border-line/60 bg-ink-900/50 xl:flex xl:flex-col">
              <div className="border-b border-line/60 p-2.5">
                <p className="text-[11px] font-semibold">{roomName || 'Atelier'}</p>
                <p className="text-[10px] text-fg-mute">
                  hôte : {participants.find((p) => p.id === ownerId)?.name ?? '—'}
                </p>
              </div>
              <div className="space-y-1 border-b border-line/60 p-2.5">
                <p className="label-xs">Participants</p>
                {participants.length ? (
                  participants.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 rounded-lg px-1 py-1">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold"
                        style={{ background: `${p.color}22`, color: p.color, border: `1px solid ${p.color}55` }}
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11.5px] text-fg-soft">
                        {p.name}
                        {p.id === ownerId ? <span className="ml-1 text-[9px] text-spark-amber">hôte</span> : null}
                      </span>
                      <CircleDot size={9} className="text-spark-green" />
                    </div>
                  ))
                ) : (
                  <p className="text-[10.5px] text-fg-mute">Vous êtes seul pour le moment.</p>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <p className="label-xs px-2.5 pt-2.5">Chat d’atelier</p>
                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2.5">
                  {messages.length ? (
                    messages.map((m) => (
                      <div
                        key={m.id}
                        className={cn(
                          'rounded-lg border px-2 py-1.5',
                          m.authorId === user.id
                            ? 'border-spark-cyan/30 bg-spark-cyan/[0.07]'
                            : 'border-line/40 bg-ink-850/60',
                        )}
                      >
                        <p className="flex items-center justify-between text-[9px] text-fg-mute">
                          <span className="font-medium text-fg-soft">{m.authorName}</span>
                          <span>{new Date(m.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                        </p>
                        <p className="mt-0.5 text-[11px] leading-snug text-fg">{m.text}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-[10.5px] leading-relaxed text-fg-mute">
                      Aucun message. Suggérez une valeur, signalez une erreur de câblage…
                    </p>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendMessage();
                  }}
                  className="flex items-center gap-1 border-t border-line/60 p-2"
                >
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Écrire…"
                    className="field px-2 py-1.5 text-[11px]"
                    maxLength={500}
                  />
                  <button type="submit" className="btn btn-sm btn-primary px-2" aria-label="Envoyer">
                    <Send size={12} />
                  </button>
                </form>
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    );
  }

  /* ------------------------------------------------------------------- lobby */
  return (
    <div className="mx-auto max-w-[1300px] px-4 py-9 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="chip border-spark-violet/40 bg-spark-violet/[0.08] text-spark-violet">
            <Users size={12} /> Collaboration temps réel
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Multiwork</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-fg-soft">
            Deux façons de travailler à plusieurs : <span className="text-fg">créer</span> un atelier (vous posez le
            montage, vos invités le complètent) ou <span className="text-fg">rejoindre</span> un atelier existant avec
            un code à 5 chiffres.
          </p>
        </div>
        <span className="chip">
          <Radio size={11} className="text-spark-green" /> synchronisation SSE · latence &lt; 3 s
        </span>
      </header>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {/* rejoindre */}
        <section className="panel relative overflow-hidden p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-spark-cyan/10 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan">
                <KeyRound size={16} />
              </span>
              <div>
                <h2 className="text-[15px] font-semibold">Rejoindre un atelier</h2>
                <p className="text-[11px] text-fg-mute">Entrez le code à 5 chiffres de l’hôte.</p>
              </div>
            </div>

            <div className="mt-5 flex justify-between gap-1.5">
              {[0, 1, 2, 3, 4].map((index) => (
                <input
                  key={index}
                  id={`code-${index}`}
                  inputMode="numeric"
                  maxLength={1}
                  value={code[index] ?? ''}
                  onChange={(e) => {
                    const digit = e.target.value.replace(/\D/g, '').slice(-1);
                    const next = (code.slice(0, index) + digit + code.slice(index + 1)).slice(0, 5);
                    setCode(next);
                    if (digit) {
                      const nextInput = document.getElementById(`code-${index + 1}`) as HTMLInputElement | null;
                      nextInput?.focus();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Backspace' && !code[index] && index > 0) {
                      const prev = document.getElementById(`code-${index - 1}`) as HTMLInputElement | null;
                      prev?.focus();
                    }
                    if (e.key === 'Enter') void joinRoom();
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 5);
                    if (pasted) {
                      e.preventDefault();
                      setCode(pasted);
                    }
                  }}
                  className="h-16 w-full rounded-xl border border-line/70 bg-ink-950/80 text-center font-mono text-2xl text-fg outline-none transition focus:border-spark-cyan/70 focus:ring-2 focus:ring-spark-cyan/15"
                  aria-label={`Chiffre ${index + 1} du code`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => joinRoom()}
              disabled={joining || code.length !== 5}
              className="btn btn-primary mt-4 w-full"
            >
              {joining ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
              {joining ? 'Connexion…' : 'Rejoindre le montage'}
            </button>

            <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-line/40 bg-ink-950/40 p-2.5">
              <ShieldCheck size={12} className="mt-0.5 shrink-0 text-spark-green" />
              <p className="text-[10.5px] leading-relaxed text-fg-mute">
                Le code est à usage unique par atelier et expire avec la session. Vous devez être connecté : le serveur
                vérifie votre compte à chaque requête.
              </p>
            </div>
          </div>
        </section>

        {/* créer */}
        <section className="panel p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-spark-violet/40 bg-spark-violet/10 text-spark-violet">
              <Plus size={16} />
            </span>
            <div>
              <h2 className="text-[15px] font-semibold">Créer un atelier</h2>
              <p className="text-[11px] text-fg-mute">Un gabarit de départ, un code, et vous invitez.</p>
            </div>
          </div>

          <label className="mt-4 block">
            <span className="label-xs">Nom de l’atelier</span>
            <input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="TP Thévenin — binôme 4"
              className="field mt-1"
              maxLength={120}
            />
          </label>

          {projects.length ? (
            <label className="mt-3 block">
              <span className="label-xs">Projet</span>
              <select
                value={newRoomProject}
                onChange={(e) => setNewRoomProject(e.target.value)}
                className="field mt-1"
              >
                <option value="">Aucun projet (atelier libre)</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[10px] text-fg-mute">
                L’atelier apparaîtra dans le projet et partagera ses membres.
              </span>
            </label>
          ) : null}

          <div className="mt-3">
            <span className="label-xs">Montage de départ</span>
            <div className="mt-1.5 grid max-h-[184px] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
              {templates.map((template) => (
                <button
                  key={template.slug}
                  type="button"
                  onClick={() => setNewRoomTemplate(template.slug)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-1.5 text-left transition',
                    newRoomTemplate === template.slug
                      ? 'border-spark-cyan/60 bg-spark-cyan/[0.07]'
                      : 'border-line/50 bg-ink-850/50 hover:border-line',
                  )}
                >
                  <TileGlyph
                    shape={template.shape as 'circle'}
                    accent={template.accent as 'cyan'}
                    kind="vsource"
                    size={28}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[10.5px] font-medium text-fg-soft">{template.title}</span>
                    <span className="block truncate text-[9px] text-fg-mute">{template.subtitle}</span>
                  </span>
                  {newRoomTemplate === template.slug ? <Check size={11} className="text-spark-cyan" /> : null}
                </button>
              ))}
            </div>
          </div>

          <button type="button" onClick={createRoom} disabled={creating} className="btn btn-primary mt-4 w-full">
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />}
            {creating ? 'Création…' : 'Ouvrir l’atelier et générer un code'}
          </button>
          <p className="mt-2 text-center text-[10px] text-fg-mute">
            Un montage est automatiquement enregistré dans votre historique.
          </p>
        </section>
      </div>

      {/* ateliers actifs */}
      <section className="mt-7">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <p className="label-xs">Vos ateliers</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Sessions actives</h2>
          </div>
          <span className="chip">
            <Timer size={11} /> {rooms.length} session(s)
          </span>
        </div>

        {projects.length ? (
          <div className="mb-2.5 flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => setProjectFilter('all')}
              className={cn(
                'chip transition',
                projectFilter === 'all' ? 'border-spark-cyan/60 bg-spark-cyan/10 text-spark-cyan' : 'hover:border-line',
              )}
            >
              Tous les ateliers
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => setProjectFilter(project.id)}
                className={cn(
                  'chip transition',
                  projectFilter === project.id ? 'text-fg' : 'text-fg-mute hover:border-line',
                )}
                style={
                  projectFilter === project.id
                    ? { borderColor: `${project.color}99`, background: `${project.color}18` }
                    : undefined
                }
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: project.color }} />
                {project.name}
                <span className="text-fg-mute">{project.rooms.length}</span>
              </button>
            ))}
          </div>
        ) : null}

        {rooms.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {rooms
              .filter((room) => projectFilter === 'all' || room.projectId === projectFilter)
              .map((room) => (
              <article key={room.code} className="panel flex flex-col p-3.5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <h3 className="truncate text-[13px] font-medium">{room.name}</h3>
                    <p className="text-[10px] text-fg-mute">hôte {room.ownerName} · {timeAgo(room.updatedAt)}</p>
                  </div>
                  <span className="rounded-md border border-spark-violet/40 bg-spark-violet/10 px-2 py-1 font-mono text-[11px] tracking-wider text-spark-violet">
                    {room.code}
                  </span>
                </div>
                <div className="mt-2.5 flex items-center gap-1">
                  {room.participants.slice(0, 6).map((p) => (
                    <span
                      key={p.id}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold"
                      style={{ background: `${p.color}22`, color: p.color, border: `1px solid ${p.color}55` }}
                      title={p.name}
                    >
                      {p.name.slice(0, 2).toUpperCase()}
                    </span>
                  ))}
                  <span className="ml-1 text-[10px] text-fg-mute">{room.participants.length} en ligne</span>
                </div>
                <div className="mt-2.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCode(room.code);
                      void joinRoom(room.code);
                    }}
                    className="btn btn-sm flex-1 border-spark-cyan/40 text-spark-cyan"
                  >
                    <DoorOpen size={12} /> Reprendre
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}/multiwork?code=${room.code}`);
                      success('Lien copié');
                    }}
                    className="btn btn-sm px-2"
                    aria-label="Copier le lien"
                  >
                    <Copy size={12} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel flex flex-col items-center gap-2 p-9 text-center">
            <Radio size={20} className="text-fg-mute" />
            <p className="text-sm font-medium">Aucune session active</p>
            <p className="max-w-sm text-[12px] text-fg-mute">
              Créez votre premier atelier ci-dessus : vous obtenez un code à 5 chiffres à partager.
            </p>
          </div>
        )}
      </section>

      <section className="mt-6 grid gap-2.5 sm:grid-cols-3">
        {[
          { icon: Users, title: 'Mode multi-création', body: 'L’hôte pose la structure, les invités ajoutent des dipôles et complètent les valeurs.' },
          { icon: MessageSquare, title: 'Chat intégré', body: 'Échangez sur le câblage sans quitter le montage ; les messages sont synchronisés.' },
          { icon: Sparkles, title: 'Agents partagés', body: 'Le hub IA analyse le montage commun et propose la même correction à tous.' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="panel-soft p-3.5">
              <Icon size={15} className="text-spark-cyan" />
              <h3 className="mt-1.5 text-[12.5px] font-medium">{item.title}</h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-fg-mute">{item.body}</p>
            </div>
          );
        })}
      </section>

      <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-fg-mute">
        Besoin d’un montage prêt ?{' '}
        <Link href="/bibliotheque" className="text-spark-cyan hover:underline">
          parcourir la bibliothèque
        </Link>
      </p>
    </div>
  );
}

async function templateDocToDoc(slug: string): Promise<CircuitDoc> {
  const response = await fetch('/api/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fromTemplate: slug }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.doc) {
    throw new Error(payload.error ?? 'Gabarit introuvable.');
  }
  return payload.doc as CircuitDoc;
}

