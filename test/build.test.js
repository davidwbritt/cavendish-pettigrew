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

test('normal relative import is detected, inlined, and stripped (round-trip)', async () => {
  const tmpDir = resolve(ROOT, '.test-build-tmp4');
  await mkdir(tmpDir, { recursive: true });

  try {
    // This checks the ordinary case round-trips: a well-formed relative import
    // is both detected (so its module gets inlined) and stripped (so no bare
    // `import` keyword survives into the non-module <script> bundle).
    //
    // NOTE: this does NOT exercise regex-divergence protection. A specifier
    // like './lib.js' satisfies both [^'"]+ and [^'"]* identically, so this
    // test would pass unchanged whether or not detection and stripping agree.
    // See the '.' degenerate-specifier test below for that guarantee.

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
    assert.ok(!bundle.includes('import'), 'all import keywords should be stripped');
    assert.ok(bundle.includes('const value = 42'), 'inlined module content should be present');

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('degenerate "." specifier is left intact — detection and stripping must agree (regex divergence guard)', async () => {
  const tmpDir = resolve(ROOT, '.test-build-tmp5');
  await mkdir(tmpDir, { recursive: true });

  try {
    // This is the actual regression guard for the historical bug: detection
    // once used [^'"]+ (requires >=1 char after the dot) while stripping used
    // [^'"]* (allows zero chars). A specifier of exactly '.' is the one input
    // those two patterns disagreed about — stripping would delete the import
    // even though detection never saw it as a module to inline, so the module
    // silently vanished from the bundle with no error.
    //
    // Under the current unified pattern (both derived from IMPORT_RE_SRC,
    // which requires >=1 char after the dot), `from '.'` matches NEITHER
    // detection NOR stripping. The property under test is that consistency:
    // whatever the pattern decides, detection and stripping decide the SAME
    // thing, so the import statement must survive untouched in the output.
    //
    // If detection and stripping ever diverge again (e.g. stripping reverts
    // to [^'"]*), this import would be silently deleted by stripping without
    // ever being inlined, and this assertion would fail.

    const mainModule = resolve(tmpDir, 'main.js');
    const src = `import { x } from '.';\nconsole.log('ok');\n`;
    await writeFile(mainModule, src);

    const { bundle } = await inline(mainModule);

    assert.ok(
      bundle.includes(`import { x } from '.';`),
      'degenerate "." import must be left fully intact — neither detected nor stripped'
    );

  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});
