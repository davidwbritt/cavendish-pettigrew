# Cavendish–Pettigrew Inventory — Instrument Machinery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete working instrument — clock, trick scheduler, falsification, scoring, report assembly and all screens — running against a provisional question set that Plan 2 replaces with authored content.

**Architecture:** Pure logic lives in `src/*.js` as dependency-free ES modules, imported directly by `node --test`. DOM code is confined to `src/ui/`. A ~30-line `build.mjs` inlines every module into `dist/index.html` for shipping, so the shipped artifact has no dependencies, no network access and needs no build to run.

**Tech Stack:** Vanilla ES modules, `node:test` + `node:assert` (zero dependencies), plain DOM, no framework, no webfonts.

**Source spec:** `docs/superpowers/specs/2026-08-12-cavendish-pettigrew-design.md`

## Global Constraints

- **No runtime dependencies. No network requests. No webfonts.** System font stacks only.
- **Shipped artifact is `dist/index.html`** — one self-contained file.
- Node 18+ (for `node --test`).
- **Timer: displayed value is always 45s and always counts 45 → 0.** Only the real rate varies.
- **Real question duration never drops below 20000ms at any index, under any condition.**
- **No trick fires before Q11.** Q1–10 are scrupulously fair.
- **Recovery questions are Q13, Q16, Q19** — never sabotaged, always full honest 45s.
- **Every trick is escapable** — the taker can always reach and set their intended answer.
- **Exactly 3 falsified rows** on the review screen, all from Q1–10.
- **Amendment costs −2 points regardless of correctness.**
- **Headline centile is always 91–96.**
- **Exactly 4 insinuations per certificate**, one drawn per tier, in tier order.
- Palette is exactly four colours: paper `#EDE8DA`, ink `#1A1712`, process blue `#2E4A6B`, correction red `#E4002B`.
- All randomness flows through an injectable seeded RNG so tests are deterministic.

## File Structure

| File | Responsibility |
|---|---|
| `src/rng.js` | Seeded RNG, `pick`, `shuffle` |
| `src/clock.js` | Real vs displayed duration curve |
| `src/questions.js` | The 24-question data set (provisional; Plan 2 replaces) |
| `src/transcript.js` | Records answers, timings, changes, amendments |
| `src/tricks.js` | Trick names, scheduler, schedule validator |
| `src/name.js` | Subject-name typo introduction |
| `src/falsify.js` | Review-screen falsification selection |
| `src/scoring.js` | Seven faculties, centile, classification |
| `src/statements.js` | Barnum pool + 4 insinuation tiers (provisional; Plan 2 replaces) |
| `src/report.js` | Certificate assembly and statement draw |
| `src/ui/dom.js` | Small DOM helpers |
| `src/ui/screens.js` | Screen rendering (landing, question, review, certificate, debrief) |
| `src/ui/effects.js` | DOM-level trick effects + touch variants |
| `src/ui/cursor.js` | Synthetic cursor and the Q23 finale |
| `src/main.js` | Wiring and state machine |
| `index.html` | Dev entry point + all styles |
| `build.mjs` | Inliner producing `dist/index.html` |
| `test/*.test.js` | One test file per logic module |

---

### Task 1: Scaffold, test runner and build script

**Files:**
- Create: `package.json`, `build.mjs`, `index.html`, `src/rng.js`, `test/rng.test.js`, `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: `mulberry32(seed) -> () => number`, `pick(rng, arr) -> item`, `shuffle(rng, arr) -> newArray`

- [ ] **Step 1: Write the failing test**

```js
// test/rng.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pick, shuffle } from '../src/rng.js';

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rng.test.js`
Expected: FAIL — `Cannot find module '../src/rng.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/rng.js
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function shuffle(rng, arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

```json
// package.json
{
  "name": "aptitude",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test test/",
    "build": "node build.mjs"
  }
}
```

```
// .gitignore
node_modules/
dist/
```

```js
// build.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = dirname(new URL(import.meta.url).pathname);
const seen = new Set();

async function inline(path) {
  if (seen.has(path)) return '';
  seen.add(path);
  const src = await readFile(path, 'utf8');
  const imports = [...src.matchAll(/^import\s+.*?from\s+'(\.[^']+)';?$/gm)];
  let out = '';
  for (const [, rel] of imports) out += await inline(resolve(dirname(path), rel));
  out += src
    .replace(/^import\s+.*?from\s+'\.[^']+';?$/gm, '')
    .replace(/^export\s+/gm, '');
  return out + '\n';
}

const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
const bundle = await inline(resolve(ROOT, 'src/main.js'));
const output = html.replace(
  /<script type="module" src="src\/main\.js"><\/script>/,
  `<script>\n${bundle}\n</script>`
);
if (output === html) throw new Error('build: module script tag not found in index.html');
await mkdir(resolve(ROOT, 'dist'), { recursive: true });
await writeFile(resolve(ROOT, 'dist/index.html'), output);
console.log(`built dist/index.html (${output.length} bytes, ${seen.size} modules)`);
```

```html
<!-- index.html -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Reflective Aptitude Inventory, Form 4-B</title>
<style>
:root {
  --paper: #EDE8DA;
  --ink: #1A1712;
  --blue: #2E4A6B;
  --red: #E4002B;
  --measure: 62ch;
  --serif: Georgia, Charter, 'Times New Roman', serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--paper); color: var(--ink);
  font-family: var(--serif); font-size: 17px; line-height: 1.5;
}
#app { max-width: var(--measure); margin: 0 auto; padding: 3rem 1.25rem 6rem; }
</style>
</head>
<body>
<div id="app"></div>
<script type="module" src="src/main.js"></script>
</body>
</html>
```

```js
// src/main.js
console.log('instrument loaded');
```

- [ ] **Step 4: Run tests and the build to verify both pass**

Run: `npm test`
Expected: PASS — 4 tests passing

Run: `npm run build`
Expected: prints `built dist/index.html (N bytes, 1 modules)`

- [ ] **Step 5: Commit**

```bash
git add package.json build.mjs index.html .gitignore src/rng.js test/rng.test.js
git commit -m "feat: scaffold project, seeded RNG, and single-file build"
```

---

### Task 2: The clock

The single most important invariant in the project. Displayed time is a linear remap of real elapsed time onto a fixed 45-second face.

**Files:**
- Create: `src/clock.js`, `test/clock.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `DISPLAY_DURATION_MS`, `FLOOR_MS`, `RECOVERY_QUESTIONS`, `realDurationMs(n) -> number`, `displayedRemainingMs(n, elapsedMs) -> number`

- [ ] **Step 1: Write the failing test**

```js
// test/clock.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  realDurationMs, displayedRemainingMs,
  DISPLAY_DURATION_MS, FLOOR_MS, RECOVERY_QUESTIONS
} from '../src/clock.js';

test('questions 1-10 are honest', () => {
  for (let n = 1; n <= 10; n++) assert.equal(realDurationMs(n), 45000);
});

test('real duration never drops below the 20s floor', () => {
  for (let n = 1; n <= 24; n++) {
    assert.ok(realDurationMs(n) >= FLOOR_MS, `Q${n} = ${realDurationMs(n)}`);
  }
});

test('recovery questions get full honest time', () => {
  for (const n of RECOVERY_QUESTIONS) assert.equal(realDurationMs(n), 45000);
});

test('real duration is monotonically non-increasing outside recovery questions', () => {
  const nonRecovery = [];
  for (let n = 11; n <= 24; n++) {
    if (!RECOVERY_QUESTIONS.includes(n)) nonRecovery.push(realDurationMs(n));
  }
  for (let i = 1; i < nonRecovery.length; i++) {
    assert.ok(nonRecovery[i] <= nonRecovery[i - 1], `rose at index ${i}`);
  }
});

test('displayed time always starts at 45s regardless of question', () => {
  for (let n = 1; n <= 24; n++) {
    assert.equal(displayedRemainingMs(n, 0), DISPLAY_DURATION_MS);
  }
});

test('displayed time reaches exactly zero at real expiry', () => {
  for (let n = 1; n <= 24; n++) {
    assert.equal(displayedRemainingMs(n, realDurationMs(n)), 0);
  }
});

test('displayed time is clamped at zero past expiry', () => {
  assert.equal(displayedRemainingMs(24, 999999), 0);
});

