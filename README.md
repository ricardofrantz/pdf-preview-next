# PDF Preview Next

Simple, lightweight PDF preview for VS Code.

PDF Preview Next is Ricardo's improved fork of `tomoki1207/vscode-pdfviewer`.
The goal is a small extension that opens PDFs quickly, keeps the viewer behavior
predictable, and avoids unnecessary features.

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

- `pdf-preview.default.cursor`
- `pdf-preview.default.scale`
- `pdf-preview.default.sidebar`
- `pdf-preview.default.scrollMode`
- `pdf-preview.default.spreadMode`
- `pdf-preview.reload.closeOnDelete`
- `pdf-preview.reload.debounceMs`
- `pdf-preview.appearance.theme`
- `pdf-preview.appearance.pageGap`

## Commands And Controls

- `PDF Preview Next: Open Preview` opens a PDF with this viewer.
- `PDF Preview Next: Open Source` opens the active PDF preview as raw source.
- `PDF Preview Next: Refresh Preview` refreshes the active PDF preview.
- `PDF Preview Next: Print` prints the active PDF preview.
- The toolbar `Source` button opens the raw PDF with VS Code's default editor.
- The toolbar `Outline` button shows PDF bookmarks when the document provides
  an outline.
- The toolbar `Refresh` button and `Ctrl+R` / `Cmd+R` refresh the current PDF
  without losing the current page, zoom, scroll, or outline-sidebar state.
- The toolbar `Print` button uses the webview print path when VS Code exposes
  it. If the print dialog is unavailable, open the PDF externally or through
  `Source` and print from the system PDF viewer.
- Inside the viewer, `j/k/h/l` scroll, `n/p` or `./,` move pages, `g/G` jump to
  first/last page, and `+/-` zoom.

## Upstream Gaps

The fork now covers the practical upstream requests for newer PDF.js, live
reload, raw source access, outline/bookmark navigation, per-PDF view-state
restore, temporary delete/recreate build workflows, debounced refresh, printing
entry points, appearance controls, text selection/copy polish, and keyboard
navigation. PDF editing, persistent annotations, delete-pages support, and a
public cross-extension PDF.js API are intentionally deferred because they would
turn this previewer into a PDF editor or platform surface.

## Install From Release

Install the VSIX from the GitHub release, or from the VS Code Marketplace once
the publisher token is configured:

```bash
code --install-extension pdf-preview-next-1.4.2.vsix --force
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
