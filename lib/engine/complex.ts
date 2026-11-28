/**
 * Arithmétique complexe minimale (sans dépendance) utilisée par le solveur
 * nodal (MNA) pour les régimes continu et sinusoïdal établi.
 */
export interface Complex {
  re: number;
  im: number;
}

export const cx = (re = 0, im = 0): Complex => ({ re, im });
export const ZERO = cx(0, 0);
export const ONE = cx(1, 0);

export const add = (x: Complex, y: Complex): Complex => cx(x.re + y.re, x.im + y.im);
export const sub = (x: Complex, y: Complex): Complex => cx(x.re - y.re, x.im - y.im);
export const mul = (x: Complex, y: Complex): Complex =>
  cx(x.re * y.re - x.im * y.im, x.re * y.im + x.im * y.re);
export const div = (x: Complex, y: Complex): Complex => {
  const d = y.re * y.re + y.im * y.im;
  if (d === 0) return cx(NaN, NaN);
  return cx((x.re * y.re + x.im * y.im) / d, (x.im * y.re - x.re * y.im) / d);
};
export const scale = (x: Complex, k: number): Complex => cx(x.re * k, x.im * k);
export const neg = (x: Complex): Complex => cx(-x.re, -x.im);
export const conj = (x: Complex): Complex => cx(x.re, -x.im);
export const abs = (x: Complex): number => Math.hypot(x.re, x.im);
export const arg = (x: Complex): number => Math.atan2(x.im, x.re);
export const argDeg = (x: Complex): number => (arg(x) * 180) / Math.PI;
export const isZero = (x: Complex, eps = 1e-12): boolean =>
  Math.abs(x.re) < eps && Math.abs(x.im) < eps;
export const fromPolar = (r: number, thetaRad: number): Complex =>
  cx(r * Math.cos(thetaRad), r * Math.sin(thetaRad));
export const fromAmplitudePhase = (amp: number, phaseDeg: number): Complex =>
  fromPolar(amp, (phaseDeg * Math.PI) / 180);
/** jω */
export const jOmega = (omega: number): Complex => cx(0, omega);
export const real = (x: Complex): number => x.re;
/** puissance apparente S = U · I* */
export const apparentPower = (u: Complex, i: Complex): Complex => mul(u, conj(i));
