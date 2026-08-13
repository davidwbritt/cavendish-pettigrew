import { questionByNumber } from './questions.js';
import { DISPLAY_DURATION_MS, displayedRemainingMs } from './clock.js';

// The live scoring readout printed under the options during the post-commit
// hold, before the screen advances (see renderQuestion's showTally and
// main.js's onChoose/onExpire). The instrument appears to be marking the
// taker in real time.
//
// THE POINT: on the edge of comprehension. Every symbol is real statistical
// vocabulary used approximately correctly, so it survives a glance from
// someone who knows what κ is, and none of it is ever explained. The taker
// watches an index tick and a total move after each answer, cannot tell
// whether the movement was good, and has no way to ask.
//
// IT IS ALSO ARITHMETICALLY HONEST — this is the same discipline as the
// certificate (spec §7: the arithmetic checks out, only the inputs are
// fabricated). Every figure below is genuinely computed from what the taker
// actually did, accumulates across the sitting, and would survive being
// checked with a calculator. What is fraudulent is the claim that any of it
// means anything.
//
// CRITICAL — λ is derived from the DISPLAYED clock, never the real one.
// displayedRemainingMs() maps real elapsed time onto the 30s face the taker
// was shown, so λ always agrees with the countdown they watched, and with
// the review sheet (which also reports displayed times — spec §6's secondary
// gag). Deriving λ from realElapsedMs instead would print the lying clock's
// true durations on screen, twenty questions before the debrief, and hand a
// careful taker the whole deception for free. Do not "fix" this to use real
// time.

// Fraction of the DISPLAYED interval the taker consumed on one item, 0..1.
const fractionFor = e =>
  (DISPLAY_DURATION_MS - displayedRemainingMs(e.n, e.realElapsedMs)) / DISPLAY_DURATION_MS;

// Strips the leading zero so values print as `.412` rather than `0.412` —
// the house style for statistical output. Values of 1 or more keep their
// integer part (`1.000`), which a refusal reaches exactly.
const dec = (x, places) => {
  const s = x.toFixed(places);
  return s.startsWith('0.') ? s.slice(1) : s;
};

// Signed to `places`, using U+2212 MINUS (the same character as the review
// sheet's −2 correction stamp) rather than a hyphen. Rounds BEFORE testing
// the sign so a value that rounds to zero never prints as `−.0000`.
const signed = (x, places) => {
  const rounded = Number(x.toFixed(places));
  return `${rounded < 0 ? '−' : '+'}${dec(Math.abs(rounded), places)}`;
};

const STRATA = { deposit: 'i', descent: 'ii', farce: 'iii' };

// Residual above which an item is FLAGGED rather than WITHIN TOLERANCE. A
// refusal is always flagged regardless (see below): the instrument having
// answered on the taker's behalf is exactly the case it wants on record.
export const RESIDUAL_TOLERANCE = 0.2;

// κ: one minus the mean absolute deviation of the item fractions from their
// own mean. Bounded [0.5, 1] because every fraction is bounded [0, 1], so it
// always prints as a plausible coefficient. It is 1.0000 after the first item
// — a single value cannot deviate from itself — and can only fall from there
// as the taker's pacing varies, which it always does.
//
// That descent is the whole design. Nobody is told what κ is, nobody is told
// what a good one would be, and it is visibly worse than it was at the start
// no matter how the sitting goes.
function kappaOf(fractions) {
  if (!fractions.length) return 1;
  const mean = fractions.reduce((a, b) => a + b, 0) / fractions.length;
  const mad = fractions.reduce((s, f) => s + Math.abs(f - mean), 0) / fractions.length;
  return 1 - mad;
}

// Pure, DOM-free and unit-tested directly — the same extraction pattern as
// reviewRows/certificateIndexRows/debriefClosingText (this project has no
// jsdom). `entries` is the transcript's entry list; anything after item `n`
// is ignored, so the tally always reflects the sitting up to and including
// the item just committed.
export function computeTally(entries, n) {
  const upTo = entries.filter(e => e.n <= n).sort((a, b) => a.n - b.n);
  const current = upTo.find(e => e.n === n);
  if (!current) return null;

  const fractions = upTo.map(fractionFor);
  const prior = fractions.slice(0, -1);

  const lambda = fractions[fractions.length - 1];
  const sigmaLambda = fractions.reduce((a, b) => a + b, 0);
  const kappa = kappaOf(fractions);
  const deltaKappa = kappa - kappaOf(prior);
  const mean = sigmaLambda / fractions.length;
  const residual = Math.abs(lambda - mean);

  const refused = Boolean(current.timedOut);
  const flagged = refused || residual > RESIDUAL_TOLERANCE;
  const stratum = STRATA[questionByNumber(n).phase];

  return {
    item: n, refused, flagged, stratum,
    lambda, sigmaLambda, kappa, deltaKappa, residual,
    lines: [
      `ITEM ${String(n).padStart(2, '0')}/24 ${refused ? 'REFUSED' : 'LOGGED'}`
        + ` · λ ${dec(lambda, 3)} · Σλ ${sigmaLambda.toFixed(3)}`
        + ` · κ ${dec(kappa, 4)} Δ${signed(deltaKappa, 4)}`,
      `STRATUM ${stratum} · RESIDUAL ${dec(residual, 4)} (n−1)`
        + ` · ${flagged ? 'FLAGGED' : 'WITHIN TOLERANCE'}`
    ]
  };
}
