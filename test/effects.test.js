import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRICK_NAMES } from '../src/tricks.js';
import { TOUCH_SUBSTITUTIONS, effectiveTrick, applyTrick } from '../src/ui/effects.js';

test('every trick declares whether it survives on touch', () => {
  for (const name of TRICK_NAMES) {
    assert.ok(name in TOUCH_SUBSTITUTIONS, `${name} has no touch policy`);
  }
});

test('cursor-dependent tricks are substituted on touch, never dropped', () => {
  for (const name of ['buttonFlinch', 'phantomLock']) {
    const sub = effectiveTrick(name, true);
    assert.notEqual(sub, name, `${name} must be substituted on touch`);
    assert.ok(sub, `${name} must not be dropped on touch`);
  }
});

test('pointer-agnostic tricks are unchanged on touch', () => {
  for (const name of ['deadClick', 'ghostSelection', 'doubleMark', 'stickyAnswer']) {
    assert.equal(effectiveTrick(name, true), name);
  }
});

test('every trick maps to a defined effective form on both pointer types', () => {
  for (const name of TRICK_NAMES) {
    assert.ok(effectiveTrick(name, false), `${name} has no mouse form`);
    assert.ok(effectiveTrick(name, true), `${name} has no touch form`);
  }
});

// screens.js owns the interceptor hook (a listener added later by
// applyTrick can never pre-empt the real onclick), so deadClick and
// ghostSelection are structured as plain functions installed via
// setInterceptor — no DOM required to exercise them.

test('deadClick interceptor swallows at most 2 clicks, then passes every index through unchanged', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  const rng = () => 0; // always beats the 0.8 threshold while under the cap
  applyTrick('deadClick', {
    optionElements: [0, 1, 2, 3], rng, isTouch: false, setInterceptor
  });
  assert.equal(interceptor(0), null, 'first click is swallowed');
  assert.equal(interceptor(1), null, 'second click is swallowed');
  assert.equal(interceptor(2), 2, 'third click passes through unchanged');
  assert.equal(interceptor(3), 3, 'later clicks keep passing through');
});

test('ghostSelection interceptor always returns the neighbouring index, wrapping around', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  applyTrick('ghostSelection', {
    optionElements: [0, 1, 2, 3], rng: () => 0, isTouch: false, setInterceptor
  });
  assert.equal(interceptor(0), 1);
  assert.equal(interceptor(1), 2);
  assert.equal(interceptor(3), 0, 'wraps around past the last option');
});

test('detach() clears the interceptor', () => {
  let interceptor = 'unset';
  const setInterceptor = fn => { interceptor = fn; };
  const detach = applyTrick('deadClick', {
    optionElements: [0, 1, 2, 3], rng: () => 0, isTouch: false, setInterceptor
  });
  assert.equal(typeof interceptor, 'function');
  detach();
  assert.equal(interceptor, null);
});

test('deadClick and ghostSelection degrade to no-ops when setInterceptor is not supplied', () => {
  assert.doesNotThrow(() => {
    const detach = applyTrick('deadClick', { optionElements: [0, 1, 2, 3], rng: () => 0, isTouch: false });
    detach();
  });
  assert.doesNotThrow(() => {
    const detach = applyTrick('ghostSelection', { optionElements: [0, 1, 2, 3], rng: () => 0, isTouch: false });
    detach();
  });
});

// doubleMark and stickyAnswer (fix round 1, Task 15 review): originally
// plain click listeners registered after screens.js's real onclick — dead
// code, since main.js's synchronous teardown (a hard requirement: an
// answer must never commit against an already-advanced question) removes
// those listeners before the browser's dispatch loop ever reaches them.
// Redesigned around the same setInterceptor swallow shape as deadClick and
// ghostSelection above: swallow exactly the first click (there must be a
// screen left for the "reveal, then rescind" effect to act on), then let
// the second click through to commit for real. No jsdom is available, so
// optionElements here are minimal stand-ins exposing only the
// getAttribute/setAttribute surface these two tricks actually touch.
function mockOptions(n) {
  return Array.from({ length: n }, () => {
    const attrs = new Map();
    return {
      setAttribute: (k, v) => attrs.set(k, v),
      getAttribute: k => (attrs.has(k) ? attrs.get(k) : null)
    };
  });
}

test('stickyAnswer interceptor swallows exactly the first click, then passes every index through unchanged', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  const optionElements = mockOptions(4);
  const detach = applyTrick('stickyAnswer', { optionElements, rng: () => 0, isTouch: false, setInterceptor });

  assert.equal(interceptor(1), null, 'first click is swallowed');
  assert.equal(interceptor(1), 1, 'second click on the same option passes through and commits');
  assert.equal(interceptor(2), 2, 'a third click cannot be swallowed again');
  detach(); // cancels the pending 700ms revert timer so the test process can exit promptly
});

