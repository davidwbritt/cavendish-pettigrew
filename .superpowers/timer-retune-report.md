# Timer retune — 45s/20s → 30s/10s

## What changed

### src/clock.js
- `DISPLAY_DURATION_MS`: 45000 → 30000
- `FLOOR_MS`: 20000 → 10000
- `REAL_MS` table rescaled per spec (Q1-10 honest @ 30000, Q11-20 descent,
  Q13/16/19 recovery @ 30000, Q21-24 floor @ 10000). Verified by execution
  (see below) — matches the exact 24-value table given in the task.

### Hardcoded-45000 bug fix (the critical item)
Grepped the whole of `src/` for `45000` and `0:45` before touching anything.
Found it in exactly the two places the prior review flagged, plus one more
the review missed:

| File | What it was | What it became |
|---|---|---|
| `src/main.js` (`commit`) | `displayedElapsedMs: 45000 - driver.displayedRemainingMs()` | imports `DISPLAY_DURATION_MS` from `./clock.js`; now `DISPLAY_DURATION_MS - driver.displayedRemainingMs()` |
| `src/ui/screens.js` (initial digits) | `el('span', { class: 'timer-digits', text: '0:45' })` | new `formatDigits(ms)` helper (`0:${ceil(ms/1000)}` zero-padded) shared by both the initial render and the tick loop; initial call is `formatDigits(DISPLAY_DURATION_MS)`, imported from `../clock.js`. The first tick and the initial paint can now never disagree. |
| `src/ui/screens.js` (timer bar width) | `bar.style.width = \`${(remaining / 45000) * 100}%\`` | `(remaining / DISPLAY_DURATION_MS) * 100` |
| `src/scoring.js` (`reflectiveLatency`, not previously flagged) | `: 45000` fallback and `/ 45000` divisor in the Q1-10 mean-latency calc | imports `DISPLAY_DURATION_MS` from `./clock.js` alongside the existing `RECOVERY_QUESTIONS` import; both literals replaced |

After the fix: `grep -rn "45000\|0:45" src/` returns **zero matches** anywhere
in `src/` (confirmed by execution, not just reading).

### Prose that asserted "45 seconds" to the taker (not caught by the literal grep)
`src/ui/screens.js`'s `DEBRIEF_CLOSING_BASE` — the debrief page's closing
paragraph — stated in English "The timer always showed forty-five seconds.
It did not always give you forty-five seconds." This is now false with a
30-second face, so it was updated to "thirty seconds" (both occurrences).
`test/debrief.test.js`'s pinned `shared` string was updated to match.

## Test changes

- **test/clock.test.js**: pinned 24-value table updated to the new numbers
  (kept as literal numbers, not derived from constants, per instructions —
  so a transposition/typo in the source table still fails loudly). Floor
  test, recovery test, and "starts at face value" test now reference
  `DISPLAY_DURATION_MS`/`FLOOR_MS` instead of literals where the original
  already did partially. Q24-midpoint test recomputed: `realDurationMs(24)`
  is now 10000, so half = 5000ms real elapsed; face shows 15000ms
  (`displayedRemainingMs(24, 5000) === 15000`) — taker has 5000ms left, face
  claims 15000ms, matching the task's stated intent exactly.
- **New test** in test/clock.test.js: `'no source file outside clock.js
  hardcodes the face duration'` — walks every `.js` file under `src/`
  (recursively, matching `test/rng.test.js`'s existing `Math.random()` grep
  pattern), skips `src/clock.js` itself, and asserts the literal
  `String(DISPLAY_DURATION_MS)` (currently `"30000"`) appears in none of
  them. This is read from the constant, not hardcoded as `"30000"` in the
  test, so it stays correct if the face value is retuned again.
