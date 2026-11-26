'use client';

import { ComponentKind } from '@/lib/engine/types';

/**
 * Bibliothèque de symboles « normalisés » (norme CEI / manuel du cours).
 *
 * Les captures de référence de la branche `assets/` (bobine L, résistance R,
 * condensateur C, source E, source i) ont servi de modèle graphique :
 *  - résistance = rectangle (et non zigzag américain)
 *  - bobine = 4 arches enchaînées
 *  - condensateur = deux armatures parallèles
 *  - source de tension = cercle +
 *  - source de courant = cercle avec flèche traversante
 *
 * Repère local : -50 → +50 sur l'axe horizontal. Le parent applique la
 * rotation, donc les symboles verticaux réutilisent le même dessin.
 */

const STROKE = 2;
const LEAD = 20;

export interface NormSymbolProps {
  kind: ComponentKind;
  color: string;
  /** état « fermé » pour l'interrupteur */
  closed?: boolean;
  /** utilisé par la palette : aucune broche, symbole centré */
  bare?: boolean;
  /** intensité du halo lumineux (électrons) */
  glow?: number;
}

function Leads({ color }: { color: string }) {
  return (
    <>
      <line x1={-50} y1={0} x2={-LEAD} y2={0} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <line x1={LEAD} y1={0} x2={50} y2={0} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
    </>
  );
}

export function NormSymbol({ kind, color, closed = true, bare = false, glow = 0 }: NormSymbolProps) {
  const s = {
    stroke: color,
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };
  const halo = glow > 0 ? { filter: `url(#nb-glow)` } : {};

  const body = (() => {
    switch (kind) {
      /* ---------------------------------------------------- résistance */
      case 'resistor':
      case 'potentiometer': {
        const arrow =
          kind === 'potentiometer' ? (
            <>
              <line x1={0} y1={-9} x2={13} y2={-22} {...s} strokeWidth={1.6} />
              <path d="M 13 -22 l 6 1 l -2 5 z" fill={color} stroke="none" />
            </>
          ) : null;
        return (
          <>
            <rect x={-22} y={-9} width={44} height={18} rx={1.5} {...s} />
            {arrow}
          </>
        );
      }

      /* -------------------------------------------------- condensateur */
      case 'capacitor':
        return (
          <>
            <line x1={-4} y1={-15} x2={-4} y2={15} {...s} />
            <line x1={4} y1={-15} x2={4} y2={15} {...s} />
          </>
        );

      /* -------------------------------------------------------- bobine */
      case 'inductor':
        return (
          <>
            <path
              d="M -22 0
                 a 5.5 5.5 0 0 1 11 0
                 a 5.5 5.5 0 0 1 11 0
                 a 5.5 5.5 0 0 1 11 0
                 a 5.5 5.5 0 0 1 11 0"
              {...s}
            />
            {/* noyau magnétique : deux traits parallèles */}
            <line x1={-20} y1={-13} x2={20} y2={-13} {...s} strokeWidth={1.3} opacity={0.55} />
            <line x1={-20} y1={13} x2={20} y2={13} {...s} strokeWidth={1.3} opacity={0.55} />
          </>
        );

      /* ------------------------------------------------ source de tension */
      case 'vsource':
      case 'vcvs':
        return (
          <>
            <circle cx={0} cy={0} r={17} {...s} />
            <line x1={0} y1={-8} x2={0} y2={8} {...s} />
            <line x1={-8} y1={0} x2={8} y2={0} {...s} />
          </>
        );

      /* ------------------------------------------------ source de courant */
      case 'isource':
      case 'vccs':
        return (
          <>
            <circle cx={0} cy={0} r={17} {...s} />
            <line x1={0} y1={26} x2={0} y2={-26} {...s} strokeWidth={1.5} opacity={0.85} />
            <path d="M -6 -19 L 0 -27 L 6 -19" {...s} strokeWidth={1.8} />
          </>
        );

      /* ----------------------------------------------------------- lampe */
      case 'lamp':
        return (
          <>
            <circle cx={0} cy={0} r={15} {...s} />
            <line x1={-9} y1={-9} x2={9} y2={9} {...s} strokeWidth={1.5} />
            <line x1={-9} y1={9} x2={9} y2={-9} {...s} strokeWidth={1.5} />
          </>
        );

      /* ---------------------------------------------------- interrupteur */
      case 'switch':
        return closed ? (
          <line x1={-22} y1={0} x2={22} y2={0} {...s} />
        ) : (
          <>
            <circle cx={-22} cy={0} r={2.4} fill={color} />
            <circle cx={22} cy={0} r={2.4} fill={color} />
            <line x1={-20} y1={0} x2={17} y2={-14} {...s} />
          </>
        );

      /* ------------------------------------------------------- appareils */
      case 'ammeter':
        return (
          <>
            <circle cx={0} cy={0} r={15} {...s} />
            <text
              x={0}
              y={5}
              textAnchor="middle"
              fontSize={13}
              fontFamily="ui-monospace, monospace"
              fill={color}
              stroke="none"
            >
              A
            </text>
          </>
        );
      case 'voltmeter':
        return (
          <>
            <circle cx={0} cy={0} r={15} {...s} />
            <text
              x={0}
              y={5}
              textAnchor="middle"
              fontSize={13}
              fontFamily="ui-monospace, monospace"
              fill={color}
              stroke="none"
            >
              V
            </text>
          </>
        );

      /* ------------------------------------------------------------ fil */
      case 'wire':
      default:
        return <line x1={-50} y1={0} x2={50} y2={0} stroke={color} strokeWidth={STROKE} strokeLinecap="round" />;
    }
  })();

  return (
    <g {...halo}>
      {bare ? null : <Leads color={color} />}
      {body}
    </g>
  );
}

/**
 * Version « tuile » pour la palette et la bibliothèque : symbole dessiné dans
 * un carré, orientation verticale comme sur le manuel, sans broches.
 */
export function NormSymbolTile({
  kind,
  color,
  size = 40,
}: {
  kind: ComponentKind;
  color: string;
  size?: number;
}) {
  const vertical = ['resistor', 'capacitor', 'inductor', 'vsource', 'isource', 'lamp', 'potentiometer', 'switch'].includes(
    kind,
  );
  return (
    <svg
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      aria-hidden="true"
      className="overflow-visible"
    >
      <defs>
        <filter id="nb-glow">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g transform={vertical ? 'rotate(-90)' : undefined}>
        <NormSymbol kind={kind} color={color} bare />
      </g>
    </svg>
  );
}

/** définit le filtre de halo une seule fois pour tout le canvas */
export function NormSymbolDefs() {
  return (
    <defs>
      <filter id="nb-glow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="2.6" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
