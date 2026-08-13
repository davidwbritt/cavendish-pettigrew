// Synthetic cursor and the Q23 "finale".
//
// A web page cannot move the real OS cursor, and the Pointer Lock API forces
// a "Press Esc to exit" browser notification that would puncture the effect.
// So instead: hide the real cursor with `cursor: none` and draw one we fully
// control, hit-testing against the DRAWN position. The real pointer keeps
// moving invisibly underneath the whole time.
//
// TIMER HAZARD (same family as Tasks 10 and 11): the drift path is walked
// with awaited setTimeouts, and the freeze phase waits on one too. Every one
// of those timers is tracked and can be cancelled outright — not just
// "will resolve into a no-op later" — so that Esc, any other keypress, or an
// external cursor.detach() call stops the loop immediately and can never
// leave `cursor: none` stuck on the body or keep painting after teardown.
// A stuck `cursor: none` is unrecoverable without a reload, so this is
// treated with the same rigor as Task 11's timer bookkeeping.

// ~2.24s total (140 * 16ms) — deliberately slow. Patterned, obviously-authored
// motion (the old decaying spiral) reads as scripted; a slow drift toward a
// corner reads as something dragging the mouse.
export const DRIFT_STEPS = 140;
export const DRIFT_STEP_MS = 16;

export const FINALE_FREEZE_MS = 2200;

export function accumulateDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

// Ease-in-out cubic: slow to start, quicker through the middle, settling at
// the end. Monotone on [0, 1] — no orbiting, looping, or wobble, because
// patterned motion is exactly what reads as authored. Just unhurried,
// uneven progress toward one destination.
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// A slow, eased drift from the cursor's current position toward a point just
// inside the lower-left corner — never flush against a viewport edge,
// regardless of the starting point, AND regardless of the viewport's own
// size.
export function driftPath(from, viewport, steps) {
  // A hardcoded margin would silently assume both dimensions are larger than
  // it. Scaling the margin down with the viewport keeps every point in range
  // for any size and degrades to a zero margin only when a dimension is too
  // small to have an interior at all (in which case resting flush against
  // that edge is the only geometrically possible outcome, not a bug).
  const width = Math.max(0, viewport.width);
  const height = Math.max(0, viewport.height);
  const margin = Math.min(32, Math.floor(Math.min(width, height) / 4));
  const clamp = (v, dim) => Math.max(0, Math.min(dim, v));

  // The starting point is clamped too: callers are expected to hand in an
  // on-screen position, but the viewport itself can shrink out from under a
  // stale coordinate (see the degenerate-viewport sweep in the tests), so
  // this must stay in range no matter what `from` claims.
  const startX = clamp(from.x, width);
  const startY = clamp(from.y, height);
  const targetX = clamp(margin, width);
  const targetY = clamp(height - margin, height);

  const path = [];
  for (let i = 1; i <= steps; i++) {
    const e = easeInOutCubic(i / steps);
    const x = startX + (targetX - startX) * e;
    const y = startY + (targetY - startY) * e;
    path.push({ x: clamp(x, width), y: clamp(y, height) });
  }
  return path;
}

// Desktop-only and motion-sensitive-taker-only: reduced-motion preference or
// a coarse (touch) pointer both skip the finale entirely.
export function shouldRunFinale() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && window.matchMedia('(pointer: fine)').matches;
}

