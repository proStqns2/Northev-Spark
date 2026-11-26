import { cn } from '@/lib/utils';

/**
 * Logo Northev Spark — monogramme « N » isométrique.
 *
 * Reproduction vectorielle du logo fourni : trois barres parallèles en
 * projection isométrique, chacune avec deux faces (dessus noir, flanc clair),
 * qui composent un « N » en volume.
 *
 * Repère : 100 × 100. Chaque barre est un parallélogramme extrudé.
 */

type Face = { top: string; left: string; right: string };

function bar(
  x: number,
  y: number,
  length: number,
  thickness: number,
  height: number,
  direction: 1 | -1,
): Face {
  // direction 1 = montante vers la droite ; -1 = descendante
  const dx = length;
  const dy = direction * length * 0.58;
  const nx = 0; // épaisseur verticale
  const ny = thickness;

  const p = (ox: number, oy: number) => `${(x + ox).toFixed(2)},${(y + oy).toFixed(2)}`;

  // face supérieure
  const top = [
    p(0, 0),
    p(dx, dy),
    p(dx + nx, dy + ny),
    p(nx, ny),
  ].join(' L');

  // flanc gauche (descend de `height`)
  const left = [
    p(0, 0),
    p(nx, ny),
    p(nx, ny + height),
    p(0, height),
  ].join(' L');

  // flanc droit
  const right = [
    p(dx, dy),
    p(dx + nx, dy + ny),
    p(dx + nx, dy + ny + height),
    p(dx, dy + height),
  ].join(' L');

  return { top: `M${top} Z`, left: `M${left} Z`, right: `M${right} Z` };
}

export function LogoMark({
  size = 32,
  className,
  tone = 'auto',
}: {
  size?: number;
  className?: string;
  tone?: 'auto' | 'mono';
}) {
  const dark = tone === 'mono' ? '#e9fbff' : '#0b0d10';
  const mid = tone === 'mono' ? '#93a9c2' : '#d9dad7';
  const light = tone === 'mono' ? '#c3d6ea' : '#fbfbfa';

  // trois barres : deux verticales (montantes) + la diagonale du N
  const leftBar = bar(22, 26, 0, 13, 44, 1);
  const diag = bar(22, 26, 44, 13, 0, 1);
  const rightBar = bar(66, 26, 0, 13, 44, 1);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn('shrink-0', className)}
      role="img"
      aria-label="Northev Spark"
    >
      <g strokeLinejoin="round">
        <path d={leftBar.top} fill={dark} />
        <path d={leftBar.left} fill={light} />
        <path d={leftBar.right} fill={mid} />

        <path d={diag.top} fill={dark} />
        <path d={diag.left} fill={light} />
        <path d={diag.right} fill={mid} />

        <path d={rightBar.top} fill={dark} />
        <path d={rightBar.left} fill={light} />
        <path d={rightBar.right} fill={mid} />
      </g>
    </svg>
  );
}

export function LogoLockup({
  size = 30,
  showTagline = false,
  className,
}: {
  size?: number;
  showTagline?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <LogoMark size={size} />
      <span className="flex flex-col leading-none">
        <span className="text-[14.5px] font-semibold tracking-tight text-fg">
          Northev <span className="text-spark-cyan">Spark</span>
        </span>
        {showTagline ? (
          <span className="mt-0.5 text-[8px] uppercase tracking-[0.2em] text-fg-mute">
            Thévenin · Norton
          </span>
        ) : null}
      </span>
    </span>
  );
}
