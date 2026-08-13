import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRICK_NAMES } from '../src/tricks.js';
import { TOUCH_SUBSTITUTIONS, effectiveTrick } from '../src/ui/effects.js';

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
