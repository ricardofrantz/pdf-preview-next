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

## Security

This repository has been security-audited by **Claude Opus 4.7** (April 2026).
The current runtime uses `pdfjs-dist@5.6.205` with nonce-based webview scripts,
scoped resource roots, an explicit worker policy, and PDF.js eval/WASM
execution disabled.

## Settings

- `pdf-preview.default.cursor`
- `pdf-preview.default.scale`
- `pdf-preview.default.sidebar` (legacy compatibility; the PDF.js 5 shell does
  not currently show a sidebar)
- `pdf-preview.default.scrollMode`
- `pdf-preview.default.spreadMode`

## Install From Release

Until the VS Marketplace publisher is configured, install the VSIX from the
GitHub release:

```bash
code --install-extension pdf-preview-next-1.4.0.vsix --force
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
