import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSyntheticCursor, runFinale, FINALE_FREEZE_MS, FINALE_EXPIRY_BEAT_MS,
  DRIFT_STEPS, DRIFT_STEP_MS
} from '../src/ui/cursor.js';

// runFinale and createSyntheticCursor are exercised here against hand-rolled
// window/document stubs — NOT jsdom. runFinale only ever touches
// `window.addEventListener/removeEventListener('keydown', ...)`, and
// createSyntheticCursor only ever touches a handful of DOM primitives
// (createElement, classList, style.transform, append, remove). Faking those
// directly keeps this dependency-free while still exercising the real
// production code path end to end, rather than mocking cursor/timerDriver
// stubs that could silently drift from the real contract.

function makeWindowStub(width = 800, height = 600) {
  const listeners = new Map();
  return {
    innerWidth: width,
    innerHeight: height,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, evt = {}) { for (const fn of [...(listeners.get(type) ?? [])]) fn(evt); }
  };
}

function makeClassListStub() {
  const set = new Set();
  return { add: c => set.add(c), remove: c => set.delete(c), contains: c => set.has(c) };
}

function makeDocumentStub() {
  return {
    body: { classList: makeClassListStub() },
    createElement: () => ({ style: {}, className: '', remove() { this._removed = true; } })
  };
}

function makeRootStub() {
  const appended = [];
  return { append: node => appended.push(node), appended };
}

function makeTimerDriverStub() {
  return {
    freezeCalls: 0, resumeCalls: 0, expireCalls: 0,
    freeze() { this.freezeCalls++; },
    resume() { this.resumeCalls++; },
    expire() { this.expireCalls++; }
  };
}

async function flushMicrotasks(n = 3) {
  for (let i = 0; i < n; i++) await Promise.resolve();
}

// Advances the mock clock one drift-step at a time (instead of one big
// tick()) because each stepDelay() setTimeout is only scheduled once the
// previous one's promise has resolved and its continuation has run as a
// microtask — a single large tick() fires only the timers already pending
// at call time, not ones a chain of awaits schedules afterward.
async function advanceSteps(count, stepMs = DRIFT_STEP_MS) {
  for (let i = 0; i < count; i++) {
    mock.timers.tick(stepMs);
    await flushMicrotasks();
  }
}

function withFinaleHarness(fn) {
  return async () => {
    globalThis.window = makeWindowStub();
    globalThis.document = makeDocumentStub();
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const root = makeRootStub();
      const cursor = createSyntheticCursor(root);
      const timerDriver = makeTimerDriverStub();
      await fn({ root, cursor, timerDriver });
    } finally {
      mock.timers.reset();
      delete globalThis.window;
      delete globalThis.document;
    }
  };
}

test('the finale completes end to end: freeze, drift to the corner, release',
  withFinaleHarness(async ({ root, cursor, timerDriver }) => {
    let distance = null;
    const finale = runFinale({ cursor, timerDriver, onDistance: d => { distance = d; } });

    mock.timers.tick(FINALE_FREEZE_MS);
    await flushMicrotasks();
    assert.equal(timerDriver.freezeCalls, 1);
    assert.equal(distance, 0, 'no real pointer samples were injected, so distance is 0 — the plumbing still ran');

    await advanceSteps(DRIFT_STEPS);

    // The clock is still frozen at this point — the corner has been reached
    // but the last action has not landed yet.
    assert.equal(timerDriver.expireCalls, 0, 'nothing is taken until the beat elapses');

    mock.timers.tick(FINALE_EXPIRY_BEAT_MS);
    await flushMicrotasks();
    await finale;

    // THE LAST ACTION: the clock is dropped to zero and the question taken,
    // through the instrument's ordinary expiry path. The taker is recorded
    // as having declined a question they were being prevented from answering.
    assert.equal(timerDriver.expireCalls, 1, 'the finale must take the question');
    assert.equal(timerDriver.resumeCalls, 0,
      'and must never hand the clock back — expire is one-way');
    assert.equal(root.appended[0]._removed, true, 'synthetic cursor detached at the end');
    assert.equal(document.body.classList.contains('cursor-hidden'), false);

    const end = cursor.position();
    // window is 800x600 in this harness; margin = min(32, floor(600/4)) = 32
    assert.ok(end.x <= 32 + 1e-6, `expected to end near the left edge, got x=${end.x}`);
    assert.ok(end.y >= 600 - 32 - 1e-6, `expected to end near the bottom edge, got y=${end.y}`);
  }));

test('Esc aborts instantly during the freeze — before anything is measured or drifted',
  withFinaleHarness(async ({ root, cursor, timerDriver }) => {
    let distanceCalled = false;
    const finale = runFinale({ cursor, timerDriver, onDistance: () => { distanceCalled = true; } });

    // still inside FINALE_FREEZE_MS — nowhere near the drift phase
    mock.timers.tick(FINALE_FREEZE_MS / 4);
    await flushMicrotasks();

    window.dispatch('keydown', { key: 'Escape' });
    await finale; // must resolve without any further timer advance

    assert.equal(distanceCalled, false, 'aborted before the freeze ended — nothing should have been measured');
    assert.equal(timerDriver.resumeCalls, 1);
    assert.equal(root.appended[0]._removed, true);
  }));

