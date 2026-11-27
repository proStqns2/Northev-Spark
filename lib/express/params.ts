import { VALUE_DEFAULTS, VALUE_RANGES, type ValueInput } from './model';

/**
 * Lecture tolérante des entrées de la barre de valeurs.
 *
 * Accepte aussi bien un JSON (`{ r: 4700, c: 1e-7 }`) qu'une notation
 * d'ingénieur écrite à la main — `R=4,7k`, `C=100nF`, `L=10mH`, `f=1k` — et
 * les ramène aux cinq grandeurs utiles, bornées.
 */

const ALIASES: Record<string, keyof typeof VALUE_RANGES | 'f'> = {
  r: 'r',
  res: 'r',
  resistance: 'r',
  résistance: 'r',
  ohm: 'r',
  c: 'c',
  cap: 'c',
  capacitor: 'c',
  capacitance: 'c',
  cond: 'c',
  condensateur: 'c',
  l: 'l',
  ind: 'l',
  inductor: 'l',
  inductance: 'l',
  bobine: 'l',
  e: 'e',
  v: 'e',
  u: 'e',
  vsource: 'e',
  tension: 'e',
  voltage: 'e',
  i: 'i',
  i0: 'i',
  a: 'i',
  isource: 'i',
  courant: 'i',
  current: 'i',
  f: 'f',
  freq: 'f',
  frequency: 'f',
  hz: 'f',
};

const PREFIXES: Record<string, number> = {
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

/** `4,7kΩ` → 4700 · `100nF` → 1e-7 · `10mH` → 0.01 */
export function parseEngineerValue(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const cleaned = raw
    .replace(/\u00a0/g, ' ')
    .replace(/(Ω|ohms?|Ohms?|volts?|amps?|ampères?|farads?|henrys?|H|F|V|A)/g, ' ')
    .replace(/,/g, '.')
    .replace(/\s+/g, '')
    .trim();
  const match = cleaned.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([pnuµmkKMGT]?)$/);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const factor = PREFIXES[match[2] ?? ''] ?? 1;
  return base * factor;
}

const clampValue = (key: keyof typeof VALUE_RANGES, value: number): number => {
  const { min, max } = VALUE_RANGES[key];
  return Math.min(Math.max(value, min), max);
};

/**
 * Normalise les entrées : JSON typé, query string (`?r=1k&c=100n`) ou texte
 * libre (`"R=4,7k C=100n L=10m f=50"`).
 */
export function normalizeValueInput(raw: unknown): ValueInput {
  const input: ValueInput = {
    r: VALUE_DEFAULTS.r,
    c: VALUE_DEFAULTS.c,
    l: VALUE_DEFAULTS.l,
    e: VALUE_DEFAULTS.e,
    f: VALUE_DEFAULTS.f,
  };

  const assign = (key: string, value: unknown) => {
    const target = ALIASES[key.trim().toLowerCase()];
    const numeric = parseEngineerValue(value);
    if (!target || numeric === null) return;
    if (target === 'e') {
      input.e = clampValue('e', numeric);
      delete input.i;
      return;
    }
    if (target === 'i') {
      input.i = clampValue('i', numeric);
      delete input.e;
      return;
    }
    if (target === 'f') {
      input.f = Math.min(Math.max(numeric, 0), 1e9);
      return;
    }
    (input as Record<string, unknown>)[target] = clampValue(target, numeric);
  };

  if (typeof raw === 'string') {
    input.values = raw.slice(0, 500);
    // virgule = séparateur seulement si un nom de grandeur suit (« R=1k, C=100n »)
    // sinon c'est le séparateur décimal français (« 4,7k »)
    const parts = raw.replace(/,\s*(?=[a-zA-Zà-ÿ])/g, ' ').split(/[;&\s]+/).filter(Boolean);
    for (const part of parts) {
      const [key, value] = part.includes('=') ? part.split('=') : ['', ''];
      if (key && value) assign(key, value);
    }
    return input;
  }

  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      const lowered = key.toLowerCase();
      if (lowered === 'regime') {
        input.regime = String(value).toLowerCase() === 'ac' ? 'ac' : 'dc';
        continue;
      }
      if (lowered === 'name' && typeof value === 'string') {
        input.name = value.slice(0, 120);
        continue;
      }
      if (lowered === 'values' && typeof value === 'string') {
        const nested = normalizeValueInput(value);
        Object.assign(input, {
          r: nested.r,
          c: nested.c,
          l: nested.l,
          e: 'e' in nested ? nested.e : input.e,
          i: 'i' in nested ? nested.i : input.i,
          f: nested.f,
        });
        continue;
      }
      if (lowered === 'frequency' || lowered === 'hz') {
        const numeric = parseEngineerValue(value);
        if (numeric !== null) input.f = Math.min(Math.max(numeric, 0), 1e9);
        continue;
      }
      assign(key, value);
    }
  }

  return input;
}

/** Contrôle de cohérence : signale les grandeurs manquantes ou hors bornes. */
export function validateValueInput(input: ValueInput): string[] {
  const problems: string[] = [];
  if (!(typeof input.r === 'number' && input.r > 0)) problems.push('La résistance R doit être strictement positive.');
  if (!(typeof input.c === 'number' && input.c > 0)) problems.push('La capacité C doit être strictement positive.');
  if (!(typeof input.l === 'number' && input.l > 0)) problems.push("L'inductance L doit être strictement positive.");
  if (typeof input.f === 'number' && (input.f < 0 || input.f > 1e9)) problems.push('La fréquence doit rester entre 0 et 1 GHz.');
  return problems;
}
