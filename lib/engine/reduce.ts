import { Complex, abs, add, cx, div, mul } from './complex';
import { formatSI } from './format';
import { CircuitDoc } from './types';

/**
 * Réduction symbolique série / parallèle et transformation de sources.
 * Utilisée par la page « Transformation T-N » et les agents IA (explications).
 */
export interface ReductionStep {
  index: number;
  rule: 'série' | 'parallèle' | 'source E→I' | 'source I→E' | 'stopped';
  formula: string;
  result: string;
  explanation: string;
  components: string[];
}

interface Branch {
  id: string;
  kind: 'R' | 'E' | 'I' | 'Z';
  a: string;
  b: string;
  value: Complex;
  label: string;
}

const clone = (c: Complex): Complex => cx(c.re, c.im);

function keyOf(a: string, b: string): string {
  return [a, b].sort().join('|');
}

export function reduceSeriesParallel(doc: CircuitDoc): {
  steps: ReductionStep[];
  finalValue: Complex;
  finalFormula: string;
  reducedCount: number;
  note: string;
} {
  const steps: ReductionStep[] = [];
  const branches: Branch[] = doc.components
    .filter((c) => ['resistor', 'potentiometer', 'lamp'].includes(c.kind))
    .map((c) => ({
      id: c.id,
      kind: 'R' as const,
      a: c.a,
      b: c.b,
      value: cx(Math.max(c.value, 0), 0),
      label: c.label ?? c.id,
    }));

  const sourceBranches: Branch[] = doc.components
    .filter((c) => c.kind === 'vsource' || c.kind === 'isource')
    .map((c) => ({
      id: c.id,
      kind: c.kind === 'vsource' ? ('E' as const) : ('I' as const),
      a: c.a,
      b: c.b,
      value: cx(c.value, 0),
      label: c.label ?? c.id,
    }));

  const all = [...branches, ...sourceBranches];
  const adjacency = new Map<string, Branch[]>();
  const link = (b: Branch) => {
    for (const node of [b.a, b.b]) {
      const list = adjacency.get(node) ?? [];
      list.push(b);
      adjacency.set(node, list);
    }
  };
  all.forEach(link);

  let index = 1;
  let merged = true;
  const removed = new Set<string>();

  while (merged) {
    merged = false;
    // --- série : nœud de degré 2, pas une source seule
    for (const [node, list] of [...adjacency.entries()]) {
      const active = list.filter((b) => !removed.has(b.id));
      if (active.length !== 2) continue;
      const [b1, b2] = active;
      if (b1.id === b2.id) continue;
      const resistiveOnly = b1.kind === 'R' && b2.kind === 'R';
      if (!resistiveOnly) continue;
      const newA = b1.a === node ? b1.b : b1.a;
      const newB = b2.a === node ? b2.b : b2.a;
      // deux branches entre les mêmes extrémités = parallèle, jamais série
      if (newA === newB) continue;
      const value = add(b1.value, b2.value);
      const id = `S${index}`;
      steps.push({
        index,
        rule: 'série',
        formula: `R_éq = ${formatSI(abs(b1.value), 'Ω')} + ${formatSI(abs(b2.value), 'Ω')}`,
        result: formatSI(abs(value), 'Ω'),
        explanation: `Les deux résistances partagent le nœud « ${node} » : elles sont parcourues par le même courant, donc leurs tensions s’additionnent.`,
        components: [b1.label, b2.label],
      });
      index += 1;
      removed.add(b1.id);
      removed.add(b2.id);
      const branch: Branch = { id, kind: 'R', a: newA, b: newB, value, label: id };
      all.push(branch);
      link(branch);
      merged = true;
      break;
    }
    if (merged) continue;
    // --- parallèle : deux branches entre les mêmes nœuds
    const pairs = new Map<string, Branch[]>();
    for (const b of all.filter((x) => !removed.has(x.id) && x.a !== x.b)) {
      const key = keyOf(b.a, b.b);
      const list = pairs.get(key) ?? [];
      list.push(b);
      pairs.set(key, list);
    }
    for (const [, list] of pairs) {
      const resistors = list.filter((b) => b.kind === 'R');
      if (resistors.length < 2) continue;
      const [b1, b2] = resistors;
      const value = div(mul(b1.value, b2.value), add(b1.value, b2.value));
      const id = `P${index}`;
      steps.push({
        index,
        rule: 'parallèle',
        formula: `R_éq = (${formatSI(abs(b1.value), 'Ω')} × ${formatSI(abs(b2.value), 'Ω')}) / (${formatSI(abs(b1.value), 'Ω')} + ${formatSI(abs(b2.value), 'Ω')})`,
        result: formatSI(abs(value), 'Ω'),
        explanation: `Même différence de potentiel entre « ${b1.a} » et « ${b1.b} » : les conductances s’ajoutent.`,
        components: [b1.label, b2.label],
      });
      index += 1;
      removed.add(b1.id);
      removed.add(b2.id);
      const branch: Branch = { id, kind: 'R', a: b1.a, b: b1.b, value, label: id };
      all.push(branch);
      link(branch);
      merged = true;
      break;
    }
  }

  const remaining = all.filter((b) => !removed.has(b.id));
  const equivalents = remaining.filter((b) => b.kind === 'R');
  const finalValue =
    equivalents.length === 1
      ? clone(equivalents[0].value)
      : equivalents.length > 1
        ? equivalents.reduce((acc, b) => add(acc, b.value), cx(0, 0))
        : cx(Infinity, 0);

  if (!steps.length) {
    steps.push({
      index: 0,
      rule: 'stopped',
      formula: 'Aucune réduction série/parallèle possible',
      result: equivalents.length === 1 ? formatSI(abs(finalValue), 'Ω') : '—',
      explanation:
        'Le montage n’est pas composé uniquement de résistances en série ou en parallèle simple (pont, sources multiples, condensateurs…). Utilisez l’onglet Équivalence pour le calcul nodal complet.',
      components: [],
    });
  }

  return {
    steps,
    finalValue,
    finalFormula: `R_éq ≈ ${formatSI(abs(finalValue), 'Ω')}`,
    reducedCount: steps.filter((s) => s.rule === 'série' || s.rule === 'parallèle').length,
    note:
      equivalents.length === 1
        ? 'Le réseau est entièrement réductible : le résultat est exact.'
        : 'Réduction partielle : le solveur nodal complète le calcul.',
  };
}

