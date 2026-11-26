import { Complex, abs, add, conj, cx, mul, neg, sub } from './complex';
import { UnionFind, solveLinearSystem, SingularMatrixError } from './linalg';
import { CircuitDoc, Component } from './types';

const GMIN = 1e-12;
const VOLTMETER_R = 1e9;

export interface Probe {
  kind: 'current' | 'voltage';
  a: string;
  b: string;
  value: number;
}

export interface SolveOptions {
  /** false ⇒ sources indépendantes éteintes (E → fil, I → ouvert) */
  sourcesOn: boolean;
  probe?: Probe;
  /** n'active qu'une seule source indépendante (théorème de superposition) */
  onlySourceId?: string;
}

export interface Reading {
  v: Complex;
  i: Complex;
  p: Complex;
  indeterminate?: boolean;
}

export interface AnalysisResult {
  ok: true;
  nodeVoltages: Record<string, Complex>;
  /** résolutions par nœud original (après fusion des fils) */
  voltageAt: (node: string) => Complex;
  readings: Record<string, Reading>;
  probeReading?: Reading;
  warnings: string[];
  size: { nodes: number; branches: number; components: number };
  ground: string;
}

export interface AnalysisFailure {
  ok: false;
  error: string;
  warnings: string[];
}

export type SolveResult = AnalysisResult | AnalysisFailure;

interface Branch {
  a: string;
  b: string;
  rhs: Complex;
  tag: string;
  componentId?: string;
}

interface Netlist {
  canon: Map<string, string>;
  ground: string;
  nodes: string[];
  nodesOf: Map<string, number>;
  admittances: Array<{ a: string; b: string; y: Complex; componentId?: string }>;
  branches: Branch[];
  injections: Array<{ a: string; b: string; s: Complex; componentId?: string }>;
  /** sources liées en tension : relation de contrôle (nœuds canoniques) */
  vcvs: Map<string, { cp: string; cn: string; gain: number }>;
  /** sources liées en courant */
  vccs: Map<string, { cp: string; cn: string; gain: number }>;
  warnings: string[];
}

export const omegaOf = (doc: CircuitDoc): number =>
  2 * Math.PI * Math.max(doc.frequency || 0, 0);

export const isAc = (doc: CircuitDoc): boolean => doc.regime === 'ac';

const phasor = (amplitude: number, phaseDeg: number): Complex => {
  const rad = (phaseDeg * Math.PI) / 180;
  return cx(amplitude * Math.cos(rad), amplitude * Math.sin(rad));
};

export function sourceEmf(c: Component, ac: boolean): Complex {
  if (ac && c.ac) return phasor(c.ac.amplitude, c.ac.phaseDeg);
  return cx(c.value, 0);
}

export function impedanceOf(c: Component, ac: boolean, omega: number): Complex {
  switch (c.kind) {
    case 'resistor':
    case 'potentiometer':
    case 'lamp':
      return cx(Math.max(c.value, 1e-9), 0);
    case 'capacitor':
      return ac ? cx(0, -1 / (omega * Math.max(c.value, 1e-18))) : cx(Infinity, 0);
    case 'inductor':
      return ac ? cx(0, omega * Math.max(c.value, 0)) : cx(0, 0);
    case 'voltmeter':
      return cx(VOLTMETER_R, 0);
    default:
      return cx(0, 0);
  }
}

const recip = (z: Complex): Complex => {
  const d = z.re * z.re + z.im * z.im;
  if (d === 0 || !Number.isFinite(d)) return cx(0, 0);
  return cx(z.re / d, -z.im / d);
};

function idealShort(c: Component, ac: boolean, sourcesOn: boolean): boolean {
  switch (c.kind) {
    case 'wire':
      return true;
    case 'switch':
      return c.closed !== false;
    case 'inductor':
      return !ac;
    case 'vsource':
      return !sourcesOn;
    default:
      return false;
  }
}

