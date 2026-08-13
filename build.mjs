import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = dirname(new URL(import.meta.url).pathname);
const seen = new Set();

async function inline(path) {
  if (seen.has(path)) return '';
  seen.add(path);
  const src = await readFile(path, 'utf8');
  const imports = [...src.matchAll(/^import\s+.*?from\s+'(\.[^']+)';?$/gm)];
  let out = '';
  for (const [, rel] of imports) out += await inline(resolve(dirname(path), rel));
  out += src
    .replace(/^import\s+.*?from\s+'\.[^']+';?$/gm, '')
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
