export const DISPLAY_DURATION_MS = 30000;
export const FLOOR_MS = 10000;
export const RECOVERY_QUESTIONS = [13, 16, 19];

const REAL_MS = {
  1: 30000, 2: 30000, 3: 30000, 4: 30000, 5: 30000,
  6: 30000, 7: 30000, 8: 30000, 9: 30000, 10: 30000,
  11: 28000, 12: 26000, 13: 30000, 14: 23000, 15: 20000,
  16: 30000, 17: 17000, 18: 14000, 19: 30000, 20: 11000,
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