export function buildNetlist(
  doc: CircuitDoc,
  options: SolveOptions,
  extra: {
    admittances?: Netlist['admittances'];
    branches?: Branch[];
    injections?: Netlist['injections'];
  } = {},
): Netlist {
  const ac = isAc(doc);
  const warnings: string[] = [];
  const uf = new UnionFind();

  for (const c of doc.components) {
    uf.add(c.a);
    uf.add(c.b);
    if (c.ctrl) {
      uf.add(c.ctrl.a);
      uf.add(c.ctrl.b);
    }
  }
  if (doc.ground) uf.add(doc.ground);
  if (doc.terminals.a) uf.add(doc.terminals.a);
  if (doc.terminals.b) uf.add(doc.terminals.b);
  if (options.probe) {
    uf.add(options.probe.a);
    uf.add(options.probe.b);
  }

  for (const c of doc.components) {
    if (idealShort(c, ac, options.sourcesOn)) uf.union(c.a, c.b);
  }

  const canon = new Map<string, string>();
  for (const n of uf.nodes()) canon.set(n, uf.find(n));
  const canonical = (n: string): string => canon.get(n) ?? n;

  let ground = doc.ground ? canonical(doc.ground) : '';
  if (!ground && doc.terminals.b) ground = canonical(doc.terminals.b);
  if (!ground) {
    const first = uf.nodes()[0];
    ground = first ? canonical(first) : 'GND';
  }

  const nodes: string[] = [];
  const nodesOf = new Map<string, number>();
  for (const n of uf.nodes()) {
    const root = canonical(n);
    if (root === ground) continue;
    if (!nodesOf.has(root)) {
      nodesOf.set(root, nodes.length);
      nodes.push(root);
    }
  }

  const netlist: Netlist = {
    canon,
    ground,
    nodes,
    nodesOf,
    admittances: [...(extra.admittances ?? [])],
    branches: [...(extra.branches ?? [])],
    injections: [...(extra.injections ?? [])],
    vcvs: new Map(),
    vccs: new Map(),
    warnings,
  };

  const omega = omegaOf(doc);

  for (const c of doc.components) {
    const a = canonical(c.a);
    const b = canonical(c.b);

    switch (c.kind) {
      case 'wire':
      case 'switch':
      case 'inductor':
        if (c.kind === 'inductor' && ac) {
          netlist.admittances.push({ a, b, y: recip(cx(0, omega * c.value)), componentId: c.id });
        }
        break;
      case 'capacitor':
        if (ac) netlist.admittances.push({ a, b, y: cx(0, omega * c.value), componentId: c.id });
        break;
      case 'vsource':
        if (options.sourcesOn && (!options.onlySourceId || options.onlySourceId === c.id)) {
          netlist.branches.push({
            a,
            b,
            rhs: sourceEmf(c, ac),
            tag: c.id,
            componentId: c.id,
          });
        }
        break;
      case 'isource': {
        if (!options.sourcesOn) break;
        if (options.onlySourceId && options.onlySourceId !== c.id) break;
        const s = sourceEmf(c, ac);
        netlist.injections.push({ a, b, s, componentId: c.id });
        break;
      }
      case 'vcvs': {
        netlist.branches.push({ a, b, rhs: cx(0, 0), tag: c.id, componentId: c.id });
        netlist.vcvs.set(c.id, {
          cp: canonical(c.ctrl?.a ?? c.a),
          cn: canonical(c.ctrl?.b ?? c.b),
          gain: c.gain ?? 1,
        });
        break;
      }
      case 'vccs': {
        netlist.vccs.set(c.id, {
          cp: canonical(c.ctrl?.a ?? c.a),
          cn: canonical(c.ctrl?.b ?? c.b),
          gain: c.gain ?? 1,
        });
        break;
      }
      default: {
        const z = impedanceOf(c, ac, omega);
        if (Number.isFinite(z.re) && Number.isFinite(z.im)) {
          netlist.admittances.push({ a, b, y: recip(z), componentId: c.id });
        }
        break;
      }
    }
  }

  if (options.probe) {
    const a = canonical(options.probe.a);
    const b = canonical(options.probe.b);
    if (options.probe.kind === 'current') {
      netlist.injections.push({ a, b, s: cx(options.probe.value, 0) });
    } else {
      netlist.branches.push({ a, b, rhs: cx(options.probe.value, 0), tag: '__probe' });
    }
  }

  return netlist;
}

