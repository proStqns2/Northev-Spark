'use client';

import type { ComponentKind } from '@/lib/engine/types';

/**
 * Symboles normalisés de l'atelier.
 *
 * Chaque dipôle est dessiné dans un repère local : l'origine est le centre de
 * la pièce, l'axe des x va de la borne A vers la borne B. Le parent applique
 * la rotation. Les symboles restent lisibles à toutes les échelles (traits en
 * unités du SVG, pas en pixels écran).
 */

export interface GlyphProps {
  kind: ComponentKind;
  /** longueur en pixels de grille (48 pour deux cellules) */
  span: number;
  color?: string;
  selected?: boolean;
  ghost?: boolean;
  closed?: boolean;
  ac?: boolean;
  /** valeur affichée sous le symbole */
  value?: string;
}

/** épaisseur apparente à l'écran : `non-scaling-stroke` l'empêche de doubler au zoom */
const STROKE = 2.6;

export function PartGlyph({ kind, span, color = '#38e1e6', selected = false, ghost = false, closed = true, ac = false }: GlyphProps) {
  const half = Math.max(span / 2, 18);
  const inner = Math.max(half - 9, 10);
  const stroke = selected ? '#ecfeff' : color;
  const opacity = ghost ? 0.45 : 1;
  const common = {
    stroke,
    strokeWidth: STROKE,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    opacity,
    vectorEffect: 'non-scaling-stroke' as const,
    style: selected ? { filter: `drop-shadow(0 0 5px ${color})` } : undefined,
  };

  switch (kind) {
    case 'resistor':
      return (
        <g {...common}>
          <line x1={-half} y1={0} x2={-inner} y2={0} />
          <path
            d={`M${-inner},0 l${inner / 3},-7 l${inner / 3},14 l${inner / 3},-14 l${inner / 3},14 l${inner / 3},-14 l${inner / 3},7`}
          />
          <line x1={inner} y1={0} x2={half} y2={0} />
        </g>
      );

    case 'capacitor':
      return (
        <g {...common}>
          <line x1={-half} y1={0} x2={-5} y2={0} />
          <line x1={-5} y1={-11} x2={-5} y2={11} />
          <line x1={5} y1={-11} x2={5} y2={11} />
          <line x1={5} y1={0} x2={half} y2={0} />
          {ac ? (
            <path d="M-14,-16 q7,-5 14,0 q7,5 14,0" opacity={0.5} />
          ) : null}
        </g>
      );

    case 'inductor':
      return (
        <g {...common}>
          <line x1={-half} y1={0} x2={-inner} y2={0} />
          {[0, 1, 2].map((index) => (
            <path
              key={index}
              d={`M${-inner + (index * (inner * 2)) / 3},0 q${inner / 3},-12 ${(inner * 2) / 3},0`}
            />
          ))}
          <line x1={inner} y1={0} x2={half} y2={0} />
        </g>
      );

    case 'vsource':
      return (
        <g {...common}>
          <line x1={-half} y1={0} x2={-13} y2={0} />
          <line x1={13} y1={0} x2={half} y2={0} />
          <circle cx={0} cy={0} r={13} fill="rgba(5,19,26,0.9)" />
          {ac ? (
            <path d="M-6,0 q3,-6 6,0 q3,6 6,0" />
          ) : (
            <>
              <line x1={-3.5} y1={-4.5} x2={-3.5} y2={4.5} />
              <line x1={-6} y1={-4.5} x2={-1} y2={-4.5} />
              <line x1={3.5} y1={4.5} x2={3.5} y2={-4.5} />
            </>
          )}
        </g>
      );

    case 'isource':
      return (
        <g {...common}>
          <line x1={-half} y1={0} x2={-13} y2={0} />
          <line x1={13} y1={0} x2={half} y2={0} />
          <circle cx={0} cy={0} r={13} fill="rgba(5,19,26,0.9)" />
          <line x1={0} y1={7} x2={0} y2={-7} />
          <path d="M-4,-3 L0,-8 L4,-3" />
        </g>
      );

    case 'wire':
      return (
        <g {...common}>
          <line x1={-half - 6} y1={0} x2={half + 6} y2={0} strokeWidth={2.4} />
        </g>
      );

    case 'switch':
      return (
        <g {...common}>
          <line x1={-half} y1={0} x2={-inner} y2={0} />
          <line x1={inner} y1={0} x2={half} y2={0} />
          <circle cx={-inner} cy={0} r={2.6} fill={stroke} />
          <circle cx={inner} cy={0} r={2.6} fill={stroke} />
          <line x1={-inner} y1={0} x2={closed ? inner : inner - 3} y2={closed ? 0 : -11} />
        </g>
      );

    case 'ammeter':
    case 'voltmeter':
    case 'lamp':
      return (
        <g {...common}>
          <line x1={-half} y1={0} x2={-13} y2={0} />
          <line x1={13} y1={0} x2={half} y2={0} />
          <circle cx={0} cy={0} r={13} fill="rgba(5,19,26,0.85)" />
          {kind === 'lamp' ? (
            <>
              <line x1={-9} y1={-9} x2={9} y2={9} />
              <line x1={-9} y1={9} x2={9} y2={-9} />
            </>
          ) : (
            <text
              x={0}
              y={4}
              textAnchor="middle"
              fontSize={12}
              fontWeight={600}
              fill={stroke}
              stroke="none"
              opacity={opacity}
            >
              {kind === 'ammeter' ? 'A' : 'V'}
            </text>
          )}
        </g>
      );

    case 'potentiometer':
      return (
        <g {...common}>
          <line x1={-half} y1={0} x2={-inner} y2={0} />
          <path
            d={`M${-inner},0 l${inner / 3},-7 l${inner / 3},14 l${inner / 3},-14 l${inner / 3},14 l${inner / 3},-14 l${inner / 3},7`}
          />
          <line x1={inner} y1={0} x2={half} y2={0} />
          <path d="M0,-20 L0,-9 M-4,-13 L0,-9 L4,-13" />
        </g>
      );

    case 'vcvs':
    case 'vccs':
      return (
        <g {...common}>
          <line x1={-half} y1={0} x2={-15} y2={0} />
          <line x1={15} y1={0} x2={half} y2={0} />
          <path d="M0,-15 L15,0 L0,15 L-15,0 Z" fill="rgba(5,19,26,0.9)" />
          {kind === 'vcvs' ? (
            <>
              <line x1={-5} y1={-3} x2={-5} y2={3} />
              <line x1={-7.5} y1={-3} x2={-2.5} y2={-3} />
              <line x1={5} y1={3} x2={5} y2={-3} />
            </>
          ) : (
            <>
              <line x1={0} y1={5} x2={0} y2={-5} />
              <path d="M-3.5,-1.5 L0,-5.5 L3.5,-1.5" />
            </>
          )}
        </g>
      );

    default:
      return (
        <g {...common}>
          <rect x={-inner} y={-9} width={inner * 2} height={18} rx={4} />
          <line x1={-half} y1={0} x2={-inner} y2={0} />
          <line x1={inner} y1={0} x2={half} y2={0} />
        </g>
      );
  }
}

/** Pièce prête à l'emploi : glyphe + rotation selon l'orientation. */
export function PlacedGlyph({
  kind,
  a,
  b,
  color,
  selected,
  closed,
  ac,
}: {
  kind: ComponentKind;
  a: { x: number; y: number };
  b: { x: number; y: number };
  color?: string;
  selected?: boolean;
  closed?: boolean;
  ac?: boolean;
}) {
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const span = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return (
    <g transform={`translate(${cx},${cy}) rotate(${angle})`}>
      <PartGlyph kind={kind} span={span} color={color} selected={selected} closed={closed} ac={ac} />
    </g>
  );
}
