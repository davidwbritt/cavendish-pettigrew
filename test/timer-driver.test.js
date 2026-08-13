import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimerDriver } from '../src/ui/timer-driver.js';
import { DISPLAY_DURATION_MS, realDurationMs } from '../src/clock.js';

test('the driver reports the face duration at the moment of start', () => {
  let now = 0;
  const d = createTimerDriver(24, () => now);
  assert.equal(d.displayedRemainingMs(), DISPLAY_DURATION_MS);
});

test('the driver reports expiry at the real duration, not the displayed one', () => {
  let now = 0;
  const d = createTimerDriver(24, () => now); // Q24, REAL_MS[24] = 10000 (floor)
  now = realDurationMs(24) - 1;
  assert.equal(d.expired(), false);
  now = realDurationMs(24);
  assert.equal(d.expired(), true);
  assert.equal(d.displayedRemainingMs(), 0);
});

test('the driver can be frozen and resumed without losing elapsed time', () => {
  let now = 0;
  const d = createTimerDriver(24, () => now);
  now = 5000; d.freeze();
  now = 30000; d.resume();
  now = 31000;
  assert.equal(d.expired(), false, 'frozen time must not count against the taker');
});

// Task 15's timeout/forced-answer feature: the Q23 finale (src/ui/cursor.js's
// runFinale) freezes the driver for its duration and resumes it on ANY
// exit path (natural completion or an aborting keydown/cancel()). This is
// what's supposed to guarantee expiry can never fire mid-finale — confirmed
// here directly against the driver, independent of the DOM-only cursor/
// finale machinery.
test('expiry cannot fire while frozen, no matter how much wall-clock time passes', () => {
  let now = 0;
  const d = createTimerDriver(23, () => now); // Q23, REAL_MS[23] = 10000 (floor)
  now = 5000; d.freeze();
  now = 5000 + 10000 + 999999; // wildly past the real duration, but frozen throughout
  assert.equal(d.expired(), false, 'a frozen driver must never report expired');
});

test('a driver resumed mid-flight (finale cancelled) continues normally and still expires on schedule', () => {
  let now = 0;
  const d = createTimerDriver(23, () => now); // Q23, REAL_MS[23] = 10000 (floor)
  now = 5000; d.freeze();                     // 5s real elapsed so far
  now = 500000; d.resume();                   // finale cancelled mid-flight — none of this counted
  now = 500000 + 4999;                        // 5s + 4.999s = 9.999s of real elapsed time — not yet due
  assert.equal(d.expired(), false, 'resumed driver must pick up exactly where it left off, not from zero');
  now = 500000 + 5000;                        // 5s + 5s = 10.000s of real elapsed time — due
  assert.equal(d.expired(), true, 'and must still expire normally once genuinely due after resuming');
});

test('expire() drops the clock to zero even while frozen, and is one-way', () => {
  // The Q23 finale calls this with the clock still frozen (src/ui/cursor.js),
  // so it has to short-circuit the frozen/running distinction entirely.
  let now = 0;
  const d = createTimerDriver(1, () => now);
  now = 5000; d.freeze();
  now = 90000;
  assert.equal(d.expired(), false, 'frozen, so not yet expired');

  d.expire();
  assert.equal(d.expired(), true, 'expired on the spot, despite being frozen');
  assert.equal(d.displayedRemainingMs(), 0, 'and the face reads zero');

  // Nothing hands a forced clock back. resume() exists for the abort paths,
  // which must leave the taker's remaining time exactly as they found it.
  d.resume();
  assert.equal(d.expired(), true, 'resume() must not revive a forced clock');
  assert.equal(d.displayedRemainingMs(), 0);
});

test('expire() reports zero for every question, whatever its real duration', () => {
  for (let n = 1; n <= 24; n++) {
    const d = createTimerDriver(n, () => 0);
    d.expire();
    assert.equal(d.displayedRemainingMs(), 0, `Q${n} face did not reach zero`);
    assert.equal(d.expired(), true, `Q${n} did not report expired`);
  }
});
