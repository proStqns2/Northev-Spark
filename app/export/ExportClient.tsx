'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Clipboard,
  Code2,
  Copy,
  Download,
  FileCode2,
  FileDown,
  FileJson,
  FileText,
  Image as ImageIcon,
  Loader2,
  QrCode,
  Share2,
  Sparkles,
  Users,
} from 'lucide-react';
import { CircuitDoc } from '@/lib/engine/types';
import { CircuitThumbnail } from '@/components/studio/CircuitCanvas';
import { useCircuitEngine } from '@/hooks/useCircuitEngine';
import {
  circuitToSvg,
  downloadHtml,
  downloadInvite,
  downloadJson,
  downloadMarkdown,
  downloadPng,
  downloadSvg,
} from '@/lib/studio/export';
import { formatPhasor, formatSI } from '@/lib/engine/format';
import { abs } from '@/lib/engine/complex';
import { sanitizeDoc } from '@/lib/studio/doc';
import { cn, timeAgo } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';

interface CircuitItem {
  id: string;
  name: string;
  updatedAt: string;
  preview: string;
}

export function ExportClient({
  user,
  circuits,
  initialDoc,
  initialName,
}: {
  user: { id: string; name: string } | null;
  circuits: CircuitItem[];
  initialDoc: string;
  initialName: string;
}) {
  const [doc, setDoc] = useState<CircuitDoc>(() => {
    try {
      return sanitizeDoc(JSON.parse(initialDoc) as CircuitDoc);
    } catch {
      return sanitizeDoc(JSON.parse(initialDoc));
    }
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const { equivalent } = useCircuitEngine(doc);
  const { success, error, info } = useToast();

  const svgPreview = useMemo(
    () => circuitToSvg(doc, equivalent),
    [doc, equivalent],
  );

  const stats = {
    vth: equivalent.ok ? formatPhasor(equivalent.vth) : '—',
    rth: equivalent.ok ? formatSI(abs(equivalent.rth), 'Ω') : '—',
    inorton: equivalent.ok && Number.isFinite(abs(equivalent.inorton)) ? formatSI(abs(equivalent.inorton), 'A') : '—',
  };

  async function run(key: string, action: () => Promise<void> | void) {
    setBusy(key);
    try {
      await action();
      success('Export terminé', 'Le fichier a été téléchargé.');
    } catch (e) {
      error('Export impossible', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copySvg() {
    await navigator.clipboard.writeText(svgPreview);
    info('SVG copié', 'Collez-le dans Figma, Illustrator ou une page web.');
  }

  async function createInvite() {
    if (!user) {
      error('Connexion requise', 'Créez un compte pour ouvrir un atelier multiwork.');
      return;
    }
    setCreatingInvite(true);
    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: doc.name, doc }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? 'Création impossible.');
      setInviteCode(payload.code);
      await downloadInvite(payload.code, doc, equivalent, user.name);
      success('Invitation générée', `Carte PNG téléchargée · code ${payload.code}.`);
    } catch (e) {
      error('Invitation impossible', (e as Error).message);
    } finally {
      setCreatingInvite(false);
    }
  }

  const formats = [
    { id: 'png', label: 'PNG', desc: 'Image haute résolution ×2', icon: ImageIcon, action: () => run('png', () => downloadPng(doc, equivalent)) },
    { id: 'svg', label: 'SVG', desc: 'Vectoriel éditable', icon: Code2, action: () => run('svg', () => downloadSvg(doc, equivalent)) },
    { id: 'html', label: 'HTML', desc: 'Page autonome prête à partager', icon: FileCode2, action: () => run('html', () => downloadHtml(doc, equivalent)) },
    { id: 'json', label: 'JSON', desc: 'Réimportable dans le studio', icon: FileJson, action: () => run('json', () => downloadJson(doc, equivalent)) },
    { id: 'md', label: 'Markdown', desc: 'Rapport pour compte rendu', icon: FileText, action: () => run('md', () => downloadMarkdown(doc, equivalent)) },
  ];

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="chip border-spark-coral/40 bg-spark-coral/[0.08] text-spark-coral">
            <FileDown size={12} /> Export & partage
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Sortir le montage du studio</h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-fg-soft">
            Cinq formats de fichier, une carte d’invitation et un lien d’atelier. Le cartouche de résultats (U_th, Z_th,
            I_N) est dessiné directement dans le rendu : le document est autosuffisant.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/studio" className="btn btn-sm">
            <ArrowRight size={13} /> Retour au studio
          </Link>
          <Link href="/multiwork" className="btn btn-sm border-spark-violet/40 text-spark-violet">
            <Users size={13} /> Ateliers
          </Link>
        </div>
      </header>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_330px]">
        <div className="space-y-3">
          <div className="panel overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <p className="text-[12px] font-medium">{doc.name}</p>
                <span className="chip">
                  {doc.components.length} dipôles · {doc.regime === 'ac' ? 'AC' : 'DC'}
                </span>
              </div>
              {circuits.length ? (
                <select
                  value=""
                  onChange={(e) => {
                    const target = circuits.find((c) => c.id === e.target.value);
                    if (!target) return;
                    try {
                      setDoc(sanitizeDoc(JSON.parse(target.preview) as CircuitDoc));
                    } catch {
                      error('Montage illisible');
                    }
                  }}
                  className="rounded-lg border border-line/60 bg-ink-950/70 px-2 py-1.5 text-[10.5px] text-fg-soft outline-none"
                >
                  <option value="">Charger un montage de l’historique…</option>
                  {circuits.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {timeAgo(c.updatedAt)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[10px] text-fg-mute">Connectez-vous pour charger un montage enregistré</span>
              )}
            </div>
            <div className="h-[320px] canvas-grid bg-ink-950/50 p-2">
              <CircuitThumbnail doc={doc} />
            </div>
            <div className="grid grid-cols-3 divide-x divide-line/60 border-t border-line/60">
              {[
                { label: 'U_th', value: stats.vth, tone: 'text-spark-cyan' },
                { label: 'Z_th', value: stats.rth, tone: 'text-spark-violet' },
                { label: 'I_N', value: stats.inorton, tone: 'text-spark-amber' },
              ].map((metric) => (
                <div key={metric.label} className="px-3 py-2">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-fg-mute">{metric.label}</p>
                  <p className={cn('font-mono text-[12px]', metric.tone)}>{metric.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {formats.map((format) => {
              const Icon = format.icon;
              return (
                <button
                  key={format.id}
                  type="button"
                  onClick={format.action}
                  disabled={busy === format.id}
                  className="panel group flex items-center gap-3 p-3 text-left transition hover:border-spark-cyan/40"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/60 bg-ink-850 text-spark-cyan">
                    {busy === format.id ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-medium">{format.label}</span>
                    <span className="block text-[10px] text-fg-mute">{format.desc}</span>
                  </span>
                  <Download size={13} className="shrink-0 text-fg-mute transition group-hover:text-spark-cyan" />
                </button>
              );
            })}

            <button
              type="button"
              onClick={copySvg}
              className="panel flex items-center gap-3 p-3 text-left transition hover:border-spark-violet/40"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line/60 bg-ink-850 text-spark-violet">
                <Clipboard size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium">Copier le SVG</span>
                <span className="block text-[10px] text-fg-mute">Dans le presse-papiers</span>
              </span>
              <Copy size={13} className="shrink-0 text-fg-mute" />
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------ invitation */}
        <aside className="space-y-3">
          <div className="panel p-4">
            <span className="flex items-center gap-2 text-[12px] font-semibold">
              <Share2 size={14} className="text-spark-violet" /> Invitation multiwork
            </span>
            <p className="mt-1 text-[11px] leading-relaxed text-fg-mute">
              Crée un atelier, génère un code à 5 chiffres et télécharge une carte PNG prête à envoyer.
            </p>
            <button
              type="button"
              onClick={createInvite}
              disabled={creatingInvite}
              className="btn btn-primary mt-3 w-full"
            >
              {creatingInvite ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
              {creatingInvite ? 'Génération…' : 'Générer la carte PNG'}
            </button>
            {inviteCode ? (
              <div className="mt-3 rounded-xl border border-spark-cyan/40 bg-spark-cyan/[0.07] p-3 text-center">
                <p className="text-[10px] uppercase tracking-[0.15em] text-fg-mute">Code d’atelier</p>
                <p className="mt-1 font-mono text-2xl tracking-[0.2em] text-spark-cyan">{inviteCode}</p>
                <Link
                  href={`/multiwork?code=${inviteCode}`}
                  className="btn btn-sm mt-2 w-full border-spark-cyan/50 text-spark-cyan"
                >
                  <Users size={12} /> Ouvrir l’atelier
                </Link>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-line/60 p-3 text-center">
                <QrCode size={20} className="mx-auto text-fg-mute" />
                <p className="mt-1 text-[10px] text-fg-mute">La carte inclut le schéma et le code.</p>
              </div>
            )}
          </div>

          <div className="panel p-4">
            <p className="text-[12px] font-semibold">Que contient chaque fichier ?</p>
            <ul className="mt-2 space-y-1.5 text-[10.5px] leading-relaxed text-fg-mute">
              <li className="flex gap-1.5">
                <Check size={11} className="mt-0.5 shrink-0 text-spark-green" />
                <span><strong className="text-fg-soft">PNG / SVG</strong> : le schéma complet, cartouche de résultats inclus.</span>
              </li>
              <li className="flex gap-1.5">
                <Check size={11} className="mt-0.5 shrink-0 text-spark-green" />
                <span><strong className="text-fg-soft">HTML</strong> : page autonome, tableau des composants et métriques.</span>
              </li>
              <li className="flex gap-1.5">
                <Check size={11} className="mt-0.5 shrink-0 text-spark-green" />
                <span><strong className="text-fg-soft">JSON</strong> : réimportable dans le studio (<code className="font-mono">/api/import</code>).</span>
              </li>
              <li className="flex gap-1.5">
                <Check size={11} className="mt-0.5 shrink-0 text-spark-green" />
                <span><strong className="text-fg-soft">Markdown</strong> : compte rendu de TP avec équations et tableau.</span>
              </li>
            </ul>
          </div>

          <div className="panel p-4">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold">
              <Sparkles size={13} className="text-spark-cyan" /> Assistant d’export
            </p>
            <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">
              Pour un rapport complet, combinez l’export Markdown avec une analyse croisée des agents IA.
            </p>
            <Link
              href="/premium"
              className="btn btn-sm mt-2 w-full border-spark-violet/40 text-spark-violet"
            >
              <Sparkles size={12} /> Ouvrir le hub IA
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
