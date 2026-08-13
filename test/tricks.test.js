import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { RECOVERY_QUESTIONS } from '../src/clock.js';
import {
  TRICK_NAMES, TRICK_COUNT, FINALE_QUESTION, GENTLE_CLOSER, ADJACENCY_RELAXED_FROM,
  eligibleQuestions, scheduleTricks, validateSchedule
} from '../src/tricks.js';

const SEED_COUNT = 1500;
const schedules = () =>
  Array.from({ length: SEED_COUNT }, (_, i) => scheduleTricks(mulberry32(i)));

test('there are nine named tricks, all distinct', () => {
  assert.equal(TRICK_NAMES.length, 9);
  assert.equal(new Set(TRICK_NAMES).size, 9);
  assert.ok(TRICK_NAMES.includes('lockout'));
  assert.ok(TRICK_NAMES.includes('textSwap'));
});

test('TRICK_COUNT is 7, matching the 2-early + 5-late maximum under relaxed late adjacency', () => {
  assert.equal(TRICK_COUNT, 7);
});

test('eligible questions exclude Q1-10, recovery questions, the finale, and the gentle closer', () => {
  const eligible = eligibleQuestions();
  for (const n of eligible) {
    assert.ok(n >= 11, `Q${n} is inside the deposit`);
    assert.ok(!RECOVERY_QUESTIONS.includes(n), `Q${n} is a recovery question`);
    assert.notEqual(n, FINALE_QUESTION, 'finale must not carry a bag trick');
    assert.notEqual(n, GENTLE_CLOSER, 'gentle closer must not be sabotaged');
  }
  assert.deepEqual(eligible, [11, 12, 14, 15, 17, 18, 20, 21, 22]);
});

test('every schedule places exactly TRICK_COUNT tricks', () => {
  for (const s of schedules()) assert.equal(s.size, TRICK_COUNT);
});

test('every generated schedule satisfies all invariants', () => {
  for (const s of schedules()) assert.deepEqual(validateSchedule(s), []);
});

test('no two tricks land on consecutive questions below Q17', () => {
  for (const s of schedules()) {
    const ns = [...s.keys()].sort((a, b) => a - b);
    for (let i = 1; i < ns.length; i++) {
      if (ns[i] < ADJACENCY_RELAXED_FROM) {
        assert.ok(ns[i] - ns[i - 1] > 1, `consecutive below Q${ADJACENCY_RELAXED_FROM} at ${ns[i - 1]}/${ns[i]}`);
      }
    }
  }
});

// ACCEPTED CONSEQUENCE (see src/tricks.js): with TRICK_COUNT=7 and only
// 2 early slots achievable, every valid schedule must use ALL 5 late slots
// (17,18,20,21,22) — so consecutive placements from Q17 onward are not just
// allowed, they are guaranteed to occur on every single run.
test('consecutive placements from Q17 onward occur on every run (accepted, not a bug)', () => {
  for (const s of schedules()) {
    const ns = [...s.keys()].sort((a, b) => a - b);
    assert.deepEqual(ns.filter(n => n >= ADJACENCY_RELAXED_FROM), [17, 18, 20, 21, 22],
      'every late slot must be filled on every run');
  }
});

test('validateSchedule allows consecutive placements at or after Q17', () => {
  const ok = new Map([[17, 'deadClick'], [18, 'ghostSelection'], [20, 'doubleMark']]);
  assert.deepEqual(validateSchedule(ok), []);
});

test('validateSchedule still rejects consecutive placements below Q17', () => {
  const bad = new Map([[11, 'deadClick'], [12, 'ghostSelection']]);
  assert.ok(validateSchedule(bad).some(e => e.includes('consecutive')));
});

test('at most one lockout is ever scheduled, across many seeds', () => {
  for (const s of schedules()) {
    const lockouts = [...s.values()].filter(t => t === 'lockout').length;
    assert.ok(lockouts <= 1, `lockout scheduled ${lockouts} times in one run`);
  }
});

test('validateSchedule rejects more than one lockout', () => {
  const bad = new Map([[11, 'lockout'], [14, 'lockout']]);
  assert.ok(validateSchedule(bad).some(e => e.includes('lockout')));
});

test('lockout, when scheduled, never lands on a recovery question or Q23/Q24', () => {
  for (const s of schedules()) {
    for (const [n, trick] of s) {
      if (trick === 'lockout') {
        assert.ok(!RECOVERY_QUESTIONS.includes(n), `lockout on recovery Q${n}`);
        assert.notEqual(n, FINALE_QUESTION);
        assert.notEqual(n, GENTLE_CLOSER);
      }
    }
  }
});

test('per-trick frequency distribution across all scheduled seeds (report only)', () => {
  const counts = {};
  for (const s of schedules()) {
    for (const trick of s.values()) counts[trick] = (counts[trick] || 0) + 1;
  }
  for (const name of TRICK_NAMES) assert.ok(name in counts, `${name} never appeared across ${SEED_COUNT} seeds`);
  console.log(`Trick frequency over ${SEED_COUNT} seeds (${SEED_COUNT * TRICK_COUNT} total placements):`, counts);
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

test('Q24 is not in eligible questions', () => {
  const eligible = eligibleQuestions();
  assert.ok(!eligible.includes(24), 'Q24 must not be eligible for tricks');
});

test('no generated schedule contains a trick on Q24', () => {
  for (const s of schedules()) {
    assert.ok(!s.has(24), 'Q24 must never carry a trick');
  }
});

test('validateSchedule catches a trick placed on the gentle closer', () => {
  const bad = new Map([[24, 'deadClick']]);
  assert.ok(validateSchedule(bad).some(e => e.includes('gentle closer')));
});
