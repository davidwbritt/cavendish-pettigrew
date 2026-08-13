import { pick } from './rng.js';

export const TYPO_KINDS = ['adjacent', 'transpose', 'double', 'drop', 'none'];
export const TYPO_FROM_QUESTION = 11;

const ADJACENT = {
  a: 'sqwz', b: 'vgn', c: 'xdv', d: 'sfe', e: 'wrd', f: 'dgr', g: 'fhty',
  h: 'gjyu', i: 'uok', j: 'hkui', k: 'jlio', l: 'kop', m: 'nj', n: 'bmh',
  o: 'ipl', p: 'ol', q: 'wa', r: 'etf', s: 'adw', t: 'ryg', u: 'yih',
  v: 'cbg', w: 'qes', x: 'zcs', y: 'tuh', z: 'asx'
};

export function introduceTypo(name, rng) {
  const original = name ?? '';
  // Accept: must start with letter, then can have letters, spaces, hyphens, apostrophes
  if (original.length < 3 || !/^[A-Za-z][A-Za-z' -]*$/.test(original)) {
    return { original, display: original, kind: 'none' };
  }

  // Find all positions that contain letters
  const letterPositions = [];
  for (let i = 0; i < original.length; i++) {
    if (/[A-Za-z]/.test(original[i])) {
      letterPositions.push(i);
    }
  }

  // Need at least 3 letters to corrupt safely
  if (letterPositions.length < 3) {
    return { original, display: original, kind: 'none' };
  }

  const kinds = ['adjacent', 'transpose', 'double', 'drop'];
  for (let attempt = 0; attempt < 20; attempt++) {
    const kind = pick(rng, kinds);
    const display = apply(kind, original, rng, letterPositions);
    if (display && display !== original) return { original, display, kind };
  }
  return { original, display: original, kind: 'none' };
}

function apply(kind, name, rng, letterPositions) {
  const chars = [...name];

  if (kind === 'adjacent') {
    // Pick from letter positions excluding the first one (position 0)
    const availablePositions = letterPositions.filter(pos => pos > 0);
    if (availablePositions.length === 0) return null;
    const i = pick(rng, availablePositions);

    const lower = chars[i].toLowerCase();
    const neighbours = ADJACENT[lower];
    if (!neighbours) return null;
    const replacement = pick(rng, [...neighbours]);
    chars[i] = chars[i] === chars[i].toUpperCase()
      ? replacement.toUpperCase() : replacement;
    return chars.join('');
  }

  if (kind === 'transpose') {
    // Find pairs of consecutive letters where the second position >= 2 (to avoid changing position 0)
    const availablePositions = [];
    for (let j = 1; j < letterPositions.length; j++) {
      const prevLetterPos = letterPositions[j - 1];
      const currLetterPos = letterPositions[j];
      // Consecutive letters with second position >= 2
      if (prevLetterPos + 1 === currLetterPos && currLetterPos >= 2) {
        availablePositions.push(currLetterPos);
      }
    }
    if (availablePositions.length === 0) return null;
    const i = pick(rng, availablePositions);

    if (chars[i] === chars[i - 1]) return null;
    [chars[i - 1], chars[i]] = [chars[i], chars[i - 1]];
    return chars.join('');
  }

  if (kind === 'double') {
    // Pick from letter positions excluding the first one
    const availablePositions = letterPositions.filter(pos => pos > 0);
    if (availablePositions.length === 0) return null;
    const i = pick(rng, availablePositions);
    chars.splice(i, 0, chars[i]);
    return chars.join('');
  }

  if (kind === 'drop') {
    // Only drop if name > 3 chars
    if (chars.length <= 3) return null;
    // Pick from letter positions excluding the first one
    const availablePositions = letterPositions.filter(pos => pos > 0);
    if (availablePositions.length === 0) return null;
    const i = pick(rng, availablePositions);

    // Check if dropping would leave two separators adjacent
    const beforeChar = i > 0 ? chars[i - 1] : '';
    const afterChar = i < chars.length - 1 ? chars[i + 1] : '';
    if (beforeChar && afterChar && !/[A-Za-z]/.test(beforeChar) && !/[A-Za-z]/.test(afterChar)) {
      return null;
    }

    chars.splice(i, 1);
    return chars.join('');
  }

  return null;
}

export function displayNameFor(questionNumber, typo) {
  return questionNumber >= TYPO_FROM_QUESTION ? typo.display : typo.original;
}
