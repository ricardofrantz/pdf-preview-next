# v1.9.0 Plan — Thumbnail Navigation

Status: `[ ]` todo

## Prerequisite

`v1.8.0` (focus preservation) must be shipped and verified. Do not bundle
thumbnails with focus work; they are independently risky and need their own
release window.

## Goal

Add a thumbnail navigation panel to the existing sidebar without importing
the full upstream PDF.js `viewer.html` shell, and without making the viewer
slower or heavier on large PDFs.

## Scope

- Add a thumbnail panel built on PDF.js primitives (`PDFPageView` thumbnail
  mode or a custom canvas renderer) only.
- Extend the existing sidebar so it can show either the outline panel or the
  thumbnail panel, not both at once for now.
- Add a setting to choose the default sidebar panel:
  - `pdf-preview.default.sidebarPanel`
  - values: `outline`, `thumbnails`
- Persist the active sidebar panel as part of view-state restore.
- Bound thumbnail rendering: render visible thumbnails on demand and recycle
  hidden ones rather than keeping every page rendered.

## Non-Goals

- No persistent annotations.
- No PDF editing.
- No full PDF.js viewer shell.
- No attachments/layers UI.
- No telemetry.
- No replacement of the existing `pdf-preview.default.sidebar` boolean. The
  boolean still controls whether the sidebar opens by default; the new
  setting controls *which panel* shows.

## Likely Files

- `lib/main.mjs`
- `lib/pdf.css`
- `src/pdfPreview.ts`
- `package.json`
- `src/test/suite/index.ts`
- `README.md`
- `CHANGELOG.md`

## Design Notes

- Avoid nested cards or decorative UI. This is a work tool.
- Keep toolbar control widths stable so PDF reloads do not shift layout.
- Maintain backwards compatibility:
  - `pdf-preview.default.sidebar = true` continues to mean "sidebar opens by
    default".
  - `pdf-preview.default.sidebarPanel` defaults to `outline` so existing
    users see no behavior change unless they opt in.
- Thumbnail click should jump to the corresponding page and persist scroll
  position via the existing view-state mechanism.
- Use IntersectionObserver or scroll-driven rendering so off-screen
  thumbnails are not painted.
- Cap canvas pool size so a large PDF cannot allocate hundreds of large
  bitmaps.

## Implementation Steps

1. Prototype thumbnails locally on a multi-page fixture; measure peak memory
   on a 200-page PDF before committing to the design.
2. If memory is acceptable, add the thumbnail panel HTML and CSS.
3. Add the `pdf-preview.default.sidebarPanel` setting to `package.json`.
4. Extend view-state schema with the active panel field; keep backwards
   compatibility for previously stored states without the field.
5. Add keyboard navigation: up/down to move between thumbnails, Enter to
   jump.
6. Update tests and add a runtime fixture-based test for multi-page
   navigation if feasible.
7. Update README and CHANGELOG.

## Tests

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run package`
- `npm run package:scan -- pdf-preview-next-1.9.0.vsix`
- Install-and-open gate (mandatory):
  - `code --uninstall-extension ricardofrantz.pdf-preview-next`
  - `rm -rf ~/.vscode/extensions/ricardofrantz.pdf-preview-next-*`
  - Fully quit VS Code, then relaunch.
  - `code --install-extension pdf-preview-next-1.9.0.vsix --force`
  - Open the multi-page outline fixture and a large fixture (~100 pages).
    Confirm thumbnail panel renders, click navigation works, and memory does
    not balloon.

## Acceptance Criteria

- Thumbnail navigation works on multi-page PDFs.
- Outline behavior is unchanged when the user keeps `sidebarPanel = outline`.
- View-state restore preserves page, scale, scroll, sidebar visibility, and
  the active panel.
- VSIX size stays inside the current budget.
- Peak memory on a 100-page fixture is bounded; no thumbnail-rendering
  pathway holds more than a small bounded number of canvases at once.

## Risks

- Thumbnail rendering can increase memory use on large PDFs. If the bounded
  rendering strategy fails QA, defer thumbnails to a later version rather
  than shipping a regression.
- Sidebar panel switching may interact with existing `default.sidebar`
  semantics. Document the precedence rules in README.
