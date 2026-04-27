import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const configPath = path.join(scriptDir, 'update_pdfjs.jsonc');

function stripJsonComments(input) {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') {
        i += 1;
      }
      output += '\n';
      continue;
    }

    if (char === '/' && next === '*') {
      i += 2;
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) {
        i += 1;
      }
      i += 1;
      continue;
    }

    output += char;
  }

  return output;
}

function removeTrailingCommas(input) {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === ',') {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) {
        j += 1;
      }
      if (input[j] === '}' || input[j] === ']') {
        continue;
      }
    }

    output += char;
  }

  return output;
}

function readConfig() {
  const source = fs.readFileSync(configPath, 'utf8');
  return JSON.parse(removeTrailingCommas(stripJsonComments(source)));
}

function repoPath(relativePath) {
  const resolved = path.resolve(repoRoot, relativePath);
  if (!resolved.startsWith(`${repoRoot}${path.sep}`) && resolved !== repoRoot) {
    throw new Error(`Path escapes repository root: ${relativePath}`);
  }
  return resolved;
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  });
}

function copyEntry(sourceRoot, entry) {
  const source = path.join(sourceRoot, entry.from);
  const destination = repoPath(entry.to);

  if (!fs.existsSync(source)) {
    throw new Error(`Missing PDF.js source path: ${entry.from}`);
  }

  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(source, destination, { recursive: true });
  } else {
    fs.copyFileSync(source, destination);
  }
}

function writeVersionFile(config) {
  const contents = [
    config.version,
    '',
    `Source: ${config.packageName}@${config.version}`,
    `Integrity: ${config.integrity}`,
    'Runtime: vendored PDF.js ESM files under lib/pdfjs.',
    '',
  ].join('\n');
  fs.writeFileSync(repoPath(config.versionFile), contents, 'utf8');
}

function main() {
  const config = readConfig();
  const workDirectory = repoPath(config.workDirectory);
  const sourceDirectory = repoPath(config.sourceDirectory);

  fs.mkdirSync(workDirectory, { recursive: true });
  fs.rmSync(sourceDirectory, { recursive: true, force: true });

  const packOutput = run('npm', [
    'pack',
    `${config.packageName}@${config.version}`,
    '--pack-destination',
    config.workDirectory,
    '--json',
  ]);
  const [packInfo] = JSON.parse(packOutput);

  if (packInfo.integrity !== config.integrity) {
    throw new Error(
      `Integrity mismatch for ${packInfo.id}: ${packInfo.integrity} !== ${config.integrity}`,
    );
  }

  const tarball = path.join(workDirectory, packInfo.filename);
  run('tar', ['-xzf', tarball, '-C', workDirectory]);

  for (const removePath of config.remove) {
    fs.rmSync(repoPath(removePath), { recursive: true, force: true });
  }

  for (const entry of config.copy) {
    copyEntry(sourceDirectory, entry);
  }

  writeVersionFile(config);
  console.log(`Vendored ${config.packageName}@${config.version}.`);
}

main();
