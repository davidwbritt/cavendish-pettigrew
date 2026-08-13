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

test('non-Latin names are left alone rather than mangled', () => {
  const r = introduceTypo('ХОЛОД', mulberry32(1));
  assert.equal(r.display, 'ХОЛОД');
  assert.equal(r.kind, 'none');
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
