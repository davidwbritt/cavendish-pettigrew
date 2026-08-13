import { el, clear } from './dom.js';
import { createTimerDriver } from './timer-driver.js';
import { shownChoiceFor } from '../falsify.js';
import { recordAmendment, amendmentCount } from '../transcript.js';
import { preliminaryScore, AMENDMENT_PENALTY } from '../scoring.js';
import { questionByNumber } from '../questions.js';

// Guards against a leaked rAF loop: rendering any new question screen
// unconditionally kills the previous one's timer loop, even if the caller
// forgot to capture and call the returned stop().
let activeStop = null;

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

export function renderQuestion(root, { question, displayName, onChoose, onExpire }) {
  // Kill any still-running loop from a prior screen before starting a new
  // one — the caller may forget to call the previous stop(), but this
  // module must not depend on that.
  if (activeStop) activeStop();

  clear(root);
  const driver = createTimerDriver(question.n);
  const digits = el('span', { class: 'timer-digits', text: '0:45' });
  const bar = el('div', { class: 'timer-bar-fill' });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(raf);
    if (activeStop === stop) activeStop = null;
  };

  const selectOption = (i) => {
    options.forEach((btn, idx) => btn.setAttribute('aria-pressed', String(idx === i)));
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
        let index = i;
        if (interceptor) {
          const result = interceptor(i);
          if (result === null) return; // swallowed — no selection, no commit
          index = result;              // possibly remapped
        }
        selectOption(index);
        stop();
        onChoose(index, driver.elapsedMs());
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
    const s = Math.ceil(remaining / 1000);
    digits.textContent = `0:${String(s).padStart(2, '0')}`;
    bar.style.width = `${(remaining / 45000) * 100}%`;
    if (driver.expired()) { stop(); onExpire(driver.elapsedMs()); return; }
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);
  activeStop = stop;

  return { driver, stop, optionElements: options, setInterceptor };
}

// Pure and DOM-free so the "does an edit actually mark the row amended"
// behaviour can be unit-tested directly, not just inspected in the onclick
// closure below (which reviewRows/renderReview's own DOM-free contract can't
// reach). renderReview's EDIT handler calls this for its state change, then
// layers the DOM/animation updates on top.
export function applyAmendment(transcript, row) {
  const next = (row.shown + 1) % 4;
  row.shown = next;
  row.amended = true;
  recordAmendment(transcript, row.n, next);
  return next;
}

export function reviewRows(transcript, falsifications) {
  return transcript.entries
    .slice()
    .sort((a, b) => a.n - b.n)
    .map(e => ({
      n: e.n,
      shown: shownChoiceFor(e.n, e.choice, falsifications),
      displayedElapsedMs: e.displayedElapsedMs,
      amended: false
    }));
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

  const rowNodes = rows.map(row => {
    const q = questionByNumber(row.n);
    const answerCell = el('span', { class: 'answer', text: 'ABCD'[row.shown] ?? '—' });
    const stamp = el('span', { class: 'correction' });

    const edit = el('button', {
      class: 'edit', text: 'EDIT',
      onclick: () => {
        const next = applyAmendment(transcript, row);
        answerCell.textContent = 'ABCD'[next];
        stamp.textContent = `−${AMENDMENT_PENALTY}`;
        stamp.classList.remove('punch');
        void stamp.offsetWidth;          // restart the animation
        stamp.classList.add('punch');
        refreshScore();
      }
    });

    return el('div', { class: 'review-row' }, [
      el('span', { class: 'review-n', text: `Q${row.n}` }),
      el('span', { class: 'review-prompt', text: q.prompt }),
      answerCell,
      el('span', { class: 'review-time', text: `0:${String(Math.round(row.displayedElapsedMs / 1000)).padStart(2, '0')}` }),
      edit,
      stamp
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
      el('div', { class: 'cert-foot', text: `σ = 0.03 · n = 1 · p < .0001 · ${centile}th centile` })
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
export function renderDebrief(root) {
  // Same leaked-rAF-loop guard every other screen opens with (see the
  // module-level activeStop comment above).
  if (activeStop) activeStop();

  clear(root);
  root.append(
    el('h2', { class: 'section-title', text: 'ABOUT THIS INSTRUMENT' }),
    el('p', { text: 'The Cavendish–Pettigrew Reflective Aptitude Inventory does not measure anything. It is a demonstration of two well-documented effects.' }),
    el('p', { text: 'The first is cognitive reflection: some questions have an intuitive answer that arrives quickly and is confidently wrong. The opening items were real, and if you got some of them wrong, you got them wrong the way most people do.' }),
    el('p', { text: 'The second is the Barnum, or Forer, effect: people rate vague, universally true descriptions as highly accurate personal assessments. Every statement in your report was drawn from a fixed pool. Somebody else received most of the same sentences.' }),
    el('p', { text: 'The timer always showed forty-five seconds. It did not always give you forty-five seconds. Some of your clicks were interfered with. Three answers on the review sheet were changed before you saw them, and your name was misspelled from question eleven onward.' }),
    el('p', { text: 'None of it was about you. Thank you for sitting it.' }),
    el('a', { class: 'debrief-link', href: 'https://ko-fi.com/clevermonkey', text: 'ko-fi.com/clevermonkey' })
  );
}
