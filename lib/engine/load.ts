import { Complex, abs, add, cx, div, mul } from './complex';

/**
 * Charge résistive R_L branchée entre les bornes A et B d'un équivalent.
 *
 * Le montage est remplacé par son modèle de Thévenin (U_th en série avec
 * Z_th). On branche R_L et on calcule le régime établi :
 *
 *     I_L = U_th / (Z_th + R_L)
 *     U_L = R_L · I_L
 *     P_L = |I_L|² · R_L
 *
 * Le théorème du transfert maximal donne P_max = |U_th|² / (4 |Z_th|),
 * atteint pour R_L = |Z_th|.
 */
export interface LoadResult {
  /** résistance de charge, Ω */
  rl: number;
  /** tension aux bornes de la charge (phasor) */
  uL: Complex;
  /** courant dans la charge (phasor) */
  iL: Complex;
  /** puissance active dissipée dans la charge, W */
  pL: number;
  /** |Z_th|, la valeur de R_L qui maximise P_L */
  zthMagnitude: number;
  /** |U_th|² / (4|Z_th|) */
  pMax: number;
  /** R_L est à moins de 5 % de |Z_th| */
  atMax: boolean;
}

export function loadEquivalent(
  vth: Complex,
  zth: Complex,
  rl: number,
): LoadResult {
  const load = cx(Math.max(rl, 0), 0);
  const denom = add(zth, load);
  const iL = div(vth, denom);
  const uL = mul(iL, load);
  const pL = abs(iL) * abs(iL) * Math.max(rl, 0);
  const zthMagnitude = abs(zth);
  const pMax =
    zthMagnitude > 1e-12
      ? (abs(vth) * abs(vth)) / (4 * zthMagnitude)
      : Number.POSITIVE_INFINITY;
  const atMax =
    zthMagnitude > 1e-12 &&
    Math.abs(rl - zthMagnitude) / zthMagnitude < 0.05;

  return { rl, uL, iL, pL, zthMagnitude, pMax, atMax };
}
