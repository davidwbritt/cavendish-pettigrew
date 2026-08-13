import { QUESTIONS, questionByNumber } from './questions.js';
import { amendmentCount } from './transcript.js';
import { RECOVERY_QUESTIONS, DISPLAY_DURATION_MS } from './clock.js';
import { shownChoiceFor } from './falsify.js';

export const AMENDMENT_PENALTY = 2;
export const SCORE_FLOOR = 0;

export const FACULTIES = [
  { key: 'reflectiveLatency',    label: 'REFLECTIVE LATENCY INDEX' },
  { key: 'beliefBiasResistance', label: 'BELIEF-BIAS RESISTANCE' },
  { key: 'premiseTolerance',     label: 'PREMISE TOLERANCE' },
  { key: 'setShiftingCost',      label: 'SET-SHIFTING COST' },
  { key: 'responseConsistency',  label: 'RESPONSE CONSISTENCY (κ)' },
  { key: 'composure',            label: 'COMPOSURE' },
  { key: 'semanticSatiation',    label: 'SEMANTIC SATIATION THRESHOLD' }
];

const clamp = v => Math.max(0, Math.min(100, Math.round(v)));

export function computeFaculties(t, falsifications = []) {
  // Every read of a choice goes through the falsified record, so the report's
  // arithmetic is consistent with the transcript the taker was shown.
  const choiceAt = n => {
    const e = t.entries.find(x => x.n === n);
    return e ? shownChoiceFor(n, e.choice, falsifications) : null;
  };
  const entry = n => {
    const e = t.entries.find(x => x.n === n);
    return e ? { ...e, choice: choiceAt(n) } : undefined;
  };

  // Real timings, Q1-10. Fast responders score high. Real data, unearned conclusion.
  const deposit = t.entries.filter(e => e.n <= 10);
  const meanMs = deposit.length
    ? deposit.reduce((s, e) => s + e.realElapsedMs, 0) / deposit.length
    : DISPLAY_DURATION_MS;
  const reflectiveLatency = clamp(100 - (meanMs / DISPLAY_DURATION_MS) * 100);

  // Genuinely valid: did they accept invalid syllogisms with believable conclusions?
  const syllogisms = QUESTIONS.filter(q => q.kind === 'syllogism' && q.correct !== null);
  const rightSyll = syllogisms.filter(q => entry(q.n)?.choice === q.correct).length;
  const beliefBiasResistance = clamp(
    syllogisms.length ? (rightSyll / syllogisms.length) * 100 : 50
  );

  // How readily they accepted malformed premises rather than rejecting them.
  const nonsense = QUESTIONS.filter(q => q.nonsense);
  const engaged = nonsense.filter(q => {
    const choice = entry(q.n)?.choice;
    return Number.isInteger(choice);
  }).length;
  const premiseTolerance = clamp(nonsense.length ? (engaged / nonsense.length) * 100 : 50);

  // Our own sawtooth, reported as their deficit: performance immediately after recovery.
  const drops = RECOVERY_QUESTIONS.map(n => {
    const after = entry(n + 1);
    const q = after && questionByNumber(after.n);
    if (!after || !q || q.correct === null) return 0;
    return after.choice === q.correct ? 0 : 1;
  });
  const setShiftingCost = clamp(drops.length ? (drops.reduce((a, b) => a + b, 0) / drops.length) * 100 : 0);

  // Post-hoc amendments are what actually move this index today: the
  // outcome gate (createOutcomeGate in src/ui/screens.js) guarantees
  // recordAnswer is called exactly once per question, so transcript.js's
  // change-tracking branch (entry.changes) is unreachable in the current
  // app and always sums to 0 — only amendmentCount(t) contributes. The
  // `changes` term is retained, not dead weight to be deleted: it's the
  // hook for a possible future re-answer affordance (e.g. letting a taker
  // revise an answer before Q11 without going through the review sheet's
  // amendment flow), at which point this index would start reflecting both.
  const changes = t.entries.reduce((s, e) => s + e.changes, 0);
  const responseConsistency = clamp(100 - (changes * 4) - (amendmentCount(t) * 9));

  // Panic during the Q23 freeze. Measured fairly — but only ever measured at
  // all if the finale actually ran; see composureAssessed() below. When it
  // didn't run, this still yields a (misleadingly perfect) number, because
  // the CALLER is responsible for checking composureAssessed(t) and
  // suppressing it on the certificate — see src/report.js.
  const composure = clamp(100 - (t.telemetry.freezePointerDistance / 8000) * 100);

  // Nothing to do with the taker whatsoever — a property of the question set.
  const tokens = QUESTIONS.filter(q => q.nonsense).length;
  const semanticSatiation = clamp(100 - tokens * 7);

  return {
    reflectiveLatency, beliefBiasResistance, premiseTolerance,
    setShiftingCost, responseConsistency, composure, semanticSatiation
  };
}

