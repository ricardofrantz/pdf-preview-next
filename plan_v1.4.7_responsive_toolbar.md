# v1.4.7 Plan — Responsive Toolbar

Status: `[ ]` not started

## Goal

Stop the toolbar from horizontally scrolling and clipping its right-hand
controls in narrow editor splits. At every realistic VS Code pane width
(≥ 480 px), every control stays visible on a single 44 px row.

## Why This Version Next

A real user-visible bug was reported on a small-screen workflow: in a
1280-wide editor with the explorer open, the right-hand action group
(`Outline`, `Print`, `Refresh`, `Source`) is clipped off-screen by an
unexpected horizontal scrollbar inside the toolbar (`overflow-x: auto`
on `#pdf-toolbar`). The toolbar is editor chrome, not content; a
horizontal scrollbar in chrome is a UX defect.

This fix is independent of `v1.5.0` dark pages and `v1.6.0` foundation
work. Shipping it as `v1.4.7` keeps each release small, gets the
usability fix to users immediately after the `v1.4.6` loader fix, and
preserves the "small slices" rule in `plan_versions.md`.

## Root Cause

`#pdf-toolbar` in `lib/pdf.css`:

```css
#pdf-toolbar {
  display: flex;
  gap: 8px;
  height: 44px;
  overflow-x: auto;
  white-space: nowrap;
  /* … */
}
```

The combination of fixed-width text buttons (`Prev`, `Next`, `Outline`,
`Print`, `Refresh`, `Source`) plus a 168 px find input plus a 96 px-min
zoom select plus a status span produces a content row that is ~720 px
wide before any compaction. Below that pane width, `overflow-x: auto`
silently clips the right-hand group instead of compacting it.

The button class is already `icon-button` even though every button
renders text — the original intent was clearly icon-first; this version
finishes that.

## Scope

- Replace the visible text on every toolbar button with an inline SVG
  icon plus a `<span class="label">` carrying the existing text.
- Add a CSS container query on `#pdf-toolbar` that hides `.label`
  below 720 px so buttons become icon-only at narrow widths while
  staying labeled at comfortable widths.
- Remove `overflow-x: auto` from `#pdf-toolbar`. Use `overflow: hidden`
  and let the find input + zoom select absorb slack.
- Tighten gaps (toolbar `gap: 8 → 6`, group `gap: 5 → 4`) to recover
  ~12 px without affecting visual rhythm.
- Allow the find input to flex from a 96 px floor instead of being
  fixed at 168 px.
- Add automated assertions for the toolbar markup contract and the
  container-query rule so a future refactor cannot silently regress
  the responsive behavior.

## Non-Goals

- No popover overflow menu. Widths below 480 px and the very-narrow
  case (~320 px) are explicitly deferred — see `## Deferred`.
- No two-row stacked toolbar layout.
- No Codicon font wiring; inline SVG keeps CSP and bundling simple.
- No new toolbar features (no rotation, no fullscreen, no presentation
  mode).
- No outline sidebar, viewer container, or PDF.js loader changes.
- No CSP changes.

## Prerequisite

Do not start this version until `v1.4.6` (loader correctness) has
shipped and been verified by installing the VSIX and opening at least
one PDF. Layout work on top of an unverified loader risks shipping a
release that still cannot render a PDF.

## Likely Files

- `lib/pdf.css`
- `src/pdfPreview.ts`
- `src/test/suite/index.ts`
- `package.json`
- `package-lock.json`
- `CHANGELOG.md`
- `README.md`

## Implementation Steps

1. Confirm `v1.4.6` is shipped and the working tree is clean apart from
   in-flight responsive-toolbar work.
2. Add inline SVG icons to `PDF_VIEWER_BODY` in `src/pdfPreview.ts`.
   Set 9 icons (`chevron-left`, `chevron-right`, `zoom-out`, `zoom-in`,
   `search`, `chevron-up`, `chevron-down`, `list-tree`, `printer`,
   `refresh`, `file-code`) drawn at 16 × 16 with `currentColor` strokes
   so they pick up VS Code theme tokens automatically. Either inline
   per button or use one `<svg>` `<symbol>` block plus `<use>` refs.
3. Update each toolbar button in the same file from
   `<button …>Prev</button>` to
   `<button …><svg class="icon" …>…</svg><span class="label">Prev</span></button>`.
   Keep every existing `id`, `aria-label`, and `title` unchanged. The
   page-number `<input>`, zoom `<select>`, and find `<input>` keep their
   current shape.
