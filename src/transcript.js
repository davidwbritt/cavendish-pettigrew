export function createTranscript() {
  return { entries: [], amendments: [], telemetry: { freezePointerDistance: 0 } };
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
