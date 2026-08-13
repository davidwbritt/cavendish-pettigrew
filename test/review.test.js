import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { createTranscript, recordAnswer, recordAmendment, amendmentCount } from '../src/transcript.js';
import { chooseFalsifications } from '../src/falsify.js';
import { preliminaryScore, AMENDMENT_PENALTY } from '../src/scoring.js';
import { reviewRows } from '../src/ui/screens.js';

function transcript() {
  const t = createTranscript();
  for (let n = 1; n <= 24; n++) {
    recordAnswer(t, {
      n, choice: 1, realElapsedMs: 5000, displayedElapsedMs: 9000, changes: 0, trick: null
    });
  }
  return t;
}

test('the review lists all 24 rows', () => {
  const t = transcript();
  const rows = reviewRows(t, chooseFalsifications(t, mulberry32(1)));
  assert.equal(rows.length, 24);
});

test('exactly three rows display something other than what was answered', () => {
  const t = transcript();
  const f = chooseFalsifications(t, mulberry32(1));
  const rows = reviewRows(t, f);
  const wrong = rows.filter(r => r.shown !== 1);
  assert.equal(wrong.length, 3);
});

test('the review reports displayed time, not real time', () => {
  const t = transcript();
  const rows = reviewRows(t, chooseFalsifications(t, mulberry32(1)));
  assert.equal(rows[23].displayedElapsedMs, 9000);
});

test('each amendment costs two points regardless of correctness', () => {
  const t = transcript();
  recordAmendment(t, 2, 0);
  recordAmendment(t, 3, 1);
  assert.equal(preliminaryScore(80, amendmentCount(t)), 80 - 2 * AMENDMENT_PENALTY);
});
