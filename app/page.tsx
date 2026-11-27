import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  CircuitBoard,
  Cloud,
  Cpu,
  FileCode2,
  Gauge,
  Layers,
  LineChart,
  Share2,
  Sigma,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react';
import { TEMPLATES, FAMILY_LABEL } from '@/lib/data/templates';
import { TileGlyph } from '@/components/marketing/TileGlyph';
import { CircuitThumbnail } from '@/components/studio/CircuitCanvas';
import { cachedEquivalent } from '@/lib/cache';
import { formatSI, formatPhasor } from '@/lib/engine/format';
import { abs } from '@/lib/engine/complex';

export default function HomePage() {
  const showcase = TEMPLATES.slice(0, 5).map((t) => {
    const doc = t.build();
    const eq = cachedEquivalent(doc);
    return {
      template: t,
      doc,
      vth: eq.ok ? formatPhasor(eq.vth) : '—',
      rth: eq.ok ? formatSI(abs(eq.rth), 'Ω') : '—',
    };
  });

  const rowTwo = TEMPLATES.slice(5, 10).map((t) => {
    const doc = t.build();
    const eq = cachedEquivalent(doc);
    return {
      template: t,
      doc,
      vth: eq.ok ? formatPhasor(eq.vth) : '—',
      rth: eq.ok ? formatSI(abs(eq.rth), 'Ω') : '—',
    };
  });

  return (
    <div className="relative overflow-hidden">
      {/* ------------------------------------------------------------------ HERO */}
      <section className="relative mx-auto max-w-[1500px] px-4 pb-16 pt-14 sm:px-6 sm:pt-20">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-radial" />
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_.95fr]">
          <div className="animate-fade-up">
            <span className="chip border-spark-cyan/40 bg-spark-cyan/[0.08] text-spark-cyan">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-spark-cyan" />
              Studio d’électrotechnique · collaboration temps réel
            </span>
            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-[58px]">
              Un montage sur la grille,
              <br />
              son équivalent{' '}
              <span className="bg-gradient-to-r from-spark-cyan via-spark-blue to-spark-violet bg-clip-text text-transparent glow-text">
                Thévenin / Norton
              </span>
              <br />
              calculé pour de vrai.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-fg-soft">
              Northev Spark reconstruit le geste du laboratoire : posez vos dipôles sur une grille aimantée,
              visualisez les électrons, puis laissez l’analyse nodale modifiée extraire
              <span className="text-fg"> U_th, Z_th et I_N </span>
              avec vérification croisée par court-circuit. Travaillez à plusieurs avec un code à 5 chiffres.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/studio" className="btn btn-primary">
                <Zap size={16} /> Ouvrir le studio
              </Link>
              <Link href="/bibliotheque" className="btn">
                <Layers size={16} /> Explorer les {TEMPLATES.length} montages
              </Link>
              <Link href="/agents" className="btn btn-ghost text-spark-violet">
                <Sparkles size={16} /> Agents IA <ArrowRight size={14} />
              </Link>
            </div>

            <dl className="mt-9 grid max-w-lg grid-cols-3 gap-4 border-t border-line/60 pt-5">
              {[
                { label: 'Moteur', value: 'MNA exact', sub: 'contin./sinusoïdal' },
                { label: 'Montages', value: String(TEMPLATES.length), sub: 'validés analytiquement' },
                { label: 'Collaboratif', value: '5 chiffres', sub: 'code d’atelier' },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.14em] text-fg-mute">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tracking-tight text-fg">{item.value}</dd>
                  <dd className="text-[11px] text-fg-mute">{item.sub}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* aperçu : le diviseur de tension */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <div className="panel relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-spark-coral/80" />
                  <span className="h-2 w-2 rounded-full bg-spark-amber/80" />
                  <span className="h-2 w-2 rounded-full bg-spark-green/80" />
                  <span className="ml-2 font-mono text-[10.5px] text-fg-mute">studio · diviseur-thevenin.circ</span>
                </div>
                <span className="chip border-spark-green/30 bg-spark-green/10 text-spark-green">
                  <span className="h-1 w-1 rounded-full bg-spark-green" /> en direct
                </span>
              </div>
              <div className="relative canvas-grid bg-ink-950/50">
                <div className="h-[260px] p-2">
                  <CircuitThumbnail doc={showcase[0].doc} />
                </div>
              </div>
              <div className="grid grid-cols-3 divide-x divide-line/60 border-t border-line/60">
                {[
                  { label: 'U_th', value: showcase[0].vth, tone: 'text-spark-cyan' },
                  { label: 'Z_th', value: showcase[0].rth, tone: 'text-spark-violet' },
                  { label: 'I_N', value: '12 mA', tone: 'text-spark-amber' },
                ].map((metric) => (
                  <div key={metric.label} className="px-3 py-2.5">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-fg-mute">{metric.label}</p>
                    <p className={`font-mono text-[13px] ${metric.tone}`}>{metric.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 border-t border-line/60 px-4 py-2">
                <span className="chip">E = 12 V</span>
                <span className="chip">R₁ = R₂ = 1 kΩ</span>
                <Link href="/studio?template=thevenin-serie" className="ml-auto flex items-center gap-1 text-[11px] text-spark-cyan hover:underline">
                  ouvrir <ArrowUpRight size={11} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- BIBLIOTHÈQUE */}
      <section className="mx-auto max-w-[1500px] px-4 pb-14 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="label-xs">Bibliothèque de montages</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">
              Dix familles, dix équivalents
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] text-fg-soft">
              Chaque tuile est un montage réel, résolu par le moteur : la valeur affichée est calculée au chargement de
              la page, pas décorative.
            </p>
          </div>
          <Link href="/bibliotheque" className="btn btn-sm">
            Voir la bibliothèque <ArrowRight size={13} />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {showcase.map((item) => (
            <Link
              key={item.template.slug}
              href={`/studio?template=${item.template.slug}`}
              className="group panel card-hover overflow-hidden"
            >
              <div className="relative flex h-32 items-center justify-center border-b border-line/50 bg-ink-950/60">
                <div className="scale-90 transition duration-500 group-hover:scale-100">
                  <TileGlyph
                    shape={item.template.shape}
                    accent={item.template.accent}
                    kind={
                      item.template.family === 'impedances'
                        ? 'inductor'
                        : item.template.family === 'sources'
                          ? 'isource'
                          : item.template.family === 'dipoles'
                            ? 'resistor'
                            : 'vsource'
                    }
                    size={92}
                  />
                </div>
                <span className="absolute right-2 top-2 rounded border border-line/60 bg-ink-900/80 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-fg-mute">
                  {item.template.regime}
                </span>
              </div>
              <div className="p-3">
                <p className="text-[12.5px] font-semibold leading-tight">{item.template.title}</p>
                <p className="mt-0.5 text-[10.5px] text-fg-mute">{item.template.subtitle}</p>
                <div className="mt-2 flex items-center justify-between border-t border-line/40 pt-2 font-mono text-[9.5px]">
                  <span className="text-spark-cyan">U_th {item.vth}</span>
                  <span className="text-fg-mute">Z_th {item.rth}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {rowTwo.map((item) => (
            <Link
              key={item.template.slug}
              href={`/studio?template=${item.template.slug}`}
              className="group panel card-hover overflow-hidden"
            >
              <div className="relative flex h-32 items-center justify-center border-b border-line/50 bg-ink-950/60">
                <div className="scale-90 transition duration-500 group-hover:scale-100">
                  <TileGlyph
                    shape={item.template.shape}
                    accent={item.template.accent}
                    kind={
                      item.template.family === 'sources'
                        ? 'vsource'
                        : item.template.family === 'labo'
                          ? 'resistor'
                          : item.template.family === 'ponts'
                            ? 'resistor'
                            : 'capacitor'
                    }
                    size={92}
                  />
                </div>
                <span className="absolute right-2 top-2 rounded border border-line/60 bg-ink-900/80 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-fg-mute">
                  {FAMILY_LABEL[item.template.family]}
                </span>
              </div>
              <div className="p-3">
                <p className="text-[12.5px] font-semibold leading-tight">{item.template.title}</p>
                <p className="mt-0.5 text-[10.5px] text-fg-mute">{item.template.subtitle}</p>
                <div className="mt-2 flex items-center justify-between border-t border-line/40 pt-2 font-mono text-[9.5px]">
                  <span className="text-spark-cyan">U_th {item.vth}</span>
                  <span className="text-fg-mute">Z_th {item.rth}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------- FEATURES */}
      <section className="mx-auto max-w-[1500px] px-4 pb-16 sm:px-6">
        <div className="grid gap-3 lg:grid-cols-3">
          {[
            {
              icon: CircuitBoard,
              title: 'Grille de montage magnétique',
              body: 'Palette de 13 dipôles, accrochage aux nœuds, rotation, inversion, interrupteurs. Les fils fusionnent les nœuds automatiquement.',
              accent: 'text-spark-cyan',
            },
            {
              icon: Sigma,
              title: 'MNA complexe, vérifié',
              body: 'Analyse nodale modifiée en continu et en sinusoïdal. Chaque équivalent est recoupé par un court-circuit simulé entre A et B.',
              accent: 'text-spark-violet',
            },
            {
              icon: Users,
              title: 'Multiwork à 5 chiffres',
              body: 'Ouvrez un atelier, partagez le code, le réseau se synchronise en temps réel avec présence et chat.',
              accent: 'text-spark-amber',
            },
            {
              icon: Cpu,
              title: '11 agents exécutables',
              body: 'Théo, Nora, Équivalence, Impéda, Bobines, Sources, Labo, Hub, Dipôles, Volt, Mentor. Chacun calcule sur le serveur, sans clé d’API.',
              accent: 'text-spark-green',
            },
            {
              icon: Cloud,
              title: 'Historique Supabase',
              body: 'Comptes, montages et versions conservés. Revenez sur un projet, retrouvez ses résultats et ses collaborateurs.',
              accent: 'text-spark-blue',
            },
            {
              icon: FileCode2,
              title: 'Export PNG · SVG · HTML · JSON',
              body: 'Cartouche de résultats intégré au dessin, rapport Markdown et invitation PNG avec code d’atelier.',
              accent: 'text-spark-coral',
            },
          ].map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="panel p-5 transition hover:border-line">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line/60 bg-ink-850 ${feature.accent}`}>
                  <Icon size={17} />
                </span>
                <h3 className="mt-3 text-[15px] font-semibold">{feature.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-fg-soft">{feature.body}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------- MÉTHODE */}
      <section className="mx-auto max-w-[1500px] px-4 pb-20 sm:px-6">
        <div className="panel relative overflow-hidden p-6 sm:p-9">
          <div className="pointer-events-none absolute inset-0 bg-grid bg-grid-lg opacity-40" />
          <div className="relative">
            <p className="label-xs">Méthode intégrée</p>
            <h2 className="mt-1 max-w-2xl text-2xl font-semibold tracking-tight">
              Du schéma au modèle équivalent, sans boîte noire
            </h2>
            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { step: '01', title: 'Poser', body: 'Tracez le montage et posez la masse ainsi que les bornes A / B du dipôle à modéliser.', icon: CircuitBoard },
                { step: '02', title: 'Résoudre', body: 'Le solveur construit la matrice MNA, fusionne les nœuds et résout le système complexe.', icon: Gauge },
                { step: '03', title: 'Extraire', body: 'Tension à vide, injection de courant de test, court-circuit : U_th, Z_th et I_N apparaissent.', icon: LineChart },
                { step: '04', title: 'Partager', body: 'Enregistrez l’historique, invitez un binôme avec un code à 5 chiffres, exportez le rapport.', icon: Share2 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.step} className="rounded-xl border border-line/60 bg-ink-950/50 p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-spark-cyan">{item.step}</span>
                      <Icon size={14} className="text-fg-mute" />
                    </div>
                    <h3 className="mt-2 text-[14px] font-semibold">{item.title}</h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-fg-mute">{item.body}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------- CTA */}
      <section className="mx-auto max-w-[1500px] px-4 pb-20 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-spark-cyan/25 bg-gradient-to-br from-ink-900 via-ink-850 to-ink-900 p-8 sm:p-12">
          <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-spark-cyan/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-spark-violet/10 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Votre prochain TP commence sur une grille.
              </h2>
              <p className="mt-2 max-w-xl text-[13.5px] leading-relaxed text-fg-soft">
                Créez un compte gratuit, retrouvez vos montages dans l’historique et invitez votre binôme avec un code
                à cinq chiffres. Aucune installation, aucun plugin.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Link href="/compte?mode=inscription" className="btn btn-primary">
                Créer mon compte <ArrowRight size={15} />
              </Link>
              <Link href="/studio?template=hub-equivalence" className="btn">
                Tester le hub complet
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Le bandeau « bâti avec » est monté une seule fois, dans le pied de page
          (components/shell/SiteFooter.tsx) : il suit donc toutes les pages. */}
    </div>
  );
}
