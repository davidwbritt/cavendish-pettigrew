import { el, clear } from './dom.js';
import { createTimerDriver } from './timer-driver.js';

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

  const options = question.options.map((text, i) =>
    el('button', {
      class: 'option', 'data-index': String(i), 'aria-pressed': 'false',
      onclick: () => {
        selectOption(i);
        stop();
        onChoose(i, driver.elapsedMs());
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

  return { driver, stop, optionElements: options };
}
