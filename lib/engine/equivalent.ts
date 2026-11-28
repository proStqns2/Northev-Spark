import { Complex, abs, cx, div, mul, scale, sub } from './complex';
import { isAc, solveDocument } from './solver';
import { CircuitDoc } from './types';

const ZERO = cx(0, 0);

export interface EquivalentStep {
  title: string;
  detail: string;
  value: string;
}

export interface SuperpositionTerm {
  id: string;
  label: string;
  kind: 'V' | 'I';
  coefficient: Complex;
  contribution: Complex;
  unit: string;
}

export interface EquivalentResult {
  ok: boolean;
  error?: string;
  status: 'ok' | 'incomplete' | 'shorted' | 'open';
  vth: Complex;
  rth: Complex;
  inorton: Complex;
  isc: Complex;
  iscMeasured: boolean;
  vthCheck: Complex;
  verificationErrorPct: number;
  warnings: string[];
  steps: EquivalentStep[];
  superposition: SuperpositionTerm[];
  nodesUsed: number;
  branchesUsed: number;
  powerMax?: number;
  ac: boolean;
  degenerate: boolean;
}

const failure = (error: string, status: EquivalentResult['status'] = 'incomplete'): EquivalentResult => ({
  ok: false,
  error,
  status,
  vth: ZERO,
  rth: cx(Infinity, 0),
  inorton: ZERO,
  isc: ZERO,
  iscMeasured: false,
  vthCheck: ZERO,
  verificationErrorPct: 0,
  warnings: [],
  steps: [],
  superposition: [],
  nodesUsed: 0,
  branchesUsed: 0,
  ac: false,
  degenerate: false,
});

/**
 * Calcule l'équivalent de Thévenin / Norton vu des bornes A-B.
 * - U_th : tension à vide lue dans la solution nodale complète
 * - Z_th : sonde de courant 1 A entre A et B, sources indépendantes éteintes
 * - I_N  : U_th / Z_th, recoupé par un court-circuit simulé réel
 */
