import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, BookOpen, Boxes, CircuitBoard, Ruler } from 'lucide-react';
import { NormSymbolTile } from '@/components/studio/symbols/NormSymbol';
import { KIND_COLORS } from '@/lib/studio/symbolSvg';
import { COMPONENT_META, ComponentKind } from '@/lib/engine/types';

export const metadata: Metadata = {
  title: 'Symboles',
  description:
    'Bibliothèque de symboles électriques normalisés (CEI) : résistance, condensateur, bobine, sources E et i — références du manuel et versions vectorielles du studio.',
};

const REFERENCES: Array<{
  file: string;
  title: string;
  legend: string;
  letter: string;
  kind: ComponentKind;
  note: string;
}> = [
  {
    file: '/symbols/reference/resistance-R.png',
    title: 'Résistance',
    legend: 'R',
    letter: 'R',
    kind: 'resistor',
    note: 'Rectangle normalisé (CEI) — pas le zigzag américain.',
  },
  {
    file: '/symbols/reference/condensateur-C.png',
    title: 'Condensateur',
    legend: 'C',
    letter: 'C',
    kind: 'capacitor',
    note: 'Deux armatures parallèles, diélectrique entre les deux.',
  },
  {
    file: '/symbols/reference/inductance-L.png',
    title: 'Bobine',
    legend: 'L',
    letter: 'L',
    kind: 'inductor',
    note: 'Quatre arches enchaînées, souvent avec noyau.',
  },
  {
    file: '/symbols/reference/champ-E.png',
    title: 'Champ / f.é.m.',
    legend: 'E',
    letter: 'E',
    kind: 'vsource',
    note: 'Flèche de champ électrique à travers une boucle.',
  },
  {
    file: '/symbols/reference/source-i.png',
    title: 'Source de courant',
    legend: 'i',
    letter: 'i',
    kind: 'isource',
    note: 'Cercle traversé par une flèche de courant.',
  },
];

const PLACEABLE: ComponentKind[] = [
  'resistor',
  'capacitor',
  'inductor',
  'vsource',
  'isource',
  'lamp',
  'potentiometer',
  'switch',
  'ammeter',
  'voltmeter',
  'vcvs',
  'vccs',
  'wire',
];

export default function SymbolesPage() {
  return (
    <div className="mx-auto max-w-[1300px] px-4 py-8 sm:px-6">
      <header>
        <span className="chip border-spark-cyan/40 bg-spark-cyan/[0.08] text-spark-cyan">
          <BookOpen size={12} /> Bibliothèque graphique
        </span>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Symboles du cours</h1>
        <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-fg-soft">
          Les cinq captures de référence (branche <code className="rounded bg-ink-850 px-1 py-0.5 text-[12px]">assets/</code>)
          ont servi de modèle : chaque symbole du studio est redessiné en vectoriel normalisé, puis réutilisé
          partout — palette Build Box, grille, exports PNG / SVG / HTML.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="chip">
            <Ruler size={10} /> norme CEI
          </span>
          <span className="chip">
            <Boxes size={10} /> 13 dipôles plaçables
          </span>
          <span className="chip">
            <CircuitBoard size={10} /> un seul jeu de symboles
          </span>
        </div>
      </header>

      {/* --------------------------------------------------- références */}
      <section className="mt-7">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="label-xs">Références du manuel</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Captures d’origine</h2>
          </div>
          <p className="hidden text-[11px] text-fg-mute sm:block">à gauche la capture · à droite la version vectorielle</p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {REFERENCES.map((reference) => (
            <article key={reference.file} className="panel overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-line/40">
                <div className="relative flex items-center justify-center bg-[#f7f7f5] p-2">
                  <Image
                    src={reference.file}
                    alt={`Capture de référence : ${reference.title}`}
                    width={220}
                    height={160}
                    className="h-[104px] w-auto object-contain mix-blend-darken"
                    unoptimized
                  />
                </div>
                <div className="flex items-center justify-center bg-gradient-to-b from-[#16283b] to-[#0f1d2b] p-2">
                  <NormSymbolTile kind={reference.kind} color={KIND_COLORS[reference.kind]} size={92} />
                </div>
              </div>
              <div className="border-t border-line/40 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[12.5px] font-semibold">{reference.title}</p>
                  <span
                    className="rounded border px-1.5 py-0.5 font-mono text-[10px]"
                    style={{
                      color: KIND_COLORS[reference.kind],
                      borderColor: `${KIND_COLORS[reference.kind]}66`,
                      background: `${KIND_COLORS[reference.kind]}14`,
                    }}
                  >
                    {reference.legend}
                  </span>
                </div>
                <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">{reference.note}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------- planche SVG */}
      <section className="mt-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="label-xs">Planche complète</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Les 13 dipôles du studio</h2>
          </div>
          <Link href="/studio" className="btn btn-sm">
            Ouvrir le studio <ArrowRight size={12} />
          </Link>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {PLACEABLE.map((kind) => {
            const meta = COMPONENT_META[kind];
            const color = KIND_COLORS[kind];
            return (
              <div
                key={kind}
                className="group rounded-xl border border-line/50 bg-gradient-to-b from-[#16283b] to-[#0f1d2b] p-3 transition hover:border-line"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] text-fg-mute">{meta.symbol}</span>
                  <span className="font-mono text-[9px] text-fg-mute/70">{meta.unit || '—'}</span>
                </div>
                <div className="flex h-[86px] items-center justify-center">
                  <NormSymbolTile kind={kind} color={color} size={78} />
                </div>
                <p className="truncate text-[11.5px] font-medium">{meta.label}</p>
                <p className="mt-0.5 line-clamp-2 text-[9.5px] leading-snug text-fg-mute">{meta.hint}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="panel mt-8 p-4">
        <p className="text-[12px] font-semibold">Comment les symboles sont utilisés</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[
            {
              title: 'Build Box',
              body: 'La palette du studio affiche ces mêmes SVG en tuiles carrées, groupées par famille.',
            },
            {
              title: 'Grille & export',
              body: 'Le canvas et les exports PNG/SVG/HTML partagent la même géométrie -50 → +50, donc rien ne se décale.',
            },
            {
              title: 'Atelier Angular',
              body: 'Le client Angular redessine le même répertoire de symboles pour rester visuellement identique.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-lg border border-line/40 bg-ink-950/50 p-2.5">
              <p className="text-[11.5px] font-medium text-fg-soft">{item.title}</p>
              <p className="mt-1 text-[10.5px] leading-relaxed text-fg-mute">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
