export function createTranscript() {
  // composureAssessed starts false and is only ever flipped to true by the
  // Q23 finale actually completing its freeze phase (src/ui/cursor.js's
  // runFinale, wired in main.js). A taker under prefers-reduced-motion or on
  // a coarse pointer skips the finale via shouldRunFinale(), so their
  // freezePointerDistance stays at its default 0 too — without this separate
  // flag that reads as "held perfectly still", scoring a suspicious perfect
  // COMPOSURE. See src/scoring.js's composureAssessed() and src/report.js's
  // certificate-level suppression.
  return {
    entries: [], amendments: [],
    telemetry: { freezePointerDistance: 0, composureAssessed: false }
  };
}

export function entryFor(t, n) {
  return t.entries.find(e => e.n === n);
}

export function recordAnswer(t, entry) {
  const existing = entryFor(t, entry.n);
  if (!existing) {
    t.entries.push({ ...entry, changes: 0 });
    return;
  }
  const changed = existing.choice !== null && entry.choice !== null && existing.choice !== entry.choice;
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
