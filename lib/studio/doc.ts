import { CircuitDoc, Component, ComponentKind, DEFAULT_COMPONENT_VALUE, COMPONENT_META } from '@/lib/engine/types';
import { uid } from '@/lib/utils';
import { cellToPoint, minSpan, orientationOf, orderedEnds, pointToCell } from './geometry';

export function emptyDoc(name = 'Nouveau montage'): CircuitDoc {
  return {
    name,
    notes: '',
    components: [],
    ground: '',
    terminals: { a: null, b: null },
    regime: 'dc',
    frequency: 50,
  };
}

export function cloneDoc(doc: CircuitDoc): CircuitDoc {
  return structuredClone(doc);
}

export function nextRef(doc: CircuitDoc, kind: ComponentKind): string {
  const meta = COMPONENT_META[kind];
  const base = meta.symbol === '—' ? 'F' : meta.symbol;
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  let max = 0;
  for (const c of doc.components) {
    const match = c.label?.match(pattern);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${base}${max + 1}`;
}

export function makeLabel(doc: CircuitDoc, kind: ComponentKind, value: number): string {
  const meta = COMPONENT_META[kind];
  const ref = nextRef(doc, kind);
  if (!meta.unit) return ref;
  return `${ref} = ${formatInline(value)} ${meta.unit}`;
}

function formatInline(value: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  const units: Array<[number, string]> = [
    [1e9, 'G'],
    [1e6, 'M'],
    [1e3, 'k'],
    [1, ''],
    [1e-3, 'm'],
    [1e-6, 'µ'],
    [1e-9, 'n'],
    [1e-12, 'p'],
  ];
  for (const [scale, prefix] of units) {
    if (abs >= scale * 0.999) {
      const scaled = value / scale;
      const text = Number(scaled.toPrecision(3)).toString().replace('.', ',');
      return `${text} ${prefix}`.trim();
    }
  }
  return Number(value.toExponential(2)).toString();
}

/** Ajoute un composant en respectant l'orientation demandée */
export function addComponent(
  doc: CircuitDoc,
  kind: ComponentKind,
  start: string,
  end: string,
  overrides: Partial<Component> = {},
): { doc: CircuitDoc; component: Component } {
  const component: Component = {
    id: uid(kind.slice(0, 3)),
    kind,
    a: start,
    b: end,
    value: DEFAULT_COMPONENT_VALUE(kind),
    ...overrides,
  };
  component.label = component.label ?? makeLabel(doc, kind, component.value);
  return {
    doc: { ...doc, components: [...doc.components, component] },
    component,
  };
}

/** Déplace un composant entier d'un delta de cellules */
export function moveComponent(doc: CircuitDoc, id: string, dx: number, dy: number): CircuitDoc {
  return {
    ...doc,
    components: doc.components.map((c) => {
      if (c.id !== id) return c;
      const a = cellToPoint(c.a);
      const b = cellToPoint(c.b);
      if (!a || !b) return c;
      const next: Component = {
        ...c,
        a: pointToCell(a.x + dx, a.y + dy),
        b: pointToCell(b.x + dx, b.y + dy),
      };
      if (c.ctrl) {
        const ca = cellToPoint(c.ctrl.a);
        const cb = cellToPoint(c.ctrl.b);
        if (ca && cb) {
          next.ctrl = {
            a: pointToCell(ca.x + dx, ca.y + dy),
            b: pointToCell(cb.x + dx, cb.y + dy),
          };
        }
      }
      return next;
    }),
    terminals: {
      a: doc.terminals.a ? shiftCell(doc.terminals.a, dx, dy) : null,
      b: doc.terminals.b ? shiftCell(doc.terminals.b, dx, dy) : null,
    },
  };
}

function shiftCell(cell: string, dx: number, dy: number): string {
  const p = cellToPoint(cell);
  if (!p) return cell;
  return pointToCell(p.x + dx, p.y + dy);
}

/** Pose un bloc à droite du montage courant sans modifier ses connexions ni ses réglages. */
export function appendDoc(doc: CircuitDoc, block: CircuitDoc): CircuitDoc {
  if (!block.components.length) return doc;
  if (!doc.components.length) return block;

  const columns = (parts: Component[]) =>
    parts.flatMap(({ a, b, ctrl }) => (ctrl ? [a, b, ctrl.a, ctrl.b] : [a, b]))
      .map((cell) => cellToPoint(cell)?.x)
      .filter((x): x is number => x !== undefined && Number.isFinite(x));
  const right = columns(doc.components).reduce((max, x) => Math.max(max, x), -Infinity);
  const left = columns(block.components).reduce((min, x) => Math.min(min, x), Infinity);
  const shift = (Number.isFinite(right) ? right : 0) + 4 - (Number.isFinite(left) ? left : 0);
  const move = (node: string) => shiftCell(node, shift, 0);
  const ids = new Set(doc.components.map((part) => part.id));
  const extra = block.components.map((part) => {
    let id = part.id;
    for (let suffix = 2; ids.has(id); suffix += 1) id = `${part.id}_${suffix}`;
    ids.add(id);
    return {
      ...part,
      id,
      a: move(part.a),
      b: move(part.b),
      ...(part.ctrl ? { ctrl: { ...part.ctrl, a: move(part.ctrl.a), b: move(part.ctrl.b) } } : {}),
    };
  });
  return { ...doc, components: [...doc.components, ...extra] };
}

/** Redimensionne une branche en conservant son point d'ancrage */
export function resizeComponent(
  doc: CircuitDoc,
  id: string,
  anchor: 'a' | 'b',
  dx: number,
  dy: number,
): CircuitDoc {
  return {
    ...doc,
    components: doc.components.map((c) => {
      if (c.id !== id) return c;
      const target = anchor === 'a' ? c.a : c.b;
      return { ...c, [anchor]: shiftCell(target, dx, dy) } as Component;
    }),
  };
}

/** Raccourcit pour garantir une longueur minimale de symbole */
export function normalizeSpan(c: Component): Component {
  const span = minSpan(c.kind);
  const [a, b] = orderedEnds(c);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) + Math.abs(dy) >= span) return c;
  const orientation = orientationOf(c);
  if (orientation === 'v') {
    return { ...c, b: pointToCell(a.x, a.y + span) };
  }
  return { ...c, b: pointToCell(a.x + span, a.y) };
}

/**
 * Pivote un dipôle d'un quart de tour autour de sa borne A.
 *
 * Le canvas ne stocke pas d'angle : l'orientation est portée par la position
 * de la borne B (le symbole est dessiné dans le repère A→B). Quatre rotations
 * ramènent donc exactement au montage d'origine.
 */
export function rotateComponent(doc: CircuitDoc, id: string): CircuitDoc {
  const component = doc.components.find((c) => c.id === id);
  if (!component) return doc;
  const [ax, ay] = component.a.split(',').map(Number);
  const [bx, by] = component.b.split(',').map(Number);
  const dx = bx - ax;
  const dy = by - ay;
  const nextB = pointToCell(ax - dy, ay + dx);
  return updateComponent(doc, id, normalizeSpan({ ...component, b: nextB }));
}

export function updateComponent(doc: CircuitDoc, id: string, patch: Partial<Component>): CircuitDoc {
  return {
    ...doc,
    components: doc.components.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  };
}

export function removeComponent(doc: CircuitDoc, id: string): CircuitDoc {
  return {
    ...doc,
    components: doc.components.filter((c) => c.id !== id),
    terminals: {
      a: doc.terminals.a,
      b: doc.terminals.b,
    },
  };
}

export function duplicateDoc(doc: CircuitDoc): CircuitDoc {
  return { ...cloneDoc(doc), name: `${doc.name} (copie)` };
}

/** Statistiques rapides d'un document */
export function docStats(doc: CircuitDoc) {
  const counts: Partial<Record<ComponentKind, number>> = {};
  for (const c of doc.components) counts[c.kind] = (counts[c.kind] ?? 0) + 1;
  const nodes = new Set<string>();
  doc.components.forEach((c) => {
    nodes.add(c.a);
    nodes.add(c.b);
  });
  return { components: doc.components.length, nodes: nodes.size, counts };
}

/** Nettoie un document importé (ids uniques, labels, spans) */
export function sanitizeDoc(doc: CircuitDoc): CircuitDoc {
  const seen = new Set<string>();
  const components = doc.components.map((c) => {
    let id = c.id || uid('c');
    while (seen.has(id)) id = uid('c');
    seen.add(id);
    return normalizeSpan({ ...c, id, label: c.label ?? c.id });
  });
  const nodes = new Set<string>();
  components.forEach((c) => {
    nodes.add(c.a);
    nodes.add(c.b);
  });
  const ground = nodes.has(doc.ground) ? doc.ground : [...nodes][0] ?? '';
  return {
    ...doc,
    components,
    ground,
    terminals: {
      a: doc.terminals.a && nodes.has(doc.terminals.a) ? doc.terminals.a : null,
      b: doc.terminals.b && nodes.has(doc.terminals.b) ? doc.terminals.b : null,
    },
  };
}
