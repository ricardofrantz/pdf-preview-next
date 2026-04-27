# Changelog

## Unreleased

## 1.4.5 (2026/04/27)

- Read the opened PDF through the webview frame and pass `Uint8Array` data to
  PDF.js, bypassing range/stream loading against VS Code webview-resource URLs
  that could leave the viewer stuck at `of 0`.
- Disable PDF.js range and streaming modes for local webview resources.

## 1.4.4 (2026/04/27)

- Load the PDF.js core module before dynamically importing the PDF.js viewer
  module so `globalThis.pdfjsLib` exists before PDF.js 5 evaluates
  `pdf_viewer.mjs`.
- Add an early webview bootstrap error handler that reports startup failures in
  the preview instead of leaving a blank panel.
- Rename the marketplace-facing extension display name to `vscode-pdf Next` and
  describe it as a modern successor to the classic `vscode-pdf` extension.

## 1.4.3 (2026/04/27)

- Restore `style-src 'unsafe-inline'` in the webview CSP because PDF.js 5 writes
  page, text-layer, annotation-layer, and scaling geometry through inline style
  properties at runtime. Scripts remain nonce-bound and eval remains disabled.

## 1.4.2 (2026/04/27)

- Disable retained hidden webview contexts so hidden PDF previews are recreated
  from the current extension bundle after local VSIX upgrades. This prevents
  stale panels from trying to load removed extension-resource paths.
- Smooth the webview toolbar with clearer focus states, button press feedback,
  tabular page/find counters, and less abrupt status updates.
- Add a regression assertion that the custom editor keeps retained webview
  contexts disabled.

## 1.4.1 (2026/04/27)

- Add commands for opening a PDF preview and reopening the active preview as raw
  PDF source.
- Add an outline sidebar for PDFs that provide bookmarks, wired to the existing
  `pdf-preview.default.sidebar` setting.
- Persist per-PDF page, zoom, and scroll state in workspace state and restore it
  on reopen unless an explicit URL hash is used.
- Keep previews open across temporary PDF delete/recreate cycles by default;
  `pdf-preview.reload.closeOnDelete` restores the old close-on-delete behavior.
- Add finite appearance settings for dark/inverted viewing and page spacing.
- Add lightweight in-viewer keyboard navigation shortcuts.
- Add a visible `Refresh` toolbar button, `PDF Preview Next: Refresh Preview`
  command, and `Ctrl+R` / `Cmd+R` in-viewer refresh.
- Debounce automatic refresh after file changes with
  `pdf-preview.reload.debounceMs`, preserving the previous rendered PDF and
  retrying once if a rebuild temporarily writes an incomplete file.
- Preserve manual outline-sidebar visibility across refreshes.
- Add a visible `Print` toolbar button and `PDF Preview Next: Print` command.
  The webview tries the browser print path first and falls back to opening the
  PDF externally when printing is unavailable.
- Improve hand-scroll behavior so text selection/copy and text dragging do not
  start pointer-captured drag scrolling.
- Add CI and tag-release workflows for tests, VSIX packaging, content scanning,
  GitHub release assets, VS Code Marketplace publishing, and Open VSX publishing
  when tokens are configured.
- Document which deprecated upstream issues are now covered and which editor/API
  requests remain out of scope.

## 1.4.0 (2026/04/27)

- Upgrade the vendored PDF.js runtime to `pdfjs-dist@5.6.205`.
- Replace the legacy global `PDFViewerApplication` integration with a small
  ESM viewer shell owned by this extension.
- Keep PDF.js eval and WASM execution disabled so the webview CSP does not need
  `unsafe-eval`, `wasm-unsafe-eval`, or inline styles.
- Preserve live-reload behavior without patching PDF.js private viewer
  internals.
- Add built-in page navigation, zoom, find, password prompt, and hand-scroll
  support for the new viewer shell.
- Add `npm run update:pdfjs` with a pinned JSONC manifest and npm integrity
  verification for future PDF.js upgrades.
- Remove the old PDF.js 3 full viewer, locales, source maps, and debugger
  artifacts from the vendored runtime.
- Do not package unused PDF.js scripting sandbox or WASM decoder binaries.

## 1.3.0 (2026/04/27)

- Harden webview configuration escaping for PDF paths containing HTML-sensitive
  characters.
- Resolve extension resource URIs with VS Code URI helpers for better
  cross-platform behavior.
