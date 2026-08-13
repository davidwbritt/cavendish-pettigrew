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
    // Guard against null/undefined/non-object entries
    if (item === null || item === undefined || typeof item !== 'object') {
      errors.push(`Q${i + 1}: entry is not an object`);
      return; // skip remaining checks for this item
    }

    const label = `Q${item.n ?? i + 1}`;
    if (item.n !== i + 1) errors.push(`${label}: out of order`);

    // Check prompt is non-empty and non-whitespace
    if (!item.prompt || typeof item.prompt !== 'string' || !item.prompt.trim()) {
      errors.push(`${label}: prompt is missing or empty`);
    }

    // Check options array and content
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      errors.push(`${label}: must have exactly 4 options`);
    } else {
      // Check each option is non-empty
      for (let j = 0; j < 4; j++) {
        if (!item.options[j] || typeof item.options[j] !== 'string' || !item.options[j].trim()) {
          errors.push(`${label}: option ${j} is missing or empty`);
        }
      }
      // Check for duplicate options
      const optionSet = new Set(item.options);
      if (optionSet.size !== 4) {
        errors.push(`${label}: contains duplicate options`);
      }
    }

    if (!PHASES.includes(item.phase)) errors.push(`${label}: bad phase "${item.phase}"`);
    if (!KINDS.includes(item.kind)) errors.push(`${label}: bad kind "${item.kind}"`);

    // Check phase matches n range for all three bands
    if (item.n <= 10 && item.phase !== 'deposit') {
      errors.push(`${label}: Q1-10 must be deposit phase`);
    }
    if (item.n >= 11 && item.n <= 20 && item.phase !== 'descent') {
      errors.push(`${label}: Q11-20 must be descent phase`);
    }
    if (item.n >= 21 && item.phase !== 'farce') {
      errors.push(`${label}: Q21-24 must be farce phase`);
    }

    if (item.correct !== null) {
      if (!Number.isInteger(item.correct) || item.correct < 0 || item.correct > 3) {
        errors.push(`${label}: correct index out of range`);
      }
    }
    if (item.n <= 10) {
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

  const deposit = qs.filter(x => x && x.phase === 'deposit');
  const need = { crt: 3, syllogism: 3, sequence: 2, spatial: 2 };
  for (const [kind, wanted] of Object.entries(need)) {
    const got = deposit.filter(x => x.kind === kind).length;
    if (got !== wanted) errors.push(`deposit needs ${wanted} ${kind}, has ${got}`);
  }
  return errors;
}