export function solveDocument(doc: CircuitDoc, options: SolveOptions): SolveResult {
  const warnings: string[] = [];
  if (!doc.components.length) {
    return {
      ok: false,
      error: 'Le montage est vide : ajoutez des dipôles sur la grille.',
      warnings,
    };
  }

  const net = buildNetlist(doc, options);
  const { nodes, nodesOf, branches, ground } = net;
  const n = nodes.length;
  const m = branches.length;
  const size = n + m;

  const A: Complex[][] = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => cx(0, 0)),
  );
  const rhs: Complex[] = Array.from({ length: size }, () => cx(0, 0));
  for (let i = 0; i < n; i++) A[i][i] = cx(GMIN, 0);

  const index = (node: string): number => {
    if (node === ground) return -1;
    return nodesOf.get(node) ?? -1;
  };

  for (const { a, b, y } of net.admittances) {
    const ia = index(a);
    const ib = index(b);
    if (ia >= 0) A[ia][ia] = add(A[ia][ia], y);
    if (ib >= 0) A[ib][ib] = add(A[ib][ib], y);
    if (ia >= 0 && ib >= 0) {
      A[ia][ib] = sub(A[ia][ib], y);
      A[ib][ia] = sub(A[ib][ia], y);
    }
  }

  for (const { a, b, s } of net.injections) {
    const ia = index(a);
    const ib = index(b);
    if (ia >= 0) rhs[ia] = add(rhs[ia], s);
    if (ib >= 0) rhs[ib] = sub(rhs[ib], s);
  }

  branches.forEach((br, k) => {
    const ia = index(br.a);
    const ib = index(br.b);
    const row = n + k;
    if (ia >= 0) {
      A[ia][row] = add(A[ia][row], cx(1, 0));
      A[row][ia] = add(A[row][ia], cx(1, 0));
    }
    if (ib >= 0) {
      A[ib][row] = sub(A[ib][row], cx(1, 0));
      A[row][ib] = sub(A[row][ib], cx(1, 0));
    }
    rhs[row] = br.rhs;

    const control = net.vcvs.get(br.tag);
    if (control) {
      const cp = index(control.cp);
      const cn = index(control.cn);
      if (cp >= 0) A[row][cp] = sub(A[row][cp], cx(control.gain, 0));
      if (cn >= 0) A[row][cn] = add(A[row][cn], cx(control.gain, 0));
    }
  });

  for (const c of doc.components) {
    const control = net.vccs.get(c.id);
    if (!control) continue;
    const a = net.canon.get(c.a) ?? c.a;
    const b = net.canon.get(c.b) ?? c.b;
    const ia = index(a);
    const ib = index(b);
    const cp = index(control.cp);
    const cn = index(control.cn);
    const g = cx(control.gain, 0);
    if (ia >= 0) {
      if (cp >= 0) A[ia][cp] = sub(A[ia][cp], g);
      if (cn >= 0) A[ia][cn] = add(A[ia][cn], g);
    }
    if (ib >= 0) {
      if (cp >= 0) A[ib][cp] = add(A[ib][cp], g);
      if (cn >= 0) A[ib][cn] = sub(A[ib][cn], g);
    }
  }

  const shortedSources = branches.filter(
    (br) =>
      br.tag !== '__probe' && br.a === br.b && abs(sub(br.rhs, cx(0, 0))) > 1e-9,
  );

  let solution: Complex[];
  try {
    solution = solveLinearSystem(A, rhs);
  } catch (error) {
    if (error instanceof SingularMatrixError) {
      return {
        ok: false,
        error:
          'Système singulier : deux sources de tension idéales en parallèle, boucle de sources, ou nœud flottant sans référence. Ajoutez une masse ou une résistance de liaison.',
        warnings,
      };
    }
    throw error;
  }

  for (const br of shortedSources) {
    const component = doc.components.find((c) => c.id === br.componentId);
    warnings.push(
      `Source de tension court-circuitée : ${component?.label ?? br.tag}. Le courant est limité uniquement par la résistance interne (ici nulle).`,
    );
  }

  const voltageAt = (node: string): Complex => {
    const root = net.canon.get(node) ?? node;
    if (root === ground) return cx(0, 0);
    const i = nodesOf.get(root);
    if (i === undefined) return cx(0, 0);
    const v = solution[i] ?? cx(0, 0);
    return Number.isFinite(v.re) && Number.isFinite(v.im) ? v : cx(0, 0);
  };

  const nodeVoltages: Record<string, Complex> = {};
  nodeVoltages[ground] = cx(0, 0);
  for (const node of nodes) nodeVoltages[node] = voltageAt(node);

  const readings: Record<string, Reading> = {};
  const branchByTag = new Map<string, number>();
  branches.forEach((br, k) => branchByTag.set(br.tag, k));

  for (const c of doc.components) {
    const a = net.canon.get(c.a) ?? c.a;
    const b = net.canon.get(c.b) ?? c.b;
    const v = sub(voltageAt(a), voltageAt(b));
    const k = branchByTag.get(c.id);
    if (k !== undefined) {
      const i = solution[n + k] ?? cx(0, 0);
      readings[c.id] = { v, i, p: mul(v, conj(i)) };
    } else if (c.kind === 'isource') {
      const active = options.sourcesOn && (!options.onlySourceId || options.onlySourceId === c.id);
      const i = active ? neg(sourceEmf(c, isAc(doc))) : cx(0, 0);
      readings[c.id] = { v, i, p: mul(v, conj(i)) };
    } else {
      const z = impedanceOf(c, isAc(doc), omegaOf(doc));
      if (Number.isFinite(z.re) && Number.isFinite(z.im) && abs(z) > 0) {
        const y = recip(z);
        const i = mul(y, v);
        readings[c.id] = { v, i, p: mul(v, conj(i)) };
      } else {
        readings[c.id] = { v, i: cx(NaN, NaN), p: cx(NaN, NaN), indeterminate: true };
      }
    }
  }

  let probeReading: Reading | undefined;
  if (options.probe) {
    const v = sub(voltageAt(options.probe.a), voltageAt(options.probe.b));
    if (options.probe.kind === 'current') {
      const i = cx(options.probe.value, 0);
      probeReading = { v, i, p: mul(v, conj(i)) };
    } else {
      const k = branchByTag.get('__probe');
      const i = k !== undefined ? solution[n + k] ?? cx(0, 0) : cx(0, 0);
      probeReading = { v, i, p: mul(v, conj(i)) };
    }
  }

  return {
    ok: true,
    nodeVoltages,
    voltageAt,
    readings,
    probeReading,
    warnings,
    size: { nodes: n, branches: m, components: doc.components.length },
    ground,
  };
}
