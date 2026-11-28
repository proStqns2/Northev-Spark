'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Zap } from 'lucide-react';
import { EquivalentResult } from '@/lib/engine/equivalent';
import { formatPhasor, formatSI } from '@/lib/engine/format';
import { abs } from '@/lib/engine/complex';
import { loadEquivalent } from '@/lib/engine/load';
import { NormSymbol, NormSymbolDefs } from './symbols/NormSymbol';

/**
 * Schéma équivalent dessiné : Thévenin (E_th en série avec Z_th) et
 * Norton (I_N en parallèle avec Z_N = Z_th), entre les bornes A et B.
 *
 * Le dessin est en SVG pur, aux couleurs de l'interface. Il est construit à
 * partir des seuls U_th / Z_th / I_N issus du solveur : aucune valeur n'est
 * inventée, et un résultat non calculable affiche un état vide explicite.
 */

const CYAN = 'rgb(var(--spark-cyan))';
const VIOLET = 'rgb(var(--spark-violet))';
const AMBER = 'rgb(var(--spark-amber))';
const MUTE = 'rgb(var(--fg-mute))';
const SOFT = 'rgb(var(--fg-soft))';

function Terminal({ x, y, label, color }: { x: number; y: number; label: string; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={3.4} fill={color} />
      <circle cx={x} cy={y} r={6.4} fill="none" stroke={color} strokeWidth={1} opacity={0.4} />
      <text x={x} y={y - 12} textAnchor="middle" fontSize={9.5} fontWeight={600} fill={color} fontFamily="var(--font-mono)">
        {label}
      </text>
    </g>
  );
}

function ValueTag({
  x,
  y,
  label,
  value,
  color,
}: {
  x: number;
  y: number;
  label: string;
  value: string;
  color: string;
}) {
  const width = Math.max(label.length, value.length) * 5.5 + 12;
  return (
    <g>
      <rect x={x - width / 2} y={y - 9} width={width} height={20} rx={4} fill="rgb(var(--ink-950) / 0.72)" stroke={color} strokeOpacity={0.35} />
      <text x={x} y={y - 1.5} textAnchor="middle" fontSize={7} fill={color} fontFamily="var(--font-mono)" opacity={0.85}>
        {label}
      </text>
      <text x={x} y={y + 7.5} textAnchor="middle" fontSize={9} fontWeight={600} fill="rgb(var(--fg))" fontFamily="var(--font-mono)">
        {value}
      </text>
    </g>
  );
}

/** un dipôle vertical dessiné de (x, yTop) à (x, yBottom) */
function VerticalDipole({
  x,
  yTop,
  yBottom,
  kind,
  color,
  bare,
}: {
  x: number;
  yTop: number;
  yBottom: number;
  kind: 'vsource' | 'resistor';
  color: string;
  bare?: boolean;
}) {
  const mid = (yTop + yBottom) / 2;
  return (
    <g>
      <line x1={x} y1={yTop} x2={x} y2={mid - 22} stroke={color} strokeWidth={1.8} />
      <line x1={x} y1={mid + 22} x2={x} y2={yBottom} stroke={color} strokeWidth={1.8} />
      <g transform={`translate(${x} ${mid}) rotate(-90)`}>
        <NormSymbol kind={kind} color={color} bare={bare} />
      </g>
    </g>
  );
}

