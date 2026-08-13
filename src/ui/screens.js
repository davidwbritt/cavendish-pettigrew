import { el, clear } from './dom.js';
import { createTimerDriver } from './timer-driver.js';
import { DISPLAY_DURATION_MS, RED_THRESHOLD_MS } from '../clock.js';
import { shownChoiceFor } from '../falsify.js';
import { recordAmendment, amendmentCount } from '../transcript.js';
import { preliminaryScore, AMENDMENT_PENALTY } from '../scoring.js';
import { questionByNumber } from '../questions.js';
import { ordinal } from '../report.js';

// Guards against a leaked rAF loop: rendering any new question screen
// unconditionally kills the previous one's timer loop, even if the caller
// forgot to capture and call the returned stop().
let activeStop = null;

// A question's outcome — a real click, or expiry — is decided AT MOST ONCE.
// Pure and DOM-free so the "expiry racing a click can only ever produce one
// commit" guarantee is unit-testable directly (no jsdom needed — see
// applyAmendment/reviewRows/certificateIndexRows above for the same
// extraction pattern). renderQuestion below routes both the click handler's
// real (non-swallowed) commit AND the rAF loop's expiry detection through
// ONE shared gate instance per question, so whichever fires first — in
// practice never truly simultaneous, since JS is single-threaded, but the
// two are scheduled from independent sources (a DOM event vs a rAF
// callback) and must not be allowed to depend on which happens to run
// first — wins, and the other is silently dropped. This is what makes "no
// double-advance" an explicit, testable invariant rather than a hope about
// timing.
export function createOutcomeGate() {
  let settled = false;
  return {
    fire(fn) {
      if (settled) return false;
      settled = true;
      fn();
      return true;
    },
    get settled() { return settled; }
  };
}

export function renderHeader(displayName) {
  return el('div', { class: 'form-header' }, [
    el('div', { class: 'field' }, [
      el('span', { class: 'label', text: 'SUBJECT' }),
      el('span', { class: 'value', text: displayName || '—' })
    ]),
    el('div', { class: 'field' }, [
      el('span', { class: 'label', text: 'FORM' }),
      el('span', { class: 'value', text: '4-B' })
    ])
  ]);
}

export function renderLanding(root, onStart) {
  clear(root);
  const input = el('input', { class: 'name-input', maxlength: '40', autocomplete: 'off' });
  root.append(
    el('h1', { class: 'title', text: 'Reflective Aptitude Inventory' }),
    el('p', { class: 'subtitle', text: 'Cavendish–Pettigrew · Form 4-B' }),
    el('p', { text: 'Twenty-four items. Each is timed. Please answer promptly and without assistance.' }),
    el('label', { class: 'label', text: 'SUBJECT NAME' }),
    input,
    el('button', { class: 'begin', text: 'BEGIN', onclick: () => onStart(input.value.trim()) })
  );
  input.focus();
}

// How long a committed selection's black fill (the existing
// `.option[aria-pressed="true"]` rule) is held on screen before advancing —
// long enough to register, short enough not to drag across 24 questions.
// pauseThenAdvance below accepts an optional override (in ms) — used by
// main.js for exactly one question, the one carrying the textSwap trick,
// whose ~900ms hold (TEXT_SWAP_HOLD_MS, src/ui/effects.js — the single
// source for that constant, not duplicated here) needs to be longer than
// this so its delayed text change is actually readable before advancing.
export const SELECTION_PAUSE_MS = 500;

// How long the forced-answer notice is held on screen after a timeout —
// long enough to read one clinical sentence.
export const FORCED_ANSWER_PAUSE_MS = 3000;

export const FORCED_ANSWER_TEXT =
  'NO RESPONSE RECORDED. A RESPONSE HAS BEEN SELECTED ON YOUR BEHALF.';

// Renders a remaining-ms value as the `0:SS` face text — the single source
// both the initial digits (before the first tick) and every subsequent tick
// use, so the two can never print a different second count for the same
// underlying value (see tick() below).
function formatDigits(remainingMs) {
  const s = Math.ceil(remainingMs / 1000);
  return `0:${String(s).padStart(2, '0')}`;
}

// Pure so "the digits go red exactly under RED_THRESHOLD_MS, nowhere else"
// is unit-testable without DOM (this project has no jsdom — see
// reviewRows/applyAmendment/certificateIndexRows/debriefClosingText above
// for the same extraction pattern). Digits only — the depletion bar is
// deliberately untouched; see tick() below.
export function timerIsRed(remainingMs) {
  return remainingMs < RED_THRESHOLD_MS;
}

