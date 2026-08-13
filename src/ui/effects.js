// DOM-level sabotage effects for the sitting screen.
//
// This is a fake cognitive assessment that covertly sabotages the taker's
// clicks. Every effect here must remain deniable as "I misclicked" — never
// obviously the software cheating.
//
// CONTRACT: every effect below must leave a route to the intended answer —
// spec §5, scheduling invariant 6. Enforced by construction: each effect
// either delays input, reroutes it through onChoose, or intercepts it
// through a bounded counter, but never removes the option or traps the
// taker indefinitely. An uncorrectable wrong answer produces rage; a
// correctable one produces self-doubt, which is the entire point.
//
// INTERCEPTION: screens.js registers the real option onclick at render
// time; applyTrick runs afterwards and can only attach LATER listeners.
// Same-node listeners fire in registration order, so a plain click
// listener added here can never pre-empt (or usefully cancel) the real
// handler — stopImmediatePropagation() cannot un-invoke a handler that
// already ran. deadClick and ghostSelection therefore do not use click
// listeners at all: they install an interceptor via setInterceptor(fn),
// which screens.js consults BEFORE committing a selection. The
// interceptor returns null to swallow the click (no selection, no commit)
// or an option index to proceed with (the original index, or a remapped
// one). If setInterceptor is not supplied, these two tricks degrade to
// no-ops rather than throwing.
//
// TIMER HAZARD: doubleMark, buttonFlinch, stickyAnswer and phantomLock all
// schedule setTimeout callbacks. Removing an event listener does NOT cancel
// an already-scheduled timeout — if a question expires and the UI advances
// before one of those timers fires, the callback would run against the
// wrong, already-advanced question. stickyAnswer's callback calls
// onChoose(), so an uncancelled timer would silently commit an answer to a
// question the taker has already left: silent transcript corruption. To
// close that hole, every setTimeout in this module is created through
// `schedule()` below, and detach() clears every outstanding id. detach()
// also undoes any inline style, class or attribute an effect applied, and
// clears any interceptor it installed, so nothing it touched survives
// teardown.

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

export function applyTrick(name, { optionElements, onChoose, rng, isTouch = false, setInterceptor }) {
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
    const marked = new Set();
    let lastReal = null;
    onEach('click', e => {
      const i = Number(e.currentTarget.dataset.index);
      // No interceptor is installed for this trick, so the real onclick
      // (registered by screens.js, earlier in listener order) has already
      // committed this selection by the time this handler runs.
      lastReal = i;
      const ghost = optionElements[(i + 2) % optionElements.length];
      ghost.setAttribute('aria-pressed', 'true');
      marked.add(ghost);
      schedule(() => {
        marked.delete(ghost);
        // If the taker's genuine selection has since landed on this same
        // node, clearing it here would silently undo their real answer's
        // visual state. Only revert if it's still just a decoy.
        if (Number(ghost.dataset.index) === lastReal) return;
        ghost.setAttribute('aria-pressed', 'false');
      }, 1400);
    });
    cleanups.push(() => {
      for (const ghost of marked) ghost.setAttribute('aria-pressed', 'false');
      marked.clear();
    });
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
    let previous = null;
    onEach('click', e => {
      const i = Number(e.currentTarget.dataset.index);
      const revertTo = previous;
      previous = i;
      if (revertTo === null) return;
      schedule(() => onChoose(revertTo), 1000);
    });
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

  return () => {
    for (const fn of cleanups) fn();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    setInterceptor?.(null);
  };
}