- Fix PDF live reload by watching the opened file with a directory-relative
  pattern instead of passing an absolute path as a glob.
- Keep PDF.js reload cleanup reliable when a reload fails.
- Stop PDF.js from intercepting VS Code print and command-palette shortcuts.
- Add defensive support for PDF URL hash destinations.
- Keep PDF annotation popup text readable.
- Exclude PDF.js source maps and debugger files from packaged VSIX builds.
- Harden the webview CSP with nonce-based scripts and an explicit worker
  policy.
- Scope webview local resources to the extension and the opened PDF's
  containing directory.
- Disable PDF.js eval support while the PDF.js 5 migration is prepared.
- Simplify preview disposal and message handling.
- Modernize the TypeScript, ESLint, Prettier, VS Code test, and VSIX packaging
  toolchain.

## 1.2.3 (2026/04/27)

- Publish improved fork under the `pdf-preview-next` identity.
- Respect `pdf-preview.default.sidebar` during PDF.js startup, so persisted
  PDF.js sidebar history does not override the configured default.
- Replace the inherited icon with a new `PDF Preview Next` icon.
- Keep VS Code type definitions out of the runtime package.
- Document the project direction: simple, lightweight, robust, and fast.

## 1.2.2 (2022/12/23)

- Fix about rendering Unicode characters

## 1.2.1 (2022/12/12)

- Update PDF.js to 3.1.81-legacy
- Restore scroll position during reload (#136)
- Run under remote development (#100)

### Thank you

- @kfigiela Run extension locally when using remote development #100
- @Daniel-Atanasov fix: Fix scroll location and flickering during reload #136

## 1.2.0 (2021/12/15)

- Allow pdf viewer to work in an untrusted workspace (#102)
- Bump version of PDF.js to Stable (v2.10.377) (#120)

### Bug fixes

- Support Unicode in PDF by passing the right cMapUrl to pdf.js (#116)
- Preserve the current page number and zoom level on reload (#121)

### Thank you
- @lramos15 Added settings about untrusted workspaces. #102
- @aifreedom Fixed bug about Unicode charactors. #116
- @simon446 Bump pdf.js version. #120
- @zamzterz Fixed to preserve page number and scale on reload. #121

## 1.1.0 (2020/07/13)

- The issue about extension view is resolved.
  + Remove message shown on loaded. 
- Support default viewer settings
  + cursor (**hand** or tool)
  + scale (**auto**, page-actual, etc...)
  + sidebar (**hide** or show)
  + scrollMode (**vertical**, horizontal or wrapped)
  + spreadMode (**none**, odd or even)

## 1.0.0 (2020/06/18)

- [Change extension API](https://github.com/microsoft/vscode/issues/77131)
- Resolve known issues about showing pdf preview.
- Upgrade PDF.js to 2.4.456

## 0.6.0 (2020/04/10)

- Support auto reload (#52)
- Migrate vscode-extension packages

### Thank you
- @GeorchW Implemented auto-refresh ( #11 )  #52

## 0.5.0 (2019/02/25)

- Recovery for working even VSCode 1.31.x.
- Avoid nested `<iframe>`.

## 0.4.3 (2018/11/28)

- Recovery for working even VSCode 1.30.0.

## 0.4.2 (2018/11/28)

- Revive display state on load VSCode.
- [Event-Stream Package Security Update](https://code.visualstudio.com/blogs/2018/11/26/event-stream)

## 0.4.0 (2018/11/9)

- Migrate vscode internal api. Due to [Microsoft/vscode#62630](https://github.com/Microsoft/vscode/issues/62630)
- Upgrade PDF.js to 2.1.36

## 0.3.0 (2018/6/6)

- Upgrade PDF.js to 1.9.426 (#23)

### Thank you
- @Kampfgnom bump to pdf.js version #23

## 0.2.0 (2017/1/12)

- Fixed displaying on linux (#5)
- Be able to open PDF from context menu in explorer now (#6)

### Thank you
- @serl support for context menu in explorer #6

## 0.1.0 (2016/11/30)

- Add extension icon.
- Use all PDF.js [Pre-built](https://mozilla.github.io/pdf.js/getting_started/#download) files.

## 0.0.2 (2016/11/24)

- consistent file icon

## 0.0.1 (2016/10/25)

- Initial release.
