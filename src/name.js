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
  if (original.length < 3 || !/^[A-Za-z]+$/.test(original)) {
    return { original, display: original, kind: 'none' };
  }

  const kinds = ['adjacent', 'transpose', 'double', 'drop'];
  for (let attempt = 0; attempt < 20; attempt++) {
    const kind = pick(rng, kinds);
    const display = apply(kind, original, rng);
    if (display && display !== original) return { original, display, kind };
  }
  return { original, display: original, kind: 'none' };
}

function apply(kind, name, rng) {
  const i = 1 + Math.floor(rng() * (name.length - 1)); // never the first letter
  const chars = [...name];

  if (kind === 'adjacent') {
    const lower = chars[i].toLowerCase();
    const neighbours = ADJACENT[lower];
    if (!neighbours) return null;
    const replacement = pick(rng, [...neighbours]);
    chars[i] = chars[i] === chars[i].toUpperCase()
      ? replacement.toUpperCase() : replacement;
    return chars.join('');
  }
  if (kind === 'transpose') {
    if (chars[i] === chars[i - 1]) return null;
    [chars[i - 1], chars[i]] = [chars[i], chars[i - 1]];
    return chars.join('');
  }
  if (kind === 'double') {
    chars.splice(i, 0, chars[i]);
    return chars.join('');
  }
  if (kind === 'drop') {
    if (chars.length <= 3) return null;
    chars.splice(i, 1);
    return chars.join('');
  }
  return null;
}

export function displayNameFor(questionNumber, typo) {
  return questionNumber >= TYPO_FROM_QUESTION ? typo.display : typo.original;
}
