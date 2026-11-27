'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Cloud,
  CloudOff,
  Download,
  Calculator,
  Info,
  Keyboard,
  Link2,
  Loader2,
  Redo2,
  Save,
  Sparkles,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import type { CircuitDoc, Component } from '@/lib/engine/types';
import { useCircuitEngine } from '@/hooks/useCircuitEngine';
import { abs } from '@/lib/engine/complex';
import { formatSI } from '@/lib/engine/format';
import {
  canRedo,
  canUndo,
  clearDoc,
  commit,
  createEditor,
  diagnose,
  docSummary,
  duplicatePart,
  flipPart,
  markSaved,
  movePart,
  placePart,
  redo,
  removePart,
  renameDoc,
  replaceDoc,
  rotatePart,
  setGround,
  setRegime,
  setTerminal,
  setTool,
  shortcutFor,
  undo,
  updatePart,
  type EditorState,
  type Tool,
} from '@/lib/studio/editor';
import { templateDoc } from '@/lib/data/loadDoc';
import { cn } from '@/lib/utils';
import { EditorCanvas } from './EditorCanvas';
import { PartPalette } from './PartPalette';
import { PartInspector } from './PartInspector';
import { QuickBar } from './QuickBar';
import { BuildPanel } from './BuildPanel';

/**
 * Coquille de l'atelier.
 *
 * Elle ne contient aucune règle de schéma : elle branche le clavier, la
 * sauvegarde, le calcul et les panneaux sur le cœur `lib/studio/editor.ts`.
 * Le résultat est visible immédiatement : chaque geste met à jour les
 * grandeurs calculées, sans bouton « recalculer » obligatoire.
 */

export interface EditorShellProps {
  user: { id: string; name: string } | null;
  circuitId?: string;
  templateSlug?: string;
  initialDoc: CircuitDoc;
  seeded: boolean;
  templates: Array<{ slug: string; title: string; subtitle?: string; components: number }>;
  projectId?: string;
  aiEnabled?: boolean;
}

interface Notice {
  id: number;
  message: string;
  tone: 'info' | 'ok' | 'warn';
}

const STORAGE_KEY = 'spark.atelier.brouillon.v1';

