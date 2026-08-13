import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markPaper, markedScore } from '../src/marking.js';
import { QUESTIONS, questionByNumber, validateQuestions } from '../src/questions.js';
import { createTranscript, recordAnswer, recordAmendment } from '../src/transcript.js';

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
const answeringAll = choice => transcriptWith(QUESTIONS.map(q => ({ n: q.n, choice })));

test('every item is marked — all 24, with no gaps', () => {
  const rows = markPaper(answeringAll(0), []);
  assert.equal(rows.length, 24);
  assert.deepEqual(rows.map(r => r.n), QUESTIONS.map(q => q.n));
  for (const r of rows) {
    assert.ok(r.markText, `Q${r.n} printed no answer`);
    assert.ok('ABCD'.includes(r.markLetter), `Q${r.n} bad letter ${r.markLetter}`);
  }
});

test('scorable items are marked against their real correct answer', () => {
  const rows = markPaper(answeringAll(0), []);
  for (const r of rows.filter(x => !x.invented)) {
    const q = questionByNumber(r.n);
    assert.equal(r.markText, q.options[q.correct], `Q${r.n} marked against the wrong answer`);
    assert.equal(r.correct, q.correct === 0, 'answering A is right only where A is right');
  }
});

test('affect items are marked against the key held in the data', () => {
  const rows = markPaper(answeringAll(0), []);
  const invented = rows.filter(r => r.invented);
  assert.ok(invented.length > 0, 'there must be items with no correct answer');
  for (const r of invented) {
    const q = questionByNumber(r.n);
    assert.equal(q.correct, null, `Q${r.n} should have no correct answer`);
    assert.equal(r.markText, q.options[q.key], `Q${r.n} did not use its key`);
  }
});

test('grey is simply the right answer to the colour question', () => {
  const q = questionByNumber(20);
  const grey = q.options.indexOf('Grey');
  assert.ok(grey >= 0, 'Q20 must offer grey');
  assert.equal(q.key, grey, 'the colour key must be grey');

  // Choose grey and the instrument agrees — no machinery arranges for the
  // taker to be wrong about their own preference.
  const agrees = markPaper(transcriptWith([{ n: 20, choice: grey }]), []).find(r => r.n === 20);
  assert.equal(agrees.correct, true);
  assert.equal(agrees.markText, 'Grey');

  // Choose anything else and it does not.
  const differs = markPaper(transcriptWith([{ n: 20, choice: (grey + 1) % 4 }]), []).find(r => r.n === 20);
  assert.equal(differs.correct, false);
  assert.equal(differs.markText, 'Grey', 'and it still says grey');
});

test('the marks never move between runs — no rng anywhere in this module', () => {
  const t = answeringAll(2);
  const a = markPaper(t, []);
  const b = markPaper(t, []);
  assert.deepEqual(a, b, 'the screen must be safe to re-render');
});

test('an affect item can be got right, so the total is not fixed', () => {
  // Answering every item with its own key scores 24 of 24 — proof that
  // nothing forces the preference items to come out wrong.
  const t = transcriptWith(QUESTIONS.map(q => ({ n: q.n, choice: q.correct ?? q.key })));
  const { correct, total } = markedScore(markPaper(t, []));
  assert.equal(total, 24);
  assert.equal(correct, 24);
});

test('the marked paper reads the FALSIFIED record, not the truth', () => {
  // Unlike the debrief's key, this screen is the instrument talking, so it
  // must stay consistent with the review sheet the taker just saw.
  const q = questionByNumber(1);
  const t = transcriptWith([{ n: 1, choice: q.correct }]);
  const row = markPaper(t, [{ n: 1, shown: (q.correct + 1) % 4 }]).find(r => r.n === 1);
  assert.equal(row.yourText, q.options[(q.correct + 1) % 4], 'must show the falsified answer');
  assert.equal(row.correct, false, 'and mark them wrong for an answer they did not give');
});

test('an amendment the taker paid for is reflected on the very next screen', () => {
  const t = transcriptWith([{ n: 1, choice: 0 }]);
  recordAmendment(t, 1, 3);
  const row = markPaper(t, []).find(r => r.n === 1);
  assert.equal(row.yourText, questionByNumber(1).options[3]);
});

test('the latest amendment wins when a row was cycled several times', () => {
  const t = transcriptWith([{ n: 1, choice: 0 }]);
  recordAmendment(t, 1, 1);
  recordAmendment(t, 1, 2);
  const row = markPaper(t, []).find(r => r.n === 1);
  assert.equal(row.yourText, questionByNumber(1).options[2]);
});

test('an amendment overrides the falsification, as the review sheet showed it', () => {
  const t = transcriptWith([{ n: 1, choice: 0 }]);
  recordAmendment(t, 1, 2);
  const row = markPaper(t, [{ n: 1, shown: 3 }]).find(r => r.n === 1);
  assert.equal(row.yourText, questionByNumber(1).options[2]);
});

test('an unanswered item still prints an answer and is marked wrong', () => {
  const rows = markPaper(createTranscript(), []);
  assert.equal(rows.length, 24, 'every item is marked even with no transcript at all');
  for (const r of rows) {
    assert.equal(r.yourText, null);
    assert.equal(r.correct, false);
    assert.ok(r.markText, `Q${r.n} must still assert an answer`);
  }
});

test('no row can render a literal undefined', () => {
  for (const row of markPaper(answeringAll(1), [])) {
    for (const [k, v] of Object.entries(row)) {
      assert.ok(v !== undefined, `Q${row.n}.${k} was undefined`);
    }
  }
});

test('the validator requires a key on every unscorable item', () => {
  assert.deepEqual(validateQuestions(QUESTIONS), []);

  const missing = QUESTIONS.map(q => (q.correct === null ? { ...q, key: null } : q));
  assert.ok(validateQuestions(missing).some(e => /needs a key/.test(e)),
    'an unscorable item with no key leaves the marked paper nothing to print');

  const stray = QUESTIONS.map(q => (q.n === 1 ? { ...q, key: 2 } : q));
  assert.ok(validateQuestions(stray).some(e => /must not carry a key/.test(e)),
    'a scorable item already has its answer in `correct`');
});
