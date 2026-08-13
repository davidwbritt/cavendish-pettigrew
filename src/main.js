import { mulberry32, pick } from './rng.js';
import { DISPLAY_DURATION_MS } from './clock.js';
import { QUESTIONS } from './questions.js';
import { scheduleTricks } from './tricks.js';
import { introduceTypo, displayNameFor } from './name.js';
import { createTranscript, recordAnswer, amendmentCount } from './transcript.js';
import { chooseFalsifications } from './falsify.js';
import { computeFaculties, headlineCentile, classify, composureAssessed } from './scoring.js';
import { buildReport } from './report.js';
import { computeTally } from './tally.js';
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

// Runs the trick's own detach() and the Q23 finale's cancel() SYNCHRONOUSLY
// — never deferred into or after a pause. A trick's listeners/timers, and
// the finale's drift loop, must never be able to act against a question
// that has already been decided (see Task 15's carry-over constraints and
// the finale-cancel fix in the original wiring). Both onChoose and onExpire
// below call this at the moment of commit, before scheduling any pause.
//
// ONE deliberate, narrow exception: textSwap (src/ui/effects.js) needs a
// setTimeout it schedules AT commit to actually fire during the hold, which
// is impossible if detach() (and the timer-clearing it does) runs in the
// same tick as commit. onChoose below detects this via `detach.holdMs`
// (present ONLY on textSwap's returned cleanup — see effects.js) and, only
// for that one trick, calls this function from inside the pause's onDone
// instead of immediately. This still never crosses into a LATER question —
// teardownTrick always runs, and always finishes, before goNext() can
// possibly be called — so the invariant this comment protects (never act
// against an already-advanced question) still holds. Every other trick's
// teardown is exactly as immediate as it always was.
function teardownTrick(detach, finale) {
  if (detach) detach();
  if (finale) finale.cancel();
}

