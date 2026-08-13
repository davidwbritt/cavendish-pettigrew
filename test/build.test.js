import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const ROOT = dirname(dirname(new URL(import.meta.url).pathname));

// Copy the inliner function from build.mjs for testing
const inlineCache = new Map();

async function inline(path) {
  const seen = new Set();

  async function inlineRecursive(path) {
    if (seen.has(path)) return '';
    seen.add(path);
    const src = await readFile(path, 'utf8');

    // Match multi-line imports: ^import\s+[\s\S]*?from\s*['"](\.[^'"]+)['"];?
    const imports = [...src.matchAll(/^import\s+[\s\S]*?from\s*['"](\.[^'"]+)['"];?/gm)];
    let out = '';
    for (const [, rel] of imports) {
      const importPath = resolve(dirname(path), rel);
      out += await inlineRecursive(importPath);
    }

    out += src
      // Strip export { ... }; blocks entirely
      .replace(/^export\s*\{[\s\S]*?\};?$/gm, '')
      // Strip all import statements (including multi-line)
      .replace(/^import\s+[\s\S]*?from\s*['"]\.[^'"]*['"];?$/gm, '')
      // Strip export keyword from all other statements
      .replace(/^export\s+/gm, '');

    return out + '\n';
  }

  return inlineRecursive(path);
}

test('build inliner handles multi-line imports', async () => {
  const tmpDir = resolve(ROOT, '.test-build-tmp');
  await mkdir(tmpDir, { recursive: true });

  try {
    // Write a module that gets imported
    const importedModule = resolve(tmpDir, 'imported.js');
    await writeFile(importedModule, `export function helperFn() {
  return 42;
}
`);

    // Write a module with multi-line import of the first module
    const mainModule = resolve(tmpDir, 'main.js');
    await writeFile(mainModule, `import {
  helperFn
} from './imported.js';

console.log(helperFn());
`);

    // Inline the main module
    const result = await inline(mainModule);

    // The output should contain the inlined function body
    assert.ok(result.includes('function helperFn()'), 'inlined function body should be present');

    // The output should NOT contain any import statements
    assert.ok(!result.includes('import'), 'no import keywords should remain');

    // The output should NOT contain any export keywords
    assert.ok(!result.includes('export'), 'no export keywords should remain');

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('build inliner handles export { } blocks', async () => {
  const tmpDir = resolve(ROOT, '.test-build-tmp2');
  await mkdir(tmpDir, { recursive: true });

  try {
    // Write a module with named exports
    const exportModule = resolve(tmpDir, 'exports.js');
    await writeFile(exportModule, `const a = 1;
const b = 2;

export {
  a,
  b
};
`);

    // Inline the module
    const result = await inline(exportModule);

    // Should contain the variable declarations
    assert.ok(result.includes('const a = 1'), 'variable declaration should remain');
    assert.ok(result.includes('const b = 2'), 'variable declaration should remain');

    // Should NOT contain export { }
    assert.ok(!result.includes('export'), 'export keyword should be removed');
    assert.ok(!result.includes('{ a'), 'export block should be entirely removed, not just "export"');

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
