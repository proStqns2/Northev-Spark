/**
 * Sillage des curseurs distants.
 *
 * Un pair bouge par paquets (le flux livre ~9 positions par seconde) : sans
 * traînée, un geste rapide ressemble à une téléportation. On garde donc les
 * dernières positions — bornées en nombre **et** en durée — et on les rend en
 * polyligne derrière le curseur.
 *
 * Logique pure : aucune dépendance au DOM, testable sans navigateur.
 */

export interface TrailPoint {
  /** coordonnées de grille (cellules) */
  x: number;
  y: number;
  /** horodatage du point (ms) */
  t: number;
}

export const TRAIL_MS = 900;
export const TRAIL_MAX = 24;
/** En dessous, le déplacement est du bruit de mesure : on ne l'empile pas. */
export const TRAIL_MIN_STEP = 0.05;

/**
 * Ajoute un point au sillage s'il apporte de l'information, puis élague les
 * points trop anciens. Renvoie le tableau d'origine si rien ne change, pour
 * éviter de réallouer à chaque battement.
 */
export function advanceTrail(
  previous: TrailPoint[] | undefined,
  point: { x: number; y: number },
  now: number,
): TrailPoint[] {
  const trail = previous ?? [];
  const kept = trail.filter((entry) => now - entry.t < TRAIL_MS);
  const base = kept.length === trail.length ? trail : kept;
  const last = base[base.length - 1];
  const moved = !last || Math.hypot(point.x - last.x, point.y - last.y) > TRAIL_MIN_STEP;
  const stale = !last || now - last.t > 120;
  const next = moved || stale ? [...base, { x: point.x, y: point.y, t: now }] : base;
  return next.length > TRAIL_MAX ? next.slice(-TRAIL_MAX) : next;
}

/** Points du sillage convertis en pixels écran, prêts pour `<polyline>`. */
export function trailPolyline(
  points: TrailPoint[],
  toPx: (cell: { x: number; y: number }) => { x: number; y: number },
  minimum = 3,
): string | null {
  if (points.length < minimum) return null;
  const parts: string[] = [];
  for (const point of points) {
    const pixel = toPx(point);
    if (!Number.isFinite(pixel.x) || !Number.isFinite(pixel.y)) continue;
    parts.push(`${pixel.x.toFixed(1)},${pixel.y.toFixed(1)}`);
  }
  return parts.length >= minimum ? parts.join(' ') : null;
}

/** Un sillage très court se lit mieux avec moins d'opacité. */
export function trailOpacity(points: TrailPoint[]): number {
  if (points.length >= 10) return 0.5;
  if (points.length >= 6) return 0.38;
  return 0.26;
}
