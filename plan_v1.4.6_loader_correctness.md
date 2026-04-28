# v1.4.6 Plan — Loader Correctness

Status: `[~]` in progress

## Goal

Stop the "blank PDF panel" regression at the root cause and prevent it from
shipping again. Every version from `1.4.0` to `1.4.5` has had at least one user
report or local repro of an empty viewer, and each fix attempt addressed a
different symptom. This release fixes the load-order failure, the PDF.js 5
viewer-container contract failure, and adds regression assertions for both
startup assumptions.

## Why This Version Next

Static checks (`lint`, `typecheck`, `npm test`) all passed for `1.4.0` through
`1.4.5` while the viewer was blank in real use. The roadmap cannot continue
adding features (`v1.5.0` dark pages, `v1.7.0` inter-PDF links, `v1.8.0`
thumbnails) on top of a viewer that may not load at all in production.

## Root Causes

`lib/main.mjs` uses top-level `await import('./pdfjs/web/pdf_viewer.mjs')`,
which makes the module asynchronous. The HTML parser fires `DOMContentLoaded`
before the dynamic import resolves. The original code registered the app
bootstrap inside a `DOMContentLoaded` listener at the bottom of the module,
which therefore attached *after* the event had already fired and never
executed. The viewer reached "module imported" and stayed blank with `of 0`
pages forever.

After that race was fixed, the viewer began starting and exposed a second
startup blocker: PDF.js 5.6.205 validates that both `container` and `viewer`
passed to `new PDFViewer(...)` are `DIV` elements, and then validates that the
visible `container` is absolutely positioned. The extension supplied a semantic
`<main id="viewerContainer">` and then a relative-positioned `DIV`, so PDF.js
threw before loading the PDF. The markup now uses a layout wrapper plus
`<div id="viewerContainer" role="main" tabindex="0">`, with the PDF.js
container styled as `position: absolute; inset: 0`.

A third runtime blocker surfaced once both of the above were fixed: PDF.js
5.6.205 calls `Map.prototype.getOrInsertComputed` and
`WeakMap.prototype.getOrInsertComputed` (TC39 Stage 3 "Upsert" proposal) in
its download, annotation, and rendering paths. Those methods are not yet
shipped in the V8 inside current VS Code Electron builds (verified on VS Code
`1.117.0`). The first PDF render attempt throws
`this[#fr].getOrInsertComputed is not a function` and the toolbar status
shows `Could not load PDF: …`. A small polyfill module (`lib/polyfills.mjs`)
patches both prototypes before any PDF.js module is imported.

This was masked by:

- Static tests only verifying source patterns, not real render.
- Startup errors being surfaced only through generic status text during normal
  builds, making the failure mode easy to confuse with a PDF loading problem.
- Multiple version bumps shipping different non-fixes for the same symptom.

## Scope

- Replace the `DOMContentLoaded` registration with a `document.readyState` check
  so the app starts even if the event already fired.
- Keep the PDF.js `container` and `viewer` constructor options backed by `DIV`
  elements, with the visible container absolutely positioned.
- Add a `lib/polyfills.mjs` module that patches `Map.prototype` and
  `WeakMap.prototype` with `getOrInsertComputed`, and import it from
  `lib/main.mjs` before any PDF.js module so the patch runs before the
  viewer evaluates.
- Remove temporary diagnostic banner/logging instrumentation before committing.
- Add automated source-level assertions for the ready-state bootstrap path,
  the PDF.js viewer-container element contract, and the polyfill import order.
- Add a manual install-and-open verification gate to the release process.

## Non-Goals

- No new viewer features.
- No CSP changes.
- No PDF.js upgrade.
- No bundler migration.
- No marketplace/Open VSX publishing.

## Likely Files

- `lib/main.mjs`
- `lib/polyfills.mjs` (new)
- `src/pdfPreview.ts`
- `src/test/suite/index.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `README.md`

## Implementation Steps

1. Confirm clean tree apart from in-flight loader work.
2. Patch `lib/main.mjs`:
   - Replace the bottom `window.addEventListener('DOMContentLoaded', ...)`
     registration with:
     ```js
     if (document.readyState === 'loading') {
       window.addEventListener('DOMContentLoaded', startApp, { once: true });
     } else {
       startApp();
     }
     ```
3. Keep the bootstrap error handler in `src/pdfPreview.ts` writing startup
   errors to the toolbar status without retaining temporary diagnostic banners.
4. Change `viewerContainer` from `<main>` to an absolutely positioned
   `<div role="main">`, because PDF.js 5 rejects non-`DIV` and non-absolute
   container elements.
5. Create `lib/polyfills.mjs` patching `Map.prototype.getOrInsertComputed`
   and `WeakMap.prototype.getOrInsertComputed` if missing. Add `import
   './polyfills.mjs';` as the very first line of `lib/main.mjs`, above
   the static import of `pdfjs/build/pdf.min.mjs`, so the polyfill module
   evaluates before PDF.js does.
6. Add assertions in `src/test/suite/index.ts` for:
   - `document.readyState === 'loading'` fallback logic.
   - `DOMContentLoaded` registration only on the loading path.
   - `<div id="viewerContainer" role="main" tabindex="0">`.
   - `#viewerContainer { position: absolute; inset: 0; }`.
   - no `<main id="viewerContainer">` regression.
   - `lib/polyfills.mjs` exists and is the first import in `lib/main.mjs`,
     ahead of any `./pdfjs/...` import.
7. Update `CHANGELOG.md` with a `1.4.6` entry describing the load-order fix,
   the PDF.js `DIV`/absolute-positioned container requirement, the
   `getOrInsertComputed` polyfill, and the cleanup of temporary diagnostics.
8. Update `README.md` install command to `pdf-preview-next-1.4.6.vsix`.

## Tests

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm audit --omit=dev --audit-level=high`
- `npm run package`
- `npm run package:scan -- pdf-preview-next-1.4.6.vsix`
- Manual install-and-open gate (mandatory):
  - `code --uninstall-extension ricardofrantz.pdf-preview-next`
  - Fully quit VS Code
  - `code --install-extension pdf-preview-next-1.4.6.vsix --force`
  - Open at least one normal PDF and one outline-bearing PDF
  - Confirm page count > 0, scrolling, find, refresh, and source open all work

## Acceptance Criteria

- Opening a normal PDF renders pages without manual intervention.
- No startup error appears in the toolbar status on success.
- Automated tests fail if the ready-state startup path or PDF.js
  viewer-container contract regresses.
- No previously installed `1.4.x` cached extensions remain in
  `~/.vscode/extensions/` during verification.

## Risks

- Module evaluation order in webviews can differ between VS Code Electron
  versions. The `document.readyState` fallback covers both ordering paths.
- PDF.js may add more constructor validation in future runtime upgrades; keep
  markup assumptions covered by tests when changing the viewer shell.

## Deferred

- Adding a more comprehensive fixture matrix (password PDFs, PDFs with
  outlines, large PDFs, broken PDFs) — that work belongs in `v1.6.0`.
