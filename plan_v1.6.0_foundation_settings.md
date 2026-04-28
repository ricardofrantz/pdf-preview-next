# v1.6.0 Plan — Foundation And Settings

Status: `[ ]` todo

## Prerequisite

`v1.4.6` (loader correctness) and `v1.5.0` (dark pages) must be shipped and
manually verified. This release expands the regression test matrix that
`v1.4.6` started; it should not be the first version to introduce runtime
PDF tests.

## Goal

Make the existing `1.5.x` behavior easier to preserve before adding larger
features. This release should expand the regression coverage that `v1.4.6`
seeded, make appropriate settings resource-scoped, and add a command to clear
saved view state for the current PDF.

## Why This Version Next

The comparison showed that this extension already has stronger security and
reload behavior than `mathematic-inc/vscode-pdf`, but the test suite is still
shallow. `v1.4.6` added a single render fixture; before adding inter-PDF links,
thumbnails, or marketplace work, we need a broader fixture matrix and
contracts around resource-scoped configuration.

## Scope

- Expand `src/test/fixtures/` with at least:
  - normal one-page PDF (already added in `v1.4.6`)
  - multi-page PDF with an outline
  - password-protected PDF
  - intentionally truncated/broken PDF
- Add tests for contributed settings, commands, webview options, and generated
  webview security properties.
- Add a runtime-rendered-test for at least the outline fixture: page count > 0
  and the outline toggle becomes enabled.
- Mark relevant settings as resource-scoped:
  - `pdf-preview.default.cursor`
  - `pdf-preview.default.scale`
  - `pdf-preview.default.sidebar`
  - `pdf-preview.default.scrollMode`
  - `pdf-preview.default.spreadMode`
  - `pdf-preview.appearance.theme`
  - `pdf-preview.appearance.pageGap`
- Add command:
  - `pdf-preview.resetViewState`
  - title: `PDF Preview Next: Reset View State`
- Add a toolbar or command-palette-only entry only after deciding whether UI
  surface is warranted. Default should be command-palette-only.

## Non-Goals

- No inter-document link handling.
- No thumbnails.
- No bundler migration.
- No Marketplace/Open VSX publishing.

## Likely Files

- `package.json`
- `src/extension.ts`
- `src/pdfProvider.ts`
- `src/pdfPreview.ts`
- `src/test/suite/index.ts`
- `src/test/fixtures/*`
- `.vscodeignore`
- `tools/scan_vsix.mjs`
- `README.md`
- `CHANGELOG.md`

## Implementation Steps

1. Re-read current dirty changes in `CHANGELOG.md`, `package.json`,
   `package-lock.json`, and `src/pdfPreview.ts`.
2. Add fixture PDFs. Keep them tiny and deterministic.
3. Before adding fixtures, verify `.vscodeignore` and `tools/scan_vsix.mjs`
   exclude test fixtures, plan files, scratch files, source maps, and source TS
   from every intermediate VSIX, not only from the later bundling release.
4. Extract any webview HTML generation hooks needed for tests without widening
   runtime API surface.
5. Add tests for:
   - extension registration
   - all contributed command IDs
   - settings defaults
   - resource-scoped setting metadata
   - `retainContextWhenHidden: false`
   - CSP contains `script-src 'nonce-...`
   - CSP does not contain `script-src 'unsafe-inline'`
   - CSP keeps `style-src 'unsafe-inline'` only for PDF.js runtime geometry
     styles, with scripts still nonce-bound
   - webview resource roots stay scoped
6. Change PDF-specific runtime reads to use
   `vscode.workspace.getConfiguration('pdf-preview', resource)` so
   resource/workspace-folder overrides are honored.
7. Add `resetViewState` command.
8. Implement provider/preview method to delete the current PDF view-state key.
9. Add a status message after reset so the user knows the command did something.
10. Update README settings/commands list.
11. Update CHANGELOG under `1.6.0`.

## Tests

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm audit --omit=dev --audit-level=high`
- `npm run package`
- `npm run package:scan -- pdf-preview-next-1.6.0.vsix`
- Install-and-open gate (mandatory):
  - `code --uninstall-extension ricardofrantz.pdf-preview-next`
  - `rm -rf ~/.vscode/extensions/ricardofrantz.pdf-preview-next-*`
  - Fully quit VS Code, then relaunch.
  - `code --install-extension pdf-preview-next-1.6.0.vsix --force`
  - Open each fixture (normal, outline, password, broken) and confirm:
    - normal renders pages
    - outline toggle becomes enabled when an outline exists
    - password fixture prompts and accepts the correct password
    - broken fixture surfaces a load error in the banner without crashing

## Acceptance Criteria

- Existing PDF loading, refresh, print, source-open, and find behavior remains
  unchanged.
- Resetting view state makes the next open use current defaults again.
- Settings can be overridden per resource/workspace folder where VS Code
  supports resource-scoped configuration.
- Runtime config reads use the opened PDF as the configuration scope.
- Tests fail if CSP loses the nonce or reintroduces inline scripts, `unsafe-eval`,
  or `wasm-unsafe-eval`.
- No shipped VSIX contains test fixtures unless explicitly needed for runtime.
- `.vscodeignore` and the VSIX scanner protect all releases starting with
  `v1.6.0`, not only the later bundling release.

## Risks

- Fixture PDFs can bloat the VSIX if `.vscodeignore` is incomplete.
- Reset-view-state should not erase all PDFs' state unless the user explicitly
  asks for a global command later.
