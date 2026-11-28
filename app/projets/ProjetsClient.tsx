'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Boxes,
  ChevronRight,
  CircuitBoard,
  FolderPlus,
  Layers,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { TileGlyph } from '@/components/marketing/TileGlyph';
import { cn, timeAgo } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

interface ProjectItem {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  ownerId: string;
  members: Array<{ id: string; name: string; color: string; role: string }>;
  circuits: number;
  openRooms: number;
  lastActivity: string;
  createdAt: string;
  isOwner: boolean;
  memberCount: number;
}

interface TemplateItem {
  slug: string;
  title: string;
  subtitle: string;
  accent: string;
  regime: 'dc' | 'ac';
  difficulty: string;
}

const COLORS = ['#38e1e6', '#a479ff', '#ffc266', '#46e6a0', '#ff7d6b', '#4f9dff', '#ff79c6'];
const ICONS = ['circuit', 'bolt', 'experiment', 'wave', 'chip', 'magnet'];

export function ProjetsClient({
  user,
  projects: initialProjects,
  templates,
}: {
  user: { id: string; name: string };
  projects: ProjectItem[];
  templates: TemplateItem[];
}) {
  const [projects, setProjects] = useState(initialProjects);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);
  const [starters, setStarters] = useState<string[]>(['thevenin-serie']);
  const router = useRouter();
  const { success, error } = useToast();

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          !query ||
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.description.toLowerCase().includes(query.toLowerCase()),
      ),
    [projects, query],
  );

  async function createProject() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          color,
          icon,
          starterCircuits: starters,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Création impossible.');
      success('Projet créé', `${starters.length} montage(s) de départ inclus.`);
      router.push(`/projets/${payload.project.id}`);
      router.refresh();
    } catch (e) {
      error('Création impossible', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1450px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="chip border-spark-violet/40 bg-spark-violet/[0.08] text-spark-violet">
            <Boxes size={12} /> Espace de travail
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Mes projets</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-fg-soft">
            Un projet regroupe plusieurs montages, ses ateliers multiwork et ses membres. Chaque projet a sa propre
            page : historique des versions, curseurs partagés, invitations et export groupé.
          </p>
        </div>
        <div className="flex gap-2">
          <label className="flex min-w-[190px] items-center gap-2 rounded-xl border border-line/60 bg-ink-900/70 px-3 py-2">
            <Search size={14} className="text-fg-mute" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer…"
              className="w-full bg-transparent text-[12.5px] outline-none"
            />
          </label>
          <button type="button" onClick={() => setCreating(true)} className="btn btn-primary">
            <FolderPlus size={15} /> Nouveau projet
          </button>
        </div>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((project) => (
          <Link
            key={project.id}
            href={`/projets/${project.id}`}
            className="panel card-hover group relative flex flex-col overflow-hidden p-0"
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ background: `linear-gradient(90deg, ${project.color}1f, transparent)` }}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-lg border"
                  style={{ borderColor: `${project.color}66`, background: `${project.color}18` }}
                >
                  <TileGlyph shape="hex" accent="cyan" kind="resistor" size={22} muted />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-semibold">{project.name}</p>
                  <p className="text-[10px] text-fg-mute">
                    {project.isOwner ? 'vous êtes propriétaire' : 'membre'} · {timeAgo(project.lastActivity)}
                  </p>
                </div>
              </div>
              <ChevronRight size={15} className="shrink-0 text-fg-mute transition group-hover:translate-x-0.5 group-hover:text-fg" />
            </div>

            <p className="line-clamp-2 min-h-[38px] px-4 text-[11.5px] leading-relaxed text-fg-soft">
              {project.description || 'Aucune description — ajoutez un objectif pédagogique.'}
            </p>

            <div className="mt-auto flex items-center gap-2 border-t border-line/50 px-4 py-2.5">
              <span className="chip">
                <CircuitBoard size={10} /> {project.circuits} montage{project.circuits > 1 ? 's' : ''}
              </span>
              {project.openRooms ? (
                <span className="chip border-spark-green/40 bg-spark-green/10 text-spark-green">
                  <span className="h-1 w-1 rounded-full bg-spark-green" /> {project.openRooms} atelier
                  {project.openRooms > 1 ? 's' : ''}
                </span>
              ) : null}
              <div className="ml-auto flex items-center">
                {project.members.slice(0, 4).map((member, index) => (
                  <span
                    key={member.id}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-ink-900 text-[8px] font-bold"
                    style={{
                      background: member.color,
                      color: '#04121a',
                      marginLeft: index ? -6 : 0,
                    }}
                    title={member.name}
                  >
                    {member.name.slice(0, 2).toUpperCase()}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}

        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex min-h-[172px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line/70 bg-ink-900/40 p-5 text-fg-mute transition hover:border-spark-cyan/50 hover:text-fg"
        >
          <Plus size={20} />
          <span className="text-[12.5px] font-medium">Créer un projet</span>
          <span className="max-w-[190px] text-center text-[10.5px] leading-relaxed">
            Un gabarit, des membres, plusieurs montages
          </span>
        </button>
      </div>

      {!filtered.length ? (
        <div className="panel mt-4 flex flex-col items-center gap-2 p-10 text-center">
          <Layers size={22} className="text-fg-mute" />
          <p className="text-sm font-medium">Aucun projet pour le moment.</p>
          <p className="max-w-sm text-[12px] text-fg-mute">
            Un projet peut contenir autant de montages que nécessaire, et se partager avec des collaborateurs.
          </p>
        </div>
      ) : null}

      {/* ------------------------------------------------------- modale création */}
      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm"
            onClick={() => setCreating(false)}
          />
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line/70 bg-ink-900 shadow-panel">
            <div className="flex items-center justify-between border-b border-line/60 px-4 py-3">
              <div>
                <p className="text-[14px] font-semibold">Nouveau projet</p>
                <p className="text-[11px] text-fg-mute">Montages de départ, couleur et membres</p>
              </div>
              <button type="button" onClick={() => setCreating(false)} className="rounded p-1 text-fg-mute hover:text-fg">
                <X size={16} />
              </button>
            </div>

            <div className="max-h-[62vh] space-y-3 overflow-y-auto p-4">
              <label className="block">
                <span className="label-xs">Nom du projet</span>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="TP 4 — Équivalents de Thévenin"
                  className="field mt-1"
                  maxLength={120}
                />
              </label>

              <label className="block">
                <span className="label-xs">Objectif / description</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Comparer les modèles de Thévenin et de Norton sur trois montages…"
                  className="field mt-1 min-h-[62px] resize-y"
                  maxLength={400}
                />
              </label>

              <div>
                <span className="label-xs">Couleur</span>
                <div className="mt-1.5 flex gap-1.5">
                  {COLORS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setColor(item)}
                      aria-label={`Couleur ${item}`}
                      className={cn(
                        'h-7 w-7 rounded-full border-2 transition',
                        color === item ? 'scale-110 border-fg' : 'border-transparent opacity-70 hover:opacity-100',
                      )}
                      style={{ background: item }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <span className="label-xs">Montages de départ</span>
                <div className="mt-1.5 grid max-h-[150px] grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                  {templates.map((template) => {
                    const active = starters.includes(template.slug);
                    return (
                      <button
                        key={template.slug}
                        type="button"
                        onClick={() =>
                          setStarters((current) =>
                            active ? current.filter((s) => s !== template.slug) : [...current, template.slug],
                          )
                        }
                        className={cn(
                          'flex items-center gap-2 rounded-lg border p-1.5 text-left transition',
                          active
                            ? 'border-spark-cyan/60 bg-spark-cyan/[0.07]'
                            : 'border-line/50 bg-ink-850/50 hover:border-line',
                        )}
                      >
                        <TileGlyph
                          shape="circle"
                          accent={template.accent as 'cyan'}
                          kind="vsource"
                          size={24}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[10.5px] font-medium text-fg-soft">
                            {template.title}
                          </span>
                          <span className="block truncate text-[9px] text-fg-mute">{template.subtitle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-[10px] text-fg-mute">{starters.length} montage(s) sélectionné(s)</p>
              </div>

              <div className="rounded-lg border border-line/50 bg-ink-950/50 p-2.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-fg-soft">
                  <Users size={12} className="text-spark-cyan" /> Invitations
                </p>
                <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">
                  Après création, ajoutez des membres par e-mail depuis la page du projet. Chaque membre peut ouvrir les
                  ateliers multiwork avec un code à 5 chiffres.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-line/60 px-4 py-3">
              <span className="flex items-center gap-1 text-[10.5px] text-fg-mute">
                <Sparkles size={11} className="text-spark-violet" /> Créé pour {user.name}
              </span>
              <div className="flex gap-2">
                <button type="button" onClick={() => setCreating(false)} className="btn btn-sm">
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={createProject}
                  disabled={submitting || !name.trim()}
                  className="btn btn-primary btn-sm"
                >
                  {submitting ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                  Créer le projet
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