export function renderQuestion(root, { question, displayName, onChoose, onExpire }) {
  // Kill any still-running loop from a prior screen before starting a new
  // one — the caller may forget to call the previous stop(), but this
  // module must not depend on that.
  if (activeStop) activeStop();

  clear(root);
  const driver = createTimerDriver(question.n);
  // Derived from DISPLAY_DURATION_MS (src/clock.js), NOT a literal — the
  // face's starting text must never be able to disagree with what the
  // first tick() below renders for the same constant.
  const digits = el('span', { class: 'timer-digits', text: formatDigits(DISPLAY_DURATION_MS) });
  const bar = el('div', { class: 'timer-bar-fill' });

  let stopped = false;      // the rAF tick loop
  let pauseTimer = null;    // the post-commit hold (selection pause OR the
                             // forced-answer notice) — tracked exactly like
                             // every other timer this project has been
                             // bitten by leaving running past its screen.

  const stopTick = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
  };

  // The screen's full teardown: stops the rAF loop AND cancels any pending
  // post-commit pause. This is what activeStop calls when a later screen
  // renders over this one (see the module-level comment above), and what a
  // caller who captures the return value can call directly. Idempotent —
  // safe to call more than once, from either source.
  const stop = () => {
    stopTick();
    if (pauseTimer !== null) { clearTimeout(pauseTimer); pauseTimer = null; }
    if (activeStop === stop) activeStop = null;
  };

  // Exactly one of a real click or an expiry may ever produce a commit —
  // see createOutcomeGate above. Both paths below route through this same
  // instance.
  const outcome = createOutcomeGate();

  const selectOption = (i) => {
    options.forEach((btn, idx) => btn.setAttribute('aria-pressed', String(idx === i)));
  };

  const schedulePause = (ms, fn) => {
    // Defensive only — the outcome gate already guarantees at most one of
    // pauseThenAdvance/showForcedAnswer is ever called per question, so
    // pauseTimer should never already be set here. If that invariant is
    // ever broken by a future change, still never let two pauses stack.
    if (pauseTimer !== null) clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => { pauseTimer = null; fn(); }, ms);
  };

  // Owned here so a trick can only ever act through a hook the screen
  // consults first — a listener attached later by applyTrick can never run
  // before the real selection below, so interception must be structural,
  // not a race against listener order.
  let interceptor = null;
  const setInterceptor = fn => { interceptor = fn; };

  const options = question.options.map((text, i) =>
    el('button', {
      class: 'option', 'data-index': String(i), 'aria-pressed': 'false',
      onclick: () => {
        if (outcome.settled) return; // the question is already decided — ignore (no re-entry, no second commit)
        let index = i;
        if (interceptor) {
          const result = interceptor(i);
          if (result === null) return; // swallowed — no selection, no commit, taker stays on the question
          index = result;              // possibly remapped
        }
        outcome.fire(() => {
          selectOption(index);
          stopTick();
          onChoose(index, driver.elapsedMs());
        });
      }
    }, [
      el('span', { class: 'option-letter', text: 'ABCD'[i] }),
      el('span', { class: 'option-text', text })
    ])
  );

  root.append(
    renderHeader(displayName),
    el('div', { class: 'question-bar' }, [
      el('span', { class: 'question-number', text: `Question ${question.n} of 24` }),
      el('span', { class: 'timer' }, [bar, digits])
    ]),
    el('p', { class: 'prompt', text: question.prompt }),
    el('div', { class: 'options' }, options)
  );

  const tick = () => {
    if (stopped) return;
    const remaining = driver.displayedRemainingMs();
    digits.textContent = formatDigits(remaining);
    // Digits only — never the depletion bar (kept minimal and typographic,
    // no flash/transition). `digits` is a fresh element created above on
    // every renderQuestion() call, so a new question's 0:30 can never
    // inherit red from the question before it.
    digits.classList.toggle('timer-digits-red', timerIsRed(remaining));
    bar.style.width = `${(remaining / DISPLAY_DURATION_MS) * 100}%`;
    if (driver.expired()) {
      outcome.fire(() => {
        stopTick();
        onExpire(driver.elapsedMs());
      });
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);
  activeStop = stop;

  // Called by main.js's onChoose handler once a real (non-swallowed) click
  // has already been committed to the transcript and any active trick's
  // detach()/finale.cancel() has already run SYNCHRONOUSLY (same
  // discipline this project applies everywhere else — teardown never moves
  // into or after a pause). The black `.option[aria-pressed="true"]` fill
  // is already showing (selectOption ran inside the outcome gate above)
  // and the rAF face is already stopped — this only holds briefly so the
  // taker actually sees it, then calls onDone (main.js's index++ /
  // nextQuestion()). Tracked by the same pauseTimer stop() above clears,
  // so a screen that goes away for any reason cannot leave this pending.
  function pauseThenAdvance(onDone, ms = SELECTION_PAUSE_MS) {
    schedulePause(ms, onDone);
  }

  // Called by main.js's onExpire handler under the same already-committed,
  // already-torn-down discipline as pauseThenAdvance above. Marks the
  // forced option selected, prints the clinical red notice (deliberately
  // flat register — no apology, no explanation), holds, then calls onDone.
  function showForcedAnswer(index, onDone) {
    selectOption(index);
    root.append(el('p', { class: 'forced-notice', text: FORCED_ANSWER_TEXT }));
    schedulePause(FORCED_ANSWER_PAUSE_MS, onDone);
  }

  return { driver, stop, optionElements: options, setInterceptor, pauseThenAdvance, showForcedAnswer };
}

