/**
 * Tests du sillage des curseurs : bornes en nombre, en durée, et conversion
 * en polyligne. C'est ce qui évite qu'un pair rapide « saute » à l'écran.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TRAIL_MAX,
  TRAIL_MS,
  advanceTrail,
  trailOpacity,
  trailPolyline,
  type TrailPoint,
} from './cursorTrails';

const toPx = (cell: { x: number; y: number }) => ({ x: cell.x * 10, y: cell.y * 10 });

describe('sillage des curseurs', () => {
  it('empile les positions successives', () => {
    let trail: TrailPoint[] = [];
    for (let index = 0; index < 6; index += 1) {
      trail = advanceTrail(trail, { x: index, y: index }, 1000 + index * 100);
    }
    assert.equal(trail.length, 6);
    assert.deepEqual(trail[5], { x: 5, y: 5, t: 1500 });
  });

  it('ignore le bruit de mesure et les répétitions', () => {
    const start = advanceTrail(undefined, { x: 1, y: 1 }, 1000);
    const same = advanceTrail(start, { x: 1.001, y: 1.001 }, 1050);
    assert.equal(same, start, 'même tableau : rien n’a bougé');
  });

  it('élague par le temps', () => {
    let trail: TrailPoint[] = [];
    for (let index = 0; index < 12; index += 1) {
      trail = advanceTrail(trail, { x: index, y: 0 }, 1000 + index * 120);
    }
    const last = trail[trail.length - 1];
    for (const point of trail) {
      assert.ok(last.t - point.t < TRAIL_MS, 'aucun point plus vieux que la fenêtre');
    }
  });

  it('borne le nombre de points', () => {
    let trail: TrailPoint[] = [];
    for (let index = 0; index < 200; index += 1) {
      trail = advanceTrail(trail, { x: index * 0.06, y: 0 }, 1000 + index);
    }
    assert.ok(trail.length <= TRAIL_MAX, `${trail.length} ≤ ${TRAIL_MAX}`);
  });

  it('rend une polyligne en pixels écran, pas de point non fini', () => {
    const points: TrailPoint[] = [
      { x: 0, y: 0, t: 1 },
      { x: 1, y: 2, t: 2 },
      { x: 2, y: 4, t: 3 },
    ];
    const polyline = trailPolyline(points, toPx);
    assert.equal(polyline, '0.0,0.0 10.0,20.0 20.0,40.0');
    const broken = trailPolyline(points, (cell) => ({ x: cell.x === 1 ? Number.NaN : cell.x, y: cell.y }));
    assert.equal(broken, null, 'moins de trois points valides');
  });

  it('n’émet rien avant trois points', () => {
    assert.equal(trailPolyline([{ x: 0, y: 0, t: 1 }], toPx), null);
    assert.equal(
      trailPolyline(
        [
          { x: 0, y: 0, t: 1 },
          { x: 1, y: 1, t: 2 },
        ],
        toPx,
      ),
      null,
    );
  });

  it('module l’opacité selon la longueur du sillage', () => {
    const make = (n: number): TrailPoint[] =>
      Array.from({ length: n }, (_, index) => ({ x: index, y: 0, t: index }));
    assert.equal(trailOpacity(make(3)), 0.26);
    assert.equal(trailOpacity(make(6)), 0.38);
    assert.equal(trailOpacity(make(12)), 0.5);
  });
});
