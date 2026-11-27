'use client';

import { ComponentKind } from '@/lib/engine/types';

/**
 * Bibliothèque de symboles normalisés (CEI, style « manuel du cours »).
 *
 * Objectif graphique : des traits **francs et réguliers**, lisibles d'un coup
 * d'œil, identiques à toutes les échelles.
 *
 *  - les tracés utilisent `vector-effect: non-scaling-stroke` : la finesse du
 *    trait ne dépend plus du zoom (avant, un symbole agrandi ×3 donnait un
 *    trait ×3, flou et pâteux) ;
 *  - un seul carré de référence 100 × 100 (±50) pour tous les dipôles, corps
 *    entre ±22, broches de ±22 à ±50 ;
 *  - géométrie « pleine » : rectangle de résistance 46 × 20, armatures de
 *    condensateur hautes de 32, cercle de source de rayon 17, lettres de
 *    cadran en 15 px gras — c'est ce qui donne le rendu net des planches de
 *    référence.
 *
 * Repère local : l'origine est le centre du dipôle, l'axe des x va de A vers B.
 * Le parent applique la rotation, donc un dipôle vertical réutilise le même
 * dessin.
 */

/** épaisseur apparente, en pixels écran (grâce à non-scaling-stroke) */
const STROKE = 2.3;
/** broches : 28 unités de chaque côté */
const LEAD = 22;

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

const BASE = {
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  fill: 'none' as const,
  vectorEffect: 'non-scaling-stroke' as const,
};

