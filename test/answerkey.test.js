import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerKeyRows, answerKeyScore, applyAmendment, rowPenaltyText, reviewRows
} from '../src/ui/screens.js';
import { createTranscript, recordAnswer, amendmentCount } from '../src/transcript.js';
import { preliminaryScore } from '../src/scoring.js';
import { QUESTIONS, questionByNumber } from '../src/questions.js';

const transcriptWith = entries => {
  const t = createTranscript();
  for (const e of entries) {
    recordAnswer(t, {
      n: e.n, choice: e.choice, realElapsedMs: 1000,
      displayedElapsedMs: 1000, timedOut: Boolean(e.timedOut)
    });
  }
  return t;
};

// ── the cumulative amendment penalty ──────────────────────────────────────

test('each EDIT on one row costs another 2: −2, −4, −6', () => {
  // The stamp used to print a constant −2 however many times a row was
  // edited, while the running total fell by 2 each time — so a taker
  // cycling A -> B -> C to find the answer they knew they gave watched the
  // score drop six points against a row still claiming two.
  const t = transcriptWith([{ n: 1, choice: 0 }]);
  const [row] = reviewRows(t, []);
  assert.equal(rowPenaltyText(row), '−0', 'an untouched row owes nothing');

  const seen = [];
  for (let i = 0; i < 3; i++) {
    applyAmendment(t, row);
    seen.push(rowPenaltyText(row));
  }
  assert.deepEqual(seen, ['−2', '−4', '−6']);
});

test('the row stamp and the running score stay in step', () => {
  const t = transcriptWith([{ n: 1, choice: 0 }]);
  const [row] = reviewRows(t, []);
  for (let i = 1; i <= 4; i++) {
    applyAmendment(t, row);
    assert.equal(rowPenaltyText(row), `−${2 * i}`);
    assert.equal(preliminaryScore(100, amendmentCount(t)), 100 - 2 * i,
      'the sheet total must never disagree with the row stamp');
  }
});

test('per-row counts are independent, and all of them bill the same total', () => {
  const t = transcriptWith([{ n: 1, choice: 0 }, { n: 2, choice: 1 }]);
  const rows = reviewRows(t, []);
  applyAmendment(t, rows[0]);
  applyAmendment(t, rows[0]);
  applyAmendment(t, rows[1]);
  assert.equal(rowPenaltyText(rows[0]), '−4');
  assert.equal(rowPenaltyText(rows[1]), '−2');
  assert.equal(amendmentCount(t), 3, 'every edit is billed, wherever it landed');
});

test('editing still cycles the answer A -> B -> C -> D -> A', () => {
  const t = transcriptWith([{ n: 1, choice: 0 }]);
  const [row] = reviewRows(t, []);
  assert.deepEqual([0, 1, 2, 3].map(() => applyAmendment(t, row)), [1, 2, 3, 0]);
});

// ── the answer key ────────────────────────────────────────────────────────

test('the key reports the TRUE answer, never the falsified one', () => {
  // Everywhere else reads through shownChoiceFor because the instrument is
  // lying. This is the one place that is not.
  const q = questionByNumber(1);
  const mine = (q.correct + 1) % 4;
  const t = transcriptWith([{ n: 1, choice: mine }]);
  const [row] = answerKeyRows(t, [{ n: 1, shown: (mine + 1) % 4 }]);
  assert.equal(row.yours, q.options[mine], 'must show what the taker actually picked');
  assert.equal(row.falsified, true);
  assert.equal(row.recorded, q.options[(mine + 1) % 4], 'and what the sheet claimed instead');
});

test('an unfalsified row carries no record-said line', () => {
  const t = transcriptWith([{ n: 1, choice: 2 }]);
  const [row] = answerKeyRows(t, []);
  assert.equal(row.falsified, false);
  assert.equal(row.recorded, null);
});

test('correctness is judged on the real choice, not the falsified one', () => {
  // A taker who got it right must be told they got it right, even though
  // the certificate was scored off the altered record.
  const q = questionByNumber(1);
  const t = transcriptWith([{ n: 1, choice: q.correct }]);
  const [row] = answerKeyRows(t, [{ n: 1, shown: (q.correct + 1) % 4 }]);
  assert.equal(row.correct, true, 'the falsification must not cost them the tick');
  assert.equal(row.answer, q.options[q.correct]);
});

test('items with no correct answer are marked unscorable, never incorrect', () => {
  // Q21-24 and the affect items have no right answer. Marking them wrong
  // would be the instrument telling one more lie on the screen built to
  // stop lying.
  const t = transcriptWith(QUESTIONS.map(q => ({ n: q.n, choice: 0 })));
  for (const row of answerKeyRows(t, [])) {
    const q = questionByNumber(row.n);
    if (q.correct === null) {
      assert.equal(row.scorable, false, `Q${row.n} should not be scorable`);
      assert.equal(row.correct, false);
      assert.equal(row.answer, null, 'and must not invent an answer to show');
    } else {
      assert.equal(row.scorable, true, `Q${row.n} should be scorable`);
    }
  }
});

test('the score counts only scorable items, and matches the ticks beside it', () => {
  const t = transcriptWith(QUESTIONS.map(q => ({ n: q.n, choice: q.correct ?? 0 })));
  const rows = answerKeyRows(t, []);
  const { correct, total } = answerKeyScore(rows);
  const scorable = QUESTIONS.filter(q => q.correct !== null).length;
  assert.equal(total, scorable);
  assert.equal(correct, scorable, 'a perfect sitting scores every scorable item');
  assert.equal(correct, rows.filter(r => r.correct).length, 'count must match the ticks');
});

test('a sitting that got everything wrong scores zero without crashing', () => {
  const t = transcriptWith(QUESTIONS.map(q => ({
    n: q.n, choice: q.correct === null ? 0 : (q.correct + 1) % 4
  })));
  const { correct, total } = answerKeyScore(answerKeyRows(t, []));
  assert.equal(correct, 0);
  assert.ok(total > 0);
});

test('a timed-out row is flagged and still shows what was recorded for it', () => {
  const t = transcriptWith([{ n: 1, choice: 3, timedOut: true }]);
  const [row] = answerKeyRows(t, []);
  assert.equal(row.timedOut, true);
  assert.equal(row.yours, questionByNumber(1).options[3]);
});

test('rows come back in question order regardless of entry order', () => {
  const t = transcriptWith([{ n: 3, choice: 0 }, { n: 1, choice: 0 }, { n: 2, choice: 0 }]);
  assert.deepEqual(answerKeyRows(t, []).map(r => r.n), [1, 2, 3]);
});

test('no key row can render a literal undefined for any question', () => {
  const t = transcriptWith(QUESTIONS.map(q => ({ n: q.n, choice: 1 })));
  for (const row of answerKeyRows(t, [])) {
    for (const [k, v] of Object.entries(row)) {
      assert.ok(v !== undefined, `Q${row.n}.${k} was undefined`);
    }
  }
});

test('an empty transcript yields an empty key rather than throwing', () => {
  assert.deepEqual(answerKeyRows(createTranscript(), []), []);
  assert.deepEqual(answerKeyScore([]), { correct: 0, total: 0 });
});
