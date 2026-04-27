# PDF Preview Next — Modernization Plan

Goal: bring this extension to top-tier 2026 standards — secure, fast, small, typed, tested, and publishable to the VS Code Marketplace and Open VSX without warnings.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Current Release Prep — 1.3.0

- [x] Cut `CHANGELOG.md`, `package.json`, `package-lock.json`, and README
  install docs to `1.3.0`
- [x] Re-run `npm run typecheck`, `npm run lint`, `npm test`, and
  `npm audit --omit=dev --audit-level=high`
- [x] Build and inspect `pdf-preview-next-1.3.0.vsix`; package contains 371
  files, no source maps, no debugger files, no agent docs, and no source TS
- [ ] Tag or publish `1.3.0`; this should stay gated on an explicit decision
  about releasing with PDF.js `3.1.81` plus eval disabled, versus completing
  the PDF.js upgrade first

---

## Phase 0 — Baseline & Safety Net

- [x] Keep modernization on `main` only, matching the repo branch policy
- [ ] Tag current release: `git tag v1.2.3-pre-modernize` if a rollback point is needed before publishing
- [x] Remove built artifact from working tree: VSIX is ignored and not tracked
- [x] Verify `out/` is gitignored
- [x] Confirm `npm test` runs end-to-end on current toolchain

---

## Phase 1 — Critical Security (BLOCKER for sharing)

- [~] **Upgrade vendored PDF.js to ≥ 4.10.x (latest stable 4.x or 5.x)** — fixes CVE-2024-4367 (arbitrary JS via crafted PDF) present in current 3.1.81
  - [x] Verify current vendored PDF.js version: `3.1.81`
  - [x] Fetch/inspect `pdfjs-dist` latest stable: `5.6.205`
  - [x] Add immediate mitigation: set `isEvalSupported: false` on PDF.js loads until the major upgrade lands
  - [ ] Migrate the viewer to PDF.js 5 ESM artifacts; current `pdfjs-dist@5.6.205` no longer ships drop-in `build/pdf.js` / `web/viewer.js` globals
  - [ ] Replace `lib/build/pdf.js`, `lib/build/pdf.worker.js`, `lib/web/viewer.js`, `lib/web/viewer.css`, `lib/web/cmaps/`, `lib/web/locale/`
  - [ ] Update `lib/main.js` glue if PDF.js v4 API changed (some `PDFViewerApplication` options renamed)
  - [x] Add `lib/PDFJS_VERSION` text file with the exact upstream version
  - [ ] Add `tools/update-pdfjs.sh` that downloads, checksum-verifies, and stages the upgrade reproducibly
- [x] **Switch webview CSP to nonce-based `script-src`**
  - [x] In `src/pdfPreview.ts:getWebviewContents()`, generate `const nonce = crypto.randomBytes(16).toString('base64')`
  - [x] CSP: `script-src 'nonce-${nonce}' ${cspSource}; worker-src ${cspSource} blob:; style-src 'unsafe-inline' ${cspSource}; img-src blob: data: ${cspSource}; connect-src ${cspSource}; default-src 'none';`
  - [x] Add `nonce="${nonce}"` to all four `<script>` tags
- [x] **Tighten `localResourceRoots`** to the extension root and the opened PDF's containing directory
- [x] **Validate the webview message channel** — reject unknown message shapes before dispatch
- [x] Re-run focused security checks after changes — repository-authored code has 0 critical/high findings; full PDF.js upgrade remains open

---

## Phase 2 — Toolchain Modernization

- [x] **TypeScript 5.6+ (latest 5.x)**
  - [x] Bump `typescript` to `^5.6.0`
  - [x] Update `tsconfig.json`: `"target": "ES2022"`, `"module": "Node16"`, `"moduleResolution": "Node16"`, `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`
  - [x] Fix any new strict-mode errors
- [x] **ESLint 9 flat config**
  - [x] Replace `.eslintrc.json` with `eslint.config.mjs`
  - [x] Bump `eslint` to `^9.x`, `@typescript-eslint/eslint-plugin` and `parser` to `^8.x`
  - [x] Replace `eslint-plugin-prettier` + `eslint-config-prettier` with running Prettier separately
- [x] **Prettier 3.x** — bump to `^3.3.0`; add `.prettierrc.json` with explicit config
- [x] **Node types** — bump `@types/node` from `^12.x` to `^22.x`
- [x] **vsce → @vscode/vsce** — replace `vsce@^2.15.0` with `@vscode/vsce@^3.x`
- [~] **vscode-test → @vscode/test-electron + @vscode/test-cli** — migrated to `@vscode/test-electron`; `@vscode/test-cli` deferred because current `0.0.12` pulls a vulnerable Mocha chain under `npm audit`
- [x] Bump `engines.vscode` from `^1.46.0` to `^1.95.0`
- [x] Bump `@types/vscode` to match `engines.vscode`
- [x] Pin Node version: add `.nvmrc` with `22` and `engines.node >=22`

---

## Phase 3 — Bundle & Build

- [ ] **Add `esbuild` bundler** — ship one minified file instead of raw `out/src/*.js`
  - [ ] Add `esbuild` to devDeps
  - [ ] Create `esbuild.config.mjs` with: `platform: 'node'`, `target: 'node20'`, `format: 'cjs'`, `external: ['vscode']`, `minify: true`, `sourcemap: 'linked'`
  - [ ] Update `package.json:main` to `./dist/extension.js`
  - [ ] Replace `vscode:prepublish` script with `npm run bundle`
  - [ ] Add `bundle` and `bundle:watch` scripts
- [ ] Update `.vscodeignore` to exclude `out/`, `src/`, `*.ts`, `tsconfig.json`, `esbuild.config.mjs`, `node_modules/`, but include `dist/`
- [ ] Verify `.vsix` size shrinks meaningfully (`unzip -l *.vsix | tail -5`)
- [ ] Confirm sourcemaps not shipped to marketplace but kept for local debug

