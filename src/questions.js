import { RECOVERY_QUESTIONS } from './clock.js';

export const PHASES = ['deposit', 'descent', 'farce'];
export const KINDS = ['crt', 'syllogism', 'sequence', 'spatial', 'affect'];

// THE IMMUTABLE CONTRACT (plan 2026-08-13, §1). `n`, `phase`, `kind`,
// `correct` and `nonsense` are tuned to exact indices by the timer curve
// (src/clock.js), the trick scheduler (src/tricks.js), the recovery set and
// the falsification selector (src/falsify.js). Only `prompt` and `options`
// are content. Every question carries EXACTLY four options — renderQuestion
// letters them 'ABCD'[i] and doubleMark assumes four.
const q = (n, phase, kind, correct, nonsense, prompt, options) =>
  ({ n, phase, kind, nonsense, correct, prompt, options });

export const QUESTIONS = [
  // ── Q1–10 · THE DEPOSIT ────────────────────────────────────────────────
  // Scrupulously fair and fully solvable. No coined vocabulary, no tricks.
  // Answers are deliberately SHORT and CONCRETE: the review sheet's entire
  // payload is the taker thinking "I know I answered seven", so a falsified
  // row has to land on a memory with an edge to it. This matters most for
  // the three `crt` items — the falsifier prefers a CRT the taker got right.

  // DELIBERATE REVERSAL of the original "never use the canonical Frederick
  // (2005) items" rule (owner's call, 2026-08-13 — see the amendment in the
  // plan and spec). The old reasoning was that a reader who recognises
  // bat-and-ball answers instantly and correctly, so the deposit fails to
  // fool them. True — but it optimises the wrong screen. A taker who
  // recognises this item answers 5 cents, KNOWS they answered 5 cents, and
  // feels clever for having beaten the intuitive 10. chooseFalsifications()
  // prefers a CRT the taker got right above everything else (src/falsify.js),
  // so that certainty is precisely what the review sheet then contradicts.
  // Recognition trades a little deposit for a much deeper cut, and Q7 below
  // is kept novel so the deposit still fools people on its own merits.
  q(1, 'deposit', 'crt', 2, false,
    'A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost?',
    ['10 cents', '1 cent', '5 cents', '15 cents']),

  q(2, 'deposit', 'syllogism', 0, false,
    'All members of the review panel hold security clearance. No contractor holds security clearance. Which conclusion follows necessarily?',
    [
      'No contractor is a member of the review panel.',
      'Some contractors are members of the review panel.',
      'Everyone holding security clearance is a member of the review panel.',
      'No conclusion follows from these premises.'
    ]),

  q(3, 'deposit', 'sequence', 1, false,
    'What number continues the series?\n\n2, 3, 5, 9, 17, …',
    ['25', '33', '34', '31']),

  // The second canonical item, in the widgets family. "Wives" rather than
  // workers is the owner's inside joke, and it costs nothing: a 1978 test
  // booklet would phrase it exactly this way, so it reinforces the period
  // register (Wechsler/ETS, see spec §9) rather than puncturing it. It says
  // nothing ABOUT the taker, so it does not touch the never-gender-the-prose
  // rule that governs the Barnum pool and the insinuations.
  q(4, 'deposit', 'crt', 3, false,
    'If six wives can wrap six gifts in six minutes, how long would it take three wives to wrap three gifts?',
    ['3 minutes', '1 minute', '12 minutes', '6 minutes']),

  // Belief-bias item: option B is the believable conclusion and does not
  // follow. BELIEF-BIAS RESISTANCE is the one faculty on the certificate
  // that is genuinely valid, and these three syllogisms are what it reads.
  q(5, 'deposit', 'syllogism', 2, false,
    'All dietitians recommend a varied diet. Some people who recommend a varied diet are not dietitians. Which conclusion follows necessarily?',
    [
      'Some dietitians do not recommend a varied diet.',
      'Anyone recommending a varied diet has studied nutrition.',
      'No conclusion follows from these premises.',
      'Everyone recommending a varied diet is a dietitian.'
    ]),

  q(6, 'deposit', 'spatial', 0, false,
    'A square sheet of paper is folded once, left over right, then once more, top over bottom. A single hole is punched through all layers. How many holes are in the sheet when it is unfolded?',
    ['4', '2', '3', '8']),

  // The surviving novel CRT, and the reason the deposit still works on a
  // reader who recognised both items above: this one is a linguistic trap
  // rather than a famous puzzle, so it fools on its own merits. "7" is also
  // the crispest answer in the deposit — ideal falsification material if the
  // taker happened to miss Q1.
  q(7, 'deposit', 'crt', 1, false,
    'A rack holds 30 machines. All but 7 are decommissioned. How many machines remain in service?',
    ['23', '7', '17', '30']),

  // Modus tollens, with a believable narrative conclusion (A) that does not
  // follow. The valid answer is the flat one.
  q(8, 'deposit', 'syllogism', 3, false,
    'Every device on the secure network is encrypted. The tablet held in evidence is not encrypted. Which conclusion follows necessarily?',
    [
      'The tablet was removed from the secure network.',
      'Some devices on the secure network are unencrypted.',
      'No conclusion follows from these premises.',
      'The tablet held in evidence is not on the secure network.'
    ]),

  q(9, 'deposit', 'sequence', 2, false,
    'What letter continues the series?\n\nB, D, G, K, P, …',
    ['T', 'U', 'V', 'W']),

  q(10, 'deposit', 'spatial', 1, false,
    'A cube is painted on all six faces and then cut into 27 equal smaller cubes. How many of the smaller cubes carry paint on exactly two faces?',
    ['8', '12', '6', '24']),

  // ── Q11–20 · THE DESCENT ───────────────────────────────────────────────
  // Coined vocabulary enters through the syllogisms first, where the logical
  // form stays valid and the terms read as domain jargon rather than farce.
  // The lexicon (floodazzle, gebbleflip, quandle, mirble) recurs on purpose:
  // SEMANTIC SATIATION THRESHOLD is computed from repeated token count, and
  // repetition is what makes the words feel like established terms of art.
  // Bubba arrives here without introduction and is never explained.

  q(11, 'descent', 'syllogism', 0, true,
    'All floodazzles are gebbleflips. Bubba is a floodazzle. Which conclusion follows necessarily?',
    [
      'Bubba is a gebbleflip.',
      'All gebbleflips are floodazzles.',
      'Bubba is not a gebbleflip.',
      'No conclusion follows from these premises.'
    ]),

  q(12, 'descent', 'syllogism', 2, true,
    'No quandled floodazzle is stable. Some items in Bubba\'s sock drawer are quandled floodazzles. Which conclusion follows necessarily?',
    [
      'Everything in Bubba\'s sock drawer is unstable.',
      'Bubba\'s sock drawer contains no stable items.',
      'Some items in Bubba\'s sock drawer are not stable.',
      'No conclusion follows from these premises.'
    ]),

  // RECOVERY (13/16/19): clean, fair, fully solvable, no coined vocabulary,
  // no tricks, full honest time. Each one reseals the ground behind it and
  // destroys the taker's ability to locate the seam.
  q(13, 'descent', 'syllogism', 1, false,
    'Every train departing the northern platform stops at Redbourne. The 14:20 does not stop at Redbourne. Which conclusion follows necessarily?',
    [
      'The 14:20 has been cancelled.',
      'The 14:20 does not depart from the northern platform.',
      'Some trains departing the northern platform do not stop at Redbourne.',
      'No conclusion follows from these premises.'
    ]),

  // Absurd premise, real solvable sequence (×2 − 1). The deadpan pairing is
  // the descent's whole method: nothing about the task has got easier.
  q(14, 'descent', 'sequence', 3, true,
    'Bubba quandles his sock drawer each morning and records the number of floodazzles. The first five mornings gave:\n\n4, 7, 13, 25, 49, …\n\nWhat is recorded on the sixth morning?',
    ['73', '98', '99', '97']),

  // Parlour item. Purports to measure how the subject sees themselves, and
  // is the first item that feels genuinely ABOUT the taker — which is
  // exactly the credulity the certificate goes on to trade on.
  q(15, 'descent', 'affect', null, true,
    'Which of these animals do you prefer?',
    ['The heron', 'The fox', 'The tortoise', 'The wolf']),

  q(16, 'descent', 'spatial', 0, false,
    'A square sheet of paper is folded in half top over bottom, then in half left over right, then in half top over bottom again. A single hole is punched through all layers. How many holes are in the sheet when it is unfolded?',
    ['8', '6', '4', '16']),

  // Q17, Q18, Q20, Q21 and Q22 carry a trick in EVERY run — the placement is
  // deterministic, only the trick type varies (see src/tricks.js). All five
  // are written as ordinary-looking items with parallel, similar-weight
  // options, so a ghost selection or a swallowed click stays deniable as
  // "I misclicked" rather than "that is not what I pressed".
  q(17, 'descent', 'syllogism', 1, true,
    'All gebbleflips mirble when quandled. Nothing in Bubba\'s sock drawer mirbles. Which conclusion follows necessarily?',
    [
      'Bubba\'s sock drawer has never been quandled.',
      'Nothing in Bubba\'s sock drawer is a quandled gebbleflip.',
      'Some gebbleflips do not mirble.',
      'No conclusion follows from these premises.'
    ]),

  // The descent's affect items are where the mid-life material enters the
  // questions themselves — the point where the instrument stops asking
  // about the problem and starts asking about the person. Career stage and
  // profession only; never gender.
  q(18, 'descent', 'affect', null, true,
    'Which of these best describes the work you have not yet done?',
    ['Postponed', 'Delegated', 'Unnecessary', 'Still ahead of me']),

  q(19, 'descent', 'sequence', 2, false,
    'What number continues the series?\n\n3, 4, 6, 9, 13, 18, …',
    ['22', '23', '24', '25']),

  // Parlour item, the pair to Q15. Purports to measure how the subject
  // believes others perceive them. Left oblique on purpose: the certificate
  // names the animal mechanism and never mentions the colour. One named
  // mechanism sells the apparatus; two reads as a magazine quiz.
  q(20, 'descent', 'affect', null, true,
    'Which of these colours do you prefer?',
    ['Green', 'Grey', 'Blue', 'Amber']),

  // ── Q21–24 · THE FARCE ─────────────────────────────────────────────────
  // Openly ridiculous. Tone, timer and layout rigidly unchanged. No correct
  // answers exist and the instrument never says so.

  q(21, 'farce', 'affect', null, true,
    'Bubba\'s sock drawer is to be reclassified. Which classification do you endorse?',
    ['Provisional', 'Permanent', 'Ceremonial', 'Dormant']),

  q(22, 'farce', 'affect', null, true,
    'How many of the floodazzles in your own household have you accounted for?',
    ['All of them', 'Most of them', 'Some of them', 'I have not been asked before']),

  // Q23 is the cursor finale: the timer freezes and the drawn cursor drifts
  // toward the lower-left corner while the taker tries to answer. The mask
  // visibly slips here, so the question itself stays perfectly flat.
  q(23, 'farce', 'affect', null, true,
    'Do you feel this assessment has been conducted fairly?',
    ['Yes', 'No', 'Undecided', 'I would prefer not to say']),

  // Short and almost gentle — and quietly the most useful item in the piece,
  // since it asks the taker to pre-commit to accepting the result they are
  // about to be handed.
  q(24, 'farce', 'affect', null, true,
    'If the result of this assessment differs from what you expected, which explanation would you accept?',
    [
      'The instrument is mistaken',
      'I was not at my best today',
      'The result is probably accurate',
      'I would need to see the working'
    ])
];