test('Esc aborts instantly mid-drift, restoring the cursor and resuming the timer without waiting out the rest of the drift',
  withFinaleHarness(async ({ root, cursor, timerDriver }) => {
    const finale = runFinale({ cursor, timerDriver, onDistance: () => {} });

    mock.timers.tick(FINALE_FREEZE_MS);
    await flushMicrotasks();

    // Only partway through the (now longer, ~2.24s) drift — well short of
    // DRIFT_STEPS. This is the exact window the longer duration widens.
    await advanceSteps(20);
    const midDriftPos = cursor.position();

    window.dispatch('keydown', { key: 'a' }); // any keydown, not just Escape

    // The finale promise must settle promptly on its own — proving the
    // in-flight stepDelay's promise was actually settled by detach(),
    // not merely left to hang forever behind a cleared timer.
    await Promise.race([
      finale.then(() => 'resolved'),
      new Promise((_, reject) => setImmediate(() => reject(new Error('finale did not resolve promptly on mid-drift abort'))))
    ]).then(v => assert.equal(v, 'resolved'));

    assert.equal(timerDriver.resumeCalls, 1, 'timer resumes exactly once');
    assert.equal(root.appended[0]._removed, true, 'cursor detached');
    assert.equal(document.body.classList.contains('cursor-hidden'), false);

    // Advancing the clock through what would have been the rest of the
    // drift must not move the (now-detached) cursor any further.
    await advanceSteps(DRIFT_STEPS - 20);
    assert.deepEqual(cursor.position(), midDriftPos, 'no further movement after abort');
  }));

test('an external .cancel() call aborts mid-drift exactly like a keypress',
  withFinaleHarness(async ({ root, cursor, timerDriver }) => {
    const finale = runFinale({ cursor, timerDriver, onDistance: () => {} });

    mock.timers.tick(FINALE_FREEZE_MS);
    await flushMicrotasks();
    await advanceSteps(10);

    finale.cancel();
    await finale;

    assert.equal(timerDriver.resumeCalls, 1);
    assert.equal(root.appended[0]._removed, true);
  }));

test('calling .cancel() twice, or after natural completion, is a harmless no-op',
  withFinaleHarness(async ({ cursor, timerDriver }) => {
    const finale = runFinale({ cursor, timerDriver, onDistance: () => {} });
    mock.timers.tick(FINALE_FREEZE_MS);
    await flushMicrotasks();
    await advanceSteps(DRIFT_STEPS);
    mock.timers.tick(FINALE_EXPIRY_BEAT_MS);
    await flushMicrotasks();
    await finale;

    assert.equal(timerDriver.expireCalls, 1);
    finale.cancel();
    finale.cancel();
    assert.equal(timerDriver.expireCalls, 1, 'expire() must not fire again');
    assert.equal(timerDriver.resumeCalls, 0, 'and a late cancel must not undo it');
  }));


// ── the last action ───────────────────────────────────────────────────────
// The finale used to hand the clock back. It now drops it to zero and takes
// the question, through the instrument's ordinary expiry path — so the row
// lands as SUBJECT DECLINED TO ANSWER and is branded REFUSED for good. Every
// ABORT path must still resume: Esc is the accessibility hatch and the mercy
// (spec §5), and .cancel() fires when the taker already got a click in.

test('Esc during the freeze resumes the clock and never takes the question',
  withFinaleHarness(async ({ timerDriver }) => {
    const finale = runFinale({ cursor: createSyntheticCursor(makeRootStub()), timerDriver, onDistance: () => {} });
    mock.timers.tick(FINALE_FREEZE_MS / 4);
    await flushMicrotasks();
    window.dispatch('keydown', { key: 'Escape' });
    await finale;
    assert.equal(timerDriver.resumeCalls, 1, 'the taker keeps their remaining time');
    assert.equal(timerDriver.expireCalls, 0, 'taking the question would punish the escape hatch');
  }));

test('Esc during the final beat still spares the taker',
  withFinaleHarness(async ({ cursor, timerDriver }) => {
    // The narrowest window in the sequence: the corner has been reached and
    // the clock is about to be taken. Esc must still win.
    const finale = runFinale({ cursor, timerDriver, onDistance: () => {} });
    mock.timers.tick(FINALE_FREEZE_MS);
    await flushMicrotasks();
    await advanceSteps(DRIFT_STEPS);
    mock.timers.tick(FINALE_EXPIRY_BEAT_MS / 3);
    await flushMicrotasks();

    window.dispatch('keydown', { key: 'Escape' });
    await finale;

    assert.equal(timerDriver.expireCalls, 0, 'Esc during the beat must abort the last action');
    assert.equal(timerDriver.resumeCalls, 1);
  }));

test('an external .cancel() mid-drift never takes the question',
  withFinaleHarness(async ({ cursor, timerDriver }) => {
    // main.js calls this via teardownTrick when the taker lands a blind
    // click, i.e. when the outcome gate has already settled the question.
    // Forcing an expiry there would be trying to decide a decided question.
    const finale = runFinale({ cursor, timerDriver, onDistance: () => {} });
    mock.timers.tick(FINALE_FREEZE_MS);
    await flushMicrotasks();
    await advanceSteps(10);
    finale.cancel();
    await finale;
    assert.equal(timerDriver.expireCalls, 0);
    assert.equal(timerDriver.resumeCalls, 1);
  }));
