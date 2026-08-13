export const DISPLAY_DURATION_MS = 45000;
export const FLOOR_MS = 20000;
export const RECOVERY_QUESTIONS = [13, 16, 19];

const REAL_MS = {
  1: 45000, 2: 45000, 3: 45000, 4: 45000, 5: 45000,
  6: 45000, 7: 45000, 8: 45000, 9: 45000, 10: 45000,
  11: 42000, 12: 38000, 13: 45000, 14: 34000, 15: 30000,
  16: 45000, 17: 27000, 18: 24000, 19: 45000, 20: 21000,
  21: 20000, 22: 20000, 23: 20000, 24: 20000
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
