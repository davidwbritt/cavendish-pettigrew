import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { inline } from './build-inline.mjs';

const ROOT = dirname(new URL(import.meta.url).pathname);

const html = await readFile(resolve(ROOT, 'index.html'), 'utf8');
const { bundle, moduleCount } = await inline(resolve(ROOT, 'src/main.js'));
const output = html.replace(
  /<script type="module" src="src\/main\.js"><\/script>/,
  `<script>\n${bundle}\n</script>`
);
if (output === html) throw new Error('build: module script tag not found in index.html');
await mkdir(resolve(ROOT, 'dist'), { recursive: true });
await writeFile(resolve(ROOT, 'dist/index.html'), output);
console.log(`built dist/index.html (${output.length} bytes, ${moduleCount} modules)`);