/** Transformation de sources : E en série avec R ⟷ I en parallèle avec R */
export function sourceTransformation(
  emf: number,
  resistance: number,
  mode: 'E2I' | 'I2E',
): { value: number; formula: string; explanation: string } {
  const r = Math.max(resistance, 1e-9);
  if (mode === 'E2I') {
    const current = emf / r;
    return {
      value: current,
      formula: `I = E / R = ${formatSI(emf, 'V')} / ${formatSI(r, 'Ω')}`,
      explanation: `La source de tension ${formatSI(emf, 'V')} en série avec ${formatSI(r, 'Ω')} se comporte, vue de l’extérieur, comme une source de courant ${formatSI(current, 'A')} en parallèle avec la même résistance.`,
    };
  }
  const voltage = emf * r;
  return {
    value: voltage,
    formula: `E = I · R = ${formatSI(emf, 'A')} × ${formatSI(r, 'Ω')}`,
    explanation: `La source de courant ${formatSI(emf, 'A')} en parallèle avec ${formatSI(r, 'Ω')} équivaut à une source de tension ${formatSI(voltage, 'V')} en série avec cette résistance.`,
  };
}

/** U(I) caractérique d'un dipôle actif — utile pour le tracé graphique */
export function loadLine(vth: number, rth: number, points = 40) {
  const data: Array<{ u: number; i: number }> = [];
  for (let k = 0; k <= points; k++) {
    const u = (vth * k) / points;
    const i = rth > 0 ? (vth - u) / rth : 0;
    data.push({ u, i });
  }
  return data;
}

export const summarizeImpedance = (z: Complex, unit = 'Ω'): string => {
  const re = formatSI(z.re, unit);
  const im = formatSI(Math.abs(z.im), unit);
  return z.im >= 0 ? `${re} + j${im}` : `${re} − j${im}`;
};
