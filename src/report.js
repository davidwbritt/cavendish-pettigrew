import { FACULTIES } from './scoring.js';
import { shuffle } from './rng.js';
import { BARNUM, INSINUATION_TIERS } from './statements.js';

// Formats a whole number as its English ordinal ("92" -> "92nd"). Written
// for the general case, not just headlineCentile()'s current 91-96 range —
// a future retuning of that range must not silently reintroduce an
// ungrammatical certificate. The 11/12/13 exception is checked against
// n % 100 first (so 111/112/113, 211/212/213, etc. all correctly stay
// "th") before falling back to the last-digit rule.
export function ordinal(n) {
  const mod100 = Math.abs(n) % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (Math.abs(n) % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

export function drawStatements(rng) {
  const barnum = shuffle(rng, BARNUM).slice(0, 10);
  const insinuations = INSINUATION_TIERS.map(tier => shuffle(rng, tier)[0]);
  return { barnum, insinuations };
}

// Printed in place of a COMPOSURE score when the Q23 finale never ran for
// this taker (prefers-reduced-motion or a coarse pointer) — see
// src/scoring.js's composureAssessed(). Deliberately terse and clinical
// rather than five sentences like the other indices: the certificate is
// happy to admit a procedure wasn't administered, but never explains why,
// which is funnier and keeps the register consistent with everything else
// on the page grading the taker with total seriousness regardless.
const COMPOSURE_SUPPRESSED_NOTE =
  'COMPOSURE — not assessed under modified administration conditions. ' +
  'The procedure that measures this index was not administered for this sitting. No score is reported.';

// The name line, for Behavioural Observations. The instrument corrupted the
// name itself at Q11 (src/name.js), carried it in the taker's peripheral
// vision for twenty minutes, and now reports the mismatch as a defect in
// THEM — and, having quoted both spellings side by side, treats its own as
// the name of record and the taker's as the error. It then names the index
// it docked, so the deduction reads as procedure rather than spite.
//
// Only ever called when a typo was actually applied. Names too short to
// corrupt (and any other case introduceTypo returns kind 'none' for) get no
// discrepancy, no line and no deduction — accusing someone of misspelling a
// name the certificate then prints correctly is not a joke, it is a bug.
function nameDiscrepancyNote({ supplied, record }) {
  return `NAME DISCREPANCY — entry given as "${supplied}"; name of record is "${record}". `
    + 'Subject demonstrates inconsistency in self-report. '
    + 'RESPONSE CONSISTENCY (κ) has been adjusted accordingly.';
}

export function buildReport({
  faculties, centile, classification, displayName, amendmentCount, rng,
  composureAssessed = true, nameDiscrepancy = null
}) {
  const { barnum, insinuations } = drawStatements(rng);
  const pool = [...barnum];
  const take = () => pool.shift();

  const header = {
    subject: displayName,
    form: 'FORM 4-B',
    instrument: 'CAVENDISH–PETTIGREW REFLECTIVE APTITUDE INVENTORY',
    administration: 'ADMINISTERED UNDER STANDARD CONDITIONS'
  };

  // Immaculate. No insinuations may appear here.
  const summary = [
    `Overall standing: ${ordinal(centile)} centile.`,
    `Classification: ${classification}.`,
    take(), take()
  ];

  // Each paragraph is five sentences. Sentences 1, 2, 4 and 5 are structural
  // clinical filler drawn from fixed text — NOT from the pool. Sentence 3 is the
  // payload: an insinuation in paragraphs 2 and 4, a Barnum statement elsewhere.
  // This is what keeps insinuations mid-paragraph and the pool arithmetic sane.
  const FILLER_2 = 'This is within the range anticipated for the subject\'s response profile.';
  const FILLER_4 = 'Compensatory strategies are evident and are, on the whole, adequate.';
  const FILLER_5 = 'No further comment is indicated at this index.';

  const interpretation = FACULTIES.map((f, i) => {
    const isSuppressedComposure = f.key === 'composure' && !composureAssessed;
    // Still draw (and discard) a payload even when suppressed, so the shared
    // pool is consumed in exactly the same sequence either way — suppressing
    // composure must not shift which Barnum statement lands in a LATER
    // faculty's paragraph or in the closer for a given seed.
    const payload = i === 1 ? insinuations[0] : (i === 3 ? insinuations[1] : take());
    if (isSuppressedComposure) {
      return {
        facultyKey: f.key,
        label: f.label,
        score: null,
        paragraph: COMPOSURE_SUPPRESSED_NOTE
      };
    }
    const opening = `${f.label} is recorded at ${faculties[f.key]}.`;
    return {
      facultyKey: f.key,
      label: f.label,
      score: faculties[f.key],
      paragraph: `${opening} ${FILLER_2} ${payload} ${FILLER_4} ${FILLER_5}`
    };
  });

  // Sits after the amendment verdict and before the tier-3 insinuation, so
  // the escalation still ends on the insinuation and the block still closes
  // on 'No further comment is indicated.'
  const observations = [
    amendmentCount > 0
      ? `POST-HOC REVISION ATTEMPTS: ${amendmentCount} — subject exhibits discomfort with their own record.`
      : 'RECORD ACCEPTED WITHOUT AMENDMENT — subject demonstrates high deference to instrumentation.',
    ...(nameDiscrepancy ? [nameDiscrepancyNote(nameDiscrepancy)] : []),
    insinuations[2],
    'No further comment is indicated.'
  ];

  const recommendations = [insinuations[3], 'Retesting is not indicated.'];
  const closer = take();

  return { header, summary, interpretation, observations, recommendations, closer };
}
