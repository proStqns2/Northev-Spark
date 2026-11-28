/**
 * Tests du cœur de l'atelier.
 *
 * Ces tests remplacent le navigateur pour tout ce qui compte : est-ce qu'un
 * clic dans la palette suivi d'un clic sur le plan crée bien un dipôle ? Est-ce
 * qu'un fil se trace ? Est-ce qu'annuler restaure l'état précédent ? Si l'une
 * de ces réponses devient « non », le test casse avant l'utilisateur.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@/lib/studio/doc';
import {
  addWire,
  canRedo,
  canUndo,
  cellKey,
  clearDoc,
  createEditor,
  diagnose,
  docBounds,
  docSummary,
  duplicatePart,
  finishWire,
  flipPart,
  fromJson,
  mergeNodes,
  moveNode,
  movePart,
  nearestNode,
  nodesOf,
  parseCell,
  partAtCell,
  partGeometry,
  placePart,
  placePartFrom,
  redo,
  removePart,
  replaceDoc,
  rotatePart,
  selectedPart,
  setGround,
  setRegime,
  setTerminal,
  shortcutFor,
  startWire,
  toJson,
  undo,
  updatePart,
} from './editor';

function seeded() {
  const state = createEditor(emptyDoc('Test'));
  const placed = placePart(state, 'vsource', { x: 2, y: 2 });
  assert.ok(placed.component);
  return { state: placed.state, source: placed.component! };
}

describe('géométrie de l’atelier', () => {
  it('convertit cellules et pixels sans perte', () => {
    assert.deepEqual(parseCell('3,4'), { x: 3, y: 4 });
    assert.equal(cellKey(3.2, 4.6), '3,5');
    assert.equal(parseCell('n’importe quoi'), null);
  });

  it('décrit chaque dipôle par ses deux bornes', () => {
    const horizontal = partGeometry({ a: '1,1', b: '4,1' });
    assert.equal(horizontal?.orientation, 'h');
    assert.equal(horizontal?.span, 3);
    const vertical = partGeometry({ a: '1,1', b: '1,5' });
    assert.equal(vertical?.orientation, 'v');
    const diagonal = partGeometry({ a: '1,1', b: '3,4' });
    assert.equal(diagonal?.orientation, 'd');
    assert.equal(partGeometry({ a: 'x', b: 'y' }), null);
  });

  it('trouve le dipôle sous le curseur, pas les fils', () => {
    const { state, source } = seeded();
    assert.equal(partAtCell(state.doc, { x: 2, y: 2 })?.id, source.id);
    const withWire = addWire(state.doc, '2,2', '6,2').doc;
    assert.equal(partAtCell(withWire, { x: 4, y: 2 }), null);
    assert.equal(partAtCell(withWire, { x: 4, y: 2 }, { includeWires: true })?.kind, 'wire');
  });

  it('trouve le nœud le plus proche', () => {
    const { state } = seeded();
    assert.equal(nearestNode(state.doc, { x: 2, y: 2 }), '2,2');
    assert.equal(nearestNode(state.doc, { x: 2, y: 3 }, 1), '2,2');
    assert.equal(nearestNode(state.doc, { x: 20, y: 20 }, 1), null);
  });

  it('borne le document avec une marge', () => {
    const { state } = seeded();
    const bounds = docBounds(state.doc);
    assert.ok(bounds.width > 100);
    assert.ok(bounds.height > 100);
    assert.ok(bounds.minX <= 2 * 24);
    assert.ok(bounds.maxX >= 2 * 24);
    assert.deepEqual(docSummary(state.doc), '1 dipôle · 0 fil · 2 nœuds');
  });
});

describe('poser une pièce', () => {
  it('crée un dipôle à l’endroit cliqué et le sélectionne', () => {
    const state = createEditor(emptyDoc());
    const { state: next, component } = placePart(state, 'resistor', { x: 4, y: 3 });
    assert.ok(component);
    assert.equal(next.doc.components.length, 1);
    assert.equal(next.doc.components[0].kind, 'resistor');
    assert.equal(next.doc.components[0].label, 'R1');
    assert.equal(next.selectedId, component!.id);
    assert.equal(selectedPart(next)?.kind, 'resistor');
    assert.ok(canUndo(next));
  });

  it('numérote les pièces de la même famille', () => {
    let state = createEditor(emptyDoc());
    state = placePart(state, 'resistor', { x: 2, y: 2 }).state;
    state = placePart(state, 'resistor', { x: 6, y: 2 }).state;
    state = placePart(state, 'capacitor', { x: 10, y: 2 }).state;
    assert.deepEqual(state.doc.components.map((part) => part.label), ['R1', 'R2', 'C1']);
  });

  it('enchaîne deux dipôles en série sur un nœud commun (sans plan)', () => {
    let state = createEditor(emptyDoc());
    const first = placePart(state, 'resistor', { x: 2, y: 2 });
    state = first.state;
    const second = placePartFrom(state, 'resistor', parseCell(first.component!.b)!);
    assert.ok(second.component);
    assert.equal(second.component!.a, first.component!.b, 'la borne A reprend le nœud du précédent');
    assert.notEqual(second.component!.b, second.component!.a);
    assert.equal(second.state.doc.components.length, 2);
  });

  it('placePartFrom refuse de superposer deux dipôles', () => {
    let state = createEditor(emptyDoc());
    state = placePart(state, 'resistor', { x: 2, y: 2 }).state;
    const wrapped = { ...state, doc: { ...state.doc, components: [state.doc.components[0]] } };
    const result = placePartFrom(wrapped, 'capacitor', parseCell(wrapped.doc.components[0].a)!);
    // la cellule voisine droite est libre : le condensateur s'y pose, sans doublon
    assert.ok(result.component);
    assert.notEqual(result.component!.b, wrapped.doc.components[0].b);
  });

  it('définit une masse dès la première pièce (le solveur exige une référence)', () => {
    const { state, source } = seeded();
    assert.equal(state.doc.ground, source.a);
  });

  it('décale automatiquement si la place est prise', () => {
    let state = createEditor(emptyDoc());
    state = placePart(state, 'resistor', { x: 2, y: 2 }).state;
    const second = placePart(state, 'resistor', { x: 2, y: 2 });
    assert.ok(second.component);
    assert.notEqual(second.component!.a, '2,2');
    assert.equal(second.state.doc.components.length, 2);
  });

  it('pose les sources verticalement et les passifs horizontalement', () => {
    let state = createEditor(emptyDoc());
    const source = placePart(state, 'vsource', { x: 2, y: 2 }).component!;
    assert.equal(partGeometry(source)?.orientation, 'v');
    state = placePart(state, 'capacitor', { x: 6, y: 2 }).state;
    const capacitor = state.doc.components.find((part) => part.kind === 'capacitor')!;
    assert.equal(partGeometry(capacitor)?.orientation, 'h');
  });

  it('donne une valeur par défaut exploitable', () => {
    const { state } = seeded();
    assert.equal(state.doc.components[0].value, 12);
    const resistor = placePart(state, 'resistor', { x: 8, y: 8 }).component!;
    assert.equal(resistor.value, 1000);
  });
});

describe('déplacer, pivoter, supprimer', () => {
  it('déplace un dipôle et enregistre une étape d’historique', () => {
    const { state, source } = seeded();
    const moved = movePart(state, source.id, { x: 3, y: 1 });
    assert.equal(moved.doc.components[0].a, '5,3');
    assert.equal(moved.doc.components[0].b, '5,5');
    assert.equal(moved.history.length, 2);
    assert.equal(canUndo(moved), true);
  });

  it('peut déplacer sans historique pendant un glisser', () => {
    const { state, source } = seeded();
    const dragged = movePart(state, source.id, { x: 1, y: 0 }, { commit: false });
    assert.equal(dragged.history.length, 1);
    assert.equal(dragged.doc.components[0].a, '3,2');
  });

  it('déplace un nœud et tout ce qui s’y raccorde', () => {
    let state = createEditor(emptyDoc());
    const first = placePart(state, 'resistor', { x: 0, y: 0 }).state;
    state = placePart(first, 'capacitor', { x: 2, y: 0 }).state;
    // 0,0 — 1,0 (R)   2,0 — 3,0 (C)
    const moved = moveNode(state, '0,0', { x: 0, y: 4 });
    assert.equal(moved.doc.components[0].a, '0,4');
    assert.equal(moved.doc.components[1].a, '3,0');
  });

  it('pivote autour de la borne A', () => {
    const { state, source } = seeded();
    const rotated = rotatePart(state, source.id);
    const part = rotated.doc.components[0];
    assert.equal(parseCell(part.a)?.y, parseCell(part.b)?.y === parseCell(part.a)?.y ? parseCell(part.b)!.y : parseCell(part.b)!.y);
    // verticale (2,2) → horizontal (4,2)
    assert.equal(part.a, '2,2');
    assert.equal(part.b, '4,2');
    const back = rotatePart(rotated, source.id);
    assert.equal(back.doc.components[0].b, '2,4');
  });

  it('inverse la polarité', () => {
    const { state, source } = seeded();
    const flipped = flipPart(state, source.id);
    assert.equal(flipped.doc.components[0].a, source.b);
    assert.equal(flipped.doc.components[0].b, source.a);
  });

  it('supprime et vide la sélection', () => {
    const { state, source } = seeded();
    const selected = { ...state, selectedId: source.id };
    const removed = removePart(selected, source.id);
    assert.equal(removed.doc.components.length, 0);
    assert.equal(removed.selectedId, null);
  });

  it('duplique un dipôle deux cellules plus bas', () => {
    const { state, source } = seeded();
    const duplicated = duplicatePart(state, source.id);
    assert.equal(duplicated.doc.components.length, 2);
    assert.equal(duplicated.doc.components[1].a, '2,4');
    assert.equal(duplicated.selectedId, duplicated.doc.components[1].id);
  });

  it('modifie une valeur sans perdre le reste', () => {
    const { state, source } = seeded();
    const updated = updatePart(state, source.id, { value: 24 });
    assert.equal(updated.doc.components[0].value, 24);
    assert.equal(updated.doc.components[0].kind, 'vsource');
  });
});

describe('câblage', () => {
  it('ajoute un fil une seule fois', () => {
    const { state } = seeded();
    const first = addWire(state.doc, '2,2', '7,2');
    assert.equal(first.added, true);
    assert.equal(first.doc.components.length, 2);
    const again = addWire(first.doc, '7,2', '2,2');
    assert.equal(again.added, false);
    assert.equal(again.doc.components.length, 2);
    const self = addWire(state.doc, '2,2', '2,2');
    assert.equal(self.added, false);
  });

  it('trace un fil en deux clics', () => {
    const { state } = seeded();
    const started = startWire(state, '2,2');
    assert.equal(started.wireFrom, '2,2');
    const { state: finished, message } = finishWire(started, '9,2');
    assert.equal(message, 'Fil ajouté.');
    assert.equal(finished.wireFrom, null);
    assert.equal(finished.doc.components.filter((part) => part.kind === 'wire').length, 1);
  });

  it('annule un fil qui revient sur la même borne', () => {
    const { state } = seeded();
    const started = startWire(state, '2,3');
    const { state: cancelled, message } = finishWire(started, '2,3');
    assert.match(message, /annulé/);
    assert.equal(cancelled.doc.components.length, 1);
  });

  it('fusionne deux nœuds et supprime les fils devenus nuls', () => {
    const { state } = seeded();
    const wired = addWire(state.doc, '2,3', '8,3').doc;
    const merged = mergeNodes({ ...state, doc: wired }, '8,3', '2,3');
    assert.equal(merged.doc.components.some((part) => part.kind === 'wire'), false);
    assert.equal(nodesOf(merged.doc).includes('8,3'), false);
  });

  it('déplace la masse et les bornes quand on renomme un nœud', () => {
    const { state } = seeded();
    const grounded = setGround(state, '2,3');
    const merged = mergeNodes(grounded, '2,3', '4,3');
    assert.equal(merged.doc.ground, '4,3');
  });
});

describe('masse et bornes', () => {
  it('change la masse', () => {
    const { state } = seeded();
    const next = setGround(state, '2,3');
    assert.equal(next.doc.ground, '2,3');
  });

  it('définit les bornes A et B', () => {
    const { state } = seeded();
    const withA = setTerminal(state, 'a', '2,2');
    const withB = setTerminal(withA, 'b', '2,3');
    assert.deepEqual(withB.doc.terminals, { a: '2,2', b: '2,3' });
  });

  it('bascule en alternatif en conservant la fréquence', () => {
    const { state } = seeded();
    const next = setRegime(state, 'ac', 400);
    assert.equal(next.doc.regime, 'ac');
    assert.equal(next.doc.frequency, 400);
    assert.equal(setRegime(next, 'dc').doc.regime, 'dc');
  });
});

describe('historique', () => {
  it('annule puis rétablit une pose', () => {
    const { state } = seeded();
    const undone = undo(state);
    assert.equal(undone.doc.components.length, 0);
    assert.equal(canRedo(undone), true);
    const redone = redo(undone);
    assert.equal(redone.doc.components.length, 1);
    assert.equal(canRedo(redone), false);
  });

  it('empile plusieurs actions et revient au début', () => {
    let state = createEditor(emptyDoc());
    state = placePart(state, 'resistor', { x: 2, y: 2 }).state;
    state = placePart(state, 'resistor', { x: 6, y: 2 }).state;
    state = placePart(state, 'capacitor', { x: 10, y: 2 }).state;
    state = undo(undo(undo(state)));
    assert.equal(state.doc.components.length, 0);
    assert.equal(canUndo(state), false);
  });

  it('une nouvelle action efface le futur', () => {
    const { state } = seeded();
    const undone = undo(state);
    const placed = placePart(undone, 'capacitor', { x: 6, y: 6 }).state;
    assert.equal(canRedo(placed), false);
  });

  it('vide le montage tout en gardant le nom', () => {
    const { state } = seeded();
    const cleared = clearDoc({ ...state, doc: { ...state.doc, name: 'Mon montage' } });
    assert.equal(cleared.doc.components.length, 0);
    assert.equal(cleared.doc.name, 'Mon montage');
    assert.equal(cleared.doc.ground, '');
  });

  it('remplace le document en gardant l’historique', () => {
    const { state } = seeded();
    const other = emptyDoc('Autre');
    const replaced = replaceDoc(state, other);
    assert.equal(replaced.doc.name, 'Autre');
    assert.equal(canUndo(replaced), true);
  });
});

describe('diagnostics', () => {
  it('signale un plan vide avec un conseil', () => {
    const issues = diagnose(emptyDoc());
    assert.equal(issues[0].level, 'info');
    assert.match(issues[0].hint ?? '', /palette/);
  });

  it('exige une masse', () => {
    const doc = {
      ...emptyDoc(),
      components: [{ id: 'r1', kind: 'resistor' as const, a: '1,1', b: '3,1', value: 10, label: 'R1' }],
      ground: '',
    };
    assert.ok(diagnose(doc).some((issue) => /masse/i.test(issue.message)));
  });

  it('signale l’absence de source', () => {
    const { state } = seeded();
    const noSource = { ...state.doc, components: state.doc.components.filter((part) => part.kind !== 'vsource') };
    const withResistor = {
      ...noSource,
      components: [...noSource.components, { id: 'r1', kind: 'resistor' as const, a: '1,1', b: '2,1', value: 10, label: 'R1' }],
    };
    assert.ok(diagnose(withResistor).some((issue) => /source/i.test(issue.message)));
  });

  it('signale les bornes isolées', () => {
    const { state } = seeded();
    const issues = diagnose(state.doc);
    assert.ok(issues.some((issue) => /isolée/.test(issue.message)));
  });

  it('valide un montage fermé', () => {
    let state = createEditor(emptyDoc());
    state = placePart(state, 'vsource', { x: 2, y: 4 }).state; // 2,4 → 2,6
    state = placePart(state, 'resistor', { x: 2, y: 4 }).state; // occupé → décalé
    // montage explicite : source verticale + résistance horizontale reliée par deux fils
    const doc = {
      ...state.doc,
      components: [
        { id: 's', kind: 'vsource' as const, a: '2,2', b: '2,4', value: 12 },
        { id: 'r', kind: 'resistor' as const, a: '2,2', b: '5,2', value: 100 },
        { id: 'w', kind: 'wire' as const, a: '5,2', b: '5,4', value: 0 },
        { id: 'w2', kind: 'wire' as const, a: '5,4', b: '2,4', value: 0 },
      ],
      ground: '2,4',
      terminals: { a: '2,2', b: '2,4' },
    };
    const issues = diagnose(doc);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].level, 'info');
    assert.match(issues[0].message, /cohérent/);
  });
});

describe('raccourcis clavier', () => {
  it('associe les touches aux outils', () => {
    assert.deepEqual(shortcutFor({ key: 'r' }), { type: 'place', kind: 'resistor' });
    assert.deepEqual(shortcutFor({ key: 'R', shiftKey: true }), { type: 'rotate' });
    assert.deepEqual(shortcutFor({ key: 't' }), { type: 'rotate' });
    assert.deepEqual(shortcutFor({ key: 'E' }), { type: 'place', kind: 'vsource' });
    assert.deepEqual(shortcutFor({ key: 'w' }), { type: 'wire' });
    assert.deepEqual(shortcutFor({ key: 'v' }), { type: 'select' });
    assert.deepEqual(shortcutFor({ key: 'm' }), { type: 'ground' });
    assert.deepEqual(shortcutFor({ key: 'Delete' }), { type: 'delete' });
    assert.deepEqual(shortcutFor({ key: 'z', ctrlKey: true }), { type: 'undo' });
    assert.deepEqual(shortcutFor({ key: 'z', ctrlKey: true, shiftKey: true }), { type: 'redo' });
    assert.deepEqual(shortcutFor({ key: 'Enter' }), { type: 'solve' });
    assert.equal(shortcutFor({ key: 'ß' }), null);
  });
});

describe('import / export', () => {
  it('fait un aller-retour JSON sans perte', () => {
    const { state } = seeded();
    const parsed = fromJson(toJson(state));
    assert.ok(parsed);
    assert.equal(parsed!.components.length, 1);
    assert.equal(parsed!.components[0].kind, 'vsource');
  });

  it('refuse un JSON invalide', () => {
    assert.equal(fromJson('{'), null);
    assert.equal(fromJson('{"name":"x"}'), null);
  });
});