- **test/timer-driver.test.js**: the "reports the face duration at start"
  test now asserts `DISPLAY_DURATION_MS` instead of the literal 45000. The
  expiry test (previously hardcoded 19999/20000 against an implicit
  REAL_MS[24]=20000) now uses `realDurationMs(24) - 1` / `realDurationMs(24)`
  directly rather than a second copy of the number. The freeze/frozen-total
  tests for Q23 (previously commented `REAL_MS[23] = 20000`) were updated to
  the new floor value 10000 (comments and the arithmetic that proves
  "resumed mid-flight, still expires exactly on schedule": 5s frozen + 4999ms
  not yet due, 5s + 5000ms due, replacing the old 14999/15000 pair built
  around the 20000 floor).

## Files touched
- `src/clock.js`
- `src/main.js`
- `src/ui/screens.js`
- `src/scoring.js`
- `test/clock.test.js`
- `test/timer-driver.test.js`
- `test/debrief.test.js`
- `docs/superpowers/specs/2026-08-12-cavendish-pettigrew-design.md`

## Design spec updates
`docs/superpowers/specs/2026-08-12-cavendish-pettigrew-design.md`, §4 and
scattered prose:
- "honest 45-second clock" → "honest 30-second clock" (§3, Q1-10 description)
- "displayed timer always reads 45 and always counts 45 → 0" → "reads 30 ...
  30 → 0"
- §4 duration table rescaled to the new 24-value curve
- "Hard floor of 20 seconds" → "Hard floor of 10 seconds"
- "By Q20 the taker receives roughly half the time the instrument claims to
  have given them" → "By Q24 the taker receives a third of the time the
  instrument claims to have given them" — this is not just a wording
  softening: at the new floor, Q24's ratio is exactly 10000/30000 = 1/3,
  whereas the old Q20 reference (11000/30000 ≈ 0.367) is only approximately
  a third, so the reference point was moved to Q24 (the exact floor) per the
  task's explicit instruction.
- §11 automated-tests bullet: "Displayed timer always runs 45 → 0 ... never
  drops below 20s" → "runs 30 → 0 ... never drops below 10s"

Left untouched (out of scope, not the live spec): a prior *plan* document,
`docs/superpowers/plans/2026-08-12-instrument-machinery.md`, also contains
the old "forty-five seconds" debrief sentence. The task named only the
design spec file for updates ("do not rewrite anything else in the spec"),
and this is a different, historical document, not the spec — left as-is.

## Verification (by execution)

```
npm test    → 210/210 pass (209 pre-existing + 1 new grep guard), 0 fail
npm run build → "built dist/index.html (95388 bytes, 16 modules)", clean exit
```

Direct execution against `src/clock.js` (not inferred from reading):

```
DISPLAY_DURATION_MS = 30000   FLOOR_MS = 10000
Full 24-value table:
[30000,30000,30000,30000,30000,30000,30000,30000,30000,30000,
 28000,26000,30000,23000,20000,30000,17000,14000,30000,11000,
 10000,10000,10000,10000]
```

Confirmed for every n in 1..24:
- `displayedRemainingMs(n, 0) === 30000`
- `displayedRemainingMs(n, realDurationMs(n)) === 0`
- `realDurationMs(n) >= 10000`

Confirmed `realDurationMs(13) === realDurationMs(16) === realDurationMs(19)
=== 30000`.

Non-recovery monotonic sequence (Q11-Q20 minus 13/16/19, then Q21-24):
28000, 26000, 23000, 20000, 17000, 14000, 11000, 10000, 10000, 10000, 10000
— non-increasing throughout (verified by the existing monotonic test, which
passed).

## Concerns / things not verified
- Did not run the app in a browser (no jsdom in this project, per the task's
  constraint) — the DOM-facing changes (`digits` text, bar width) are
  verified by reading the code path and by the full test suite, not by a
  live render. `formatDigits(30000)` was hand-traced to `"0:30"` but not
  captured via a browser screenshot.
- The debrief prose change ("thirty seconds") is a literal English
  spelling-out of the new constant, not mechanically derived from
  `DISPLAY_DURATION_MS` (no number-to-words conversion exists in this
  project) — if the face value changes again, this sentence will need a
  manual edit; `test/debrief.test.js` will not catch a mismatch on its own
  since it just mirrors the same literal string.
