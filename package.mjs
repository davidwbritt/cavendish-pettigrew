// Builds the itch.io upload: dist/cavendish-pettigrew-itch.zip, containing
// exactly one file, index.html, at the ROOT of the archive.
//
// itch.io looks for index.html at the top level of the zip and serves it in
// an iframe. A zip with the file inside a folder ("dist/index.html") is the
// single most common way an HTML upload fails there — itch reports it as a
// missing index.html, which reads as a build problem rather than a
// packaging one. This script exists so that cannot happen by hand.
//
// Uses the system `zip` binary rather than a dependency: this project has
// none and is not acquiring one to compress a single file.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, rmSync, statSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(ROOT, 'dist', 'index.html');
const OUT = join(ROOT, 'dist', 'cavendish-pettigrew-itch.zip');

// Build first, always. Packaging a stale dist/ is the other easy way to
// ship the wrong thing.
execFileSync('node', [join(ROOT, 'build.mjs')], { stdio: 'inherit' });

const built = statSync(SOURCE);

// Staged in a temp directory so the archive's single entry is `index.html`
// with no leading path, whatever the layout of this repo.
const stage = mkdtempSync(join(tmpdir(), 'cp-itch-'));
try {
  copyFileSync(SOURCE, join(stage, 'index.html'));
  rmSync(OUT, { force: true });
  mkdirSync(dirname(OUT), { recursive: true });
  execFileSync('zip', ['-q', '-j', OUT, join(stage, 'index.html')]);
} finally {
  rmSync(stage, { recursive: true, force: true });
}

const zipped = statSync(OUT);
const kb = n => `${(n / 1024).toFixed(1)} kB`;
console.log(`packaged ${OUT}`);
console.log(`  index.html  ${kb(built.size)}  ->  zip ${kb(zipped.size)}`);
console.log('  upload to itch.io as "HTML" and tick "This file will be played in the browser"');
