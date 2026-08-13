import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pick, shuffle } from '../src/rng.js';

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('mulberry32 returns values in [0, 1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('shuffle preserves all elements and does not mutate input', () => {
  const input = [1, 2, 3, 4, 5];
  const out = shuffle(mulberry32(1), input);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
});

test('pick returns an element of the array', () => {
  const arr = ['a', 'b', 'c'];
  assert.ok(arr.includes(pick(mulberry32(3), arr)));
});
