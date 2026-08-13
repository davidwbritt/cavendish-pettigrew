# Hover affordance + hoverDrift trick — report

## Part 1: base hover/focus styling

Added to `index.html`'s `<style>` block, directly above the existing
`.option[aria-pressed="true"]` rule:

```css
.option:hover, .option.option-hover, .option:focus-visible {
  outline: 3px solid var(--ink);
  outline-offset: -3px;
}
.option.option-hover-off:hover { outline: none; }
```

**What it is:** a 3px `outline` in `var(--ink)`, drawn *inside* the
option's existing 1px `border` via a `-3px` `outline-offset`. No new
`:root` token was needed — it reuses `--ink`, the same colour the border
already uses. `outline` (not `box-shadow`) was chosen specifically so
nothing here is a "shadow", nothing has a border-radius, and — because
`outline` is drawn outside the box model's layout box — toggling it can
never shift the button's size or the layout around it. No `transition` is
declared anywhere, so the change is an instant cut, consistent with the
rest of the project.

**How it differs from the committed-selection state:** the hover/focus
rule touches only the `outline` property. The selection rule
(`.option[aria-pressed="true"] { background: var(--ink); color: var(--paper); }`)
touches only `background`/`color`. They share no property, so there is no
cascade-order question at all — a hovered-and-selected option keeps its
full black fill unconditionally; the hover ring, drawn in the same ink
colour as that fill, is simply invisible on top of it. An unselected
hovered option, by contrast, shows a thin ink outline on the plain paper
background — visually unmistakable from the solid black fill of a
selection, satisfying "reads as 'I would pick this', not 'this is picked'."

**Accessibility:** `:focus-visible` is included in the same selector list,
so keyboard-only takers get the identical outline treatment tabbing
through options.

**Cascade note (`.option-hover-off`):** this class exists only for
hoverDrift (Part 2) — see below. Its selector
(`.option.option-hover-off:hover`, specificity 0,3,0) is more specific
than the base `.option:hover` rule (0,2,0), so it reliably wins regardless
of source order and suppresses a node's native hover ring when the trick
needs to keep the truth dark.

## Part 2: hoverDrift

- `src/tricks.js`: `TRICK_NAMES` now has 7 entries (`hoverDrift` appended).
  `TRICK_COUNT` is untouched at 5.
- `src/ui/effects.js`:
  - `hoverDriftTarget(hoveredIndex, length)` — pure function, `(i + 1) % length`.
  - `TOUCH_SUBSTITUTIONS.hoverDrift = 'hoverDriftTouch'`.
  - `applyTrick('hoverDrift', ...)`: for each option, on `mouseenter` adds
    `option-hover-off` to the truly-hovered node and `option-hover` to its
    drift target; on `mouseleave` removes both. **Never calls
    `setInterceptor`** and **never touches `aria-pressed`** — the click that
    lands is exactly what screens.js's own `onclick`/outcome-gate commits,
    unmodified. No timers are used (nothing to schedule; the highlight
    tracks live hover state), so there was nothing to route through
    `schedule()`.
  - `applyTrick('hoverDriftTouch', ...)`: the required touch substitution —
    on `touchstart` adds `option-hover` to the neighbouring option (same
    shared class as the mouse version, so indistinguishable), removes it on
    `touchend`. Tap still commits honestly.
  - Both branches' `detach()` cleanup unconditionally strips
    `option-hover`/`option-hover-off` from the relevant nodes, not just
    removing the listeners — so a highlight left over from an unfinished
    hover/tap (question times out or advances mid-hover) cannot survive
    into the next question.

## Verification performed

- `npm test`: **217/217 green** (210 pre-existing + 7 new: the
  `hoverDriftTarget` pure-mapping test, an interceptor-never-installed
  test, a mouseenter/mouseleave lit-and-cleared test, a detach-mid-hover
  test, a touch-substitution test, a `TRICK_NAMES` has-7/distinct +
  `effectiveTrick('hoverDrift', true)` test, and a `TRICK_COUNT` unchanged
  test). Scheduler property tests (500 seeds, `>= 500` required) still pass
  unchanged with 7 trick names — `scheduleTricks`'s slot-count logic
  (`TRICK_COUNT = 5`) never depended on `TRICK_NAMES.length`.
- `npm run build`: clean. `dist/index.html` contains zero `import`/`export`
  residue and exactly one external URL (`https://ko-fi.com/clevermonkey`,
  the pre-existing sanctioned debrief-page link). Confirmed both
  `option-hover` and `option-hover-off` class names made it through the
  inliner into `dist/index.html` unchanged.
- `Math.random()` guard test (`test/rng.test.js`) still passes — no new
  occurrence was introduced; hoverDrift needs no randomness at all.

**How the mouseleave/detach clearing was verified:** there is no jsdom in
this project, so this was verified with a small hand-rolled mock in
`test/effects.test.js` (`mockOptionsWithEvents`) exposing only the
`classList`/`addEventListener`/`removeEventListener` surface the trick
actually touches, with a `_fire(type)` helper to invoke registered
listeners directly (no real DOM event dispatch). This mock is ordinary
committed test code, in the same spirit as the pre-existing `mockOptions`
helper in that file (used by the `doubleMark`/`stickyAnswer` tests) — it
is **not** a general-purpose DOM shim/jsdom stand-in, so it was left
committed rather than discarded. Using it, the tests confirm: (1) hovering
an option adds `option-hover-off` to it and `option-hover` to its
`(i+1)%length` neighbour, (2) `mouseleave` removes both, (3) calling
`detach()` **without** a prior `mouseleave` (simulating a question that
times out or advances mid-hover) still strips both classes from every
node, and (4) the identical guarantees hold for the touch path's
`touchstart`/`touchend`/`detach()`.

**What is NOT verified (and can't be, in this environment):** the actual
visual appearance in a real browser — whether the 3px inset outline reads
clearly at the project's font sizes, how it looks on `:focus-visible` in
different browsers' default UA styling, and real pointer `mouseenter`/
`mouseleave` event ordering when moving directly between adjacent option
buttons. The unit tests above verify the *logic* (which classes get
added/removed, when, and that they're fully cleared) but not pixels. This
should be spot-checked visually before shipping.
