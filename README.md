# PDF Preview Next

Ricardo's improved fork of `tomoki1207/vscode-pdfviewer` for displaying PDF
files in VS Code.

This fork keeps the existing `pdf-preview.*` settings for compatibility, but it
uses its own extension identity so it can be installed and updated independently
from `tomoki1207.pdf`.

## Why this fork exists

The original extension has not had maintainer-authored code changes since 2022,
while issues and pull requests remain open. This fork carries local fixes and
will grow through small, practical improvements without waiting on the original
package.

## Settings

- `pdf-preview.default.cursor`
- `pdf-preview.default.scale`
- `pdf-preview.default.sidebar`
- `pdf-preview.default.scrollMode`
- `pdf-preview.default.spreadMode`

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
