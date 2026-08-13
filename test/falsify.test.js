import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { createTranscript, recordAnswer } from '../src/transcript.js';
import { questionByNumber } from '../src/questions.js';
import {
  chooseFalsifications, shownChoiceFor, FALSIFICATION_COUNT
} from '../src/falsify.js';

function fullTranscript({ crtCorrect = true } = {}) {
  const t = createTranscript();
  for (let n = 1; n <= 24; n++) {
    const q = questionByNumber(n);
    let choice = q.correct ?? 0;
    if (q.kind === 'crt' && !crtCorrect) choice = (q.correct + 1) % 4;
    recordAnswer(t, {
      n, choice, realElapsedMs: 5000, displayedElapsedMs: 5000, changes: 0, trick: null
    });
  }
  return t;
}

test('exactly three rows are falsified', () => {
  for (let s = 0; s < 100; s++) {
    const f = chooseFalsifications(fullTranscript(), mulberry32(s));
    assert.equal(f.length, FALSIFICATION_COUNT);
  }
});

test('all falsified rows come from the deposit', () => {
  for (let s = 0; s < 100; s++) {
    for (const { n } of chooseFalsifications(fullTranscript(), mulberry32(s))) {
      assert.ok(n >= 1 && n <= 10, `Q${n} is outside the deposit`);
    }
  }
});

test('falsified rows are distinct', () => {
  for (let s = 0; s < 100; s++) {
    const f = chooseFalsifications(fullTranscript(), mulberry32(s));
    assert.equal(new Set(f.map(x => x.n)).size, FALSIFICATION_COUNT);
  }
});

test('the shown choice always differs from what was actually answered', () => {
  const t = fullTranscript();
  for (const { n, shown } of chooseFalsifications(t, mulberry32(4))) {
    assert.notEqual(shown, t.entries.find(e => e.n === n).choice);
  }
});

test('at least one falsified row is a correctly answered CRT item', () => {
  for (let s = 0; s < 100; s++) {
    const f = chooseFalsifications(fullTranscript(), mulberry32(s));
    const hit = f.some(({ n }) => questionByNumber(n).kind === 'crt');
    assert.ok(hit, `seed ${s} falsified no CRT item`);
  }
});

test('falls back gracefully when every CRT item was answered wrong', () => {
  const t = fullTranscript({ crtCorrect: false });
  const f = chooseFalsifications(t, mulberry32(1));
  assert.equal(f.length, FALSIFICATION_COUNT);
  for (const { n } of f) assert.ok(n <= 10);
});

test('handles a taker who answered nothing at all', () => {
  const t = createTranscript();
  for (let n = 1; n <= 24; n++) {
    recordAnswer(t, {
      n, choice: null, realElapsedMs: 45000, displayedElapsedMs: 45000, changes: 0, trick: null
    });
  }
  const f = chooseFalsifications(t, mulberry32(1));
  assert.equal(f.length, FALSIFICATION_COUNT);
  for (const { shown } of f) assert.ok(Number.isInteger(shown));
});

test('shownChoiceFor substitutes only falsified rows', () => {
  const falsifications = [{ n: 3, shown: 2 }];
  assert.equal(shownChoiceFor(3, 0, falsifications), 2);
  assert.equal(shownChoiceFor(4, 0, falsifications), 0);
});

// Edge cases: partial deposit pools
test('handles empty transcript (deposit size 0)', () => {
  const t = createTranscript();
  const f = chooseFalsifications(t, mulberry32(42));
  assert.equal(f.length, FALSIFICATION_COUNT);
  assert.equal(new Set(f.map(r => r.n)).size, FALSIFICATION_COUNT);
  for (const { n, shown } of f) {
    assert.ok(n >= 1 && n <= 10, `Q${n} outside deposit`);
    assert.ok(Number.isInteger(shown) && shown >= 0 && shown <= 3);
  }
});