export function createSyntheticCursor(root) {
  const node = document.createElement('div');
  node.className = 'synthetic-cursor';

  let pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let frozen = false;
  let attached = false;
  let samples = [];
  // Bumped on every detach() and on every new drift() call. A drift loop
  // captures its own token and checks it before each paint — once stale
  // (because detach() ran, or a newer drift() superseded it) the loop exits
  // instead of continuing to run/paint.
  let driftToken = 0;
  let pendingStep = null;
  let resolveStep = null;

  const paint = () => { node.style.transform = `translate(${pos.x}px, ${pos.y}px)`; };

  const move = e => {
    if (!attached) return;
    if (frozen) { samples.push({ x: e.clientX, y: e.clientY }); return; }
    pos = { x: e.clientX, y: e.clientY };
    paint();
  };

  // Every per-step delay in drift() goes through here so a detach() mid-drift
  // can clearTimeout() the one currently pending. Cancelling the setTimeout
  // alone isn't enough — that leaves the Promise it backs permanently
  // unresolved, which would suspend drift()'s `await` forever: the loop
  // would stop PAINTING (its guard checks already handle that) but the
  // coroutine itself would never actually finish, silently leaking the
  // suspended async frame and everything it closes over. cancelStep() below
  // settles the promise immediately alongside clearing the timer, so an
  // aborted await always resumes (straight into the loop's own `!attached`
  // guard, which then returns cleanly) instead of hanging.
  const stepDelay = ms => new Promise(resolve => {
    resolveStep = resolve;
    pendingStep = setTimeout(() => { pendingStep = null; resolveStep = null; resolve(); }, ms);
  });
  const cancelStep = () => {
    if (pendingStep !== null) { clearTimeout(pendingStep); pendingStep = null; }
    if (resolveStep !== null) { const r = resolveStep; resolveStep = null; r(); }
  };

  return {
    attach() {
      if (attached) return;
      attached = true;
      root.append(node);
      document.body.classList.add('cursor-hidden');
      window.addEventListener('mousemove', move);
      paint();
    },
    // Idempotent and total: safe to call more than once, and always leaves
    // no trace — no node, no cursor-hidden class, no listener, no pending
    // timer, no way for a drift loop still in flight to take another step.
    detach() {
      if (!attached) return;
      attached = false;
      driftToken++;
      frozen = false;
      cancelStep();
      window.removeEventListener('mousemove', move);
      node.remove();
      document.body.classList.remove('cursor-hidden');
    },
    freeze() { frozen = true; samples = []; },
    distanceTravelled() { return accumulateDistance(samples); },
    position() { return { ...pos }; },
    async drift() {
      const token = ++driftToken;
      const path = driftPath(pos, { width: window.innerWidth, height: window.innerHeight }, DRIFT_STEPS);
      for (const p of path) {
        if (!attached || token !== driftToken) return;
        pos = p;
        paint();
        await stepDelay(DRIFT_STEP_MS);
        if (!attached || token !== driftToken) return;
      }
      if (token === driftToken) frozen = false;
    }
  };
}

// Freezes the timer (frozen time never counts against the taker), locks the
// synthetic cursor in place for FINALE_FREEZE_MS, measures how far the real
// pointer travelled underneath while it looked locked, then drifts the
// cursor slowly toward the lower-left corner before releasing it back to the
// taker and resuming the timer.
//
// Returns a Promise (so `await runFinale(...)` works, matching the plan's
// illustrative signature) with a `.cancel()` method attached, so a caller
// that captures the return value can stop everything early — e.g. if the
// question advances mid-drift because the taker managed a blind click.
// Whether or not anything calls `.cancel()`, the sequence is self-bounding:
// it fully tears itself down (cursor detached, timer resumed) the moment
// either the drift completes naturally or Esc/any keydown fires, via the
// same single cleanup() path either way.
export function runFinale({ cursor, timerDriver, onDistance }) {
  let done = false;
  let pending = null;
  let resolveWait = null;

  // Same hazard as createSyntheticCursor's stepDelay above: clearing the
  // backing setTimeout is not enough on its own, or an abort landing mid-wait
  // would leave `await wait(...)` suspended forever instead of letting the
  // IIFE below observe `done` and return. cleanup() always settles this
  // promise too, so the coroutine actually finishes instead of merely being
  // stopped from doing anything further.
  const wait = ms => new Promise(resolve => {
    resolveWait = resolve;
    pending = setTimeout(() => { pending = null; resolveWait = null; resolve(); }, ms);
  });

  const cleanup = () => {
    if (done) return;
    done = true;
    if (pending !== null) { clearTimeout(pending); pending = null; }
    if (resolveWait !== null) { const r = resolveWait; resolveWait = null; r(); }
    cursor.detach();
    timerDriver.resume();
    window.removeEventListener('keydown', onKey);
  };

  // Esc and any other keyboard input restore everything INSTANTLY — this is
  // both the accessibility escape hatch and a mercy. cleanup() runs
  // synchronously inside the event handler: no waiting for an in-flight
  // freeze-wait or drift-step timer to happen to fire on its own.
  const onKey = () => cleanup();
  window.addEventListener('keydown', onKey);

  const promise = (async () => {
    timerDriver.freeze();
    cursor.attach();
    cursor.freeze();

    await wait(FINALE_FREEZE_MS);
    if (done) return; // aborted during the freeze — nothing measured, nothing to drift

    onDistance(cursor.distanceTravelled());
    await cursor.drift();
    cleanup();
  })();

  promise.cancel = cleanup;
  return promise;
}
