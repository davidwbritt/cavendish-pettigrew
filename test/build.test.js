import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { inline } from '../build-inline.mjs';

const ROOT = dirname(dirname(new URL(import.meta.url).pathname));

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
    const { bundle } = await inline(mainModule);

    // The output should contain the inlined function body
    assert.ok(bundle.includes('function helperFn()'), 'inlined function body should be present');

    // The output should NOT contain any import statements
    assert.ok(!bundle.includes('import'), 'no import keywords should remain');

    // The output should NOT contain any export keywords
    assert.ok(!bundle.includes('export'), 'no export keywords should remain');

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
    const { bundle } = await inline(exportModule);

    // Should contain the variable declarations
    assert.ok(bundle.includes('const a = 1'), 'variable declaration should remain');
    assert.ok(bundle.includes('const b = 2'), 'variable declaration should remain');

    // Should NOT contain export { }
    assert.ok(!bundle.includes('export'), 'export keyword should be removed');
    assert.ok(!bundle.includes('{ a'), 'export block should be entirely removed, not just "export"');

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('separate inline() calls do not share dedup state', async () => {
  const tmpDir = resolve(ROOT, '.test-build-tmp3');
  await mkdir(tmpDir, { recursive: true });

  try {
    // Write a simple module
    const testModule = resolve(tmpDir, 'test.js');
    await writeFile(testModule, `console.log('test');`);

    // Call inline twice on the same module
    const { bundle: result1 } = await inline(testModule);
    const { bundle: result2 } = await inline(testModule);

    // Both calls should return the inlined content, not an empty string
    assert.ok(result1.includes('console.log'), 'first inline should return module content');
    assert.ok(result2.includes('console.log'), 'second inline should return module content, not empty string from shared seen Set');
    assert.equal(result1, result2, 'both calls should produce identical output');

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('import detection and stripping use identical patterns (no regex divergence)', async () => {
  const tmpDir = resolve(ROOT, '.test-build-tmp4');
  await mkdir(tmpDir, { recursive: true });

  try {
    // Regression test: ensure detection and stripping patterns are derived from the same source.
    // If they diverged (e.g., one uses [^'"]+, the other [^'"]*), then:
    // - Detection might miss an import that stripping removes anyway → silent wrong output
    // - Stripping might miss an import that detection finds → orphaned import keyword
    // This test catches divergence by verifying consistency.

    const importedModule = resolve(tmpDir, 'lib.js');
    await writeFile(importedModule, `export const value = 42;`);

    const mainModule = resolve(tmpDir, 'main.js');
    await writeFile(mainModule, `import { value } from './lib.js';
console.log(value);
`);

    const { bundle } = await inline(mainModule);

    // After inlining:
    // 1. All import statements should be stripped (no 'import' keyword)
    // 2. Inlined module content should be present
    assert.ok(!bundle.includes('import'), 'all import keywords should be stripped (detection and stripping must agree)');
    assert.ok(bundle.includes('const value = 42'), 'inlined module content should be present (detected imports were inlined)');

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
