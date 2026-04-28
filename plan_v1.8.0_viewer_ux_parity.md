# v1.8.0 Plan — Focus Preservation

Status: `[ ]` todo

## Prerequisite

`v1.7.0` (inter-PDF links) must be shipped and verified.

## Goal

Stop file-watcher reload from stealing focus from the source editor when the
PDF preview is open beside another editor group. This is the most common
complaint that does not require new UI.

Thumbnail navigation has been moved to a dedicated `v1.9.0` plan to keep this
release small and reviewable.

## Scope

- Add a small focus-preservation guard around auto-refresh so the source
  editor keeps focus when the PDF rebuilds.
- Allow toolbar polish only where it does not destabilize layout. No new icon
  set, no new top-level UI surface.
- Persist whether the viewer container had focus before reload, and only
  refocus when the user had been interacting with the viewer.

## Non-Goals

- No thumbnail panel (see `plan_v1.9.0_thumbnails.md`).
- No annotations.
- No PDF editing.
- No new sidebar panel selection setting.
- No telemetry.
- No outline sidebar redesign beyond the existing toggle.

## Likely Files

- `lib/main.mjs`
- `lib/pdf.css`
- `src/pdfPreview.ts`
- `src/test/suite/index.ts`
- `README.md`
- `CHANGELOG.md`

## Design Notes

- Detect file-watcher-driven reloads vs explicit user reloads. Only the
  user-driven path may take focus.
- Record `document.activeElement` before reload starts and restore it
  afterwards if the active element existed in the new DOM.
- Avoid synchronous focus calls during PDF.js viewer setup; PDF.js itself
  sometimes scrolls the viewer container, and stealing focus during that
  window destabilizes layout.

## Implementation Steps

1. Reproduce current focus behavior:
   - Open the PDF preview in column 2.
   - Edit a TeX/Typst source in column 1.
   - Trigger a rebuild that updates the PDF.
   - Note whether focus moves to the PDF preview.
2. Add a `wasViewerFocused` boolean captured before each reload pathway.
3. Branch the post-reload focus call so file-watcher reloads do not move
   focus, while user-driven `Refresh` button / `Cmd+R` reloads still do.
4. Add a runtime test, if feasible, that opens the preview, focuses another
   editor, simulates a file change, and asserts the preview did not steal
   focus.
5. Update README and CHANGELOG.

## Tests

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run package`
- `npm run package:scan -- pdf-preview-next-1.8.0.vsix`
- Install-and-open gate (mandatory):
  - `code --uninstall-extension ricardofrantz.pdf-preview-next`
  - `rm -rf ~/.vscode/extensions/ricardofrantz.pdf-preview-next-*`
  - Fully quit VS Code, then relaunch.
  - `code --install-extension pdf-preview-next-1.8.0.vsix --force`
  - Manually verify the focus-preservation matrix above.

## Acceptance Criteria

- File-watcher reload does not steal focus from another editor group.
- Toolbar `Refresh` button and `Cmd+R` continue to focus the viewer when
  invoked from inside the viewer.
- View-state restore still preserves page, scale, scroll, and outline-sidebar
  visibility.
- VSIX size remains within the current budget.

## Risks

- VS Code's webview focus model varies between platforms and host versions.
  Guard with `if (typeof element.focus === 'function')` and never assume the
  exact event ordering.
- Restoring `document.activeElement` blindly can move focus to a stale
  element after the PDF re-renders. Match by element id when possible.
