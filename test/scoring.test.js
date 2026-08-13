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
