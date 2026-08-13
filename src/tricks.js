import { RECOVERY_QUESTIONS } from './clock.js';
import { shuffle } from './rng.js';

export const TRICK_NAMES = [
  'deadClick', 'ghostSelection', 'doubleMark',
  'buttonFlinch', 'stickyAnswer', 'phantomLock'
];

export const FINALE_QUESTION = 23;
export const GENTLE_CLOSER = 24;
export const TRICK_COUNT = 5;

export function eligibleQuestions() {
  const out = [];
  for (let n = 11; n <= 24; n++) {
    if (RECOVERY_QUESTIONS.includes(n)) continue;
    if (n === FINALE_QUESTION) continue;
    if (n === GENTLE_CLOSER) continue;
    out.push(n);
  }
  return out;
}

export function scheduleTricks(rng) {
  const slots = pickNonAdjacent(eligibleQuestions(), TRICK_COUNT, rng);
  const schedule = new Map();
  let previous = null;
  for (const n of slots) {
    const choices = TRICK_NAMES.filter(t => t !== previous);
    const trick = shuffle(rng, choices)[0];
    schedule.set(n, trick);
    previous = trick;
  }
  return schedule;
}

function pickNonAdjacent(candidates, count, rng) {
  // Randomised greedy with restart. Since GENTLE_CLOSER (Q24) was excluded
  // from eligibleQuestions(), the eligible set's true non-adjacent maximum
  // is exactly 5 — there are only 8 valid 5-element slot-sets, so count=5 is
  // a perfect packing with zero slack, not a comfortable margin. Observed
  // attempts went from always succeeding on attempt 1 (when 6 was the
  // ceiling) to needing up to 8 of the 200 budgeted retries (verified over
  // 3000 seeds — see the fix round 1 report for Task 5).
  for (let attempt = 0; attempt < 200; attempt++) {
    const chosen = [];
    for (const n of shuffle(rng, candidates)) {
      if (chosen.some(m => Math.abs(m - n) <= 1)) continue;
      chosen.push(n);
      if (chosen.length === count) return chosen.sort((a, b) => a - b);
    }
  }
  throw new Error(`could not place ${count} non-adjacent tricks`);
}

export function validateSchedule(schedule) {
  const errors = [];
  const ns = [...schedule.keys()].sort((a, b) => a - b);

  for (const n of ns) {
    if (n < 11) errors.push(`Q${n}: no trick may fire before Q11`);
    if (RECOVERY_QUESTIONS.includes(n)) errors.push(`Q${n}: recovery questions are never sabotaged`);
    if (n === FINALE_QUESTION) errors.push(`Q${n}: the finale carries no bag trick`);
    if (n === GENTLE_CLOSER) errors.push(`Q${n}: the gentle closer is never sabotaged`);
    if (!TRICK_NAMES.includes(schedule.get(n))) errors.push(`Q${n}: unknown trick`);
  }
  for (let i = 1; i < ns.length; i++) {
    if (ns[i] - ns[i - 1] <= 1) errors.push(`Q${ns[i - 1]}/Q${ns[i]}: consecutive tricks`);
  }
  const ordered = ns.map(n => schedule.get(n));
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i] === ordered[i - 1]) errors.push(`${ordered[i]}: repeated in succession`);
  }
  return errors;
}