// The letter alone means nothing to a taker who never memorised which
// letter they picked — the falsification only lands if the actual answer
// TEXT is shown. Returns null (never undefined) for "no valid choice to
// show", so callers get a value they can safely `?? fallback` against —
// covers both an untouched timeout (shown is null) and, defensively, any
// out-of-range index.
function answerTextFor(n, shown) {
  if (!Number.isInteger(shown) || shown < 0 || shown > 3) return null;
  return questionByNumber(n).options[shown];
}

// Pure and DOM-free so the "does an edit actually mark the row amended, and
// does the answer text change with it" behaviour can be unit-tested
// directly, not just inspected in the onclick closure below (which
// reviewRows/renderReview's own DOM-free contract can't reach). renderReview's
// EDIT handler calls this for its state change, then layers the
// DOM/animation updates on top. An unanswered row's `shown` starts null;
// treated as -1 here so the first edit lands on option A (index 0) rather
// than producing NaN.
export function applyAmendment(transcript, row) {
  const current = Number.isInteger(row.shown) ? row.shown : -1;
  const next = (current + 1) % 4;
  row.shown = next;
  row.amended = true;
  row.answerText = answerTextFor(row.n, next);
  recordAmendment(transcript, row.n, next);
  return next;
}

export function reviewRows(transcript, falsifications) {
  return transcript.entries
    .slice()
    .sort((a, b) => a.n - b.n)
    .map(e => {
      const shown = shownChoiceFor(e.n, e.choice, falsifications);
      return {
        n: e.n,
        shown,
        answerText: answerTextFor(e.n, shown),
        displayedElapsedMs: e.displayedElapsedMs,
        amended: false,
        // The instrument's own forced answer is shown exactly like any
        // other row — same letter, same text, no visual distinction there
        // — but the row is additionally branded REFUSED (renderReview
        // below). The contradiction (presented as theirs AND branded for
        // not answering) is deliberate; do not resolve it here.
        timedOut: Boolean(e.timedOut)
      };
    });
}

