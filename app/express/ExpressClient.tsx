'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Activity,
  ArrowRight,
  Check,
  CircuitBoard,
  Copy,
  ExternalLink,
  Loader2,
  PlugZap,
  Server,
  SlidersHorizontal,
  Terminal,
  Zap,
} from 'lucide-react';
import { ValueBar } from '@/components/studio/ValueBar';
import { KIND_COLORS, SYMBOL_SVG } from '@/lib/studio/symbolSvg';
import { orderedEnds } from '@/lib/studio/geometry';
import type { ValueModel } from '@/lib/express/model';
import { abs } from '@/lib/engine/complex';
import { formatSI } from '@/lib/engine/format';
import { cn } from '@/lib/utils';

/**
 * Page « Service R·C·L » : la barre de valeurs du studio, en grand, avec le
 * montage construit, le tableau U / I / P par branche et la documentation des
 * routes Express. C'est la vitrine du service qui « lead » le montage.
 */

const ROUTES = [
  {
    method: 'POST',
    path: '/api/v1/analyze',
    detail: 'Corps JSON { r, c, l, e, f, regime } ou { values: "R=4,7k C=100n" } → équivalent + indicateurs.',
    sample: `curl -s -X POST http://localhost:4001/api/v1/analyze \\
  -H 'content-type: application/json' \\
  -d '{"values":"R=4,7k C=100n L=10m f=1k"}'`,
  },
  {
    method: 'GET',
    path: '/api/v1/analyze?r=1k&c=100n&l=10m&f=50',
    detail: 'Même calcul en lecture directe, pratique pour un tableur ou un test rapide.',
    sample: 'curl -s "http://localhost:4001/api/v1/analyze?r=1k&c=100n&l=10m&f=50"',
  },
  {
    method: 'POST',
    path: '/api/v1/preview',
    detail: 'Renvoie le SVG du montage construit (image/svg+xml) pour une vignette.',
    sample: `curl -s -X POST http://localhost:4001/api/v1/preview \\
  -H 'content-type: application/json' -d '{"r":1000}' -o montage.svg`,
  },
  {
    method: 'GET',
    path: '/api/v1/values',
    detail: 'Valeurs par défaut, bornes et préfixes SI admis.',
    sample: 'curl -s http://localhost:4001/api/v1/values',
  },
  {
    method: 'GET',
    path: '/api/v1/templates',
    detail: 'Gabarits de la bibliothèque, résolus par le moteur au moment de l’appel.',
    sample: 'curl -s http://localhost:4001/api/v1/templates | jq ".count"',
  },
  {
    method: 'GET',
    path: '/api/v1/health',
    detail: 'État du service, version du moteur, uptime et taille du cache.',
    sample: 'curl -s http://localhost:4001/api/v1/health',
  },
];

function MethodChip({ method }: { method: string }) {
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-[1px] font-mono text-[9px] font-bold uppercase tracking-wider',
        method === 'GET'
          ? 'border-spark-green/40 bg-spark-green/10 text-spark-green'
          : 'border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan',
      )}
    >
      {method}
    </span>
  );
}

