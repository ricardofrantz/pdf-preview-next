# PDF Preview Next v1.5.0 Plan: Dark PDF Rendering

Goal: add a low-eye-strain PDF viewing mode for dark VS Code setups while
keeping the extension small, predictable, and safe to release as a minor
version.

Status legend: `[ ]` todo, `[~]` in progress, `[x]` done.

## Prerequisite

Do not start this version until `v1.4.7` (responsive toolbar) — and
transitively `v1.4.6` (loader correctness + render regression test) — has
shipped and been verified by installing the VSIX and opening at least one
PDF. Adding `pageColors` on top of an unverified loader
caused users in `1.4.x` to misread blank-viewer bugs as dark-mode failures.

## Scope

- [ ] Add one cleaner dark-page rendering mode backed by PDF.js `pageColors`.
- [ ] Keep the existing `inverted` mode as the broad fallback for scanned PDFs
      and image-heavy documents.
- [ ] Preserve the current default behavior: `pdf-preview.appearance.theme`
      remains `auto`, and PDFs stay visually unchanged unless the user opts in.
- [ ] Do not copy code from `ArshSB/DarkPDF` or `diwash007/PDF-Dark-Mode`.
      Both are GPL-3.0 projects, and their core technique is an overlay or blend
      hack that this extension can implement independently if ever needed.
- [ ] Do not add a toolbar toggle, sliders, custom UI, or persisted per-document
      appearance state in v1.5.0. Settings-only keeps the release small.

## User-Facing Design

Use the existing setting namespace and add one new enum value:

```jsonc
"pdf-preview.appearance.theme": "dark-pages"
```

Theme semantics after v1.5.0:

- `auto`: follow VS Code colors for viewer chrome only; keep PDF pages as-is.
- `light`: light viewer chrome; keep PDF pages as-is.
- `dark`: dark viewer chrome; keep PDF pages as-is.
- `dark-pages`: dark viewer chrome and ask PDF.js to render page foreground and
  background with dark-reader colors.
- `inverted`: dark viewer chrome and apply CSS inversion to the rendered page.

The default remains `auto`. The recommended night setting is `dark-pages` for
normal text/vector PDFs. If a scanned PDF or image-heavy PDF still feels bright,
use `inverted`.

## Phase 0: Baseline And Worktree Safety

- [ ] Run `git status --short`.
- [ ] The current tree may already contain unrelated edits. Do not revert or
      stage them unless they are part of this release.
- [ ] Confirm `v1.4.7` (responsive toolbar) is the tagged prior release and
      `v1.4.6` (loader correctness + render regression test) shipped before
      it. Do not start dark-mode work if `1.4.x` blank-viewer or toolbar
      clipping regressions are still open.
- [ ] Before editing any dirty release file, inspect its diff:

```bash
git diff -- CHANGELOG.md README.md package.json package-lock.json lib/main.mjs lib/pdf.css src/test/suite/index.ts
```

- [ ] Confirm the prior version is `1.4.6`:

```bash
rg -n '"version": "1.4.6"' package.json package-lock.json CHANGELOG.md README.md
```

## Phase 1: Add The Theme Contract

- [ ] In `package.json`, update `pdf-preview.appearance.theme`.
- [ ] Add `dark-pages` to the enum between `dark` and `inverted`.
- [ ] Replace the current setting description with wording that distinguishes
      chrome-only dark mode, PDF.js recoloring, and full inversion.

Suggested description:

```json
"markdownDescription": "Preview appearance. `auto` follows VS Code colors for viewer chrome, `dark` darkens chrome only, `dark-pages` asks PDF.js to render pages with dark foreground/background colors, and `inverted` applies a full page inversion fallback."
```

- [ ] Do not add a second setting unless implementation shows the existing
      setting cannot carry this cleanly.

## Phase 2: Wire PDF.js `pageColors`

- [ ] Edit `lib/main.mjs`.
- [ ] Extend `THEME_VALUES` to include `dark-pages`.
- [ ] Add a small helper near the existing config helpers:

```js
function pageColorsForTheme(theme) {
  if (theme !== 'dark-pages') {
    return null;
  }
  return {
    background: '#111111',
    foreground: '#d8dee9',
  };
}
```

- [ ] Normalize the appearance theme before constructing `PDFViewer`.
- [ ] Pass `pageColors` into `new PDFViewer(...)`.

Target shape:

```js
const appearance = this.normalizedAppearance();

this.pdfViewer = new PDFViewer({
  container: this.elements.container,
  eventBus: this.eventBus,
  findController: this.findController,
  imageResourcesPath: this.config.imageResourcesPath,
  linkService: this.linkService,
  pageColors: pageColorsForTheme(appearance.theme),
  viewer: this.elements.viewer,
});
```

- [ ] Update `applyAppearance()` to reuse the same normalized appearance so
      `theme-dark-pages` is added to `document.body`.
- [ ] Keep `inverted` as CSS-only. Do not combine `pageColors` and CSS inversion.
- [ ] Do not pass VS Code CSS variables directly into `pageColors`; canvas
      rendering wants concrete CSS color values. Use literal hex colors for v1.5.0.

