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
    optionElements: [0, 1, 2, 3], onChoose: () => {}, rng, isTouch: false, setInterceptor
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
    optionElements: [0, 1, 2, 3], onChoose: () => {}, rng: () => 0, isTouch: false, setInterceptor
  });
  assert.equal(interceptor(0), 1);
  assert.equal(interceptor(1), 2);
  assert.equal(interceptor(3), 0, 'wraps around past the last option');
});

test('detach() clears the interceptor', () => {
  let interceptor = 'unset';
  const setInterceptor = fn => { interceptor = fn; };
  const detach = applyTrick('deadClick', {
    optionElements: [0, 1, 2, 3], onChoose: () => {}, rng: () => 0, isTouch: false, setInterceptor
  });
  assert.equal(typeof interceptor, 'function');
  detach();
  assert.equal(interceptor, null);
});

test('deadClick and ghostSelection degrade to no-ops when setInterceptor is not supplied', () => {
  assert.doesNotThrow(() => {
    const detach = applyTrick('deadClick', { optionElements: [0, 1, 2, 3], onChoose: () => {}, rng: () => 0, isTouch: false });
    detach();
  });
  assert.doesNotThrow(() => {
    const detach = applyTrick('ghostSelection', { optionElements: [0, 1, 2, 3], onChoose: () => {}, rng: () => 0, isTouch: false });
    detach();
  });
});