export function questionByNumber(n) {
  const found = QUESTIONS.find(x => x.n === n);
  if (!found) throw new RangeError(`no question ${n}`);
  return found;
}

export function validateQuestions(qs) {
  const errors = [];
  if (qs.length !== 24) errors.push(`expected 24 questions, got ${qs.length}`);

  qs.forEach((item, i) => {
    // Guard against null/undefined/non-object entries
    if (item === null || item === undefined || typeof item !== 'object') {
      errors.push(`Q${i + 1}: entry is not an object`);
      return; // skip remaining checks for this item
    }

    const label = `Q${item.n ?? i + 1}`;
    if (item.n !== i + 1) errors.push(`${label}: out of order`);

    // Check prompt is non-empty and non-whitespace
    if (!item.prompt || typeof item.prompt !== 'string' || !item.prompt.trim()) {
      errors.push(`${label}: prompt is missing or empty`);
    }

    // Check options array and content
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      errors.push(`${label}: must have exactly 4 options`);
    } else {
      // Check each option is non-empty
      for (let j = 0; j < 4; j++) {
        if (!item.options[j] || typeof item.options[j] !== 'string' || !item.options[j].trim()) {
          errors.push(`${label}: option ${j} is missing or empty`);
        }
      }
      // Check for duplicate options
      const optionSet = new Set(item.options);
      if (optionSet.size !== 4) {
        errors.push(`${label}: contains duplicate options`);
      }
    }

    if (!PHASES.includes(item.phase)) errors.push(`${label}: bad phase "${item.phase}"`);
    if (!KINDS.includes(item.kind)) errors.push(`${label}: bad kind "${item.kind}"`);

    // Check phase matches n range for all three bands
    if (item.n <= 10 && item.phase !== 'deposit') {
      errors.push(`${label}: Q1-10 must be deposit phase`);
    }
    if (item.n >= 11 && item.n <= 20 && item.phase !== 'descent') {
      errors.push(`${label}: Q11-20 must be descent phase`);
    }
    if (item.n >= 21 && item.phase !== 'farce') {
      errors.push(`${label}: Q21-24 must be farce phase`);
    }

    if (item.correct !== null) {
      if (!Number.isInteger(item.correct) || item.correct < 0 || item.correct > 3) {
        errors.push(`${label}: correct index out of range`);
      }
    }
    if (item.n <= 10) {
      if (item.nonsense) errors.push(`${label}: deposit must not use nonsense vocabulary`);
      if (item.correct === null) errors.push(`${label}: deposit must be solvable`);
    }
    if (item.n >= 21 && item.correct !== null) {
      errors.push(`${label}: farce questions must have no correct answer`);
    }
    if (RECOVERY_QUESTIONS.includes(item.n)) {
      if (item.nonsense) errors.push(`${label}: recovery must not be nonsense`);
      if (item.correct === null) errors.push(`${label}: recovery must be solvable`);
    }
  });

  const deposit = qs.filter(x => x && x.phase === 'deposit');
  const need = { crt: 3, syllogism: 3, sequence: 2, spatial: 2 };
  for (const [kind, wanted] of Object.entries(need)) {
    const got = deposit.filter(x => x.kind === kind).length;
    if (got !== wanted) errors.push(`deposit needs ${wanted} ${kind}, has ${got}`);
  }
  return errors;
}
