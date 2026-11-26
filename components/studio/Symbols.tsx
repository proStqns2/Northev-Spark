'use client';

import { ComponentKind } from '@/lib/engine/types';

/**
 * Symboles électriques dessinés en SVG pur, dans un repère local
 * horizontal de -50 → +50 (le parent applique la rotation).
 */

interface SymbolProps {
  kind: ComponentKind;
  color: string;
  value?: string;
  label?: string;
  closed?: boolean;
  selected?: boolean;
  energized?: number;
}

const STROKE = 2.1;
const LEAD = 22; // longueur des broches

function Leads({ color }: { color: string }) {
  return (
    <>
      <line x1={-50} y1={0} x2={-LEAD} y2={0} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <line x1={LEAD} y1={0} x2={50} y2={0} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </>
  );
}

export function SymbolGlyph({ kind, color, closed = true, selected = false }: SymbolProps) {
  const stroke = { stroke: color, strokeWidth: STROKE, strokeLinecap: 'round' as const, fill: 'none' };
  const glow = selected ? { filter: 'url(#sym-glow)' } : {};

  switch (kind) {
    case 'resistor':
      return (
        <g {...glow}>
          <Leads color={color} />
          <polyline
            points="-22,0 -19,-8 -13,8 -7,-8 -1,8 5,-8 11,8 15,-6 18,0 22,0"
            {...stroke}
            strokeLinejoin="round"
          />
        </g>
      );
    case 'potentiometer':
      return (
        <g {...glow}>
          <Leads color={color} />
          <polyline
            points="-22,0 -19,-8 -13,8 -7,-8 -1,8 5,-8 11,8 15,-6 18,0 22,0"
            {...stroke}
            strokeLinejoin="round"
          />
          <line x1={0} y1={-8} x2={10} y2={-20} {...stroke} />
          <path d="M 10 -20 l 5 2 l -3 4 z" fill={color} stroke="none" />
        </g>
      );
    case 'capacitor':
      return (
        <g {...glow}>
          <Leads color={color} />
          <line x1={-5} y1={-14} x2={-5} y2={14} {...stroke} />
          <line x1={5} y1={-14} x2={5} y2={14} {...stroke} />
        </g>
      );
    case 'inductor':
      return (
        <g {...glow}>
          <Leads color={color} />
          <path
            d="M -22 0 q 5.5 -13 11 0 q 5.5 -13 11 0 q 5.5 -13 11 0 q 5.5 -13 11 0"
            {...stroke}
          />
        </g>
      );
    case 'lamp':
      return (
        <g {...glow}>
          <Leads color={color} />
          <circle cx={0} cy={0} r={14} {...stroke} />
          <line x1={-10} y1={-10} x2={10} y2={10} {...stroke} />
          <line x1={-10} y1={10} x2={10} y2={-10} {...stroke} />
        </g>
      );
    case 'vsource':
      return (
        <g {...glow}>
          <Leads color={color} />
          <circle cx={0} cy={0} r={16} {...stroke} />
          <line x1={0} y1={-8} x2={0} y2={8} {...stroke} />
          <line x1={-8} y1={0} x2={8} y2={0} {...stroke} />
          <line x1={-8} y1={-8} x2={-8} y2={-4} stroke={color} strokeWidth={1.4} />
          <line x1={-8} y1={-10} x2={-8} y2={-6} stroke={color} strokeWidth={1.4} />
        </g>
      );
    case 'isource':
      return (
        <g {...glow}>
          <Leads color={color} />
          <circle cx={0} cy={0} r={16} {...stroke} />
          <line x1={0} y1={10} x2={0} y2={-8} {...stroke} />
          <path d="M -5 -6 L 0 -10 L 5 -6" {...stroke} />
        </g>
      );
    case 'vcvs':
      return (
        <g {...glow}>
          <Leads color={color} />
          <path d="M -16 -14 L 16 -14 L 0 16 Z" {...stroke} strokeLinejoin="round" />
          <text x={0} y={-1} textAnchor="middle" fontSize="11" fill={color} fontFamily="monospace">
            μ
          </text>
        </g>
      );
    case 'vccs':
      return (
        <g {...glow}>
          <Leads color={color} />
          <path d="M -16 -14 L 16 -14 L 0 16 Z" {...stroke} strokeLinejoin="round" />
          <text x={0} y={-1} textAnchor="middle" fontSize="11" fill={color} fontFamily="monospace">
            g
          </text>
        </g>
      );
    case 'ammeter':
      return (
        <g {...glow}>
          <Leads color={color} />
          <circle cx={0} cy={0} r={14} {...stroke} />
          <text x={0} y={5} textAnchor="middle" fontSize="13" fill={color} fontFamily="monospace">
            A
          </text>
        </g>
      );
    case 'voltmeter':
      return (
        <g {...glow}>
          <Leads color={color} />
          <circle cx={0} cy={0} r={14} {...stroke} />
          <text x={0} y={5} textAnchor="middle" fontSize="13" fill={color} fontFamily="monospace">
            V
          </text>
        </g>
      );
    case 'switch':
      return (
        <g {...glow}>
          <Leads color={color} />
          <circle cx={-12} cy={0} r={2.6} fill={color} />
          <circle cx={12} cy={0} r={2.6} fill={color} />
          {closed ? (
            <line x1={-12} y1={0} x2={12} y2={0} {...stroke} />
          ) : (
            <line x1={-12} y1={0} x2={10} y2={-12} {...stroke} />
          )}
        </g>
      );
    case 'wire':
    default:
      return <line x1={-50} y1={0} x2={50} y2={0} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />;
  }
}

export function SymbolDefs() {
  return (
    <defs>
      <filter id="sym-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="3.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="node-glow" x="-200%" y="-200%" width="500%" height="500%">
        <feGaussianBlur stdDeviation="2.4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}

export const KIND_COLORS: Record<ComponentKind, string> = {
  resistor: '#38e1e6',
  capacitor: '#46e6a0',
  inductor: '#a479ff',
  vsource: '#ffc266',
  isource: '#4f9dff',
  wire: '#8fa6c4',
  switch: '#cbd5e1',
  ammeter: '#8fb6ff',
  voltmeter: '#8fb6ff',
  lamp: '#ffd166',
  potentiometer: '#ff79c6',
  vcvs: '#ff9b6b',
  vccs: '#ff9b6b',
};
