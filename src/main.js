import { mulberry32 } from './rng.js';
import { QUESTIONS } from './questions.js';
import { scheduleTricks } from './tricks.js';
import { introduceTypo, displayNameFor } from './name.js';
import { createTranscript, recordAnswer, amendmentCount } from './transcript.js';
import { chooseFalsifications } from './falsify.js';
import { computeFaculties, headlineCentile, classify, composureAssessed } from './scoring.js';
import { buildReport } from './report.js';
import { applyTrick } from './ui/effects.js';
import { createSyntheticCursor, runFinale, shouldRunFinale } from './ui/cursor.js';
import { FINALE_QUESTION } from './tricks.js';
import {
  renderLanding, renderQuestion, renderReview, renderCertificate, renderDebrief
} from './ui/screens.js';

const root = document.getElementById('app');
const rng = mulberry32((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
const schedule = scheduleTricks(rng);
const transcript = createTranscript();
const isTouch = window.matchMedia('(pointer: coarse)').matches;

let typo = { original: '', display: '', kind: 'none' };
let falsifications = [];
let index = 0;

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.body.classList.remove('cursor-hidden');
});

function start(name) {
  typo = introduceTypo(name.toUpperCase(), rng);
  index = 0;
  nextQuestion();
}

function nextQuestion() {
  if (index >= QUESTIONS.length) return showReview();
  const question = QUESTIONS[index];
  let detach = null;
  let finale = null;

  const commit = (choice, realElapsedMs, driver) => {
    recordAnswer(transcript, {
      n: question.n, choice,
      realElapsedMs,
      displayedElapsedMs: 45000 - driver.displayedRemainingMs(),
      changes: 0, trick: schedule.get(question.n) ?? null
    });
  };

  const screen = renderQuestion(root, {
    question,
    displayName: displayNameFor(question.n, typo),
    onChoose: (choice, elapsed) => {
      commit(choice, elapsed, screen.driver);
      advance(screen, detach, finale);
    },
    onExpire: elapsed => {
      commit(null, elapsed, screen.driver);
      advance(screen, detach, finale);
    }
  });

  const trick = schedule.get(question.n);
  if (trick) {
    detach = applyTrick(trick, {
      optionElements: screen.optionElements,
      // Tricks that alter or swallow a click MUST go through setInterceptor —
      // screens.js registers the real onclick first, so a later-attached
      // listener can never pre-empt it. See Task 11 findings.
      setInterceptor: screen.setInterceptor,
      onChoose: choice => { commit(choice, screen.driver.elapsedMs(), screen.driver); advance(screen, detach, finale); },
      rng,
      isTouch
    });
  }

  if (question.n === FINALE_QUESTION && shouldRunFinale()) {
    const cursor = createSyntheticCursor(document.body);
    // The finale returned by runFinale carries a .cancel() (attached to its
    // Promise) — capture it and call it from advance() below if the taker
    // manages a blind click mid-fling, so a Q24 render is never fought over
    // by a still-flying Q23 cursor. Composure is only ever marked assessed
    // inside this same onDistance callback, alongside the distance itself —
    // if the finale is aborted (Esc, any key, or the taker never reaches
    // this callback), composureAssessed correctly stays false.
    finale = runFinale({
      cursor, timerDriver: screen.driver,
      onDistance: d => {
        transcript.telemetry.freezePointerDistance = d;
        transcript.telemetry.composureAssessed = true;
      }
    });
  }
}

function advance(screen, detach, finale) {
  screen.stop();
  if (detach) detach();
  if (finale) finale.cancel();
  index++;
  nextQuestion();
}

function showReview() {
  falsifications = chooseFalsifications(transcript, rng);
  renderReview(root, {
    transcript, falsifications,
    displayName: displayNameFor(24, typo),
    baseScore: 100,
    onContinue: () => showCertificate()
  });
}

function showCertificate() {
  const faculties = computeFaculties(transcript, falsifications);
  const centile = headlineCentile(rng);
  // The SAME composureAssessed(transcript) flag gates both the interpretation
  // table's suppression (via buildReport, below) and the headline: without
  // this, composure's guaranteed-perfect 100 when unassessed would still be
  // the single highest score and would supply "COMPOSED" in the most
  // prominent text on the certificate — the fix round 1 finding this closes.
  const assessed = key => key !== 'composure' || composureAssessed(transcript);
  const report = buildReport({
    faculties, centile, classification: classify(faculties, assessed),
    displayName: displayNameFor(24, typo),
    amendmentCount: amendmentCount(transcript), rng,
    composureAssessed: composureAssessed(transcript)
  });
  // The running score (preliminaryScore) is a review-screen-only concept —
  // renderReview already computes and displays it live as amendments land
  // (see screens.js's refreshScore()). The certificate has no numeric slot
  // for it (only the per-faculty index table and the headline centile), so
  // recomputing it here would be a discarded duplicate — removed rather
  // than kept as dead arithmetic (fix round 1, Task 15 review, Finding 4).
  renderCertificate(root, {
    report, faculties, centile,
    onDebrief: e => { e.preventDefault(); renderDebrief(root); }
  });
}

renderLanding(root, start);
