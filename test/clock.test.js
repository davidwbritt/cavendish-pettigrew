import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  realDurationMs, displayedRemainingMs,
  DISPLAY_DURATION_MS, FLOOR_MS, RECOVERY_QUESTIONS
} from '../src/clock.js';

test('questions 1-10 are honest', () => {
  for (let n = 1; n <= 10; n++) assert.equal(realDurationMs(n), 45000);
});

test('real duration never drops below the 20s floor', () => {
  for (let n = 1; n <= 24; n++) {
    assert.ok(realDurationMs(n) >= FLOOR_MS, `Q${n} = ${realDurationMs(n)}`);
  }
});

test('recovery questions get full honest time', () => {
  for (const n of RECOVERY_QUESTIONS) assert.equal(realDurationMs(n), 45000);
});

test('real duration is monotonically non-increasing outside recovery questions', () => {
  const nonRecovery = [];
  for (let n = 11; n <= 24; n++) {
    if (!RECOVERY_QUESTIONS.includes(n)) nonRecovery.push(realDurationMs(n));
  }
  for (let i = 1; i < nonRecovery.length; i++) {
    assert.ok(nonRecovery[i] <= nonRecovery[i - 1], `rose at index ${i}`);
  }
});

test('displayed time always starts at 45s regardless of question', () => {
  for (let n = 1; n <= 24; n++) {
    assert.equal(displayedRemainingMs(n, 0), DISPLAY_DURATION_MS);
  }
});

test('displayed time reaches exactly zero at real expiry', () => {
  for (let n = 1; n <= 24; n++) {
    assert.equal(displayedRemainingMs(n, realDurationMs(n)), 0);
  }
});

test('displayed time is clamped at zero past expiry', () => {
  assert.equal(displayedRemainingMs(24, 999999), 0);
});

test('by Q24 the face overstates remaining time at the midpoint', () => {
  const half = realDurationMs(24) / 2;
  assert.equal(displayedRemainingMs(24, half), 22500);
  assert.equal(half, 10000); // taker has 10s left; the face says 22.5s
});

test('the duration curve matches the specified table exactly', () => {
  const actual = Array.from({ length: 24 }, (_, i) => realDurationMs(i + 1));
  assert.deepEqual(actual, [
    45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000, 45000,
    42000, 38000, 45000, 34000, 30000, 45000, 27000, 24000, 45000, 21000,
    20000, 20000, 20000, 20000
  ]);
});

test('the duration table and constants cannot drift apart', () => {
  // Every value in the table must be >= FLOOR_MS
  for (let n = 1; n <= 24; n++) {
    assert.ok(realDurationMs(n) >= FLOOR_MS, `Q${n} = ${realDurationMs(n)} is below FLOOR_MS = ${FLOOR_MS}`);
  }

  // Every index in RECOVERY_QUESTIONS must map to exactly DISPLAY_DURATION_MS
  for (const n of RECOVERY_QUESTIONS) {
    assert.equal(realDurationMs(n), DISPLAY_DURATION_MS, `Recovery Q${n} should be ${DISPLAY_DURATION_MS} but got ${realDurationMs(n)}`);
  }
});
