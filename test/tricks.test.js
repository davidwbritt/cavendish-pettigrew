import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { RECOVERY_QUESTIONS } from '../src/clock.js';
import {
  TRICK_NAMES, TRICK_COUNT, FINALE_QUESTION,
  eligibleQuestions, scheduleTricks, validateSchedule
} from '../src/tricks.js';

const schedules = () =>
  Array.from({ length: 300 }, (_, i) => scheduleTricks(mulberry32(i)));

test('there are six named tricks', () => {
  assert.equal(TRICK_NAMES.length, 6);
  assert.equal(new Set(TRICK_NAMES).size, 6);
});

test('eligible questions exclude Q1-10, recovery questions and the finale', () => {
  const eligible = eligibleQuestions();
  for (const n of eligible) {
    assert.ok(n >= 11, `Q${n} is inside the deposit`);
    assert.ok(!RECOVERY_QUESTIONS.includes(n), `Q${n} is a recovery question`);
    assert.notEqual(n, FINALE_QUESTION, 'finale must not carry a bag trick');
  }
  assert.deepEqual(eligible, [11, 12, 14, 15, 17, 18, 20, 21, 22, 24]);
});

test('every schedule places exactly TRICK_COUNT tricks', () => {
  for (const s of schedules()) assert.equal(s.size, TRICK_COUNT);
});

test('every generated schedule satisfies all invariants', () => {
  for (const s of schedules()) assert.deepEqual(validateSchedule(s), []);
});

test('no two tricks ever land on consecutive questions', () => {
  for (const s of schedules()) {
    const ns = [...s.keys()].sort((a, b) => a - b);
    for (let i = 1; i < ns.length; i++) {
      assert.ok(ns[i] - ns[i - 1] > 1, `consecutive at ${ns[i - 1]}/${ns[i]}`);
    }
  }
});

test('the same trick never fires twice in succession', () => {
  for (const s of schedules()) {
    const ordered = [...s.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    for (let i = 1; i < ordered.length; i++) {
      assert.notEqual(ordered[i], ordered[i - 1]);
    }
  }
});

test('scheduling is deterministic for a given seed', () => {
  const a = [...scheduleTricks(mulberry32(99)).entries()];
  const b = [...scheduleTricks(mulberry32(99)).entries()];
  assert.deepEqual(a, b);
});

test('validateSchedule catches a trick placed inside the deposit', () => {
  const bad = new Map([[5, 'deadClick']]);
  assert.ok(validateSchedule(bad).some(e => e.includes('before Q11')));
});

test('validateSchedule catches a trick on a recovery question', () => {
  const bad = new Map([[13, 'deadClick']]);
  assert.ok(validateSchedule(bad).some(e => e.includes('recovery')));
});
