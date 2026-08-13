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