export function NormSymbol({ kind, color, closed = true, bare = false, glow = 0 }: NormSymbolProps) {
  const s = { ...BASE, stroke: color, strokeWidth: STROKE };
  const thin = { ...s, strokeWidth: STROKE * 0.62 };
  const halo = glow > 0 ? { filter: `url(#nb-glow)` } : {};

  /**
   * Broches, dessinées jusqu'aux bornes du carré de référence. `bare` les
   * supprime : la palette et les vignettes ne montrent que le corps du dipôle.
   */
  const leads = (from = LEAD) =>
    bare ? null : (
      <>
        <line x1={-50} y1={0} x2={-from} y2={0} {...s} />
        <line x1={from} y1={0} x2={50} y2={0} {...s} />
      </>
    );

  const body = (() => {
    switch (kind) {
      /* ------------------------------------------------------- résistance */
      case 'resistor':
        return (
          <>
            {leads()}
            <rect x={-23} y={-10} width={46} height={20} rx={1} {...s} />
          </>
        );

      /* ------------------------------------------------- potententiomètre */
      case 'potentiometer':
        return (
          <>
            {leads()}
            <rect x={-23} y={-10} width={46} height={20} rx={1} {...s} />
            {/* curseur : flèche venue du haut, comme sur les schémas de cours */}
            <line x1={0} y1={-30} x2={0} y2={-12} {...s} />
            <path d="M 0 -10 L -4.5 -18 L 4.5 -18 Z" fill={color} stroke="none" />
          </>
        );

      /* ------------------------------------------------------ condensateur */
      case 'capacitor':
        return (
          <>
            {leads(7)}
            <line x1={-5} y1={-16} x2={-5} y2={16} {...s} strokeWidth={STROKE * 1.15} />
            <line x1={5} y1={-16} x2={5} y2={16} {...s} strokeWidth={STROKE * 1.15} />
          </>
        );

      /* ------------------------------------------------------------ bobine */
      case 'inductor': {
        const r = 5.75;
        const start = -23;
        const arc = `a ${r} ${r} 0 0 1 ${r * 2} 0`;
        return (
          <>
            {leads(22.5)}
            <path d={`M ${start} 0 ${arc} ${arc} ${arc} ${arc}`} {...s} />
            {/* noyau magnétique : deux traits fins, discrets */}
            <line x1={-21} y1={-14} x2={21} y2={-14} {...thin} opacity={0.5} />
            <line x1={-21} y1={14} x2={21} y2={14} {...thin} opacity={0.5} />
          </>
        );
      }

      /* ------------------------------------------------ source de tension */
      case 'vsource':
      case 'vcvs':
        return (
          <>
            {leads(17)}
            <circle cx={0} cy={0} r={17} {...s} />
            {kind === 'vsource' ? (
              <>
                {/* + en haut à gauche, − en bas à droite : polarité lisible */}
                <line x1={-9} y1={-6} x2={-3} y2={-6} {...s} strokeWidth={STROKE * 0.9} />
                <line x1={-6} y1={-9} x2={-6} y2={-3} {...s} strokeWidth={STROKE * 0.9} />
                <line x1={3} y1={6} x2={9} y2={6} {...s} strokeWidth={STROKE * 0.9} />
              </>
            ) : (
              <>
                <line x1={-7} y1={-7} x2={-7} y2={7} {...s} strokeWidth={STROKE * 0.9} />
                <line x1={-10} y1={-7} x2={-4} y2={-7} {...s} strokeWidth={STROKE * 0.9} />
                <line x1={7} y1={7} x2={7} y2={-7} {...s} strokeWidth={STROKE * 0.9} />
              </>
            )}
          </>
        );

      /* ------------------------------------------------ source de courant */
      case 'isource':
      case 'vccs':
        return (
          <>
            {leads(17)}
            <circle cx={0} cy={0} r={17} {...s} />
            <line x1={0} y1={11} x2={0} y2={-11} {...s} />
            <path d="M -5 -6 L 0 -12 L 5 -6" {...s} />
            {kind === 'vccs' ? (
              <path d="M -12 14 q 6 -6 12 0 q 6 6 12 0" {...thin} opacity={0.8} />
            ) : null}
          </>
        );

      /* ------------------------------------------------------------- lampe */
      case 'lamp':
        return (
          <>
            {leads(16)}
            <circle cx={0} cy={0} r={16} {...s} />
            <line x1={-8} y1={-8} x2={8} y2={8} {...s} strokeWidth={STROKE * 0.85} />
            <line x1={-8} y1={8} x2={8} y2={-8} {...s} strokeWidth={STROKE * 0.85} />
          </>
        );

      /* ------------------------------------------------------ interrupteur */
      case 'switch':
        return closed ? (
          <>
            {leads(23)}
            <line x1={-23} y1={0} x2={23} y2={0} {...s} />
            <circle cx={-23} cy={0} r={2.6} fill={color} />
            <circle cx={23} cy={0} r={2.6} fill={color} />
          </>
        ) : (
          <>
            {leads(23)}
            <circle cx={-23} cy={0} r={2.6} fill={color} />
            <circle cx={23} cy={0} r={2.6} fill={color} />
            {/* levier ouvert, franc, à 30° */}
            <line x1={-21} y1={0} x2={19} y2={-16} {...s} />
          </>
        );

      /* ---------------------------------------------------------- appareils */
      case 'ammeter':
      case 'voltmeter': {
        const letter = kind === 'ammeter' ? 'A' : 'V';
        return (
          <>
            {leads(16)}
            <circle cx={0} cy={0} r={16} {...s} />
            <text
              x={0}
              y={5.5}
              textAnchor="middle"
              fontSize={15}
              fontWeight={700}
              letterSpacing="0.5"
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              fill={color}
              stroke="none"
            >
              {letter}
            </text>
          </>
        );
      }

      /* --------------------------------------------------------------- fil */
      case 'wire':
      default:
        return <line x1={-50} y1={0} x2={50} y2={0} {...s} />;
    }
  })();

  return <g {...halo}>{body}</g>;
}

/**
 * Version « tuile » pour la palette et la bibliothèque : symbole horizontal
 * centré, sans broches, cadré serré pour occuper la vignette.
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
  const meters = kind === 'ammeter' || kind === 'voltmeter';
  return (
    <svg
      width={size}
      height={size}
      viewBox="-32 -32 64 64"
      aria-hidden="true"
      shapeRendering="geometricPrecision"
      className="overflow-visible"
    >
      <g transform={meters ? undefined : 'scale(0.92)'}>
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
        <feGaussianBlur stdDeviation="2.4" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  );
}
