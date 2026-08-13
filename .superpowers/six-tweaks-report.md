# Six tweaks — implementation report

Branch: `develop`. Baseline: 223/223 tests green. Final: **244/244 tests green**.

## 1. Timer curve rushed from Q6 (deposit shortened to Q1-5)

`src/clock.js`'s `REAL_MS` table replaced exactly per spec (Q1-5 = 30000, ramping
down through Q11-Q12/Q14-15/Q17-18/Q20, recovery Q13/16/19 = 30000, floor
Q21-24 = 10000). `DISPLAY_DURATION_MS` and `FLOOR_MS` untouched.

Verified: non-recovery sequence `30,30,30,30,30,28,26,24,22,20,18,16,15,14,13,12,11,10,10,10,10`
matches the spec exactly and is monotonically non-increasing (asserted by
`test/clock.test.js`'s existing "monotonically non-increasing" test, re-run
against the new table). `test/clock.test.js`'s pinned exact-table test and the
"questions 1-10 are honest" test (renamed/narrowed to 1-5, plus a new "Q6 is
where honest ends" test) updated to match.

## 2. Red timer digits below 10 displayed seconds

`RED_THRESHOLD_MS = 10000` exported from `src/clock.js` (single source; a repo
grep confirms `10000` appears nowhere else in `src/`). `src/ui/screens.js`
exports a new pure predicate `timerIsRed(remainingMs)`, unit-tested directly
(no jsdom available in this project). `tick()` toggles a `.timer-digits-red`
class (color: var(--red) only — CSS added in `index.html`) on every frame;
since `digits` is a fresh element created on every `renderQuestion()` call, a
new question's `0:30` can never inherit red — verified by code inspection,
not by rendering (no jsdom; genuinely unverifiable here without a browser).

## 3. TRICK_COUNT 5→7, non-adjacency relaxed from Q17

`ADJACENCY_RELAXED_FROM = 17` exported from `src/tricks.js`. Both
`pickNonAdjacent` and `validateSchedule` use the identical condition
(`Math.max(m, n) < 17`) so they cannot disagree. Recovery/Q23/Q24 exclusions,
max-one-per-question, and no-repeat-in-succession are unchanged.
Ran a 5000-seed sweep outside the test suite: 0 `validateSchedule` failures,
every schedule places exactly 7 tricks, confirming the "2 early + 5 late = 7"
accepted consequence holds unconditionally (Q17/18/20/21/22 carry a trick on
every single run). Comment recording this is in `src/tricks.js` next to
`scheduleTricks`.

## 4. New trick: `lockout`

Implemented via `setInterceptor(() => null)` — swallows every click,
unconditionally, for the rest of the question. Keyboard is covered for free:
a focused `<button>`'s Enter/Space activation dispatches a native `click`
event, which is the same event the interceptor gates — no separate keydown
handling needed or added. No visual change (no class/style/attribute touched),
so hover/focus-visible affordance is untouched.

**Escapability reversal**: rewrote the CONTRACT comment at the top of
`src/ui/effects.js` to state the old "every trick is escapable" rule, why
`lockout` breaks it, and why that's safe now (expiry always forces an answer
and brands REFUSED, so lockout resolves into the instrument answering on the
taker's behalf instead of a dead end).

**At most one per run**: enforced structurally in `scheduleTricks`
(`src/tricks.js`) — once `lockout` is chosen for any slot, it's excluded from
every later slot's candidate pool, not left to shuffle luck. Mirrored as a
defensive (belt-and-braces) check in `validateSchedule`. 5000-seed sweep:
max lockouts observed per run = 1.

**What I checked for "nothing can freeze the timer while a lockout is active"**:
the only timer freeze anywhere in `src/` is `timerDriver.freeze()`, called
exactly once, by `runFinale()` (`src/ui/cursor.js`) for the Q23 finale.
Q23 = `FINALE_QUESTION` is excluded from `eligibleQuestions()`
(`src/tricks.js`), so no trick — lockout included — can ever be scheduled
there. A lockout and a frozen timer can therefore never coincide.

`TOUCH_SUBSTITUTIONS.lockout = 'lockout'` added (pointer-agnostic).

## 5. SELECTION_PAUSE_MS 450→500

Single-line change in `src/ui/screens.js`. `FORCED_ANSWER_PAUSE_MS` untouched.

## 6. New trick: `textSwap`

Purely visual; never touches `setInterceptor`, never alters the committed
index (transcript always records the true click). Implementation problem
solved: `applyTrick` runs once at render time, before any click; by the time
a real click commits, `main.js`'s synchronous teardown would clear any
`schedule()`d timer in the same tick before it could ever fire. Solution:
`applyTrick` attaches two optional properties to the returned `detach`
function, present only for `textSwap`:
- `.notifyCommit(index)` — called by `main.js`'s `onChoose`, synchronously,
  with the TRUE clicked index, before teardown is decided.
- `.holdMs` — read by `main.js` to defer calling `teardownTrick` until after
  this question's extended hold (900ms, `TEXT_SWAP_HOLD_MS`) instead of
  immediately, so the 150ms-delayed swap survives to actually fire.

This required a narrow, explicitly-commented exception to main.js's
"detach() runs synchronously, never deferred into or after a pause" rule —
deferred detach for `textSwap` still always completes before `goNext()` can
run, so it never acts against a later question; every other trick's teardown
is unchanged. `screens.js`'s `pauseThenAdvance` now accepts an optional
duration override (defaults to `SELECTION_PAUSE_MS`).

Swap is a genuine two-way exchange (`textSwapPartner`, a pure/tested helper
picking a random other option via the injected rng), restored on `detach()`,
never touches `aria-pressed`. `TOUCH_SUBSTITUTIONS.textSwap = 'textSwap'`
added. Tests exercise the real ~150ms delay with real timers (async tests,
~50ms slack) rather than fake timers, consistent with this project having
none.

## Cross-cutting

- `TRICK_NAMES` has 9 entries (7 original + `lockout` + `textSwap`).
- Fixed a self-introduced duplicate-constant bug during development:
  `TEXT_SWAP_HOLD_MS` was briefly defined in both `effects.js` and
  `screens.js`; consolidated to `effects.js` alone (the value `main.js`
  actually reads is `detach.holdMs`, dynamically attached — `screens.js`
  never needed its own copy).
- 5000-seed property sweep (beyond the committed 1500-seed test): exactly
  `TRICK_COUNT` placements every run, `validateSchedule` returns `[]` every
  run, lockout ≤ 1 every run. Frequency distribution over 1500 seeds
  (10500 total placements): lockout 894, all others 1140-1260 — lockout is
  lower because it's excluded from later slots within a run once chosen,
  not because of a scheduling bug.
- `docs/superpowers/specs/2026-08-12-cavendish-pettigrew-design.md` updated:
  §3 (deposit honest-timing window is Q1-5, sabotage-free window still Q1-10),
  §4 (new duration table, red-threshold paragraph), §5 (nine tricks, relaxed
  adjacency rule + rationale, lockout's escapability reversal + why it's
  safe, textSwap). Nothing else in the spec touched. Note: §9's "no colour
  change" timer guidance now technically conflicts with the new red-digit
  feature in §4 — flagged here rather than silently resolved, since the task
  scoped doc edits to §3/§4/§5 only.

## Verification

- `npm test`: **244/244 passing** (was 223; +21 new/updated tests across
  `clock.test.js`, `effects.test.js`, `timeout.test.js`, `tricks.test.js`).
- `npm run build`: clean, `dist/index.html` built (113660 bytes, 16 modules).
- `dist/index.html`: zero `import`/`export` residue (grepped), exactly one
  external URL (`https://ko-fi.com/clevermonkey`, the sanctioned debrief
  link) — confirmed both by direct grep and by the existing
  `test/integration.test.js` "the built artifact is self-contained" test.
- Not verifiable here (no browser/jsdom in this project): the actual visual
  appearance of red digits, the swap's on-screen readability during the
  900ms hold, and hover affordance on a locked-out option. These were
  checked by code/structural inspection only.

## Files touched

`src/clock.js`, `src/tricks.js`, `src/ui/effects.js`, `src/ui/screens.js`,
`src/main.js`, `index.html`, `test/clock.test.js`, `test/tricks.test.js`,
`test/effects.test.js`, `test/timeout.test.js`,
`docs/superpowers/specs/2026-08-12-cavendish-pettigrew-design.md`.
