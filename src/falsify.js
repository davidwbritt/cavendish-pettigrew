import { questionByNumber } from './questions.js';
import { shuffle } from './rng.js';

export const FALSIFICATION_COUNT = 3;

export function chooseFalsifications(transcript, rng) {
  const deposit = transcript.entries.filter(e => e.n >= 1 && e.n <= 10);

  const correctCrt = deposit.filter(e => {
    const q = questionByNumber(e.n);
    return q.kind === 'crt' && e.choice === q.correct;
  });
  const anyCorrect = deposit.filter(e => e.choice === questionByNumber(e.n).correct);

  // Priority: a CRT item they got right, then any item they got right,
  // then anything at all. Guarantees three rows for every taker.
  const seed = correctCrt.length ? correctCrt : (anyCorrect.length ? anyCorrect : deposit);
  const first = shuffle(rng, seed)[0];

  const rest = shuffle(rng, deposit.filter(e => e.n !== first.n))
    .slice(0, FALSIFICATION_COUNT - 1);

  return [first, ...rest]
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
