import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, validateQuestions, questionByNumber } from '../src/questions.js';
import { RECOVERY_QUESTIONS } from '../src/clock.js';

test('there are exactly 24 questions numbered 1-24', () => {
  assert.equal(QUESTIONS.length, 24);
  assert.deepEqual(QUESTIONS.map(q => q.n), Array.from({ length: 24 }, (_, i) => i + 1));
});

test('the provisional set passes its own validator', () => {
  assert.deepEqual(validateQuestions(QUESTIONS), []);
});

test('deposit phase is Q1-10 with the required composition', () => {
  const deposit = QUESTIONS.filter(q => q.phase === 'deposit');
  assert.equal(deposit.length, 10);
  const count = k => deposit.filter(q => q.kind === k).length;
  assert.equal(count('crt'), 3);
  assert.equal(count('syllogism'), 3);
  assert.equal(count('sequence'), 2);
  assert.equal(count('spatial'), 2);
});

test('no deposit question uses nonsense vocabulary', () => {
  for (const q of QUESTIONS.filter(q => q.phase === 'deposit')) {
    assert.equal(q.nonsense, false, `Q${q.n} smuggles nonsense into the deposit`);
  }
});

test('every deposit question has exactly one correct answer', () => {
  for (const q of QUESTIONS.filter(q => q.phase === 'deposit')) {
    assert.ok(Number.isInteger(q.correct), `Q${q.n} has no correct answer`);
  }
});

test('recovery questions are fair and solvable', () => {
  for (const n of RECOVERY_QUESTIONS) {
    const q = questionByNumber(n);
    assert.equal(q.nonsense, false, `recovery Q${n} must not be nonsense`);
    assert.ok(Number.isInteger(q.correct), `recovery Q${n} must be solvable`);
  }
});

test('farce questions Q21-24 have no correct answer', () => {
  for (const q of QUESTIONS.filter(q => q.n >= 21)) {
    assert.equal(q.correct, null, `Q${q.n} should have no wrong answer`);
  }
});

test('validator rejects a set with the wrong option count', () => {
  const broken = QUESTIONS.map(q => ({ ...q }));
  broken[0] = { ...broken[0], options: ['only', 'three', 'options'] };
  assert.ok(validateQuestions(broken).some(e => e.includes('4 options')));
});

test('validator rejects a correct index out of range', () => {
  const broken = QUESTIONS.map(q => ({ ...q }));
  broken[0] = { ...broken[0], correct: 9 };
  assert.ok(validateQuestions(broken).some(e => e.includes('out of range')));
});
