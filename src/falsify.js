import { questionByNumber, QUESTIONS } from './questions.js';
import { shuffle } from './rng.js';

export const FALSIFICATION_COUNT = 3;

export function chooseFalsifications(transcript, rng) {
  const deposit = transcript.entries.filter(e => e.n >= 1 && e.n <= 10);

  // Exclude timed-out entries from falsification candidacy: a falsified row
  // only lands when the taker has a memory of deciding. Timed-out questions
  // were answered BY THE INSTRUMENT with a random pick the taker never saw
  // themselves choose — there is no memory to contradict, so the row cannot land.
  // Exception: if ALL deposit questions timed out, fall back to using them rather
  // than violating the "exactly three, always" invariant (a broken guarantee is worse
  // than a wasted cut).
  const timedOut = deposit.filter(e => e.timedOut);
  const eligible = deposit.filter(e => !e.timedOut);

  const correctCrt = eligible.filter(e => {
    const q = questionByNumber(e.n);
    return q.kind === 'crt' && e.choice === q.correct;
  });
  const anyCorrect = eligible.filter(e => e.choice === questionByNumber(e.n).correct);

  // Priority: a CRT item they got right, then any item they got right,
  // then anything at all. Falls back to all eligible (not just non-timed-out).
  const seed = correctCrt.length ? correctCrt : (anyCorrect.length ? anyCorrect : eligible);
  const selected = [];

  if (seed.length > 0) {
    const first = shuffle(rng, seed)[0];
    selected.push(first);

    const rest = shuffle(rng, eligible.filter(e => e.n !== first.n))
      .slice(0, FALSIFICATION_COUNT - 1);
    selected.push(...rest);
  }

  // Top up from Q1-10 if we have fewer than FALSIFICATION_COUNT rows.
  // This handles transcripts with partial entries (e.g., incomplete or resumed tests).
  // Prefer non-timed-out questions first; fall back to timed-out only if necessary.
  if (selected.length < FALSIFICATION_COUNT) {
    const selectedNumbers = new Set(selected.map(e => e.n));
    const available = QUESTIONS.filter(q => q.n >= 1 && q.n <= 10 && !selectedNumbers.has(q.n));
    const toAdd = FALSIFICATION_COUNT - selected.length;

    // Try to fill from non-timed-out questions first
    const nonTimedOutQs = available.filter(q => !timedOut.some(t => t.n === q.n));
    const timedOutQs = available.filter(q => timedOut.some(t => t.n === q.n));

    const topUp = shuffle(rng, nonTimedOutQs.length > 0 ? nonTimedOutQs : timedOutQs).slice(0, toAdd);

    for (const q of topUp) {
      const entry = deposit.find(e => e.n === q.n);
      selected.push(entry || { n: q.n, choice: null });
    }
  }

  return selected
    .sort((a, b) => a.n - b.n)
    .map(e => ({ n: e.n, shown: alternativeTo(e.choice, rng) }));
}

function alternativeTo(choice, rng) {
  const options = [0, 1, 2, 3].filter(i => i !== choice);
  return shuffle(rng, options)[0];
}

export function shownChoiceFor(n, actualChoice, falsifications) {
  const hit = falsifications.find(f => f.n === n);
  return hit ? hit.shown : actualChoice;
}
