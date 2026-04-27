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
Phase 1 hardening has landed: nonce-based webview scripts, scoped resource
roots, typed webview messages, and PDF.js eval disabled while the PDF.js 5
migration is prepared. See [SECURITY.md](./SECURITY.md) and
[PLAN.md](./PLAN.md).

## Settings

- `pdf-preview.default.cursor`
- `pdf-preview.default.scale`
- `pdf-preview.default.sidebar`
- `pdf-preview.default.scrollMode`
- `pdf-preview.default.spreadMode`

## Install From Release

Until the VS Marketplace publisher is configured, install the VSIX from the
GitHub release:

```bash
code --install-extension pdf-preview-next-1.2.3.vsix --force
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

1. Download latest [Prebuilt(older browsers)](https://mozilla.github.io/pdf.js/getting_started/#download).
1. Extract the ZIP file.
1. Overwrite ./lib/* by extracted directories.
   - If lib/web/viewer.html has changes, apply these changes to HTML template at pdfPreview.ts.
1. To not use sample pdf.
  - Remove sample pdf called `compressed.tracemonkey-pldi-09.pdf`.
  - Remove code about using sample pdf from lib/web/viewer.js.
    ```js
    defaultUrl: {
      value: "", // "compressed.tracemonkey-pldi-09.pdf"
      kind: OptionKind.VIEWER
    },
    ```

## Change log
See [CHANGELOG.md](CHANGELOG.md).

## License
Please see [LICENSE](./LICENSE)
