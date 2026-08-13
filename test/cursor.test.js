import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  driftPath, accumulateDistance, FINALE_FREEZE_MS, DRIFT_STEPS, DRIFT_STEP_MS
} from '../src/ui/cursor.js';

test('the freeze lasts long enough to be noticed but not to enrage', () => {
  assert.ok(FINALE_FREEZE_MS >= 1500 && FINALE_FREEZE_MS <= 3000);
});

test('the drift takes roughly 2-2.5s total — slower than a snap animation, still bounded', () => {
  const totalMs = DRIFT_STEPS * DRIFT_STEP_MS;
  assert.ok(totalMs >= 2000 && totalMs <= 2500, `drift duration out of range: ${totalMs}ms`);
});

test('the drift path stays inside the viewport bounds', () => {
  const path = driftPath({ x: 100, y: 100 }, { width: 800, height: 600 }, 60);
  for (const p of path) {
    assert.ok(p.x >= 0 && p.x <= 800, `x out of bounds: ${p.x}`);
    assert.ok(p.y >= 0 && p.y <= 600, `y out of bounds: ${p.y}`);
  }
});

// The old spiral was required to rest away from every edge because it was
// wrongly assumed the drawn cursor stayed put. It doesn't: runFinale detaches
// the synthetic cursor immediately after the drift, restoring the real
// pointer wherever it actually is. The drift's own end point is purely
// cosmetic — what matters now is that it genuinely reaches the lower-left
// corner (within a small margin) and gets there without any patterned
// back-and-forth motion.
test('the drift path ends near the lower-left corner', () => {
  const path = driftPath({ x: 700, y: 100 }, { width: 800, height: 600 }, 60);
  const last = path[path.length - 1];
  // Close to the left edge and close to the bottom edge, within the
  // implementation's own margin (see the "margin scales with viewport" test
  // below for the exact formula).
  assert.ok(last.x < 40, `expected drift to end near the left edge, got x=${last.x}`);
  assert.ok(last.y > 560, `expected drift to end near the bottom edge, got y=${last.y}`);
});

test('the drift path makes monotone progress toward the corner — no orbiting or wobble', () => {
  const target = { x: 32, y: 600 - 32 };
  const path = driftPath({ x: 700, y: 100 }, { width: 800, height: 600 }, 72);
  let prevDist = Math.hypot(700 - target.x, 100 - target.y);
  for (const p of path) {
    const dist = Math.hypot(p.x - target.x, p.y - target.y);
    assert.ok(dist <= prevDist + 1e-9, `distance to target increased mid-drift: ${prevDist} -> ${dist}`);
    prevDist = dist;
  }
});

test('distance accumulates across pointer samples', () => {
  const d = accumulateDistance([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 8 }]);
  assert.equal(d, 9);
});

test('distance of a stationary pointer is zero', () => {
  assert.equal(accumulateDistance([{ x: 5, y: 5 }, { x: 5, y: 5 }]), 0);
});

// Fix round 1, Finding 2: a hardcoded margin assumed both dimensions were
// larger than it. shouldRunFinale() gates the finale to `pointer: fine`
// devices, which keeps real-world blast radius small, but driftPath() itself
// must stay correct for any viewport it's handed, not just plausible ones.
test('the drift path stays in range for every viewport size, however degenerate', () => {
  const viewports = [
    { width: 0, height: 0 },
    { width: 0, height: 600 },
    { width: 600, height: 0 },
    { width: 10, height: 10 },
    { width: 47, height: 47 },
    { width: 50, height: 50 },
    { width: 96, height: 96 },
    { width: 320, height: 480 },
    { width: 800, height: 600 }, // normal desktop size
    { width: 1440, height: 900 }
  ];
  for (const viewport of viewports) {
    const path = driftPath({ x: 100, y: 100 }, viewport, 72);
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

// Fix round 1, Finding 2 (cont'd): the old spiral was required to rest away
// from every edge because the drawn cursor was wrongly assumed to persist —
// see the "ends near the lower-left corner" test above for why that
// constraint no longer applies. What still matters for degenerate viewports
// specifically is that the final point is a real, in-range number, not NaN
// or something outside [0, width] x [0, height].
test('a zero-area viewport degrades to a valid in-range end point rather than NaN or out-of-range', () => {
  for (const viewport of [{ width: 0, height: 0 }, { width: 0, height: 600 }, { width: 600, height: 0 }]) {
    const last = driftPath({ x: 100, y: 100 }, viewport, 72).at(-1);
    assert.ok(Number.isFinite(last.x) && Number.isFinite(last.y), `NaN end point for ${JSON.stringify(viewport)}`);
    assert.ok(last.x >= 0 && last.x <= viewport.width, `end x out of range for ${JSON.stringify(viewport)}: ${last.x}`);
    assert.ok(last.y >= 0 && last.y <= viewport.height, `end y out of range for ${JSON.stringify(viewport)}: ${last.y}`);
  }
});
