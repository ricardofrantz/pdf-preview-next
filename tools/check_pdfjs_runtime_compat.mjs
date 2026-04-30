import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertViewerContract } from './viewer_contract.mjs';

const mainSource = await readFile('lib/main.mjs', 'utf8');
const polyfillsSource = await readFile('lib/polyfills.mjs', 'utf8');
const viewerSource = await readFile('lib/pdfjs/web/pdf_viewer.mjs', 'utf8');
const webviewSource = await readFile('out/src/pdfPreview.js', 'utf8');
const stylesSource = await readFile('lib/pdf.css', 'utf8');

const polyfillsImportIndex = mainSource.indexOf("import './polyfills.mjs';");
const pdfCoreImportIndex = mainSource.indexOf(
  "import * as pdfjsLib from './pdfjs/build/pdf.min.mjs';",
);
const pdfWorkerImportIndex = mainSource.indexOf(
  "import * as pdfjsWorker from './pdfjs/build/pdf.worker.min.mjs';",
);
const viewerImportIndex = mainSource.indexOf(
  "await import('./pdfjs/web/pdf_viewer.mjs')",
);

assert.ok(
  polyfillsImportIndex >= 0,
  'lib/main.mjs must import lib/polyfills.mjs.',
);
assert.ok(pdfCoreImportIndex >= 0, 'lib/main.mjs must import PDF.js core.');
assert.ok(pdfWorkerImportIndex >= 0, 'lib/main.mjs must import PDF.js worker.');
assert.ok(viewerImportIndex >= 0, 'lib/main.mjs must import PDF.js viewer.');
assert.ok(
  polyfillsImportIndex < pdfCoreImportIndex,
  'lib/polyfills.mjs must evaluate before PDF.js core.',
);
assert.ok(
  polyfillsImportIndex < pdfWorkerImportIndex,
  'lib/polyfills.mjs must evaluate before PDF.js worker.',
);
assert.ok(
  pdfCoreImportIndex < pdfWorkerImportIndex,
  'PDF.js core should load before the worker module is exposed.',
);
assert.ok(
  pdfWorkerImportIndex < viewerImportIndex,
  'PDF.js worker must be exposed before PDF.js viewer.',
);
assert.ok(
  polyfillsImportIndex < viewerImportIndex,
  'lib/polyfills.mjs must evaluate before PDF.js viewer.',
);

if (viewerSource.includes('getOrInsertComputed')) {
  assert.match(
    polyfillsSource,
    /Map\.prototype\.getOrInsertComputed/,
    'PDF.js uses Map.prototype.getOrInsertComputed, so lib/polyfills.mjs must patch Map.',
  );
  assert.match(
    polyfillsSource,
    /WeakMap\.prototype\.getOrInsertComputed/,
    'PDF.js uses WeakMap.prototype.getOrInsertComputed, so lib/polyfills.mjs must patch WeakMap.',
  );
}
assert.match(
  mainSource,
  /globalThis\.pdfjsWorker = pdfjsWorker/,
  'lib/main.mjs must expose PDF.js worker globals to avoid slow worker fallback.',
);

if (viewerSource.includes('RegExp.escape')) {
  assert.match(
    polyfillsSource,
    /RegExp\.escape/,
    'PDF.js uses RegExp.escape, so lib/polyfills.mjs must patch RegExp.',
  );
}
if (viewerSource.includes('.bytes()')) {
  assert.match(
    polyfillsSource,
    /Response\.prototype\.bytes/,
    'PDF.js uses Response.prototype.bytes, so lib/polyfills.mjs must patch Response.',
  );
}

await import(pathToFileURL('lib/polyfills.mjs').href);

const map = new Map();
let mapCalls = 0;
assert.equal(
  map.getOrInsertComputed('page', () => {
    mapCalls += 1;
    return 1;
  }),
  1,
);
assert.equal(
  map.getOrInsertComputed('page', () => {
    mapCalls += 1;
    return 2;
  }),
  1,
);
assert.equal(mapCalls, 1);
assert.equal(map.get('page'), 1);

const weakMap = new WeakMap();
const key = {};
let weakMapCalls = 0;
assert.equal(
  weakMap.getOrInsertComputed(key, () => {
    weakMapCalls += 1;
    return 'ready';
  }),
  'ready',
);
assert.equal(
  weakMap.getOrInsertComputed(key, () => {
    weakMapCalls += 1;
    return 'stale';
  }),
  'ready',
);
assert.equal(weakMapCalls, 1);
assert.equal(weakMap.get(key), 'ready');

assert.equal(
  Object.prototype.propertyIsEnumerable.call(
    Map.prototype,
    'getOrInsertComputed',
  ),
  false,
);
assert.equal(
  Object.prototype.propertyIsEnumerable.call(
    WeakMap.prototype,
    'getOrInsertComputed',
  ),
  false,
);
assert.equal(RegExp.escape('a+b?'), '\\x61\\+b\\?');
assert.equal(RegExp.escape(' space'), '\\x20space');
assert.equal(RegExp.escape('foo-bar'), '\\x66oo\\x2dbar');
assert.equal(
  Object.prototype.propertyIsEnumerable.call(RegExp, 'escape'),
  false,
);
if (typeof Response !== 'undefined') {
  assert.equal(typeof Response.prototype.bytes, 'function');
  const bytes = await new Response(new Uint8Array([1, 2, 3])).bytes();
  assert.deepEqual([...bytes], [1, 2, 3]);
}

assertViewerContract({
  webviewSource,
  stylesSource,
  viewerScriptSource: mainSource,
  context: 'compiled webview',
});
