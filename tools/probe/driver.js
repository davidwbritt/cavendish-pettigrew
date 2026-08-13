// Headless click-through driver for the Cavendish-Pettigrew instrument.
// Appended to a SCRATCHPAD COPY of dist/index.html — never committed.
//
// Drives: landing -> 24 questions -> review -> certificate -> debrief,
// recording what it saw at each step into window.__TRACE, which is then
// printed into the DOM so --dump-dom can carry it back out.
//
// Design notes:
//  - Clicks are RETRIED. Several tricks deliberately swallow the first click
//    (deadClick, and now stickyAnswer/doubleMark), so a single click per
//    question is not enough to advance. Retrying is what proves they fire.
//  - We never advance by waiting for the timer: that would take 20-45s of
//    virtual time per question and tells us nothing about the click path.

(function () {
  const TRACE = [];
  window.__TRACE = TRACE;
  const log = (...a) => TRACE.push(a.join(' '));

  const TIMEOUT_QUESTIONS = new Set([3, 7]);   // let these expire on purpose
  const $ = sel => document.querySelector(sel);
  const $$ = sel => [...document.querySelectorAll(sel)];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // What screen are we on? Inferred from DOM landmarks rather than app state,
  // so the driver stays honest about what actually rendered.
  function screenKind() {
    if ($('.name-input')) return 'landing';
    if ($('.review-table')) return 'review';
    if ($('.mark-table')) return 'marking';
    if ($('.certificate')) return 'certificate';
    if ($('.options')) return 'question';
    if (document.body.textContent.includes('ABOUT THIS INSTRUMENT')) return 'debrief';
    return 'unknown';
  }

  function questionNumber() {
    const m = ($('.question-number')?.textContent || '').match(/Question (\d+)/);
    return m ? Number(m[1]) : null;
  }

  function timerFace() {
    return ($('.timer-digits')?.textContent || '').trim();
  }

  function subjectName() {
    return ($$('.field .value')[0]?.textContent || '').trim();
  }

  async function run() {
    if (screenKind() !== 'landing') { log('FATAL: did not start on landing'); return finish(); }

    // The name field must already hold the caret when the page settles —
    // the taker should not have to find and click it.
    log('landing: name input focused on load? ' + (document.activeElement === $('.name-input')));
    log('landing: caret-color = ' + getComputedStyle($('.name-input')).caretColor);
    {
      const body = document.body.innerText || '';
      // The instruction that is not true. There is no skip control anywhere.
      log('landing: skip promised? ' + body.includes('you may skip it to advance to the next'));
      log('landing: thirty-second promise present (undefended)? ' + body.includes('An ample thirty seconds is allowed for each item'));
      log('landing: any skip/pass control rendered? '
        + $$('button').map(b => b.textContent.trim()).join('|'));
    }

    $('.name-input').value = 'DAVID BRITT';
    log('landing: entered DAVID BRITT');
    $('.begin').click();
    await sleep(30);

    const seenQuestions = new Set();
    const clicksPerQuestion = {};
    const committed = {};   // question number -> option index that finally took
    const timedOutQuestions = [];
    const lockedOut = [];
    const pauseSeen = new Set();
    const holdEvidence = [];
    const tallySeen = new Set();
    const tallyEvidence = [];
    // Questions on which the refusal notice was observed at any point, by
    // any polling loop. Shared so no single loop has to be the one looking.
    const refusalSeen = new Set();
    const noteRefusal = n => {
      if (!refusalSeen.has(n) && (document.body.innerText || '').includes('DECLINED TO ANSWER')) {
        refusalSeen.add(n);
      }
    };
    let guard = 0;

    while (screenKind() === 'question' && guard++ < 400) {
      const n = questionNumber();
      if (n === null) { log('FATAL: question screen with no number'); break; }

      if (!seenQuestions.has(n)) {
        seenQuestions.add(n);
        log(`Q${n}: face=${timerFace()} name=${subjectName()}`);
      }

      const opts = $$('.option');
      if (!opts.length) { log(`FATAL: Q${n} rendered no options`); break; }

      // Deliberately let a couple of questions run out, to exercise the
      // forced-answer path. Never click these.
      if (TIMEOUT_QUESTIONS.has(n)) {
        let waited = 0, sawNotice = false;
        while (questionNumber() === n && waited < 70000) {
          await sleep(250); waited += 250;
          if (!sawNotice && (document.body.innerText || '').includes('DECLINED TO ANSWER')) {
            sawNotice = true;
            log(`Q${n}: TIMEOUT notice shown after ~${waited}ms; face=${timerFace()}`);
            const marked = $$('.option[aria-pressed="true"]').length;
            log(`Q${n}: options marked at timeout = ${marked} (expect 1, the forced pick)`);
          }
        }
        timedOutQuestions.push(n);
        log(`Q${n}: ${sawNotice ? 'advanced after notice' : 'FATAL: expired with NO notice'} (waited ${waited}ms)`);
        continue;
      }

      clicksPerQuestion[n] = (clicksPerQuestion[n] || 0) + 1;
      const idx = clicksPerQuestion[n] % opts.length;
      opts[idx].click();

      // A committed selection holds with the option filled black, and the
      // tally readout printed under it, before advancing. Sample mid-hold to
      // confirm both are visible.
      await sleep(120);
      if (questionNumber() === n) {
        const pressed = $$('.option[aria-pressed="true"]');
        if (pressed.length && !pauseSeen.has(n)) {
          pauseSeen.add(n);
          holdEvidence.push(n);
        }
        const tally = $$('.tally-line').map(e => e.textContent);
        if (tally.length && !tallySeen.has(n)) {
          tallySeen.add(n);
          tallyEvidence.push({ n, lines: tally });
        }
      }

      // WAIT FOR THE ADVANCE — never assume a duration. This used to sleep a
      // flat 700ms, tuned to the old 500ms SELECTION_PAUSE_MS. When the hold
      // grew to 1200ms (and textSwap's to 1700ms) to make the tally readable,
      // that sleep returned while the screen was still holding, so the probe
      // fell through and clicked a SECOND time on a question the outcome gate
      // had already settled. The extra click changed nothing in the app but
      // moved the probe's own `idx`, so it recorded the wrong answer for
      // itself and then reported six falsified rows where the app had
      // correctly written three. A probe bug that reads exactly like an app
      // bug — the reason this file's own results are never trusted before
      // being read. Polling for the transition cannot drift with the tuning.
      let held = 0;
      while (questionNumber() === n && held < 2600) {
        await sleep(100); held += 100;
        // Watch for the refusal notice HERE too, not only in the lockout
        // branch below. On a locked-out question every click now burns the
        // full 2600ms above, so a question whose real duration is short
        // (Q17 allows 13s) expires INSIDE this loop: the notice appears and
        // the forced-answer hold elapses before the branch below is ever
        // reached, whose `questionNumber() === n` guard then fails so its
        // body never runs and its local `notice` stays false. That printed
        // a FATAL for a lockout the app had resolved perfectly. Recording
        // the sighting in shared state is what decouples "did the notice
        // appear" from "was the probe looking at that instant".
        noteRefusal(n);
      }
      // Whatever index we last clicked before leaving is what we believe we answered.
      if (questionNumber() !== n) committed[n] = idx;

      // Still here after several clicks? Either a swallow trick (bounded, the
      // next click lands) or the LOCKOUT trick, which by design cannot be
      // clicked past at all — only the expiring timer resolves it into a
      // forced answer. Stop clicking and wait it out, as a real taker must.
      // Deliberately NOT guarded on still being on the question: the notice
      // may already have come and gone during the hold above.
      if (clicksPerQuestion[n] > 5) {
        let waited = 0;
        while (questionNumber() === n && waited < 70000) {
          await sleep(250); waited += 250;
          noteRefusal(n);
        }
        lockedOut.push(n);
        log(refusalSeen.has(n)
          ? `Q${n}: LOCKOUT — ${clicksPerQuestion[n]} clicks refused, timer rescued it`
          : `Q${n}: FATAL — refused every click AND never showed the forced-answer notice`);
        continue;
      }
    }

    log('questions LOCKED OUT (timer rescued): ' + JSON.stringify(lockedOut));
    log('clicks per question: ' + JSON.stringify(clicksPerQuestion));
    log('questions where the black selection hold was observed mid-pause: ' + JSON.stringify(holdEvidence));
    log('questions where the tally readout was observed mid-hold: ' + JSON.stringify(tallyEvidence.map(t => t.n)));
    for (const t of tallyEvidence.slice(0, 3)) {
      log(`tally Q${t.n}: ` + t.lines.join('  ||  '));
    }
    log('tally Q(last): ' + (tallyEvidence.length ? tallyEvidence[tallyEvidence.length - 1].lines.join('  ||  ') : 'NONE SEEN'));
    {
      const bad = tallyEvidence.filter(t => t.lines.join(' ').match(/undefined|NaN/));
      log('tally rows containing undefined/NaN = ' + bad.length + ' (expect 0)');
    }
    const swallowed = Object.entries(clicksPerQuestion).filter(([, c]) => c > 1);
    log('questions needing >1 click (tricks firing): ' + JSON.stringify(swallowed));

    if (screenKind() === 'review') {
      const rows = $$('.review-row');
      log(`review: ${rows.length} rows, name=${subjectName()}`);

      // The real test: is the falsification VISIBLE? Q1-10 carry no tricks, so
      // anything the sheet shows there that differs from what we actually
      // clicked is a falsified row. Compare TEXT, not just letters — a bare
      // letter is exactly what the taker cannot remember.
      const mismatches = [];
      rows.forEach(row => {
        // Read the number from its OWN element. Reading it out of the row's
        // textContent misparses: the head renders "Q2" immediately followed by
        // "0:00", so /Q(\d+)/ greedily yields 20.
        const nText = (row.querySelector('.review-n')?.textContent || '').trim();
        const nMatch = nText.match(/^Q(\d+)$/);
        if (!nMatch) return;
        const n = Number(nMatch[1]);
        const shownText = (row.querySelector('.review-answer')?.textContent || '').trim();
        const clickedIdx = committed[n];
        if (clickedIdx === undefined) return;
        const clickedLetter = 'ABCD'[clickedIdx];
        const shownLetter = (shownText.match(/^([A-D])/) || [])[1];
        if (shownLetter && shownLetter !== clickedLetter) {
          mismatches.push({ n, clicked: clickedLetter, shown: shownText.slice(0, 60) });
        }
      });
      log('review: rows differing from what we clicked = ' + JSON.stringify(mismatches));
      // Timed-out questions were never clicked, so exclude them from the
      // falsification count — the instrument chose those answers itself.
      const deposit = mismatches.filter(m => m.n <= 10 && !timedOutQuestions.includes(m.n));
      log('review: falsified deposit rows (excluding timeouts) = ' + deposit.length + ' (expect exactly 3)');

      const refusedEls = $$('.refused');
      log('review: REFUSED markers = ' + refusedEls.length + ', timed-out questions were ' +
          JSON.stringify(timedOutQuestions));
      const refusedRows = refusedEls.map(e => (e.closest('.review-row')?.querySelector('.review-n')?.textContent || '').trim());
      log('review: REFUSED rows = ' + JSON.stringify(refusedRows));
      // A REFUSED row must still show a real lettered answer, not a dash.
      refusedEls.forEach(e => {
        const row = e.closest('.review-row');
        const ans = (row?.querySelector('.review-answer')?.textContent || '').trim();
        log('review: REFUSED row answer = ' + JSON.stringify(ans.slice(0, 50)));
      });

      // Dump three rows verbatim so we can see what a taker actually reads.
      rows.slice(0, 3).forEach((r, i) =>
        log(`review: row sample ${i + 1} = ` + (r.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 160)));

      const edit = $('.edit');
      const scoreBefore = $('.score-value')?.textContent;
      if (edit) {
        const rowBefore = (edit.closest('.review-row')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        edit.click();
        await sleep(30);
        const rowAfter = (edit.closest('.review-row')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
        log(`review: edited one row, score ${scoreBefore} -> ${$('.score-value')?.textContent}`);
        log('review: row BEFORE edit = ' + rowBefore);
        log('review: row AFTER  edit = ' + rowAfter);
        log('review: answer text actually changed? ' + (rowBefore !== rowAfter));
        log('review: correction stamp text = ' + ($('.correction')?.textContent || '(none)'));

        // Cycle the SAME row twice more. The stamp must accumulate -2 -> -4
        // -> -6 in step with the running total; it used to print a constant
        // -2 while the score fell by six.
        const stamps = [$('.correction')?.textContent];
        const scores = [$('.score-value')?.textContent];
        for (let k = 0; k < 2; k++) {
          edit.click(); await sleep(30);
          stamps.push($('.correction')?.textContent);
          scores.push($('.score-value')?.textContent);
        }
        log('review: stamp across 3 edits of one row = ' + JSON.stringify(stamps) + ' (expect -2,-4,-6)');
        log('review: score across those edits = ' + JSON.stringify(scores) + ' (expect 98,96,94)');
      }
      log('review: any literal "undefined" on screen? ' + /undefined/.test(document.body.innerText || ''));
      $$('button').find(b => /COMPILE/i.test(b.textContent))?.click();
      await sleep(40);
    } else {
      log('FATAL: never reached review, ended on ' + screenKind());
    }

    if (screenKind() === 'marking') {
      const rows = $$('.mark-row');
      log('marking: rows = ' + rows.length + ' (expect 24)');
      log('marking: score line = ' + ($('.score-value')?.textContent || 'MISSING'));
      log('marking: agrees = ' + $$('.mark-ok').length + ', discrepant = ' + $$('.mark-bad').length);
      // The whole point: the instrument marks a preference question.
      const colour = rows[19];
      if (colour) log('marking: Q20 = ' + colour.textContent.replace(/\s+/g, ' ').trim().slice(0, 200));
      const fair = rows[22];
      if (fair) log('marking: Q23 = ' + fair.textContent.replace(/\s+/g, ' ').trim().slice(0, 200));
      log('marking: any literal "undefined" on screen? ' + /undefined/.test(document.body.innerText || ''));
      $$('button').find(b => /CONTINUE TO ASSESSMENT/i.test(b.textContent))?.click();
      await sleep(40);
    } else {
      log('FATAL: never reached the marked paper, ended on ' + screenKind());
    }

    if (screenKind() === 'certificate') {
      log('certificate: rendered');
      log('certificate: subject line = ' + ($('.cert-head')?.textContent || '').trim().slice(0, 120));
      log('certificate: index rows = ' + $$('.index-row').length);
      log('certificate: suppressed rows = ' + $$('.index-row.suppressed').length);
      log('certificate: footer = ' + ($('.cert-foot')?.textContent || '').trim());
      const body = document.body.textContent;
      log('certificate: mentions ko-fi? ' + /ko-?fi/i.test(body));
      // The instrument corrupted the name at Q11 and now bills the taker.
      const nameNote = [...$$('.cert-observations li, .cert-observations p, li, p')]
        .map(e => e.textContent).find(t => /NAME DISCREPANCY/.test(t));
      log('certificate: name discrepancy noted? ' + Boolean(nameNote));
      if (nameNote) log('certificate: note = ' + nameNote.replace(/\s+/g, ' ').trim().slice(0, 220));
      const kappa = [...$$('.index-row')].map(e => e.textContent)
        .find(t => /RESPONSE CONSISTENCY/.test(t));
      log('certificate: kappa row = ' + (kappa || 'MISSING').replace(/\s+/g, ' ').trim().slice(0, 90));
      $('.debrief-link')?.click();
      await sleep(30);
      log('after debrief click, screen = ' + screenKind());
      await sleep(60);
      const keyRows = $$('.key-row');
      log('debrief: answer-key rows = ' + keyRows.length + ' (expect 24)');
      log('debrief: verdict markers = ' + $$('.key-tick').length + ' correct, '
        + $$('.key-cross').length + ' incorrect, ' + $$('.key-none').length + ' unscorable');
      log('debrief: RECORD SAID rows = ' + $$('.key-falsified').length + ' (expect 3)');
      const summary = [...$$('p')].map(p => p.textContent).find(t => /items that had a right answer/.test(t));
      log('debrief: summary = ' + (summary || 'MISSING').slice(0, 160));
      if (keyRows[0]) log('debrief: key row 1 = ' + keyRows[0].textContent.replace(/\s+/g, ' ').trim().slice(0, 200));
      const falsifiedRow = $('.key-falsified')?.closest('.key-row');
      if (falsifiedRow) log('debrief: a falsified row = ' + falsifiedRow.textContent.replace(/\s+/g, ' ').trim().slice(0, 230));
      log('debrief: any literal "undefined" on screen? ' + /undefined/.test(document.body.innerText || ''));
    } else {
      log('FATAL: no certificate, ended on ' + screenKind());
    }

    finish();
  }

  function finish() {
    const pre = document.createElement('pre');
    pre.id = 'TRACE';
    pre.textContent = '\n===TRACE-START===\n' + TRACE.join('\n') + '\n===TRACE-END===\n';
    document.body.appendChild(pre);
  }

  if (document.readyState === 'complete') setTimeout(run, 50);
  else window.addEventListener('load', () => setTimeout(run, 50));
})();
