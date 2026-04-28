import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { assertViewerContract } from './viewer_contract.mjs';

const forbiddenEntries = [
  /^extension\/\.github\//,
  /^extension\/\.beads\//,
  /^extension\/\.work\//,
  /^extension\/src\//,
  /^extension\/test\//,
  /^extension\/tools\//,
  /^extension\/node_modules\//,
  /(^|\/)(?:plan(?:_[^/]*)?|PLAN|GEMINI|AGENTS|CLAUDE|SECURITY)\.md$/i,
  /(^|\/)debugger\.(?:js|css)$/i,
  /\.map$/i,
  /\.vsix$/i,
  /(^|\/)sandbox(?:\.|\/)/i,
  /\.wasm$/i,
];

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

const vsixPath = process.argv[2] ?? newestVsix();
if (!vsixPath || !existsSync(vsixPath)) {
  console.error('Usage: node ./tools/scan_vsix.mjs <extension.vsix>');
  process.exit(2);
}

let entries;
try {
  entries = execFileSync('unzip', ['-Z1', vsixPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .split(/\r?\n/)
    .filter(Boolean);
} catch (error) {
  console.error(`Could not inspect ${basename(vsixPath)} with unzip.`);
  if (error.stderr) {
    console.error(String(error.stderr));
  }
  process.exit(2);
}

const offenders = entries.filter((entry) =>
  forbiddenEntries.some((pattern) => pattern.test(entry)),
);

if (offenders.length > 0) {
  console.error(`Forbidden files found in ${basename(vsixPath)}:`);
  for (const entry of offenders) {
    console.error(`- ${entry}`);
  }
  process.exit(1);
}

function readVsixEntry(entry) {
  return execFileSync('unzip', ['-p', vsixPath, entry], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

assertViewerContract({
  webviewSource: readVsixEntry('extension/out/src/pdfPreview.js'),
  stylesSource: readVsixEntry('extension/lib/pdf.css'),
  viewerScriptSource: readVsixEntry('extension/lib/main.mjs'),
  context: basename(vsixPath),
});

console.log(`VSIX content scan passed: ${basename(vsixPath)}`);
