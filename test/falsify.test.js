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