export function EquivalentSchematic({
  equivalent,
  regime,
}: {
  equivalent: EquivalentResult;
  regime: 'dc' | 'ac';
}) {
  // Charge R_L branchée entre A et B (simulateur de transfert de puissance).
  // Curseur logarithmique : R_L de 0,1 Ω à 1 MΩ.
  const [rlLog, setRlLog] = useState(2.7); // ≈ 500 Ω par défaut
  const rl = useMemo(() => Math.pow(10, rlLog), [rlLog]);

  // Quand le circuit change, on recale la charge sur |Z_th| : l'adaptation
  // (transfert maximal) est le point de départ le plus parlant.
  const zthRef = useRef<number | null>(null);
  useEffect(() => {
    if (!equivalent.ok) return;
    const magnitude = abs(equivalent.rth);
    if (!Number.isFinite(magnitude) || magnitude <= 0) return;
    const previous = zthRef.current;
    if (previous !== null && Math.abs(previous - magnitude) / magnitude < 0.01) return;
    zthRef.current = magnitude;
    setRlLog(Math.min(6, Math.max(-1, Math.log10(magnitude))));
  }, [equivalent]);

  const load = useMemo(() => {
    if (!equivalent.ok) return null;
    return loadEquivalent(equivalent.vth, equivalent.rth, rl);
  }, [equivalent, rl]);

  if (!equivalent.ok) {
    return (
      <div className="flex h-[150px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line/70 bg-ink-850/40 text-center">
        <ArrowLeftRight size={18} className="text-fg-mute/70" />
        <p className="text-[11px] font-medium text-fg-soft">Schéma équivalent en attente</p>
        <p className="max-w-[240px] text-[10px] leading-relaxed text-fg-mute">
          Posez des dipôles, la masse, puis les bornes A et B. Le schéma apparaît dès que le
          solveur converge.
        </p>
      </div>
    );
  }

  const vth = formatPhasor(equivalent.vth);
  const zth = `${formatSI(abs(equivalent.rth), 'Ω', { digits: 4 })}`;
  const zthAngle = (Math.atan2(equivalent.rth.im, equivalent.rth.re) * 180) / Math.PI;
  const zthLabel = Math.abs(zthAngle) > 0.05 ? `${zth} ∠${zthAngle.toFixed(0)}°` : zth;
  const inorton = Number.isFinite(abs(equivalent.inorton))
    ? formatSI(abs(equivalent.inorton), 'A', { digits: 4 })
    : '∞';

  return (
    <div className="rounded-xl border border-line/50 bg-ink-850/45 p-2">
      <div className="mb-1 flex items-center justify-between px-0.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-fg-soft">
          Schéma équivalent
        </p>
        <span className="rounded-full border border-line/60 px-1.5 py-0.5 font-mono text-[9px] text-fg-mute">
          {regime === 'dc' ? 'continu' : 'sinusoïdal'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* ---------------------------------------------- Thévenin */}
        <figure className="rounded-lg border border-spark-cyan/25 bg-ink-950/40 p-1">
          <svg viewBox="0 0 132 128" className="h-[112px] w-full">
            <NormSymbolDefs />
            {/* rails A (haut) et B (bas) */}
            <line x1={30} y1={16} x2={104} y2={16} stroke={CYAN} strokeWidth={1.8} />
            <line x1={30} y1={112} x2={104} y2={112} stroke={CYAN} strokeWidth={1.8} />
            {/* branche de gauche : source E_th + Z_th en série */}
            <VerticalDipole x={30} yTop={16} yBottom={44} kind="vsource" color={CYAN} />
            <VerticalDipole x={30} yTop={44} yBottom={72} kind="resistor" color={VIOLET} bare />
            <line x1={30} y1={72} x2={30} y2={112} stroke={CYAN} strokeWidth={1.8} />
            {/* branche de droite : charge R_L */}
            <VerticalDipole x={104} yTop={16} yBottom={112} kind="resistor" color={AMBER} />
            {/* bornes */}
            <Terminal x={30} y={16} label="A" color={CYAN} />
            <Terminal x={30} y={112} label="B" color={CYAN} />
            <ValueTag x={67} y={46} label="E_th" value={vth} color={CYAN} />
            <ValueTag x={67} y={90} label="Z_th" value={zthLabel} color={VIOLET} />
            <ValueTag x={104} y={64} label="R_L" value={formatSI(rl, 'Ω', { digits: 3 })} color={AMBER} />
          </svg>
          <figcaption className="mt-0.5 text-center text-[9.5px] font-semibold text-spark-cyan">
            Thévenin + charge
          </figcaption>
        </figure>

        {/* ---------------------------------------------- Norton */}
        <figure className="rounded-lg border border-spark-amber/25 bg-ink-950/40 p-1">
          <svg viewBox="0 0 132 128" className="h-[112px] w-full">
            <NormSymbolDefs />
            {/* nœud haut A et nœud bas B reliés par deux branches parallèles */}
            <line x1={24} y1={16} x2={108} y2={16} stroke={AMBER} strokeWidth={1.8} />
            <line x1={24} y1={112} x2={108} y2={112} stroke={AMBER} strokeWidth={1.8} />
            <Terminal x={24} y={16} label="A" color={AMBER} />
            <Terminal x={24} y={112} label="B" color={AMBER} />
            <line x1={24} y1={16} x2={24} y2={112} stroke={AMBER} strokeWidth={1.8} strokeOpacity={0.35} strokeDasharray="3 4" />
            <VerticalDipole x={58} yTop={16} yBottom={112} kind="vsource" color={AMBER} />
            <VerticalDipole x={92} yTop={16} yBottom={112} kind="resistor" color={VIOLET} bare />
            <ValueTag x={66} y={62} label="I_N" value={inorton} color={AMBER} />
            <ValueTag x={66} y={88} label="Z_N" value={zthLabel} color={VIOLET} />
          </svg>
          <figcaption className="mt-0.5 text-center text-[9.5px] font-semibold text-spark-amber">
            Norton
          </figcaption>
        </figure>
      </div>

      {/* --------------------------------- simulateur de charge R_L */}
      {load && (
        <div className="mt-2 rounded-lg border border-spark-amber/25 bg-ink-950/40 p-2">
          <div className="mb-1.5 flex items-center justify-between">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-spark-amber">
              <Zap size={11} /> Charge R<sub>L</sub>
            </p>
            <span className="font-mono text-[11px] font-semibold text-fg">
              {formatSI(rl, 'Ω', { digits: 3 })}
            </span>
          </div>
          <input
            type="range"
            min={-1}
            max={6}
            step={0.05}
            value={rlLog}
            onChange={(e) => setRlLog(Number(e.target.value))}
            className="w-full accent-amber-400"
            aria-label="Résistance de charge R_L"
          />
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 text-center">
            <div className="rounded-md bg-ink-900/60 px-1 py-1">
              <p className="font-mono text-[8.5px] uppercase tracking-wide text-fg-mute">U_L</p>
              <p className="font-mono text-[11px] font-semibold text-spark-cyan">{formatPhasor(load.uL)}</p>
            </div>
            <div className="rounded-md bg-ink-900/60 px-1 py-1">
              <p className="font-mono text-[8.5px] uppercase tracking-wide text-fg-mute">I_L</p>
              <p className="font-mono text-[11px] font-semibold text-spark-amber">{formatPhasor(load.iL, 'A')}</p>
            </div>
            <div className="rounded-md bg-ink-900/60 px-1 py-1">
              <p className="font-mono text-[8.5px] uppercase tracking-wide text-fg-mute">P_L</p>
              <p className="font-mono text-[11px] font-semibold text-emerald-400">
                {formatSI(load.pL, 'W', { digits: 3 })}
              </p>
            </div>
          </div>
          <p className="mt-1.5 text-center text-[9px] leading-relaxed text-fg-mute">
            {load.atMax ? (
              <span className="font-semibold text-emerald-400">
                R_L ≈ |Z_th| : transfert maximal (P_max = {formatSI(load.pMax, 'W', { digits: 3 })})
              </span>
            ) : (
              <>
                U<sub>L</sub> = U<sub>th</sub> · R<sub>L</sub> / (Z<sub>th</sub> + R<sub>L</sub>) · P_max ={' '}
                {formatSI(load.pMax, 'W', { digits: 3 })} à R<sub>L</sub> = {formatSI(load.zthMagnitude, 'Ω', { digits: 3 })}
              </>
            )}
          </p>
        </div>
      )}

      <p className="mt-1.5 px-0.5 text-center text-[9.5px] leading-relaxed text-fg-mute">
        Z<sub>N</sub> = Z<sub>th</sub> · E<sub>th</sub> = Z<sub>th</sub> · I<sub>N</sub>
      </p>
    </div>
  );
}
