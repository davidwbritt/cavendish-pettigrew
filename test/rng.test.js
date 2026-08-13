import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { mulberry32, pick, shuffle } from '../src/rng.js';

const ROOT = dirname(dirname(new URL(import.meta.url).pathname));

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(42), b = mulberry32(42);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('mulberry32 returns values in [0, 1)', () => {
  const r = mulberry32(7);
  for (let i = 0; i < 500; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('shuffle preserves all elements and does not mutate input', () => {
  const input = [1, 2, 3, 4, 5];
  const out = shuffle(mulberry32(1), input);
  assert.deepEqual([...out].sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
});

test('pick returns an element of the array', () => {
  const arr = ['a', 'b', 'c'];
  assert.ok(arr.includes(pick(mulberry32(3), arr)));
});

// Fix 5 (final whole-branch review, MINOR): src/main.js seeds the rng with
// `Date.now() ^ Math.floor(Math.random() * 1e9)` — one legitimate entropy
// source feeding an otherwise fully-seeded pipeline, which is fine, but a
// comment nearby used to assert "no Math.random() anywhere in this
// project", which was false. This test is the guard everyone assumed
// already existed: it greps every .js file under src/ and asserts
// Math.random appears EXACTLY ONCE, on the sanctioned seeding line, so a
// future trick that reaches for Math.random() (violating the project's
// seeded-randomness-only constraint) fails a test instead of shipping
// silently.
async function jsFilesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) files.push(...await jsFilesUnder(full));
    else if (e.name.endsWith('.js')) files.push(full);
  }
  return files;
}

// Strips comments before matching so a comment that mentions "Math.random()"
// by name (documenting the exception, as src/main.js's does) doesn't count
// as a second occurrence — this test cares about CODE, not prose.
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

test('Math.random() appears exactly once in src/ — the single sanctioned rng-seeding call', async () => {
  const files = await jsFilesUnder(resolve(ROOT, 'src'));
  const occurrences = [];
  for (const file of files) {
    const code = stripComments(await readFile(file, 'utf8'));
    const matches = code.match(/Math\.random\(\)/g);
    if (matches) {
      for (let i = 0; i < matches.length; i++) occurrences.push(file);
    }
  }
  assert.deepEqual(occurrences, [resolve(ROOT, 'src/main.js')],
    `Math.random() must appear exactly once, in src/main.js (rng seeding) — found: ${JSON.stringify(occurrences)}`);
});
