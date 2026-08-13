import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import {
  realDurationMs, displayedRemainingMs,
  DISPLAY_DURATION_MS, FLOOR_MS, RECOVERY_QUESTIONS, RED_THRESHOLD_MS
} from '../src/clock.js';

const ROOT = dirname(dirname(new URL(import.meta.url).pathname));

test('questions 1-5 are honest (the deposit)', () => {
  for (let n = 1; n <= 5; n++) assert.equal(realDurationMs(n), DISPLAY_DURATION_MS);
});

test('question 6 is where the honest deposit ends', () => {
  assert.equal(realDurationMs(5), DISPLAY_DURATION_MS);
  assert.ok(realDurationMs(6) < DISPLAY_DURATION_MS, 'Q6 must already be rushed');
});

test('real duration never drops below the floor', () => {
  for (let n = 1; n <= 24; n++) {
    assert.ok(realDurationMs(n) >= FLOOR_MS, `Q${n} = ${realDurationMs(n)}`);
  }
});

test('recovery questions get full honest time', () => {
  for (const n of RECOVERY_QUESTIONS) assert.equal(realDurationMs(n), DISPLAY_DURATION_MS);
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

test('displayed time always starts at the face duration regardless of question', () => {
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
  assert.equal(displayedRemainingMs(24, half), 15000);
  assert.equal(half, 5000); // taker has 5000ms left; the face says 15000ms
});

test('the duration curve matches the specified table exactly', () => {
  const actual = Array.from({ length: 24 }, (_, i) => realDurationMs(i + 1));
  assert.deepEqual(actual, [
    30000, 30000, 30000, 30000, 30000, 28000, 26000, 24000, 22000, 20000,
    18000, 16000, 30000, 15000, 14000, 30000, 13000, 12000, 30000, 11000,
    10000, 10000, 10000, 10000
  ]);
});

test('RED_THRESHOLD_MS is exactly 10 displayed seconds', () => {
  assert.equal(RED_THRESHOLD_MS, 10000);
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

// Fix (timer retune, whole-branch review): the face duration used to be
// hardcoded as a second literal (45000) in src/main.js and src/ui/screens.js
// while DISPLAY_DURATION_MS sat exported from this file and imported
// nowhere else — so retuning the constant here silently disagreed with
// those copies. This is the guard: greps every .js file under src/ (except
// this constant's own definition site) for the CURRENT face duration
// literal and asserts it never appears — a future change that reintroduces
// a hardcoded copy instead of importing DISPLAY_DURATION_MS fails a test
// instead of shipping a silently wrong "time spent" column. Mirrors
// test/rng.test.js's Math.random() grep guard.
async function jsFilesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await jsFilesUnder(full));
    else if (e.name.endsWith('.js')) files.push(full);
  }
  return files;
}

test('no source file outside clock.js hardcodes the face duration', async () => {
  const clockFile = resolve(ROOT, 'src/clock.js');
  const literal = String(DISPLAY_DURATION_MS);
  const pattern = new RegExp(`\\b${literal}\\b`);
  const files = await jsFilesUnder(resolve(ROOT, 'src'));
  const offenders = [];
  for (const file of files) {
    if (file === clockFile) continue;
    const code = await readFile(file, 'utf8');
    if (pattern.test(code)) offenders.push(file);
  }
  assert.deepEqual(offenders, [],
    `face duration literal ${literal} hardcoded outside clock.js: ${JSON.stringify(offenders)}`);
});
