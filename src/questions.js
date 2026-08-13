import { RECOVERY_QUESTIONS } from './clock.js';

export const PHASES = ['deposit', 'descent', 'farce'];
export const KINDS = ['crt', 'syllogism', 'sequence', 'spatial', 'affect'];

const q = (n, phase, kind, correct, nonsense = false) => ({
  n, phase, kind, nonsense, correct,
  prompt: `[provisional] Question ${n} (${kind}).`,
  options: ['[provisional A]', '[provisional B]', '[provisional C]', '[provisional D]']
});

export const QUESTIONS = [
  q(1, 'deposit', 'crt', 2), q(2, 'deposit', 'syllogism', 0),
  q(3, 'deposit', 'sequence', 1), q(4, 'deposit', 'crt', 3),
  q(5, 'deposit', 'syllogism', 2), q(6, 'deposit', 'spatial', 0),
  q(7, 'deposit', 'crt', 1), q(8, 'deposit', 'syllogism', 3),
  q(9, 'deposit', 'sequence', 2), q(10, 'deposit', 'spatial', 1),
  q(11, 'descent', 'syllogism', 0, true), q(12, 'descent', 'syllogism', 2, true),
  q(13, 'descent', 'syllogism', 1), q(14, 'descent', 'sequence', 3, true),
  q(15, 'descent', 'affect', null, true), q(16, 'descent', 'spatial', 0),
  q(17, 'descent', 'syllogism', 1, true), q(18, 'descent', 'affect', null, true),
  q(19, 'descent', 'sequence', 2), q(20, 'descent', 'affect', null, true),
  q(21, 'farce', 'affect', null, true), q(22, 'farce', 'affect', null, true),
  q(23, 'farce', 'affect', null, true), q(24, 'farce', 'affect', null, true)
];

export function questionByNumber(n) {
  const found = QUESTIONS.find(x => x.n === n);
  if (!found) throw new RangeError(`no question ${n}`);
  return found;
}

export function validateQuestions(qs) {
  const errors = [];
  if (qs.length !== 24) errors.push(`expected 24 questions, got ${qs.length}`);

  qs.forEach((item, i) => {
    const label = `Q${item.n ?? i + 1}`;
    if (item.n !== i + 1) errors.push(`${label}: out of order`);
    if (!PHASES.includes(item.phase)) errors.push(`${label}: bad phase "${item.phase}"`);
    if (!KINDS.includes(item.kind)) errors.push(`${label}: bad kind "${item.kind}"`);
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      errors.push(`${label}: must have exactly 4 options`);
    }
    if (item.correct !== null) {
      if (!Number.isInteger(item.correct) || item.correct < 0 || item.correct > 3) {
        errors.push(`${label}: correct index out of range`);
      }
    }
    if (item.n <= 10) {
      if (item.phase !== 'deposit') errors.push(`${label}: Q1-10 must be deposit phase`);
      if (item.nonsense) errors.push(`${label}: deposit must not use nonsense vocabulary`);
      if (item.correct === null) errors.push(`${label}: deposit must be solvable`);
    }
    if (item.n >= 21 && item.correct !== null) {
      errors.push(`${label}: farce questions must have no correct answer`);
    }
    if (RECOVERY_QUESTIONS.includes(item.n)) {
      if (item.nonsense) errors.push(`${label}: recovery must not be nonsense`);
      if (item.correct === null) errors.push(`${label}: recovery must be solvable`);
    }
  });

  const deposit = qs.filter(x => x.phase === 'deposit');
  const need = { crt: 3, syllogism: 3, sequence: 2, spatial: 2 };
  for (const [kind, wanted] of Object.entries(need)) {
    const got = deposit.filter(x => x.kind === kind).length;
    if (got !== wanted) errors.push(`deposit needs ${wanted} ${kind}, has ${got}`);
  }
  return errors;
}
