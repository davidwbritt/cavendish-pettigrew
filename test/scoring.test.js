import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { createTranscript, recordAnswer, recordAmendment } from '../src/transcript.js';
import { questionByNumber } from '../src/questions.js';
import {
  FACULTIES, computeFaculties, headlineCentile, classify,
  AMENDMENT_PENALTY, preliminaryScore, SCORE_FLOOR
} from '../src/scoring.js';

function transcript() {
  const t = createTranscript();
  for (let n = 1; n <= 24; n++) {
    recordAnswer(t, {
      n, choice: questionByNumber(n).correct ?? 0,
      realElapsedMs: 4000 + n * 100, displayedElapsedMs: 6000, changes: n % 3, trick: null
    });
  }
  t.telemetry.freezePointerDistance = 1800;
  return t;
}

test('there are seven faculties with unique keys', () => {
  assert.equal(FACULTIES.length, 7);
  assert.equal(new Set(FACULTIES.map(f => f.key)).size, 7);
});

test('every faculty computes to an integer in 0-100', () => {
  const scores = computeFaculties(transcript());
  for (const { key } of FACULTIES) {
    const v = scores[key];
    assert.ok(Number.isInteger(v), `${key} is not an integer: ${v}`);
    assert.ok(v >= 0 && v <= 100, `${key} out of range: ${v}`);
  }
});

test('scoring is a pure function of the transcript', () => {
  assert.deepEqual(computeFaculties(transcript()), computeFaculties(transcript()));
});

test('faculties are computed from the ALTERED transcript, not the real one', () => {
  const t = transcript();
  const honest = computeFaculties(t, []);
  const falsified = computeFaculties(t, [
    { n: 2, shown: 3 }, { n: 5, shown: 3 }, { n: 8, shown: 3 }
  ]);
  assert.notDeepEqual(honest, falsified,
    'the certificate must be consistent with the falsified record');
});

test('semantic satiation ignores the taker entirely', () => {
  const a = transcript();
  const b = transcript();
  b.entries.forEach(e => { e.choice = 0; e.realElapsedMs = 44000; e.changes = 9; });
  assert.equal(
    computeFaculties(a).semanticSatiation,
    computeFaculties(b).semanticSatiation
  );
});

test('response consistency falls as amendments rise', () => {
  const calm = transcript();
  const anxious = transcript();
  for (let i = 0; i < 6; i++) recordAmendment(anxious, 2, 1);
  assert.ok(
    computeFaculties(anxious).responseConsistency <
    computeFaculties(calm).responseConsistency
  );
});

test('composure falls as panic distance rises', () => {
  const still = transcript(); still.telemetry.freezePointerDistance = 0;
  const frantic = transcript(); frantic.telemetry.freezePointerDistance = 20000;
  assert.ok(computeFaculties(frantic).composure < computeFaculties(still).composure);
});

test('the headline centile is always flattering', () => {
  for (let s = 0; s < 300; s++) {
    const c = headlineCentile(mulberry32(s));
    assert.ok(c >= 91 && c <= 96, `centile ${c} is not flattering`);
  }
});

test('classification is clinical and derived from the extreme faculties', () => {
  const label = classify(computeFaculties(transcript()));
  assert.match(label, /^PROFILE 4-B — [A-Z]+ [A-Z]+$/, `got "${label}"`);
});

test('each amendment costs exactly two points', () => {
  assert.equal(preliminaryScore(100, 0), 100);
  assert.equal(preliminaryScore(100, 1), 100 - AMENDMENT_PENALTY);
  assert.equal(preliminaryScore(100, 3), 94);
});

test('the score never falls below the floor', () => {
  assert.equal(preliminaryScore(4, 50), SCORE_FLOOR);
});

test('premiseTolerance on wholly empty transcript is 0 (no engagement)', () => {
  const empty = createTranscript();
  const scores = computeFaculties(empty);
  assert.equal(scores.premiseTolerance, 0,
    'empty transcript should have zero premise tolerance, not count missing entries as engaged');
});

test('premiseTolerance with all explicit null choices is 0 (no engagement)', () => {
  const nullChoices = createTranscript();
  for (let n = 1; n <= 24; n++) {
    nullChoices.entries.push({
      n, choice: null, realElapsedMs: 5000, displayedElapsedMs: 30000, changes: 0, trick: null
    });
  }
  nullChoices.telemetry.freezePointerDistance = 0;
  const scores = computeFaculties(nullChoices);
  assert.equal(scores.premiseTolerance, 0,
    'explicit null choices should yield zero premise tolerance');
});

test('premiseTolerance with all nonsense questions answered yields 100 (full engagement)', () => {
  const t = createTranscript();
  // Nonsense question numbers: 11, 12, 14, 15, 17, 18, 20, 21, 22, 23, 24 (11 total)
  const nonsenseNums = [11, 12, 14, 15, 17, 18, 20, 21, 22, 23, 24];
  for (const n of nonsenseNums) {
    t.entries.push({
      n, choice: 0, realElapsedMs: 5000, displayedElapsedMs: 30000, changes: 0, trick: null
    });
  }
  t.telemetry.freezePointerDistance = 0;
  const scores = computeFaculties(t);
  assert.equal(scores.premiseTolerance, 100,
    'all 11 nonsense questions answered yields 100% premise tolerance');
});

test('premiseTolerance on partial transcript reflects only questions in transcript', () => {
  const partial = createTranscript();
  // Add entries for 5 nonsense questions: 11, 12, 14, 15, 17
  // Engage with 3 of them (11, 12, 14), leave 2 null (15, 17)
  partial.entries.push({ n: 11, choice: 1, realElapsedMs: 5000, displayedElapsedMs: 30000, changes: 0, trick: null });
  partial.entries.push({ n: 12, choice: 2, realElapsedMs: 5000, displayedElapsedMs: 30000, changes: 0, trick: null });
  partial.entries.push({ n: 14, choice: 3, realElapsedMs: 5000, displayedElapsedMs: 30000, changes: 0, trick: null });
  partial.entries.push({ n: 15, choice: null, realElapsedMs: 5000, displayedElapsedMs: 30000, changes: 0, trick: null });
  partial.entries.push({ n: 17, choice: null, realElapsedMs: 5000, displayedElapsedMs: 30000, changes: 0, trick: null });
  partial.telemetry.freezePointerDistance = 0;
  const scores = computeFaculties(partial);
  // There are 11 total nonsense questions, 3 in transcript are answered
  // premiseTolerance = 3/11 * 100 = 27.27... ≈ 27
  assert.equal(scores.premiseTolerance, 27,
    'partial engagement: 3 answered out of 11 total nonsense questions');
});

test('setShiftingCost returns valid integer when denominator guard applies', () => {
  // This test verifies the guard works if RECOVERY_QUESTIONS were empty (currently hardcoded non-empty)
  const empty = createTranscript();
  const scores = computeFaculties(empty);
  const v = scores.setShiftingCost;
  assert.ok(Number.isInteger(v), `setShiftingCost is not an integer: ${v}`);
  assert.ok(v >= 0 && v <= 100, `setShiftingCost out of range: ${v}`);
});
