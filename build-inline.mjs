import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// Define regex patterns once and reuse them consistently
const IMPORT_PATTERN = /^import\s+[\s\S]*?from\s*['"](\.[^'"]+)['"];?$/gm;
const IMPORT_STRIP_PATTERN = /^import\s+[\s\S]*?from\s*['"]\.[^'"]*['"];?$/gm;
const EXPORT_BLOCK_PATTERN = /^export\s*\{[\s\S]*?\};?$/gm;
const EXPORT_KEYWORD_PATTERN = /^export\s+/gm;

export async function inline(path) {
  const seen = new Set();

  async function inlineRecursive(filePath) {
    if (seen.has(filePath)) return '';
    seen.add(filePath);
    const src = await readFile(filePath, 'utf8');

    // Match multi-line imports with both single and double quotes
    const imports = [...src.matchAll(IMPORT_PATTERN)];
    let out = '';
    for (const [, rel] of imports) {
      out += await inlineRecursive(resolve(dirname(filePath), rel));
    }

    out += src
      // Strip export { ... }; blocks entirely
      .replace(EXPORT_BLOCK_PATTERN, '')
      // Strip all import statements (including multi-line)
      .replace(IMPORT_STRIP_PATTERN, '')
      // Strip export keyword from all other statements
      .replace(EXPORT_KEYWORD_PATTERN, '');

    return out + '\n';
  }

  const bundle = await inlineRecursive(path);
  return { bundle, moduleCount: seen.size };
}
