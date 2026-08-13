// Synthetic cursor and the Q23 "finale".
//
// A web page cannot move the real OS cursor, and the Pointer Lock API forces
// a "Press Esc to exit" browser notification that would puncture the effect.
// So instead: hide the real cursor with `cursor: none` and draw one we fully
// control, hit-testing against the DRAWN position. The real pointer keeps
// moving invisibly underneath the whole time.
//
// TIMER HAZARD (same family as Tasks 10 and 11): the fling path is walked
// with awaited setTimeouts, and the freeze phase waits on one too. Every one
// of those timers is tracked and can be cancelled outright — not just
// "will resolve into a no-op later" — so that Esc, any other keypress, or an
// external cursor.detach() call stops the loop immediately and can never
// leave `cursor: none` stuck on the body or keep painting after teardown.
// A stuck `cursor: none` is unrecoverable without a reload, so this is
// treated with the same rigor as Task 11's timer bookkeeping.

const FLING_STEPS = 72;
const FLING_STEP_MS = 16;

export const FINALE_FREEZE_MS = 2200;

export function accumulateDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

// A decaying spiral that always lands somewhere clickable — never against a
// viewport edge, regardless of the starting point.
export function flingPath(from, viewport, steps) {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const path = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const decay = 1 - t;
    const angle = t * Math.PI * 6;
    const radius = Math.min(viewport.width, viewport.height) * 0.35 * decay;
    const x = cx + Math.cos(angle) * radius + (from.x - cx) * decay * decay;
    const y = cy + Math.sin(angle) * radius + (from.y - cy) * decay * decay;
    path.push({
      x: Math.max(48, Math.min(viewport.width - 48, x)),
      y: Math.max(48, Math.min(viewport.height - 48, y))
    });
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
  // Bumped on every detach() and on every new fling() call. A fling loop
  // captures its own token and checks it before each paint — once stale
  // (because detach() ran, or a newer fling() superseded it) the loop exits
  // instead of continuing to run/paint.
  let flingToken = 0;
  let pendingStep = null;
  let resolveStep = null;

  const paint = () => { node.style.transform = `translate(${pos.x}px, ${pos.y}px)`; };

  const move = e => {
    if (!attached) return;
    if (frozen) { samples.push({ x: e.clientX, y: e.clientY }); return; }
    pos = { x: e.clientX, y: e.clientY };
    paint();
  };

  // Every per-step delay in fling() goes through here so a detach() mid-fling
  // can clearTimeout() the one currently pending. Cancelling the setTimeout
  // alone isn't enough — that leaves the Promise it backs permanently
  // unresolved, which would suspend fling()'s `await` forever: the loop
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
    // timer, no way for a fling loop still in flight to take another step.
    detach() {
      if (!attached) return;
      attached = false;
      flingToken++;
      frozen = false;
      cancelStep();
      window.removeEventListener('mousemove', move);
      node.remove();
      document.body.classList.remove('cursor-hidden');
    },
    freeze() { frozen = true; samples = []; },
    thaw() { frozen = false; },
    distanceTravelled() { return accumulateDistance(samples); },
    position() { return { ...pos }; },
    async fling() {
      const token = ++flingToken;
      const path = flingPath(pos, { width: window.innerWidth, height: window.innerHeight }, FLING_STEPS);
      for (const p of path) {
        if (!attached || token !== flingToken) return;
        pos = p;
        paint();
        await stepDelay(FLING_STEP_MS);
        if (!attached || token !== flingToken) return;
      }
      if (token === flingToken) frozen = false;
    }
  };
}

// Freezes the timer (frozen time never counts against the taker), locks the
// synthetic cursor in place for FINALE_FREEZE_MS, measures how far the real
// pointer travelled underneath while it looked locked, then flings the
// cursor around the screen before releasing it back to the taker and
// resuming the timer.
//
// Returns a Promise (so `await runFinale(...)` works, matching the plan's
// illustrative signature) with a `.cancel()` method attached, so a caller
// that captures the return value can stop everything early — e.g. if the
// question advances mid-fling because the taker managed a blind click.
// Whether or not anything calls `.cancel()`, the sequence is self-bounding:
// it fully tears itself down (cursor detached, timer resumed) the moment
// either the fling completes naturally or Esc/any keydown fires, via the
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
  // freeze-wait or fling-step timer to happen to fire on its own.
  const onKey = () => cleanup();
  window.addEventListener('keydown', onKey);

  const promise = (async () => {
    timerDriver.freeze();
    cursor.attach();
    cursor.freeze();

    await wait(FINALE_FREEZE_MS);
    if (done) return; // aborted during the freeze — nothing measured, nothing to fling

    onDistance(cursor.distanceTravelled());
    await cursor.fling();
    cleanup();
  })();

  promise.cancel = cleanup;
  return promise;
}
