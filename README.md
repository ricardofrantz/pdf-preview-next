# vscode-pdf Next

Modern, lightweight PDF viewer for VS Code.

`vscode-pdf Next` is Ricardo's modern, security-hardened successor to the
classic `tomoki1207.vscode-pdf` VS Code PDF preview extension. The goal is a
small extension that opens PDFs quickly, keeps viewer behavior predictable, and
avoids unnecessary features.

## Why this fork exists

The original extension has not had maintainer-authored code changes since 2022,
while issues and pull requests remain open. This fork carries local fixes and
will grow through small, practical improvements.

## Direction

- Keep the extension simple.
- Keep startup and reload behavior fast.
- Keep the packaged runtime as small as practical.
- Prefer stable PDF.js behavior over one-off patches.
- Fix viewer defaults when they are ignored or overwritten.
- Run a security audit before expanding the feature set.
- Close practical gaps from the deprecated upstream tracker while keeping PDF
  editing and broad extension APIs out of the previewer's core scope.

## Security

This repository has been security-audited by **Claude Opus 4.7** (April 2026).
The current runtime uses `pdfjs-dist@5.6.205` with nonce-based webview scripts,
scoped resource roots, an explicit worker policy, and PDF.js eval/WASM
execution disabled.

## Settings

- `pdf-preview.default.cursor` (resource-scoped)
- `pdf-preview.default.scale` (resource-scoped)
- `pdf-preview.default.sidebar` (resource-scoped)
- `pdf-preview.default.sidebarPanel` (resource-scoped)
- `pdf-preview.default.scrollMode` (resource-scoped)
- `pdf-preview.default.spreadMode` (resource-scoped)
- `pdf-preview.reload.closeOnDelete`
- `pdf-preview.reload.debounceMs`
- `pdf-preview.appearance.theme` (resource-scoped)
- `pdf-preview.appearance.pageGap` (resource-scoped)
- `pdf-preview.printCommand` (resource-scoped)

Resource-scoped settings can be overridden per workspace folder or PDF resource
where VS Code supports resource configuration. Reload settings remain global
because they control file-watcher behavior rather than document rendering
defaults. `pdf-preview.default.sidebar` controls whether the sidebar opens by
default; `pdf-preview.default.sidebarPanel` selects the initial panel (`outline`
or `thumbnails`). If an older per-PDF view state does not yet include a sidebar
panel, the viewer restores it as `outline` for compatibility.

Example dark page rendering:

```json
"pdf-preview.appearance.theme": "night"
```

`dark` uses dark viewer chrome while leaving PDF pages unchanged.
`night` asks PDF.js to recolor rendered PDF pages for lower-eye-strain reading.
`reader` is reserved for a smarter color-preserving reader mode and currently
uses the same safe rendering path as `night`.
`dark-pages` is kept as a compatibility alias for `night`.
`inverted` remains available for scanned or image-heavy PDFs.

## Commands And Controls

- `vscode-pdf Next: Open Preview` opens a PDF with this viewer.
- `vscode-pdf Next: Open Externally` opens the active PDF preview with the
  system PDF handler.
- `vscode-pdf Next: Refresh Preview` refreshes the active PDF preview.
- `vscode-pdf Next: Print to System` sends the active PDF to `lp` or to the
  configured print command, falling back to the system PDF handler.
- `PDF Preview Next: Reset View State` clears the saved page, zoom, scroll,
  sidebar visibility, and active sidebar panel for the active PDF only.
- The toolbar `External` button opens the PDF with the system PDF handler.
- The toolbar page-mode button cycles through `Clear`, `Night`, `Reader`, and
  `Invert`, and keeps that choice for refreshes and newly opened PDFs.
- The toolbar sidebar button shows PDF bookmarks or page thumbnails. Thumbnail
  rendering is bounded so large PDFs do not allocate canvases for every page at
  once.
- The toolbar `Refresh` button and `Ctrl+R` / `Cmd+R` refresh the current PDF
  without losing the current page, zoom, scroll, or outline-sidebar state.
- Automatic reloads after file changes keep focus in the current editor. A
  user-initiated refresh from inside the viewer may restore focus to the viewer
  control that triggered it.
- The toolbar `Print` button uses the same host-side system print path as the
  command.
- Relative links from one local PDF to another local `.pdf` in the same folder
  tree open with this viewer and preserve fragments such as `#page=2`. External
  web links keep the PDF.js default behavior.
- Inside the viewer, `j/k/h/l` scroll, `n/p` or `./,` move pages, `g/G` jump to
  first/last page, and `+/-` zoom.

## Upstream Gaps

The fork now covers the practical upstream requests for newer PDF.js, live
reload, external PDF access, outline/bookmark navigation, per-PDF view-state
restore, temporary delete/recreate build workflows, debounced refresh, printing
entry points, appearance controls, text selection/copy polish, and keyboard
navigation. PDF editing, persistent annotations, delete-pages support, and a
public cross-extension PDF.js API are intentionally deferred because they would
turn this previewer into a PDF editor or platform surface.

## Install From Release

Install the VSIX from the GitHub release, or from the VS Code Marketplace once
the publisher token is configured:

```bash
code --install-extension pdf-preview-next-1.9.0.vsix --force
```

To make VS Code use this viewer for PDFs:

```json
"workbench.editorAssociations": {
  "*.pdf": "pdf-preview-next.preview"
}
```

![screenshot](https://user-images.githubusercontent.com/3643499/84454816-98fcd600-ac96-11ea-822c-3ae1e1599a13.gif)

## Contribute

### Upgrade PDF.js

1. Update `tools/update_pdfjs.jsonc` with the target `pdfjs-dist` version and
   npm integrity value.
1. Run:

   ```bash
   npm run update:pdfjs
   ```

1. Verify with `npm run typecheck`, `npm run lint`, `npm test`, and
   `npm run package`.

## Change log

See [CHANGELOG.md](CHANGELOG.md).

## License

Please see [LICENSE](./LICENSE)
