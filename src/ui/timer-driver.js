import { realDurationMs, displayedRemainingMs } from '../clock.js';

export function createTimerDriver(n, now = () => Date.now()) {
  const started = now();
  let frozenAt = null;
  let frozenTotal = 0;
  let forced = false;

  const elapsed = () => {
    // Short-circuits the frozen/running distinction entirely: a driver told
    // to expire is expired, whether or not it was frozen at the time. The
    // Q23 finale calls this while the clock is still frozen (src/ui/cursor.js).
    if (forced) return realDurationMs(n);
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
    },
    // Drops the clock to zero on the spot. The rAF tick in renderQuestion
    // picks it up on the next frame: the face renders 0:00 and expired()
    // reports true, which fires the question's normal expiry path through
    // the outcome gate. Deliberately NOT a separate outcome — the instrument
    // has exactly one way of dealing with a question nobody answered, and
    // this makes the finale use it rather than inventing a second.
    //
    // One-way and irreversible: nothing resumes a forced clock. resume()
    // remains for the abort paths, which must leave the taker's remaining
    // time exactly as they found it.
    expire() { forced = true; }
  };
}
