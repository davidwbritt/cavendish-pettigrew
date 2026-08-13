console.log('instrument loaded');

// Defensive backstop alongside runFinale's own keydown handler (src/ui/cursor.js):
// runFinale is the primary mechanism — it fully tears down the finale (detaches
// the cursor, cancels pending timers, resumes the frozen timer) on ANY keydown,
// not just Escape. This listener is a permanent, cheap belt-and-suspenders: if
// `cursor-hidden` were ever left on the body by any future code path, Escape
// always clears it, because a stuck `cursor: none` is unrecoverable without a
// page reload.
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.body.classList.remove('cursor-hidden');
});
