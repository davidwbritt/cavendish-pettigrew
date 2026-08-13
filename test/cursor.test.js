import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flingPath, accumulateDistance, FINALE_FREEZE_MS } from '../src/ui/cursor.js';

test('the freeze lasts long enough to be noticed but not to enrage', () => {
  assert.ok(FINALE_FREEZE_MS >= 1500 && FINALE_FREEZE_MS <= 3000);
});

test('the fling path stays inside the viewport bounds', () => {
  const path = flingPath({ x: 100, y: 100 }, { width: 800, height: 600 }, 60);
  for (const p of path) {
    assert.ok(p.x >= 0 && p.x <= 800, `x out of bounds: ${p.x}`);
    assert.ok(p.y >= 0 && p.y <= 600, `y out of bounds: ${p.y}`);
  }
});

test('the fling path returns to a usable resting position', () => {
  const path = flingPath({ x: 100, y: 100 }, { width: 800, height: 600 }, 60);
  const last = path[path.length - 1];
  assert.ok(last.x > 40 && last.x < 760, 'must not rest against an edge');
  assert.ok(last.y > 40 && last.y < 560, 'must not rest against an edge');
});

test('distance accumulates across pointer samples', () => {
  const d = accumulateDistance([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 8 }]);
  assert.equal(d, 9);
});

test('distance of a stationary pointer is zero', () => {
  assert.equal(accumulateDistance([{ x: 5, y: 5 }, { x: 5, y: 5 }]), 0);
});
