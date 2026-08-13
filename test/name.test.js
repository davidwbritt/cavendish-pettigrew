import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { introduceTypo, displayNameFor, TYPO_KINDS } from '../src/name.js';

const seeds = () => Array.from({ length: 200 }, (_, i) => mulberry32(i));

test('a typo is always introduced for an ordinary name', () => {
  for (const rng of seeds()) {
    const r = introduceTypo('DAVID', rng);
    assert.notEqual(r.display, 'DAVID');
    assert.ok(TYPO_KINDS.includes(r.kind));
  }
});

test('the original is always preserved', () => {
  const r = introduceTypo('MARGARET', mulberry32(5));
  assert.equal(r.original, 'MARGARET');
});

test('the corruption changes length by at most one character', () => {
  for (const rng of seeds()) {
    const r = introduceTypo('DAVID', rng);
    assert.ok(Math.abs(r.display.length - 5) <= 1, `got "${r.display}"`);
  }
});

test('only characters from the original alphabet appear — never digits or symbols', () => {
  for (const rng of seeds()) {
    const r = introduceTypo('DAVID', rng);
    assert.match(r.display, /^[A-Za-z]+$/, `implausible corruption "${r.display}"`);
  }
});

test('names shorter than 3 characters are left alone', () => {
  for (const name of ['', 'J', 'JO']) {
    const r = introduceTypo(name, mulberry32(1));
    assert.equal(r.display, name);
    assert.equal(r.kind, 'none');
  }
});

// Fix 2 (final whole-branch review, IMPORTANT): the guard used to be
// /^[A-Za-z][A-Za-z' -]*$/, which rejected ANY non-ASCII letter outright —
// including Cyrillic, so this test used to assert Cyrillic names were "left
// alone". That was the same bug the accented-Latin case has (JOSÉ, ZOË,
// etc.): the guard now accepts any Unicode letter (\p{L}), so a name like
// this DOES get a typo, for the same reason an accented Latin name must —
// see the tests below. "Left alone" is now reserved for genuinely
// unsupported input (digits/symbols, or names too short to corrupt safely).
test('a name using a non-Latin script also gets a typo introduced (Unicode guard)', () => {
  for (const rng of seeds()) {
    const r = introduceTypo('ХОЛОД', rng);
    assert.notEqual(r.kind, 'none', 'Unicode letters must not be silently rejected');
    assert.equal(r.display[0], 'Х', 'First letter preserved');
  }
});

test('a name containing digits or symbols is left alone rather than mangled', () => {
  for (const name of ['DA1ID', 'ANNA!', '2PAC', 'NAME@EXAMPLE']) {
    const r = introduceTypo(name, mulberry32(1));
    assert.equal(r.display, name);
    assert.equal(r.kind, 'none');
  }
});

// Fix 2 (final whole-branch review, IMPORTANT): src/name.js's guard was
// /^[A-Za-z][A-Za-z' -]*$/, so accented names (JOSÉ, ZOË, MÜLLER, RENÉE,
// BJÖRN) all returned kind 'none' — no typo at all. The debrief page then
// states unconditionally that "your name was misspelled from question
// eleven onward", which was false for exactly those takers: a checkable lie
// on the closing paragraph of a piece about deception. The guard is now
// /^\p{L}[\p{L}' -]*$/u.
const ACCENTED_NAMES = ['JOSÉ', 'ZOË', 'MÜLLER', 'RENÉE', 'BJÖRN', 'ANNE-MARIE', "O'BRIEN", 'DAVID BRITT'];

test('accented and diacritic names always receive a typo (Unicode guard)', () => {
  for (const name of ACCENTED_NAMES) {
    for (const rng of seeds()) {
      const r = introduceTypo(name, rng);
      assert.notEqual(r.kind, 'none', `No typo for "${name}"`);
    }
  }
});

test('the first character is never altered for accented/diacritic names', () => {
  for (const name of ACCENTED_NAMES) {
    for (const rng of seeds()) {
      const r = introduceTypo(name, rng);
      assert.equal(r.display[0], r.original[0],
        `First character changed for "${name}": "${r.original}" -> "${r.display}" (kind: ${r.kind})`);
    }
  }
});