export function ExpressClient() {
  const [model, setModel] = useState<ValueModel | null>(null);
  const [health, setHealth] = useState<{ ok: boolean; version?: string; uptimeSec?: number } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* état du service : relayé par Next (fonctionne même si Express est ailleurs) */
  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetch('/api/values/defaults', { cache: 'no-store' })
        .then((r) => r.json())
        .then(() => alive && setHealth({ ok: true }))
        .catch(() => alive && setHealth({ ok: false }));
    };
    tick();
    const interval = setInterval(tick, 15000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const copy = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(null), 1600);
    });
  }, []);

  const metrics = model?.metrics;
  const equivalent = model?.equivalent;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      {/* ------------------------------------------------------------- en-tête */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-xs flex items-center gap-1.5">
            <Server size={12} className="text-spark-green" /> service express · leader du montage
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Barre de valeurs <span className="text-spark-cyan">R</span> ·{' '}
            <span className="text-spark-green">C</span> · <span className="text-spark-violet">L</span>
          </h1>
          <p className="mt-2 max-w-2xl text-[13.5px] leading-relaxed text-fg-soft">
            Saisissez trois valeurs, le service construit un diviseur <strong>R / (L ∥ C)</strong> alimenté par une
            source, le résout par analyse nodale modifiée et renvoie l’équivalent de Thévenin / Norton, la résonance et
            le détail branche par branche. Le même calcul alimente la barre du studio.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'chip',
              health?.ok
                ? 'border-spark-green/40 bg-spark-green/10 text-spark-green'
                : 'border-spark-amber/40 bg-spark-amber/10 text-spark-amber',
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {health === null ? 'vérification…' : health.ok ? 'service joignable' : 'repli moteur Next'}
          </span>
          <Link href="/studio" className="btn btn-sm border-line/60">
            <CircuitBoard size={13} /> Ouvrir le studio
          </Link>
        </div>
      </div>

      {/* -------------------------------------------------------- la barre */}
      <div className="panel mt-5 overflow-hidden">
        <ValueBar
          className="border-b-0"
          onApply={(next) => {
            // le studio sait lire un montage R·C·L passé en URL
            const query = new URLSearchParams({
              values: `R=${next.input.r} C=${next.input.c} L=${next.input.l} E=${next.input.e} f=${next.input.f}`,
            });
            router.push(`/studio?${query.toString()}`);
          }}
        />
      </div>

      {/* --------------------------------------------------- montage + tableau */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5">
            <p className="flex items-center gap-2 text-[12.5px] font-medium">
              <CircuitBoard size={14} className="text-spark-cyan" /> Montage construit
            </p>
            <span className="font-mono text-[10px] text-fg-mute">
              {model?.doc.components.length ?? 0} dipôles · {model?.input.regime === 'ac' ? 'sinusoïdal' : 'continu'}
            </span>
          </div>
          <div className="canvas-grid flex min-h-[280px] items-center justify-center bg-ink-950/50 p-3">
            {model ? (
              <MontageSvg model={model} />
            ) : (
              <span className="flex items-center gap-2 text-[12px] text-fg-mute">
                <Loader2 size={13} className="animate-spin" /> construction du montage…
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 divide-x divide-line/60 border-t border-line/60 sm:grid-cols-4">
            {[
              { label: 'U_th', value: equivalent && formatSI(abs(equivalent.vth), 'V', { digits: 4 }), tone: 'text-spark-cyan' },
              { label: 'Z_th', value: equivalent && formatSI(abs(equivalent.rth), 'Ω', { digits: 4 }), tone: 'text-spark-violet' },
              { label: 'I_N', value: equivalent && formatSI(abs(equivalent.inorton), 'A', { digits: 4 }), tone: 'text-spark-amber' },
              {
                label: 'P_max',
                value: metrics && formatSI(metrics.powerMax ?? NaN, 'W', { digits: 3 }),
                tone: 'text-spark-green',
              },
            ].map((metric) => (
              <div key={metric.label} className="px-3 py-2">
                <p className="font-mono text-[9px] uppercase tracking-wider text-fg-mute">{metric.label}</p>
                <p className={cn('font-mono text-[12.5px]', metric.tone)}>{metric.value ?? '—'}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-line/60 px-4 py-2.5">
            <p className="flex items-center gap-2 text-[12.5px] font-medium">
              <Activity size={14} className="text-spark-green" /> Lectures par branche
            </p>
            <span className="font-mono text-[10px] text-fg-mute">U · I · P</span>
          </div>
          <table className="w-full text-[11.5px]">
            <thead>
              <tr className="border-b border-line/50 text-left font-mono text-[9.5px] uppercase tracking-wider text-fg-mute">
                <th className="px-3 py-1.5">Branche</th>
                <th className="px-2 py-1.5 text-right">U</th>
                <th className="px-2 py-1.5 text-right">I</th>
                <th className="px-3 py-1.5 text-right">P</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {(model?.branches ?? []).map((branch) => (
                <tr key={branch.id} className="border-b border-line/30 last:border-0 hover:bg-ink-800/40">
                  <td className="px-3 py-1.5 text-fg-soft">{branch.label}</td>
                  <td className="px-2 py-1.5 text-right text-fg">{formatSI(branch.voltage, 'V', { digits: 3 })}</td>
                  <td className="px-2 py-1.5 text-right text-fg">{formatSI(branch.current, 'A', { digits: 3 })}</td>
                  <td className="px-3 py-1.5 text-right text-spark-green">
                    {formatSI(branch.power, 'W', { digits: 3 })}
                  </td>
                </tr>
              ))}
              {!model?.branches.length ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-fg-mute">
                    Aucune lecture disponible.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line/60 px-3 py-2 font-mono text-[10px] text-fg-mute">
            <span>
              f₀ <span className="text-fg-soft">{formatSI(metrics?.f0 ?? NaN, 'Hz', { digits: 4 })}</span>
            </span>
            <span>
              Q <span className="text-fg-soft">{metrics?.quality?.toFixed(4).replace('.', ',') ?? '—'}</span>
            </span>
            <span>
              X_L <span className="text-fg-soft">{formatSI(metrics?.xl ?? NaN, 'Ω', { digits: 3 })}</span>
            </span>
            <span>
              X_C <span className="text-fg-soft">{formatSI(metrics?.xc ?? NaN, 'Ω', { digits: 3 })}</span>
            </span>
            <span>
              τ_RC <span className="text-fg-soft">{formatSI(metrics?.tauRC ?? NaN, 's', { digits: 3 })}</span>
            </span>
            <span>
              τ_RL <span className="text-fg-soft">{formatSI(metrics?.tauRL ?? NaN, 's', { digits: 3 })}</span>
            </span>
          </div>
        </section>
      </div>

      {/* ---------------------------------------------------------- l'API */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="label-xs flex items-center gap-1.5">
              <Terminal size={12} className="text-spark-cyan" /> routes du service
            </p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Un seul moteur, deux portes d’entrée</h2>
            <p className="mt-1 max-w-2xl text-[12.5px] text-fg-soft">
              Le site relaie vers Express quand il tourne (<span className="font-mono text-[11px]">EXPRESS_URL</span>),
              et calcule en local sinon — la barre de valeurs ne tombe jamais en panne. En production, lancez{' '}
              <span className="font-mono text-[11px] text-spark-cyan">npm run express:start</span> à côté du site.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="chip">
              <PlugZap size={11} className="text-spark-green" /> port 4001
            </span>
            <span className="chip">
              <SlidersHorizontal size={11} className="text-spark-cyan" /> CORS aperçus + localhost
            </span>
          </div>
        </div>

        <div className="grid gap-2.5 md:grid-cols-2">
          {ROUTES.map((route) => (
            <article key={route.path} className="panel group overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line/50 px-3 py-2">
                <MethodChip method={route.method} />
                <code className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-fg">{route.path}</code>
                <button
                  type="button"
                  onClick={() => copy(route.sample)}
                  className="shrink-0 rounded p-1 text-fg-mute transition hover:text-spark-cyan"
                  aria-label={`Copier l’exemple ${route.path}`}
                >
                  {copied === route.sample ? <Check size={11} className="text-spark-green" /> : <Copy size={11} />}
                </button>
              </div>
              <p className="px-3 pt-2 text-[11.5px] leading-snug text-fg-soft">{route.detail}</p>
              <pre className="mt-2 overflow-x-auto border-t border-line/40 bg-ink-950/70 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-fg-mute">
                {route.sample}
              </pre>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------- appel direct ? */}
      <section className="panel mt-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <Zap size={14} className="text-spark-amber" />
        <p className="min-w-0 flex-1 text-[11.5px] leading-snug text-fg-soft">
          Le navigateur peut aussi appeler Express <strong>directement</strong> : renseignez{' '}
          <code className="text-spark-cyan">NEXT_PUBLIC_EXPRESS_URL</code> (par exemple{' '}
          <code className="text-spark-cyan">https://4001-&lt;sandbox&gt;.e2b.app</code>) et la barre interroge le service
          sans passer par Next. Le badge de la barre indique qui a répondu.
        </p>
        <a
          href="http://localhost:4001"
          target="_blank"
          rel="noreferrer"
          className="btn btn-sm border-spark-cyan/40 bg-spark-cyan/10 text-spark-cyan"
        >
          Documentation du service <ExternalLink size={11} />
        </a>
      </section>

      <p className="mt-6 text-center text-[11px] text-fg-mute">
        Calculs identiques au studio : moteur nodal du dépôt (<span className="font-mono">lib/engine</span>), aucune
        valeur décorative. <Link href="/studio" className="text-spark-cyan hover:underline">Charger dans le studio <ArrowRight size={10} className="inline" /></Link>
      </p>
    </div>
  );
}

/** Dessine le montage construit, avec les mêmes symboles que le canvas. */
function MontageSvg({ model }: { model: ValueModel }) {
  const GRID = 24;
  const points = model.doc.components.flatMap((component) => orderedEnds(component));
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const minY = Math.min(...ys) - 1;
  const maxY = Math.max(...ys) + 1;
  const width = (maxX - minX) * GRID;
  const height = (maxY - minY) * GRID;

  return (
    <svg
      viewBox={`${minX * GRID - GRID} ${minY * GRID - GRID} ${width + GRID * 2} ${height + GRID * 2}`}
      className="h-full max-h-[290px] w-full"
      role="img"
      aria-label="Schéma du montage R, C, L construit par le service"
    >
      {/* nœuds */}
      {[...new Set(model.doc.components.flatMap((component) => [component.a, component.b]))].map((cell) => {
        const [x, y] = cell.split(',').map(Number);
        return <circle key={cell} cx={x * GRID} cy={y * GRID} r={3} fill="#38e1e655" />;
      })}

      {/* dipôles */}
      {model.doc.components.map((component) => {
        const [a, b] = orderedEnds(component);
        const p1 = { x: a.x * GRID, y: a.y * GRID };
        const p2 = { x: b.x * GRID, y: b.y * GRID };
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const length = Math.hypot(p2.x - p1.x, p2.y - p1.y) || GRID;
        const angle = (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
        const color = KIND_COLORS[component.kind] ?? '#8ba0bb';
        const vertical = a.x === b.x;
        return (
          <g key={component.id}>
            <g
              transform={`translate(${mid.x} ${mid.y}) rotate(${angle}) scale(${(length / 100).toFixed(4)})`}
              dangerouslySetInnerHTML={{ __html: SYMBOL_SVG[component.kind](color) }}
            />
            <text
              x={mid.x + (vertical ? 12 : 0)}
              y={mid.y + (vertical ? 0 : -14)}
              fontSize={10}
              fontFamily="monospace"
              fill="#9db0c9"
              textAnchor={vertical ? 'start' : 'middle'}
              dominantBaseline={vertical ? 'middle' : 'auto'}
            >
              {component.label ?? component.id}
            </text>
          </g>
        );
      })}

      {/* bornes A et B */}
      {[
        { cell: model.doc.terminals.a, label: 'A' },
        { cell: model.doc.terminals.b, label: 'B' },
      ].map(({ cell, label }) => {
        if (!cell) return null;
        const [x, y] = cell.split(',').map(Number);
        return (
          <g key={label}>
            <circle cx={x * GRID} cy={y * GRID} r={7} fill="#060b14" stroke="#38e1e6" strokeWidth={1.5} />
            <text x={x * GRID} y={y * GRID + 3.5} fontSize={9} fill="#38e1e6" textAnchor="middle" fontFamily="monospace">
              {label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