export function renderReview(root, { transcript, falsifications, displayName, baseScore, onContinue }) {
  // Same leaked-rAF-loop guard renderQuestion relies on (see the module-level
  // activeStop comment above): this screen starts no timer of its own, but if
  // a prior question screen's stop() was never called — the exact class of
  // bug Tasks 10-12 kept finding — its rAF loop would otherwise keep ticking
  // and writing into a subtree this clear() is about to detach.
  if (activeStop) activeStop();

  clear(root);
  const rows = reviewRows(transcript, falsifications);
  const scoreValue = el('span', { class: 'score-value', text: String(baseScore) });

  const refreshScore = () => {
    scoreValue.textContent = String(preliminaryScore(baseScore, amendmentCount(transcript)));
  };

  // Letter alone is unrecognisable to the taker; the sentence is what does
  // the work. `—` (no period) marks "nothing was recorded" distinctly from
  // an actual lettered choice.
  const letterPrefix = shown => Number.isInteger(shown) ? `${'ABCD'[shown]}.` : '—';
  const answerBody = row => row.answerText ?? '(no response recorded)';

  const rowNodes = rows.map(row => {
    const q = questionByNumber(row.n);
    const answerLetter = el('span', { class: 'answer-letter', text: letterPrefix(row.shown) });
    const answerText = el('span', { class: 'answer-text', text: answerBody(row) });
    const stamp = el('span', { class: 'correction' });
    // A quiet accusation, not a stamp: small letterspaced mono, --red, no
    // box/icon/background/rotation. The −2 correction stamp must stay the
    // loudest red thing on the page. This coexists independently of the
    // falsification marker — a row can be both REFUSED (the instrument
    // answered for the taker) and falsified (the review sheet then lies
    // about which option that was); neither marker knows or cares about
    // the other.
    const refused = row.timedOut ? el('span', { class: 'refused', text: 'REFUSED' }) : null;

    const edit = el('button', {
      class: 'edit', text: 'EDIT',
      onclick: () => {
        applyAmendment(transcript, row);
        answerLetter.textContent = letterPrefix(row.shown);
        answerText.textContent = answerBody(row);
        stamp.textContent = `−${AMENDMENT_PENALTY}`;
        stamp.classList.remove('punch');
        void stamp.offsetWidth;          // restart the animation
        stamp.classList.add('punch');
        refreshScore();
      }
    });

    return el('div', { class: 'review-row' }, [
      el('div', { class: 'review-row-head' }, [
        el('span', { class: 'review-n', text: `Q${row.n}` }),
        el('span', { class: 'review-time', text: `0:${String(Math.round(row.displayedElapsedMs / 1000)).padStart(2, '0')}` }),
        refused,
        edit,
        stamp
      ]),
      el('p', { class: 'review-prompt', text: q.prompt }),
      el('p', { class: 'review-answer' }, [answerLetter, answerText])
    ]);
  });

  root.append(
    renderHeader(displayName),                     // no EDIT control on the name
    el('h2', { class: 'section-title', text: 'REVIEW OF RESPONSES' }),
    el('p', { text: 'Confirm the record below before your results are compiled.' }),
    el('div', { class: 'score-line' }, [
      el('span', { class: 'label', text: 'PRELIMINARY SCORE' }), scoreValue
    ]),
    el('div', { class: 'review-table' }, rowNodes),
    el('button', { class: 'begin', text: 'COMPILE RESULTS', onclick: onContinue })
  );
}

export const CERTIFICATE_MAX_WIDTH_PX = 400;

