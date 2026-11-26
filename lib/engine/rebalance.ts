/**
 * Rééquilibrage d'un montage.
 *
 * « Rééquilibrer » = rendre le montage physiquement cohérent et calculable,
 * sans changer son intention pédagogique. On ne réécrit pas les valeurs au
 * hasard : on corrige uniquement ce qui casse la cohérence, et on explique
 * chaque geste.
 *
 * Contrôles effectués :
 *  1. bornes absentes ou identiques          → bornes choisies automatiquement
 *  2. masse absente / nœud flottant          → masse rattachée au nœud dominant
 *  3. source de tension court-circuitée      → résistance de 10 Ω intercalée
 *  4. source de courant en série ouverte     → fil de continuité ajouté
 *  5. valeur nulle ou non finie              → valeur par défaut du dipôle
 *  6. branches parallèles redondantes        → signalées (pas supprimées)
 *  7. doublons de composants identiques       → signalés
 *  8. régime AC sans fréquence               → 50 Hz
 *  9. dipôles en double entre mêmes nœuds    → signalés
 * 10. résultat non calculable                → diagnostic transmis
 */

import { CircuitDoc, Component, COMPONENT_META } from './types';
import { equivalentOf } from './equivalent';

export interface RebalanceFix {
  code: string;
  severity: 'correction' | 'conseil';
  message: string;
  /** identifiant du composant concerné, si applicable */
  componentId?: string;
}

export interface RebalanceResult {
  doc: CircuitDoc;
  fixes: RebalanceFix[];
  /** true si au moins une correction a été appliquée */
  changed: boolean;
  /** état du montage après correction */
  status: {
    ok: boolean;
    error?: string;
    vth: number;
    rth: number;
    inorton: number;
  };
  /** diagnostic avant correction, pour comparer */
  before: {
    ok: boolean;
    error?: string;
  };
}

const DEFAULT_VALUE = (kind: Component['kind']) => COMPONENT_META[kind].defaultValue;

function nodeDegree(doc: CircuitDoc): Map<string, number> {
  const degree = new Map<string, number>();
  const bump = (node: string) => degree.set(node, (degree.get(node) ?? 0) + 1);
  for (const c of doc.components) {
    bump(c.a);
    bump(c.b);
  }
  return degree;
}

