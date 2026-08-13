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

// Fix round 1, Finding 2: a hardcoded 48px margin assumed both dimensions
// were at least 96px. shouldRunFinale() gates the finale to `pointer: fine`
// devices, which keeps real-world blast radius small, but flingPath() itself
// must stay correct for any viewport it's handed, not just plausible ones.
test('the fling path stays in range for every viewport size, however degenerate', () => {
  const viewports = [
    { width: 0, height: 0 },
    { width: 0, height: 600 },
    { width: 600, height: 0 },
    { width: 10, height: 10 },
    { width: 50, height: 50 },
    { width: 96, height: 96 },
    { width: 320, height: 480 },
    { width: 800, height: 600 } // normal desktop size
  ];
  for (const viewport of viewports) {
    const path = flingPath({ x: 100, y: 100 }, viewport, 72);
    assert.equal(path.length, 72, `wrong step count for ${JSON.stringify(viewport)}`);
    for (const p of path) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y),
        `NaN/non-finite point for ${JSON.stringify(viewport)}: ${JSON.stringify(p)}`);
      assert.ok(p.x >= 0 && p.x <= viewport.width,
        `x out of bounds for ${JSON.stringify(viewport)}: ${p.x}`);
      assert.ok(p.y >= 0 && p.y <= viewport.height,
        `y out of bounds for ${JSON.stringify(viewport)}: ${p.y}`);
    }
  }
});

test('the resting position avoids the edge whenever the viewport is large enough to allow it', () => {
  // Mirrors the implementation's own margin formula so the test can assert
  // the SAME "as much clearance as this viewport can offer" guarantee,
  // rather than a fixed margin that degenerate sizes could never satisfy.
  const marginFor = (width, height) => Math.min(48, Math.floor(Math.min(width, height) / 4));

  for (const viewport of [
    { width: 50, height: 50 }, { width: 96, height: 96 },
    { width: 320, height: 480 }, { width: 800, height: 600 }
  ]) {
    const margin = marginFor(viewport.width, viewport.height);
    assert.ok(margin > 0, `test fixture assumption violated for ${JSON.stringify(viewport)}`);
    const last = flingPath({ x: 100, y: 100 }, viewport, 72).at(-1);
    assert.ok(last.x >= margin && last.x <= viewport.width - margin,
      `resting x too close to the edge for ${JSON.stringify(viewport)}: ${last.x}`);
    assert.ok(last.y >= margin && last.y <= viewport.height - margin,
      `resting y too close to the edge for ${JSON.stringify(viewport)}: ${last.y}`);
  }
});

test('a zero-area viewport degrades to a valid in-range resting point rather than NaN or out-of-range', () => {
  for (const viewport of [{ width: 0, height: 0 }, { width: 0, height: 600 }, { width: 600, height: 0 }]) {
    const last = flingPath({ x: 100, y: 100 }, viewport, 72).at(-1);
    assert.ok(Number.isFinite(last.x) && Number.isFinite(last.y), `NaN resting point for ${JSON.stringify(viewport)}`);
    assert.ok(last.x >= 0 && last.x <= viewport.width, `resting x out of range for ${JSON.stringify(viewport)}: ${last.x}`);
    assert.ok(last.y >= 0 && last.y <= viewport.height, `resting y out of range for ${JSON.stringify(viewport)}: ${last.y}`);
  }
});
