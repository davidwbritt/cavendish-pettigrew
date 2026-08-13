import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTally, RESIDUAL_TOLERANCE } from '../src/tally.js';
import { realDurationMs, DISPLAY_DURATION_MS } from '../src/clock.js';
import { QUESTIONS } from '../src/questions.js';

// Builds an entry that consumed `fraction` of question n's DISPLAYED
// interval. Note the multiplication by the REAL duration: that is what the
// taker's wall-clock time would have to be for the 30s face to show that
// fraction gone, which is exactly the mapping computeTally has to invert.
const entryAt = (n, fraction, timedOut = false) => ({
  n, choice: 0, realElapsedMs: realDurationMs(n) * fraction, timedOut, changes: 0
});

test('returns null when the requested item has not been answered', () => {
  assert.equal(computeTally([], 1), null);
  assert.equal(computeTally([entryAt(1, 0.5)], 2), null);
});

test('lambda reflects the DISPLAYED clock, not the real one', () => {
  // Q20 really allows 11s but shows a 30s face. Half of the real duration
  // must read as half of the face — .500 — never as 5500/30000 = .183.
  // Printing real durations on screen would hand the taker the entire
  // deception twenty questions before the debrief admits it.
  const t = computeTally([entryAt(20, 0.5)], 20);
  assert.ok(Math.abs(t.lambda - 0.5) < 1e-9, `lambda was ${t.lambda}`);
  assert.match(t.lines[0], /λ \.500/);
});

test('every question maps a half-consumed interval to the same lambda', () => {
  // The face is uniform even though the real durations are not, so the
  // readout must be uniform too — a taker comparing item 3 against item 21
  // must find nothing to notice.
  for (const q of QUESTIONS) {
    const t = computeTally([entryAt(q.n, 0.5)], q.n);
    assert.ok(Math.abs(t.lambda - 0.5) < 1e-9, `Q${q.n} lambda was ${t.lambda}`);
  }
});

test('sigma is a genuine running total across the sitting', () => {
  const entries = [entryAt(1, 0.2), entryAt(2, 0.4), entryAt(3, 0.6)];
  assert.ok(Math.abs(computeTally(entries, 1).sigmaLambda - 0.2) < 1e-9);
  assert.ok(Math.abs(computeTally(entries, 2).sigmaLambda - 0.6) < 1e-9);
  assert.ok(Math.abs(computeTally(entries, 3).sigmaLambda - 1.2) < 1e-9);
});

test('items after the requested one are ignored', () => {
  // The tally is drawn mid-sitting; it must never include an item the taker
  // has not reached, even if the caller hands over the whole list.
  const entries = [entryAt(1, 0.2), entryAt(2, 0.9)];
  assert.ok(Math.abs(computeTally(entries, 1).sigmaLambda - 0.2) < 1e-9);
});

test('kappa is exactly 1 on the first item and can only fall afterwards', () => {
  // A single value cannot deviate from its own mean, so the taker always
  // starts at a perfect 1.0000 and watches it decay for the rest of the
  // sitting, whatever they do. That descent is the whole design.
  const first = computeTally([entryAt(1, 0.37)], 1);
  assert.equal(first.kappa, 1);
  assert.match(first.lines[0], /κ 1\.0000 Δ\+\.0000/);

  const entries = [entryAt(1, 0.2), entryAt(2, 0.8)];
  const second = computeTally(entries, 2);
  assert.ok(second.kappa < 1, 'varied pacing must cost kappa');
  assert.ok(second.deltaKappa < 0, 'and the delta must show it falling');
});

test('kappa stays inside [0.5, 1] for the most extreme pacing possible', () => {
  // Bounded because every fraction is bounded, which is what keeps it
  // printing as a plausible coefficient rather than a negative number.
  const entries = [entryAt(1, 0), entryAt(2, 1), entryAt(3, 0), entryAt(4, 1)];
  for (let n = 1; n <= 4; n++) {
    const { kappa } = computeTally(entries, n);
    assert.ok(kappa >= 0.5 && kappa <= 1, `kappa ${kappa} out of range at item ${n}`);
  }
});

test('a timed-out item reads REFUSED and is always FLAGGED', () => {
  // Even when its residual is nil — an even-paced sitting whose refusal
  // sits exactly on the mean would otherwise print WITHIN TOLERANCE, and
  // the instrument wants the refusal it invented on the record.
  const entries = [entryAt(1, 1), entryAt(2, 1), entryAt(3, 1, true)];
  const t = computeTally(entries, 3);
  assert.ok(t.residual < RESIDUAL_TOLERANCE, 'this fixture must have a small residual');
  assert.equal(t.refused, true);
  assert.equal(t.flagged, true);
  assert.match(t.lines[0], /^ITEM 03\/24 REFUSED/);
  assert.match(t.lines[1], /FLAGGED$/);
});