---

## Phase 4 — Code Quality

- [ ] Convert `lib/main.js` to TypeScript (`lib/main.ts`) and bundle it through esbuild's webview entry point
- [ ] Extract typed `WebviewMessage` union into `src/types.ts`
- [ ] Replace string `case 'reload'` / `'reopen-as-text'` with `const enum` or string-literal union
- [ ] Add an `AbortController`-based cleanup pattern in `PdfPreview` instead of the custom `Disposable` base — modern VS Code idiom
- [ ] Remove `retainContextWhenHidden: true` unless benchmarks show benefit (memory cost on multi-PDF sessions)
- [ ] Add JSDoc to all public methods of `PdfCustomProvider` and `PdfPreview`

---

## Phase 5 — Testing

- [~] Migrate to `@vscode/test-cli` (declarative `.vscode-test.mjs` config) once its dependency chain is audit-clean
- [ ] Add fixture PDFs under `src/test/fixtures/` (one normal, one password-protected, one large)
- [ ] Tests to add:
  - [ ] Custom editor activates on `*.pdf`
  - [ ] Webview HTML contains a unique nonce per load
  - [ ] CSP meta tag contains `'nonce-...'` and does NOT contain `'unsafe-inline'` in `script-src`
  - [ ] `localResourceRoots` is scoped (not `/`)
  - [ ] `reopen-as-text` message round-trips
  - [ ] `onDidDelete` disposes the panel
- [ ] Add coverage with `c8` (Node-native, no Babel)

---

## Phase 6 — CI/CD

- [ ] Create `.github/workflows/ci.yml`
  - [ ] Triggers: `push` to `main`, `pull_request`
  - [ ] Matrix: ubuntu-latest, macos-latest, windows-latest
  - [ ] Steps: `actions/checkout@<sha>`, `actions/setup-node@<sha>` (pin by SHA, not tag), `npm ci`, `npm run lint`, `npm run typecheck`, `xvfb-run -a npm test` (Linux), `npm test` (Mac/Win)
  - [ ] `npm audit --omit=dev --audit-level=high` (fail on high+)
- [ ] Create `.github/workflows/release.yml`
  - [ ] Trigger: `release: published` or tag `v*`
  - [ ] Build, package, publish to Marketplace AND Open VSX
  - [ ] Use `VSCE_PAT` and `OVSX_PAT` secrets
  - [ ] Attach `.vsix` to GitHub release
- [ ] Add `dependabot.yml` for npm + actions
- [ ] Add CodeQL workflow (`github/codeql-action`) for JS/TS scanning

---

## Phase 7 — Distribution & Docs

- [ ] Publish to **Open VSX** (covers VSCodium, Cursor, Theia, code-server users)
- [ ] Add `LICENSE` provenance note in README (Apache-2.0 + PDF.js Apache-2.0 inheritance)
- [ ] Update README with:
  - [ ] Security model section (sandboxed webview, nonce CSP, PDF.js version)
  - [ ] Build-from-source instructions
  - [ ] Comparison table vs `tomoki1207.pdf` (the original fork)
- [ ] Add `CHANGELOG.md` entry for this modernization (already exists — append `[2.0.0]`)
- [ ] Add `SECURITY.md` with vulnerability disclosure policy and the email/contact
- [ ] Add `CONTRIBUTING.md` with the build/test/release workflow
- [ ] Verify icon renders at marketplace sizes (128×128 minimum); current `icon.png` is 7.2 KB — likely OK, but check
- [ ] Add screenshots/GIF to README (marketplace ranking signal)

---

## Phase 8 — Stretch / Top-Tier Polish

- [ ] **Telemetry opt-in** — none currently; do not add unless explicitly desired
- [ ] **Multi-tab thumbnail preview** in VS Code's editor area
- [ ] **Outline integration** — feed PDF outline into VS Code's `vscode.window.registerTreeDataProvider` so users see chapters in the Explorer
- [ ] **Find-in-PDF integration** with VS Code's command palette
- [ ] **Bun-powered local dev scripts** — `bun run lint`, `bun run test:fast` for sub-second iteration; keep Node for `vsce package`
- [ ] **Marketplace badges** — verified publisher checkmark, install count, rating
- [ ] **Bundle size budget** — fail CI if `dist/extension.js` > 50 KB or `lib/build/pdf.js` > 1.5 MB
- [ ] **Web extension support** — run in vscode.dev / github.dev (`browser` field in package.json, esbuild `platform: 'browser'` build target)
- [ ] **Locale fallback** — current `locale.properties` is en-only; ship a few popular locales

---

## Acceptance criteria for "done"

- [ ] `/security-audit` returns 0 critical/high findings
- [x] `npm audit --omit=dev` is clean at `--audit-level=high`
- [~] `npm run lint && npm run typecheck && npm test` passes locally on macOS; CI matrix remains open
- [x] `.vsix` size ≤ 4 MB (currently 2.86 MB)
- [ ] Cold extension activation < 200 ms on a 10-page PDF (measure with `code --inspect-extensions`)
- [ ] Published to both VS Code Marketplace and Open VSX
- [ ] README has security model, screenshots, build instructions

---

## Order of execution (recommended)

1. Phase 0 → Phase 1 (security blocker)
2. Phase 2 → Phase 3 (toolchain + bundler — touches everything, do it before tests/CI)
3. Phase 4 → Phase 5 (code quality + tests)
4. Phase 6 → Phase 7 (CI + docs)
5. Phase 8 (stretch — pick what matters)

Estimated effort: 2–3 focused days for Phases 0–6, another day for Phase 7, Phase 8 à la carte.
