import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = dirname(new URL(import.meta.url).pathname);
const seen = new Set();

async function inline(path) {
  if (seen.has(path)) return '';
  seen.add(path);
  const src = await readFile(path, 'utf8');
  // Match multi-line imports with both single and double quotes
  const importPattern = /^import\s+[\s\S]*?from\s*['"](\.[^'"]+)['"];?$/gm;
  const imports = [...src.matchAll(importPattern)];
  let out = '';
  for (const [, rel] of imports) out += await inline(resolve(dirname(path), rel));
  out += src
    // Strip export { ... }; blocks entirely
    .replace(/^export\s*\{[\s\S]*?\};?$/gm, '')
    // Strip all import statements (including multi-line)
    .replace(/^import\s+[\s\S]*?from\s*['"]\.[^'"]*['"];?$/gm, '')
    // Strip export keyword from all other statements
    .replace(/^export\s+/gm, '');
  return out + '\n';
}

const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
const bundle = await inline(resolve(ROOT, 'src/main.js'));
const output = html.replace(
  /<script type="module" src="src\/main\.js"><\/script>/,
  `<script>\n${bundle}\n</script>`
);
if (output === html) throw new Error('build: module script tag not found in index.html');
await mkdir(resolve(ROOT, 'dist'), { recursive: true });
await writeFile(resolve(ROOT, 'dist/index.html'), output);
console.log(`built dist/index.html (${output.length} bytes, ${seen.size} modules)`);
