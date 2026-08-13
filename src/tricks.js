import { RECOVERY_QUESTIONS } from './clock.js';
import { shuffle } from './rng.js';

export const TRICK_NAMES = [
  'deadClick', 'ghostSelection', 'doubleMark',
  'buttonFlinch', 'stickyAnswer', 'phantomLock', 'hoverDrift',
  'lockout', 'textSwap'
];

export const FINALE_QUESTION = 23;
export const GENTLE_CLOSER = 24;
export const TRICK_COUNT = 7;

// The question index from which the "never two consecutive questions"
// invariant relaxes. Below this, adjacency is still forbidden exactly as
// before; at or above it, consecutive placements are allowed. Named so
// pickNonAdjacent/validateSchedule can never disagree about the cutoff.
export const ADJACENCY_RELAXED_FROM = 17;

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

// ACCEPTED CONSEQUENCE (do not "fix" this): eligible slots are
// [11, 12, 14, 15, 17, 18, 20, 21, 22]. Below ADJACENCY_RELAXED_FROM (17),
// adjacency is still forbidden, so {11,12} contribute at most one slot and
// {14,15} contribute at most one slot — 2 early slots, maximum. From 17
// onward adjacency is allowed, so all 5 late slots (17,18,20,21,22) are
// always available together. 2 early + 5 late = 7, which is also
// TRICK_COUNT — so every valid schedule fills every late slot on every run;
// Q17, Q18, Q20, Q21 and Q22 always carry a trick, and only which trick
// varies. The owner has accepted this; it is not a bug in pickNonAdjacent.
export function scheduleTricks(rng) {
  const slots = pickNonAdjacent(eligibleQuestions(), TRICK_COUNT, rng);
  const schedule = new Map();
  let previous = null;
  // AT MOST ONE lockout per run — a lockout always resolves into a forced
  // answer (see src/ui/effects.js's escapability comment), and two forced
  // answers from lockouts in one run would be too much. Enforced here
  // structurally, not left to luck: once 'lockout' has been chosen for any
  // slot, it is excluded from every later slot's candidate pool.
  let lockoutUsed = false;
  for (const n of slots) {
    let choices = TRICK_NAMES.filter(t => t !== previous);
    if (lockoutUsed) choices = choices.filter(t => t !== 'lockout');
    const trick = shuffle(rng, choices)[0];
    schedule.set(n, trick);
    if (trick === 'lockout') lockoutUsed = true;
    previous = trick;
  }
  return schedule;
}

function pickNonAdjacent(candidates, count, rng) {
  // Randomised greedy with restart. Adjacency is only forbidden when the
  // LARGER of the pair is below ADJACENCY_RELAXED_FROM (17) — since a < b
  // whenever both are being compared, "b < 17" alone is sufficient to mean
  // "both are below 17". From 17 onward, consecutive picks are freely
  // allowed, which is what makes count=7 an exact, always-achievable
  // packing (2 early + 5 late — see the ACCEPTED CONSEQUENCE comment on
  // scheduleTricks above) rather than a probabilistic one.
  for (let attempt = 0; attempt < 200; attempt++) {
    const chosen = [];
    for (const n of shuffle(rng, candidates)) {
      if (chosen.some(m => Math.abs(m - n) <= 1 && Math.max(m, n) < ADJACENCY_RELAXED_FROM)) continue;
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
  // Consecutive placements are only an error below ADJACENCY_RELAXED_FROM
  // (17) — see pickNonAdjacent's identical condition above, which this must
  // never disagree with.
  for (let i = 1; i < ns.length; i++) {
    if (ns[i] - ns[i - 1] <= 1 && ns[i] < ADJACENCY_RELAXED_FROM) {
      errors.push(`Q${ns[i - 1]}/Q${ns[i]}: consecutive tricks below Q${ADJACENCY_RELAXED_FROM}`);
    }
  }
  const ordered = ns.map(n => schedule.get(n));
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i] === ordered[i - 1]) errors.push(`${ordered[i]}: repeated in succession`);
  }
  // Defensive mirror of scheduleTricks' own enforcement above — belt and
  // braces, not the primary enforcement mechanism.
  const lockoutCount = ns.filter(n => schedule.get(n) === 'lockout').length;
  if (lockoutCount > 1) errors.push(`lockout scheduled ${lockoutCount} times — at most one per run`);

  return errors;
}
