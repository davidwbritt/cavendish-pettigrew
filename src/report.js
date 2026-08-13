import { FACULTIES } from './scoring.js';
import { shuffle } from './rng.js';
import { BARNUM, INSINUATION_TIERS } from './statements.js';

export function drawStatements(rng) {
  const barnum = shuffle(rng, BARNUM).slice(0, 10);
  const insinuations = INSINUATION_TIERS.map(tier => shuffle(rng, tier)[0]);
  return { barnum, insinuations };
}

export function buildReport({
  faculties, centile, classification, displayName, amendmentCount, rng
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
    `Overall standing: ${centile}th centile.`,
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
    const opening = `${f.label} is recorded at ${faculties[f.key]}.`;
    const payload = i === 1 ? insinuations[0] : (i === 3 ? insinuations[1] : take());
    return {
      facultyKey: f.key,
      label: f.label,
      score: faculties[f.key],
      paragraph: `${opening} ${FILLER_2} ${payload} ${FILLER_4} ${FILLER_5}`
    };
  });

  const observations = [
    amendmentCount > 0
      ? `POST-HOC REVISION ATTEMPTS: ${amendmentCount} — subject exhibits discomfort with their own record.`
      : 'RECORD ACCEPTED WITHOUT AMENDMENT — subject demonstrates high deference to instrumentation.',
    insinuations[2],
    'No further comment is indicated.'
  ];

  const recommendations = [insinuations[3], 'Retesting is not indicated.'];
  const closer = take();

  return { header, summary, interpretation, observations, recommendations, closer };
}