test('no digits or new symbols appear in the corruption of accented/diacritic names', () => {
  // Allow any Unicode letter plus the three permitted separators — nothing
  // else (no digits, no punctuation the corruption shouldn't introduce).
  const allowed = /^[\p{L}' -]+$/u;
  for (const name of ACCENTED_NAMES) {
    for (const rng of seeds()) {
      const r = introduceTypo(name, rng);
      assert.match(r.display, allowed, `implausible corruption "${r.display}" from "${name}"`);
    }
  }
});

test('diacritics and separators are preserved in accented names except where the corruption legitimately acts', () => {
  for (const name of ACCENTED_NAMES) {
    for (const rng of seeds()) {
      const r = introduceTypo(name, rng);
      if (r.kind === 'none') continue;
      const origSeps = Array.from(name).map((c, i) => !/\p{L}/u.test(c) ? i : null).filter(i => i !== null);
      const dispSeps = Array.from(r.display).map((c, i) => !/\p{L}/u.test(c) ? i : null).filter(i => i !== null);
      // 'adjacent' and 'transpose' never change the length or which indices
      // are separators; 'double'/'drop' legitimately shift indices by one.
      if (r.kind === 'adjacent' || r.kind === 'transpose') {
        assert.deepEqual(origSeps, dispSeps,
          `Separators/diacritic positions changed in ${name}: ${r.original} -> ${r.display} (kind ${r.kind})`);
      }
    }
  }
});

test('the ADJACENT map never fires for accented characters — apply(adjacent) safely declines and the retry loop falls through', () => {
  // Diacritic-safety claim from the fix: ADJACENT has no entries for
  // non-ASCII letters, so an 'adjacent' corruption can never land ON an
  // accented character. Verified directly: no display ever differs from its
  // original ONLY by a changed accented letter via 'adjacent' kind.
  for (const name of ['MÜLLER', 'RENÉE', 'BJÖRN']) {
    for (const rng of seeds()) {
      const r = introduceTypo(name, rng);
      if (r.kind !== 'adjacent') continue;
      // If 'adjacent' fired at all, the position it changed must be a plain
      // ASCII letter, not the accented one, for these particular names —
      // sanity-check by confirming the accented character itself is
      // unchanged in position.
      for (let i = 0; i < name.length; i++) {
        if (/[ÜÉÖ]/.test(name[i])) {
          assert.equal(r.display[i], name[i],
            `'adjacent' corrupted an accented character in "${name}": -> "${r.display}"`);
        }
      }
    }
  }
});

test('the typo is stable — same input and seed give the same output', () => {
  const a = introduceTypo('DAVID', mulberry32(11));
  const b = introduceTypo('DAVID', mulberry32(11));
  assert.equal(a.display, b.display);
});

test('the displayed name is clean for Q1-10 and corrupt from Q11', () => {
  const typo = introduceTypo('DAVID', mulberry32(3));
  for (let n = 1; n <= 10; n++) assert.equal(displayNameFor(n, typo), 'DAVID');
  for (let n = 11; n <= 24; n++) assert.equal(displayNameFor(n, typo), typo.display);
});

test('the first letter is NEVER corrupted across 2000+ seeds and varied lengths', () => {
  const testNames = ['DAVID', 'ANN', 'MARGARET', 'JIM'];
  const manySeeds = Array.from({ length: 2000 }, (_, i) => mulberry32(i));
  for (const name of testNames) {
    for (const rng of manySeeds) {
      const r = introduceTypo(name, rng);
      assert.equal(
        r.display[0],
        r.original[0],
        `First letter changed for "${name}": "${r.original}" -> "${r.display}" (kind: ${r.kind})`
      );
    }
  }
});

test('names with hyphens get typos introduced', () => {
  for (const rng of seeds()) {
    const r = introduceTypo('ANNE-MARIE', rng);
    assert.notEqual(r.kind, 'none', `No typo for ANNE-MARIE with seed ${rng}`);
    assert.equal(r.display[0], 'A', 'First letter preserved');
  }
});

test('names with spaces get typos introduced', () => {
  for (const rng of seeds()) {
    const r = introduceTypo('MARY JANE', rng);
    assert.notEqual(r.kind, 'none', `No typo for MARY JANE`);
    assert.equal(r.display[0], 'M', 'First letter preserved');
  }
});

test('names with apostrophes get typos introduced', () => {
  for (const rng of seeds()) {
    const r = introduceTypo("O'BRIEN", rng);
    assert.notEqual(r.kind, 'none', `No typo for O'BRIEN`);
    assert.equal(r.display[0], 'O', 'First letter preserved');
  }
});

test('full names with spaces get typos introduced', () => {
  for (const rng of seeds()) {
    const r = introduceTypo('DAVID BRITT', rng);
    assert.notEqual(r.kind, 'none', `No typo for DAVID BRITT`);
    assert.equal(r.display[0], 'D', 'First letter preserved');
  }
});

test('separators (spaces, hyphens, apostrophes) are preserved in position', () => {
  const testCases = [
    'ANNE-MARIE',
    'MARY JANE',
    "O'BRIEN",
    'DAVID BRITT',
    'MCTAVISH'
  ];
  for (const name of testCases) {
    for (const rng of seeds()) {
      const r = introduceTypo(name, rng);
      if (r.kind === 'none') continue;
      // Find all separator positions in original
      const origSeps = Array.from(name).map((c, i) => !(/[A-Za-z]/.test(c)) ? i : null).filter(i => i !== null);
      // Find all separator positions in display (before potential drop/double changes length)
      const dispSeps = Array.from(r.display).map((c, i) => !/[A-Za-z]/.test(c) ? i : null).filter(i => i !== null);
      // For double/drop, we can't require exact positions, but separators shouldn't be added/removed carelessly
      if (r.kind !== 'double' && r.kind !== 'drop') {
        assert.deepEqual(origSeps, dispSeps, `Separators changed in ${name}: ${r.original} -> ${r.display}`);
      }
    }
  }
});
