import { Complex, abs, argDeg } from './complex';

const PREFIXES: Array<{ exp: number; symbol: string }> = [
  { exp: 9, symbol: 'G' },
  { exp: 6, symbol: 'M' },
  { exp: 3, symbol: 'k' },
  { exp: 0, symbol: '' },
  { exp: -3, symbol: 'm' },
  { exp: -6, symbol: 'µ' },
  { exp: -9, symbol: 'n' },
  { exp: -12, symbol: 'p' },
  { exp: -15, symbol: 'f' },
];

export interface FormatOptions {
  digits?: number;
  comma?: boolean;
  space?: boolean;
}

function trimNumber(s: string, comma: boolean): string {
  // 1.230 -> 1.23 ; 12.00 -> 12
  const cleaned = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return comma ? cleaned.replace('.', ',') : cleaned;
}

/** Notation ingénieur : 1200 Ω -> 1,20 kΩ */
export function formatSI(
  value: number,
  unit = '',
  { digits = 4, comma = true, space = true }: FormatOptions = {},
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '−∞';
  if (value === 0) return `0${space && unit ? ' ' : ''}${unit}`.trim();

  const absolute = Math.abs(value);
  let chosen = PREFIXES[PREFIXES.length - 1];
  for (const p of PREFIXES) {
    if (absolute >= Math.pow(10, p.exp)) {
      chosen = p;
      break;
    }
  }
  let scaled = value / Math.pow(10, chosen.exp);
  if (Math.abs(scaled) >= 1000) {
    // ex: 999 999 -> 1,00 M
    const idx = PREFIXES.findIndex((p) => p.exp === chosen.exp);
    if (idx > 0) {
      chosen = PREFIXES[idx - 1];
      scaled = value / Math.pow(10, chosen.exp);
    }
  }
  let text: string;
  const magnitude = Math.abs(scaled);
  if (magnitude >= 1000) text = scaled.toFixed(0);
  else if (magnitude >= 100) text = scaled.toPrecision(3);
  else if (magnitude >= 1) text = scaled.toPrecision(Math.min(digits, 3));
  else text = scaled.toPrecision(Math.min(digits, 3));
  text = trimNumber(text, comma);
  const sep = space && unit ? ' ' : '';
  return `${text}${sep}${chosen.symbol}${unit}`;
}

/** Tension courant continu, avec signe explicite pour les négatifs */
export function formatVoltage(value: number, comma = true): string {
  return formatSI(value, 'V', { comma });
}

export function formatCurrent(value: number, comma = true): string {
  return formatSI(value, 'A', { comma });
}

export function formatPhasor(value: Complex, unit = 'V', comma = true): string {
  if (Math.abs(value.im) < 1e-12) return formatSI(value.re, unit, { comma });
  const mag = abs(value);
  const phase = argDeg(value);
  return `${formatSI(mag, unit, { comma })} ∠ ${formatSI(phase, '°', {
    comma,
    digits: 3,
  })}`;
}

export function formatComplexRect(value: Complex, unit = 'Ω', comma = true): string {
  const reText = formatSI(value.re, unit, { comma });
  const imMag = Math.abs(value.im);
  const sign = value.im < 0 ? '−' : '+';
  return `${reText} ${sign} j${formatSI(imMag, unit, { comma })}`;
}

/** valeur brute pour un champ de saisie (sans préfixe) */
export function rawNumber(value: number, digits = 8): string {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toPrecision(digits)).toString();
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits).replace('.', ',')} %`;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count > 1 ? plural : singular;
}