function nextQuestion() {
  if (index >= QUESTIONS.length) return showReview();
  const question = QUESTIONS[index];
  let detach = null;
  let finale = null;

  // Moves to the next question. Only ever called as the onDone callback of
  // screen.pauseThenAdvance/showForcedAnswer (screens.js) — i.e. only after
  // a pause screens.js itself schedules and tracks (and will cancel via the
  // module's activeStop guard if this screen goes away for any reason
  // first). Never called directly from a click/expiry handler.
  const goNext = () => { index++; nextQuestion(); };

  const commit = (choice, realElapsedMs, driver, timedOut = false) => {
    recordAnswer(transcript, {
      n: question.n, choice,
      realElapsedMs,
      displayedElapsedMs: DISPLAY_DURATION_MS - driver.displayedRemainingMs(),
      changes: 0, trick: schedule.get(question.n) ?? null,
      // Deliberately NOT hidden from the taker (see reviewRows/renderReview
      // in screens.js — the review sheet brands a REFUSED row even while
      // showing the forced answer exactly like any other). Only ever true
      // via onExpire below; every click-driven commit passes the default.
      timedOut
    });
  };

  const screen = renderQuestion(root, {
    question,
    displayName: displayNameFor(question.n, typo),
    onChoose: (choice, elapsed) => {
      commit(choice, elapsed, screen.driver);
      // textSwap only (see effects.js): let the already-applied trick know
      // the TRUE clicked index, synchronously, before deciding when to tear
      // it down — see teardownTrick's comment above for why this can't just
      // be immediate for this one trick.
      detach?.notifyCommit?.(choice);
      // The live scoring readout, printed under the options for the length
      // of the hold. Computed AFTER commit so it includes the item just
      // answered, and derived entirely from the transcript (src/tally.js).
      screen.showTally(computeTally(transcript.entries, question.n)?.lines);
      if (detach?.holdMs) {
        // Extended hold (textSwap): defer teardown until after the longer
        // pause instead of tearing down immediately.
        screen.pauseThenAdvance(() => {
          teardownTrick(detach, finale);
          goNext();
        }, detach.holdMs);
      } else {
        teardownTrick(detach, finale);
        // Holds the black `.option[aria-pressed="true"]` fill on screen
        // briefly so the taker actually sees their answer register, then
        // advances. Tracked/cancellable by screens.js — see renderQuestion's
        // pauseThenAdvance.
        screen.pauseThenAdvance(goNext);
      }
    },
    onExpire: elapsed => {
      // The instrument answers FOR the taker. MUST come from the injected
      // seeded rng — every draw in this pipeline, from here on, is seeded
      // and reproducible. The ONE sanctioned Math.random() call in this
      // project is line 17 above, seeding this very rng's initial state; it
      // is a single entropy source consumed once at startup, not used for
      // any decision itself, so the pipeline it feeds is still fully seeded
      // and deterministic from that point on (see test/rng.test.js's grep
      // guard, which asserts this is the only occurrence in src/).
      const choice = pick(rng, [0, 1, 2, 3]);
      commit(choice, elapsed, screen.driver, true);
      transcript.telemetry.forcedAnswers++;
      teardownTrick(detach, finale);
      // Shows the clinical red notice, marks the forced option selected,
      // holds, then advances — see renderQuestion's showForcedAnswer.
      screen.showForcedAnswer(choice, goNext);
      // After showForcedAnswer, so the readout appends below the refusal
      // notice. A timed-out entry always reports FLAGGED — the instrument
      // records the refusal it just invented as a fact about the taker.
      screen.showTally(computeTally(transcript.entries, question.n)?.lines);
    }
  });

  const trick = schedule.get(question.n);
  if (trick) {
    // No onChoose is passed here (fix 6, final whole-branch review, MINOR):
    // no trick has called it since the swallow-then-reveal redesign (every
    // trick now commits via the real click reaching screens.js's own
    // onChoose above, through setInterceptor). A live-but-unused closure
    // here was worse than dead code — it called commit() + pauseThenAdvance()
    // WITHOUT going through the outcome gate (createOutcomeGate in
    // screens.js), so a future trick wiring itself to it would double-commit
    // and double-advance. src/ui/effects.js's applyTrick still does not
    // accept it. textSwap's `detach.notifyCommit`/`detach.holdMs` (read,
    // not passed in, above in onChoose) is a DIFFERENT, narrower channel:
    // purely advisory, read-only from main.js's side, and structurally
    // unable to trigger a second commit — it cannot reopen this hazard.
    detach = applyTrick(trick, {
      optionElements: screen.optionElements,
      // Tricks that alter or swallow a click MUST go through setInterceptor —
      // screens.js registers the real onclick first, so a later-attached
      // listener can never pre-empt it. See Task 11 findings.
      setInterceptor: screen.setInterceptor,
      rng,
      isTouch
    });
  }

  if (question.n === FINALE_QUESTION && shouldRunFinale()) {
    const cursor = createSyntheticCursor(document.body);
    // The finale returned by runFinale carries a .cancel() (attached to its
    // Promise) — capture it and call it from teardownTrick() above if the
    // taker manages a blind click mid-drift, so a Q24 render is never
    // fought over by a still-drifting Q23 cursor. Composure is only ever
    // marked assessed inside this same onDistance callback, alongside the
    // distance itself — if the finale is aborted (Esc, any key, or the
    // taker never reaches this callback), composureAssessed correctly
    // stays false. The finale also freezes the timer for its duration, so
    // expiry cannot fire mid-freeze — see timer-driver.js's freeze()/
    // resume(); if the finale is cancelled mid-flight, resume() picks the
    // real elapsed time back up exactly where it left off and the question
    // continues normally, including being able to expire afterwards.
    finale = runFinale({
      cursor, timerDriver: screen.driver,
      onDistance: d => {
        transcript.telemetry.freezePointerDistance = d;
        transcript.telemetry.composureAssessed = true;
      }
    });
  }
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

// Computed once per taker and cached, NOT recomputed on every visit to the
// certificate screen. buildReport draws its Barnum statements from the same
// shared seeded rng that everything else in the pipeline consumes from —
// calling it a second time (e.g. when the taker bounces back from the
// debrief page) would draw a second, different sequence of statements and
// silently rewrite the certificate the taker already read. See
// renderCertificateScreen/showDebrief below, the debrief's "Return to
// certificate" link.
let certificateState = null;

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
  certificateState = { report, faculties, centile };
  renderCertificateScreen();
}

// The certificate <-> debrief round trip. Both renderCertificate and
// renderDebrief open with the same module-level activeStop guard every
// other screen uses (see screens.js), so bouncing between them repeatedly
// leaks no rAF loop or pending timer — neither screen starts one. Each call
// re-renders from the SAME cached certificateState (see above), so the
// certificate is byte-identical no matter how many times the taker goes
// back and forth.
function renderCertificateScreen() {
  const { report, faculties, centile } = certificateState;
  renderCertificate(root, {
    report, faculties, centile,
    onDebrief: e => { e.preventDefault(); showDebrief(); }
  });
}

function showDebrief() {
  renderDebrief(root, {
    typoApplied: typo.kind !== 'none',
    onBack: e => { e.preventDefault(); renderCertificateScreen(); }
  });
}

renderLanding(root, start);