4. In `lib/pdf.css`:
   - Change `#pdf-toolbar { overflow-x: auto; }` → `overflow: hidden;`
     and add `container-type: inline-size`.
   - Change `#pdf-toolbar { gap: 8px; }` → `gap: 6px`.
   - Change `.toolbar-group { gap: 5px; }` → `gap: 4px`.
   - Add `.icon { width: 16px; height: 16px; flex: 0 0 auto; }`.
   - Add `button .label { margin-left: 5px; }` so icon + label spacing
     is consistent.
   - Add `@container (max-width: 720px) { #pdf-toolbar .label { display:
     none; } }`. Keep `aria-label` and `title` so screen readers and
     hover tooltips still announce the action.
   - Change `input[type='search']` to `min-width: 96px; width: auto;
     flex: 1 1 auto;` scoped under `.toolbar-find` so only the find
     input flexes, not other search inputs.
   - Verify `select#scaleSelect { min-width: 96px; }` continues to
     truncate cleanly at the breakpoint.
5. Confirm `viewerContainer { top: 44px }` still matches the rendered
   toolbar height. The 44 px is preserved at every breakpoint, so this
   is just a re-check.
6. Add assertions in `src/test/suite/index.ts` for:
   - every original toolbar button id (`previous`, `next`, `zoomOut`,
     `zoomIn`, `findPrevious`, `findNext`, `outlineToggle`, `print`,
     `reload`, `openSource`) still exists in `PDF_VIEWER_BODY`,
   - every toolbar button contains both an `<svg class="icon">` and a
     `<span class="label">…</span>` with the original visible text,
   - every toolbar button still has a non-empty `aria-label`,
   - `#pdf-toolbar` CSS no longer contains `overflow-x: auto`,
   - `#pdf-toolbar` CSS contains `container-type: inline-size`,
   - the `@container (max-width: 720px)` block hides `.label`.
7. Update `CHANGELOG.md` with a `1.4.7` entry: icons replace text on
   toolbar buttons, labels collapse below 720 px container width, and
   the toolbar no longer scrolls horizontally.
8. Update `README.md` install command to `pdf-preview-next-1.4.7.vsix`.
9. Bump `package.json` to `1.4.7` and refresh `package-lock.json`.

## Tests

- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm audit --omit=dev --audit-level=high`
- `npm run package`
- `npm run package:scan -- pdf-preview-next-1.4.7.vsix`
- Manual install-and-open gate (mandatory):
  - `code --uninstall-extension ricardofrantz.pdf-preview-next`
  - `rm -rf ~/.vscode/extensions/ricardofrantz.pdf-preview-next-*`
  - Fully quit VS Code, then relaunch.
  - `code --install-extension pdf-preview-next-1.4.7.vsix --force`
  - Open at least one normal PDF in:
    - a wide single-column editor,
    - a 50/50 vertical split,
    - a narrow split (~480 px pane).
  - At each width: confirm no horizontal scrollbar inside the toolbar,
    every button reachable, page count > 0, scrolling, find, refresh,
    source open all work, no startup error in the toolbar status.

## Acceptance Criteria

- No horizontal scrollbar inside `#pdf-toolbar` at any pane width
  ≥ 480 px.
- All toolbar buttons render an icon and have a non-empty `aria-label`.
- At container widths < 720 px, button labels are hidden but icons
  remain visible.
- Toolbar height is fixed at 44 px (no two-row reflow).
- Existing keyboard shortcuts, find behavior, zoom, refresh, and
  source open are unchanged.
- Automated tests fail if the toolbar markup, CSS overflow, or the
  container-query rule regresses.

## Risks

- Container queries (`container-type`, `@container`) require Electron
  ≥ 105 / Chromium ≥ 105. The minimum `engines.vscode` for this
  extension currently maps to Electron versions well above that
  threshold, so this is safe — but the `engines.vscode` value should
  be re-checked before release.
- Inline SVG icons need careful sizing; mismatched stroke widths
  produce a visually inconsistent toolbar. Match Codicon stroke weight
  (1.33 px on a 16 × 16 grid).
- Hiding labels relies entirely on `aria-label` for accessibility. The
  test in step 6 enforces non-empty `aria-label` on every button to
  prevent a regression.

## Deferred

- Below 480 px the toolbar can still be tight in extreme splits. A
  popover-based overflow menu for the actions group (`Outline`,
  `Print`, `Refresh`, `Source`) and a search-icon-triggered find
  popover are deferred to a later polish release. They are not part
  of `v1.4.7`.
- Codicon font wiring via `vscode-resource://` so icons match VS
  Code's icon set pixel-for-pixel — only relevant if inline SVG
  proves visually inconsistent in practice.
- Reordering toolbar groups, adding rotation / fullscreen / presentation
  mode buttons.
