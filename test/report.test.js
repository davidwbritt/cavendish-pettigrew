import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { BARNUM, INSINUATION_TIERS } from '../src/statements.js';
import { drawStatements, buildReport, ordinal } from '../src/report.js';
import { FACULTIES } from '../src/scoring.js';
import { CERTIFICATE_MAX_WIDTH_PX, certificateIndexRows } from '../src/ui/screens.js';

const faculties = Object.fromEntries(FACULTIES.map((f, i) => [f.key, 40 + i * 8]));
const build = seed => buildReport({
  faculties, centile: 94, classification: 'PROFILE 4-B — DEFERRED ANALYTIC',
  displayName: 'DAVDI', amendmentCount: 0, rng: mulberry32(seed)
});

test('the Barnum pool holds 24 statements', () => {
  assert.equal(BARNUM.length, 24);
  assert.equal(new Set(BARNUM).size, 24);
});

test('there are four insinuation tiers of four', () => {
  assert.equal(INSINUATION_TIERS.length, 4);
  for (const tier of INSINUATION_TIERS) assert.equal(tier.length, 4);
});

test('a draw takes ten Barnum statements and exactly four insinuations', () => {
  for (let s = 0; s < 100; s++) {
    const d = drawStatements(mulberry32(s));
    assert.equal(d.barnum.length, 10);
    assert.equal(d.insinuations.length, 4);
  }
});

test('no statement repeats within a single certificate', () => {
  for (let s = 0; s < 100; s++) {
    const d = drawStatements(mulberry32(s));
    const all = [...d.barnum, ...d.insinuations];
    assert.equal(new Set(all).size, all.length);
  }
});

// fix round 2, Task 15 review: the certificate previously hardcoded "th" in
// two places (src/report.js's summary line and src/ui/screens.js's
// cert-foot), so "91st", "92nd" and "93rd" — three of headlineCentile()'s
// six possible values, roughly half of all runs — rendered as "91th",
// "92th", "93th". ordinal() is the single shared fix; both call sites now
// go through it. Written for the general case (not just 91-96) so a future
// retuning of the centile range can't silently reintroduce the bug.
test('ordinal formats the standard exceptions and the general last-digit rule', () => {
  const cases = {
    1: '1st', 2: '2nd', 3: '3rd', 4: '4th',
    11: '11th', 12: '12th', 13: '13th',
    21: '21st', 22: '22nd', 23: '23rd',
    91: '91st', 92: '92nd', 93: '93rd', 94: '94th', 95: '95th', 96: '96th',
    101: '101st', 111: '111th', 112: '112th', 113: '113th'
  };
  for (const [n, expected] of Object.entries(cases)) {
    assert.equal(ordinal(Number(n)), expected, `ordinal(${n}) should be "${expected}"`);
  }
});

test('the full headlineCentile range (91-96) prints a grammatical ordinal in the certificate summary', () => {
  // Hardcoded expected strings — NOT derived from ordinal() itself — so a
  // regression in ordinal() is caught even if this test's own use of it
  // were somehow wrong too.
  const expected = { 91: '91st', 92: '92nd', 93: '93rd', 94: '94th', 95: '95th', 96: '96th' };
  for (const [centile, suffixed] of Object.entries(expected)) {
    const report = buildReport({
      faculties, centile: Number(centile), classification: 'PROFILE 4-B — DEFERRED ANALYTIC',
      displayName: 'DAVDI', amendmentCount: 0, rng: mulberry32(1)
    });
    assert.equal(report.summary[0], `Overall standing: ${suffixed} centile.`);
  }
});

test('insinuations are drawn one per tier, in tier order', () => {
  for (let s = 0; s < 100; s++) {
    const { insinuations } = drawStatements(mulberry32(s));
    insinuations.forEach((text, i) => {
      assert.ok(INSINUATION_TIERS[i].includes(text), `slot ${i} came from the wrong tier`);
    });
  }
});

test('the Summary block contains no insinuation', () => {
  for (let s = 0; s < 100; s++) {
    const r = build(s);
    const tiers = INSINUATION_TIERS.flat();
    for (const line of r.summary) {
      assert.ok(!tiers.includes(line), 'an insinuation leaked into the Summary');
    }
  }
});

test('the report has one interpretation paragraph per faculty', () => {
  const r = build(1);
  assert.equal(r.interpretation.length, FACULTIES.length);
  assert.deepEqual(r.interpretation.map(p => p.facultyKey), FACULTIES.map(f => f.key));
});

test('the report closes on a Barnum statement, never an insinuation', () => {
  for (let s = 0; s < 100; s++) {
    const r = build(s);
    assert.ok(BARNUM.includes(r.closer), 'the closer must be unimpeachable');
  }
});

test('the header carries the corrupted name', () => {
  assert.equal(build(1).header.subject, 'DAVDI');
});

