# v1.7.0 Plan — Inter-PDF Links

Status: `[ ]` todo

## Prerequisite

`v1.6.0` (fixture matrix and resource-scoped settings) must be shipped and
verified. The link service depends on documents actually loading; do not add
link handling on top of an unverified loader or thin test matrix.

## Goal

Open safe links from one local PDF to another inside VS Code, preserving PDF
fragments such as `#page=3`, without patching vendored PDF.js.

## Why

This is the strongest feature idea to borrow from `mathematic-inc/vscode-pdf`.
Their implementation patches the upstream PDF.js link service and has an open
regression around inter-document links. We should implement the behavior in our
own viewer shell instead, where we control validation and tests.

## Scope

- Handle local links from the current PDF to another PDF.
- Preserve fragments and named destinations when possible.
- Open target PDFs with this custom editor view type through
  `vscode.openWith(uri, PdfCustomProvider.viewType)`.
- Reject or delegate non-local protocols safely.
- Keep external web links using PDF.js default link behavior where safe.

## Non-Goals

- No PDF.js vendored source patch.
- No broad public API for other extensions.
- No arbitrary file opener for non-PDF links.
- No network fetching beyond what PDF.js already does for the opened local PDF.
- No transparent re-resolution of `vscode-resource://` or
  `vscode-webview://*.vscode-cdn.net` URLs as filesystem paths. Webview
  transport URLs are not trustworthy source-of-truth paths and must never be
  reverse-engineered into `file:` paths in the host extension.

## Likely Files

- `lib/main.mjs`
- `src/pdfPreview.ts`
- `src/pdfProvider.ts`
- `src/extension.ts`
- `src/test/suite/index.ts`
- `src/test/fixtures/link-source.pdf`
- `src/test/fixtures/link-target.pdf`
- `README.md`
- `CHANGELOG.md`

## Design Sketch

- Add a small custom link service wrapper or event hook around `PDFLinkService`.
- Detect link URLs that resolve under the current document directory and end in
  `.pdf`.
- Do not resolve links against VS Code `asWebviewUri` URLs. They are transport
  URLs, not trustworthy source-file paths.
- Post a validated message to the extension host:
  - `{ type: 'open-pdf-link', href: string }`
- In the extension host:
  - resolve relative hrefs against the current `this.resource` directory
  - require a local `file:` target for the first desktop implementation
  - require `.pdf`
  - keep the fragment
  - call `vscode.openWith(uri, PdfCustomProvider.viewType)`
- Treat `pdf-preview-next.preview` as the custom editor view type, not as a
  command ID.
- Do not trust path text supplied by the webview without validation.

## Implementation Steps

1. Add regression fixture PDFs:
   - source PDF with a relative link to another PDF
   - target PDF with at least two pages or a fragment target
2. Add message type validation for `open-pdf-link`.
3. Add host-side `openPdfLinkForActivePreview` or preview-local handler.
4. Add webview-side link interception.
5. Preserve current page/view state in the source preview when a link opens.
6. Add tests for message validation and URI normalization.
7. Verify manual flow by opening fixture source PDF and clicking the link.
8. Update README and CHANGELOG.

## Tests

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run package`
- `npm run package:scan -- pdf-preview-next-1.7.0.vsix`
- Install-and-open gate (mandatory):
  - `code --uninstall-extension ricardofrantz.pdf-preview-next`
  - `rm -rf ~/.vscode/extensions/ricardofrantz.pdf-preview-next-*`
  - Fully quit VS Code, then relaunch.
  - `code --install-extension pdf-preview-next-1.7.0.vsix --force`
  - Open the source link fixture and click the relative PDF link; confirm the
    target opens with this viewer and any `#page=N` fragment is honored.
  - Confirm an external `https://` link from the same fixture still opens
    through PDF.js default behavior, not the inter-PDF handler.

## Acceptance Criteria

- Clicking a relative PDF link opens the target in VS Code with this viewer.
- `#page=N` or equivalent fragment is preserved.
- Non-PDF local links do not get opened by this feature.
- External HTTP(S) links are not silently converted into local opens.
- No CSP relaxation is required.

## Risks

- Webview URI parsing can differ across local, remote, and web extension hosts.
  Keep the first version local-desktop only unless verified otherwise.
- PDF.js link internals may not expose all link cases cleanly. Prefer a narrow,
  testable interception point over broad monkey-patching.
