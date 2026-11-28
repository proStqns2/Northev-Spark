'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircuitBoard,
  Clock,
  Copy,
  Crown,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  Rocket,
  Search,
  Settings2,
  Share2,
  Star,
  Trash2,
  UserPlus,
  Users,
  Zap,
} from 'lucide-react';
import { formatSI } from '@/lib/engine/format';
import { CircuitThumbnail } from '@/components/studio/CircuitCanvas';
import type { CircuitDoc } from '@/lib/engine/types';
import { cn, timeAgo } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

interface Member {
  id: string;
  name: string;
  color: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  ownerId: string;
  members: Member[];
  createdAt: string;
  lastActivity: string;
  openRooms: number;
  rooms: Array<{ code: string; name: string; participants: number }>;
  isOwner: boolean;
}

interface CircuitItem {
  id: string;
  name: string;
  notes: string;
  updatedAt: string;
  starred: boolean;
  status: string;
  collaborators: number;
  components: number;
  doc: Record<string, unknown>;
  expected: { vth: number; rth: number; inorton: number } | null;
}

const TABS = [
  { id: 'montages', label: 'Montages', icon: CircuitBoard },
  { id: 'membres', label: 'Membres', icon: Users },
  { id: 'ateliers', label: 'Ateliers', icon: Rocket },
  { id: 'parametres', label: 'Paramètres', icon: Settings2 },
] as const;