## Phase 3: CSS Chrome Treatment

- [ ] Edit `lib/pdf.css`.
- [ ] Include `theme-dark-pages` wherever the viewer should use the dark chrome
      background.

Target change:

```css
body.theme-dark #viewerContainer,
body.theme-dark-pages #viewerContainer,
body.theme-inverted #viewerContainer {
  background: #1f1f1f;
}
```

- [ ] Do not add a filter for `theme-dark-pages`.
- [ ] Keep the existing `theme-inverted .pdfViewer .page` filter unchanged.
- [ ] After visual QA, only adjust annotation popup/text-layer colors if they
      are demonstrably wrong in `dark-pages`.

## Phase 4: Tests

- [ ] Update `src/test/suite/index.ts`.
- [ ] Keep the current default assertion:

```ts
assert.strictEqual(theme, 'auto');
```

- [ ] Add an assertion that the contributed enum includes `dark-pages`.
- [ ] Read `lib/main.mjs` from `extension.extensionUri` and assert that it
      wires `pageColors` and recognizes `dark-pages`.
- [ ] Do not weaken existing CSP assertions. This feature should not require
      `unsafe-eval`, `wasm-unsafe-eval`, or new script permissions.

## Phase 5: Docs And Release Text

- [ ] Add a `1.5.0 (2026/04/27)` section to `CHANGELOG.md`.
- [ ] Mention:
  - [ ] `dark-pages` uses PDF.js page recoloring.
  - [ ] `inverted` remains available for scanned/image-heavy PDFs.
  - [ ] Defaults are unchanged.
- [ ] Update `README.md` settings or usage text with a short example:

```json
"pdf-preview.appearance.theme": "dark-pages"
```

- [ ] Update the README install command from the latest `1.4.x` VSIX to
      `1.5.0`.

## Phase 6: Version Bump

- [ ] Use npm's version helper so `package.json` and `package-lock.json` stay in
      sync:

```bash
npm version 1.5.0 --no-git-tag-version
```

- [ ] Re-check that only intended version fields changed:

```bash
git diff -- package.json package-lock.json
```

## Phase 7: Verification

Run the native checks:

```bash
npm run typecheck
npm run lint
npm test
```

Build and scan the VSIX:

```bash
npm run package -- --out pdf-preview-next-1.5.0.vsix
node ./tools/scan_vsix.mjs pdf-preview-next-1.5.0.vsix
```

Install locally before any upstream release work. Older cached versions of
this extension can mask new builds, so always purge them first:

```bash
code --uninstall-extension ricardofrantz.pdf-preview-next
rm -rf ~/.vscode/extensions/ricardofrantz.pdf-preview-next-*
# Fully quit VS Code (Cmd+Q on macOS), then relaunch.
code --install-extension pdf-preview-next-1.5.0.vsix --force
```

Manual visual QA in VS Code:

- [ ] Open a normal text/vector PDF with
      `"pdf-preview.appearance.theme": "dark-pages"`.
- [ ] Verify page background is dark and text is readable.
- [ ] Verify images/figures are acceptable and not globally inverted.
- [ ] Verify text selection, search highlights, links, outline, refresh, and
      print still work.
- [ ] Open a scanned or image-heavy PDF with `dark-pages`.
- [ ] If the scanned page remains bright, switch to `inverted` and verify the
      fallback still works.
- [ ] Switch back to `auto` and verify PDFs render normally.

## Phase 8: Commit And Release Hygiene

- [ ] Review the final diff:

```bash
git diff -- CHANGELOG.md README.md package.json package-lock.json lib/main.mjs lib/pdf.css src/test/suite/index.ts
git status --short
```

- [ ] Stage named files only:

```bash
git add CHANGELOG.md README.md package.json package-lock.json lib/main.mjs lib/pdf.css src/test/suite/index.ts
```

- [ ] Do not stage unrelated plan files unless explicitly requested;
      `.vscodeignore` already excludes plan files from VSIX packaging.
- [ ] Suggested commit message:

```bash
git commit -m "feat: add dark PDF page rendering mode"
```

## Acceptance Criteria

- [ ] `pdf-preview.appearance.theme` accepts `dark-pages`.
- [ ] `dark-pages` passes PDF.js `pageColors` into `PDFViewer`.
- [ ] `dark-pages` does not use CSS inversion.
- [ ] `inverted` still uses the current CSS inversion fallback.
- [ ] Defaults remain unchanged.
- [ ] No GPL code is copied from external dark-PDF extensions.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` pass.
- [ ] `pdf-preview-next-1.5.0.vsix` builds and passes `tools/scan_vsix.mjs`.
- [ ] Local VSIX install is verified before publishing or opening a PR.

## Deferred Options

- [ ] Add a toolbar toggle for page appearance.
- [ ] Add intensity sliders.
- [ ] Add a `pageColors` object setting for custom colors.
- [ ] Make `auto` optionally darken pages when VS Code is in a dark theme.
- [ ] Add a blend-overlay mode inspired by browser extensions, implemented
      independently if PDF.js recoloring and CSS inversion are not enough.