test('by Q24 the face overstates remaining time at the midpoint', () => {
  const half = realDurationMs(24) / 2;
  assert.equal(displayedRemainingMs(24, half), 22500);
  assert.equal(half, 10000); // taker has 10s left; the face says 22.5s
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clock.test.js`
Expected: FAIL — `Cannot find module '../src/clock.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/clock.js
export const DISPLAY_DURATION_MS = 45000;
export const FLOOR_MS = 20000;
export const RECOVERY_QUESTIONS = [13, 16, 19];

const REAL_MS = {
  1: 45000, 2: 45000, 3: 45000, 4: 45000, 5: 45000,
  6: 45000, 7: 45000, 8: 45000, 9: 45000, 10: 45000,
  11: 42000, 12: 38000, 13: 45000, 14: 34000, 15: 30000,
  16: 45000, 17: 27000, 18: 24000, 19: 45000, 20: 21000,
  21: 20000, 22: 20000, 23: 20000, 24: 20000
};

export function realDurationMs(n) {
  const ms = REAL_MS[n];
  if (ms === undefined) throw new RangeError(`no duration for question ${n}`);
  return ms;
}

export function displayedRemainingMs(n, elapsedMs) {
  const real = realDurationMs(n);
  const fraction = Math.min(1, Math.max(0, elapsedMs / real));
  return Math.round(DISPLAY_DURATION_MS * (1 - fraction));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clock.test.js`
Expected: PASS — 8 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/clock.js test/clock.test.js
git commit -m "feat: timer curve with fixed 45s face over a variable real rate"
```

---

### Task 3: Question schema and provisional data set

Plan 2 replaces the contents of `QUESTIONS` wholesale. This task fixes the *shape* and the composition rules the real content must satisfy.

**Files:**
- Create: `src/questions.js`, `test/questions.test.js`

**Interfaces:**
- Consumes: `RECOVERY_QUESTIONS` from `src/clock.js`
- Produces: `QUESTIONS` (array of 24), `validateQuestions(qs) -> string[]`, `questionByNumber(n) -> question`
- Question shape: `{ n, phase, kind, prompt, options: [4 strings], correct: number|null, nonsense: boolean }`
- `phase` ∈ `'deposit' | 'descent' | 'farce'`; `kind` ∈ `'crt' | 'syllogism' | 'sequence' | 'spatial' | 'affect'`
- `correct` is an option index, or `null` where no wrong answer exists

- [ ] **Step 1: Write the failing test**

```js
// test/questions.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, validateQuestions, questionByNumber } from '../src/questions.js';
import { RECOVERY_QUESTIONS } from '../src/clock.js';

test('there are exactly 24 questions numbered 1-24', () => {
  assert.equal(QUESTIONS.length, 24);
  assert.deepEqual(QUESTIONS.map(q => q.n), Array.from({ length: 24 }, (_, i) => i + 1));
});

test('the provisional set passes its own validator', () => {
  assert.deepEqual(validateQuestions(QUESTIONS), []);
});

test('deposit phase is Q1-10 with the required composition', () => {
  const deposit = QUESTIONS.filter(q => q.phase === 'deposit');
  assert.equal(deposit.length, 10);
  const count = k => deposit.filter(q => q.kind === k).length;
  assert.equal(count('crt'), 3);
  assert.equal(count('syllogism'), 3);
  assert.equal(count('sequence'), 2);
  assert.equal(count('spatial'), 2);
});

test('no deposit question uses nonsense vocabulary', () => {
  for (const q of QUESTIONS.filter(q => q.phase === 'deposit')) {
    assert.equal(q.nonsense, false, `Q${q.n} smuggles nonsense into the deposit`);
  }
});

test('every deposit question has exactly one correct answer', () => {
  for (const q of QUESTIONS.filter(q => q.phase === 'deposit')) {
    assert.ok(Number.isInteger(q.correct), `Q${q.n} has no correct answer`);
  }
});

test('recovery questions are fair and solvable', () => {
  for (const n of RECOVERY_QUESTIONS) {
    const q = questionByNumber(n);
    assert.equal(q.nonsense, false, `recovery Q${n} must not be nonsense`);
    assert.ok(Number.isInteger(q.correct), `recovery Q${n} must be solvable`);
  }
});

test('farce questions Q21-24 have no correct answer', () => {
  for (const q of QUESTIONS.filter(q => q.n >= 21)) {
    assert.equal(q.correct, null, `Q${q.n} should have no wrong answer`);
  }
});

test('validator rejects a set with the wrong option count', () => {
  const broken = QUESTIONS.map(q => ({ ...q }));
  broken[0] = { ...broken[0], options: ['only', 'three', 'options'] };
  assert.ok(validateQuestions(broken).some(e => e.includes('4 options')));
});

test('validator rejects a correct index out of range', () => {
  const broken = QUESTIONS.map(q => ({ ...q }));
  broken[0] = { ...broken[0], correct: 9 };
  assert.ok(validateQuestions(broken).some(e => e.includes('out of range')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/questions.test.js`
Expected: FAIL — `Cannot find module '../src/questions.js'`

- [ ] **Step 3: Write minimal implementation**

The provisional prompts below are deliberately plain. Plan 2 replaces every
`prompt` and `options` value; the `n`, `phase`, `kind`, `correct` and `nonsense`
fields are the contract and should survive that replacement unchanged.

```js
// src/questions.js
import { RECOVERY_QUESTIONS } from './clock.js';

export const PHASES = ['deposit', 'descent', 'farce'];
export const KINDS = ['crt', 'syllogism', 'sequence', 'spatial', 'affect'];

const q = (n, phase, kind, correct, nonsense = false) => ({
  n, phase, kind, nonsense, correct,
  prompt: `[provisional] Question ${n} (${kind}).`,
  options: ['[provisional A]', '[provisional B]', '[provisional C]', '[provisional D]']
});

export const QUESTIONS = [
  q(1, 'deposit', 'crt', 2), q(2, 'deposit', 'syllogism', 0),
  q(3, 'deposit', 'sequence', 1), q(4, 'deposit', 'crt', 3),
  q(5, 'deposit', 'syllogism', 2), q(6, 'deposit', 'spatial', 0),
  q(7, 'deposit', 'crt', 1), q(8, 'deposit', 'syllogism', 3),
  q(9, 'deposit', 'sequence', 2), q(10, 'deposit', 'spatial', 1),
  q(11, 'descent', 'syllogism', 0, true), q(12, 'descent', 'syllogism', 2, true),
  q(13, 'descent', 'syllogism', 1), q(14, 'descent', 'sequence', 3, true),
  q(15, 'descent', 'affect', null, true), q(16, 'descent', 'spatial', 0),
  q(17, 'descent', 'syllogism', 1, true), q(18, 'descent', 'affect', null, true),
  q(19, 'descent', 'sequence', 2), q(20, 'descent', 'affect', null, true),
  q(21, 'farce', 'affect', null, true), q(22, 'farce', 'affect', null, true),
  q(23, 'farce', 'affect', null, true), q(24, 'farce', 'affect', null, true)
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
    const label = `Q${item.n ?? i + 1}`;
    if (item.n !== i + 1) errors.push(`${label}: out of order`);
    if (!PHASES.includes(item.phase)) errors.push(`${label}: bad phase "${item.phase}"`);
    if (!KINDS.includes(item.kind)) errors.push(`${label}: bad kind "${item.kind}"`);
    if (!Array.isArray(item.options) || item.options.length !== 4) {
      errors.push(`${label}: must have exactly 4 options`);
    }
    if (item.correct !== null) {
      if (!Number.isInteger(item.correct) || item.correct < 0 || item.correct > 3) {
        errors.push(`${label}: correct index out of range`);
      }
    }
    if (item.n <= 10) {
      if (item.phase !== 'deposit') errors.push(`${label}: Q1-10 must be deposit phase`);
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

  const deposit = qs.filter(x => x.phase === 'deposit');
  const need = { crt: 3, syllogism: 3, sequence: 2, spatial: 2 };
  for (const [kind, wanted] of Object.entries(need)) {
    const got = deposit.filter(x => x.kind === kind).length;
    if (got !== wanted) errors.push(`deposit needs ${wanted} ${kind}, has ${got}`);
  }
  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/questions.test.js`
Expected: PASS — 9 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/questions.js test/questions.test.js
git commit -m "feat: question schema, composition rules, and provisional data set"
```

---

### Task 4: Transcript recorder

**Files:**
- Create: `src/transcript.js`, `test/transcript.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `createTranscript() -> transcript`, `recordAnswer(t, entry)`, `recordAmendment(t, n, choice)`, `amendmentCount(t) -> number`, `entryFor(t, n) -> entry|undefined`
- Entry shape: `{ n, choice: number|null, realElapsedMs, displayedElapsedMs, changes, trick: string|null }`
- Transcript shape: `{ entries: [], amendments: [], telemetry: { freezePointerDistance: 0 } }`

- [ ] **Step 1: Write the failing test**

```js
// test/transcript.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTranscript, recordAnswer, recordAmendment, amendmentCount, entryFor
} from '../src/transcript.js';

const entry = (n, over = {}) => ({
  n, choice: 1, realElapsedMs: 5000, displayedElapsedMs: 5000,
  changes: 0, trick: null, ...over
});

test('a new transcript is empty', () => {
  const t = createTranscript();
  assert.deepEqual(t.entries, []);
  assert.deepEqual(t.amendments, []);
  assert.equal(t.telemetry.freezePointerDistance, 0);
});

test('records answers and retrieves them by question number', () => {
  const t = createTranscript();
  recordAnswer(t, entry(1, { choice: 2 }));
  assert.equal(entryFor(t, 1).choice, 2);
});

test('re-recording the same question replaces it and increments changes', () => {
  const t = createTranscript();
  recordAnswer(t, entry(1, { choice: 0 }));
  recordAnswer(t, entry(1, { choice: 3 }));
  assert.equal(t.entries.length, 1);
  assert.equal(entryFor(t, 1).choice, 3);
  assert.equal(entryFor(t, 1).changes, 1);
});

test('re-recording the same choice does not count as a change', () => {
  const t = createTranscript();
  recordAnswer(t, entry(1, { choice: 2 }));
  recordAnswer(t, entry(1, { choice: 2 }));
  assert.equal(entryFor(t, 1).changes, 0);
});

test('amendments are recorded separately from answer changes', () => {
  const t = createTranscript();
  recordAnswer(t, entry(4, { choice: 0 }));
  recordAmendment(t, 4, 2);
  assert.equal(amendmentCount(t), 1);
  assert.equal(entryFor(t, 4).changes, 0);
  assert.deepEqual(t.amendments, [{ n: 4, choice: 2 }]);
});

test('amending the same row twice counts twice', () => {
  const t = createTranscript();
  recordAnswer(t, entry(4));
  recordAmendment(t, 4, 1);
  recordAmendment(t, 4, 3);
  assert.equal(amendmentCount(t), 2);
});

test('an unanswered question records a null choice', () => {
  const t = createTranscript();
  recordAnswer(t, entry(7, { choice: null }));
  assert.equal(entryFor(t, 7).choice, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/transcript.test.js`
Expected: FAIL — `Cannot find module '../src/transcript.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/transcript.js
export function createTranscript() {
  return { entries: [], amendments: [], telemetry: { freezePointerDistance: 0 } };
}

export function entryFor(t, n) {
  return t.entries.find(e => e.n === n);
}

export function recordAnswer(t, entry) {
  const existing = entryFor(t, n_of(entry));
  if (!existing) {
    t.entries.push({ ...entry, changes: entry.changes ?? 0 });
    return;
  }
  const changed = existing.choice !== entry.choice;
  Object.assign(existing, entry, {
    changes: existing.changes + (changed ? 1 : 0)
  });
}

export function recordAmendment(t, n, choice) {
  t.amendments.push({ n, choice });
}

export function amendmentCount(t) {
  return t.amendments.length;
}

function n_of(entry) {
  return entry.n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/transcript.test.js`
Expected: PASS — 7 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/transcript.js test/transcript.test.js
git commit -m "feat: transcript recorder tracking answers, changes and amendments"
```

---

### Task 5: Trick scheduler

Pure scheduling logic only. The DOM effects themselves come in Task 11.

**Files:**
- Create: `src/tricks.js`, `test/tricks.test.js`

**Interfaces:**
- Consumes: `RECOVERY_QUESTIONS` from `src/clock.js`, `mulberry32`/`shuffle` from `src/rng.js`
- Produces: `TRICK_NAMES` (6 strings), `FINALE_QUESTION` (23), `TRICK_COUNT` (5), `eligibleQuestions() -> number[]`, `scheduleTricks(rng) -> Map<number,string>`, `validateSchedule(map) -> string[]`

- [ ] **Step 1: Write the failing test**

```js
// test/tricks.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { RECOVERY_QUESTIONS } from '../src/clock.js';
import {
  TRICK_NAMES, TRICK_COUNT, FINALE_QUESTION,
  eligibleQuestions, scheduleTricks, validateSchedule
} from '../src/tricks.js';

const schedules = () =>
  Array.from({ length: 300 }, (_, i) => scheduleTricks(mulberry32(i)));

test('there are six named tricks', () => {
  assert.equal(TRICK_NAMES.length, 6);
  assert.equal(new Set(TRICK_NAMES).size, 6);
});

test('eligible questions exclude Q1-10, recovery questions and the finale', () => {
  const eligible = eligibleQuestions();
  for (const n of eligible) {
    assert.ok(n >= 11, `Q${n} is inside the deposit`);
    assert.ok(!RECOVERY_QUESTIONS.includes(n), `Q${n} is a recovery question`);
    assert.notEqual(n, FINALE_QUESTION, 'finale must not carry a bag trick');
  }
  assert.deepEqual(eligible, [11, 12, 14, 15, 17, 18, 20, 21, 22]);
});

test('Q24 is never sabotaged — the closing question stays gentle', () => {
  assert.ok(!eligibleQuestions().includes(24));
  for (const s of schedules()) assert.ok(!s.has(24));
});

test('every schedule places exactly TRICK_COUNT tricks', () => {
  for (const s of schedules()) assert.equal(s.size, TRICK_COUNT);
});

test('every generated schedule satisfies all invariants', () => {
  for (const s of schedules()) assert.deepEqual(validateSchedule(s), []);
});

test('no two tricks ever land on consecutive questions', () => {
  for (const s of schedules()) {
    const ns = [...s.keys()].sort((a, b) => a - b);
    for (let i = 1; i < ns.length; i++) {
      assert.ok(ns[i] - ns[i - 1] > 1, `consecutive at ${ns[i - 1]}/${ns[i]}`);
    }
  }
});

test('the same trick never fires twice in succession', () => {
  for (const s of schedules()) {
    const ordered = [...s.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1]);
    for (let i = 1; i < ordered.length; i++) {
      assert.notEqual(ordered[i], ordered[i - 1]);
    }
  }
});

test('scheduling is deterministic for a given seed', () => {
  const a = [...scheduleTricks(mulberry32(99)).entries()];
  const b = [...scheduleTricks(mulberry32(99)).entries()];
  assert.deepEqual(a, b);
});

test('validateSchedule catches a trick placed inside the deposit', () => {
  const bad = new Map([[5, 'deadClick']]);
  assert.ok(validateSchedule(bad).some(e => e.includes('before Q11')));
});

test('validateSchedule catches a trick on a recovery question', () => {
  const bad = new Map([[13, 'deadClick']]);
  assert.ok(validateSchedule(bad).some(e => e.includes('recovery')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/tricks.test.js`
Expected: FAIL — `Cannot find module '../src/tricks.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/tricks.js
import { RECOVERY_QUESTIONS } from './clock.js';
import { shuffle } from './rng.js';

export const TRICK_NAMES = [
  'deadClick', 'ghostSelection', 'doubleMark',
  'buttonFlinch', 'stickyAnswer', 'phantomLock'
];

export const FINALE_QUESTION = 23;
export const TRICK_COUNT = 5;

export const GENTLE_CLOSER = 24;

export function eligibleQuestions() {
  const out = [];
  for (let n = 11; n <= 24; n++) {
    if (RECOVERY_QUESTIONS.includes(n)) continue;
    if (n === FINALE_QUESTION) continue;
    if (n === GENTLE_CLOSER) continue;
    out.push(n);
  }
  return out;
}

export function scheduleTricks(rng) {
  const slots = pickNonAdjacent(eligibleQuestions(), TRICK_COUNT, rng);
  const schedule = new Map();
  let previous = null;
  for (const n of slots) {
    const choices = TRICK_NAMES.filter(t => t !== previous);
    const trick = shuffle(rng, choices)[0];
    schedule.set(n, trick);
    previous = trick;
  }
  return schedule;
}

function pickNonAdjacent(candidates, count, rng) {
  // Randomised greedy with restart. The eligible set admits at most 6
  // non-adjacent slots, so count=5 always succeeds within a few attempts.
  for (let attempt = 0; attempt < 200; attempt++) {
    const chosen = [];
    for (const n of shuffle(rng, candidates)) {
      if (chosen.some(m => Math.abs(m - n) <= 1)) continue;
      chosen.push(n);
      if (chosen.length === count) return chosen.sort((a, b) => a - b);
    }
  }
  throw new Error(`could not place ${count} non-adjacent tricks`);
}

export function validateSchedule(schedule) {
  const errors = [];
  const ns = [...schedule.keys()].sort((a, b) => a - b);

  for (const n of ns) {
    if (n < 11) errors.push(`Q${n}: no trick may fire before Q11`);
    if (RECOVERY_QUESTIONS.includes(n)) errors.push(`Q${n}: recovery questions are never sabotaged`);
    if (n === FINALE_QUESTION) errors.push(`Q${n}: the finale carries no bag trick`);
    if (!TRICK_NAMES.includes(schedule.get(n))) errors.push(`Q${n}: unknown trick`);
  }
  for (let i = 1; i < ns.length; i++) {
    if (ns[i] - ns[i - 1] <= 1) errors.push(`Q${ns[i - 1]}/Q${ns[i]}: consecutive tricks`);
  }
  const ordered = ns.map(n => schedule.get(n));
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i] === ordered[i - 1]) errors.push(`${ordered[i]}: repeated in succession`);
  }
  return errors;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/tricks.test.js`
Expected: PASS — 9 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/tricks.js test/tricks.test.js
git commit -m "feat: trick scheduler enforcing all six placement invariants"
```

---

### Task 6: Subject-name typo

**Files:**
- Create: `src/name.js`, `test/name.test.js`

**Interfaces:**
- Consumes: `pick` from `src/rng.js`
- Produces: `TYPO_KINDS`, `introduceTypo(name, rng) -> { original, display, kind }`, `displayNameFor(n, typo) -> string`
- `kind` is one of `'adjacent' | 'transpose' | 'double' | 'drop' | 'none'`

- [ ] **Step 1: Write the failing test**

```js
// test/name.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/name.test.js`
Expected: FAIL — `Cannot find module '../src/name.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/name.js
import { pick } from './rng.js';

export const TYPO_KINDS = ['adjacent', 'transpose', 'double', 'drop', 'none'];
export const TYPO_FROM_QUESTION = 11;

const ADJACENT = {
  a: 'sqwz', b: 'vgn', c: 'xdv', d: 'sfe', e: 'wrd', f: 'dgr', g: 'fhty',
  h: 'gjyu', i: 'uok', j: 'hkui', k: 'jlio', l: 'kop', m: 'nj', n: 'bmh',
  o: 'ipl', p: 'ol', q: 'wa', r: 'etf', s: 'adw', t: 'ryg', u: 'yih',
  v: 'cbg', w: 'qes', x: 'zcs', y: 'tuh', z: 'asx'
};

export function introduceTypo(name, rng) {
  const original = name ?? '';
  if (original.length < 3 || !/^[A-Za-z]+$/.test(original)) {
    return { original, display: original, kind: 'none' };
  }

  const kinds = ['adjacent', 'transpose', 'double', 'drop'];
  for (let attempt = 0; attempt < 20; attempt++) {
    const kind = pick(rng, kinds);
    const display = apply(kind, original, rng);
    if (display && display !== original) return { original, display, kind };
  }
  return { original, display: original, kind: 'none' };
}

function apply(kind, name, rng) {
  // Index 0 is never altered by ANY kind. Note transpose swaps (i-1, i), so it
  // needs i >= 2 or it would swap index 0 — the bug this comment once hid.
  const lo = kind === 'transpose' ? 2 : 1;
  if (name.length <= lo) return null;
  const i = lo + Math.floor(rng() * (name.length - lo));
  const chars = [...name];

  if (kind === 'adjacent') {
    const lower = chars[i].toLowerCase();
    const neighbours = ADJACENT[lower];
    if (!neighbours) return null;
    const replacement = pick(rng, [...neighbours]);
    chars[i] = chars[i] === chars[i].toUpperCase()
      ? replacement.toUpperCase() : replacement;
    return chars.join('');
  }
  if (kind === 'transpose') {
    if (chars[i] === chars[i - 1]) return null;
    [chars[i - 1], chars[i]] = [chars[i], chars[i - 1]];
    return chars.join('');
  }
  if (kind === 'double') {
    chars.splice(i, 0, chars[i]);
    return chars.join('');
  }
  if (kind === 'drop') {
    if (chars.length <= 3) return null;
    chars.splice(i, 1);
    return chars.join('');
  }
  return null;
}

export function displayNameFor(questionNumber, typo) {
  return questionNumber >= TYPO_FROM_QUESTION ? typo.display : typo.original;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/name.test.js`
Expected: PASS — 8 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/name.js test/name.test.js
git commit -m "feat: plausible subject-name typo introduced from Q11"
```

---

### Task 7: Falsification selection

**Files:**
- Create: `src/falsify.js`, `test/falsify.test.js`

**Interfaces:**
- Consumes: `QUESTIONS`/`questionByNumber` from `src/questions.js`, `shuffle` from `src/rng.js`, transcript from `src/transcript.js`
- Produces: `FALSIFICATION_COUNT` (3), `chooseFalsifications(transcript, rng) -> [{ n, shown }]`, `shownChoiceFor(n, choice, falsifications) -> number|null`
- `shown` is the option index the review screen displays instead of the real one

- [ ] **Step 1: Write the failing test**

```js
// test/falsify.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { createTranscript, recordAnswer } from '../src/transcript.js';
import { questionByNumber } from '../src/questions.js';
import {
  chooseFalsifications, shownChoiceFor, FALSIFICATION_COUNT
} from '../src/falsify.js';

function fullTranscript({ crtCorrect = true } = {}) {
  const t = createTranscript();
  for (let n = 1; n <= 24; n++) {
    const q = questionByNumber(n);
    let choice = q.correct ?? 0;
    if (q.kind === 'crt' && !crtCorrect) choice = (q.correct + 1) % 4;
    recordAnswer(t, {
      n, choice, realElapsedMs: 5000, displayedElapsedMs: 5000, changes: 0, trick: null
    });
  }
  return t;
}

test('exactly three rows are falsified', () => {
  for (let s = 0; s < 100; s++) {
    const f = chooseFalsifications(fullTranscript(), mulberry32(s));
    assert.equal(f.length, FALSIFICATION_COUNT);
  }
});

test('all falsified rows come from the deposit', () => {
  for (let s = 0; s < 100; s++) {
    for (const { n } of chooseFalsifications(fullTranscript(), mulberry32(s))) {
      assert.ok(n >= 1 && n <= 10, `Q${n} is outside the deposit`);
    }
  }
});

test('falsified rows are distinct', () => {
  for (let s = 0; s < 100; s++) {
    const f = chooseFalsifications(fullTranscript(), mulberry32(s));
    assert.equal(new Set(f.map(x => x.n)).size, FALSIFICATION_COUNT);
  }
});

test('the shown choice always differs from what was actually answered', () => {
  const t = fullTranscript();
  for (const { n, shown } of chooseFalsifications(t, mulberry32(4))) {
    assert.notEqual(shown, t.entries.find(e => e.n === n).choice);
  }
});

test('at least one falsified row is a correctly answered CRT item', () => {
  for (let s = 0; s < 100; s++) {
    const f = chooseFalsifications(fullTranscript(), mulberry32(s));
    const hit = f.some(({ n }) => questionByNumber(n).kind === 'crt');
    assert.ok(hit, `seed ${s} falsified no CRT item`);
  }
});

test('falls back gracefully when every CRT item was answered wrong', () => {
  const t = fullTranscript({ crtCorrect: false });
  const f = chooseFalsifications(t, mulberry32(1));
  assert.equal(f.length, FALSIFICATION_COUNT);
  for (const { n } of f) assert.ok(n <= 10);
});

test('handles a taker who answered nothing at all', () => {
  const t = createTranscript();
  for (let n = 1; n <= 24; n++) {
    recordAnswer(t, {
      n, choice: null, realElapsedMs: 45000, displayedElapsedMs: 45000, changes: 0, trick: null
    });
  }
  const f = chooseFalsifications(t, mulberry32(1));
  assert.equal(f.length, FALSIFICATION_COUNT);
  for (const { shown } of f) assert.ok(Number.isInteger(shown));
});

test('shownChoiceFor substitutes only falsified rows', () => {
  const falsifications = [{ n: 3, shown: 2 }];
  assert.equal(shownChoiceFor(3, 0, falsifications), 2);
  assert.equal(shownChoiceFor(4, 0, falsifications), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/falsify.test.js`
Expected: FAIL — `Cannot find module '../src/falsify.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/falsify.js
import { questionByNumber } from './questions.js';
import { shuffle } from './rng.js';

export const FALSIFICATION_COUNT = 3;

export function chooseFalsifications(transcript, rng) {
  const deposit = transcript.entries.filter(e => e.n >= 1 && e.n <= 10);

  const correctCrt = deposit.filter(e => {
    const q = questionByNumber(e.n);
    return q.kind === 'crt' && e.choice === q.correct;
  });
  const anyCorrect = deposit.filter(e => e.choice === questionByNumber(e.n).correct);

  // Priority: a CRT item they got right, then any item they got right,
  // then anything at all. Guarantees three rows for every taker.
  const seed = correctCrt.length ? correctCrt : (anyCorrect.length ? anyCorrect : deposit);
  const first = shuffle(rng, seed)[0];

  const rest = shuffle(rng, deposit.filter(e => e.n !== first.n))
    .slice(0, FALSIFICATION_COUNT - 1);

  return [first, ...rest]
    .sort((a, b) => a.n - b.n)
    .map(e => ({ n: e.n, shown: alternativeTo(e.choice, rng) }));
}

function alternativeTo(choice, rng) {
  const options = [0, 1, 2, 3].filter(i => i !== choice);
  return shuffle(rng, options)[0];
}

export function shownChoiceFor(n, actualChoice, falsifications) {
  const hit = falsifications.find(f => f.n === n);
  return hit ? hit.shown : actualChoice;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/falsify.test.js`
Expected: PASS — 8 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/falsify.js test/falsify.test.js
git commit -m "feat: transcript falsification with CRT-priority selection"
```

---

### Task 8: Scoring — the seven faculties

**Files:**
- Create: `src/scoring.js`, `test/scoring.test.js`

**Interfaces:**
- Consumes: `questionByNumber`/`QUESTIONS`, `amendmentCount`, `RECOVERY_QUESTIONS`, `shuffle`
- Produces: `FACULTIES` (array of `{ key, label }`), `computeFaculties(transcript, falsifications) -> Record<key, number>`, `headlineCentile(rng) -> 91..96`, `classify(faculties) -> string`, `AMENDMENT_PENALTY` (2), `preliminaryScore(base, amendments) -> number`, `SCORE_FLOOR` (0)

> **Spec §7 requirement:** sub-scores are computed from the **altered**
> transcript, not the real one. This is what makes the certificate internally
> consistent — the arithmetic checks out against a record the taker knows is
> false, so there is nothing to argue with. `computeFaculties` therefore takes
> `falsifications` and reads every choice through `shownChoiceFor`.

- [ ] **Step 1: Write the failing test**

```js
// test/scoring.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { createTranscript, recordAnswer, recordAmendment } from '../src/transcript.js';
import { questionByNumber } from '../src/questions.js';
import {
  FACULTIES, computeFaculties, headlineCentile, classify,
  AMENDMENT_PENALTY, preliminaryScore, SCORE_FLOOR
} from '../src/scoring.js';

function transcript() {
  const t = createTranscript();
  for (let n = 1; n <= 24; n++) {
    recordAnswer(t, {
      n, choice: questionByNumber(n).correct ?? 0,
      realElapsedMs: 4000 + n * 100, displayedElapsedMs: 6000, changes: n % 3, trick: null
    });
  }
  t.telemetry.freezePointerDistance = 1800;
  return t;
}

test('there are seven faculties with unique keys', () => {
  assert.equal(FACULTIES.length, 7);
  assert.equal(new Set(FACULTIES.map(f => f.key)).size, 7);
});

test('every faculty computes to an integer in 0-100', () => {
  const scores = computeFaculties(transcript());
  for (const { key } of FACULTIES) {
    const v = scores[key];
    assert.ok(Number.isInteger(v), `${key} is not an integer: ${v}`);
    assert.ok(v >= 0 && v <= 100, `${key} out of range: ${v}`);
  }
});

test('scoring is a pure function of the transcript', () => {
  assert.deepEqual(computeFaculties(transcript()), computeFaculties(transcript()));
});

test('faculties are computed from the ALTERED transcript, not the real one', () => {
  const t = transcript();
  const honest = computeFaculties(t, []);
  const falsified = computeFaculties(t, [
    { n: 2, shown: 3 }, { n: 5, shown: 3 }, { n: 8, shown: 3 }
  ]);
  assert.notDeepEqual(honest, falsified,
    'the certificate must be consistent with the falsified record');
});

test('semantic satiation ignores the taker entirely', () => {
  const a = transcript();
  const b = transcript();
  b.entries.forEach(e => { e.choice = 0; e.realElapsedMs = 44000; e.changes = 9; });
  assert.equal(
    computeFaculties(a).semanticSatiation,
    computeFaculties(b).semanticSatiation
  );
});

test('response consistency falls as amendments rise', () => {
  const calm = transcript();
  const anxious = transcript();
  for (let i = 0; i < 6; i++) recordAmendment(anxious, 2, 1);
  assert.ok(
    computeFaculties(anxious).responseConsistency <
    computeFaculties(calm).responseConsistency
  );
});

test('composure falls as panic distance rises', () => {
  const still = transcript(); still.telemetry.freezePointerDistance = 0;
  const frantic = transcript(); frantic.telemetry.freezePointerDistance = 20000;
  assert.ok(computeFaculties(frantic).composure < computeFaculties(still).composure);
});

test('the headline centile is always flattering', () => {
  for (let s = 0; s < 300; s++) {
    const c = headlineCentile(mulberry32(s));
    assert.ok(c >= 91 && c <= 96, `centile ${c} is not flattering`);
  }
});

test('classification is clinical and derived from the extreme faculties', () => {
  const label = classify(computeFaculties(transcript()));
  assert.match(label, /^PROFILE 4-B — [A-Z]+ [A-Z]+$/, `got "${label}"`);
});

test('each amendment costs exactly two points', () => {
  assert.equal(preliminaryScore(100, 0), 100);
  assert.equal(preliminaryScore(100, 1), 100 - AMENDMENT_PENALTY);
  assert.equal(preliminaryScore(100, 3), 94);
});

test('the score never falls below the floor', () => {
  assert.equal(preliminaryScore(4, 50), SCORE_FLOOR);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/scoring.test.js`
Expected: FAIL — `Cannot find module '../src/scoring.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/scoring.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/scoring.test.js`
Expected: PASS — 10 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/scoring.js test/scoring.test.js
git commit -m "feat: seven-faculty scoring, flattering centile, clinical classification"
```

---

### Task 9: Statement pools and report assembly

**Files:**
- Create: `src/statements.js`, `src/report.js`, `test/report.test.js`

**Interfaces:**
- Consumes: `FACULTIES`/`classify`, `shuffle`, transcript
- Produces: `BARNUM` (24 strings), `INSINUATION_TIERS` (4 arrays of 4), `drawStatements(rng) -> { barnum: string[10], insinuations: string[4] }`, `buildReport(input) -> report`
- `buildReport` input: `{ faculties, centile, classification, displayName, amendmentCount, rng }`
- `report` shape: `{ header, summary: string[], interpretation: [{ facultyKey, label, score, paragraph }], observations: string[], recommendations: string[], closer }`

- [ ] **Step 1: Write the failing test**

```js
// test/report.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { BARNUM, INSINUATION_TIERS } from '../src/statements.js';
import { drawStatements, buildReport } from '../src/report.js';
import { FACULTIES } from '../src/scoring.js';

const faculties = Object.fromEntries(FACULTIES.map((f, i) => [f.key, 40 + i * 8]));
const build = seed => buildReport({
  faculties, centile: 94, classification: 'PROFILE 4-B — DEFERRED ANALYTIC',
  displayName: 'DAVDI', amendmentCount: 0, rng: mulberry32(seed)
});

test('the Barnum pool holds 24 statements', () => {
  assert.equal(BARNUM.length, 24);
  assert.equal(new Set(BARNUM).size, 24);
});

test('there are four insinuation tiers of four', () => {
  assert.equal(INSINUATION_TIERS.length, 4);
  for (const tier of INSINUATION_TIERS) assert.equal(tier.length, 4);
});

test('a draw takes ten Barnum statements and exactly four insinuations', () => {
  for (let s = 0; s < 100; s++) {
    const d = drawStatements(mulberry32(s));
    assert.equal(d.barnum.length, 10);
    assert.equal(d.insinuations.length, 4);
  }
});

test('no statement repeats within a single certificate', () => {
  for (let s = 0; s < 100; s++) {
    const d = drawStatements(mulberry32(s));
    const all = [...d.barnum, ...d.insinuations];
    assert.equal(new Set(all).size, all.length);
  }
});

test('insinuations are drawn one per tier, in tier order', () => {
  for (let s = 0; s < 100; s++) {
    const { insinuations } = drawStatements(mulberry32(s));
    insinuations.forEach((text, i) => {
      assert.ok(INSINUATION_TIERS[i].includes(text), `slot ${i} came from the wrong tier`);
    });
  }
});

test('the Summary block contains no insinuation', () => {
  for (let s = 0; s < 100; s++) {
    const r = build(s);
    const tiers = INSINUATION_TIERS.flat();
    for (const line of r.summary) {
      assert.ok(!tiers.includes(line), 'an insinuation leaked into the Summary');
    }
  }
});

test('the report has one interpretation paragraph per faculty', () => {
  const r = build(1);
  assert.equal(r.interpretation.length, FACULTIES.length);
  assert.deepEqual(r.interpretation.map(p => p.facultyKey), FACULTIES.map(f => f.key));
});

test('the report closes on a Barnum statement, never an insinuation', () => {
  for (let s = 0; s < 100; s++) {
    const r = build(s);
    assert.ok(BARNUM.includes(r.closer), 'the closer must be unimpeachable');
  }
});

test('the header carries the corrupted name', () => {
  assert.equal(build(1).header.subject, 'DAVDI');
});

test('observations report deference when nothing was amended', () => {
  const r = buildReport({
    faculties, centile: 94, classification: 'X', displayName: 'D',
    amendmentCount: 0, rng: mulberry32(2)
  });
  assert.ok(r.observations.some(o => o.includes('WITHOUT AMENDMENT')));
});

test('observations report discomfort when rows were amended', () => {
  const r = buildReport({
    faculties, centile: 94, classification: 'X', displayName: 'D',
    amendmentCount: 3, rng: mulberry32(2)
  });
  assert.ok(r.observations.some(o => o.includes('POST-HOC REVISION ATTEMPTS: 3')));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/report.test.js`
Expected: FAIL — `Cannot find module '../src/statements.js'`

- [ ] **Step 3: Write minimal implementation**

Plan 2 replaces every string in `src/statements.js`. The counts (24 / 4×4) and
the tier ordering are the contract.

```js
// src/statements.js
// Barnum statements in assessment-report register: third person, hedged,
// universally true, faintly condescending.
export const BARNUM = [
  'The subject presents as markedly self-critical in a manner not typically apparent to observers.',
  'Considerable unused capacity is evident and has not been turned to advantage.',
  'The subject prefers a degree of variety and becomes dissatisfied when constrained.',
  'Periods of extroversion alternate with periods of guardedness; neither predominates.',
  'The subject has found it unwise to be entirely frank in revealing themselves to others.',
  'Some stated aspirations are, on examination, unlikely to be realised.',
  'Independence of judgement is valued, though external confirmation is sought more often than acknowledged.',
  'At times the subject experiences serious doubt as to whether the correct decision was made.',
  'Security features prominently among the subject\'s stated priorities.',
  'The subject is capable of compensating for known weaknesses and generally does so.',
  'Disciplined and controlled outwardly, the subject tends toward worry and insecurity inwardly.',
  'The subject occasionally questions whether others regard them as favourably as they would wish.',
  'Change is welcomed in principle and resisted in practice.',
  'The subject does not accept the statements of others without satisfactory evidence.',
  'A tendency toward sociability is moderated by a preference for solitary recovery.',
  'The subject has, on occasion, been more generous with their time than was warranted.',
  'Certain memories are revisited more frequently than the subject would report if asked.',
  'The subject is inclined to attribute their successes to circumstance and their failures to themselves.',
  'Plans are formed with enthusiasm and executed with diminishing conviction.',
  'The subject values competence in others and is quietly impatient with its absence.',
  'A degree of dissatisfaction persists that the subject has not been able to locate precisely.',
  'The subject is more affected by minor discourtesies than they would care to admit.',
  'Decisions once made are rarely revisited aloud.',
  'The subject possesses reserves of resolve that emerge chiefly under pressure.'
];

// Four tiers of four. Tier 1 barely off; tier 4 is the Recommendations closer.
// Criterion for every entry: privately near-universal, publicly unadmitted.
export const INSINUATION_TIERS = [
  [
    'Subjects in this band commonly reread messages they have already sent.',
    'The subject is likely to have rehearsed this assessment before beginning it.',
    'Photographs of the subject are, in the subject\'s estimation, rarely representative.',
    'The subject checks whether the door is locked after having locked it.'
  ],
  [
    'Rehearsal of unresolved arguments during periods of low cognitive demand is characteristic of this profile.',
    'The subject conducts portions of their reading aloud when unobserved.',
    'This profile is associated with prolonged examination of one\'s own reflection in vehicle windows.',
    'The subject has composed correspondence they did not send and did not delete.'
  ],
  [
    'There is a moderate likelihood the subject has licked their own forearm and smelled it.',
    'The subject has, at least once, eaten something after reconsidering whether it had spoiled.',
    'Examination of tissues following use is consistent with this profile.',
    'The subject has practised facial expressions with no intention of using them.'
  ],
  [
    'The subject is advised that the practice of smelling one\'s own clothing to determine whether it requires laundering is not diagnostic.',
    'It is recommended the subject discontinue conducting imagined conversations aloud while alone.',
    'The subject may wish to reduce the frequency with which they inspect their own teeth.',
    'No accommodation is required, though the subject would benefit from ceasing to narrate their own activities internally.'
  ]
];
```

```js
// src/report.js
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
```

> **Pool arithmetic — verify this before running the tests.** `take()` is called
> 2× in the summary, 5× across the seven interpretation paragraphs (two of the
> seven carry insinuations instead), and 1× for the closer. **Total 8 draws
> against a pool of 10**, leaving two spare. This matches spec §8's "24 Barnum
> statements, 10 shown". If a future edit pushes draws past 10, `take()` returns
> `undefined` and `test/integration.test.js` fails loudly on it.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/report.test.js`
Expected: PASS — 11 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/statements.js src/report.js test/report.test.js
git commit -m "feat: statement pools and certificate assembly with tiered escalation"
```

---

### Task 10: DOM shell, form header and question screen

**Files:**
- Create: `src/ui/dom.js`, `src/ui/screens.js`
- Modify: `index.html` (styles), `src/main.js`

**Interfaces:**
- Consumes: everything above
- Produces: `el(tag, props, children) -> Element`, `renderLanding(root, onStart)`, `renderQuestion(root, { question, displayName, onChoose })`, `renderHeader(displayName) -> Element`, `startTimer({ n, onTick, onExpire }) -> stop()`

- [ ] **Step 1: Write the failing test**

DOM rendering is verified by hand; the testable part is the timer driver, which
is pure given an injected clock source.

```js
// test/timer-driver.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimerDriver } from '../src/ui/timer-driver.js';

test('the driver reports a 45s face at the moment of start', () => {
  let now = 0;
  const d = createTimerDriver(24, () => now);
  assert.equal(d.displayedRemainingMs(), 45000);
});

test('the driver reports expiry at the real duration, not the displayed one', () => {
  let now = 0;
  const d = createTimerDriver(24, () => now);
  now = 19999;
  assert.equal(d.expired(), false);
  now = 20000;
  assert.equal(d.expired(), true);
  assert.equal(d.displayedRemainingMs(), 0);
});

test('the driver can be frozen and resumed without losing elapsed time', () => {
  let now = 0;
  const d = createTimerDriver(24, () => now);
  now = 5000; d.freeze();
  now = 30000; d.resume();
  now = 31000;
  assert.equal(d.expired(), false, 'frozen time must not count against the taker');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/timer-driver.test.js`
Expected: FAIL — `Cannot find module '../src/ui/timer-driver.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/ui/timer-driver.js
import { realDurationMs, displayedRemainingMs } from '../clock.js';

export function createTimerDriver(n, now = () => Date.now()) {
  const started = now();
  let frozenAt = null;
  let frozenTotal = 0;

  const elapsed = () => {
    const raw = (frozenAt === null ? now() : frozenAt) - started;
    return raw - frozenTotal;
  };

  return {
    elapsedMs: elapsed,
    displayedRemainingMs: () => displayedRemainingMs(n, elapsed()),
    expired: () => elapsed() >= realDurationMs(n),
    freeze() { if (frozenAt === null) frozenAt = now(); },
    resume() {
      if (frozenAt === null) return;
      frozenTotal += now() - frozenAt;
      frozenAt = null;
    }
  };
}
```

```js
// src/ui/dom.js
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
}

export function clear(root) { root.replaceChildren(); }
```

```js
// src/ui/screens.js
import { el, clear } from './dom.js';
import { createTimerDriver } from './timer-driver.js';

export function renderHeader(displayName) {
  return el('div', { class: 'form-header' }, [
    el('div', { class: 'field' }, [
      el('span', { class: 'label', text: 'SUBJECT' }),
      el('span', { class: 'value', text: displayName || '—' })
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'label', text: 'FORM' }),
      el('span', { class: 'value', text: '4-B' })
    ])
  ]);
}

export function renderLanding(root, onStart) {
  clear(root);
  const input = el('input', { class: 'name-input', maxlength: '40', autocomplete: 'off' });
  root.append(
    el('h1', { class: 'title', text: 'Reflective Aptitude Inventory' }),
    el('p', { class: 'subtitle', text: 'Cavendish–Pettigrew · Form 4-B' }),
    el('p', { text: 'Twenty-four items. Each is timed. Please answer promptly and without assistance.' }),
    el('label', { class: 'label', text: 'SUBJECT NAME' }),
    input,
    el('button', { class: 'begin', text: 'BEGIN', onclick: () => onStart(input.value.trim()) })
  );
  input.focus();
}

export function renderQuestion(root, { question, displayName, onChoose, onExpire }) {
  clear(root);
  const driver = createTimerDriver(question.n);
  const digits = el('span', { class: 'timer-digits' });
  const bar = el('div', { class: 'timer-bar-fill' });

  const options = question.options.map((text, i) =>
    el('button', {
      class: 'option', 'data-index': String(i),
      onclick: () => onChoose(i, driver.elapsedMs())
    }, [
      el('span', { class: 'option-letter', text: 'ABCD'[i] }),
      el('span', { class: 'option-text', text })
    ])
  );

  root.append(
    renderHeader(displayName),
    el('div', { class: 'question-bar' }, [
      el('span', { class: 'question-number', text: `Question ${question.n} of 24` }),
      el('span', { class: 'timer' }, [bar, digits])
    ]),
    el('p', { class: 'prompt', text: question.prompt }),
    el('div', { class: 'options' }, options)
  );

  const tick = () => {
    const remaining = driver.displayedRemainingMs();
    const s = Math.ceil(remaining / 1000);
    digits.textContent = `0:${String(s).padStart(2, '0')}`;
    bar.style.width = `${(remaining / 45000) * 100}%`;
    if (driver.expired()) { stop(); onExpire(driver.elapsedMs()); return; }
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);
  const stop = () => cancelAnimationFrame(raf);

  return { driver, stop, optionElements: options };
}
```

Add to `index.html` styles:

```css
.form-header {
  display: flex; gap: 2rem; border-bottom: 1px solid var(--blue);
  padding-bottom: .5rem; margin-bottom: 2rem;
}
.label {
  font-family: var(--mono); font-size: .68rem; letter-spacing: .14em;
  color: var(--blue); text-transform: uppercase;
}
.field { display: flex; gap: .6rem; align-items: baseline; }
.field .value { font-family: var(--mono); font-size: .82rem; }
.question-bar {
  display: flex; justify-content: space-between; align-items: center;
  font-family: var(--mono); font-size: .78rem; margin-bottom: 1.5rem;
}
.timer { display: flex; align-items: center; gap: .6rem; }
.timer-bar-fill { height: 1px; width: 100%; background: var(--ink); min-width: 60px; }
.prompt { font-size: 1.06rem; margin: 0 0 2rem; white-space: pre-line; }
.options { display: flex; flex-direction: column; gap: .5rem; }
.option {
  display: flex; gap: .8rem; align-items: baseline; text-align: left;
  font: inherit; color: inherit; background: transparent;
  border: 1px solid var(--ink); padding: .7rem .9rem; cursor: pointer;
}
.option[aria-pressed="true"] { background: var(--ink); color: var(--paper); }
.option-letter { font-family: var(--mono); font-size: .78rem; }
.name-input {
  font: inherit; background: transparent; border: 0; border-bottom: 1px solid var(--ink);
  padding: .3rem 0; width: 100%; margin-bottom: 2rem;
}
.begin {
  font-family: var(--mono); font-size: .78rem; letter-spacing: .14em;
  background: var(--ink); color: var(--paper); border: 0; padding: .7rem 1.6rem; cursor: pointer;
}
.title { font-size: 1.5rem; font-weight: normal; margin: 0 0 .2rem; }
.subtitle { font-family: var(--mono); font-size: .78rem; color: var(--blue); margin: 0 0 2rem; }
```

Add corner registration marks:

```css
body::before, body::after {
  content: ''; position: fixed; width: 14px; height: 14px; pointer-events: none;
  border-color: var(--blue); border-style: solid;
}
body::before { top: 14px; left: 14px; border-width: 1px 0 0 1px; }
body::after { bottom: 14px; right: 14px; border-width: 0 1px 1px 0; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/timer-driver.test.js`
Expected: PASS — 3 tests passing

Then open `index.html` in a browser: the landing screen accepts a name and the
first question renders with a draining hairline timer.

- [ ] **Step 5: Commit**

```bash
git add src/ui/ index.html test/timer-driver.test.js
git commit -m "feat: form shell, question screen and freezable timer driver"
```

---

### Task 11: DOM trick effects and touch variants

**Files:**
- Create: `src/ui/effects.js`, `test/effects.test.js`
- Modify: `src/ui/screens.js` (accept a `trick` parameter)

**Interfaces:**
- Consumes: `TRICK_NAMES` from `src/tricks.js`
- Produces: `applyTrick(trickName, { optionElements, onChoose, rng, isTouch }) -> detach()`, `TOUCH_SUBSTITUTIONS`, `effectiveTrick(name, isTouch) -> string`

- [ ] **Step 1: Write the failing test**

```js
// test/effects.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRICK_NAMES } from '../src/tricks.js';
import { TOUCH_SUBSTITUTIONS, effectiveTrick } from '../src/ui/effects.js';

test('every trick declares whether it survives on touch', () => {
  for (const name of TRICK_NAMES) {
    assert.ok(name in TOUCH_SUBSTITUTIONS, `${name} has no touch policy`);
  }
});

test('cursor-dependent tricks are substituted on touch, never dropped', () => {
  for (const name of ['buttonFlinch', 'phantomLock']) {
    const sub = effectiveTrick(name, true);
    assert.notEqual(sub, name, `${name} must be substituted on touch`);
    assert.ok(sub, `${name} must not be dropped on touch`);
  }
});

test('pointer-agnostic tricks are unchanged on touch', () => {
  for (const name of ['deadClick', 'ghostSelection', 'doubleMark', 'stickyAnswer']) {
    assert.equal(effectiveTrick(name, true), name);
  }
});

test('every trick maps to a defined effective form on both pointer types', () => {
  for (const name of TRICK_NAMES) {
    assert.ok(effectiveTrick(name, false), `${name} has no mouse form`);
    assert.ok(effectiveTrick(name, true), `${name} has no touch form`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/effects.test.js`
Expected: FAIL — `Cannot find module '../src/ui/effects.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/ui/effects.js
// Touch has no hover and no cursor, so flinch and phantom-lock are replaced
// rather than skipped — mobile takers must meet the same number of tricks.
export const TOUCH_SUBSTITUTIONS = {
  deadClick: 'deadClick',
  ghostSelection: 'ghostSelection',
  doubleMark: 'doubleMark',
  stickyAnswer: 'stickyAnswer',
  buttonFlinch: 'scrollSteal',   // the tap is consumed as a scroll gesture
  phantomLock: 'firmPress'       // the option demands a longer press
};

export function effectiveTrick(name, isTouch) {
  return isTouch ? TOUCH_SUBSTITUTIONS[name] : name;
}

// CONTRACT: every effect below must leave a route to the intended answer —
// spec §5, scheduling invariant 6. Enforced by construction: each effect either
// delays input or reroutes it through onChoose, never removes the option.
export function applyTrick(name, { optionElements, onChoose, rng, isTouch = false }) {
  const trick = effectiveTrick(name, isTouch);
  const cleanups = [];

  const onEach = (type, handler, opts) => {
    for (const node of optionElements) {
      node.addEventListener(type, handler, opts);
      cleanups.push(() => node.removeEventListener(type, handler, opts));
    }
  };

  if (trick === 'deadClick') {
    let swallowed = 0;
    onEach('click', e => {
      if (swallowed < 2 && rng() < 0.8) { swallowed++; e.stopImmediatePropagation(); e.preventDefault(); }
    }, true);
  }

  if (trick === 'ghostSelection') {
    onEach('click', e => {
      e.stopImmediatePropagation(); e.preventDefault();
      const i = Number(e.currentTarget.dataset.index);
      onChoose((i + 1) % optionElements.length);
    }, true);
  }

  if (trick === 'doubleMark') {
    onEach('click', e => {
      const i = Number(e.currentTarget.dataset.index);
      const ghost = optionElements[(i + 2) % optionElements.length];
      ghost.setAttribute('aria-pressed', 'true');
      setTimeout(() => ghost.setAttribute('aria-pressed', 'false'), 1400);
    });
  }

  if (trick === 'buttonFlinch') {
    onEach('mousedown', e => {
      const node = e.currentTarget;
      node.style.transform = 'translate(3px, -3px)';
      setTimeout(() => { node.style.transform = ''; }, 220);
    });
  }

  if (trick === 'stickyAnswer') {
    let previous = null;
    onEach('click', e => {
      const i = Number(e.currentTarget.dataset.index);
      const revertTo = previous;
      previous = i;
      if (revertTo === null) return;
      setTimeout(() => onChoose(revertTo), 1000);
    });
  }

  if (trick === 'phantomLock') {
    onEach('mouseenter', e => {
      const node = e.currentTarget;
      if (node.dataset.locked) return;
      node.dataset.locked = '1';
      node.classList.add('phantom-locked');
      setTimeout(() => { node.classList.remove('phantom-locked'); delete node.dataset.locked; }, 900);
    });
  }

  if (trick === 'scrollSteal') {
    onEach('touchstart', e => { e.preventDefault(); window.scrollBy(0, 2); }, { passive: false });
  }

  if (trick === 'firmPress') {
    onEach('touchstart', e => {
      const node = e.currentTarget;
      const started = Date.now();
      const release = () => {
        if (Date.now() - started < 500) { e.preventDefault(); }
        node.removeEventListener('touchend', release);
      };
      node.addEventListener('touchend', release);
    }, { passive: false });
  }

  return () => cleanups.forEach(fn => fn());
}
```

Add to `index.html`:

```css
.option.phantom-locked { opacity: .45; pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .option { transform: none !important; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/effects.test.js`
Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/ui/effects.js test/effects.test.js index.html
git commit -m "feat: six DOM trick effects with touch substitutions"
```

---

### Task 12: Synthetic cursor and the Q23 finale

**Files:**
- Create: `src/ui/cursor.js`, `test/cursor.test.js`
- Modify: `index.html` (cursor styles)

**Interfaces:**
- Consumes: nothing
- Produces: `createSyntheticCursor(root) -> { attach, detach, freeze, fling, position, distanceTravelled }`, `runFinale({ cursor, timerDriver, onDone })`, `FINALE_FREEZE_MS` (2200), `shouldRunFinale() -> boolean`

- [ ] **Step 1: Write the failing test**

```js
// test/cursor.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flingPath, accumulateDistance, FINALE_FREEZE_MS } from '../src/ui/cursor.js';

test('the freeze lasts long enough to be noticed but not to enrage', () => {
  assert.ok(FINALE_FREEZE_MS >= 1500 && FINALE_FREEZE_MS <= 3000);
});

test('the fling path stays inside the viewport bounds', () => {
  const path = flingPath({ x: 100, y: 100 }, { width: 800, height: 600 }, 60);
  for (const p of path) {
    assert.ok(p.x >= 0 && p.x <= 800, `x out of bounds: ${p.x}`);
    assert.ok(p.y >= 0 && p.y <= 600, `y out of bounds: ${p.y}`);
  }
});

test('the fling path returns to a usable resting position', () => {
  const path = flingPath({ x: 100, y: 100 }, { width: 800, height: 600 }, 60);
  const last = path[path.length - 1];
  assert.ok(last.x > 40 && last.x < 760, 'must not rest against an edge');
  assert.ok(last.y > 40 && last.y < 560, 'must not rest against an edge');
});

test('distance accumulates across pointer samples', () => {
  const d = accumulateDistance([{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 8 }]);
  assert.equal(d, 9);
});

test('distance of a stationary pointer is zero', () => {
  assert.equal(accumulateDistance([{ x: 5, y: 5 }, { x: 5, y: 5 }]), 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cursor.test.js`
Expected: FAIL — `Cannot find module '../src/ui/cursor.js'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/ui/cursor.js
export const FINALE_FREEZE_MS = 2200;

export function accumulateDistance(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return total;
}

// A decaying spiral that always lands somewhere clickable.
export function flingPath(from, viewport, steps) {
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  const path = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const decay = 1 - t;
    const angle = t * Math.PI * 6;
    const radius = Math.min(viewport.width, viewport.height) * 0.35 * decay;
    const x = cx + Math.cos(angle) * radius + (from.x - cx) * decay * decay;
    const y = cy + Math.sin(angle) * radius + (from.y - cy) * decay * decay;
    path.push({
      x: Math.max(48, Math.min(viewport.width - 48, x)),
      y: Math.max(48, Math.min(viewport.height - 48, y))
    });
  }
  return path;
}

export function shouldRunFinale() {
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
      && window.matchMedia('(pointer: fine)').matches;
}

export function createSyntheticCursor(root) {
  const node = document.createElement('div');
  node.className = 'synthetic-cursor';
  let pos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let frozen = false;
  let samples = [];

  const move = e => {
    if (frozen) { samples.push({ x: e.clientX, y: e.clientY }); return; }
    pos = { x: e.clientX, y: e.clientY };
    paint();
  };
  const paint = () => { node.style.transform = `translate(${pos.x}px, ${pos.y}px)`; };

  return {
    attach() {
      root.append(node);
      document.body.classList.add('cursor-hidden');
      window.addEventListener('mousemove', move);
      paint();
    },
    detach() {
      node.remove();
      document.body.classList.remove('cursor-hidden');
      window.removeEventListener('mousemove', move);
    },
    freeze() { frozen = true; samples = []; },
    thaw() { frozen = false; },
    distanceTravelled() { return accumulateDistance(samples); },
    position() { return { ...pos }; },
    async fling() {
      const path = flingPath(pos, { width: window.innerWidth, height: window.innerHeight }, 72);
      for (const p of path) {
        pos = p; paint();
        await new Promise(r => setTimeout(r, 16));
      }
      frozen = false;
    }
  };
}

export async function runFinale({ cursor, timerDriver, onDistance }) {
  timerDriver.freeze();
  cursor.attach();
  cursor.freeze();
  await new Promise(r => setTimeout(r, FINALE_FREEZE_MS));
  onDistance(cursor.distanceTravelled());
  await cursor.fling();
  cursor.detach();
  timerDriver.resume();
}
```

Add to `index.html`:

```css
body.cursor-hidden, body.cursor-hidden * { cursor: none !important; }
.synthetic-cursor {
  position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 9999;
  pointer-events: none;
  border-left: 9px solid var(--ink);
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
}
```

Wire the Esc escape hatch in `src/main.js`:

```js
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.body.classList.remove('cursor-hidden');
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cursor.test.js`
Expected: PASS — 5 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/ui/cursor.js test/cursor.test.js index.html src/main.js
git commit -m "feat: synthetic cursor and the Q23 finale with reduced-motion guard"
```

---

### Task 13: Review screen, amendment and the correction stamp

**Files:**
- Modify: `src/ui/screens.js`, `index.html`
- Create: `test/review.test.js`

**Interfaces:**
- Consumes: `chooseFalsifications`/`shownChoiceFor`, `preliminaryScore`/`AMENDMENT_PENALTY`, `recordAmendment`
- Produces: `renderReview(root, { transcript, falsifications, displayName, baseScore, onContinue })`, `reviewRows(transcript, falsifications) -> [{ n, shown, amended }]`

- [ ] **Step 1: Write the failing test**

```js
// test/review.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { createTranscript, recordAnswer, recordAmendment, amendmentCount } from '../src/transcript.js';
import { chooseFalsifications } from '../src/falsify.js';
import { preliminaryScore, AMENDMENT_PENALTY } from '../src/scoring.js';
import { reviewRows } from '../src/ui/screens.js';

function transcript() {
  const t = createTranscript();
  for (let n = 1; n <= 24; n++) {
    recordAnswer(t, {
      n, choice: 1, realElapsedMs: 5000, displayedElapsedMs: 9000, changes: 0, trick: null
    });
  }
  return t;
}

test('the review lists all 24 rows', () => {
  const t = transcript();
  const rows = reviewRows(t, chooseFalsifications(t, mulberry32(1)));
  assert.equal(rows.length, 24);
});

test('exactly three rows display something other than what was answered', () => {
  const t = transcript();
  const f = chooseFalsifications(t, mulberry32(1));
  const rows = reviewRows(t, f);
  const wrong = rows.filter(r => r.shown !== 1);
  assert.equal(wrong.length, 3);
});

test('the review reports displayed time, not real time', () => {
  const t = transcript();
  const rows = reviewRows(t, chooseFalsifications(t, mulberry32(1)));
  assert.equal(rows[23].displayedElapsedMs, 9000);
});

test('each amendment costs two points regardless of correctness', () => {
  const t = transcript();
  recordAmendment(t, 2, 0);
  recordAmendment(t, 3, 1);
  assert.equal(preliminaryScore(80, amendmentCount(t)), 80 - 2 * AMENDMENT_PENALTY);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/review.test.js`
Expected: FAIL — `reviewRows is not exported`

- [ ] **Step 3: Write minimal implementation**

Append to `src/ui/screens.js`:

```js
import { shownChoiceFor } from '../falsify.js';
import { recordAmendment, amendmentCount } from '../transcript.js';
import { preliminaryScore, AMENDMENT_PENALTY } from '../scoring.js';
import { questionByNumber } from '../questions.js';

export function reviewRows(transcript, falsifications) {
  return transcript.entries
    .slice()
    .sort((a, b) => a.n - b.n)
    .map(e => ({
      n: e.n,
      shown: shownChoiceFor(e.n, e.choice, falsifications),
      displayedElapsedMs: e.displayedElapsedMs,
      amended: false
    }));
}

export function renderReview(root, { transcript, falsifications, displayName, baseScore, onContinue }) {
  clear(root);
  const rows = reviewRows(transcript, falsifications);
  const scoreValue = el('span', { class: 'score-value', text: String(baseScore) });

  const refreshScore = () => {
    scoreValue.textContent = String(preliminaryScore(baseScore, amendmentCount(transcript)));
  };

  const rowNodes = rows.map(row => {
    const q = questionByNumber(row.n);
    const answerCell = el('span', { class: 'answer', text: 'ABCD'[row.shown] ?? '—' });
    const stamp = el('span', { class: 'correction' });

    const edit = el('button', {
      class: 'edit', text: 'EDIT',
      onclick: () => {
        const next = (row.shown + 1) % 4;
        row.shown = next;
        answerCell.textContent = 'ABCD'[next];
        recordAmendment(transcript, row.n, next);
        stamp.textContent = `−${AMENDMENT_PENALTY}`;
        stamp.classList.remove('punch');
        void stamp.offsetWidth;          // restart the animation
        stamp.classList.add('punch');
        refreshScore();
      }
    });

    return el('div', { class: 'review-row' }, [
      el('span', { class: 'review-n', text: `Q${row.n}` }),
      el('span', { class: 'review-prompt', text: q.prompt }),
      answerCell,
      el('span', { class: 'review-time', text: `0:${String(Math.round(row.displayedElapsedMs / 1000)).padStart(2, '0')}` }),
      edit,
      stamp
    ]);
  });

  root.append(
    renderHeader(displayName),                     // no EDIT control on the name
    el('h2', { class: 'section-title', text: 'REVIEW OF RESPONSES' }),
    el('p', { text: 'Confirm the record below before your results are compiled.' }),
    el('div', { class: 'score-line' }, [
      el('span', { class: 'label', text: 'PRELIMINARY SCORE' }), scoreValue
    ]),
    el('div', { class: 'review-table' }, rowNodes),
    el('button', { class: 'begin', text: 'COMPILE RESULTS', onclick: onContinue })
  );
}
```

Add to `index.html`:

```css
.review-row {
  display: grid; grid-template-columns: 3rem 1fr 1.5rem 3rem 3.5rem 3rem;
  gap: .6rem; align-items: baseline; padding: .35rem 0;
  border-bottom: 1px solid rgba(46,74,107,.25); font-size: .86rem;
}
.review-n, .review-time, .answer { font-family: var(--mono); font-size: .78rem; }
.review-prompt { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.edit {
  font-family: var(--mono); font-size: .64rem; letter-spacing: .1em;
  background: transparent; border: 1px solid var(--blue); color: var(--blue);
  padding: .15rem .4rem; cursor: pointer;
}
.correction {
  font-family: var(--mono); font-weight: 700; font-size: 1rem;
  color: var(--red); mix-blend-mode: multiply;
  transform: rotate(-2deg) translateY(1px); display: inline-block;
}
.correction.punch { animation: punch 350ms ease-out; }
@keyframes punch {
  0%   { transform: rotate(-2deg) scale(1.4); opacity: 0; }
  40%  { transform: rotate(-2deg) scale(1.4); opacity: 1; }
  100% { transform: rotate(-2deg) scale(1) translateY(1px); opacity: 1; }
}
.score-line { display: flex; gap: .8rem; align-items: baseline; margin: 1.5rem 0; }
.score-value { font-family: var(--mono); font-size: 1.3rem; }
.section-title { font-family: var(--mono); font-size: .8rem; letter-spacing: .16em; font-weight: 400; }
@media (prefers-reduced-motion: reduce) { .correction.punch { animation: none; } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/review.test.js`
Expected: PASS — 4 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.js index.html test/review.test.js
git commit -m "feat: review screen with falsified rows and the red correction stamp"
```

---

### Task 14: The certificate screen

**Files:**
- Modify: `src/ui/screens.js`, `index.html`

**Interfaces:**
- Consumes: `buildReport`, `FACULTIES`, `computeFaculties`, `headlineCentile`, `classify`
- Produces: `renderCertificate(root, { report, faculties, centile, onDebrief })`

- [ ] **Step 1: Write the failing test**

Certificate content is already covered by `test/report.test.js`. This task adds a
composition guard so the screenshot target cannot silently regress.

```js
// append to test/report.test.js
import { CERTIFICATE_MAX_WIDTH_PX } from '../src/ui/screens.js';

test('the certificate is composed for a portrait phone screenshot', () => {
  assert.ok(CERTIFICATE_MAX_WIDTH_PX <= 420,
    'certificate must fit a portrait phone without horizontal cropping');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/report.test.js`
Expected: FAIL — `CERTIFICATE_MAX_WIDTH_PX is not exported`

- [ ] **Step 3: Write minimal implementation**

Append to `src/ui/screens.js`:

```js
import { FACULTIES } from '../scoring.js';

export const CERTIFICATE_MAX_WIDTH_PX = 400;

function scoreBar(value) {
  const filled = Math.round(value / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

export function renderCertificate(root, { report, faculties, centile, onDebrief }) {
  clear(root);

  const indexRows = FACULTIES.map(f =>
    el('div', { class: 'index-row' }, [
      el('span', { class: 'index-label', text: f.label }),
      el('span', { class: 'index-bar', text: scoreBar(faculties[f.key]) }),
      el('span', { class: 'index-score', text: String(faculties[f.key]).padStart(3, ' ') })
    ])
  );

  const paragraphs = report.interpretation.map(p =>
    el('p', { class: 'interpretation', text: p.paragraph })
  );

  root.append(
    el('div', { class: 'certificate' }, [
      el('div', { class: 'cert-head' }, [
        el('div', { class: 'label', text: report.header.instrument }),
        el('div', { class: 'label', text: `SUBJECT: ${report.header.subject}` }),
        el('div', { class: 'label', text: report.header.administration })
      ]),
      el('h2', { class: 'section-title', text: 'SUMMARY OF FINDINGS' }),
      ...report.summary.map(s => el('p', { text: s })),
      el('div', { class: 'index-table' }, indexRows),
      el('h2', { class: 'section-title', text: 'INTERPRETATION' }),
      ...paragraphs,
      el('h2', { class: 'section-title', text: 'BEHAVIOURAL OBSERVATIONS' }),
      ...report.observations.map(o => el('p', { text: o })),
      el('h2', { class: 'section-title', text: 'RECOMMENDATIONS AND LIMITATIONS' }),
      ...report.recommendations.map(r => el('p', { text: r })),
      el('p', { class: 'closer', text: report.closer }),
      el('div', { class: 'cert-foot', text: `σ = 0.03 · n = 1 · p < .0001 · ${centile}th centile` })
    ]),
    el('a', { class: 'debrief-link', href: '#debrief', text: 'About this instrument', onclick: onDebrief })
  );
}
```

Add to `index.html`:

```css
.certificate {
  max-width: 400px; margin: 0 auto; padding: 1.6rem 1.4rem;
  border: 1px solid var(--ink); box-shadow: 0 0 0 3px var(--paper), 0 0 0 4px var(--ink);
}
.cert-head { border-bottom: 1px solid var(--blue); padding-bottom: .8rem; margin-bottom: 1.2rem; }
.index-table { font-family: var(--mono); font-size: .7rem; margin: 1.4rem 0; }
.index-row { display: grid; grid-template-columns: 1fr auto 2.4rem; gap: .5rem; padding: .18rem 0; }
.index-bar { letter-spacing: -1px; }
.index-score { text-align: right; }
.interpretation { font-size: .92rem; }
.closer { margin-top: 1.6rem; }
.cert-foot {
  font-family: var(--mono); font-size: .64rem; color: var(--blue);
  border-top: 1px solid var(--blue); margin-top: 1.4rem; padding-top: .6rem;
}
.debrief-link {
  display: block; text-align: center; margin-top: 2.5rem;
  font-family: var(--mono); font-size: .66rem; color: var(--blue);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/report.test.js`
Expected: PASS — 12 tests passing

- [ ] **Step 5: Commit**

```bash
git add src/ui/screens.js index.html test/report.test.js
git commit -m "feat: certificate screen composed for a portrait screenshot"
```

---

### Task 15: Wiring, debrief page, README and ship

**Files:**
- Modify: `src/main.js`, `index.html`
- Create: `README.md`, `docs/itch-page-copy.md`

**Interfaces:**
- Consumes: everything
- Produces: a complete playable instrument at `dist/index.html`

- [ ] **Step 1: Write the failing test**

```js
// test/integration.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mulberry32 } from '../src/rng.js';
import { createTranscript, recordAnswer, amendmentCount } from '../src/transcript.js';
import { questionByNumber, QUESTIONS } from '../src/questions.js';
import { scheduleTricks, validateSchedule } from '../src/tricks.js';
import { introduceTypo } from '../src/name.js';
import { chooseFalsifications } from '../src/falsify.js';
import { computeFaculties, headlineCentile, classify } from '../src/scoring.js';
import { buildReport } from '../src/report.js';

test('a full run produces a coherent certificate for every seed', () => {
  for (let s = 0; s < 60; s++) {
    const rng = mulberry32(s);
    const schedule = scheduleTricks(rng);
    assert.deepEqual(validateSchedule(schedule), []);

    const t = createTranscript();
    for (const q of QUESTIONS) {
      recordAnswer(t, {
        n: q.n, choice: q.correct ?? 0, realElapsedMs: 6000,
        displayedElapsedMs: 12000, changes: 0, trick: schedule.get(q.n) ?? null
      });
    }
    t.telemetry.freezePointerDistance = 900;

    const typo = introduceTypo('DAVID', rng);
    const falsifications = chooseFalsifications(t, rng);
    const faculties = computeFaculties(t);
    const report = buildReport({
      faculties, centile: headlineCentile(rng), classification: classify(faculties),
      displayName: typo.display, amendmentCount: amendmentCount(t), rng
    });

    assert.equal(falsifications.length, 3);
    assert.equal(report.header.subject, typo.display);
    for (const p of report.interpretation) {
      assert.ok(!p.paragraph.includes('undefined'), `seed ${s}: statement pool exhausted`);
    }
  }
});

test('an unanswered run still produces a certificate', () => {
  const rng = mulberry32(1);
  const t = createTranscript();
  for (const q of QUESTIONS) {
    recordAnswer(t, {
      n: q.n, choice: null, realElapsedMs: 45000,
      displayedElapsedMs: 45000, changes: 0, trick: null
    });
  }
  const faculties = computeFaculties(t);
  const report = buildReport({
    faculties, centile: headlineCentile(rng), classification: classify(faculties),
    displayName: 'X', amendmentCount: 0, rng
  });
  assert.ok(report.closer.length > 0);
});

test('the built artifact is self-contained', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  // The Ko-fi anchor on the debrief page is the one permitted external URL.
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replaceAll('https://ko-fi.com/clevermonkey', '');
  assert.ok(!/<script[^>]+src=/.test(html), 'external script reference in dist');
  assert.ok(!/https?:\/\//.test(stripped), 'unexpected external URL in dist');
  assert.ok(!/@import|fonts\.googleapis/.test(html), 'external font in dist');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run build && node --test test/integration.test.js`
Expected: FAIL — statement pool exhaustion or a missing wiring export

- [ ] **Step 3: Write minimal implementation**

```js
// src/main.js
import { mulberry32 } from './rng.js';
import { QUESTIONS, questionByNumber } from './questions.js';
import { scheduleTricks } from './tricks.js';
import { introduceTypo, displayNameFor } from './name.js';
import { createTranscript, recordAnswer, amendmentCount } from './transcript.js';
import { chooseFalsifications } from './falsify.js';
import { computeFaculties, headlineCentile, classify, preliminaryScore } from './scoring.js';
import { buildReport } from './report.js';
import { applyTrick } from './ui/effects.js';
import { createSyntheticCursor, runFinale, shouldRunFinale } from './ui/cursor.js';
import { FINALE_QUESTION } from './tricks.js';
import {
  renderLanding, renderQuestion, renderReview, renderCertificate, renderDebrief
} from './ui/screens.js';

const root = document.getElementById('app');
const rng = mulberry32((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
const schedule = scheduleTricks(rng);
const transcript = createTranscript();
const isTouch = window.matchMedia('(pointer: coarse)').matches;

let typo = { original: '', display: '', kind: 'none' };
let falsifications = [];
let index = 0;

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.body.classList.remove('cursor-hidden');
});

function start(name) {
  typo = introduceTypo(name.toUpperCase(), rng);
  index = 0;
  nextQuestion();
}

function nextQuestion() {
  if (index >= QUESTIONS.length) return showReview();
  const question = QUESTIONS[index];
  let detach = null;

  const commit = (choice, realElapsedMs, driver) => {
    recordAnswer(transcript, {
      n: question.n, choice,
      realElapsedMs,
      displayedElapsedMs: 45000 - driver.displayedRemainingMs(),
      changes: 0, trick: schedule.get(question.n) ?? null
    });
  };

  const screen = renderQuestion(root, {
    question,
    displayName: displayNameFor(question.n, typo),
    onChoose: (choice, elapsed) => {
      commit(choice, elapsed, screen.driver);
      advance(screen, detach);
    },
    onExpire: elapsed => {
      commit(null, elapsed, screen.driver);
      advance(screen, detach);
    }
  });

  const trick = schedule.get(question.n);
  if (trick) {
    detach = applyTrick(trick, {
      optionElements: screen.optionElements,
      onChoose: choice => { commit(choice, screen.driver.elapsedMs(), screen.driver); advance(screen, detach); },
      rng,
      isTouch
    });
  }

  if (question.n === FINALE_QUESTION && shouldRunFinale()) {
    const cursor = createSyntheticCursor(document.body);
    runFinale({
      cursor, timerDriver: screen.driver,
      onDistance: d => { transcript.telemetry.freezePointerDistance = d; }
    });
  }
}

function advance(screen, detach) {
  screen.stop();
  if (detach) detach();
  index++;
  nextQuestion();
}

function showReview() {
  falsifications = chooseFalsifications(transcript, rng);
  renderReview(root, {
    transcript, falsifications,
    displayName: displayNameFor(24, typo),
    baseScore: 100,
    onContinue: () => showCertificate()
  });
}

function showCertificate() {
  const faculties = computeFaculties(transcript, falsifications);
  const centile = headlineCentile(rng);
  const report = buildReport({
    faculties, centile, classification: classify(faculties),
    displayName: displayNameFor(24, typo),
    amendmentCount: amendmentCount(transcript), rng
  });
  void preliminaryScore(100, amendmentCount(transcript));
  renderCertificate(root, {
    report, faculties, centile,
    onDebrief: e => { e.preventDefault(); renderDebrief(root); }
  });
}

renderLanding(root, start);
```

Append `renderDebrief` to `src/ui/screens.js`:

```js
export function renderDebrief(root) {
  clear(root);
  root.append(
    el('h2', { class: 'section-title', text: 'ABOUT THIS INSTRUMENT' }),
    el('p', { text: 'The Cavendish–Pettigrew Reflective Aptitude Inventory does not measure anything. It is a demonstration of two well-documented effects.' }),
    el('p', { text: 'The first is cognitive reflection: some questions have an intuitive answer that arrives quickly and is confidently wrong. The opening items were real, and if you got some of them wrong, you got them wrong the way most people do.' }),
    el('p', { text: 'The second is the Barnum, or Forer, effect: people rate vague, universally true descriptions as highly accurate personal assessments. Every statement in your report was drawn from a fixed pool. Somebody else received most of the same sentences.' }),
    el('p', { text: 'The timer always showed forty-five seconds. It did not always give you forty-five seconds. Some of your clicks were interfered with. Three answers on the review sheet were changed before you saw them, and your name was misspelled from question eleven onward.' }),
    el('p', { text: 'None of it was about you. Thank you for sitting it.' }),
    el('a', { class: 'debrief-link', href: 'https://ko-fi.com/clevermonkey', text: 'ko-fi.com/clevermonkey' })
  );
}
```

> The Ko-fi anchor is the **only** external URL in the project and lives solely on
> the debrief page — never on the certificate, where a donation ask would puncture
> the tone. `test/integration.test.js` already exempts exactly this one URL.

```markdown
<!-- README.md -->
# The Cavendish–Pettigrew Reflective Aptitude Inventory, Form 4-B

A spurious cognitive and personality assessment. It opens as a genuine timed
test, degrades imperceptibly into farce, cheats the taker in ways designed to be
mistaken for their own failings, falsifies their transcript, and grades them with
total clinical seriousness.

It is a working demonstration of the two effects it pretends to measure:
cognitive reflection, and the Barnum effect.

## Development

    npm test        # node --test, zero dependencies
    npm run build   # emits dist/index.html

Open `index.html` directly for development. Ship `dist/index.html`.

## Spec and plans

- `docs/superpowers/specs/2026-08-12-cavendish-pettigrew-design.md`
- `docs/superpowers/plans/2026-08-12-instrument-machinery.md`
- `docs/superpowers/plans/` — Plan 2 authors the question and statement content

Built by Dave with Claude. Please do not spoil it for anyone.
```

- [ ] **Step 4: Run the full suite and the build**

Run: `npm test`
Expected: PASS — all test files green

Run: `npm run build && node --test test/integration.test.js`
Expected: PASS — 3 tests passing

Then open `dist/index.html` in a browser and take the whole thing end to end
once: name entry → 24 questions → review → certificate → debrief.

- [ ] **Step 5: Commit**

```bash
git add src/main.js src/ui/screens.js index.html README.md test/integration.test.js
git commit -m "feat: wire the full instrument, add debrief page and README"
```

---

## Plan 2 (to follow): Content authoring

Not part of this plan. Once the machinery is green:

1. Replace `prompt` and `options` in all 24 entries of `src/questions.js`, leaving
   `n`, `phase`, `kind`, `correct` and `nonsense` untouched. `validateQuestions`
   enforces the composition rules.
   **Write novel cognitive-reflection items** — the canonical Frederick (2005)
   three are too well known, and a tester who recognises them defeats the deposit.

   **Two parlour-game items (Dave's, 2026-08-12) — for the `affect` slots:**

   - *"Which of these animals do you prefer?"* — four options. Purports to
     measure **how the subject sees themselves**.
   - *"Which of these colours do you prefer?"* — four options. Purports to
     measure **how the subject believes others perceive them**.

   These do a specific job the nonsense questions cannot: they are the first
   items that feel like they are *about the taker*, and the taker will believe
   they mean something — which is precisely the credulity the certificate then
   exploits. They also read as entirely legitimate personality-inventory
   practice, so they cost nothing in stealth.

   **Placement:** the `affect` slots are Q15, Q18, Q20, Q21–24. Put the animal
   at **Q15** and the colour at **Q20** — well separated, so the pattern does
   not announce itself, and both landing inside the descent rather than the
   farce. Both take `nonsense: false` (they are plausible, not absurd) and
   `correct: null` (no wrong answer).

   **How the certificate uses them** — decide during authoring:
   - *Oblique*: the report never names the choice, but the Barnum prose about
     self-perception is seeded near the relevant index. Subtler.
   - *Deadpan explicit*: `Selection of the HERON is consistent with a subject
     whose self-concept is organised around patience rather than force.` Louder,
     and it reinforces the fake-rigor register the rest of the certificate runs on.

   Recommendation: explicit for the animal, oblique for the colour — one named
   mechanism sells the apparatus, two starts to feel like a magazine quiz.
2. Replace all 24 strings in `BARNUM` and all 16 in `INSINUATION_TIERS`.
3. Playtest one tester at a time, recording the answer to *"At which question
   number did you first suspect?"* Target is past Q20; below Q15, re-tune the
   `REAL_MS` curve in `src/clock.js` before burning the next tester.

## Known gap carried from the spec

**Spec §10 item 5** — a `prefers-reduced-motion` taker skips the Q23 finale, so
`telemetry.freezePointerDistance` stays 0 and COMPOSURE reports a perfect 100.
Task 8 computes it correctly but the input is absent. **Resolve during Task 12**
by picking one: derive composure from mid-test answer-change velocity instead, or
suppress the index on the certificate with the note
`COMPOSURE — not assessed under modified administration conditions.` The second
is cheaper and arguably funnier.
