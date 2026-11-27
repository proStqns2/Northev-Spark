'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/**
 * Briques de tracé partagées par le laboratoire : grille, axes, courbes.
 * Tout est en SVG pur — aucun canvas, donc net sur tous les écrans et
 * sélectionnable au clavier pour les réglages.
 */

export interface Point {
  x: number;
  y: number;
}

export function PlotFrame({
  width = 520,
  height = 260,
  padding = { top: 16, right: 18, bottom: 30, left: 46 },
  children,
  yLabel,
  xLabel,
  className,
}: {
  width?: number;
  height?: number;
  padding?: { top: number; right: number; bottom: number; left: number };
  children: (inner: { w: number; h: number; x: (value: number) => number; y: (value: number) => number }) => React.ReactNode;
  yLabel?: string;
  xLabel?: string;
  className?: string;
}) {
  const w = width - padding.left - padding.right;
  const h = height - padding.top - padding.bottom;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={cn('w-full select-none', className)}
      role="img"
      aria-label={`${yLabel ?? 'courbe'} en fonction de ${xLabel ?? 'x'}`}
    >
      <g transform={`translate(${padding.left},${padding.top})`}>
        {children({
          w,
          h,
          x: (value) => value * w,
          y: (value) => h - value * h,
        })}
      </g>
      {xLabel ? (
        <text x={width - padding.right} y={height - 8} textAnchor="end" fontSize={9.5} fill="rgba(255,255,255,0.45)">
          {xLabel}
        </text>
      ) : null}
      {yLabel ? (
        <text x={10} y={padding.top + 4} fontSize={9.5} fill="rgba(255,255,255,0.45)">
          {yLabel}
        </text>
      ) : null}
    </svg>
  );
}

export function Grid({
  w,
  h,
  cols = 10,
  rows = 6,
  dashed = false,
}: {
  w: number;
  h: number;
  cols?: number;
  rows?: number;
  dashed?: boolean;
}) {
  return (
    <g>
      {Array.from({ length: cols + 1 }, (_, index) => (
        <line
          key={`v${index}`}
          x1={(index / cols) * w}
          y1={0}
          x2={(index / cols) * w}
          y2={h}
          stroke="rgba(255,255,255,0.055)"
          strokeDasharray={dashed ? '2 4' : undefined}
        />
      ))}
      {Array.from({ length: rows + 1 }, (_, index) => (
        <line
          key={`h${index}`}
          x1={0}
          y1={(index / rows) * h}
          x2={w}
          y2={(index / rows) * h}
          stroke="rgba(255,255,255,0.055)"
          strokeDasharray={dashed ? '2 4' : undefined}
        />
      ))}
      <rect x={0} y={0} width={w} height={h} fill="none" stroke="rgba(255,255,255,0.12)" />
    </g>
  );
}

/** Courbe lissée à partir d'un échantillonnage. */
export function Curve({
  points,
  color = '#38e1e6',
  width = 1.8,
  dashed = false,
  glow = true,
}: {
  points: Point[];
  color?: string;
  width?: number;
  dashed?: boolean;
  glow?: boolean;
}) {
  const path = useMemo(() => {
    if (!points.length) return '';
    return points
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(' ');
  }, [points]);

  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeDasharray={dashed ? '5 4' : undefined}
      strokeLinecap="round"
      style={glow ? { filter: `drop-shadow(0 0 4px ${color}88)` } : undefined}
    />
  );
}

/** Aire sous une courbe (utile pour l'énergie). */
export function Area({ points, w, h, color = 'rgba(56,225,230,0.14)' }: { points: Point[]; w: number; h: number; color?: string }) {
  if (!points.length) return null;
  const path = `M0,${h} ${points.map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')} L${w},${h} Z`;
  return <path d={path} fill={color} />;
}

/** Curseur vertical avec étiquette. */
export function Cursor({ x, h, label, color = '#ffc266' }: { x: number; h: number; label: string; color?: string }) {
  return (
    <g>
      <line x1={x} y1={0} x2={x} y2={h} stroke={color} strokeDasharray="3 3" strokeWidth={1} />
      <text x={x} y={-4} textAnchor="middle" fontSize={9} fill={color}>
        {label}
      </text>
    </g>
  );
}

/** Échelle graduée en décibels ou en unités arbitraires. */
export function AxisLabels({
  w,
  h,
  values,
  axis = 'y',
  format = (value: number) => String(value),
}: {
  w: number;
  h: number;
  values: number[];
  axis?: 'x' | 'y';
  format?: (value: number) => string;
}) {
  return (
    <g>
      {values.map((value, index) => {
        const ratio = values.length > 1 ? index / (values.length - 1) : 0;
        if (axis === 'y') {
          return (
            <text key={`y${value}`} x={-6} y={h - ratio * h + 3} textAnchor="end" fontSize={8.5} fill="rgba(255,255,255,0.4)">
              {format(value)}
            </text>
          );
        }
        return (
          <text key={`x${value}`} x={ratio * w} y={h + 12} textAnchor="middle" fontSize={8.5} fill="rgba(255,255,255,0.4)">
            {format(value)}
          </text>
        );
      })}
    </g>
  );
}
