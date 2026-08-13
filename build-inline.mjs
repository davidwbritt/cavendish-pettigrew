import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Define pattern sources once as strings to guarantee consistency
const IMPORT_RE_SRC = String.raw`^import\s+[\s\S]*?from\s*['"](\.[^'"]+)['"];?$`;
const EXPORT_BLOCK_RE_SRC = String.raw`^export\s*\{[\s\S]*?\};?$`;

// Constants for single-use patterns
const EXPORT_KEYWORD_PATTERN = /^export\s+/gm;

export async function inline(path) {
  const seen = new Set();

  async function inlineRecursive(filePath) {
    if (seen.has(filePath)) return '';
    seen.add(filePath);
    const src = await readFile(filePath, 'utf8');

    // Construct fresh RegExp for detection from single source
    const importPattern = new RegExp(IMPORT_RE_SRC, 'gm');
    const imports = [...src.matchAll(importPattern)];
    let out = '';
    for (const [, rel] of imports) {
      out += await inlineRecursive(resolve(dirname(filePath), rel));
    }

    out += src
      // Strip export { ... }; blocks entirely (using source-derived pattern)
      .replace(new RegExp(EXPORT_BLOCK_RE_SRC, 'gm'), '')
      // Strip all import statements (including multi-line) from single source
      .replace(new RegExp(IMPORT_RE_SRC, 'gm'), '')
      // Strip export keyword from all other statements
      .replace(EXPORT_KEYWORD_PATTERN, '');

    return out + '\n';
  }

  const bundle = await inlineRecursive(path);
  return { bundle, moduleCount: seen.size };
}
