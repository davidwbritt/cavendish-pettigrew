import { QUESTIONS } from './questions.js';
import { shownChoiceFor } from './falsify.js';

// The marked paper — the screen between the review sheet and the
// certificate, where the instrument hands back the test with its own
// answers on it.
//
// The joke is the affect items. Q15 asks which animal the taker prefers and
// Q20 which colour, and this screen marks both, because an instrument that
// will invent a REFLECTIVE LATENCY INDEX has no reason to stop short of
// telling someone their favourite colour is grey. Nothing anywhere
// acknowledges that a preference cannot be wrong. It is simply scored,
// tallied with the rest, and carried into the total.
//
// The answer to those items is DATA, not a computation: `key` on the
// question (src/questions.js). Grey is the right answer to the colour
// question, flatly, and a taker who happens to prefer grey gets it right —
// there is no machinery arranging for them to be wrong. That also makes
// this whole module a pure function of the transcript, so the caller can
// re-render the screen as often as it likes without the marks moving.
//
// STILL IN CHARACTER. This is not the debrief's answer key (screens.js's
// answerKeyRows), which comes after the reveal and tells the truth — real
// answers, real correctness, and NO RIGHT ANSWER on the items that never had
// one. This screen is the instrument talking, so it reads from the falsified
// record like everything else the taker is shown, and it is confident about
// all 24 items. The two screens contradict each other on purpose; the
// debrief is what settles it.

// The taker's answer AS THE INSTRUMENT HAS IT: the falsified record, with any
// amendment they paid for laid on top. Amendments are applied here — though
// scoring.js deliberately ignores them — because this screen sits directly
// after the review sheet the taker just edited. Showing the pre-amendment
// answer on the very next page would read as a plain bug rather than as the
// instrument lying, and would make the 2-point filing fee look like it bought
// nothing at all.
function recordedChoice(transcript, n, falsifications) {
  const amendment = transcript.amendments.filter(a => a.n === n).pop();
  if (amendment) return amendment.choice;
  const entry = transcript.entries.find(e => e.n === n);
  return entry ? shownChoiceFor(n, entry.choice, falsifications) : null;
}

export function markPaper(transcript, falsifications = []) {
  return QUESTIONS.map(q => {
    const shown = recordedChoice(transcript, q.n, falsifications);
    const invented = q.correct === null;
    const markIndex = invented ? q.key : q.correct;
    return {
      n: q.n,
      prompt: q.prompt,
      invented,
      yourLetter: Number.isInteger(shown) ? 'ABCD'[shown] : null,
      yourText: Number.isInteger(shown) ? q.options[shown] : null,
      markLetter: 'ABCD'[markIndex],
      markText: q.options[markIndex],
      correct: shown === markIndex
    };
  });
}

// "ITEMS CORRECT: n of 24". Counts every item, including the ones whose
// answer the instrument simply asserted — which is what makes the number
// worthless and the certificate's flattering centile, arriving one screen
// later off the same sitting, funnier for contradicting it.
export function markedScore(rows) {
  return { correct: rows.filter(r => r.correct).length, total: rows.length };
}
