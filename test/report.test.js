import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/rng.js';
import { BARNUM, INSINUATION_TIERS } from '../src/statements.js';
import { drawStatements, buildReport } from '../src/report.js';
import { FACULTIES } from '../src/scoring.js';

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