test('observations report deference when nothing was amended', () => {
  const r = buildReport({
    faculties, centile: 94, classification: 'X', displayName: 'D',
    amendmentCount: 0, rng: mulberry32(2)
  });
  assert.ok(r.observations.some(o => o.includes('WITHOUT AMENDMENT')));
});

test('observations report discomfort when rows were amended', () => {
  const r = buildReport({
    faculties, centile: 94, classification: 'X', displayName: 'D',
    amendmentCount: 3, rng: mulberry32(2)
  });
  assert.ok(r.observations.some(o => o.includes('POST-HOC REVISION ATTEMPTS: 3')));
});

test('composure defaults to fully reported when composureAssessed is omitted', () => {
  const r = build(1);
  const composure = r.interpretation.find(p => p.facultyKey === 'composure');
  assert.equal(composure.score, faculties.composure);
  assert.ok(composure.paragraph.includes(`recorded at ${faculties.composure}`));
});

test('composure is suppressed with a clinical note when the finale never ran', () => {
  for (let s = 0; s < 20; s++) {
    const r = buildReport({
      faculties, centile: 94, classification: 'PROFILE 4-B — DEFERRED ANALYTIC',
      displayName: 'DAVDI', amendmentCount: 0, rng: mulberry32(s),
      composureAssessed: false
    });
    const composure = r.interpretation.find(p => p.facultyKey === 'composure');
    assert.equal(composure.score, null, 'no numeric score should be reported');
    assert.ok(
      composure.paragraph.includes('not assessed under modified administration conditions'),
      `got "${composure.paragraph}"`
    );
    assert.ok(!composure.paragraph.includes(String(faculties.composure)),
      'the suppressed paragraph must not leak the unmeasured number');
  }
});

test('suppressing composure does not disturb any other faculty\'s paragraph or the closer', () => {
  for (let s = 0; s < 30; s++) {
    const assessed = buildReport({
      faculties, centile: 94, classification: 'X', displayName: 'D',
      amendmentCount: 0, rng: mulberry32(s), composureAssessed: true
    });
    const suppressed = buildReport({
      faculties, centile: 94, classification: 'X', displayName: 'D',
      amendmentCount: 0, rng: mulberry32(s), composureAssessed: false
    });
    for (const f of FACULTIES) {
      if (f.key === 'composure') continue;
      const a = assessed.interpretation.find(p => p.facultyKey === f.key);
      const b = suppressed.interpretation.find(p => p.facultyKey === f.key);
      assert.equal(a.paragraph, b.paragraph, `${f.key} paragraph diverged at seed ${s}`);
    }
    assert.equal(assessed.closer, suppressed.closer, `closer diverged at seed ${s}`);
  }
});

test('suppressed composure still yields exactly one interpretation paragraph per faculty, no "undefined"', () => {
  for (let s = 0; s < 50; s++) {
    const r = buildReport({
      faculties, centile: 94, classification: 'X', displayName: 'D',
      amendmentCount: 0, rng: mulberry32(s), composureAssessed: false
    });
    assert.equal(r.interpretation.length, FACULTIES.length);
    for (const p of r.interpretation) assert.ok(!p.paragraph.includes('undefined'));
  }
});

test('the certificate is composed for a portrait phone screenshot', () => {
  assert.ok(CERTIFICATE_MAX_WIDTH_PX <= 420,
    'certificate must fit a portrait phone without horizontal cropping');
});

test('a suppressed composure produces no numeric bar or score in the index table', () => {
  for (let s = 0; s < 20; s++) {
    const suppressed = buildReport({
      faculties, centile: 94, classification: 'PROFILE 4-B — DEFERRED ANALYTIC',
      displayName: 'DAVDI', amendmentCount: 0, rng: mulberry32(s),
      composureAssessed: false
    });
    const rows = certificateIndexRows(suppressed.interpretation);
    assert.equal(rows.length, FACULTIES.length);

    const composureRow = rows.find(r => r.facultyKey === 'composure');
    assert.equal(composureRow.bar, undefined, 'suppressed composure must not render a bar');
    assert.equal(composureRow.score, undefined, 'suppressed composure must not render a score');
    assert.ok(composureRow.note, 'suppressed composure must render a note in place of the bar/score');
    assert.ok(!/[█░]/.test(JSON.stringify(composureRow)), 'no bar glyph leaked into the suppressed row');
    assert.ok(!JSON.stringify(composureRow).includes(String(faculties.composure)),
      'the unmeasured composure number must not leak into the row at all');

    // Every other faculty is unaffected — still a real bar and score.
    for (const row of rows) {
      if (row.facultyKey === 'composure') continue;
      assert.ok(row.bar, `${row.facultyKey} row is missing its bar`);
      assert.ok(row.score, `${row.facultyKey} row is missing its score`);
      assert.equal(row.note, undefined, `${row.facultyKey} row should not carry a suppression note`);
    }
  }
});
