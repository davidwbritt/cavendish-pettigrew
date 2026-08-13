import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimerDriver } from '../src/ui/timer-driver.js';

test('the driver reports a 45s face at the moment of start', () => {
  let now = 0;
  const d = createTimerDriver(24, () => now);
  assert.equal(d.displayedRemainingMs(), 45000);
});

test('the driver reports expiry at the real duration, not the displayed one', () => {
  let now = 0;
  const d = createTimerDriver(24, () => now);
  now = 19999;
  assert.equal(d.expired(), false);
  now = 20000;
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
  const d = createTimerDriver(23, () => now); // Q23, REAL_MS[23] = 20000
  now = 5000; d.freeze();
  now = 5000 + 20000 + 999999; // wildly past the real duration, but frozen throughout
  assert.equal(d.expired(), false, 'a frozen driver must never report expired');
});

test('a driver resumed mid-flight (finale cancelled) continues normally and still expires on schedule', () => {
  let now = 0;
  const d = createTimerDriver(23, () => now); // Q23, REAL_MS[23] = 20000
  now = 5000; d.freeze();                     // 5s real elapsed so far
  now = 500000; d.resume();                   // finale cancelled mid-flight — none of this counted
  now = 500000 + 14999;                       // 5s + 14.999s = 19.999s of real elapsed time — not yet due
  assert.equal(d.expired(), false, 'resumed driver must pick up exactly where it left off, not from zero');
  now = 500000 + 15000;                       // 5s + 15s = 20.000s of real elapsed time — due
  assert.equal(d.expired(), true, 'and must still expire normally once genuinely due after resuming');
});
