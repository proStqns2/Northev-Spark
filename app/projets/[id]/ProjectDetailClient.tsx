'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Archive,
  Check,
  CircuitBoard,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { TileGlyph } from '@/components/marketing/TileGlyph';
import { useToast } from '@/components/ui/Toast';
import { cn, timeAgo } from '@/lib/utils';

interface CircuitItem {
  id: string;
  name: string;
  notes: string;
  updatedAt: string;
  starred: boolean;
  status: string;
  collaborators: number;
  components: number;
}

interface TemplateItem {
  slug: string;
  title: string;
  subtitle: string;
  accent: string;
  regime: 'dc' | 'ac';
}

interface Props {
  viewer: { id: string; name: string };
  project: {
    id: string;
    name: string;
    description: string;
    color: string;
    archived: boolean;
    ownerId: string;
    isOwner: boolean;
    members: Array<{ id: string; name: string; color: string; role: string }>;
    rooms: Array<{ code: string; name: string; participants: number }>;
    createdAt: string;
    updatedAt: string;
  };
  circuits: CircuitItem[];
  templates: TemplateItem[];
}

export function ProjectDetailClient({ viewer, project, circuits, templates }: Props) {
  const router = useRouter();
  const { success, error, info } = useToast();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [picking, setPicking] = useState(false);
  const [invite, setInvite] = useState('');
  const [inviting, setInviting] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [starred, setStarred] = useState<Record<string, boolean>>(
    Object.fromEntries(circuits.map((c) => [c.id, c.starred])),
  );

  const sorted = useMemo(
    () => [...circuits].sort((a, b) => Number(starred[b.id] ?? b.starred) - Number(starred[a.id] ?? a.starred)),
    [circuits, starred],
  );

  async function patchProject(body: Record<string, unknown>, message: string) {
    setBusy(message);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Modification refusée.');
      success(message);
      router.refresh();
      return true;
    } catch (e) {
      error('Action impossible', (e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer « ${project.name} » ? Les montages restent dans votre bibliothèque.`)) return;
    setBusy('suppression');
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Suppression refusée.');
      success('Projet supprimé', 'Les montages ont été conservés.');
      router.push('/projets');
      router.refresh();
    } catch (e) {
      error('Suppression impossible', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function addMember() {
    if (!invite.trim()) return;
    setInviting(true);
    try {
      const response = await fetch(`/api/projects/${project.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invite.trim(), role: 'editor' }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Invitation refusée.');
      success('Membre ajouté', `${invite.trim()} peut éditer les montages du projet.`);
      setInvite('');
      router.refresh();
    } catch (e) {
      error('Invitation impossible', (e as Error).message);
    } finally {
      setInviting(false);
    }
  }

  async function toggleStar(id: string) {
    const next = !(starred[id] ?? false);
    setStarred((prev) => ({ ...prev, [id]: next }));
    try {
      const response = await fetch(`/api/circuits/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starred: next }),
      });
      if (!response.ok) throw new Error('Étoile refusée.');
      info(next ? 'Montage épinglé' : 'Épingle retirée');
    } catch (e) {
      setStarred((prev) => ({ ...prev, [id]: !next }));
      error('Action impossible', (e as Error).message);
    }
  }

  async function removeCircuit(circuit: CircuitItem) {
    if (!window.confirm(`Supprimer le montage « ${circuit.name} » ?`)) return;
    setBusy(circuit.id);
    try {
      const response = await fetch(`/api/circuits/${circuit.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Suppression refusée.');
      success('Montage supprimé', circuit.name);
      router.refresh();
    } catch (e) {
      error('Suppression impossible', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1450px] px-4 py-8 sm:px-6">
      <Link href="/projets" className="inline-flex items-center gap-1.5 text-[12px] text-fg-mute transition hover:text-fg">
        <ArrowLeft size={13} /> Tous les projets
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="chip"
              style={{ borderColor: `${project.color}66`, background: `${project.color}18`, color: project.color }}
            >
              <FolderOpen size={12} /> Projet
            </span>
            {project.archived ? <span className="chip border-spark-amber/40 bg-spark-amber/10 text-spark-amber">archivé</span> : null}
            {project.isOwner ? <span className="chip">propriétaire</span> : <span className="chip">membre</span>}
          </div>

          {editing ? (
            <div className="mt-3 max-w-xl space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                placeholder="Nom du projet"
               className="w-full rounded-xl border border-line/60 bg-ink-900/70 px-3 py-2 text-[15px] outline-none focus:border-spark-cyan/60"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={400}
                rows={2}
                placeholder="Objectif pédagogique du projet…"
                className="w-full resize-none rounded-xl border border-line/60 bg-ink-900/70 px-3 py-2 text-[12.5px] outline-none focus:border-spark-cyan/60"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await patchProject({ name: name.trim(), description }, 'Projet mis à jour');
                    if (ok) setEditing(false);
                  }}
                  disabled={!name.trim() || busy !== null}
                  className="btn btn-primary btn-sm"
                >
                  {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setName(project.name);
                    setDescription(project.description);
                    setEditing(false);
                  }}
                  className="btn btn-ghost btn-sm"
                >
                  <X size={12} /> Annuler
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{project.name}</h1>
              <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-fg-soft">
                {project.description || 'Aucune description — ajoutez un objectif pédagogique.'}
              </p>
              <p className="mt-2 text-[11px] text-fg-mute">
                créé {timeAgo(project.createdAt)} · dernière activité {timeAgo(project.updatedAt)} ·{' '}
                {circuits.length} montage{circuits.length > 1 ? 's' : ''} · {project.members.length} membre
                {project.members.length > 1 ? 's' : ''}
              </p>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPicking((v) => !v)} className="btn btn-primary btn-sm">
            <Plus size={13} /> Nouveau montage
          </button>
          <button type="button" onClick={() => setEditing(true)} className="btn btn-sm border-line/60" disabled={editing}>
            <Pencil size={13} /> Modifier
          </button>
          <button
            type="button"
            onClick={() => patchProject({ archived: !project.archived }, project.archived ? 'Projet réactivé' : 'Projet archivé')}
            className="btn btn-sm border-line/60"
          >
            <Archive size={13} /> {project.archived ? 'Réactiver' : 'Archiver'}
          </button>
          {project.isOwner ? (
            <button type="button" onClick={remove} className="btn btn-sm border-spark-red/40 text-spark-red" disabled={busy !== null}>
              <Trash2 size={13} /> Supprimer
            </button>
          ) : null}
        </div>
      </header>

      {picking ? (
        <section className="panel mt-6 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold">Choisir un montage de départ</p>
            <button type="button" onClick={() => setPicking(false)} className="btn btn-ghost btn-sm">
              <X size={12} /> Fermer
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <Link
                key={template.slug}
                href={`/studio?template=${template.slug}&project=${project.id}`}
                className="group flex items-center gap-3 rounded-xl border border-line/60 bg-ink-900/60 px-3 py-2.5 transition hover:border-spark-cyan/50 hover:bg-ink-800/70"
              >
                <TileGlyph shape="hex" accent={template.accent as 'cyan' | 'violet' | 'amber' | 'green'} kind="resistor" size={26} muted />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{template.title}</span>
                  <span className="block truncate text-[10.5px] text-fg-mute">{template.subtitle}</span>
                </span>
                <ArrowRight size={13} className="shrink-0 text-fg-mute transition group-hover:translate-x-0.5 group-hover:text-spark-cyan" />
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-[13.5px] font-semibold">
              <CircuitBoard size={14} className="text-spark-cyan" /> Montages du projet
            </h2>
            <Link href={`/multiwork${project.rooms[0] ? `?code=${project.rooms[0].code}` : ''}`} className="text-[11.5px] text-spark-violet hover:underline">
              Atelier multiwork
            </Link>
          </div>

          {sorted.length === 0 ? (
            <div className="panel mt-3 flex flex-col items-start gap-2 p-5">
              <Sparkles size={16} className="text-spark-amber" />
              <p className="text-[13px] font-medium">Ce projet est vide</p>
              <p className="text-[11.5px] text-fg-soft">
                Choisissez un montage de départ : il sera calculé immédiatement puis rangé ici.
              </p>
              <button type="button" onClick={() => setPicking(true)} className="btn btn-primary btn-sm mt-1">
                <Plus size={12} /> Construire un montage
              </button>
            </div>
          ) : (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {sorted.map((circuit) => (
                <li key={circuit.id} className="panel flex flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/studio?circuit=${circuit.id}`} className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium transition hover:text-spark-cyan">{circuit.name}</p>
                      <p className="mt-0.5 text-[10.5px] text-fg-mute">
                        {circuit.components} dipôle{circuit.components > 1 ? 's' : ''} · modifié {timeAgo(circuit.updatedAt)}
                        {circuit.collaborators ? ` · ${circuit.collaborators} collaborateur(s)` : ''}
                      </p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleStar(circuit.id)}
                      aria-label={starred[circuit.id] ? 'Retirer l’épingle' : 'Épingler'}
                      className={cn('rounded-md p-1 transition', starred[circuit.id] ? 'text-spark-amber' : 'text-fg-mute hover:text-fg')}
                    >
                      <Star size={13} fill={starred[circuit.id] ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                  <div className="mt-auto flex items-center gap-2">
                    <Link href={`/studio?circuit=${circuit.id}`} className="btn btn-ghost btn-sm">
                      Ouvrir <ArrowRight size={11} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeCircuit(circuit)}
                      disabled={busy === circuit.id}
                      className="btn btn-ghost btn-sm ml-auto text-fg-mute hover:text-spark-red"
                    >
                      {busy === circuit.id ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-3">
          <div className="panel p-4">
            <h2 className="flex items-center gap-2 text-[13px] font-semibold">
              <Users size={13} className="text-spark-violet" /> Membres
            </h2>
            <ul className="mt-2.5 space-y-1.5">
              {project.members.map((member) => (
                <li key={member.id} className="flex items-center gap-2 text-[12px]">
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-ink-950"
                    style={{ background: member.color }}
                  >
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {member.name}
                    {member.id === viewer.id ? ' (vous)' : ''}
                  </span>
                  <span className="chip text-[9px]">{member.role}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-1.5">
              <input
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                type="email"
                placeholder="email@exemple.fr"
                className="min-w-0 flex-1 rounded-lg border border-line/60 bg-ink-900/70 px-2 py-1.5 text-[11.5px] outline-none focus:border-spark-violet/60"
              />
              <button
                type="button"
                onClick={addMember}
                disabled={inviting || !invite.trim()}
                className="btn btn-sm border-line/60"
                title="Ajouter un membre"
              >
                {inviting ? <Loader2 size={12} className="animate-spin" /> : <UserPlus size={12} />}
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-fg-mute">
              Le membre doit déjà avoir un compte Northev Spark avec cet e-mail.
            </p>
          </div>

          <div className="panel p-4">
            <h2 className="text-[13px] font-semibold">Ateliers du projet</h2>
            {project.rooms.length === 0 ? (
              <p className="mt-2 text-[11.5px] text-fg-soft">
                Aucun atelier ouvert. Lancez-en un pour travailler à plusieurs sur les montages.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {project.rooms.map((room) => (
                  <li key={room.code}>
                    <Link
                      href={`/multiwork?code=${room.code}`}
                      className="flex items-center justify-between rounded-lg border border-line/50 px-2.5 py-1.5 text-[11.5px] transition hover:border-spark-cyan/50"
                    >
                      <span className="truncate">{room.name}</span>
                      <span className="chip text-[9px]">{room.participants} en ligne</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/multiwork" className="btn btn-ghost btn-sm mt-2 w-full justify-center">
              Ouvrir les ateliers
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
