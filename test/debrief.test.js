import { test } from 'node:test';
import assert from 'node:assert/strict';
import { debriefClosingText } from '../src/ui/screens.js';
import { introduceTypo } from '../src/name.js';
import { mulberry32 } from '../src/rng.js';

// Fix 2 (final whole-branch review, IMPORTANT): the debrief used to state
// unconditionally that "your name was misspelled from question eleven
// onward" — false for any taker whose name introduceTypo left uncorrupted
// (kind 'none'), which included every accented name before the Unicode
// guard fix, and always includes names too short to corrupt safely (e.g.
// "JO"). debriefClosingText is the pure, DOM-free extraction of that
// sentence's construction (see reviewRows/applyAmendment/
// certificateIndexRows in screens.js for the same testability pattern —
// this project has no jsdom).

test('the misspelling clause is present when a typo was actually applied', () => {
  const text = debriefClosingText(true);
  assert.match(text, /your name was misspelled from question eleven onward/);
});

test('the misspelling clause is omitted when no typo was applied', () => {
  const text = debriefClosingText(false);
  assert.ok(!text.includes('misspelled'),
    'the debrief must not claim a misspelling that never happened');
  // The rest of the paragraph's wording must be unchanged, just terminated
  // with a period instead of continuing into the dropped clause.
  assert.match(text, /Three answers on the review sheet were changed before you saw them\.$/);
});

test('a 2-character name yields kind \'none\' AND the debrief omits the misspelling sentence for it', () => {
  const r = introduceTypo('JO', mulberry32(1));
  assert.equal(r.kind, 'none');
  const text = debriefClosingText(r.kind !== 'none');
  assert.ok(!text.includes('misspelled'),
    'a name too short to corrupt must not trigger the false misspelling claim');
});

test('every existing sentence up to the closing clause is byte-identical whether or not the typo applied', () => {
  const withTypo = debriefClosingText(true);
  const without = debriefClosingText(false);
  const shared = 'The timer always showed forty-five seconds. It did not always give you forty-five seconds. Some of your clicks were interfered with. Three answers on the review sheet were changed before you saw them';
  assert.ok(withTypo.startsWith(shared));
  assert.ok(without.startsWith(shared));
});
