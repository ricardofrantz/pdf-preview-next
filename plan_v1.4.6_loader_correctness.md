# v1.4.6 Plan — Loader Correctness And Render Regression Test

Status: `[~]` in progress

## Goal

Stop the "blank PDF panel" regression at the root cause and prevent it from
shipping again. Every version from `1.4.0` to `1.4.5` has had at least one user
report or local repro of an empty viewer, and each fix attempt addressed a
different symptom. This release fixes the actual cause and adds the first
regression test that exercises a full PDF load end-to-end.

## Why This Version Next

Static checks (`lint`, `typecheck`, `npm test`) all passed for `1.4.0` through
`1.4.5` while the viewer was blank in real use. The roadmap cannot continue
adding features (`v1.5.0` dark pages, `v1.7.0` inter-PDF links, `v1.8.0`
thumbnails) on top of a viewer that may not load at all in production.

## Root Cause

`lib/main.mjs` uses top-level `await import('./pdfjs/web/pdf_viewer.mjs')`,
which makes the module asynchronous. The HTML parser fires `DOMContentLoaded`
before the dynamic import resolves. The original code registered the app
bootstrap inside a `DOMContentLoaded` listener at the bottom of the module,
which therefore attached *after* the event had already fired and never
executed. The viewer reached "module imported" and stayed blank with `of 0`
pages forever.

This was masked by:

- Static tests only verifying source patterns, not real render.
- The error banner being placed inside an overflow-hidden toolbar so any
  fallback messages were clipped off-screen.
- Multiple version bumps shipping different non-fixes for the same symptom.

## Scope

- Replace the `DOMContentLoaded` registration with a `document.readyState` check
  so the app starts even if the event already fired.
- Surface webview load progress and errors in a banner below the toolbar that
  cannot be hidden by horizontal toolbar overflow.
- Add `console.info` checkpoints at every load step so DevTools shows exactly
  where any future regression stalls.
- Add a runtime fixture PDF and an automated test that opens the custom editor,
  waits for `pagesinit` (or equivalent), and asserts page count > 0.
- Add a manual install-and-open verification gate to the release process.

## Non-Goals

- No new viewer features.
- No CSP changes.
- No PDF.js upgrade.
- No bundler migration.
- No marketplace/Open VSX publishing.

## Likely Files

- `lib/main.mjs`
- `lib/pdf.css`
- `src/pdfPreview.ts`
- `src/test/suite/index.ts`
- `src/test/fixtures/sample.pdf` (new, tiny one-page PDF)
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
   - Wrap `startApp` so any synchronous throw is logged and surfaced.
3. Add an `errorBanner` element to the webview HTML in `src/pdfPreview.ts` and
   matching CSS in `lib/pdf.css`. Banner must sit between toolbar and content,
   not inside the overflow-scrollable toolbar.
4. Add `console.info` checkpoints in `lib/main.mjs`:
   - `main.mjs evaluating`
   - `PDF.js core imported, exports=<n>`
   - `viewer module imported`
   - `loadDocument start, token=<n>`
   - `fetching PDF from <url>`
   - `fetch response <status>`
   - `fetched bytes <n>`
   - `getDocument resolved, numPages=<n>`
   - `pagesinit fired`
   - `load complete`
5. Update the bootstrap script in `src/pdfPreview.ts` so unhandled errors and
   rejections are written to the banner as well as the toolbar status.
6. Add `src/test/fixtures/sample.pdf` (tiny single-page PDF). Keep file under
   ~10 KB. Document its provenance in a sibling `README.md` next to the
   fixture.
7. Add `.vscodeignore` entries to keep the fixture out of the published VSIX.
8. Add a runtime test in `src/test/suite/index.ts` that:
   - Opens the fixture URI with the custom editor view type.
   - Waits up to ~5 s for the webview to post `view-state` *or* a derived ready
     signal.
   - Fails if no signal arrives or if reported page count is `0`.
9. Update `CHANGELOG.md` with a `1.4.6` entry describing the load-order fix and
   the new render regression test.
10. Update `README.md` install command to `pdf-preview-next-1.4.6.vsix`.

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
- The error banner is empty on success and populated on any startup failure.
- DevTools shows the full load checkpoint sequence ending in `load complete`.
- Automated test fails if page count stays at zero.
- No previously installed `1.4.x` cached extensions remain in
  `~/.vscode/extensions/` during verification.

## Risks

- Module evaluation order in webviews can differ between VS Code Electron
  versions. The `document.readyState` fallback covers both ordering paths.
- Test fixtures can bloat the VSIX if `.vscodeignore` is incomplete; the VSIX
  scanner step catches this.
- Some webview environments may not let runtime tests open custom editors
  reliably; if so, fall back to a postMessage-based ready signal asserted from
  the host extension.

## Deferred

- Removing the diagnostic banner background colors and step-by-step
  checkpoints once `1.4.6` has been verified for at least one minor cycle.
- Adding a more comprehensive fixture matrix (password PDFs, PDFs with
  outlines, large PDFs, broken PDFs) — that work belongs in `v1.6.0`.