export function rebalanceDoc(input: CircuitDoc): RebalanceResult {
  const doc: CircuitDoc = {
    ...input,
    components: input.components.map((c) => ({ ...c })),
    terminals: { ...input.terminals },
    notes: input.notes,
  };
  const fixes: RebalanceFix[] = [];
  const beforeEq = equivalentOf(input);

  /* ------------------------------------------------- 1. valeurs invalides */
  for (const c of doc.components) {
    if (c.kind === 'wire' || c.kind === 'switch') continue;
    if (!Number.isFinite(c.value) || c.value === 0) {
      const old = c.value;
      c.value = DEFAULT_VALUE(c.kind);
      fixes.push({
        code: 'valeur-invalide',
        severity: 'correction',
        componentId: c.id,
        message: `${c.id} : valeur ${Number.isFinite(old) ? old : 'non numérique'} remplacée par la valeur par défaut (${c.value} ${COMPONENT_META[c.kind].unit}).`,
      });
    }
  }

  /* --------------------------------------------- 2. nœuds a-b identiques */
  for (const c of doc.components) {
    if (c.a === c.b) {
      // un dipôle entre un nœud et lui-même est inopérant : on le déclare
      fixes.push({
        code: 'boucle-nulle',
        severity: 'conseil',
        componentId: c.id,
        message: `${c.id} relie le nœud ${c.a} à lui-même : ce dipôle est sans effet (courant nul).`,
      });
    }
  }

  /* ------------------------------------------------------- 3. la masse */
  const degree = nodeDegree(doc);
  const componentNodes = [...degree.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  if (!doc.ground || !componentNodes.includes(doc.ground)) {
    const previous = doc.ground;
    if (componentNodes.length) {
      // on préfère un nœud qui porte déjà une source de tension
      const sourceNode = doc.components.find((c) => c.kind === 'vsource')?.b;
      doc.ground = sourceNode ?? componentNodes[0];
      fixes.push({
        code: 'masse',
        severity: 'correction',
        message: `Masse ${previous ? `« ${previous} » inexistante` : 'absente'} → rattachée à « ${doc.ground} » (nœud le plus connecté).`,
      });
    }
  }

  /* ---------------------------------------------------------- 4. bornes */
  const nodes = [...nodeDegree(doc).keys()];
  if (!doc.terminals.a || !nodes.includes(doc.terminals.a)) {
    const candidate = nodes.find((n) => n !== doc.ground) ?? nodes[0] ?? null;
    if (candidate) {
      fixes.push({
        code: 'borne-a',
        severity: 'correction',
        message: `Borne A ${doc.terminals.a ? `« ${doc.terminals.a} » introuvable` : 'manquante'} → placée sur « ${candidate} ».`,
      });
      doc.terminals.a = candidate;
    }
  }
  if (!doc.terminals.b || !nodes.includes(doc.terminals.b)) {
    if (doc.ground) {
      fixes.push({
        code: 'borne-b',
        severity: 'correction',
        message: `Borne B ${doc.terminals.b ? `« ${doc.terminals.b} » introuvable` : 'manquante'} → reliée à la masse « ${doc.ground} ».`,
      });
      doc.terminals.b = doc.ground;
    }
  }
  if (doc.terminals.a && doc.terminals.a === doc.terminals.b) {
    const other = nodes.find((n) => n !== doc.terminals.a);
    if (other) {
      fixes.push({
        code: 'bornes-confondues',
        severity: 'correction',
        message: `Bornes A et B confondues → B déplacée sur « ${other} ».`,
      });
      doc.terminals.b = other;
    }
  }

  /* ------------------------------- 5. source de tension court-circuitée */
  for (const source of doc.components) {
    if (source.kind !== 'vsource') continue;
    const directShort = doc.components.some(
      (c) => c !== source && c.kind === 'wire' && ((c.a === source.a && c.b === source.b) || (c.a === source.b && c.b === source.a)),
    );
    if (directShort) {
      const id = `Rs_${doc.components.length + 1}`;
      doc.components.push({ id, kind: 'resistor', a: source.b, b: doc.ground || 'gnd', value: 10 });
      fixes.push({
        code: 'source-court-circuite',
        severity: 'correction',
        componentId: source.id,
        message: `${source.id} était court-circuitée par un fil : résistance interne de 10 Ω (${id}) ajoutée pour rendre le calcul possible.`,
      });
    }
  }

  /* -------------------------------------- 6. source de courant isolée */
  for (const source of doc.components) {
    if (source.kind !== 'isource') continue;
    const degreeA = doc.components.filter((c) => c !== source && (c.a === source.a || c.b === source.a)).length;
    const degreeB = doc.components.filter((c) => c !== source && (c.a === source.b || c.b === source.b)).length;
    if (degreeA === 0 || degreeB === 0) {
      const openNode = degreeA === 0 ? source.a : source.b;
      const otherNode = degreeA === 0 ? source.b : source.a;
      const id = `Rc_${doc.components.length + 1}`;
      doc.components.push({ id, kind: 'resistor', a: openNode, b: otherNode, value: 1000 });
      fixes.push({
        code: 'source-courant-ouverte',
        severity: 'correction',
        componentId: source.id,
        message: `${source.id} débitait dans un nœud ouvert : charge de 1 kΩ (${id}) ajoutée pour fermer la maille.`,
      });
    }
  }

  /* ------------------------------------------------ 7. fréquence en AC */
  if (doc.regime === 'ac' && (!Number.isFinite(doc.frequency) || doc.frequency <= 0)) {
    doc.frequency = 50;
    fixes.push({
      code: 'frequence',
      severity: 'correction',
      message: 'Régime sinusoïdal sans fréquence valide → 50 Hz appliqué.',
    });
  }

  /* -------------------------------- 8. branches parallèles redondantes */
  const signature = new Map<string, string[]>();
  for (const c of doc.components) {
    if (c.kind === 'wire') continue;
    const key = [c.kind, ...[c.a, c.b].sort()].join('|');
    signature.set(key, [...(signature.get(key) ?? []), c.id]);
  }
  for (const [key, ids] of signature) {
    if (ids.length > 1) {
      fixes.push({
        code: 'doublon',
        severity: 'conseil',
        message: `Dipôles identiques en parallèle entre les mêmes nœuds (${key.split('|').slice(1).join(' ↔ ')}) : ${ids.join(', ')}. Vérifiez s'ils sont voulus.`,
      });
    }
  }

  /* ----------------------------------------- 9. nœuds flottants libres */
  const eq = equivalentOf(doc);
  if (!eq.ok && eq.error) {
    fixes.push({
      code: 'diagnostic',
      severity: 'conseil',
      message: `Après correction le solveur signale encore : ${eq.error}`,
    });
  }

  /* ------------------------- 10. impédance interne nulle ou infinie */
  if (eq.ok) {
    const rth = Math.hypot(eq.rth.re, eq.rth.im);
    const vth = Math.hypot(eq.vth.re, eq.vth.im);
    if (rth < 1e-9) {
      fixes.push({
        code: 'rth-nulle',
        severity: 'conseil',
        message:
          'Z_th ≈ 0 Ω : une source idéale est branchée directement entre A et B. Physiquement valide, mais aucun dipôle ne peut y dissiper de puissance — intercalez une résistance interne si c’est un exercice.',
      });
    } else if (!Number.isFinite(rth) && vth > 0) {
      fixes.push({
        code: 'rth-infinie',
        severity: 'conseil',
        message:
          'Z_th infinie avec U_th non nulle : le réseau se comporte comme une source parfaite de courant. C’est cohérent (I_N = 0), mais vérifiez qu’aucune branche ne manque.',
      });
    }
  }

  return {
    doc,
    fixes,
    changed: fixes.some((f) => f.severity === 'correction'),
    status: {
      ok: eq.ok,
      error: eq.ok ? undefined : eq.error,
      vth: eq.ok ? Math.hypot(eq.vth.re, eq.vth.im) : NaN,
      rth: eq.ok ? Math.hypot(eq.rth.re, eq.rth.im) : NaN,
      inorton: eq.ok ? Math.hypot(eq.inorton.re, eq.inorton.im) : NaN,
    },
    before: { ok: beforeEq.ok, error: beforeEq.ok ? undefined : beforeEq.error },
  };
}
