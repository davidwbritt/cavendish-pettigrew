# Q23 finale: spiral → lower-left drift

## What changed

- `src/ui/cursor.js`: replaced the decaying-spiral `flingPath()` with
  `driftPath()` — a single eased straight-line interpolation from the
  cursor's current position to a point just inside the lower-left corner.
  `FLING_STEPS`/`FLING_STEP_MS` → `DRIFT_STEPS`/`DRIFT_STEP_MS` (now
  exported). `cursor.fling()` → `cursor.drift()`, `flingToken` →
  `driftToken`. All comments in `cursor.js` and `src/main.js` that described
  a "fling"/"fling loop" now describe the drift.
- `docs/superpowers/specs/2026-08-12-cavendish-pettigrew-design.md`,
  section 5 ("Q23 — the finale"): replaced "releases and flings" with a
  description of the slow corner-ward drift, and added a sentence on why —
  a spiral/flourish reads as an authored animation, a slow pull toward one
  destination reads as something dragging the taker's mouse.
- `test/cursor.test.js`: removed the two tests asserting the path "returns
  to a usable resting position" / "avoids the edge" (that invariant existed
  because the drawn cursor's final position was wrongly assumed to persist —
  it doesn't; `runFinale` detaches immediately after). Replaced with tests
  asserting the path ends near the lower-left corner and that progress
  toward the target is monotone (no orbiting/wobble). Renamed all
  `flingPath` references to `driftPath`; added `47x47` and `1440x900` to the
  degenerate-viewport sweep (now also covers `0x0, 0x600, 600x0, 10x10,
  47x47, 50x50, 96x96, 320x480, 800x600, 1440x900`); added a duration test
  asserting `DRIFT_STEPS * DRIFT_STEP_MS` is in `[2000, 2500]`.
- `test/finale.test.js` (new): exercises `runFinale()` + the real
  `createSyntheticCursor()` end to end against hand-rolled `window`/
  `document` stubs (not jsdom — only the handful of DOM primitives these
  two functions actually touch: `createElement`, `classList`, `style`,
  `append`, `remove`, `addEventListener`/`removeEventListener`). Uses
  Node's built-in `node:test` `mock.timers` (no install; ships with
  Node 20) to drive the freeze wait and each 16ms drift step deterministically
  instead of waiting out ~2.24s of real time per test.

## Chosen parameters

- **Steps / step delay**: `DRIFT_STEPS = 140`, `DRIFT_STEP_MS = 16` →
  **2240ms (~2.24s)** total, inside the requested 2–2.5s band and slower
  than the old ~1.15s spiral.
- **Margin**: `Math.min(32, Math.floor(Math.min(width, height) / 4))` — same
  viewport-scaling shape as the old margin (so degenerate sizes still
  degrade safely to 0) but capped at 32px instead of 48px, closer to "a
  couple of dozen pixels."
- **Easing**: `easeInOutCubic` (`t<0.5 ? 4t³ : 1-(-2t+2)³/2`) applied to a
  straight-line interpolation from start to target — slow start, faster
  middle, settles at the end, strictly monotone on `[0,1]` so the path can
  never double back, orbit, or wobble.
- **Target point**: `(margin, height - margin)` — inset just inside the
  lower-left corner rather than flush against it.

## Verification

- `npm test`: **223/223 passing** (up from 217 — added 4 net cursor-path
  tests plus 5 new `finale.test.js` tests, replaced 2 obsolete ones,
  everything else untouched and still green).
- `npm run build`: clean, `dist/index.html` built (100325 bytes, 16
  modules).
- Checked `dist/index.html` directly: zero `import`/`export` keyword
  residue, and **exactly one** external URL
  (`https://ko-fi.com/clevermonkey`). Zero occurrences of "fling" anywhere
  in the built output.
- `grep -rin "fling" src/ test/ docs/superpowers/specs/...design.md`: only
  remaining source-level "fling" text is one deliberate historical/rationale
  comment in `cursor.js` ("the old decaying spiral" — not "fling" itself)
  contrasting the new drift with the old effect it replaced; nothing
  describes current behavior as a fling.
- `Math.random()` guard test (`test/rng.test.js`) still passes — the new
  code introduces no `Math.random()` calls; `driftPath` is fully
  deterministic given `from`/`viewport`/`steps`.

### Abort-mid-drift, specifically

This was the one property that couldn't be verified just by reading the
diff, since the longer duration (2.24s vs 1.15s) widens the mid-flight abort
window. Verified by execution in `test/finale.test.js`, using
`mock.timers` to advance in 16ms increments through ~20 of the 140 drift
steps, then dispatching a synthetic `keydown` and asserting, all against the
*real* `runFinale`/`createSyntheticCursor` implementation (not stubs):

1. The returned promise resolves promptly — raced against a `setImmediate`
   rejection, proving `cursor.detach()`'s `cancelStep()` actually **settles**
   the in-flight `stepDelay` promise rather than leaving the `await` in
   `drift()` suspended forever behind a merely-cleared timer.
2. `timerDriver.resume()` fires exactly once.
3. The synthetic cursor node is removed and the `cursor-hidden` class is
   cleared.
4. Advancing the mock clock through what would have been the remaining ~120
   steps afterward moves the cursor **not at all** — the drift loop is
   verifiably dead, not just unobserved.

Also covered: abort during the freeze phase (before `onDistance` ever
fires — confirms `composureAssessed` would correctly stay unset on that
path), abort via an external `.cancel()` call mid-drift, and that calling
`.cancel()` twice (or after natural completion) is a no-op.

## What I could NOT verify

- **Real-browser visual smoothness / "feel."** No browser, jsdom, or visual
  rendering was available in this environment. The easing curve, timing,
  and monotonicity are verified numerically and via the unit/integration
  tests above, but whether the drift actually *reads* as "something
  dragging the mouse" rather than a scripted animation when watched on a
  real screen is a subjective, human-eyes judgment this environment cannot
  make. Recommend a manual pass in a real browser before shipping.
- `mock.timers` is Node's own API but is documented as experimental
  (emits an `ExperimentalWarning` on stderr, does not fail the run or
  affect exit code — confirmed `npm test` exits 0 with only that warning
  present).
