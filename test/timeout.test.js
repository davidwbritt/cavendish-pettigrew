import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pick } from '../src/rng.js';
import { createOutcomeGate, reviewRows } from '../src/ui/screens.js';
import { createTranscript, recordAnswer } from '../src/transcript.js';

// createOutcomeGate is the pure primitive renderQuestion (src/ui/screens.js)
// routes BOTH a real click's commit and the rAF loop's expiry detection
// through — see the module-level comment above it. This is what makes "no
// double-advance" (a click landing during the forced-answer or selection
// pause, or racing expiry) an explicit, tested invariant rather than a hope
// about event ordering. No DOM/jsdom needed: the gate itself has none.

test('createOutcomeGate fires its callback at most once — a second competing caller is a no-op', () => {
  const gate = createOutcomeGate();
  let calls = 0;
  const first = gate.fire(() => { calls++; });
  const second = gate.fire(() => { calls++; }); // simulates a click landing after expiry already settled, or vice versa
  assert.equal(first, true, 'the first caller to fire wins');
  assert.equal(second, false, 'a second caller is rejected outright — no re-entry');
  assert.equal(calls, 1, 'exactly one commit results — the guard requirement');
});

test('createOutcomeGate rejects every subsequent attempt, not just the second', () => {
  const gate = createOutcomeGate();
  let calls = 0;
  gate.fire(() => { calls++; });
  for (let i = 0; i < 10; i++) gate.fire(() => { calls++; });
  assert.equal(calls, 1);
});

test('createOutcomeGate starts unsettled and reports settled after firing', () => {
  const gate = createOutcomeGate();
  assert.equal(gate.settled, false);
  gate.fire(() => {});
  assert.equal(gate.settled, true);
});

// The forced-choice selection itself — main.js's onExpire handler calls
// exactly pick(rng, [0, 1, 2, 3]); no Math.random() anywhere in this
// project. Deterministic under a seeded rng and always a valid index.
test('the forced-choice selection is deterministic under a seeded rng and always a valid option index', () => {
  for (let seed = 0; seed < 50; seed++) {
    const a = pick(mulberry32(seed), [0, 1, 2, 3]);
    const b = pick(mulberry32(seed), [0, 1, 2, 3]);
    assert.equal(a, b, `seed ${seed}: not deterministic`);
    assert.ok(Number.isInteger(a) && a >= 0 && a <= 3, `seed ${seed}: ${a} is not a valid option index`);
  }
});

// reviewRows (src/ui/screens.js) must carry the transcript entry's
// timedOut flag through to the row object so renderReview can mark the row
// REFUSED — the review screen still shows the forced answer as the
// taker's own (same letter, same text, no visual distinction there); the
// REFUSED label is the ONLY thing that differs about the row.
test('reviewRows carries the timedOut flag through from the transcript entry', () => {
  const t = createTranscript();
  recordAnswer(t, { n: 1, choice: 2, realElapsedMs: 45000, displayedElapsedMs: 45000, changes: 0, trick: null, timedOut: true });
  recordAnswer(t, { n: 2, choice: 1, realElapsedMs: 5000, displayedElapsedMs: 9000, changes: 0, trick: null, timedOut: false });
  const rows = reviewRows(t, []);
  assert.equal(rows.find(r => r.n === 1).timedOut, true);
  assert.equal(rows.find(r => r.n === 2).timedOut, false);
});

test('reviewRows defaults timedOut to false when the entry omits it entirely', () => {
  const t = createTranscript();
  recordAnswer(t, { n: 1, choice: 0, realElapsedMs: 5000, displayedElapsedMs: 9000, changes: 0, trick: null });
  const rows = reviewRows(t, []);
  assert.equal(rows[0].timedOut, false);
});

// A REFUSED row can also be one of the three falsified rows — the two
// markers are independent (timedOut comes from the transcript entry;
// falsification changes `shown` via a wholly separate mechanism) and must
// coexist without either clobbering the other.
test('a REFUSED (timedOut) row renders sanely when it is also one of the falsified rows', () => {
  const t = createTranscript();
  for (let n = 1; n <= 10; n++) {
    recordAnswer(t, { n, choice: 0, realElapsedMs: 5000, displayedElapsedMs: 9000, changes: 0, trick: null, timedOut: n === 3 });
  }
  const falsifications = [{ n: 3, shown: 2 }]; // Q3 shown as a different choice than actually recorded
  const rows = reviewRows(t, falsifications);
  const row3 = rows.find(r => r.n === 3);
  assert.equal(row3.timedOut, true, 'still flagged REFUSED');
  assert.equal(row3.shown, 2, 'still shows the falsified choice, independent of the REFUSED flag');
  assert.notEqual(row3.shown, 0, 'confirms the row really is falsified (differs from the actually recorded choice)');
});