// Whether the Q23 finale actually ran for this taker (see
// src/transcript.js's createTranscript and src/ui/cursor.js's runFinale). A
// taker under prefers-reduced-motion or on a coarse pointer never gets the
// finale — shouldRunFinale() returns false for them — so freezePointerDistance
// stays at its untouched default and would otherwise score a suspicious
// perfect COMPOSURE. src/report.js consults this to suppress the index on
// the certificate rather than report a number that was never measured.
export function composureAssessed(t) {
  return Boolean(t.telemetry.composureAssessed);
}

export function headlineCentile(rng) {
  return 91 + Math.floor(rng() * 6);
}

const ADJECTIVES = {
  reflectiveLatency: 'DEFERRED', beliefBiasResistance: 'RESISTANT',
  premiseTolerance: 'ACCOMMODATING', setShiftingCost: 'PERSEVERATIVE',
  responseConsistency: 'CONSISTENT', composure: 'COMPOSED',
  semanticSatiation: 'SATIATED'
};
const NOUNS = {
  reflectiveLatency: 'ANALYTIC', beliefBiasResistance: 'REASONER',
  premiseTolerance: 'LITERALIST', setShiftingCost: 'ADHERENT',
  responseConsistency: 'RESPONDENT', composure: 'SUBJECT',
  semanticSatiation: 'PROCESSOR'
};

// premiseTolerance, semanticSatiation and responseConsistency are excluded
// from HEADLINE candidacy because each is structurally constant or
// near-constant, NOT because of anything the taker actually did — ranking
// a constant produces the SAME headline for every taker, which quietly
// destroys the whole personalisation illusion the certificate depends on.
// Do not "helpfully" remove any of these three without re-running a large
// varied-seed sweep and checking the resulting adjective distribution; a
// naive fix here previously just moved the constant-headline bug from one
// faculty to the next one in FACULTIES order instead of closing it.
//   - premiseTolerance now lands on a hard 100 in every run (see the
//     fix-round comment at its definition above — expiry commits an
//     INTEGER choice, so Number.isInteger(choice) is true for every
//     question in every run).
//   - semanticSatiation is derived purely from the fixed question set,
//     never the taker (see its "nothing to do with the taker whatsoever"
//     comment) — always constant, not just usually.
//   - responseConsistency = 100 - changes*4 - amendmentCount*9, and
//     `changes` is structurally always 0 (the outcome gate guarantees
//     recordAnswer fires exactly once per question — see its comment in
//     computeFaculties above), so it sits at a hard 100 for any taker who
//     makes no post-hoc amendments — the large majority. Confirmed by
//     execution: excluding only the first two left responseConsistency
//     inheriting the joint-maximum slot and supplying CONSISTENT in ~84%
//     of a 1500-run varied sweep. setShiftingCost was also measured as an
//     exclusion candidate and rejected — it made headline variety WORSE
//     (10 distinct headlines down to 6), so it stays eligible.
// All three remain real, rankable numbers in the certificate's index table
// — this set ONLY removes them from HEADLINE candidacy, where a permanent
// (or near-permanent) joint-maximum/minimum would otherwise win
// classify()'s stable sort far too often and make the headline read as a
// near-constant instead of a personalised one.
const HEADLINE_INELIGIBLE = new Set(['premiseTolerance', 'semanticSatiation', 'responseConsistency']);

// `assessed`, when supplied, restricts which faculties may supply the
// headline's adjective/noun — a predicate `key => boolean`, a Set of keys,
// or an array of keys. Omitting it entirely preserves today's behaviour for
// every OTHER exclusion (every existing Task 8 test calls classify with one
// argument and must keep passing unmodified) — HEADLINE_INELIGIBLE above
// always applies underneath it regardless, composed here in this single
// place so the structural exclusion and any caller-supplied exclusion (e.g.
// COMPOSURE when the Q23 finale never ran — see composureAssessed() above)
// can never drift apart. An unassessed/structurally-constant faculty can
// still have a real, rankable number from computeFaculties() shown in the
// certificate's index table; this only keeps it out of the headline text.
export function classify(faculties, assessed) {
  const isAssessed = key => {
    if (assessed === undefined) return true;
    if (typeof assessed === 'function') return assessed(key);
    if (assessed instanceof Set) return assessed.has(key);
    if (Array.isArray(assessed)) return assessed.includes(key);
    return true;
  };
  const headlineEligible = key => !HEADLINE_INELIGIBLE.has(key) && isAssessed(key);

  let rankable = FACULTIES.filter(f => headlineEligible(f.key));
  // Ranking needs at least two distinct faculties to name both an adjective
  // and a noun; if the filter leaves fewer, fall back to every faculty
  // EXCEPT the structurally-constant ones rather than risk `undefined` in
  // the headline — the structural exclusion is never relaxed, even here.
  if (rankable.length < 2) rankable = FACULTIES.filter(f => !HEADLINE_INELIGIBLE.has(f.key));

  const ranked = [...rankable].sort((a, b) => faculties[b.key] - faculties[a.key]);
  const highest = ranked[0].key;
  const lowest = ranked[ranked.length - 1].key;
  return `PROFILE 4-B — ${ADJECTIVES[highest]} ${NOUNS[lowest]}`;
}

export function preliminaryScore(base, amendments) {
  return Math.max(SCORE_FLOOR, base - amendments * AMENDMENT_PENALTY);
}
