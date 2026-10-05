import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fitToViewBox, midpoint } from '../js/geometry.js';
import { sample } from './helpers.mjs';

const BOX = { width: 1000, height: 600, pad: 60 };
const EPS = 1e-6;

function checkInside(pos, ids, { width, height, pad }) {
  assert.equal(pos.size, ids.length);
  for (const id of ids) {
    const p = pos.get(id);
    assert.ok(p, `missing position for ${id}`);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), `${id} not finite: ${p.x},${p.y}`);
    assert.ok(p.x >= pad - EPS && p.x <= width - pad + EPS, `${id}.x=${p.x} outside`);
    assert.ok(p.y >= pad - EPS && p.y <= height - pad + EPS, `${id}.y=${p.y} outside`);
  }
}

const nodesAt = (pts) => pts.map(([x, y], i) => ({ id: `N${i}`, label: `N${i}`, type: 'room', x, y }));

describe('fitToViewBox', () => {
  test('sample fits inside padded viewBox', () => {
    const nodes = sample().nodes;
    checkInside(fitToViewBox(nodes, BOX), nodes.map((n) => n.id), BOX);
  });

  test('identical points → finite and inside viewBox (centered)', () => {
    const nodes = nodesAt([[0, 0], [0, 0], [0, 0]]);
    const pos = fitToViewBox(nodes, BOX);
    checkInside(pos, nodes.map((n) => n.id), BOX);
    for (const p of pos.values()) {
      assert.ok(Math.abs(p.x - 500) < 1 && Math.abs(p.y - 300) < 1, `not centered: ${p.x},${p.y}`);
    }
  });

  test('zero extent on one axis → finite and inside', () => {
    const nodes = nodesAt([[0, 5], [100, 5], [200, 5]]);
    checkInside(fitToViewBox(nodes, BOX), nodes.map((n) => n.id), BOX);
  });

  test('negative coordinates → inside', () => {
    const nodes = nodesAt([[-500, -300], [-10, 40], [250, -1000]]);
    checkInside(fitToViewBox(nodes, BOX), nodes.map((n) => n.id), BOX);
  });

  test('huge coordinates (1e6) → inside', () => {
    const nodes = nodesAt([[0, 0], [1e6, 3], [500000, 1e6]]);
    checkInside(fitToViewBox(nodes, BOX), nodes.map((n) => n.id), BOX);
  });

  test('uniform scale preserves ordering', () => {
    const nodes = nodesAt([[0, 0], [10, 0], [20, 10]]);
    const pos = fitToViewBox(nodes, BOX);
    assert.ok(pos.get('N0').x < pos.get('N1').x && pos.get('N1').x < pos.get('N2').x);
    assert.ok(pos.get('N0').y < pos.get('N2').y, 'y points down (screen coords)');
  });
});

test('midpoint', () => {
  assert.deepEqual(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 }), { x: 5, y: 10 });
});
