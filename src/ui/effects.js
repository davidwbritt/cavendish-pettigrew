// DOM-level sabotage effects for the sitting screen.
//
// This is a fake cognitive assessment that covertly sabotages the taker's
// clicks. Every effect here must remain deniable as "I misclicked" — never
// obviously the software cheating.
//
// CONTRACT: every effect below must leave a route to the intended answer —
// spec §5, scheduling invariant 6. Enforced by construction: each effect
// either delays input, reroutes it via a bounded interceptor swallow, or
// intercepts it through a bounded counter, but never removes the option or
// traps the taker indefinitely. An uncorrectable wrong answer produces
// rage; a correctable one produces self-doubt, which is the entire point.
//
// INTERCEPTION: screens.js registers the real option onclick at render
// time; applyTrick runs afterwards and can only attach LATER listeners.
// Same-node listeners fire in registration order, so a plain click
// listener added here can never pre-empt (or usefully cancel) the real
// handler — stopImmediatePropagation() cannot un-invoke a handler that
// already ran. deadClick, ghostSelection, doubleMark and stickyAnswer
// therefore do not use click listeners to act AFTER a click at all: they
// install an interceptor via setInterceptor(fn), which screens.js consults
// BEFORE committing a selection. The interceptor returns null to swallow
// the click (no selection, no commit) or an option index to proceed with
// (the original index, or a remapped one). If setInterceptor is not
// supplied, all four of these tricks degrade to no-ops rather than
// throwing.
//
// HISTORICAL BUG (fix round 1, Task 15 review): doubleMark and stickyAnswer
// originally acted via a plain click listener registered AFTER screens.js's
// real onclick, on the theory that a delayed revert (a 1400ms ghost, a
// 1000ms sticky-then-revert) could run once the real handler had already
// committed. It never could: main.js's teardown is synchronous by hard
// requirement (an answer must never commit to an already-advanced
// question — see main.js's advance()), so the real click handler calls
// detach() before the browser's dispatch loop ever reaches a
// later-registered listener on the same node. Per the DOM spec, a listener
// removed mid-dispatch never runs. Both tricks were therefore dead code —
// scheduled, but never actually invoked. They are now redesigned around the
// same swallow-the-click-first shape as deadClick/ghostSelection: SWALLOW
// the taker's first click (so there is a screen left to act on), fake a
// selection, then let the second click commit for real.
//
// TIMER HAZARD: doubleMark, buttonFlinch, stickyAnswer and phantomLock all
// schedule setTimeout callbacks. Removing an event listener does NOT cancel
// an already-scheduled timeout — if a question expires and the UI advances
// before one of those timers fires, the callback would run against the
// wrong, already-advanced question. To close that hole, every setTimeout in
// this module is created through `schedule()` below, and detach() clears
// every outstanding id. detach() also undoes any inline style, class or
// attribute an effect applied, and clears any interceptor it installed, so
// nothing it touched survives teardown.

// Touch has no hover and no cursor, so flinch, phantom-lock and hoverDrift
// are replaced rather than skipped — mobile takers must meet the same
// number of tricks.
export const TOUCH_SUBSTITUTIONS = {
  deadClick: 'deadClick',
  ghostSelection: 'ghostSelection',
  doubleMark: 'doubleMark',
  stickyAnswer: 'stickyAnswer',
  buttonFlinch: 'scrollSteal',     // the tap is consumed as a scroll gesture
  phantomLock: 'firmPress',        // the option demands a longer press
  hoverDrift: 'hoverDriftTouch'    // the pressed highlight shows on the neighbour instead
};

export function effectiveTrick(name, isTouch) {
  return isTouch ? TOUCH_SUBSTITUTIONS[name] : name;
}

// Pure mapping used by the hoverDrift trick below, and unit-tested directly
// (test/effects.test.js) without any DOM: for any length >= 2 this always
// returns a valid in-range index, and it is never the hovered index itself.
export function hoverDriftTarget(hoveredIndex, length) {
  return (hoveredIndex + 1) % length;
}

