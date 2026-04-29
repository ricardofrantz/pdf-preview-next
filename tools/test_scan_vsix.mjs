import assert from 'node:assert/strict';
import {
  findForbiddenEntries,
  findMissingRequiredEntries,
  requiredEntries,
} from './scan_vsix.mjs';

const forbiddenSamples = [
  'extension/dist/extension.js.map',
  'extension/out/src/test/runTest.js',
  'extension/src/test/fixtures/sample.pdf',
  'extension/src/extension.ts',
  'extension/test/smoke.js',
  'extension/tools/scan_vsix.mjs',
  'extension/plan.md',
  'extension/PLAN.md',
  'extension/scratch/probe.txt',
  'extension/tmp/probe.txt',
  'extension/temp/probe.txt',
];

for (const sample of forbiddenSamples) {
  assert.deepEqual(
    findForbiddenEntries([sample]),
    [sample],
    `expected ${sample} to be forbidden`,
  );
}

const allowedRuntimeEntries = [
  ...requiredEntries,
  'extension/package.json',
  'extension/readme.md',
  'extension/changelog.md',
  'extension/LICENSE.txt',
  'extension/lib/pdfjs/cmaps/90ms-RKSJ-V.bcmap',
  'extension/lib/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
];

assert.deepEqual(findForbiddenEntries(allowedRuntimeEntries), []);
assert.deepEqual(findMissingRequiredEntries(allowedRuntimeEntries), []);

const missingWorker = allowedRuntimeEntries.filter(
  (entry) => entry !== 'extension/lib/pdfjs/build/pdf.worker.min.mjs',
);
assert.deepEqual(findMissingRequiredEntries(missingWorker), [
  'extension/lib/pdfjs/build/pdf.worker.min.mjs',
]);

console.log('scan_vsix matcher tests passed');
