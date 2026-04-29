import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertViewerContract } from './viewer_contract.mjs';

export const forbiddenEntries = [
  /^extension\/\.github\//,
  /^extension\/\.beads\//,
  /^extension\/\.work\//,
  /^extension\/out\//,
  /^extension\/src\/test\/fixtures\//,
  /^extension\/src\//,
  /^extension\/test\//,
  /^extension\/tools\//,
  /^extension\/node_modules\//,
  /(^|\/)(?:plan(?:_[^/]*)?|PLAN|GEMINI|KIMI|AGENTS|CLAUDE|SECURITY)\.md$/i,
  /(^|\/)(?:scratch|tmp|temp)(?:\.|\/)/i,
  /(^|\/)debugger\.(?:js|css)$/i,
  /\.map$/i,
  /\.tsx?$/i,
  /\.vsix$/i,
  /(^|\/)sandbox(?:\.|\/)/i,
  /\.wasm$/i,
];

export const requiredEntries = [
  'extension/dist/extension.js',
  'extension/lib/main.mjs',
  'extension/lib/pdf.css',
  'extension/lib/polyfills.mjs',
  'extension/lib/pdfjs/build/pdf.min.mjs',
  'extension/lib/pdfjs/build/pdf.worker.min.mjs',
  'extension/lib/pdfjs/web/pdf_viewer.css',
  'extension/lib/pdfjs/web/pdf_viewer.mjs',
];

export function findForbiddenEntries(entries) {
  return entries.filter((entry) =>
    forbiddenEntries.some((pattern) => pattern.test(entry)),
  );
}

export function findMissingRequiredEntries(entries) {
  const entrySet = new Set(entries);
  return requiredEntries.filter((entry) => !entrySet.has(entry));
}

function newestVsix() {
  const candidates = readdirSync(process.cwd())
    .filter((name) => name.endsWith('.vsix'))
    .map((name) => {
      const path = join(process.cwd(), name);
      return { path, mtimeMs: statSync(path).mtimeMs };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return candidates[0]?.path;
}

function readVsixEntries(vsixPath) {
  return execFileSync('unzip', ['-Z1', vsixPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split(/\r?\n/)
    .filter(Boolean);
}

function readVsixEntry(vsixPath, entry) {
  return execFileSync('unzip', ['-p', vsixPath, entry], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function main() {
  const vsixPath = process.argv[2] ?? newestVsix();
  if (!vsixPath || !existsSync(vsixPath)) {
    console.error('Usage: node ./tools/scan_vsix.mjs <extension.vsix>');
    process.exit(2);
  }

  let entries;
  try {
    entries = readVsixEntries(vsixPath);
  } catch (error) {
    console.error(`Could not inspect ${basename(vsixPath)} with unzip.`);
    if (error.stderr) {
      console.error(String(error.stderr));
    }
    process.exit(2);
  }

  const offenders = findForbiddenEntries(entries);
  if (offenders.length > 0) {
    console.error(`Forbidden files found in ${basename(vsixPath)}:`);
    for (const entry of offenders) {
      console.error(`- ${entry}`);
    }
    process.exit(1);
  }

  const missingEntries = findMissingRequiredEntries(entries);
  if (missingEntries.length > 0) {
    console.error(`Required runtime files missing from ${basename(vsixPath)}:`);
    for (const entry of missingEntries) {
      console.error(`- ${entry}`);
    }
    process.exit(1);
  }

  assertViewerContract({
    webviewSource: readVsixEntry(vsixPath, 'extension/dist/extension.js'),
    stylesSource: readVsixEntry(vsixPath, 'extension/lib/pdf.css'),
    viewerScriptSource: readVsixEntry(vsixPath, 'extension/lib/main.mjs'),
    context: basename(vsixPath),
  });

  console.log(`VSIX content scan passed: ${basename(vsixPath)}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