export function ProjetDetail({
  project,
  viewer,
  circuits,
}: {
  project: Project;
  viewer: { id: string; name: string };
  circuits: CircuitItem[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('montages');
  const [items, setItems] = useState(circuits);
  const [members, setMembers] = useState(project.members);
  const [query, setQuery] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [starting, setStarting] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [available, setAvailable] = useState<Array<{ id: string; name: string; components: number }> | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const router = useRouter();
  const { success, error } = useToast();

  const filtered = useMemo(
    () =>
      items.filter(
        (c) => !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.notes.toLowerCase().includes(query.toLowerCase()),
      ),
    [items, query],
  );

  const stats = useMemo(
    () => ({
      montages: items.length,
      composants: items.reduce((sum, c) => sum + c.components, 0),
      membres: members.length,
      ateliers: project.openRooms,
    }),
    [items, members, project.openRooms],
  );

  async function openAttach() {
    setAttaching(true);
    setPicked([]);
    setAvailable(null);
    try {
      const response = await fetch('/api/circuits');
      const payload = await response.json();
      const inProject = new Set(items.map((c) => c.id));
      setAvailable(
        (payload.circuits ?? [])
          .filter((c: { id: string }) => !inProject.has(c.id))
          .map((c: { id: string; name: string; doc?: { components?: unknown[] } }) => ({
            id: c.id,
            name: c.name,
            components: c.doc?.components?.length ?? 0,
          })),
      );
    } catch {
      setAvailable([]);
    }
  }

  async function attachSelected() {
    if (!picked.length) return;
    try {
      const response = await fetch(`/api/projects/${project.id}/circuits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circuitIds: picked }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Rattachement impossible.');
      success(`${payload.moved} montage(s) ajouté(s) au projet`);
      setAttaching(false);
      router.refresh();
    } catch (e) {
      error('Échec', (e as Error).message);
    }
  }

  async function inviteMember() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Invitation refusée.');
      success('Membre ajouté', `${payload.member.name} peut désormais accéder au projet.`);
      setMembers((current) => [
        ...current,
        { id: payload.member.id, name: payload.member.name, color: '#38e1e6', role: 'editor' },
      ]);
      setInviteEmail('');
    } catch (e) {
      error('Invitation impossible', (e as Error).message);
    } finally {
      setInviting(false);
    }
  }

  async function startWorkshop(circuit?: CircuitItem) {
    setStarting(true);
    try {
      let doc: Record<string, unknown> | null = null;
      if (circuit) {
        const response = await fetch(`/api/circuits/${circuit.id}`);
        if (response.ok) {
          const payload = await response.json();
          doc = payload.circuit.doc;
        }
      }
      if (!doc && items.length) {
        const response = await fetch(`/api/circuits/${items[0].id}`);
        if (response.ok) {
          const payload = await response.json();
          doc = payload.circuit.doc;
        }
      }
      if (!doc) {
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromTemplate: 'thevenin-serie' }),
        });
        const payload = await response.json();
        doc = payload.doc;
      }
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${project.name} — ${circuit?.name ?? 'atelier'}`,
          circuitId: circuit?.id,
          projectId: project.id,
          doc,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Création impossible.');
      setRoomCode(payload.code);
      success('Atelier ouvert', `Code ${payload.code} — partagez-le avec votre équipe.`);
      router.refresh();
    } catch (e) {
      error('Atelier impossible', (e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      if (!response.ok) throw new Error('Modification refusée.');
      success('Projet mis à jour');
      router.refresh();
    } catch (e) {
      error('Échec', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1450px] px-4 py-7 sm:px-6">
      <Link href="/projets" className="inline-flex items-center gap-1.5 text-[11.5px] text-fg-mute transition hover:text-fg">
        <ArrowLeft size={12} /> Tous les projets
      </Link>

      {/* ------------------------------------------------------------- en-tête */}
      <header
        className="mt-3 overflow-hidden rounded-2xl border border-line/70"
        style={{ background: `linear-gradient(120deg, ${project.color}1a, transparent 60%)` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{project.name}</h1>
              {project.isOwner ? (
                <span className="chip border-spark-amber/40 bg-spark-amber/10 text-spark-amber">
                  <Crown size={10} /> propriétaire
                </span>
              ) : (
                <span className="chip">membre</span>
              )}
            </div>
            <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-fg-soft">
              {project.description || 'Aucune description pour ce projet.'}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="chip">
                <CircuitBoard size={10} /> {stats.montages} montage{stats.montages > 1 ? 's' : ''}
              </span>
              <span className="chip">
                <Zap size={10} /> {stats.composants} dipôles
              </span>
              <span className="chip">
                <Users size={10} /> {stats.membres} membre{stats.membres > 1 ? 's' : ''}
              </span>
              <span className="chip">
                <Clock size={10} /> actif {timeAgo(project.lastActivity)}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => startWorkshop()}
                disabled={starting}
                className="btn btn-sm border-spark-violet/40 bg-spark-violet/10 text-spark-violet"
              >
                {starting ? <Loader2 size={13} className="animate-spin" /> : <Rocket size={13} />}
                Ouvrir un atelier
              </button>
              <Link
                href={`/multiwork`}
                className="btn btn-sm"
              >
                <Users size={13} /> Multiwork
              </Link>
            </div>
            <div className="flex items-center">
              {members.slice(0, 6).map((member, index) => (
                <span
                  key={member.id}
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-ink-900 text-[9px] font-bold"
                  style={{ background: member.color, color: '#04121a', marginLeft: index ? -8 : 0 }}
                  title={`${member.name} · ${member.role}`}
                >
                  {member.name.slice(0, 2).toUpperCase()}
                </span>
              ))}
            </div>
          </div>
        </div>

        {roomCode ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line/60 bg-spark-violet/[0.08] px-5 py-2.5">
            <span className="text-[11px] text-spark-violet">Atelier actif — code</span>
            <span className="font-mono text-lg tracking-[0.18em] text-spark-violet">{roomCode}</span>
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}/multiwork?code=${roomCode}`);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
              className="btn btn-sm"
            >
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copié' : 'Copier le lien'}
            </button>
            <Link href={`/multiwork?code=${roomCode}`} className="btn btn-sm btn-primary">
              Rejoindre <ArrowRight size={12} />
            </Link>
          </div>
        ) : null}
      </header>

      {/* --------------------------------------------------------------- onglets */}
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

      {/* -------------------------------------------------------------- montages */}
      {tab === 'montages' ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-lg border border-line/60 bg-ink-900/70 px-2.5 py-2">
              <Search size={13} className="text-fg-mute" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Rechercher dans le projet…"
                className="w-full bg-transparent text-[12.5px] outline-none"
              />
            </label>
            <button type="button" onClick={openAttach} className="btn btn-sm">
              <Plus size={12} /> Rattacher un montage
            </button>
            <Link href={`/export?circuit=${items[0]?.id ?? ''}`} className="btn btn-sm">
              <Download size={12} /> Exporter
            </Link>
          </div>

          {filtered.length ? (
            <div className="mt-3 overflow-hidden rounded-xl border border-line/60">
              <table className="w-full text-left text-[11.5px]">
                <thead className="bg-ink-850/80 text-[10px] uppercase tracking-wider text-fg-mute">
                  <tr>
                    <th className="px-3 py-2 font-medium">Montage</th>
                    <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">U_th</th>
                    <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Z_th</th>
                    <th className="hidden px-3 py-2 text-right font-medium lg:table-cell">I_N</th>
                    <th className="px-3 py-2 text-right font-medium">Activité</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/40">
                  {filtered.map((circuit) => (
                    <tr key={circuit.id} className="bg-ink-900/50 transition hover:bg-ink-850/70">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="hidden h-10 w-16 shrink-0 overflow-hidden rounded-md border border-line/50 bg-ink-950/70 sm:block">
                            <CircuitThumbnail doc={circuit.doc as unknown as CircuitDoc} />
                          </span>
                          {circuit.starred ? <Star size={11} className="shrink-0 fill-spark-amber text-spark-amber" /> : null}
                          <div className="min-w-0">
                            <Link href={`/studio?circuit=${circuit.id}`} className="block truncate font-medium hover:text-spark-cyan">
                              {circuit.name}
                            </Link>
                            <p className="truncate text-[10px] text-fg-mute">
                              {circuit.components} dipôles
                              {circuit.notes ? ` · ${circuit.notes}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono text-spark-cyan sm:table-cell">
                        {circuit.expected ? formatSI(circuit.expected.vth, 'V', { digits: 3 }) : '—'}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono text-spark-violet md:table-cell">
                        {circuit.expected ? formatSI(circuit.expected.rth, 'Ω', { digits: 3 }) : '—'}
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono text-spark-amber lg:table-cell">
                        {circuit.expected && Number.isFinite(circuit.expected.inorton)
                          ? formatSI(circuit.expected.inorton, 'A', { digits: 3 })
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-[10.5px] text-fg-mute">{timeAgo(circuit.updatedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => startWorkshop(circuit)}
                            className="btn btn-sm px-2"
                            title="Ouvrir un atelier sur ce montage"
                          >
                            <Rocket size={11} />
                          </button>
                          <Link href={`/studio?circuit=${circuit.id}`} className="btn btn-sm px-2" title="Ouvrir dans le studio">
                            <ExternalLink size={11} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="panel mt-3 flex flex-col items-center gap-2 p-9 text-center">
              <CircuitBoard size={20} className="text-fg-mute" />
              <p className="text-[13px] font-medium">Ce projet ne contient encore aucun montage.</p>
              <p className="max-w-sm text-[11.5px] text-fg-mute">
                Créez un montage depuis la bibliothèque puis rattachez-le au projet, ou démarrez un atelier multiwork.
              </p>
              <Link href="/bibliotheque" className="btn btn-sm mt-1">
                Parcourir les gabarits <ArrowRight size={12} />
              </Link>
            </div>
          )}
        </div>
      ) : null}

      {attaching ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
            onClick={() => setAttaching(false)}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-line/70 bg-ink-900 shadow-panel">
            <div className="border-b border-line/60 px-4 py-3">
              <p className="text-[14px] font-semibold">Rattacher des montages</p>
              <p className="text-[11px] text-fg-mute">
                Sélectionnez des montages de votre historique pour les déplacer dans « {project.name} ».
              </p>
            </div>
            <div className="max-h-[52vh] overflow-y-auto p-2">
              {available === null ? (
                <p className="flex items-center justify-center gap-2 py-6 text-[11.5px] text-fg-mute">
                  <Loader2 size={13} className="animate-spin" /> Chargement de l’historique…
                </p>
              ) : available.length ? (
                <ul className="space-y-1">
                  {available.map((item) => {
                    const active = picked.includes(item.id);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setPicked((current) =>
                              active ? current.filter((id) => id !== item.id) : [...current, item.id],
                            )
                          }
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition',
                            active ? 'border-spark-cyan/60 bg-spark-cyan/[0.08]' : 'border-line/40 hover:border-line',
                          )}
                        >
                          <span
                            className={cn(
                              'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                              active ? 'border-spark-cyan bg-spark-cyan text-ink-950' : 'border-line/70',
                            )}
                          >
                            {active ? <Check size={10} /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[11.5px] font-medium">{item.name}</span>
                            <span className="block text-[9.5px] text-fg-mute">{item.components} dipôles</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="py-6 text-center text-[11.5px] text-fg-mute">
                  Tous vos montages sont déjà rattachés à ce projet.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-line/60 px-4 py-3">
              <span className="text-[10.5px] text-fg-mute">{picked.length} sélectionné(s)</span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setAttaching(false)} className="btn btn-sm">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={attachSelected}
                  disabled={!picked.length}
                  className="btn btn-primary btn-sm"
                >
                  <Check size={12} /> Rattacher
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------------------------------------------------------------- membres */}
      {tab === 'membres' ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className="panel overflow-hidden">
            <div className="border-b border-line/60 px-3 py-2 text-[11px] font-semibold">Membres du projet</div>
            <ul className="divide-y divide-line/40">
              {members.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold"
                    style={{ background: member.color, color: '#04121a' }}
                  >
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium">
                      {member.name}
                      {member.id === viewer.id ? <span className="ml-1 text-[10px] text-fg-mute">(vous)</span> : null}
                    </p>
                    <p className="text-[10px] text-fg-mute">
                      {member.role === 'owner' ? 'propriétaire' : member.role === 'editor' ? 'éditeur' : 'lecteur'}
                    </p>
                  </div>
                  {member.role === 'owner' ? <Crown size={12} className="text-spark-amber" /> : null}
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              <UserPlus size={13} className="text-spark-cyan" /> Inviter par e-mail
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">
              La personne doit déjà posséder un compte Northev Spark. Elle accède ensuite à tous les ateliers du projet.
            </p>
            <input
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="collegue@exemple.fr"
              className="field mt-2.5"
              type="email"
            />
            <button
              type="button"
              onClick={inviteMember}
              disabled={inviting || !inviteEmail.trim()}
              className="btn btn-primary btn-sm mt-2 w-full"
            >
              {inviting ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />} Inviter
            </button>
            <div className="mt-3 rounded-lg border border-line/40 bg-ink-950/50 p-2.5">
              <p className="text-[10px] leading-relaxed text-fg-mute">
                Astuce : partagez aussi le code d’atelier à 5 chiffres. Les curseurs des membres apparaissent en direct
                sur la grille pendant la session.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* --------------------------------------------------------------- ateliers */}
      {tab === 'ateliers' ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="panel p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              <Rocket size={13} className="text-spark-violet" /> Lancer un atelier
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-fg-mute">
              Un code à 5 chiffres est généré : vos collaborateurs le saisissent dans Multiwork pour vous rejoindre, avec
              curseurs et chat partagés.
            </p>
            <button
              type="button"
              onClick={() => startWorkshop()}
              disabled={starting}
              className="btn btn-primary btn-sm mt-3 w-full"
            >
              {starting ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />} Ouvrir l’atelier
            </button>
          </div>
          <div className="panel p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              <Share2 size={13} className="text-spark-cyan" /> Invitation visuelle
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-fg-mute">
              Générez une carte PNG du montage avec le code d’atelier : idéal pour un groupe de classe.
            </p>
            <Link href={`/export${items[0] ? `?circuit=${items[0].id}` : ''}`} className="btn btn-sm mt-3 w-full">
              <Download size={12} /> Préparer l’invitation
            </Link>
          </div>
          <div className="panel col-span-full p-4">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-semibold">Ateliers ouverts</p>
              <span className="chip">{project.openRooms} actif(s)</span>
            </div>
            <p className="mt-1 text-[11px] text-fg-mute">
              Retrouvez la liste complète et l’historique des sessions dans le hub Multiwork.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {project.rooms.length ? (
                project.rooms.map((room) => (
                  <Link key={room.code} href={`/multiwork?code=${room.code}`} className="chip hover:border-spark-cyan/60">
                    <span className="h-1 w-1 rounded-full bg-spark-green" />
                    <span className="font-mono tracking-wider">{room.code}</span>
                    <span className="text-fg-mute">{room.participants} en ligne</span>
                  </Link>
                ))
              ) : (
                <span className="text-[10.5px] text-fg-mute">Aucun atelier ouvert pour ce projet.</span>
              )}
              <Link href="/multiwork" className="btn btn-sm ml-auto">
                Ouvrir le hub <ArrowRight size={12} />
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      {/* ------------------------------------------------------------- paramètres */}
      {tab === 'parametres' ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_320px]">
          <div className="panel p-4">
            <p className="text-[12px] font-semibold">Informations</p>
            <label className="mt-2.5 block">
              <span className="label-xs">Nom</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="field mt-1" maxLength={120} />
            </label>
            <label className="mt-2 block">
              <span className="label-xs">Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="field mt-1 min-h-[80px] resize-y"
                maxLength={400}
              />
            </label>
            <button type="button" onClick={saveSettings} disabled={saving} className="btn btn-primary btn-sm mt-3">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Enregistrer
            </button>
          </div>
          <div className="space-y-3">
            <div className="panel p-4">
              <p className="text-[12px] font-semibold">Danger</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">
                Supprimer le projet détache les montages (ils restent dans votre historique personnel).
              </p>
              <button
                type="button"
                disabled={!project.isOwner}
                onClick={async () => {
                  if (!window.confirm(`Supprimer « ${project.name} » ?`)) return;
                  const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
                  if (response.ok) {
                    success('Projet supprimé');
                    router.push('/projets');
                  } else {
                    error('Suppression impossible');
                  }
                }}
                className="btn btn-sm mt-2 w-full border-spark-coral/40 text-spark-coral disabled:opacity-40"
              >
                <Trash2 size={12} /> Supprimer le projet
              </button>
            </div>
            <div className="panel p-4">
              <p className="text-[12px] font-semibold">Identifiants</p>
              <dl className="mt-2 space-y-1 font-mono text-[10px]">
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-mute">projet</dt>
                  <dd className="truncate text-fg-soft">{project.id}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-mute">créé</dt>
                  <dd className="text-fg-soft">{new Date(project.createdAt).toLocaleDateString('fr-FR')}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-fg-mute">membres</dt>
                  <dd className="text-fg-soft">{members.length}</dd>
                </div>
              </dl>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