export function applyTrick(name, { optionElements, rng, isTouch = false, setInterceptor }) {
  const trick = effectiveTrick(name, isTouch);
  const cleanups = [];
  const timers = new Set();

  // Every setTimeout in this module goes through here so detach() can
  // guarantee that no scheduled callback ever runs after teardown.
  const schedule = (fn, ms) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };

  const onEach = (type, handler, opts) => {
    for (const node of optionElements) {
      node.addEventListener(type, handler, opts);
      cleanups.push(() => node.removeEventListener(type, handler, opts));
    }
  };

  if (trick === 'deadClick') {
    // Bounded: the first up-to-2 clicks are swallowed (each with 80%
    // odds), then every click passes through untouched — the taker always
    // reaches their answer within a small, fixed number of extra taps.
    let swallowed = 0;
    setInterceptor?.(i => {
      if (swallowed < 2 && rng() < 0.8) { swallowed++; return null; }
      return i;
    });
  }

  if (trick === 'ghostSelection') {
    // Always reroutes to the next option — deniable as "I fat-fingered the
    // one below" — but the route to the intended answer is intact: click
    // the option immediately before the one you want.
    setInterceptor?.(i => (i + 1) % optionElements.length);
  }

  if (trick === 'doubleMark') {
    // Swallows exactly the taker's FIRST click: lights up both the option
    // they actually picked and a decoy two slots over (the original
    // (i + 2) % length ghost formula — with 4 options this always lands on
    // a distinct option), holds both for ~900ms, then reverts. The second
    // click on any option passes through and commits normally — bounded to
    // one swallow, so the taker is never stuck. Two options lit (vs.
    // stickyAnswer's one) keeps the two tricks visually distinct from each
    // other, so neither is identifiable by its shape alone.
    let swallowed = false;
    let real = null;
    let ghost = null;
    const revert = () => {
      if (real) { real.setAttribute('aria-pressed', 'false'); real = null; }
      if (ghost) { ghost.setAttribute('aria-pressed', 'false'); ghost = null; }
    };
    setInterceptor?.(i => {
      if (!swallowed) {
        swallowed = true;
        real = optionElements[i];
        ghost = optionElements[(i + 2) % optionElements.length];
        real.setAttribute('aria-pressed', 'true');
        ghost.setAttribute('aria-pressed', 'true');
        schedule(revert, 900);
        return null;
      }
      // Second click: about to commit for real. screens.js's own
      // selectOption() is what sets the genuine aria-pressed state right
      // after this returns — if the real click lands on a node we're still
      // holding lit, drop our reference to it now so neither the pending
      // 900ms timer nor detach()'s cleanup below clobbers that genuine
      // selection afterwards.
      if (optionElements[i] === real) real = null;
      if (optionElements[i] === ghost) ghost = null;
      return i;
    });
    cleanups.push(revert);
  }

  if (trick === 'buttonFlinch') {
    const flinched = new Set();
    onEach('mousedown', e => {
      const node = e.currentTarget;
      node.style.transform = 'translate(3px, -3px)';
      flinched.add(node);
      schedule(() => {
        node.style.transform = '';
        flinched.delete(node);
      }, 220);
    });
    cleanups.push(() => {
      for (const node of flinched) node.style.transform = '';
      flinched.clear();
    });
  }

  if (trick === 'stickyAnswer') {
    // Swallows exactly the taker's FIRST click: lights up the single option
    // they picked so it looks committed, holds it for ~700ms, then reverts
    // — the taker watches their answer vanish and must click again. The
    // second click on any option passes through and commits normally —
    // bounded to one swallow, so the taker is never stuck. One option lit
    // (vs. doubleMark's two) keeps the two tricks visually distinct from
    // each other.
    let swallowed = false;
    let lit = null;
    const revert = () => {
      if (lit) { lit.setAttribute('aria-pressed', 'false'); lit = null; }
    };
    setInterceptor?.(i => {
      if (!swallowed) {
        swallowed = true;
        lit = optionElements[i];
        lit.setAttribute('aria-pressed', 'true');
        schedule(revert, 700);
        return null;
      }
      // Second click: about to commit for real — see doubleMark's identical
      // guard above for why this reference must be dropped before
      // screens.js sets the genuine aria-pressed state.
      if (optionElements[i] === lit) lit = null;
      return i;
    });
    cleanups.push(revert);
  }

  if (trick === 'phantomLock') {
    const locked = new Set();
    onEach('mouseenter', e => {
      const node = e.currentTarget;
      if (node.dataset.locked) return;
      node.dataset.locked = '1';
      node.classList.add('phantom-locked');
      locked.add(node);
      schedule(() => {
        node.classList.remove('phantom-locked');
        delete node.dataset.locked;
        locked.delete(node);
      }, 900);
    });
    cleanups.push(() => {
      for (const node of locked) {
        node.classList.remove('phantom-locked');
        delete node.dataset.locked;
      }
      locked.clear();
    });
  }

  if (trick === 'scrollSteal') {
    // Bounded exactly like deadClick: only the first up-to-2 taps are
    // consumed as a scroll gesture (each with 80% odds); every later tap
    // reaches the button normally. Unbounded interception here would trap
    // every touch taker for the whole question — there is no click to
    // intercept later, since preventDefault() on touchstart suppresses the
    // synthesized click outright.
    let stolen = 0;
    onEach('touchstart', e => {
      if (stolen < 2 && rng() < 0.8) { stolen++; e.preventDefault(); window.scrollBy(0, 2); }
    }, { passive: false });
  }

  if (trick === 'firmPress') {
    // Bounded like the others: only the first up-to-2 short taps have
    // their synthesized click suppressed (each with 80% odds), forcing a
    // longer press; later short taps pass through normally so the taker
    // is never stuck. Acts on the touchend event that is actually firing,
    // not the stale touchstart event captured at press time.
    let blocked = 0;
    onEach('touchstart', e => {
      const node = e.currentTarget;
      const started = Date.now();
      const release = (te) => {
        node.removeEventListener('touchend', release);
        if (blocked < 2 && Date.now() - started < 500 && rng() < 0.8) {
          blocked++;
          te.preventDefault();
        }
      };
      node.addEventListener('touchend', release);
      // release() removes itself once touchend fires, but if it never does
      // (finger dragged off, question advances first) the listener would
      // otherwise leak — detach() removes it unconditionally too.
      cleanups.push(() => node.removeEventListener('touchend', release));
    }, { passive: false });
  }

  if (trick === 'hoverDrift') {
    // Hovering option i lights (i + 1) % length instead — the option
    // actually under the cursor never lights. THE CLICK IS HONEST: unlike
    // every trick above, this one never calls setInterceptor (whatever the
    // taker actually clicks is what commits) and never touches
    // aria-pressed (see the module comment's HISTORICAL BUG note — that
    // attribute is screens.js's committed-selection state alone). It only
    // ever adds/removes .option-hover — the exact class index.html's base
    // hover rule also uses, so a drifted highlight is pixel-identical to a
    // real one — and .option-hover-off, which suppresses the truly hovered
    // node's own native :hover ring via higher CSS specificity so only the
    // decoy lights. No timers: the highlight tracks the live hover state
    // directly, so there is nothing for schedule()/detach() to race.
    for (const [i, node] of optionElements.entries()) {
      const target = optionElements[hoverDriftTarget(i, optionElements.length)];
      const enter = () => {
        node.classList.add('option-hover-off');
        target.classList.add('option-hover');
      };
      const leave = () => {
        node.classList.remove('option-hover-off');
        target.classList.remove('option-hover');
      };
      node.addEventListener('mouseenter', enter);
      node.addEventListener('mouseleave', leave);
      cleanups.push(() => {
        node.removeEventListener('mouseenter', enter);
        node.removeEventListener('mouseleave', leave);
        // Defensive, like every other trick's cleanup above: reverts the
        // classes directly rather than relying on a mouseleave having
        // fired first, so a question that changes mid-hover (timeout,
        // blind click) can never leave a highlight stuck into the next
        // question.
        node.classList.remove('option-hover-off');
        target.classList.remove('option-hover');
      });
    }
  }

  if (trick === 'hoverDriftTouch') {
    // Touch has no hover, so this is the direct analogue required by the
    // project's touch-substitution policy: the pressed/active highlight
    // shows on the neighbouring option on touchstart, using the identical
    // shared .option-hover class, and clears on touchend. The tap still
    // commits honestly — no interceptor, no aria-pressed here either.
    for (const [i, node] of optionElements.entries()) {
      const target = optionElements[hoverDriftTarget(i, optionElements.length)];
      const start = () => target.classList.add('option-hover');
      const end = () => target.classList.remove('option-hover');
      node.addEventListener('touchstart', start, { passive: true });
      node.addEventListener('touchend', end);
      cleanups.push(() => {
        node.removeEventListener('touchstart', start);
        node.removeEventListener('touchend', end);
        target.classList.remove('option-hover');
      });
    }
  }

  return () => {
    for (const fn of cleanups) fn();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    setInterceptor?.(null);
  };
}
