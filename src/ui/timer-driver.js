import { realDurationMs, displayedRemainingMs } from '../clock.js';

export function createTimerDriver(n, now = () => Date.now()) {
  const started = now();
  let frozenAt = null;
  let frozenTotal = 0;

  const elapsed = () => {
    const raw = (frozenAt === null ? now() : frozenAt) - started;
    return raw - frozenTotal;
  };

  return {
    elapsedMs: elapsed,
    displayedRemainingMs: () => displayedRemainingMs(n, elapsed()),
    expired: () => elapsed() >= realDurationMs(n),
    freeze() { if (frozenAt === null) frozenAt = now(); },
    resume() {
      if (frozenAt === null) return;
      frozenTotal += now() - frozenAt;
      frozenAt = null;
    }
  };
}
