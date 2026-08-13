import { el, clear } from './dom.js';
import { createTimerDriver } from './timer-driver.js';

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
  clear(root);
  const driver = createTimerDriver(question.n);
  const digits = el('span', { class: 'timer-digits' });
  const bar = el('div', { class: 'timer-bar-fill' });

  const options = question.options.map((text, i) =>
    el('button', {
      class: 'option', 'data-index': String(i),
      onclick: () => onChoose(i, driver.elapsedMs())
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
    const remaining = driver.displayedRemainingMs();
    const s = Math.ceil(remaining / 1000);
    digits.textContent = `0:${String(s).padStart(2, '0')}`;
    bar.style.width = `${(remaining / 45000) * 100}%`;
    if (driver.expired()) { stop(); onExpire(driver.elapsedMs()); return; }
    raf = requestAnimationFrame(tick);
  };
  let raf = requestAnimationFrame(tick);
  const stop = () => cancelAnimationFrame(raf);

  return { driver, stop, optionElements: options };
}
