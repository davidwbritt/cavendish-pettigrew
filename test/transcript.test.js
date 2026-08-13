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

test('composure is not assessed by default — only the Q23 finale sets it', () => {
  const t = createTranscript();
  assert.equal(t.telemetry.composureAssessed, false);
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

test('null to substantive answer (first recorded) does not increment changes', () => {
  const t = createTranscript();
  recordAnswer(t, entry(3, { choice: null }));
  recordAnswer(t, entry(3, { choice: 2 }));
  assert.equal(entryFor(t, 3).choice, 2);
  assert.equal(entryFor(t, 3).changes, 0);
});

test('substantive answer to null does not increment changes', () => {
  const t = createTranscript();
  recordAnswer(t, entry(5, { choice: 1 }));
  recordAnswer(t, entry(5, { choice: null }));
  assert.equal(entryFor(t, 5).choice, null);
  assert.equal(entryFor(t, 5).changes, 0);
});

test('null to null does not increment changes', () => {
  const t = createTranscript();
  recordAnswer(t, entry(8, { choice: null }));
  recordAnswer(t, entry(8, { choice: null }));
  assert.equal(entryFor(t, 8).choice, null);
  assert.equal(entryFor(t, 8).changes, 0);
});

test('substantive answer to different substantive answer increments changes', () => {
  const t = createTranscript();
  recordAnswer(t, entry(2, { choice: 1 }));
  recordAnswer(t, entry(2, { choice: 3 }));
  assert.equal(entryFor(t, 2).choice, 3);
  assert.equal(entryFor(t, 2).changes, 1);
});

test('first-ever record ignores changes value in payload and forces zero', () => {
  const t = createTranscript();
  recordAnswer(t, entry(6, { choice: 2, changes: 7 }));
  assert.equal(entryFor(t, 6).changes, 0);
});
