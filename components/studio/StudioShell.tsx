'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Cloud,
  Download,
  FolderOpen,
  Grid3X3,
  Info,
  Maximize2,
  MoreHorizontal,
  Pause,
  Play,
  Redo2,
  Save,
  Share2,
  Flag,
  PlugZap,
  Sparkles,
  Split,
  Undo2,
  Upload,
  Users,
  } from 'lucide-react';
import { CircuitDoc, COMPONENT_META } from '@/lib/engine/types';
import { formatSI, formatPhasor } from '@/lib/engine/format';
import { abs } from '@/lib/engine/complex';
import { CircuitCanvas, Tool } from './CircuitCanvas';
import { Palette } from './Palette';
import { BuildBox } from './BuildBox';
import { ValuePalette } from './ValuePalette';
import { ValueBar } from './ValueBar';
import { SetupGuide } from './SetupGuide';
import { GeminiHelp } from './GeminiHelp';
import { Inspector } from './Inspector';
import { ResultsPanel } from './ResultsPanel';
import { CodePanel } from './editor/CodePanel';
import { useStudio } from '@/hooks/useStudio';
import { useMultiTabSync } from '@/hooks/useMultiTab';
import { AGENTS } from '@/lib/ai/agents';
import { useCircuitEngine } from '@/hooks/useCircuitEngine';
import { saveWorkspace } from '@/lib/studio/library';
import {
  downloadHtml,
  downloadInvite,
  downloadJson,
  downloadMarkdown,
  downloadPng,
  downloadSvg,
} from '@/lib/studio/export';
import { appendDoc, sanitizeDoc } from '@/lib/studio/doc';
import type { ValueModel } from '@/lib/express/model';
import { useToast } from '@/components/ui/Toast';
import type { LiveCursor, LiveParticipant } from '@/hooks/useCollaboration';

const COMPONENT_LABEL: Record<string, string> = Object.fromEntries(
  Object.entries(COMPONENT_META).map(([kind, meta]) => [kind, meta.label.toLowerCase()]),
);
import { cn } from '@/lib/utils';

interface Props {
  mode: 'solo' | 'room';
  initialDoc: CircuitDoc;
  user: { id: string; name: string } | null;
  circuitId?: string;
  roomCode?: string;
  templateSlug?: string;
  /** agent IA qui a construit le montage (bannière + accès à son analyse) */
  agentId?: string;
  projectOptions?: Array<{ id: string; name: string; color: string }>;
  initialProjectId?: string;
  onDocChange?: (doc: CircuitDoc, commit: boolean) => void;
  onlineCollaborators?: Array<{ id: string; name: string; color: string }>;
  writeEnabled?: boolean;
  /** collaboration : présence + curseurs (branchée sur useCollaboration) */
  collaboration?: {
    cursors: LiveCursor[];
    participants: LiveParticipant[];
    connected: boolean;
    transport: 'sse' | 'poll' | 'offline';
    publishCursor: (payload: Record<string, unknown>, options?: { immediate?: boolean }) => void;
    remoteRevision: number;
    lastAuthor?: string;
  };
}