export function equivalentOf(doc: CircuitDoc): EquivalentResult {
  if (!doc.terminals.a || !doc.terminals.b) {
    return failure('Choisissez les bornes A et B du dipôle à modéliser.', 'incomplete');
  }
  if (doc.terminals.a === doc.terminals.b) {
    return failure('Les bornes A et B sont confondues : choisissez deux points distincts.', 'shorted');
  }
  if (!doc.components.length) {
    return failure('Le montage est vide : ajoutez des dipôles puis relancez le calcul.', 'incomplete');
  }

  const ac = isAc(doc);
  const warnings: string[] = [];

  const live = solveDocument(doc, { sourcesOn: true });
  if (!live.ok) return { ...failure(live.error), warnings: live.warnings };
  warnings.push(...live.warnings);

  const va = live.voltageAt(doc.terminals.a);
  const vb = live.voltageAt(doc.terminals.b);
  const vth = sub(va, vb);

  const passive = solveDocument(doc, {
    sourcesOn: false,
    probe: { kind: 'current', a: doc.terminals.a, b: doc.terminals.b, value: 1 },
  });

  let rth = cx(Infinity, 0);
  let rthKnown = false;
  if (passive.ok) {
    const u = sub(
      passive.voltageAt(doc.terminals.a),
      passive.voltageAt(doc.terminals.b),
    );
    if (Number.isFinite(u.re) && Number.isFinite(u.im) && abs(u) < 1e15) {
      rth = u;
      rthKnown = true;
    }
  } else {
    warnings.push('Impuissance à calculer Z_th : le réseau se comporte comme un circuit ouvert vu des bornes.');
  }

  const isShort = rthKnown && abs(rth) < 1e-6;

  let isc = cx(0, 0);
  let iscMeasured = false;
  if (!isShort) {
    const sc = solveDocument(doc, {
      sourcesOn: true,
      probe: { kind: 'voltage', a: doc.terminals.a, b: doc.terminals.b, value: 0 },
    });
    if (sc.ok && sc.probeReading) {
      isc = sc.probeReading.i;
      iscMeasured = true;
    }
  } else {
    warnings.push('Bornes A et B reliées par un chemin parfaitement conducteur : Z_th = 0, dipôle de tension pure.');
  }

  const inorton = isShort
    ? cx(Infinity, 0)
    : rthKnown
      ? div(vth, rth)
      : cx(0, 0);
  const vthCheck = isShort ? cx(0, 0) : mul(inorton, rth);
  const denom = Math.max(abs(vth), abs(vthCheck), 1e-12);
  const verificationErrorPct = (abs(sub(vth, vthCheck)) / denom) * 100;

  const steps: EquivalentStep[] = [
    {
      title: 'Bornes du dipôle',
      detail: `A = « ${doc.terminals.a} » · B = « ${doc.terminals.b} » · masse : ${doc.ground || 'auto'}.`,
      value: `${live.size.nodes} nœuds · ${live.size.branches} branches en tension`,
    },
    {
      title: 'Tension à vide U_th',
      detail: 'Résolution nodale complète, sources indépendantes actives, aucune charge entre A et B.',
      value: `${abs(vth).toPrecision(6)} ${ac ? 'V (amplitude)' : 'V'}`,
    },
    {
      title: 'Sources éteintes',
      detail: 'Source de tension → fil · source de courant → circuit ouvert · sources liées conservées.',
      value: 'réseau passif',
    },
    {
      title: 'Impédance équivalente Z_th',
      detail: 'Injection d’un courant de test de 1 A entre A et B, lecture de la tension U_test.',
      value: rthKnown ? `${abs(rth).toPrecision(6)} Ω` : '∞ (ouvert)',
    },
    {
      title: 'Courant de Norton I_N',
      detail: 'I_N = U_th / Z_th — recoupé par la mesure du courant de court-circuit.',
      value: Number.isFinite(abs(inorton)) ? `${abs(inorton).toPrecision(6)} A` : '∞',
    },
  ];
  if (iscMeasured) {
    steps.push({
      title: 'Vérification croisée',
      detail: 'Le court-circuit simulé entre A et B doit redonner I_N : écart acceptable < 1 %.',
      value: `I_cc = ${abs(isc).toPrecision(6)} A · écart ${verificationErrorPct.toPrecision(3)} %`,
    });
  }
  if (rthKnown && !ac && !isShort) {
    const power = (abs(vth) * abs(vth)) / (4 * Math.max(abs(rth), 1e-12));
    steps.push({
      title: 'Adaptation d’impédance',
      detail: 'Puissance maximale transférée à une charge R_L = R_th.',
      value: `P_max = ${power.toPrecision(4)} W`,
    });
  }

  const superposition: SuperpositionTerm[] = [];
  const independent = doc.components.filter(
    (c) => c.kind === 'vsource' || c.kind === 'isource',
  );
  if (!ac && independent.length > 0 && independent.length <= 6) {
    for (const source of independent) {
      const magnitude = Math.abs(source.value);
      if (!magnitude) continue;
      const single = solveDocument(doc, { sourcesOn: true, onlySourceId: source.id });
      if (!single.ok) continue;
      const contribution = sub(
        single.voltageAt(doc.terminals.a),
        single.voltageAt(doc.terminals.b),
      );
      superposition.push({
        id: source.id,
        label: source.label ?? source.id,
        kind: source.kind === 'vsource' ? 'V' : 'I',
        coefficient: scale(contribution, 1 / magnitude),
        contribution,
        unit: source.kind === 'vsource' ? 'V/V' : 'Ω',
      });
    }
  }

  const degenerate =
    !rthKnown || isShort || (abs(vth) < 1e-12 && abs(rth) < 1e-9);

  return {
    ok: true,
    status: isShort ? 'shorted' : rthKnown ? 'ok' : 'open',
    vth,
    rth,
    inorton,
    isc,
    iscMeasured,
    vthCheck,
    verificationErrorPct,
    warnings,
    steps,
    superposition,
    nodesUsed: live.size.nodes,
    branchesUsed: live.size.branches,
    powerMax:
      rthKnown && !ac && !isShort
        ? (abs(vth) * abs(vth)) / (4 * Math.max(abs(rth), 1e-12))
        : undefined,
    ac,
    degenerate,
  };
}
