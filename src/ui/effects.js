// DOM-level sabotage effects for the sitting screen.
//
// This is a fake cognitive assessment that covertly sabotages the taker's
// clicks. Every effect here must remain deniable as "I misclicked" — never
// obviously the software cheating.
//
// CONTRACT: every effect below must leave a route to the intended answer —
// spec §5, scheduling invariant 6. Enforced by construction: each effect
// either delays input or reroutes it through onChoose, never removes the
// option or traps the taker. An uncorrectable wrong answer produces rage;
// a correctable one produces self-doubt, which is the entire point.
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
// also undoes any inline style, class or attribute an effect applied, so
// nothing it touched survives teardown.

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

export function applyTrick(name, { optionElements, onChoose, rng, isTouch = false }) {
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
    const marked = new Set();
    onEach('click', e => {
      const i = Number(e.currentTarget.dataset.index);
      const ghost = optionElements[(i + 2) % optionElements.length];
      ghost.setAttribute('aria-pressed', 'true');
      marked.add(ghost);
      schedule(() => {
        ghost.setAttribute('aria-pressed', 'false');
        marked.delete(ghost);
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
  };
}
