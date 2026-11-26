'use client';

import { COMPONENT_META } from '@/lib/engine/types';

type Accent = 'cyan' | 'violet' | 'amber' | 'green' | 'coral' | 'blue' | 'pink';

const ACCENT: Record<Accent, { main: string; alt: string; glow: string }> = {
  cyan: { main: '#38e1e6', alt: '#4f9dff', glow: 'rgba(56,225,230,.35)' },
  violet: { main: '#a479ff', alt: '#ff79c6', glow: 'rgba(164,121,255,.35)' },
  amber: { main: '#ffc266', alt: '#ff9b6b', glow: 'rgba(255,194,102,.32)' },
  green: { main: '#46e6a0', alt: '#38e1e6', glow: 'rgba(70,230,160,.32)' },
  coral: { main: '#ff7d6b', alt: '#ffc266', glow: 'rgba(255,125,107,.32)' },
  blue: { main: '#4f9dff', alt: '#a479ff', glow: 'rgba(79,157,255,.35)' },
  pink: { main: '#ff79c6', alt: '#a479ff', glow: 'rgba(255,121,198,.32)' },
};

/**
 * Vignette de bibliothèque : contour néon (cercle / hexagone / écusson)
 * autour d'un symbole électrique réel — déclinaison des tuiles de référence.
 */
export function TileGlyph({
  shape,
  accent,
  kind,
  size = 96,
  muted = false,
}: {
  shape: 'circle' | 'hex' | 'shield' | 'badge';
  accent: Accent;
  kind: keyof typeof COMPONENT_META;
  size?: number;
  muted?: boolean;
}) {
  const tone = ACCENT[accent];
  const stroke = muted ? 'rgba(140,160,190,.5)' : tone.main;
  const alt = muted ? 'rgba(110,130,160,.4)' : tone.alt;
  const id = `${shape}-${accent}-${kind}`;

  const outline = (() => {
    switch (shape) {
      case 'hex':
        return <polygon points="50,6 92,28 92,72 50,94 8,72 8,28" fill="none" stroke={stroke} strokeWidth="2.4" />;
      case 'shield':
        return (
          <path
            d="M50 6 L88 20 V52 C88 74 70 88 50 94 C30 88 12 74 12 52 V20 Z"
            fill="none"
            stroke={stroke}
            strokeWidth="2.4"
          />
        );
      case 'badge':
        return (
          <>
            <circle cx="50" cy="50" r="42" fill="none" stroke={stroke} strokeWidth="2.4" />
            <path d="M50 2 l6 12 -6 5 -6 -5 z" fill={alt} opacity=".8" />
            <path d="M50 98 l6 -12 -6 -5 -6 5 z" fill={alt} opacity=".8" />
            <path d="M2 50 l12 6 5 -6 -5 -6 z" fill={alt} opacity=".8" />
            <path d="M98 50 l-12 6 -5 -6 5 -6 z" fill={alt} opacity=".8" />
          </>
        );
      default:
        return <circle cx="50" cy="50" r="42" fill="none" stroke={stroke} strokeWidth="2.4" />;
    }
  })();

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden className="shrink-0">
      <defs>
        <filter id={`glow-${id}`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id={`fill-${id}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={tone.main} stopOpacity={muted ? 0.03 : 0.13} />
          <stop offset="100%" stopColor={tone.main} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="49" fill={`url(#fill-${id})`} />
      <g filter={`url(#glow-${id})`} opacity={muted ? 0.55 : 1}>
        {outline}
        <InnerSymbol kind={kind} color={stroke} accent={alt} />
      </g>
    </svg>
  );
}

function InnerSymbol({ kind, color, accent }: { kind: keyof typeof COMPONENT_META; color: string; accent: string }) {
  const s = { stroke: color, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const };
  switch (kind) {
    case 'vsource':
      return (
        <g {...s}>
          <line x1="24" y1="46" x2="34" y2="46" />
          <line x1="66" y1="46" x2="76" y2="46" />
          <circle cx="50" cy="46" r="13" />
          <line x1="50" y1="39" x2="50" y2="53" />
          <line x1="43" y1="46" x2="57" y2="46" />
          <line x1="30" y1="66" x2="70" y2="66" stroke={accent} strokeWidth="1.2" opacity=".7" />
        </g>
      );
    case 'isource':
      return (
        <g {...s}>
          <line x1="24" y1="46" x2="34" y2="46" />
          <line x1="66" y1="46" x2="76" y2="46" />
          <circle cx="50" cy="46" r="13" />
          <line x1="50" y1="54" x2="50" y2="39" />
          <path d="M45 42 l5 -4 5 4" />
        </g>
      );
    case 'resistor':
      return (
        <g {...s}>
          <line x1="22" y1="50" x2="32" y2="50" />
          <line x1="68" y1="50" x2="78" y2="50" />
          <polyline points="32,50 36,42 42,58 48,42 54,58 60,42 66,50" />
        </g>
      );
    case 'inductor':
      return (
        <g {...s}>
          <line x1="22" y1="60" x2="78" y2="60" />
          <path d="M28 60 q 0 -14 8 -14 q 8 0 8 14 q 0 -14 8 -14 q 8 0 8 14 q 0 -14 8 -14 q 8 0 8 14" />
        </g>
      );
    case 'capacitor':
      return (
        <g {...s}>
          <line x1="22" y1="50" x2="44" y2="50" />
          <line x1="56" y1="50" x2="78" y2="50" />
          <line x1="44" y1="38" x2="44" y2="62" />
          <line x1="56" y1="38" x2="56" y2="62" />
        </g>
      );
    case 'wire':
      return (
        <g {...s}>
          <line x1="22" y1="50" x2="78" y2="50" />
          <circle cx="22" cy="50" r="2.6" fill={color} />
          <circle cx="78" cy="50" r="2.6" fill={color} />
        </g>
      );
    default:
      return (
        <g {...s}>
          <line x1="26" y1="50" x2="74" y2="50" />
          <circle cx="50" cy="50" r="11" />
        </g>
      );
  }
}
