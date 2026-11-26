'use client';

import { useMemo } from 'react';
import { Point } from '@/lib/studio/geometry';

/**
 * Animation des électrons le long d'une branche, via offset-path SVG.
 * La vitesse et le sens sont dérivés du courant calculé par le solveur.
 */
export function ElectronFlow({
  from,
  to,
  current,
  enabled,
  speed = 1,
  color = '#38e1e6',
  count = 4,
  wireId,
}: {
  from: Point;
  to: Point;
  current: number | null;
  enabled: boolean;
  speed?: number;
  color?: string;
  count?: number;
  wireId: string;
}) {
  const len = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
  const path = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

  const dots = useMemo(() => Array.from({ length: count }, (_, i) => i), [count]);

  if (!enabled || !current || !Number.isFinite(current) || Math.abs(current) < 1e-12) {
    return null;
  }

  const magnitude = Math.abs(current);
  const reference = 0.02;
  const ratio = Math.min(Math.max(Math.log10(magnitude / reference + 2) / 2, 0.35), 2.2);
  const duration = Math.max(0.45, Math.min(6, 2.4 / (ratio * speed)));
  const reversed = current < 0;
  const tail = Math.min(len * 0.24, 14);

  return (
    <g pointerEvents="none">
      <path
        id={`${wireId}-flow`}
        d={path}
        fill="none"
        stroke="none"
        style={{ offsetPath: `path("${reversed ? `M ${to.x} ${to.y} L ${from.x} ${from.y}` : path}")` }}
      />
      {dots.map((i) => {
        const delay = (duration / count) * i;
        return (
          <circle
            key={`${wireId}-${i}`}
            r={2.4}
            fill={color}
            className="electron"
            style={{
              offsetPath: `path("${reversed ? `M ${to.x} ${to.y} L ${from.x} ${from.y}` : path}")`,
              animationDuration: `${duration}s`,
              animationDelay: `-${delay}s`,
              opacity: 0.95,
              filter: `drop-shadow(0 0 ${3 + tail / 8}px ${color})`,
            }}
          />
        );
      })}
    </g>
  );
}

/** Halo lumineux proportionnel au courant (effet « fil sous tension ») */
export function WireGlow({
  from,
  to,
  intensity,
  color = '#38e1e6',
}: {
  from: Point;
  to: Point;
  intensity: number;
  color?: string;
}) {
  if (intensity <= 0.02) return null;
  return (
    <line
      x1={from.x}
      y1={from.y}
      x2={to.x}
      y2={to.y}
      stroke={color}
      strokeWidth={6}
      strokeLinecap="round"
      opacity={Math.min(0.28, intensity * 0.25)}
      pointerEvents="none"
      style={{ filter: 'blur(4px)' }}
    />
  );
}