export function EditorShell({
  user,
  circuitId,
  templateSlug,
  initialDoc,
  seeded,
  templates,
  projectId,
  aiEnabled = false,
}: EditorShellProps) {
  const [editor, setEditor] = useState<EditorState>(() => createEditor(initialDoc));
  const [notices, setNotices] = useState<Notice[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | undefined>(circuitId);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<'resultats' | 'controles' | 'aide'>('resultats');
  const [showHelp, setShowHelp] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  /** onglets de l'interface mobile : chacune des zones reste atteignable */
  const [mobileTab, setMobileTab] = useState<'plan' | 'pieces' | 'reglages' | 'resultats'>('plan');
  /** colonne de droite : réglages ou fabrication assistée */
  const [deskTab, setDeskTab] = useState<'reglages' | 'decrire'>('reglages');
  const noticeId = useRef(0);

  const { equivalent, solution } = useCircuitEngine(editor.doc);
  const issues = useMemo(() => diagnose(editor.doc), [editor.doc]);

  const notify = useCallback((message: string, tone: 'info' | 'ok' | 'warn' = 'info') => {
    noticeId.current += 1;
    const notice: Notice = { id: noticeId.current, message, tone };
    setNotices((current) => [...current.slice(-2), notice]);
    window.setTimeout(() => {
      setNotices((current) => current.filter((item) => item.id !== notice.id));
    }, 3600);
  }, []);

  const apply = useCallback((updater: (state: EditorState) => EditorState) => {
    setEditor((current) => updater(current));
  }, []);

  /* ---------- restauration du brouillon ---------- */

  useEffect(() => {
    if (seeded || templateSlug || circuitId) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as CircuitDoc;
      if (parsed?.components?.length) {
        setEditor((current) => replaceDoc(current, parsed, 'Brouillon restauré'));
        notify('Brouillon local restauré.', 'info');
      }
    } catch {
      // brouillon illisible : on garde le montage d'amorçage
    }
    // une seule tentative au montage
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- sauvegarde locale ---------- */

  useEffect(() => {
    if (!editor.dirty) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(editor.doc));
      } catch {
        // quota dépassé : la sauvegarde serveur reste disponible
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [editor.doc, editor.dirty]);

  /* ---------- sauvegarde serveur ---------- */

  const save = useCallback(async () => {
    if (!user) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(editor.doc));
        setSavedAt(new Date().toLocaleTimeString('fr-FR'));
        apply(markSaved);
        notify('Enregistré dans ce navigateur. Créez un compte pour le garder partout.', 'info');
      } catch {
        notify('Impossible d’enregistrer localement.', 'warn');
      }
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(savedId ? `/api/circuits/${savedId}` : '/api/circuits', {
        method: savedId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc: editor.doc, templateSlug, projectId }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        notify(payload.error ?? 'Sauvegarde refusée.', 'warn');
        return;
      }
      const payload = (await response.json()) as { circuit?: { id: string } };
      if (payload.circuit?.id) setSavedId(payload.circuit.id);
      apply(markSaved);
      setSavedAt(new Date().toLocaleTimeString('fr-FR'));
      notify('Montage enregistré.', 'ok');
    } finally {
      setSaving(false);
    }
  }, [apply, editor.doc, notify, projectId, savedId, templateSlug, user]);

  /* ---------- actions ---------- */

  const loadTemplate = useCallback(
    (slug: string) => {
      const doc = templateDoc(slug);
      if (!doc) {
        notify('Gabarit introuvable.', 'warn');
        return;
      }
      setEditor((current) => replaceDoc(current, { ...doc, name: doc.name || 'Exemple' }, 'Gabarit chargé'));
      notify('Exemple chargé : tout est modifiable.', 'ok');
    },
    [notify],
  );

  const change = useCallback(
    (id: string, patch: Partial<Component>, label = 'Modifier') => {
      apply((current) => updatePart(current, id, patch, label));
    },
    [apply],
  );

  const applyBuiltDoc = useCallback(
    (doc: CircuitDoc, message: string) => {
      setEditor((current) => replaceDoc(current, doc, 'Montage construit'));
      setTab('resultats');
      setPanelOpen(true);
      setMobileTab('plan');
      notify(message, 'ok');
    },
    [notify],
  );

  const solve = useCallback(() => {
    setTab('resultats');
    setPanelOpen(true);
    if (equivalent.ok) {
      notify(
        `Calculé : Vth = ${formatSI(abs(equivalent.vth), 'V')} · Rth = ${formatSI(abs(equivalent.rth), 'Ω')}`,
        'ok',
      );
    } else {
      notify(`Calcul incomplet : ${equivalent.error ?? 'vérifiez le câblage'}`, 'warn');
    }
  }, [equivalent, notify]);

  const copyLink = useCallback(async () => {
    const url = `${window.location.origin}/studio${savedId ? `?circuit=${savedId}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      notify('Lien copié.', 'ok');
    } catch {
      notify(url, 'info');
    }
  }, [notify, savedId]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(editor.doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(editor.doc.name || 'montage').replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Montage exporté en JSON.', 'ok');
  }, [editor.doc, notify]);

  /* ---------- clavier ---------- */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;

      const action = shortcutFor(event);
      if (!action) return;

      // on n'intercepte que nos touches
      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      switch (action.type) {
        case 'place':
          handled();
          apply((state) => setTool(state, { mode: 'place', kind: action.kind }));
          break;
        case 'wire':
          handled();
          apply((state) => setTool(state, { mode: 'wire' }));
          break;
        case 'select':
          handled();
          apply((state) => setTool(state, { mode: 'select' }));
          break;
        case 'ground':
          handled();
          apply((state) => setTool(state, { mode: 'ground' }));
          break;
        case 'erase':
          handled();
          apply((state) => setTool(state, { mode: 'erase' }));
          break;
        case 'undo':
          handled();
          apply(undo);
          break;
        case 'redo':
          handled();
          apply(redo);
          break;
        case 'delete':
          handled();
          apply((state) => (state.selectedId ? removePart(state, state.selectedId) : state));
          break;
        case 'duplicate':
          handled();
          apply((state) => (state.selectedId ? duplicatePart(state, state.selectedId) : state));
          break;
        case 'rotate':
          handled();
          apply((state) => (state.selectedId ? rotatePart(state, state.selectedId) : state));
          break;
        case 'flip':
          handled();
          apply((state) => (state.selectedId ? flipPart(state, state.selectedId) : state));
          break;
        case 'escape':
          handled();
          apply((state) => setTool({ ...state, wireFrom: null }, { mode: 'select' }));
          setShowHelp(false);
          setShowShortcuts(false);
          break;
        case 'solve':
          handled();
          solve();
          break;
        case 'save':
          handled();
          void save();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [apply, save, solve]);

  /* ---------- rendu ---------- */

  const errorCount = issues.filter((issue) => issue.level === 'error').length;
  const warningCount = issues.filter((issue) => issue.level === 'warning').length;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-ink-950">
      {/* barre d'outils */}
      <header className="flex flex-wrap items-center gap-1 border-b border-line/60 bg-ink-950/95 px-2 py-1.5 sm:gap-1.5 sm:px-3 sm:py-2">
        <div className="flex items-center gap-0.5">
          <IconAction label="Annuler (Ctrl+Z)" disabled={!canUndo(editor)} onClick={() => apply(undo)}>
            <Undo2 size={15} />
          </IconAction>
          <IconAction label="Rétablir (Ctrl+Maj+Z)" disabled={!canRedo(editor)} onClick={() => apply(redo)}>
            <Redo2 size={15} />
          </IconAction>
        </div>

        <div className="mx-0.5 hidden h-5 w-px bg-line/60 sm:block" />

        <div className="hidden items-center gap-1 sm:flex">
          <ToolButton active={editor.tool.mode === 'select'} onClick={() => apply((state) => setTool(state, { mode: 'select' }))}>
            Sélection
          </ToolButton>
          <ToolButton active={editor.tool.mode === 'wire'} onClick={() => apply((state) => setTool(state, { mode: 'wire' }))}>
            Fil
          </ToolButton>
          <ToolButton active={editor.tool.mode === 'erase'} onClick={() => apply((state) => setTool(state, { mode: 'erase' }))}>
            Gomme
          </ToolButton>
        </div>

        <button type="button" onClick={solve} className="btn btn-primary btn-sm ml-auto sm:ml-0">
          <Calculator size={13} />
          <span className="hidden sm:inline">Calculer</span>
        </button>
        <button type="button" onClick={() => void save()} disabled={saving} className="btn btn-sm border-line/60">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
          <span className="hidden sm:inline">{user ? 'Enregistrer' : 'Sauver ici'}</span>
        </button>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1">
          <span className="hidden items-center gap-1 text-[10px] text-fg-mute md:flex">
            {user ? <Cloud size={11} className="text-spark-green" /> : <CloudOff size={11} />}
            {user ? (savedAt ? `enregistré à ${savedAt}` : 'compte actif') : 'invité — brouillon local'}
          </span>
          <IconAction label="Exporter en JSON" onClick={exportJson}>
            <Download size={15} />
          </IconAction>
          <IconAction label="Copier le lien" onClick={() => void copyLink()}>
            <Link2 size={15} />
          </IconAction>
          {aiEnabled ? (
            <Link href="/assistant" className="hidden rounded-md px-1.5 py-1 text-[11px] text-spark-violet sm:flex sm:items-center sm:gap-1">
              <Sparkles size={12} /> Assistant
            </Link>
          ) : null}
          <IconAction label="Raccourcis clavier" onClick={() => setShowShortcuts((value) => !value)}>
            <Keyboard size={15} />
          </IconAction>
          <IconAction label="Aide" onClick={() => setShowHelp(true)}>
            <CircleHelp size={15} />
          </IconAction>
        </div>
      </header>

      {/* corps : sur téléphone une seule zone à la fois, sur grand écran trois colonnes */}
      <div className="grid min-h-0 flex-1 gap-2 p-2 lg:grid-cols-[210px_minmax(0,1fr)_252px]">
        {/* palette (grand écran) */}
        <div className="hidden min-h-0 lg:block">
          <PartPalette tool={editor.tool} onTool={(tool: Tool) => apply((state) => setTool(state, tool))} templates={templates} onTemplate={loadTemplate} compact />
        </div>

        {/* plan + barre rapide */}
        <div className={cn('flex min-h-0 flex-col gap-2', mobileTab !== 'plan' && 'hidden lg:flex')}>
          <div className="min-h-[300px] flex-1 lg:min-h-[420px]">
            <EditorCanvas state={editor} setState={setEditor} onNotice={notify} onTemplate={loadTemplate} />
          </div>

          <QuickBar
            tool={editor.tool}
            onTool={(tool) => apply((state) => setTool(state, tool))}
            onSolve={solve}
            onUndo={() => apply(undo)}
            onRedo={() => apply(redo)}
            canUndo={canUndo(editor)}
            canRedo={canRedo(editor)}
            hasSelection={Boolean(editor.selectedId)}
            onDelete={() => apply((state) => (state.selectedId ? removePart(state, state.selectedId) : state))}
            onRotate={() => apply((state) => (state.selectedId ? rotatePart(state, state.selectedId) : state))}
          />

          {panelOpen ? (
            <section className={cn('panel shrink-0 p-0', mobileTab !== 'resultats' && 'hidden lg:block')}>
              <div className="flex items-center gap-1 border-b border-line/50 px-2 py-1">
                {(
                  [
                    ['resultats', 'Résultats'],
                    ['controles', `Contrôles${errorCount ? ` (${errorCount})` : warningCount ? ` (${warningCount})` : ''}`],
                    ['aide', 'Guide'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={cn(
                      'rounded-md px-2 py-1 text-[10.5px] transition',
                      tab === id ? 'bg-ink-800 text-fg' : 'text-fg-mute hover:text-fg-soft',
                    )}
                  >
                    {label}
                  </button>
                ))}
                <span className="ml-2 hidden font-mono text-[9.5px] text-fg-mute sm:inline">{docSummary(editor.doc)}</span>
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="ml-auto rounded p-1 text-fg-mute hover:text-fg"
                  aria-label="Réduire le panneau"
                >
                  <ChevronDown size={13} />
                </button>
              </div>
              <div className="max-h-[240px] overflow-y-auto p-2.5">
                {tab === 'resultats' ? <ResultsStrip equivalent={equivalent} solution={solution} /> : null}
                {tab === 'controles' ? (
                  <ul className="space-y-1">
                    {issues.map((issue, index) => (
                      <li
                        key={`${issue.message}-${index}`}
                        className={cn(
                          'rounded-lg border px-2 py-1.5 text-[10.5px]',
                          issue.level === 'error'
                            ? 'border-spark-rose/40 bg-spark-rose/[0.06] text-spark-rose'
                            : issue.level === 'warning'
                              ? 'border-spark-amber/40 bg-spark-amber/[0.05] text-spark-amber'
                              : 'border-line/50 text-fg-soft',
                        )}
                      >
                        <span className="flex items-start gap-1.5">
                          {issue.level === 'info' ? <Info size={11} className="mt-0.5 shrink-0" /> : <AlertTriangle size={11} className="mt-0.5 shrink-0" />}
                          <span>
                            {issue.message}
                            {issue.hint ? <span className="mt-0.5 block text-[9.5px] text-fg-mute">{issue.hint}</span> : null}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {tab === 'aide' ? (
                  <ol className="space-y-1 text-[10.5px] leading-relaxed text-fg-soft">
                    <li><span className="text-spark-cyan">1.</span> Touchez une pièce dans la barre sous le plan.</li>
                    <li><span className="text-spark-cyan">2.</span> Touchez le plan : la pièce se pose et reste sélectionnée.</li>
                    <li><span className="text-spark-cyan">3.</span> Glissez-la pour la déplacer ; les boutons pivotent/suppriment.</li>
                    <li><span className="text-spark-cyan">4.</span> « Fil » : une borne, puis la seconde.</li>
                    <li><span className="text-spark-cyan">5.</span> « Masse » puis un nœud ; A et B pour la mesure.</li>
                    <li><span className="text-spark-cyan">6.</span> « Calculer » : Eth, Rth, In et toutes les tensions.</li>
                  </ol>
                ) : null}
              </div>
            </section>
          ) : (
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="panel hidden items-center justify-center gap-2 py-1.5 text-[10.5px] text-fg-soft lg:flex"
            >
              <ChevronDown size={12} className="rotate-180" /> Résultats et contrôles
            </button>
          )}
        </div>

        {/* colonne de droite : réglages ou fabrication */}
        <div className={cn('min-h-0 flex-col gap-2 lg:flex', mobileTab === 'plan' || mobileTab === 'resultats' ? 'hidden' : 'flex')}>
          <div className="flex gap-1 rounded-lg border border-line/50 p-0.5">
            {(
              [
                ['reglages', 'Réglages'],
                ['decrire', 'Décrire'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setDeskTab(id)}
                className={cn(
                  'flex-1 rounded-md px-2 py-1 text-[10.5px] transition',
                  deskTab === id ? 'bg-ink-800 text-fg' : 'text-fg-mute hover:text-fg-soft',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {deskTab === 'decrire' ? (
            <BuildPanel onDoc={applyBuiltDoc} />
          ) : (
            <>
              <PartInspector
                state={editor}
                onChange={change}
                onRotate={(id) => apply((state) => rotatePart(state, id))}
                onFlip={(id) => apply((state) => flipPart(state, id))}
                onDuplicate={(id) => apply((state) => duplicatePart(state, id))}
                onDelete={(id) => apply((state) => removePart(state, id))}
                onGround={(node) => apply((state) => setGround(state, node))}
                onTerminal={(which, node) => apply((state) => setTerminal(state, which, node))}
                onRegime={(regime, frequency) => apply((state) => setRegime(state, regime, frequency))}
                onRename={(name) => apply((state) => renameDoc(state, name))}
              />
              <div className="mt-2 grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Vider le plan ? L’action est annulable.')) apply(clearDoc);
                  }}
                  className="btn btn-sm border-line/60 text-fg-soft"
                >
                  <Trash2 size={11} /> Vider
                </button>
                <button type="button" onClick={() => setShowHelp(true)} className="btn btn-sm border-line/60">
                  <BookOpen size={11} /> Tutoriel
                </button>
              </div>
            </>
          )}
        </div>

        {/* palette (téléphone, onglet dédié) */}
        <div className={cn('min-h-0 lg:hidden', mobileTab === 'pieces' ? 'block' : 'hidden')}>
          <PartPalette tool={editor.tool} onTool={(tool: Tool) => apply((state) => setTool(state, tool))} templates={templates} onTemplate={loadTemplate} />
        </div>
      </div>

      {/* navigation mobile, toujours visible */}
      <nav className="sticky bottom-0 z-30 flex border-t border-line/60 bg-ink-950/95 backdrop-blur lg:hidden">
        {(
          [
            ['plan', 'Plan', Calculator],
            ['pieces', 'Pièces', Sparkles],
            ['reglages', 'Réglages', Info],
            ['resultats', 'Calcul', Check],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMobileTab(id)}
            className={cn(
              'flex h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[9.5px]',
              mobileTab === id ? 'text-spark-cyan' : 'text-fg-mute',
            )}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </nav>


      {/* notifications */}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-1.5">
        {notices.map((notice) => (
          <div
            key={notice.id}
            className={cn(
              'pointer-events-auto flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] shadow-xl backdrop-blur animate-slide-in',
              notice.tone === 'ok'
                ? 'border-spark-green/40 bg-ink-950/95 text-spark-green'
                : notice.tone === 'warn'
                  ? 'border-spark-amber/40 bg-ink-950/95 text-spark-amber'
                  : 'border-line/60 bg-ink-950/95 text-fg-soft',
            )}
          >
            {notice.tone === 'ok' ? <Check size={12} /> : notice.tone === 'warn' ? <AlertTriangle size={12} /> : <Info size={12} />}
            {notice.message}
          </div>
        ))}
      </div>

      {showShortcuts ? <ShortcutsCard onClose={() => setShowShortcuts(false)} /> : null}
      {showHelp ? <HelpDialog onClose={() => setShowHelp(false)} onTemplate={loadTemplate} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn('rounded-md p-1.5 transition', disabled ? 'text-fg-mute/40' : 'text-fg-soft hover:bg-ink-800 hover:text-fg')}
    >
      {children}
    </button>
  );
}

function ToolButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-lg px-2 py-1 text-[11px] transition',
        active ? 'bg-spark-cyan/15 text-spark-cyan' : 'text-fg-soft hover:bg-ink-850 hover:text-fg',
      )}
    >
      {children}
    </button>
  );
}

function ResultsStrip({ equivalent, solution }: { equivalent: ReturnType<typeof useCircuitEngine>['equivalent']; solution: ReturnType<typeof useCircuitEngine>['solution'] }) {
  if (!equivalent.ok) {
    return (
      <p className="flex items-start gap-1.5 text-[10.5px] text-spark-amber">
        <AlertTriangle size={11} className="mt-0.5 shrink-0" />
        {equivalent.error ?? 'Le calcul n’est pas encore possible.'}
      </p>
    );
  }
  const nodeVoltages = solution.ok ? Object.entries(solution.nodeVoltages) : [];
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <Metric label="Eth" value={formatSI(abs(equivalent.vth), 'V')} tone="#ffc266" />
        <Metric label="Rth" value={formatSI(abs(equivalent.rth), 'Ω')} tone="#38e1e6" />
        <Metric label="In" value={formatSI(abs(equivalent.inorton), 'A')} tone="#46e6a0" />
        <Metric
          label="État"
          value={equivalent.status === 'ok' ? 'calculé' : equivalent.status === 'shorted' ? 'court-circuit' : equivalent.status === 'open' ? 'circuit ouvert' : 'incomplet'}
          tone="#a479ff"
        />
      </div>
      {nodeVoltages.length ? (
        <div className="flex flex-wrap gap-1">
          {nodeVoltages.slice(0, 8).map(([node, value]) => (
            <span key={node} className="rounded-md border border-line/40 px-1.5 py-0.5 font-mono text-[9.5px] text-fg-soft">
              <span className="text-fg-mute">V({node})</span> = {formatSI(abs(value), 'V')}
            </span>
          ))}
        </div>
      ) : null}
      {!solution.ok ? (
        <p className="text-[10px] text-spark-amber">{solution.error}</p>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-lg border border-line/50 bg-ink-900/50 px-2 py-1">
      <p className="text-[9px] uppercase tracking-wide text-fg-mute">{label}</p>
      <p className="font-mono text-[12px] font-semibold" style={{ color: tone }}>
        {value}
      </p>
    </div>
  );
}

function ShortcutsCard({ onClose }: { onClose: () => void }) {
  const rows: Array<[string, string]> = [
    ['R / C / L', 'poser résistance, condensateur, bobine'],
    ['E / I', 'poser une source de tension / courant'],
    ['W', 'outil fil (deux clics)'],
    ['V', 'sélection'],
    ['M', 'masse'],
    ['T / Maj+R', 'pivoter la pièce sélectionnée'],
    ['X', 'inverser les bornes'],
    ['Suppr', 'supprimer'],
    ['Ctrl+D', 'dupliquer'],
    ['Ctrl+Z / Ctrl+Maj+Z', 'annuler / rétablir'],
    ['Entrée', 'calculer'],
    ['Ctrl+S', 'enregistrer'],
    ['Échap', 'revenir à la sélection'],
    ['Molette', 'zoom'],
    ['Espace + glisser', 'déplacer la vue'],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="panel w-full max-w-md p-4" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold">
            <Keyboard size={14} className="text-spark-cyan" /> Raccourcis
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-fg-mute hover:text-fg" aria-label="Fermer">
            <X size={14} />
          </button>
        </div>
        <dl className="mt-2 space-y-1">
          {rows.map(([keys, action]) => (
            <div key={keys} className="flex items-baseline justify-between gap-3 text-[11px]">
              <dt className="font-mono text-[10.5px] text-spark-cyan">{keys}</dt>
              <dd className="text-right text-fg-soft">{action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

function HelpDialog({ onClose, onTemplate }: { onClose: () => void; onTemplate: (slug: string) => void }) {
  const steps = [
    {
      title: 'Poser les pièces',
      body: 'Choisissez un dipôle dans la palette (ou tapez sa lettre) puis cliquez sur le plan. La pièce se pose aimantée à la grille et reste sélectionnée.',
    },
    {
      title: 'Câbler',
      body: 'Deux solutions : déplacer les pièces pour qu’elles partagent une borne, ou tracer un fil avec W (un clic sur chaque extrémité).',
    },
    {
      title: 'Fixer la référence',
      body: 'Tout calcul a besoin d’une masse : outil M puis cliquez un nœud. Les bornes A et B définissent le point de mesure de Thévenin.',
    },
    {
      title: 'Calculer',
      body: 'Entrée ou le bouton Calculer. Le solveur MNA donne Eth, Rth, In, puis toutes les tensions et courants du montage.',
    },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4" onClick={onClose}>
      <div className="panel w-full max-w-lg p-5" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[15px] font-semibold">Construire un montage en 4 gestes</h2>
            <p className="mt-0.5 text-[11px] text-fg-mute">L’atelier ne valide jamais à votre place : il montre et il explique.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-fg-mute hover:text-fg" aria-label="Fermer">
            <X size={15} />
          </button>
        </div>
        <ol className="mt-3 space-y-2">
          {steps.map((step, index) => (
            <li key={step.title} className="rounded-xl border border-line/50 p-2.5">
              <p className="text-[11.5px] font-medium">
                <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-spark-cyan/15 text-[9px] text-spark-cyan">
                  {index + 1}
                </span>
                {step.title}
              </p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              onTemplate('thevenin-serie');
              onClose();
            }}
            className="btn btn-primary btn-sm"
          >
            Charger un exemple calculé
          </button>
          <button type="button" onClick={onClose} className="btn btn-sm border-line/60">
            Continuer à construire
          </button>
        </div>
      </div>
    </div>
  );
}
