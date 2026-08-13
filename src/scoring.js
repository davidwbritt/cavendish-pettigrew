import { QUESTIONS, questionByNumber } from './questions.js';
import { amendmentCount } from './transcript.js';
import { RECOVERY_QUESTIONS } from './clock.js';
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
    : 45000;
  const reflectiveLatency = clamp(100 - (meanMs / 45000) * 100);

  // Genuinely valid: did they accept invalid syllogisms with believable conclusions?
  const syllogisms = QUESTIONS.filter(q => q.kind === 'syllogism' && q.correct !== null);
  const rightSyll = syllogisms.filter(q => entry(q.n)?.choice === q.correct).length;
  const beliefBiasResistance = clamp(
    syllogisms.length ? (rightSyll / syllogisms.length) * 100 : 50
  );

  // How readily they accepted malformed premises rather than rejecting them.
  const nonsense = QUESTIONS.filter(q => q.nonsense);
  const engaged = nonsense.filter(q => entry(q.n)?.choice !== null).length;
  const premiseTolerance = clamp(nonsense.length ? (engaged / nonsense.length) * 100 : 50);

  // Our own sawtooth, reported as their deficit: performance immediately after recovery.
  const drops = RECOVERY_QUESTIONS.map(n => {
    const after = entry(n + 1);
    const q = after && questionByNumber(after.n);
    if (!after || !q || q.correct === null) return 0;
    return after.choice === q.correct ? 0 : 1;
  });
  const setShiftingCost = clamp((drops.reduce((a, b) => a + b, 0) / drops.length) * 100);

  // Mid-test changes plus post-hoc amendments. Real, and largely our doing.
  const changes = t.entries.reduce((s, e) => s + e.changes, 0);
  const responseConsistency = clamp(100 - (changes * 4) - (amendmentCount(t) * 9));

  // Panic during the Q23 freeze. Measured fairly.
  const composure = clamp(100 - (t.telemetry.freezePointerDistance / 8000) * 100);

  // Nothing to do with the taker whatsoever — a property of the question set.
  const tokens = QUESTIONS.filter(q => q.nonsense).length;
  const semanticSatiation = clamp(100 - tokens * 7);

  return {
    reflectiveLatency, beliefBiasResistance, premiseTolerance,
    setShiftingCost, responseConsistency, composure, semanticSatiation
  };
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

export function classify(faculties) {
  const ranked = [...FACULTIES].sort((a, b) => faculties[b.key] - faculties[a.key]);
  const highest = ranked[0].key;
  const lowest = ranked[ranked.length - 1].key;
  return `PROFILE 4-B — ${ADJECTIVES[highest]} ${NOUNS[lowest]}`;
}

export function preliminaryScore(base, amendments) {
  return Math.max(SCORE_FLOOR, base - amendments * AMENDMENT_PENALTY);
}