function scoreBar(value) {
  const filled = Math.round(value / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

// Pure and DOM-free so the "a suppressed faculty never emits a numeric bar"
// guarantee can be unit-tested directly (test/report.test.js), not just
// inspected in renderCertificate's DOM-building closure below — this module
// has no DOM available in the test environment (see reviewRows/applyAmendment
// above for the same pattern).
//
// Built from `report.interpretation`, NEVER from a raw `faculties` object.
// faculties.composure still holds a real (fake-perfect-100) number even when
// the Q23 finale never ran for this taker — only report.interpretation
// carries the score:null + clinical-note suppression that keeps that number
// off the certificate (see composureAssessed() in src/scoring.js and
// buildReport() in src/report.js). Drawing bars from `faculties` here would
// reopen that leak from a third angle.
export function certificateIndexRows(interpretation) {
  return interpretation.map(p =>
    p.score === null
      ? { facultyKey: p.facultyKey, label: p.label, note: 'NOT ASSESSED' }
      : {
          facultyKey: p.facultyKey,
          label: p.label,
          bar: scoreBar(p.score),
          score: String(p.score).padStart(3, ' ')
        }
  );
}

// `faculties` is accepted (not just `report`) to match this screen's call
// site in main.js/Task 15, but is deliberately UNUSED for the index table —
// see certificateIndexRows above for why.
export function renderCertificate(root, { report, faculties, centile, onDebrief }) {
  // Same leaked-rAF-loop guard every other screen opens with (see the
  // module-level activeStop comment above). The certificate starts no timer
  // of its own, but must still kill a still-running question-screen loop if
  // this screen is ever reached without a prior stop().
  if (activeStop) activeStop();

  clear(root);

  const indexRows = certificateIndexRows(report.interpretation).map(row =>
    row.note
      ? el('div', { class: 'index-row suppressed' }, [
          el('span', { class: 'index-label', text: row.label }),
          el('span', { class: 'index-note', text: row.note })
        ])
      : el('div', { class: 'index-row' }, [
          el('span', { class: 'index-label', text: row.label }),
          el('span', { class: 'index-bar', text: row.bar }),
          el('span', { class: 'index-score', text: row.score })
        ])
  );

  const paragraphs = report.interpretation.map(p =>
    el('p', { class: 'interpretation', text: p.paragraph })
  );

  root.append(
    el('div', { class: 'certificate' }, [
      el('div', { class: 'cert-head' }, [
        el('div', { class: 'label', text: report.header.instrument }),
        el('div', { class: 'label', text: `SUBJECT: ${report.header.subject}` }),
        el('div', { class: 'label', text: report.header.administration })
      ]),
      el('h2', { class: 'section-title', text: 'SUMMARY OF FINDINGS' }),
      ...report.summary.map(s => el('p', { text: s })),
      el('div', { class: 'index-table' }, indexRows),
      el('h2', { class: 'section-title', text: 'INTERPRETATION' }),
      ...paragraphs,
      el('h2', { class: 'section-title', text: 'BEHAVIOURAL OBSERVATIONS' }),
      ...report.observations.map(o => el('p', { text: o })),
      el('h2', { class: 'section-title', text: 'RECOMMENDATIONS AND LIMITATIONS' }),
      ...report.recommendations.map(r => el('p', { text: r })),
      el('p', { class: 'closer', text: report.closer }),
      el('div', { class: 'cert-foot', text: `σ = 0.03 · n = 1 · p < .0001 · ${ordinal(centile)} centile` })
    ]),
    el('a', { class: 'debrief-link', href: '#debrief', text: 'About this instrument', onclick: onDebrief })
  );
}

// The debrief page. Reached only via the certificate's "About this
// instrument" link (renderCertificate's onDebrief above) — never shown
// automatically, and never linked from anywhere else. This is also the
// ONLY screen carrying the Ko-fi URL: it must never appear on the
// certificate itself, where a donation ask would puncture the tone (see
// Task 15's binding constraints and test/integration.test.js's
// self-containment check, which exempts exactly this one URL).
//
// `typoApplied` (default false) gates the closing paragraph's misspelling
// clause: the debrief used to state unconditionally that "your name was
// misspelled from question eleven onward", but introduceTypo can leave a
// name uncorrupted (kind 'none' — too short to corrupt safely, or, before
// the Unicode widening above, an accented name the old guard rejected
// outright). Stating the claim to a taker for whom it never happened is a
// checkable lie on the closing paragraph of a piece about deception, so the
// caller (main.js) passes typo.kind !== 'none' and the sentence is dropped
// entirely rather than printed false. The rest of the wording is unchanged
// either way.
//
// `onBack`, when supplied, renders a quiet "Return to certificate" link
// (same register as the existing debrief link — no button styling, no new
// colour) that re-renders the certificate the taker already saw, since this
// page used to be a one-way door: the only prior route forward was
// clear(root), so Back did nothing and returning meant retaking all 24
// questions. The caller is expected to re-render from an ALREADY-COMPUTED
// report/faculties/centile (see main.js) — buildReport draws from the
// shared seeded rng, so recomputing it here would draw a second, different
// set of statements and the taker would not recognise their own report.
// Pure and DOM-free so the "the misspelling clause only appears when a typo
// was actually applied" guarantee can be unit-tested directly (see
// reviewRows/applyAmendment/certificateIndexRows above for the same
// extraction pattern; no jsdom in this project).
const DEBRIEF_CLOSING_BASE =
  'The timer always showed thirty seconds. It did not always give you thirty seconds. Some of your clicks were interfered with. Three answers on the review sheet were changed before you saw them';

export function debriefClosingText(typoApplied) {
  return typoApplied
    ? `${DEBRIEF_CLOSING_BASE}, and your name was misspelled from question eleven onward.`
    : `${DEBRIEF_CLOSING_BASE}.`;
}

export function renderDebrief(root, { typoApplied = false, onBack } = {}) {
  // Same leaked-rAF-loop guard every other screen opens with (see the
  // module-level activeStop comment above).
  if (activeStop) activeStop();

  clear(root);
  const closing = debriefClosingText(typoApplied);

  const links = [
    el('a', { class: 'debrief-link', href: 'https://ko-fi.com/clevermonkey', text: 'ko-fi.com/clevermonkey' })
  ];
  if (onBack) {
    links.unshift(
      el('a', { class: 'debrief-link', href: '#certificate', text: 'Return to certificate', onclick: onBack })
    );
  }

  root.append(
    el('h2', { class: 'section-title', text: 'ABOUT THIS INSTRUMENT' }),
    el('p', { text: 'The Cavendish–Pettigrew Reflective Aptitude Inventory does not measure anything. It is a demonstration of two well-documented effects.' }),
    el('p', { text: 'The first is cognitive reflection: some questions have an intuitive answer that arrives quickly and is confidently wrong. The opening items were real, and if you got some of them wrong, you got them wrong the way most people do.' }),
    el('p', { text: 'The second is the Barnum, or Forer, effect: people rate vague, universally true descriptions as highly accurate personal assessments. Every statement in your report was drawn from a fixed pool. Somebody else received most of the same sentences.' }),
    el('p', { text: closing }),
    el('p', { text: 'None of it was about you. Thank you for sitting it.' }),
    ...links
  );
}
