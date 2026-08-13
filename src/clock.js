export const DISPLAY_DURATION_MS = 30000;
export const FLOOR_MS = 10000;
export const RECOVERY_QUESTIONS = [13, 16, 19];

// Timer digits render in var(--red) once displayedRemainingMs drops under
// this — named here (not at the render site) so the render-side check and
// this value can never drift apart. See src/ui/screens.js's tick().
export const RED_THRESHOLD_MS = 10000;

// Rushed from Q6 onward (the honest deposit shortens to Q1-5). Non-recovery
// values are monotonically non-increasing: 30,30,30,30,30,28,26,24,22,20,
// 18,16,15,14,13,12,11,10,10,10,10 — verified by
// test/clock.test.js's "the duration curve matches the specified table
// exactly" and "real duration is monotonically non-increasing outside
// recovery questions".
const REAL_MS = {
  1: 30000, 2: 30000, 3: 30000, 4: 30000, 5: 30000,
  6: 28000, 7: 26000, 8: 24000, 9: 22000, 10: 20000,
  11: 18000, 12: 16000, 13: 30000, 14: 15000, 15: 14000,
  16: 30000, 17: 13000, 18: 12000, 19: 30000, 20: 11000,
  21: 10000, 22: 10000, 23: 10000, 24: 10000
};

export function realDurationMs(n) {
  const ms = REAL_MS[n];
  if (ms === undefined) throw new RangeError(`no duration for question ${n}`);
  return ms;
}

export function displayedRemainingMs(n, elapsedMs) {
  const real = realDurationMs(n);
  const fraction = Math.min(1, Math.max(0, elapsedMs / real));
  return Math.round(DISPLAY_DURATION_MS * (1 - fraction));
}