test('an ordinary item reads LOGGED and WITHIN TOLERANCE', () => {
  const entries = [entryAt(1, 0.5), entryAt(2, 0.5)];
  const t = computeTally(entries, 2);
  assert.equal(t.refused, false);
  assert.equal(t.flagged, false);
  assert.match(t.lines[0], /^ITEM 02\/24 LOGGED/);
  assert.match(t.lines[1], /WITHIN TOLERANCE$/);
});

test('a wildly out-of-band item is flagged without having timed out', () => {
  const entries = [entryAt(1, 0.1), entryAt(2, 0.1), entryAt(3, 1)];
  const t = computeTally(entries, 3);
  assert.equal(t.refused, false, 'not a timeout');
  assert.ok(t.residual > RESIDUAL_TOLERANCE);
  assert.equal(t.flagged, true);
});

test('the stratum index steps i -> ii -> iii across the three phases', () => {
  // The one figure the taker can actually decode, and it still explains
  // nothing. It has to track the phase boundaries exactly.
  const entries = QUESTIONS.map(q => entryAt(q.n, 0.5));
  assert.equal(computeTally(entries, 10).stratum, 'i');
  assert.equal(computeTally(entries, 11).stratum, 'ii');
  assert.equal(computeTally(entries, 20).stratum, 'ii');
  assert.equal(computeTally(entries, 21).stratum, 'iii');
});

test('figures print in house style: bounded values stripped, totals not, U+2212 for minus', () => {
  // Real statistical typography drops the leading zero only for quantities
  // that CANNOT exceed 1 — λ, κ and the residual. Σλ is a running total that
  // passes 1 within the first few items, so it keeps its integer part and
  // must NOT be stripped. Getting this backwards is the kind of detail that
  // makes a fake readout read as fake.
  const early = computeTally([entryAt(1, 0.2)], 1);          // Σλ still below 1
  assert.match(early.lines[0], /Σλ 0\.200/, 'a sub-1 total keeps its leading zero');
  assert.match(early.lines[0], /λ \.200/, 'but the bounded lambda does not');

  const entries = [entryAt(1, 0.2), entryAt(2, 0.8)];
  const t = computeTally(entries, 2);
  assert.match(t.lines[0], /Σλ 1\.000/, 'and a total past 1 shows its integer part');
  assert.ok(!/κ 0\./.test(t.lines[0]), 'kappa is bounded and must be stripped');
  assert.ok(!/RESIDUAL 0\./.test(t.lines[1]), 'the residual is bounded and must be stripped');
  assert.ok(t.lines[0].includes('−'), 'a falling kappa must use U+2212, not a hyphen');
  assert.ok(!t.lines[0].includes('-'), 'and never an ASCII hyphen');
});

test('a delta that rounds to zero never prints as negative zero', () => {
  // Two identically paced items leave kappa untouched; "Δ−.0000" would be
  // both wrong and conspicuous.
  const entries = [entryAt(1, 0.5), entryAt(2, 0.5)];
  assert.match(computeTally(entries, 2).lines[0], /Δ\+\.0000/);
});

test('no line can render a literal undefined or NaN for any question', () => {
  // The same guarantee the probe checks on the review sheet and the
  // certificate, enforced here across all 24 items at both extremes.
  for (const q of QUESTIONS) {
    for (const fraction of [0, 1]) {
      const entries = QUESTIONS.filter(x => x.n <= q.n).map(x => entryAt(x.n, fraction));
      const text = computeTally(entries, q.n).lines.join(' ');
      assert.ok(!text.includes('undefined'), `Q${q.n} rendered undefined`);
      assert.ok(!text.includes('NaN'), `Q${q.n} rendered NaN`);
    }
  }
});

test('the readout stays short enough for the form measure', () => {
  // Two lines of monospace under the options; a line long enough to wrap
  // stops reading as instrument output and starts reading as prose.
  const entries = QUESTIONS.map(q => entryAt(q.n, 0.987));
  for (const q of QUESTIONS) {
    for (const line of computeTally(entries, q.n).lines) {
      assert.ok(line.length <= 72, `Q${q.n} line too long (${line.length}): ${line}`);
    }
  }
});

test('DISPLAY_DURATION_MS is the only interval the readout ever exposes', () => {
  // Guards the deception directly: a full sitting at the face's own
  // duration must produce lambda 1.000 on every item, including the ones
  // that really only allowed 10 seconds.
  for (const q of QUESTIONS) {
    const t = computeTally([entryAt(q.n, 1)], q.n);
    assert.match(t.lines[0], /λ 1\.000/, `Q${q.n} leaked a non-uniform interval`);
  }
  assert.equal(DISPLAY_DURATION_MS, 30000);
});
