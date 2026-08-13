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

// Comprehensive failure-path tests for validator rules
test('validator rejects wrong array length', () => {
  const broken = QUESTIONS.slice(0, 23);
  assert.ok(validateQuestions(broken).some(e => e.includes('expected 24')));
});

test('validator rejects out-of-order questions', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], n: 5 };
  assert.ok(validateQuestions(broken).some(e => e.includes('out of order')));
});

test('validator rejects bad phase string', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], phase: 'invalid' };
  assert.ok(validateQuestions(broken).some(e => e.includes('bad phase')));
});

test('validator rejects Q1-10 with wrong phase', () => {
  const broken = structuredClone(QUESTIONS);
  broken[5] = { ...broken[5], phase: 'descent' };
  assert.ok(validateQuestions(broken).some(e => e.includes('Q1-10 must be deposit phase')));
});

test('validator rejects Q11-20 with wrong phase', () => {
  const broken = structuredClone(QUESTIONS);
  broken[14] = { ...broken[14], phase: 'deposit' };
  assert.ok(validateQuestions(broken).some(e => e.includes('Q11-20 must be descent phase')));
});

test('validator rejects Q21-24 with wrong phase', () => {
  const broken = structuredClone(QUESTIONS);
  broken[20] = { ...broken[20], phase: 'descent' };
  assert.ok(validateQuestions(broken).some(e => e.includes('Q21-24 must be farce phase')));
});

test('validator rejects bad kind string', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], kind: 'invalid' };
  assert.ok(validateQuestions(broken).some(e => e.includes('bad kind')));
});

test('validator rejects nonsense vocabulary in deposit', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], nonsense: true };
  assert.ok(validateQuestions(broken).some(e => e.includes('deposit must not use nonsense')));
});

test('validator rejects unsolvable deposit question', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], correct: null };
  assert.ok(validateQuestions(broken).some(e => e.includes('deposit must be solvable')));
});

test('validator rejects farce question with correct answer', () => {
  const broken = structuredClone(QUESTIONS);
  broken[20] = { ...broken[20], correct: 0 };
  assert.ok(validateQuestions(broken).some(e => e.includes('farce questions must have no correct answer')));
});

test('validator rejects recovery question made nonsense', () => {
  const broken = structuredClone(QUESTIONS);
  broken[12] = { ...broken[12], nonsense: true };
  assert.ok(validateQuestions(broken).some(e => e.includes('recovery must not be nonsense')));
});

test('validator rejects recovery question made unsolvable', () => {
  const broken = structuredClone(QUESTIONS);
  broken[12] = { ...broken[12], correct: null };
  assert.ok(validateQuestions(broken).some(e => e.includes('recovery must be solvable')));
});

test('validator rejects wrong deposit composition', () => {
  const broken = structuredClone(QUESTIONS);
  broken[9] = { ...broken[9], kind: 'crt' };
  assert.ok(validateQuestions(broken).some(e => e.includes('deposit needs')));
});

test('validator returns errors (does not throw) for null entry', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = null;
  const errors = validateQuestions(broken);
  assert.ok(Array.isArray(errors));
  assert.ok(errors.some(e => e.includes('entry is not an object')));
});

test('validator returns errors (does not throw) for undefined entry', () => {
  const broken = structuredClone(QUESTIONS);
  broken[5] = undefined;
  const errors = validateQuestions(broken);
  assert.ok(Array.isArray(errors));
  assert.ok(errors.some(e => e.includes('entry is not an object')));
});

test('validator rejects duplicate options within a question', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], options: ['same', 'same', 'different', 'unique'] };
  assert.ok(validateQuestions(broken).some(e => e.includes('duplicate options')));
});

test('validator rejects empty prompt', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], prompt: '' };
  assert.ok(validateQuestions(broken).some(e => e.includes('prompt is missing or empty')));
});

test('validator rejects whitespace-only prompt', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], prompt: '   ' };
  assert.ok(validateQuestions(broken).some(e => e.includes('prompt is missing or empty')));
});

test('validator rejects empty option', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], options: ['[provisional A]', '', '[provisional C]', '[provisional D]'] };
  assert.ok(validateQuestions(broken).some(e => e.includes('option') && e.includes('empty')));
});

test('validator rejects whitespace-only option', () => {
  const broken = structuredClone(QUESTIONS);
  broken[0] = { ...broken[0], options: ['[provisional A]', '   ', '[provisional C]', '[provisional D]'] };
  assert.ok(validateQuestions(broken).some(e => e.includes('option') && e.includes('empty')));
});