test('doubleMark interceptor swallows exactly the first click, then passes every index through unchanged', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  const optionElements = mockOptions(4);
  const detach = applyTrick('doubleMark', { optionElements, rng: () => 0, isTouch: false, setInterceptor });

  assert.equal(interceptor(0), null, 'first click is swallowed');
  assert.equal(interceptor(0), 0, 'second click on the same option passes through and commits');
  assert.equal(interceptor(3), 3, 'a third click cannot be swallowed again');
  detach(); // cancels the pending 900ms revert timer so the test process can exit promptly
});

test('stickyAnswer lights only the clicked option on the swallowed click', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  const optionElements = mockOptions(4);
  const detach = applyTrick('stickyAnswer', { optionElements, rng: () => 0, isTouch: false, setInterceptor });

  interceptor(1);
  assert.equal(optionElements[1].getAttribute('aria-pressed'), 'true', 'the clicked option is lit');
  for (const i of [0, 2, 3]) {
    assert.equal(optionElements[i].getAttribute('aria-pressed'), null, `option ${i} must be untouched`);
  }
  detach();
});

test('doubleMark lights the clicked option and its (i + 2) % length ghost on the swallowed click', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  const optionElements = mockOptions(4);
  const detach = applyTrick('doubleMark', { optionElements, rng: () => 0, isTouch: false, setInterceptor });

  interceptor(1);
  assert.equal(optionElements[1].getAttribute('aria-pressed'), 'true', 'the clicked option is lit');
  assert.equal(optionElements[3].getAttribute('aria-pressed'), 'true', 'the (1 + 2) % 4 = 3 ghost is lit too');
  for (const i of [0, 2]) {
    assert.equal(optionElements[i].getAttribute('aria-pressed'), null, `option ${i} must be untouched`);
  }
  detach();
});

test('detach() reverts a stickyAnswer highlight left over from an unfinished swallow', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  const optionElements = mockOptions(4);
  const detach = applyTrick('stickyAnswer', { optionElements, rng: () => 0, isTouch: false, setInterceptor });

  interceptor(2); // swallow — never followed by a second click before teardown
  detach();
  assert.equal(optionElements[2].getAttribute('aria-pressed'), 'false',
    'detach must actively revert the highlight, not merely cancel its timer');
});

test('detach() reverts a doubleMark highlight left over from an unfinished swallow', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  const optionElements = mockOptions(4);
  const detach = applyTrick('doubleMark', { optionElements, rng: () => 0, isTouch: false, setInterceptor });

  interceptor(1); // swallow — never followed by a second click before teardown
  detach();
  assert.equal(optionElements[1].getAttribute('aria-pressed'), 'false', 'the real option must be reverted');
  assert.equal(optionElements[3].getAttribute('aria-pressed'), 'false', 'the ghost option must be reverted too');
});

test('stickyAnswer never re-clears a node once the real second click has claimed it', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  const optionElements = mockOptions(4);
  const detach = applyTrick('stickyAnswer', { optionElements, rng: () => 0, isTouch: false, setInterceptor });

  interceptor(2);                                    // first click: swallowed, option 2 lit
  interceptor(2);                                     // second click: passes through, commits for real
  optionElements[2].setAttribute('aria-pressed', 'true'); // stand-in for screens.js's own genuine selectOption()
  detach();
  assert.equal(optionElements[2].getAttribute('aria-pressed'), 'true',
    'detach must not clobber a genuine selection that landed on the same node it once faked');
});

test('doubleMark never re-clears the real node once the real second click has claimed it, but still clears its ghost', () => {
  let interceptor;
  const setInterceptor = fn => { interceptor = fn; };
  const optionElements = mockOptions(4);
  const detach = applyTrick('doubleMark', { optionElements, rng: () => 0, isTouch: false, setInterceptor });

  interceptor(0);                                    // first click: swallowed, options 0 and 2 lit
  interceptor(0);                                     // second click: passes through, commits for real
  optionElements[0].setAttribute('aria-pressed', 'true'); // stand-in for screens.js's own genuine selectOption()
  detach();
  assert.equal(optionElements[0].getAttribute('aria-pressed'), 'true',
    'detach must not clobber the genuinely selected option');
  assert.equal(optionElements[2].getAttribute('aria-pressed'), 'false',
    'the decoy ghost is never genuine and must still be reverted');
});
