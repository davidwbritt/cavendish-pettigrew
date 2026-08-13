import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mulberry32 } from '../src/rng.js';
import { createTranscript, recordAnswer, amendmentCount } from '../src/transcript.js';
import { questionByNumber, QUESTIONS } from '../src/questions.js';
import { scheduleTricks, validateSchedule } from '../src/tricks.js';
import { introduceTypo } from '../src/name.js';
import { chooseFalsifications } from '../src/falsify.js';
import { computeFaculties, headlineCentile, classify, composureAssessed } from '../src/scoring.js';
import { buildReport } from '../src/report.js';

test('a full run produces a coherent certificate for every seed', () => {
  for (let s = 0; s < 60; s++) {
    const rng = mulberry32(s);
    const schedule = scheduleTricks(rng);
    assert.deepEqual(validateSchedule(schedule), []);

    const t = createTranscript();
    for (const q of QUESTIONS) {
      recordAnswer(t, {
        n: q.n, choice: q.correct ?? 0, realElapsedMs: 6000,
        displayedElapsedMs: 12000, changes: 0, trick: schedule.get(q.n) ?? null
      });
    }
    t.telemetry.freezePointerDistance = 900;
    t.telemetry.composureAssessed = true;   // this run reached the Q23 finale

    const typo = introduceTypo('DAVID', rng);
    const falsifications = chooseFalsifications(t, rng);
    const faculties = computeFaculties(t, falsifications);
    const assessed = key => key !== 'composure' || composureAssessed(t);
    const report = buildReport({
      faculties, centile: headlineCentile(rng),
      classification: classify(faculties, assessed),
      composureAssessed: composureAssessed(t),
      displayName: typo.display, amendmentCount: amendmentCount(t), rng
    });

    assert.equal(falsifications.length, 3);
    assert.equal(report.header.subject, typo.display);
    for (const p of report.interpretation) {
      assert.ok(!p.paragraph.includes('undefined'), `seed ${s}: statement pool exhausted`);
    }
  }
});

test('an unanswered run still produces a certificate', () => {
  const rng = mulberry32(1);
  const t = createTranscript();
  for (const q of QUESTIONS) {
    recordAnswer(t, {
      n: q.n, choice: null, realElapsedMs: 45000,
      displayedElapsedMs: 45000, changes: 0, trick: null
    });
  }
  const faculties = computeFaculties(t);
  const assessed = key => key !== 'composure' || composureAssessed(t);
  const report = buildReport({
    faculties, centile: headlineCentile(rng),
    classification: classify(faculties, assessed),
    composureAssessed: composureAssessed(t),
    displayName: 'X', amendmentCount: 0, rng
  });
  assert.ok(report.closer.length > 0);
});

// End-to-end guard for the COMPOSURE leak. This run never reaches the Q23
// finale, so composure was never measured and must not appear as a score
// ANYWHERE — not in the index table, and not in the headline classification
// that renderCertificate prints in the SUMMARY block one section above it.
test('a run that skips the finale never reports a composure score', () => {
  const rng = mulberry32(7);
  const t = createTranscript();
  for (const q of QUESTIONS) {
    recordAnswer(t, {
      n: q.n, choice: q.correct ?? 0, realElapsedMs: 6000,
      displayedElapsedMs: 12000, changes: 0, trick: null
    });
  }
  // composureAssessed deliberately left false — prefers-reduced-motion taker.
  assert.equal(composureAssessed(t), false);

  const faculties = computeFaculties(t);
  const assessed = key => key !== 'composure' || composureAssessed(t);
  const report = buildReport({
    faculties, centile: headlineCentile(rng),
    classification: classify(faculties, assessed),
    composureAssessed: composureAssessed(t),
    displayName: 'X', amendmentCount: 0, rng
  });

  const composureRow = report.interpretation.find(p => p.facultyKey === 'composure');
  assert.equal(composureRow.score, null, 'suppressed composure must carry no score');

  const summaryText = report.summary.join(' ');
  assert.ok(!summaryText.includes('COMPOSED'),
    'the headline must not call an unmeasured taker COMPOSED');
});

test('the built artifact is self-contained', async () => {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  // The Ko-fi anchor on the debrief page is the one permitted external URL.
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replaceAll('https://ko-fi.com/clevermonkey', '');
  assert.ok(!/<script[^>]+src=/.test(html), 'external script reference in dist');
  assert.ok(!/https?:\/\//.test(stripped), 'unexpected external URL in dist');
  assert.ok(!/@import|fonts\.googleapis/.test(html), 'external font in dist');
});
