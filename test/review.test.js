import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { createTranscript, recordAnswer, recordAmendment, amendmentCount } from '../src/transcript.js';
import { chooseFalsifications } from '../src/falsify.js';
import { preliminaryScore, AMENDMENT_PENALTY } from '../src/scoring.js';
import { reviewRows, applyAmendment } from '../src/ui/screens.js';
import { questionByNumber } from '../src/questions.js';

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

test('a row starts unamended and applyAmendment marks it amended', () => {
  const t = transcript();
  const rows = reviewRows(t, chooseFalsifications(t, mulberry32(1)));
  const row = rows[1];
  assert.equal(row.amended, false);
  applyAmendment(t, row);
  assert.equal(row.amended, true);
});

test('each row carries the actual answer TEXT, not just the letter index', () => {
  const t = transcript();
  const rows = reviewRows(t, chooseFalsifications(t, mulberry32(1)));
  for (const row of rows) {
    assert.equal(row.answerText, questionByNumber(row.n).options[row.shown]);
  }
});

test('applyAmendment updates the answer text along with the letter, and they never disagree', () => {
  const t = transcript();
  const rows = reviewRows(t, chooseFalsifications(t, mulberry32(1)));
  const row = rows[1];
  const before = row.answerText;
  applyAmendment(t, row);
  assert.equal(row.answerText, questionByNumber(row.n).options[row.shown]);
  assert.notEqual(row.answerText, before);
});

test('an unanswered question renders a defined fallback value, never undefined', () => {
  const t = createTranscript();
  recordAnswer(t, {
    n: 1, choice: null, realElapsedMs: 5000, displayedElapsedMs: 9000, changes: 0, trick: null
  });
  const rows = reviewRows(t, []); // no falsifications in play
  assert.equal(rows[0].shown, null);
  assert.equal(rows[0].answerText, null); // never undefined — renderer's `?? fallback` needs a defined null
});