export function StudioShell({
  mode,
  initialDoc,
  user,
  circuitId,
  roomCode,
  templateSlug,
  agentId,
  projectOptions = [],
  initialProjectId,
  onDocChange,
  onlineCollaborators = [],
  writeEnabled = true,
  collaboration,
}: Props) {
  const studio = useStudio(initialDoc);
  const [boxMode, setBoxMode] = useState<'values' | 'build' | 'compact'>('values');
  /** panneau de droite : réglages du dipôle sélectionné ou code du montage */
  const [asideMode, setAsideMode] = useState<'reglages' | 'code'>('reglages');
  const [projectId, setProjectId] = useState<string | undefined>(initialProjectId);
  const { doc, setDoc, selected, selectedId, setSelectedId } = studio;
  const { equivalent, solution } = useCircuitEngine(doc);
  const { success, error, info } = useToast();
  const router = useRouter();

  /* -------------------------------------------------- synchronisation multi-onglets */
  const activeAgent = useMemo(() => AGENTS.find((a) => a.id === agentId) ?? null, [agentId]);

  const multiTab = useMultiTabSync({
    doc,
    enabled: true,
    userName: user?.name ?? 'Utilisateur',
    onRemoteDoc: (remote) => setDoc(remote, { commit: false }),
  });

  const [tool, setTool] = useState<Tool>({ mode: 'select' });
  const [showFlow, setShowFlow] = useState(true);
  const [flowSpeed, setFlowSpeed] = useState(1);
  const [showGrid, setShowGrid] = useState(true);
  const [split, setSplit] = useState(true);
  const [resultsHeight, setResultsHeight] = useState(300);
  const resultsDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mobilePanel, setMobilePanel] = useState<'none' | 'palette' | 'results'>('none');
  const [menuOpen, setMenuOpen] = useState(false);
  const [geminiOpen, setGeminiOpen] = useState(false);
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  /** valeurs saisies par l'utilisateur, par type de dipôle */
  const [draftValues, setDraftValues] = useState<Record<string, number>>({});
  const [guideHidden, setGuideHidden] = useState(false);

  const setComponentValue = useCallback(
    (id: string, value: number) => {
      setDoc(
        {
          ...doc,
          components: doc.components.map((c) => (c.id === id ? { ...c, value } : c)),
        },
        { commit: true },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc],
  );
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /* ------------------------------------------- assistant Gemini (statut) */
  useEffect(() => {
    let alive = true;
    fetch('/api/ai/schema', { cache: 'no-store' })
      .then((r) => r.json())
      .then((payload: { configured?: boolean; model?: string }) => {
        if (!alive) return;
        setGeminiConfigured(Boolean(payload.configured));
        if (payload.model) setGeminiModel(payload.model);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  /* --------------------------------------------------- import d'un montage */
  const uploadCircuit = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        let body: Record<string, unknown>;
        if (file.name.endsWith('.json') || text.trim().startsWith('{')) {
          body = { doc: JSON.parse(text)?.doc ?? JSON.parse(text) };
        } else {
          body = { text };
        }
        const response = await fetch('/api/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? 'Fichier illisible.');
        const imported = sanitizeDoc(payload.doc as CircuitDoc);
        studio.reset(imported);
        setTool({ mode: 'select' });
        success(
          'Montage importé',
          `${imported.components.length} dipôles chargés · équivalent ${
            payload.stats?.equivalent ? 'calculé' : 'à compléter'
          }.`,
        );
      } catch (e) {
        error('Import impossible', (e as Error).message);
      }
    },
    [studio, success, error],
  );


  /* ------------------------------------------------- barre de valeurs R, C, L */
  /**
   * Charge (ou ajoute) le montage R·C·L analysé par le service Express.
   * « Charger » remplace la grille ; « Ajouter » décale le bloc pour le poser
   * à droite du montage existant, sans rien perdre.
   */
  const applyValueModel = useCallback(
    (model: ValueModel, options: { replace: boolean }) => {
      if (!model?.doc) {
        error('Montage indisponible', 'Relancez l’analyse de la barre de valeurs.');
        return;
      }
      if (options.replace || doc.components.length === 0) {
        studio.reset(model.doc);
        setTool({ mode: 'select' });
        success(
          'Montage R·C·L chargé',
          `${model.input.r} Ω · C · L dans la grille — équivalent calculé par ${model.source === 'express' ? 'Express' : 'le moteur local'}.`,
        );
        return;
      }
      setDoc(appendDoc(doc, model.doc), { commit: true });
      success('Montage R·C·L ajouté', 'Le bloc a été posé à droite du montage existant.');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [doc, setDoc, success, error],
  );

  /* ------------------------------------------------------- hydratation locale */
  useEffect(() => {
    const saved = window.localStorage.getItem('northev.prefs.v1');
    if (!saved) return;
    try {
      const prefs = JSON.parse(saved) as { showFlow?: boolean; showGrid?: boolean; speed?: number };
      if (typeof prefs.showFlow === 'boolean') setShowFlow(prefs.showFlow);
      if (typeof prefs.showGrid === 'boolean') setShowGrid(prefs.showGrid);
      if (typeof prefs.speed === 'number') setFlowSpeed(prefs.speed);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      'northev.prefs.v1',
      JSON.stringify({ showFlow, showGrid, speed: flowSpeed }),
    );
  }, [showFlow, showGrid, flowSpeed]);

  const change = useCallback(
    (next: CircuitDoc, options?: { commit?: boolean }) => {
      setDoc(next, { commit: options?.commit });
      if (mode === 'solo') saveWorkspace(next);
      onDocChange?.(next, options?.commit !== false);
    },
    [setDoc, mode, onDocChange],
  );

  /* -------------------------------------- verrou souple du composant édité */
  useEffect(() => {
    multiTab.setLock(selectedId);
  }, [selectedId, multiTab.setLock]);

  /* ------------------------------------- journal d'activité (multi-onglets) */
  const previousDoc = useRef<CircuitDoc | null>(null);
  const logActivity = multiTab.logActivity;
  useEffect(() => {
    const before = previousDoc.current;
    previousDoc.current = doc;
    if (!before) return;
    const beforeMap = new Map(before.components.map((c) => [c.id, c]));
    const afterMap = new Map(doc.components.map((c) => [c.id, c]));

    for (const [id, component] of afterMap) {
      const previous = beforeMap.get(id);
      if (!previous) {
        logActivity(`ajoute ${component.label ?? id}`);
      } else if (previous.value !== component.value) {
        logActivity(`règle ${component.label ?? id} → ${formatSI(component.value, component.kind === 'resistor' ? 'Ω' : '')}`);
      }
    }
    for (const [id, component] of beforeMap) {
      if (!afterMap.has(id)) logActivity(`supprime ${component.label ?? id}`);
    }
  }, [doc, logActivity]);

  /* --------------------------------------------- description de l'activité */
  const activity = useMemo(() => {
    if (selected) {
      return `règle ${selected.label ?? selected.id}`;
    }
    if (tool.mode === 'place') {
      return `trace ${COMPONENT_LABEL[tool.kind] ?? 'un dipôle'}`;
    }
    switch (tool.mode) {
      case 'erase':
        return 'efface un élément';
      case 'terminal':
        return `place la borne ${tool.which.toUpperCase()}`;
      case 'ground':
        return 'place la masse';
      default:
        return 'explore le montage';
    }
  }, [selected, tool]);

  useEffect(() => {
    if (!collaboration) return;
    // l'activité accompagne la sélection : les pairs voient le dipôle visé
    collaboration.publishCursor({
      activity,
      selection: selected?.id ?? null,
      pointer: tool.mode,
    });
  }, [activity, collaboration, selected, tool.mode]);

  const onCursorMove = useCallback(
    (payload: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      vw: number;
      vh: number;
      hover: string | null;
      tool: string;
    }) => {
      collaboration?.publishCursor({ ...payload, activity });
    },
    [collaboration, activity],
  );

  /* ------------------------------------------------------------- sauvegarde */
  const saveCircuit = useCallback(async () => {
    if (!user) {
      info('Connectez-vous pour enregistrer', 'Créez un compte pour conserver vos montages dans votre historique.');
      router.push('/compte?mode=connexion');
      return;
    }
    if (!writeEnabled) {
      error('Lecture seule', 'Seul le propriétaire de l’atelier peut enregistrer.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(circuitId ? `/api/circuits/${circuitId}` : '/api/circuits', {
        method: circuitId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc, templateSlug, projectId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error ?? 'Échec de la sauvegarde.');
      }
      studio.markSaved();
      success('Montage enregistré', 'Il apparaît dans votre historique de compte.');
    } catch (e) {
      error('Sauvegarde impossible', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [user, writeEnabled, circuitId, doc, templateSlug, projectId, studio, success, error, router, info]);

  /* --------------------------------------------------------------- raccourcis */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement;
      if (active && ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName)) return;
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveCircuit();
      }
      if (meta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        studio.undo();
      }
      if (meta && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault();
        studio.redo();
      }
      if (event.key.toLowerCase() === 'a' && !meta) setTool({ mode: 'terminal', which: 'a' });
      if (event.key.toLowerCase() === 'b' && !meta) setTool({ mode: 'terminal', which: 'b' });
      if (event.key.toLowerCase() === 'm' && !meta) setTool({ mode: 'ground' });
      if (event.key === 'v' && !meta) setTool({ mode: 'select' });
      if (event.key === 'e' && !meta) setTool({ mode: 'erase' });
      if (event.key.toLowerCase() === 'r' && !meta) studio.rotateSelected();
      if (event.key.toLowerCase() === 'f' && !meta) studio.flipSelected();
      if (event.key === 'Enter' && tool.mode !== 'select') setTool({ mode: 'select' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [studio, tool.mode, saveCircuit]);

  const stats = useMemo(() => {
    const readings = solution.ok ? Object.values(solution.readings) : [];
    const power = readings.reduce((sum, r) => sum + (Number.isFinite(r.p.re) ? Math.abs(r.p.re) : 0), 0);
    return { power };
  }, [solution]);

  const vth = equivalent.ok ? formatPhasor(equivalent.vth) : '—';
  const rth = equivalent.ok ? formatSI(abs(equivalent.rth), 'Ω') : '—';
  const inorton =
    equivalent.ok && Number.isFinite(abs(equivalent.inorton))
      ? formatSI(abs(equivalent.inorton), 'A')
      : '—';

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* -------------------------------------------------------- barre d'outils */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line/60 bg-ink-900/60 px-3 py-2 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <input
            value={doc.name}
            onChange={(e) => change({ ...doc, name: e.target.value }, { commit: false })}
            className="w-[180px] rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-fg outline-none transition hover:border-line/60 focus:border-spark-cyan/60 focus:bg-ink-950/60 sm:w-[240px]"
            aria-label="Nom du montage"
          />
          {studio.dirty ? <span className="h-1.5 w-1.5 rounded-full bg-spark-amber" title="Modifié" /> : null}
          {mode === 'room' ? (
            <>
              <span className="chip border-spark-violet/40 bg-spark-violet/10 text-spark-violet">
                <Users size={11} /> atelier {roomCode}
              </span>
              <span
                className={cn(
                  'chip',
                  collaboration?.connected
                    ? 'border-spark-green/40 bg-spark-green/10 text-spark-green'
                    : 'border-spark-coral/40 bg-spark-coral/10 text-spark-coral',
                )}
                title={`Transport : ${collaboration?.transport ?? 'hors ligne'}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: collaboration?.connected ? '#46e6a0' : '#ff7d6b',
                    boxShadow: collaboration?.connected ? '0 0 6px #46e6a0' : 'none',
                  }}
                />
                {collaboration?.connected
                  ? collaboration.transport === 'poll'
                    ? 'synchro (repli)'
                    : 'curseurs en direct'
                  : 'reconnexion…'}
              </span>
            </>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <ToolButton icon={Undo2} label="Annuler" onClick={studio.undo} disabled={!studio.canUndo} />
          <ToolButton icon={Redo2} label="Rétablir" onClick={studio.redo} disabled={!studio.canRedo} />
          <span className="mx-1 h-5 w-px bg-line/60" />
          <ToolButton
            icon={showGrid ? Grid3X3 : Grid3X3}
            label={showGrid ? 'Masquer la grille' : 'Afficher la grille'}
            onClick={() => setShowGrid((v) => !v)}
            active={showGrid}
          />
          <ToolButton
            icon={showFlow ? Pause : Play}
            label={showFlow ? 'Arrêter les électrons' : 'Animer les électrons'}
            onClick={() => setShowFlow((v) => !v)}
            active={showFlow}
          />
          <input
            type="range"
            min={0.3}
            max={2.5}
            step={0.1}
            value={flowSpeed}
            onChange={(e) => setFlowSpeed(Number(e.target.value))}
            className="hidden w-16 xl:block"
            aria-label="Vitesse des électrons"
          />
          <ToolButton
            icon={split ? Maximize2 : Split}
            label={split ? 'Masquer les résultats' : 'Afficher les résultats'}
            onClick={() => setSplit((v) => !v)}
            active={split}
          />
          <span className="mx-1 h-5 w-px bg-line/60" />
          <button
            type="button"
            onClick={() => setGeminiOpen(true)}
            className={cn(
              'btn btn-sm gap-1.5',
              geminiConfigured
                ? 'border-spark-violet/50 bg-spark-violet/10 text-spark-violet'
                : 'border-line/60 text-fg-soft',
            )}
            title={
              geminiConfigured
                ? `IA active (${geminiModel}) : schéma équivalent proposé puis vérifié par le solveur`
                : 'IA non configurée — l’équivalent reste calculé par le solveur local'
            }
          >
            <Sparkles size={13} />
            <span className="hidden xl:inline">{geminiConfigured ? 'Assistant IA' : 'Assistant'}</span>
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                geminiConfigured
                  ? 'bg-spark-green shadow-[0_0_6px] shadow-spark-green'
                  : 'bg-spark-amber/70',
              )}
            />
          </button>
          {user ? (
            <div className="flex items-center gap-1 rounded-md border border-line/50 pl-1.5">
              <FolderOpen size={12} className="text-fg-mute" />
              <select
                value={projectId ?? ''}
                onChange={(event) => setProjectId(event.target.value || undefined)}
                aria-label="Projet du montage"
                className="max-w-[118px] truncate bg-transparent py-1 pr-1 text-[11px] text-fg-soft outline-none"
                title="Rattacher ce montage à un projet"
              >
                <option value="">Sans projet</option>
                {projectOptions.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-sm border-line/60"
            title="Importer un montage (JSON ou texte)"
          >
            <Upload size={13} />
            <span className="hidden lg:inline">Importer</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.txt,.circ,application/json,text/plain"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void uploadCircuit(file);
            }}
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className={cn('btn btn-sm px-2', menuOpen && 'border-spark-cyan/50 text-spark-cyan')}
              title="Plus d'actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal size={15} />
            </button>
            {menuOpen ? (
              <>
                <button
                  type="button"
                  aria-label="Fermer le menu"
                  className="fixed inset-0 z-30 cursor-default"
                  onClick={() => setMenuOpen(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 top-9 z-40 w-56 overflow-hidden rounded-xl border border-line/70 bg-ink-900/98 p-1 shadow-panel backdrop-blur"
                >
                  {[
                    { label: 'Exporter en PNG', action: () => downloadPng(doc, equivalent) },
                    { label: 'Exporter en SVG', action: () => downloadSvg(doc, equivalent) },
                    { label: 'Exporter en HTML', action: () => downloadHtml(doc, equivalent) },
                    { label: 'Exporter en JSON', action: () => downloadJson(doc, equivalent) },
                    { label: 'Rapport Markdown', action: () => downloadMarkdown(doc, equivalent) },
                  ].map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        void Promise.resolve(item.action())
                          .then(() => success('Export prêt', item.label))
                          .catch((e: Error) => error('Export impossible', e.message));
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] text-fg-soft transition hover:bg-ink-800 hover:text-fg"
                    >
                      <Download size={12} className="text-spark-cyan" />
                      {item.label}
                    </button>
                  ))}
                  <div className="my-1 h-px bg-line/60" />
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      if (!roomCode) {
                        router.push('/multiwork');
                        return;
                      }
                      void downloadInvite(roomCode, doc, equivalent, user?.name ?? 'Northev Spark')
                        .then(() => success('Invitation générée', `Code ${roomCode} · carte PNG téléchargée.`))
                        .catch((e: Error) => error('Invitation impossible', e.message));
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] text-spark-violet transition hover:bg-ink-800"
                  >
                    <Users size={12} /> Inviter (carte PNG)
                  </button>
                  <Link
                    href={`/export${circuitId ? `?circuit=${circuitId}` : ''}`}
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] text-fg-soft transition hover:bg-ink-800 hover:text-fg"
                  >
                    <Share2 size={12} /> Page d’export avancée
                  </Link>
                </div>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={saveCircuit}
            disabled={saving}
            className="btn btn-sm border-line/60"
            title="Enregistrer (Ctrl+S)"
          >
            {saving ? <Cloud size={13} className="animate-pulse" /> : <Save size={13} />}
            <span className="hidden sm:inline">Enregistrer</span>
          </button>
          <Link
            href={`/multiwork${roomCode ? `?code=${roomCode}` : ''}`}
            className="btn btn-sm border-spark-violet/40 bg-spark-violet/10 text-spark-violet hover:border-spark-violet/60"
            title="Travailler à plusieurs"
          >
            <Users size={13} />
            <span className="hidden sm:inline">Multiwork</span>
          </Link>
          <Link
            href="/premium"
            onClick={() => {
              // le hub d'agents lit ce brouillon : il analysera le montage affiché
              try {
                saveWorkspace(doc);
              } catch {
                /* quota : le hub retombera sur la dernière version enregistrée */
              }
            }}
            className="btn btn-sm border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan"
            title="Faire analyser ce montage par les agents IA"
          >
            <Sparkles size={13} />
            <span className="hidden sm:inline">Agents</span>
          </Link>
        </div>
      </div>

      {/* --------------------------------------------- barre de valeurs R, C, L */}
      <ValueBar onApply={applyValueModel} compact />

      {/* ------------------------------------------------------------- workspace */}
      <div className="flex min-h-0 flex-1">
        {/* palette */}
        <aside className="hidden w-[188px] shrink-0 border-r border-line/60 bg-ink-900/40 md:flex md:flex-col lg:w-[210px]">
          <div className="flex shrink-0 gap-1 border-b border-line/50 p-1.5">
            {(
              [
                { id: 'values', label: 'Valeurs' },
                { id: 'build', label: 'Build Box' },
                { id: 'compact', label: 'Compacte' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setBoxMode(tab.id)}
                className={cn(
                  'flex-1 rounded-md px-1 py-1 text-[10px] font-medium transition',
                  boxMode === tab.id ? 'bg-spark-cyan/12 text-spark-cyan' : 'text-fg-mute hover:text-fg-soft',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {boxMode === 'values' ? (
              <ValuePalette
                draft={draftValues}
                onDraft={(kind, value) => {
                  setDraftValues((current) => ({ ...current, [kind]: value }));
                  setTool({ mode: 'place', kind });
                }}
                activeKind={tool.mode === 'place' ? tool.kind : null}
                onPick={(kind) => setTool({ mode: 'place', kind })}
                components={doc.components}
                onEditComponent={setComponentValue}
              />
            ) : boxMode === 'build' ? (
              <BuildBox
                onPick={(kind) => setTool({ mode: 'place', kind })}
                activeKind={tool.mode === 'place' ? tool.kind : null}
                onTerminal={(which) => setTool({ mode: 'terminal', which })}
                onGround={() => setTool({ mode: 'ground' })}
                onErase={() => setTool({ mode: 'erase' })}
                toolMode={tool.mode}
              />
            ) : (
              <Palette
                onPick={(kind) => setTool({ mode: 'place', kind })}
                activeKind={tool.mode === 'place' ? tool.kind : null}
                onTerminal={(which) => setTool({ mode: 'terminal', which })}
                onGround={() => setTool({ mode: 'ground' })}
                onErase={() => setTool({ mode: 'erase' })}
                toolMode={tool.mode}
              />
            )}
          </div>
        </aside>

        {/* canvas */}
        <section className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative flex-1 bg-ink-950/40 canvas-grid">
            <CircuitCanvas
              doc={doc}
              onChange={change}
              tool={tool}
              nextValue={tool.mode === 'place' ? draftValues[tool.kind] : undefined}
              onToolDone={() => {
                setTool((current) => (current.mode === 'place' ? current : { mode: 'select' }));
              }}
              selectedId={selectedId}
              onSelect={setSelectedId}
              readings={solution.ok ? solution.readings : undefined}
              showFlow={showFlow}
              flowSpeed={flowSpeed}
              showGrid={showGrid}
              collaborators={[
                ...(collaboration?.cursors ?? []),
                ...multiTab.remoteCursors.map((c) => ({
                  id: c.sender,
                  name: c.name,
                  color: c.color,
                  x: c.x,
                  y: c.y,
                  idle: false,
                  fresh: true,
                })),
              ]}
              participants={collaboration?.participants ?? onlineCollaborators.map((p) => ({ ...p, idle: false }))}
              localId={user?.id ?? ''}
              onCursorMove={collaboration ? onCursorMove : undefined}
              onTabCursor={multiTab.publishCursor}
              locks={multiTab.locks}
              showPresencePills={Boolean(collaboration)}
            />
            {multiTab.activity.length > 0 ? (
              <div className="pointer-events-none absolute bottom-3 right-3 z-10 w-[210px] rounded-lg border border-line/60 bg-ink-950/85 p-2 backdrop-blur">
                <p className="mb-1 flex items-center justify-between gap-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
                  <span className="flex items-center gap-1">
                    <Users size={10} /> Activité
                  </span>
                  <span className="font-mono normal-case tracking-normal text-spark-cyan">
                    {multiTab.peerCount} pair{multiTab.peerCount > 1 ? 's' : ''}
                  </span>
                </p>
                <ul className="space-y-0.5">
                  {multiTab.activity.slice(-4).reverse().map((entry) => (
                    <li key={entry.id} className="truncate text-[10px] leading-snug text-fg-soft">
                      <span className="font-semibold text-spark-cyan">{entry.userName}</span> {entry.text}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {activeAgent ? (
              <div
                className="pointer-events-auto absolute left-3 top-3 z-20 flex items-center gap-2 rounded-lg border bg-ink-950/90 px-2.5 py-1.5 backdrop-blur"
                style={{ borderColor: `${activeAgent.color}66` }}
              >
                <span
                  className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-ink-950"
                  style={{ background: activeAgent.color }}
                >
                  {activeAgent.name.slice(0, 1)}
                </span>
                <span className="text-[11px] text-fg-soft">
                  <strong className="font-semibold" style={{ color: activeAgent.color }}>
                    {activeAgent.name}
                  </strong>{' '}
                  a construit ce montage
                </span>
                <Link
                  href={`/premium?agent=${activeAgent.id}&template=${activeAgent.template}`}
                  className="rounded border px-1.5 py-0.5 text-[10px] font-medium transition hover:bg-white/5"
                  style={{ borderColor: `${activeAgent.color}55`, color: activeAgent.color }}
                >
                  Analyser
                </Link>
              </div>
            ) : null}

            {!writeEnabled ? (
              <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-lg border border-spark-amber/40 bg-ink-950/90 px-3 py-1.5 text-[11px] text-spark-amber backdrop-blur">
                Lecture seule — l’hôte de l’atelier contrôle le montage
              </div>
            ) : null}

            {!guideHidden ? (
              <SetupGuide
                doc={doc}
                equivalent={equivalent}
                onGround={() => setTool({ mode: 'ground' })}
                onTerminal={(which) => setTool({ mode: 'terminal', which })}
                onDismiss={() => setGuideHidden(true)}
              />
            ) : null}

            {/* participants live */}
            {onlineCollaborators.length ? (
              <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1">
                {onlineCollaborators.slice(0, 5).map((p, index) => (
                  <span
                    key={p.id}
                    className="flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-bold"
                    style={{
                      background: `${p.color}22`,
                      borderColor: `${p.color}66`,
                      color: p.color,
                      marginLeft: index ? -8 : 0,
                    }}
                    title={p.name}
                  >
                    {p.name.slice(0, 2).toUpperCase()}
                  </span>
                ))}
                <span className="ml-1 rounded-full bg-ink-950/80 px-2 py-0.5 text-[10px] text-fg-mute backdrop-blur">
                  {onlineCollaborators.length} en ligne
                </span>
              </div>
            ) : null}
          </div>

          {/* barre de résultats (division, redimensionnable) */}
          {split ? (
            <div className="shrink-0 border-t border-line/70 bg-ink-900/70" style={{ height: resultsHeight }}>
              <div
                role="separator"
                aria-label="Redimensionner les résultats"
                onPointerDown={(event) => {
                  resultsDragRef.current = { startY: event.clientY, startH: resultsHeight };
                  event.currentTarget.setPointerCapture(event.pointerId);
                }}
                onPointerMove={(event) => {
                  const drag = resultsDragRef.current;
                  if (!drag) return;
                  const next = drag.startH - (event.clientY - drag.startY);
                  setResultsHeight(Math.max(160, Math.min(640, next)));
                }}
                onPointerUp={() => {
                  resultsDragRef.current = null;
                }}
                className="group flex h-1.5 cursor-ns-resize items-center justify-center bg-line/0 transition hover:bg-spark-cyan/20"
              >
                <span className="h-0.5 w-8 rounded-full bg-line transition group-hover:bg-spark-cyan/70" />
              </div>
              <div className="h-[calc(100%-6px)]">
                <ResultsPanel doc={doc} equivalent={equivalent} solution={solution} digits={4} />
              </div>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-3 border-t border-line/70 bg-ink-900/80 px-3 py-2">
              <MetricPill label="U_th" value={vth} tone="cyan" />
              <MetricPill label="Z_th" value={rth} tone="violet" />
              <MetricPill label="I_N" value={inorton} tone="amber" />
              <MetricPill label="P" value={formatSI(stats.power, 'W')} tone="muted" />
              <button
                type="button"
                onClick={() => setSplit(true)}
                className="ml-auto flex items-center gap-1 text-[11px] text-spark-cyan hover:underline"
              >
                <Split size={12} /> Ouvrir le panneau de résultats
              </button>
            </div>
          )}
        </section>

        {/* inspecteur */}
        <aside
          className={cn(
            'hidden shrink-0 border-l border-line/60 bg-ink-900/40 transition-all duration-300 xl:block',
            inspectorOpen ? 'w-[268px]' : 'w-10',
          )}
        >
          {inspectorOpen ? (
            <div className="relative flex h-full flex-col">
              <div className="flex shrink-0 gap-1 border-b border-line/50 p-1.5">
                {(
                  [
                    ['reglages', 'Réglages'],
                    ['code', 'Code'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAsideMode(id)}
                    className={cn(
                      'flex-1 rounded-md px-1 py-1 text-[10px] font-medium transition',
                      asideMode === id ? 'bg-spark-cyan/12 text-spark-cyan' : 'text-fg-mute hover:text-fg-soft',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {asideMode === 'code' ? (
                  <CodePanel
                    doc={doc}
                    summary={
                      equivalent.ok
                        ? {
                            vth: abs(equivalent.vth),
                            rth: abs(equivalent.rth),
                            inorton: abs(equivalent.inorton),
                          }
                        : undefined
                    }
                  />
                ) : (
                  <Inspector
                    doc={doc}
                    selected={selected}
                    reading={selected && solution.ok ? solution.readings[selected.id] : undefined}
                    onChange={studio.patchSelected}
                    onDelete={studio.removeSelected}
                    onDuplicate={studio.duplicateSelected}
                    onRotate={studio.rotateSelected}
                    onFlip={studio.flipSelected}
                    digits={4}
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => setInspectorOpen(false)}
                className="absolute -left-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-line/70 bg-ink-900 text-fg-mute transition hover:text-fg"
                aria-label="Replier les réglages"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setInspectorOpen(true)}
              className="flex h-full w-full flex-col items-center gap-2 pt-4 text-fg-mute transition hover:text-fg"
              aria-label="Déployer les réglages"
            >
              <ChevronLeft size={14} />
              <span className="[writing-mode:vertical-rl] text-[10px] uppercase tracking-[0.2em]">Réglages</span>
            </button>
          )}
        </aside>
      </div>

      {/* ------------------------------------------------- mobile : palettes */}
      <div className="flex items-center gap-1.5 border-t border-line/60 bg-ink-900/80 px-2 py-1.5 md:hidden">
        <button
          type="button"
          onClick={() => setMobilePanel((v) => (v === 'palette' ? 'none' : 'palette'))}
          className={cn('btn btn-sm flex-1', mobilePanel === 'palette' && 'border-spark-cyan/50 text-spark-cyan')}
        >
          <FolderOpen size={13} /> Valeurs
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel((v) => (v === 'results' ? 'none' : 'results'))}
          className={cn('btn btn-sm flex-1', mobilePanel === 'results' && 'border-spark-cyan/50 text-spark-cyan')}
        >
          <Info size={13} /> Résultats
        </button>
        <Link href="/bibliotheque" className="btn btn-sm flex-1">
          <Download size={13} /> Gabarits
        </Link>
      </div>

      {geminiOpen ? (
        <GeminiHelp
          doc={doc}
          configured={geminiConfigured}
          model={geminiModel}
          onClose={() => setGeminiOpen(false)}
          onApply={(next, label) => {
            setDoc(next);
            studio.markSaved();
            success(label, 'Le montage a été remplacé dans le studio.');
          }}
        />
      ) : null}

      {mobilePanel !== 'none' ? (
        <div className="fixed inset-x-0 bottom-0 z-40 h-[65vh] rounded-t-2xl border-t border-line/70 bg-ink-950/98 backdrop-blur-xl md:hidden">
          <div className="flex items-center justify-between border-b border-line/60 px-3 py-2">
            <span className="text-xs font-medium">
              {mobilePanel === 'palette' ? 'Valeurs & dipôles' : 'Résultats d’équivalence'}
            </span>
            <button type="button" onClick={() => setMobilePanel('none')} className="btn btn-ghost btn-sm">
              Fermer
            </button>
          </div>
          <div className="h-[calc(65vh-44px)] overflow-y-auto">
            {mobilePanel === 'palette' ? (
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ValuePalette
                    draft={draftValues}
                    onDraft={(kind, value) => setDraftValues((prev) => ({ ...prev, [kind]: value }))}
                    activeKind={tool.mode === 'place' ? tool.kind : null}
                    onPick={(kind) => setTool({ mode: 'place', kind })}
                    components={doc.components}
                    onEditComponent={setComponentValue}
                  />
                </div>
                <div className="flex items-center gap-1.5 border-t border-line/60 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTool({ mode: 'ground' });
                      setMobilePanel('none');
                    }}
                    className="btn btn-sm flex-1"
                  >
                    <PlugZap size={12} /> Masse
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTool({ mode: 'terminal', which: 'a' });
                      setMobilePanel('none');
                    }}
                    className="btn btn-sm flex-1"
                  >
                    <Flag size={12} /> Borne A
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTool({ mode: 'terminal', which: 'b' });
                      setMobilePanel('none');
                    }}
                    className="btn btn-sm flex-1"
                  >
                    <Flag size={12} /> Borne B
                  </button>
                </div>
              </div>
            ) : (
              <ResultsPanel doc={doc} equivalent={equivalent} solution={solution} digits={4} compact />
            )}
          </div>
        </div>
      ) : null}

      {/* état du mode actif */}
      <span className="sr-only" aria-live="polite">
        {equivalent.ok
          ? `Équivalent calculé : tension de Thévenin ${vth}, impédance ${rth}, courant de Norton ${inorton}.`
          : `Calcul incomplet : ${equivalent.error ?? ''}`}
      </span>
    </div>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        'flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-fg-soft transition hover:bg-ink-800 hover:text-fg disabled:opacity-30',
        active && 'border-line/60 bg-ink-800 text-spark-cyan',
      )}
    >
      <Icon size={14} />
    </button>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'cyan' | 'violet' | 'amber' | 'muted';
}) {
  const tones = {
    cyan: 'text-spark-cyan border-spark-cyan/30',
    violet: 'text-spark-violet border-spark-violet/30',
    amber: 'text-spark-amber border-spark-amber/30',
    muted: 'text-fg-soft border-line/60',
  };
  return (
    <div className={cn('flex items-baseline gap-1.5 rounded-lg border bg-ink-850/60 px-2 py-1', tones[tone])}>
      <span className="font-mono text-[9px] uppercase tracking-wider opacity-70">{label}</span>
      <span className="font-mono text-[11.5px]">{value}</span>
    </div>
  );
}