test('handles deposit size 1', () => {
  const t = createTranscript();
  recordAnswer(t, {
    n: 1, choice: 0, realElapsedMs: 5000, displayedElapsedMs: 5000, changes: 0, trick: null
  });
  const f = chooseFalsifications(t, mulberry32(42));
  assert.equal(f.length, FALSIFICATION_COUNT);
  assert.equal(new Set(f.map(r => r.n)).size, FALSIFICATION_COUNT);
  for (const { n, shown } of f) {
    assert.ok(n >= 1 && n <= 10, `Q${n} outside deposit`);
    assert.ok(Number.isInteger(shown) && shown >= 0 && shown <= 3);
  }
  // Q1 should have shown !== 0 (the recorded choice)
  const q1 = f.find(r => r.n === 1);
  assert.notEqual(q1.shown, 0);
});

test('handles deposit size 2', () => {
  const t = createTranscript();
  recordAnswer(t, {
    n: 1, choice: 0, realElapsedMs: 5000, displayedElapsedMs: 5000, changes: 0, trick: null
  });
  recordAnswer(t, {
    n: 2, choice: 1, realElapsedMs: 5000, displayedElapsedMs: 5000, changes: 0, trick: null
  });
  const f = chooseFalsifications(t, mulberry32(42));
  assert.equal(f.length, FALSIFICATION_COUNT);
  assert.equal(new Set(f.map(r => r.n)).size, FALSIFICATION_COUNT);
  for (const { n, shown } of f) {
    assert.ok(n >= 1 && n <= 10, `Q${n} outside deposit`);
    assert.ok(Number.isInteger(shown) && shown >= 0 && shown <= 3);
  }
  // Q1 and Q2 should have shown !== their recorded choices
  const q1 = f.find(r => r.n === 1);
  const q2 = f.find(r => r.n === 2);
  assert.notEqual(q1.shown, 0);
  assert.notEqual(q2.shown, 1);
});

test('handles deposit size 3', () => {
  const t = createTranscript();
  recordAnswer(t, {
    n: 1, choice: 0, realElapsedMs: 5000, displayedElapsedMs: 5000, changes: 0, trick: null
  });
  recordAnswer(t, {
    n: 2, choice: 1, realElapsedMs: 5000, displayedElapsedMs: 5000, changes: 0, trick: null
  });
  recordAnswer(t, {
    n: 3, choice: 2, realElapsedMs: 5000, displayedElapsedMs: 5000, changes: 0, trick: null
  });
  const f = chooseFalsifications(t, mulberry32(42));
  assert.equal(f.length, FALSIFICATION_COUNT);
  assert.equal(new Set(f.map(r => r.n)).size, FALSIFICATION_COUNT);
  for (const { n, shown } of f) {
    assert.ok(n >= 1 && n <= 10, `Q${n} outside deposit`);
    assert.ok(Number.isInteger(shown) && shown >= 0 && shown <= 3);
  }
});

test('handles deposit size 5', () => {
  const t = createTranscript();
  for (let n = 1; n <= 5; n++) {
    recordAnswer(t, {
      n, choice: n % 4, realElapsedMs: 5000, displayedElapsedMs: 5000, changes: 0, trick: null
    });
  }
  const f = chooseFalsifications(t, mulberry32(42));
  assert.equal(f.length, FALSIFICATION_COUNT);
  assert.equal(new Set(f.map(r => r.n)).size, FALSIFICATION_COUNT);
  for (const { n, shown } of f) {
    assert.ok(n >= 1 && n <= 10, `Q${n} outside deposit`);
    assert.ok(Number.isInteger(shown) && shown >= 0 && shown <= 3);
    // Verify shown differs from recorded choice if entry exists
    const entry = t.entries.find(e => e.n === n);
    if (entry) {
      assert.notEqual(shown, entry.choice, `Q${n} shown (${shown}) equals recorded (${entry.choice})`);
    }
  }
});
