#!/usr/bin/env python3
"""Migrate plan_v*.md roadmap files to beads (br) issues.

Creates one epic per version (chained sequentially) plus one task per
implementation step inside each version. Each task is self-contained per
the beads-workflow rule: descriptions carry enough background to make
the original .md unnecessary.

Re-run safe: aborts if any bead with `migrated-from-plan` label already
exists, so we never double-create.

Usage:
    cd <repo root>
    python3 tools/migrate_plans_to_beads.py

Requires: `br` (beads_rust) on PATH, .beads/ workspace already initialized.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass, field

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@dataclass
class Task:
    """A single implementation-step bead."""

    title: str
    description: str
    type: str = "task"  # task | bug | test
    priority: int = 2


@dataclass
class Version:
    """A version-level epic plus its ordered task list."""

    key: str  # e.g. "v1.4.6"
    epic_title: str
    epic_description: str
    epic_priority: int
    epic_initial_status: str | None = None  # e.g. "in_progress"
    tasks: list[Task] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Bead specifications, sourced from plan_v*.md
# ---------------------------------------------------------------------------

ROADMAP = Version(
    key="roadmap",
    epic_title="PDF Preview Next Roadmap",
    epic_description=(
        "Master tracker for the v1.4.6 -> v2.0.0 release roadmap.\n\n"
        "Goal: turn the comparison with mathematic-inc/vscode-pdf into "
        "small, release-sized implementation slices. Each version is coded, "
        "tested, packaged, locally installed in VS Code, and visually "
        "verified before starting the next one.\n\n"
        "Execution rules (from plan_versions.md):\n"
        "- Work one version file at a time.\n"
        "- Update each version's status from `[ ]` to `[~]` to `[x]` "
        "(here, the bead status mirrors that lifecycle).\n"
        "- Static gate: format:check, lint, typecheck, test, "
        "audit, package, package:scan.\n"
        "- Mandatory install-and-open gate before declaring a version "
        "shipped: `code --uninstall-extension`, `rm -rf ~/.vscode/"
        "extensions/ricardofrantz.pdf-preview-next-*`, full quit, "
        "reinstall, reload, open at least one fixture PDF.\n"
        "- Never weaken CSP, message validation, resource roots, or "
        "PDF.js execution restrictions to gain feature parity. Every "
        "1.4.x release passed static checks while the viewer was blank.\n\n"
        "Baseline strengths to preserve across all versions:\n"
        "- PDF.js 5.6.205\n"
        "- nonce-based webview scripts\n"
        "- scoped localResourceRoots\n"
        "- typed and validated webview messages\n"
        "- eval/WASM disabled in PDF.js loading\n"
        "- reliable refresh for temporary delete/recreate workflows\n"
        "- per-PDF view-state restore\n\n"
        "Deferred (out of scope for the v1.x/v2.0 line): persistent "
        "annotations, delete-pages support, public cross-extension "
        "PDF.js API, full upstream PDF.js viewer shell import, telemetry."
    ),
    epic_priority=0,
)


VERSIONS: list[Version] = [
    Version(
        key="v1.4.6",
        epic_priority=0,
        epic_initial_status="in_progress",
        epic_title="v1.4.6 Loader Correctness",
        epic_description=(
            "Stop the 'blank PDF panel' regression at the root cause and "
            "prevent it from shipping again. Every 1.4.0-1.4.5 release "
            "had at least one user report or local repro of an empty "
            "viewer; static checks (lint/typecheck/npm test) all passed "
            "while the viewer was blank in real use.\n\n"
            "Three root causes are fixed in this release:\n"
            "1. lib/main.mjs uses top-level `await import('./pdfjs/web/"
            "pdf_viewer.mjs')` which makes the module asynchronous, so "
            "the HTML parser fires DOMContentLoaded before the dynamic "
            "import resolves. The bootstrap registered inside a "
            "DOMContentLoaded listener never executed -> blank viewer.\n"
            "2. PDF.js 5.6.205 validates that both `container` and "
            "`viewer` constructor args are DIVs and that the visible "
            "container is absolutely positioned. The extension supplied "
            "<main id='viewerContainer'> with relative positioning, so "
            "PDF.js threw before loading any PDF.\n"
            "3. PDF.js 5.6.205 calls Map/WeakMap.prototype."
            "getOrInsertComputed (TC39 Stage 3 'Upsert' proposal) which "
            "isn't shipped in current VS Code Electron builds (verified "
            "on VS Code 1.117.0). First render throws "
            "`this[#fr].getOrInsertComputed is not a function`.\n\n"
            "No new viewer features, no CSP changes, no PDF.js upgrade, "
            "no bundler migration, no marketplace publishing in this "
            "release -- the only goal is to make the viewer load."
        ),
        tasks=[
            Task(
                title="Confirm clean working tree before loader work",
                description=(
                    "Verify only in-flight loader changes are staged/"
                    "modified. Do not start patching lib/main.mjs while "
                    "unrelated work is dirty. `git status --short` should "
                    "show only files relevant to v1.4.6."
                ),
                priority=1,
            ),
            Task(
                title="Replace DOMContentLoaded listener with readyState branch in lib/main.mjs",
                description=(
                    "Replace the bottom `window.addEventListener("
                    "'DOMContentLoaded', ...)` registration with:\n\n"
                    "```js\n"
                    "if (document.readyState === 'loading') {\n"
                    "  window.addEventListener('DOMContentLoaded', "
                    "startApp, { once: true });\n"
                    "} else {\n"
                    "  startApp();\n"
                    "}\n"
                    "```\n\n"
                    "Top-level `await import('./pdfjs/web/pdf_viewer.mjs')` "
                    "makes the module async; DOMContentLoaded has already "
                    "fired by the time the dynamic import resolves, so a "
                    "late listener never executes."
                ),
                type="bug",
                priority=0,
            ),
            Task(
                title="Switch viewerContainer from <main> to absolutely positioned <div>",
                description=(
                    "Change the markup in src/pdfPreview.ts from "
                    "`<main id='viewerContainer'>` to `<div id="
                    "'viewerContainer' role='main' tabindex='0'>` and "
                    "ensure `#viewerContainer { position: absolute; "
                    "inset: 0; }` in lib/pdf.css. PDF.js 5.6.205 rejects "
                    "non-DIV constructor args and rejects relative-"
                    "positioned visible containers."
                ),
                type="bug",
                priority=0,
            ),
            Task(
                title="Add lib/polyfills.mjs for Map/WeakMap getOrInsertComputed",
                description=(
                    "Create lib/polyfills.mjs that patches "
                    "Map.prototype.getOrInsertComputed and "
                    "WeakMap.prototype.getOrInsertComputed when missing "
                    "(TC39 Stage 3 'Upsert' proposal). Add `import "
                    "'./polyfills.mjs';` as the very first line of "
                    "lib/main.mjs, ahead of any `./pdfjs/...` import, so "
                    "the polyfill evaluates before PDF.js does. Without "
                    "this, the first render throws "
                    "`this[#fr].getOrInsertComputed is not a function` "
                    "in download/annotation/rendering paths."
                ),
                type="bug",
                priority=0,
            ),
            Task(
                title="Keep startup error handler in src/pdfPreview.ts (remove temporary banners)",
                description=(
                    "Bootstrap error handler must continue writing "
                    "startup errors to the toolbar status without "
                    "retaining the temporary diagnostic banners that "
                    "were used during the 1.4.x debugging cycle. Strip "
                    "any leftover instrumentation before commit."
                ),
                priority=2,
            ),
            Task(
                title="Add regression assertions for startup, viewer-container, and polyfill order",
                description=(
                    "Extend src/test/suite/index.ts with assertions for:\n"
                    "- `document.readyState === 'loading'` fallback "
                    "branch present in lib/main.mjs.\n"
                    "- DOMContentLoaded registration only on the loading "
                    "path.\n"
                    "- `<div id='viewerContainer' role='main' "
                    "tabindex='0'>` markup.\n"
                    "- `#viewerContainer { position: absolute; inset: "
                    "0; }` CSS.\n"
                    "- No `<main id='viewerContainer'>` regression.\n"
                    "- lib/polyfills.mjs exists and is the first import "
                    "in lib/main.mjs, ahead of any `./pdfjs/...` import.\n\n"
                    "Static checks must fail if any of these regress."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Update CHANGELOG.md and README.md for 1.4.6",
                description=(
                    "Add a `1.4.6` CHANGELOG entry describing the load-"
                    "order fix, the PDF.js DIV/absolute-positioned "
                    "container requirement, the getOrInsertComputed "
                    "polyfill, and the cleanup of temporary "
                    "diagnostics. Update README install command to "
                    "`pdf-preview-next-1.4.6.vsix`."
                ),
                priority=2,
            ),
            Task(
                title="Static gate for v1.4.6: format/lint/typecheck/test/audit/package/scan",
                description=(
                    "Run, in order:\n"
                    "- npm run format:check\n"
                    "- npm run lint\n"
                    "- npm run typecheck\n"
                    "- npm test\n"
                    "- npm audit --omit=dev --audit-level=high\n"
                    "- npm run package\n"
                    "- npm run package:scan -- pdf-preview-next-"
                    "1.4.6.vsix\n\n"
                    "Static gate is necessary but never sufficient: "
                    "every 1.4.0-1.4.5 release passed static checks "
                    "while the viewer was blank."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Manual install-and-open verification for 1.4.6",
                description=(
                    "Mandatory install-and-open gate:\n"
                    "1. `code --uninstall-extension ricardofrantz.pdf-"
                    "preview-next`\n"
                    "2. `rm -rf ~/.vscode/extensions/ricardofrantz.pdf-"
                    "preview-next-*` (older cached versions can mask "
                    "new builds; --force alone is not reliable when the "
                    "extension is loaded in memory).\n"
                    "3. Fully quit VS Code (Cmd+Q on macOS), then "
                    "relaunch.\n"
                    "4. `code --install-extension pdf-preview-next-"
                    "1.4.6.vsix --force`\n"
                    "5. Run Developer: Reload Window or fully quit and "
                    "relaunch again.\n"
                    "6. Verify `ls ~/.vscode/extensions/ricardofrantz."
                    "pdf-preview-next-*/lib/` contains polyfills.mjs "
                    "and other expected files.\n"
                    "7. Open at least one normal PDF and one outline-"
                    "bearing PDF; confirm page count > 0, scrolling, "
                    "find, refresh, source open all work, no startup "
                    "error in the toolbar status.\n\n"
                    "This gate exists because 1.4.0-1.4.5 all shipped "
                    "with a blank viewer despite green static checks."
                ),
                type="test",
                priority=0,
            ),
        ],
    ),
    Version(
        key="v1.4.7",
        epic_priority=1,
        epic_title="v1.4.7 Responsive Toolbar",
        epic_description=(
            "Stop #pdf-toolbar from horizontally scrolling and clipping "
            "right-hand controls in narrow editor splits. At every "
            "realistic VS Code pane width (>= 480 px), every control "
            "stays visible on a single 44 px row.\n\n"
            "User report: in a 1280-wide editor with the explorer open, "
            "the right-hand action group (Outline, Print, Refresh, "
            "Source) is clipped off-screen by an unexpected horizontal "
            "scrollbar inside the toolbar caused by `overflow-x: auto` "
            "on `#pdf-toolbar`. Toolbar is editor chrome, not content; "
            "a horizontal scrollbar in chrome is a UX defect.\n\n"
            "Root cause: fixed-width text buttons (Prev, Next, Outline, "
            "Print, Refresh, Source) + 168 px find input + 96 px-min "
            "zoom select + status span produce a row ~720 px wide "
            "before any compaction. Below that pane width, "
            "`overflow-x: auto` clips the right-hand group instead of "
            "compacting it. The button class is already `icon-button` "
            "even though every button renders text -- the original "
            "intent was clearly icon-first; this version finishes that.\n\n"
            "Non-goals: no popover overflow menu (deferred for the "
            "<480 px case), no two-row stacked layout, no Codicon font "
            "wiring (inline SVG keeps CSP and bundling simple), no new "
            "toolbar features, no outline-sidebar/viewer-container/"
            "PDF.js loader changes, no CSP changes."
        ),
        tasks=[
            Task(
                title="Confirm v1.4.6 shipped + clean tree before toolbar work",
                description=(
                    "Layout work on top of an unverified loader risks "
                    "shipping a release that still cannot render a PDF. "
                    "Confirm v1.4.6 has been verified by VSIX install + "
                    "open and only in-flight responsive-toolbar work is "
                    "dirty in the tree."
                ),
                priority=1,
            ),
            Task(
                title="Add inline SVG icon set to PDF_VIEWER_BODY",
                description=(
                    "In src/pdfPreview.ts, add inline SVG icons for "
                    "chevron-left, chevron-right, zoom-out, zoom-in, "
                    "search, chevron-up, chevron-down, list-tree, "
                    "printer, refresh, file-code at 16x16 with "
                    "`currentColor` strokes so they pick up VS Code "
                    "theme tokens. Either inline per button or use a "
                    "single <svg> <symbol> block with <use> refs. Match "
                    "Codicon stroke weight (1.33 px on a 16x16 grid) so "
                    "the toolbar is not visually inconsistent."
                ),
                priority=2,
            ),
            Task(
                title="Replace toolbar button text with icon + label spans",
                description=(
                    "Update each toolbar button in src/pdfPreview.ts "
                    "from `<button ...>Prev</button>` to "
                    "`<button ...><svg class='icon' ...>...</svg>"
                    "<span class='label'>Prev</span></button>`. Keep "
                    "every existing id, aria-label, and title "
                    "unchanged. The page-number <input>, zoom <select>, "
                    "and find <input> keep their current shape. Hiding "
                    "labels later relies on aria-label/title for screen "
                    "readers and tooltips."
                ),
                priority=2,
            ),
            Task(
                title="Update lib/pdf.css: container query, gaps, overflow, find input flex",
                description=(
                    "In lib/pdf.css:\n"
                    "- `#pdf-toolbar { overflow-x: auto; }` -> "
                    "`overflow: hidden;` and add `container-type: "
                    "inline-size`.\n"
                    "- `#pdf-toolbar { gap: 8px; }` -> `gap: 6px`.\n"
                    "- `.toolbar-group { gap: 5px; }` -> `gap: 4px`.\n"
                    "- Add `.icon { width: 16px; height: 16px; flex: 0 "
                    "0 auto; }`.\n"
                    "- Add `button .label { margin-left: 5px; }` for "
                    "consistent icon+label spacing.\n"
                    "- Add `@container (max-width: 720px) { #pdf-"
                    "toolbar .label { display: none; } }`.\n"
                    "- Scope find input: `min-width: 96px; width: "
                    "auto; flex: 1 1 auto;` under `.toolbar-find` so "
                    "only the find input flexes.\n"
                    "- Verify `select#scaleSelect { min-width: 96px; }` "
                    "still truncates cleanly at the breakpoint."
                ),
                priority=2,
            ),
            Task(
                title="Re-check viewerContainer { top: 44px } still matches toolbar height",
                description=(
                    "44 px row height is preserved at every breakpoint, "
                    "so this is just a regression check after the CSS "
                    "edits. If the toolbar height changes, viewerContainer "
                    "top must be updated to match."
                ),
                priority=3,
            ),
            Task(
                title="Add toolbar contract assertions to src/test/suite/index.ts",
                description=(
                    "Assert that:\n"
                    "- Every original toolbar button id (previous, "
                    "next, zoomOut, zoomIn, findPrevious, findNext, "
                    "outlineToggle, print, reload, openSource) still "
                    "exists in PDF_VIEWER_BODY.\n"
                    "- Every toolbar button contains both an "
                    "<svg class='icon'> and a <span class='label'>...</span> "
                    "with the original visible text.\n"
                    "- Every toolbar button still has a non-empty "
                    "aria-label (accessibility relies on this once "
                    "labels are visually hidden).\n"
                    "- #pdf-toolbar CSS no longer contains "
                    "`overflow-x: auto`.\n"
                    "- #pdf-toolbar CSS contains `container-type: "
                    "inline-size`.\n"
                    "- The `@container (max-width: 720px)` block hides "
                    "`.label`."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Update CHANGELOG.md and README.md for 1.4.7",
                description=(
                    "CHANGELOG: icons replace text on toolbar buttons, "
                    "labels collapse below 720 px container width, and "
                    "the toolbar no longer scrolls horizontally. Update "
                    "README install command to "
                    "`pdf-preview-next-1.4.7.vsix`."
                ),
                priority=3,
            ),
            Task(
                title="Bump package.json to 1.4.7 and refresh package-lock.json",
                description=(
                    "Use `npm version 1.4.7 --no-git-tag-version` so "
                    "package.json and package-lock.json stay in sync. "
                    "Re-check that only intended version fields changed "
                    "via `git diff -- package.json package-lock.json`."
                ),
                priority=3,
            ),
            Task(
                title="Static gate for v1.4.7",
                description=(
                    "format:check, lint, typecheck, test, audit, "
                    "package, package:scan -- pdf-preview-next-1.4.7.vsix."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Manual install-and-open at multiple pane widths for 1.4.7",
                description=(
                    "After the static gate, run the full uninstall + "
                    "rm -rf cached extension + quit + reinstall + "
                    "reload sequence, then open a normal PDF in:\n"
                    "- a wide single-column editor,\n"
                    "- a 50/50 vertical split,\n"
                    "- a narrow split (~480 px pane).\n\n"
                    "At each width, confirm: no horizontal scrollbar "
                    "inside the toolbar, every button reachable, page "
                    "count > 0, scrolling/find/refresh/source-open all "
                    "work, no startup error in the toolbar status."
                ),
                type="test",
                priority=0,
            ),
        ],
    ),
    Version(
        key="v1.5.0",
        epic_priority=2,
        epic_title="v1.5.0 Dark PDF Rendering",
        epic_description=(
            "Add a low-eye-strain PDF viewing mode for dark VS Code "
            "setups while keeping the extension small, predictable, "
            "and safe to release as a minor version.\n\n"
            "User-facing design adds one new value to "
            "`pdf-preview.appearance.theme`:\n"
            "- `auto`: follow VS Code colors for viewer chrome only; "
            "keep PDF pages as-is. (default)\n"
            "- `light`: light viewer chrome; pages as-is.\n"
            "- `dark`: dark viewer chrome; pages as-is.\n"
            "- `dark-pages` (NEW): dark viewer chrome and ask PDF.js "
            "to render page foreground/background with dark-reader "
            "colors via PDF.js `pageColors`.\n"
            "- `inverted`: dark viewer chrome and apply CSS inversion "
            "to the rendered page (kept as fallback for scanned/"
            "image-heavy PDFs).\n\n"
            "Non-goals: no toolbar toggle, no sliders, no custom UI, "
            "no persisted per-document appearance state in 1.5.0; "
            "settings-only keeps the release small. Do NOT copy code "
            "from ArshSB/DarkPDF or diwash007/PDF-Dark-Mode -- both are "
            "GPL-3.0 and their core technique is an overlay/blend hack "
            "this extension can implement independently if needed.\n\n"
            "Default behavior preserved: the appearance.theme default "
            "remains `auto`; existing users see no visual change."
        ),
        tasks=[
            Task(
                title="Phase 0: baseline + worktree safety check for 1.5.0",
                description=(
                    "Run `git status --short`. Tree may already contain "
                    "unrelated edits -- do not revert or stage them "
                    "unless they are part of this release. Confirm "
                    "v1.4.7 (responsive toolbar) is the tagged prior "
                    "release and v1.4.6 shipped before it. Inspect "
                    "diffs of CHANGELOG.md, README.md, package.json, "
                    "package-lock.json, lib/main.mjs, lib/pdf.css, "
                    "src/test/suite/index.ts before editing any of "
                    "them. Confirm the prior version is 1.4.7 via "
                    "`rg -n '\"version\": \"1.4.7\"' package.json "
                    "package-lock.json CHANGELOG.md README.md`."
                ),
                priority=2,
            ),
            Task(
                title="Phase 1: extend appearance.theme contract with dark-pages",
                description=(
                    "In package.json, add `dark-pages` to the "
                    "`pdf-preview.appearance.theme` enum between "
                    "`dark` and `inverted`. Replace the description "
                    "with wording that distinguishes chrome-only dark "
                    "mode, PDF.js recoloring, and full inversion. "
                    "Do not add a second setting unless implementation "
                    "shows the existing setting cannot carry this "
                    "cleanly."
                ),
                priority=2,
            ),
            Task(
                title="Phase 2: wire PDF.js pageColors in lib/main.mjs",
                description=(
                    "Extend THEME_VALUES in lib/main.mjs to include "
                    "`dark-pages`. Add a helper:\n\n"
                    "```js\n"
                    "function pageColorsForTheme(theme) {\n"
                    "  if (theme !== 'dark-pages') return null;\n"
                    "  return { background: '#111111', foreground: "
                    "'#d8dee9' };\n"
                    "}\n"
                    "```\n\n"
                    "Normalize appearance theme before constructing "
                    "PDFViewer and pass `pageColors: "
                    "pageColorsForTheme(appearance.theme)` into "
                    "`new PDFViewer({...})`. Update applyAppearance() "
                    "to reuse the same normalized appearance so "
                    "`theme-dark-pages` is added to document.body. "
                    "Keep `inverted` as CSS-only -- do not combine "
                    "pageColors and CSS inversion. Use literal hex "
                    "colors (canvas rendering wants concrete CSS color "
                    "values, not VS Code CSS variables)."
                ),
                priority=2,
            ),
            Task(
                title="Phase 3: extend lib/pdf.css for theme-dark-pages chrome",
                description=(
                    "Include `theme-dark-pages` wherever the viewer "
                    "should use the dark chrome background:\n\n"
                    "```css\n"
                    "body.theme-dark #viewerContainer,\n"
                    "body.theme-dark-pages #viewerContainer,\n"
                    "body.theme-inverted #viewerContainer {\n"
                    "  background: #1f1f1f;\n"
                    "}\n"
                    "```\n\n"
                    "Do NOT add a filter for theme-dark-pages -- "
                    "PDF.js does the recoloring on canvas. Keep the "
                    "existing `theme-inverted .pdfViewer .page` filter "
                    "unchanged. Only adjust annotation popup/text-"
                    "layer colors after visual QA, and only if "
                    "demonstrably wrong."
                ),
                priority=2,
            ),
            Task(
                title="Phase 4: tests for theme contract and pageColors wiring",
                description=(
                    "Update src/test/suite/index.ts:\n"
                    "- Keep the current default assertion: "
                    "`assert.strictEqual(theme, 'auto');`.\n"
                    "- Add an assertion that the contributed enum "
                    "includes `dark-pages`.\n"
                    "- Read lib/main.mjs from extension.extensionUri "
                    "and assert that it wires `pageColors` and "
                    "recognizes `dark-pages`.\n"
                    "- Do not weaken existing CSP assertions. This "
                    "feature must not require unsafe-eval, "
                    "wasm-unsafe-eval, or new script permissions."
                ),
                type="test",
                priority=2,
            ),
            Task(
                title="Phase 5: docs and release text for dark-pages",
                description=(
                    "Add a `1.5.0 (YYYY/MM/DD)` section to CHANGELOG. "
                    "Mention: dark-pages uses PDF.js page recoloring; "
                    "inverted remains available for scanned/image-"
                    "heavy PDFs; defaults are unchanged. Update README "
                    "with a short example and bump install command "
                    "from latest 1.4.x to 1.5.0."
                ),
                priority=3,
            ),
            Task(
                title="Phase 6: version bump to 1.5.0",
                description=(
                    "Use `npm version 1.5.0 --no-git-tag-version`. "
                    "Re-check `git diff -- package.json package-"
                    "lock.json` to confirm only intended version "
                    "fields changed."
                ),
                priority=3,
            ),
            Task(
                title="Phase 7: build, package, scan, install, and visual QA for 1.5.0",
                description=(
                    "Static checks: typecheck, lint, npm test. Build "
                    "and scan: `npm run package -- --out pdf-preview-"
                    "next-1.5.0.vsix` and `node ./tools/scan_vsix.mjs "
                    "pdf-preview-next-1.5.0.vsix`.\n\n"
                    "Install: full uninstall + rm -rf cached + quit + "
                    "reinstall sequence, then visual QA:\n"
                    "- Open a normal text/vector PDF with `dark-pages`. "
                    "Verify dark page background, readable text, "
                    "acceptable images/figures (not globally "
                    "inverted).\n"
                    "- Verify text selection, search highlights, "
                    "links, outline, refresh, print still work.\n"
                    "- Open a scanned/image-heavy PDF with `dark-"
                    "pages`. If still bright, switch to `inverted` and "
                    "verify the fallback works.\n"
                    "- Switch back to `auto` and verify normal "
                    "rendering."
                ),
                type="test",
                priority=0,
            ),
            Task(
                title="Phase 8: commit hygiene for 1.5.0",
                description=(
                    "Review `git diff` of CHANGELOG, README, "
                    "package.json, package-lock.json, lib/main.mjs, "
                    "lib/pdf.css, src/test/suite/index.ts. Stage named "
                    "files only -- do not stage unrelated plan files "
                    "(.vscodeignore already excludes plan files from "
                    "VSIX packaging). Suggested message: `feat: add "
                    "dark PDF page rendering mode`."
                ),
                priority=3,
            ),
        ],
    ),
    Version(
        key="v1.6.0",
        epic_priority=2,
        epic_title="v1.6.0 Foundation And Settings",
        epic_description=(
            "Make the existing 1.5.x behavior easier to preserve "
            "before adding larger features. Expand the regression "
            "test matrix that v1.4.6 seeded, make appropriate "
            "settings resource-scoped, and add a command to clear "
            "saved view state for the current PDF.\n\n"
            "The comparison with mathematic-inc/vscode-pdf showed that "
            "this extension already has stronger security and reload "
            "behavior, but the test suite is still shallow. Before "
            "adding inter-PDF links, thumbnails, or marketplace work, "
            "we need a broader fixture matrix and contracts around "
            "resource-scoped configuration.\n\n"
            "Non-goals: no inter-document link handling, no "
            "thumbnails, no bundler migration, no Marketplace/Open VSX "
            "publishing.\n\n"
            "Resource-scoped settings (added in this release):\n"
            "- pdf-preview.default.cursor\n"
            "- pdf-preview.default.scale\n"
            "- pdf-preview.default.sidebar\n"
            "- pdf-preview.default.scrollMode\n"
            "- pdf-preview.default.spreadMode\n"
            "- pdf-preview.appearance.theme\n"
            "- pdf-preview.appearance.pageGap"
        ),
        tasks=[
            Task(
                title="Re-read dirty changes before 1.6.0 work",
                description=(
                    "Re-read current dirty changes in CHANGELOG.md, "
                    "package.json, package-lock.json, src/pdfPreview.ts. "
                    "Decide which belong in 1.6.0 and which should be "
                    "split out before starting fixture work."
                ),
                priority=2,
            ),
            Task(
                title="Add fixture PDFs (outline / password / broken)",
                description=(
                    "Add to src/test/fixtures: multi-page PDF with "
                    "outline, password-protected PDF, intentionally "
                    "truncated/broken PDF. Keep them tiny and "
                    "deterministic. The existing one-page fixture from "
                    "v1.4.6 stays."
                ),
                priority=2,
            ),
            Task(
                title="Verify .vscodeignore + scan_vsix.mjs exclude fixtures from VSIX",
                description=(
                    "Before adding fixtures, confirm .vscodeignore and "
                    "tools/scan_vsix.mjs exclude test fixtures, plan "
                    "files, scratch files, source maps, and source TS "
                    "from EVERY intermediate VSIX (not only the later "
                    "bundling release). Fixture PDFs can bloat the "
                    "VSIX if .vscodeignore is incomplete."
                ),
                priority=1,
            ),
            Task(
                title="Extract webview HTML hooks for tests without widening API",
                description=(
                    "Add testability hooks for webview HTML generation "
                    "without exposing them as runtime API surface. "
                    "Tests need to assert HTML contents and CSP; "
                    "production code path must remain unchanged."
                ),
                priority=2,
            ),
            Task(
                title="Add comprehensive contributed-surface tests",
                description=(
                    "src/test/suite/index.ts assertions for:\n"
                    "- extension registration\n"
                    "- all contributed command IDs\n"
                    "- settings defaults\n"
                    "- resource-scoped setting metadata\n"
                    "- retainContextWhenHidden: false\n"
                    "- CSP contains `script-src 'nonce-...'`\n"
                    "- CSP does NOT contain `script-src 'unsafe-"
                    "inline'`\n"
                    "- CSP keeps `style-src 'unsafe-inline'` only for "
                    "PDF.js runtime geometry styles, with scripts "
                    "still nonce-bound\n"
                    "- webview resource roots stay scoped"
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Switch runtime config reads to resource-scoped getConfiguration",
                description=(
                    "Change PDF-specific runtime reads to use "
                    "`vscode.workspace.getConfiguration('pdf-preview', "
                    "resource)` so resource/workspace-folder overrides "
                    "are honored. The opened PDF becomes the "
                    "configuration scope."
                ),
                priority=2,
            ),
            Task(
                title="Add pdf-preview.resetViewState command",
                description=(
                    "Register `pdf-preview.resetViewState` (title: "
                    "`PDF Preview Next: Reset View State`). Default "
                    "should be command-palette-only -- decide whether "
                    "to add a toolbar/UI surface only AFTER the "
                    "command lands. Implement provider/preview method "
                    "to delete the current PDF's view-state key. The "
                    "command must NOT erase all PDFs' state -- per-"
                    "document only."
                ),
                priority=2,
            ),
            Task(
                title="Show status message after resetViewState completes",
                description=(
                    "After resetViewState runs, show a status message "
                    "so the user knows the command did something. "
                    "Without feedback, users will repeatedly invoke "
                    "the command thinking it failed."
                ),
                priority=3,
            ),
            Task(
                title="Update README and CHANGELOG for 1.6.0",
                description=(
                    "README: settings/commands list (incl. new "
                    "resetViewState command and resource-scope notes). "
                    "CHANGELOG: 1.6.0 entry covering fixture matrix, "
                    "resource-scoped settings, resetViewState command."
                ),
                priority=3,
            ),
            Task(
                title="Static gate for 1.6.0",
                description=(
                    "format:check, lint, typecheck, test, audit, "
                    "package, package:scan -- pdf-preview-next-1.6.0.vsix."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Manual install-and-open across fixture matrix for 1.6.0",
                description=(
                    "Full uninstall + rm -rf cached + quit + reinstall "
                    "sequence, then open each fixture and confirm:\n"
                    "- normal renders pages,\n"
                    "- outline toggle becomes enabled when an outline "
                    "exists,\n"
                    "- password fixture prompts and accepts the "
                    "correct password,\n"
                    "- broken fixture surfaces a load error in the "
                    "banner without crashing.\n\n"
                    "Also confirm resetViewState makes the next open "
                    "use current defaults again."
                ),
                type="test",
                priority=0,
            ),
        ],
    ),
    Version(
        key="v1.7.0",
        epic_priority=2,
        epic_title="v1.7.0 Inter-PDF Links",
        epic_description=(
            "Open safe links from one local PDF to another inside VS "
            "Code, preserving PDF fragments such as `#page=3`, without "
            "patching vendored PDF.js.\n\n"
            "This is the strongest feature idea to borrow from "
            "mathematic-inc/vscode-pdf. Their implementation patches "
            "the upstream PDF.js link service and has an open "
            "regression around inter-document links. We implement the "
            "behavior in our own viewer shell instead, where we "
            "control validation and tests.\n\n"
            "Critical security note: do NOT trust `vscode-resource://` "
            "or `vscode-webview://*.vscode-cdn.net` URLs as "
            "filesystem paths. Webview transport URLs must never be "
            "reverse-engineered into `file:` paths in the host "
            "extension. All target paths must be resolved against "
            "`this.resource` directory in the host, with a `file:` "
            "+ `.pdf` requirement.\n\n"
            "Non-goals: no PDF.js vendored source patch, no broad "
            "public API for other extensions, no arbitrary file "
            "opener for non-PDF links, no network fetching beyond "
            "what PDF.js already does for the opened local PDF, no "
            "transparent re-resolution of webview transport URLs."
        ),
        tasks=[
            Task(
                title="Add inter-PDF link regression fixtures",
                description=(
                    "src/test/fixtures/link-source.pdf with a relative "
                    "link to another PDF; src/test/fixtures/link-"
                    "target.pdf with at least two pages or a fragment "
                    "target so `#page=N` can be exercised."
                ),
                priority=2,
            ),
            Task(
                title="Add open-pdf-link message validation contract",
                description=(
                    "Define and validate `{ type: 'open-pdf-link', "
                    "href: string }` in the typed webview message "
                    "schema. Do not trust path text supplied by the "
                    "webview without validation. Reject malformed "
                    "messages without crashing."
                ),
                priority=1,
            ),
            Task(
                title="Implement host-side openPdfLinkForActivePreview",
                description=(
                    "In src/extension.ts or src/pdfPreview.ts:\n"
                    "- Resolve relative hrefs against `this.resource` "
                    "directory.\n"
                    "- Require a local `file:` target.\n"
                    "- Require `.pdf` extension.\n"
                    "- Keep the URL fragment (e.g. `#page=3`).\n"
                    "- Call `vscode.openWith(uri, "
                    "PdfCustomProvider.viewType)`.\n\n"
                    "Treat `pdf-preview-next.preview` as the custom "
                    "editor view type, not as a command ID."
                ),
                priority=1,
            ),
            Task(
                title="Add webview-side link interception in lib/main.mjs",
                description=(
                    "Add a small custom link service wrapper or event "
                    "hook around PDFLinkService. Detect link URLs that "
                    "resolve under the current document directory and "
                    "end in .pdf. Post the validated `open-pdf-link` "
                    "message to the host. External http(s) links keep "
                    "PDF.js default link behavior. Prefer a narrow, "
                    "testable interception point over broad monkey-"
                    "patching of PDF.js internals."
                ),
                priority=1,
            ),
            Task(
                title="Preserve view state in source preview when opening a link target",
                description=(
                    "When a link triggers opening a target PDF, the "
                    "source preview's current page/view state must be "
                    "preserved so the user can return to it via the "
                    "existing view-state restore path."
                ),
                priority=2,
            ),
            Task(
                title="Add tests for inter-PDF link message validation and URI normalization",
                description=(
                    "Cover: malformed messages rejected, relative path "
                    "resolution against this.resource, .pdf extension "
                    "requirement, fragment preservation, http(s) links "
                    "NOT silently converted into local opens, non-PDF "
                    "local links not opened by this feature."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Update README and CHANGELOG for 1.7.0",
                description=(
                    "Document the inter-PDF link feature, its "
                    "constraints (local file: only, .pdf only, "
                    "fragment preserved), and the fact that no CSP "
                    "relaxation was required."
                ),
                priority=3,
            ),
            Task(
                title="Static gate for 1.7.0",
                description=(
                    "format:check, lint, typecheck, test, package, "
                    "package:scan -- pdf-preview-next-1.7.0.vsix."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Manual install-and-open inter-PDF link verification",
                description=(
                    "Full uninstall + rm -rf cached + quit + reinstall "
                    "sequence. Open the source link fixture and click "
                    "the relative PDF link; confirm:\n"
                    "- Target opens with this viewer (not the OS "
                    "default).\n"
                    "- Any `#page=N` fragment is honored.\n"
                    "- An external https:// link from the same fixture "
                    "still opens through PDF.js default behavior, NOT "
                    "the inter-PDF handler."
                ),
                type="test",
                priority=0,
            ),
        ],
    ),
    Version(
        key="v1.8.0",
        epic_priority=2,
        epic_title="v1.8.0 Focus Preservation",
        epic_description=(
            "Stop file-watcher reload from stealing focus from the "
            "source editor when the PDF preview is open beside another "
            "editor group. This is the most common complaint that does "
            "not require new UI.\n\n"
            "Thumbnail navigation has been moved to a dedicated v1.9.0 "
            "plan to keep this release small and reviewable.\n\n"
            "Design: detect file-watcher-driven reloads vs explicit "
            "user reloads. Only the user-driven path may take focus. "
            "Record document.activeElement before reload starts and "
            "restore it afterwards if the active element existed in "
            "the new DOM. Avoid synchronous focus calls during PDF.js "
            "viewer setup.\n\n"
            "Non-goals: no thumbnail panel (-> v1.9.0), no annotations, "
            "no PDF editing, no new sidebar panel selection setting, "
            "no telemetry, no outline-sidebar redesign beyond the "
            "existing toggle."
        ),
        tasks=[
            Task(
                title="Reproduce focus-stealing behavior",
                description=(
                    "Open the PDF preview in column 2. Edit a TeX/"
                    "Typst source in column 1. Trigger a rebuild that "
                    "updates the PDF. Note whether focus moves to the "
                    "PDF preview. This must be reproducible before any "
                    "fix lands."
                ),
                priority=1,
            ),
            Task(
                title="Capture wasViewerFocused before each reload pathway",
                description=(
                    "Add a `wasViewerFocused` boolean captured before "
                    "each reload pathway. Used by the post-reload "
                    "branch to decide whether to refocus."
                ),
                priority=2,
            ),
            Task(
                title="Branch post-reload focus call by reload origin",
                description=(
                    "File-watcher reloads must NOT move focus, while "
                    "user-driven Refresh button / Cmd+R reloads still "
                    "do. Guard with `if (typeof element.focus === "
                    "'function')` and never assume exact event "
                    "ordering. Restore activeElement by id when "
                    "possible -- restoring blindly can move focus to a "
                    "stale element after re-render."
                ),
                priority=1,
            ),
            Task(
                title="Add focus-preservation runtime test (if feasible)",
                description=(
                    "If the test environment supports it: open the "
                    "preview, focus another editor, simulate a file "
                    "change, assert the preview did not steal focus. "
                    "If not feasible at runtime, fall back to "
                    "documenting the manual matrix in the install-and-"
                    "open gate."
                ),
                type="test",
                priority=2,
            ),
            Task(
                title="Update README and CHANGELOG for 1.8.0",
                description=(
                    "Document the focus-preservation behavior and the "
                    "user-vs-watcher distinction. Note that "
                    "user-initiated Refresh still focuses the viewer."
                ),
                priority=3,
            ),
            Task(
                title="Static gate for 1.8.0",
                description=(
                    "format:check, lint, typecheck, test, package, "
                    "package:scan -- pdf-preview-next-1.8.0.vsix."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Manual focus-preservation matrix verification",
                description=(
                    "Full uninstall + rm -rf cached + quit + reinstall "
                    "sequence. Manually verify:\n"
                    "- File-watcher reload does not steal focus from "
                    "another editor group.\n"
                    "- Toolbar Refresh button focuses the viewer when "
                    "invoked from inside the viewer.\n"
                    "- Cmd+R focuses the viewer when invoked from "
                    "inside the viewer.\n"
                    "- View-state restore still preserves page, scale, "
                    "scroll, and outline-sidebar visibility."
                ),
                type="test",
                priority=0,
            ),
        ],
    ),
    Version(
        key="v1.9.0",
        epic_priority=3,
        epic_title="v1.9.0 Thumbnail Navigation",
        epic_description=(
            "Add a thumbnail navigation panel to the existing sidebar "
            "without importing the full upstream PDF.js viewer.html "
            "shell, and without making the viewer slower or heavier on "
            "large PDFs.\n\n"
            "Design: thumbnails on PDF.js primitives (PDFPageView "
            "thumbnail mode or a custom canvas renderer) only. Extend "
            "the existing sidebar to show either outline or "
            "thumbnails, not both at once for now. Use "
            "IntersectionObserver / scroll-driven rendering so off-"
            "screen thumbnails are not painted. Cap canvas pool size "
            "so a large PDF cannot allocate hundreds of large bitmaps. "
            "Click jumps to the corresponding page and persists scroll "
            "position via the existing view-state mechanism.\n\n"
            "New setting: `pdf-preview.default.sidebarPanel` with "
            "values `outline` (default) | `thumbnails`. The existing "
            "`pdf-preview.default.sidebar` boolean keeps its meaning "
            "(open by default vs not).\n\n"
            "Non-goals: no persistent annotations, no PDF editing, no "
            "full PDF.js viewer shell, no attachments/layers UI, no "
            "telemetry, no replacement of `default.sidebar` boolean."
        ),
        tasks=[
            Task(
                title="Prototype thumbnails locally and measure 200-page memory",
                description=(
                    "Prototype thumbnails on a multi-page fixture; "
                    "measure peak memory on a 200-page PDF before "
                    "committing to the design. If bounded rendering "
                    "fails QA, defer thumbnails rather than shipping a "
                    "regression."
                ),
                priority=1,
            ),
            Task(
                title="Add thumbnail panel HTML/CSS",
                description=(
                    "If memory results are acceptable, add the "
                    "thumbnail panel HTML and CSS in lib/main.mjs and "
                    "lib/pdf.css. Avoid nested cards or decorative UI "
                    "-- this is a work tool. Keep toolbar control "
                    "widths stable so PDF reloads do not shift layout."
                ),
                priority=2,
            ),
            Task(
                title="Add pdf-preview.default.sidebarPanel setting",
                description=(
                    "Add the `pdf-preview.default.sidebarPanel` "
                    "setting to package.json with enum [outline, "
                    "thumbnails], default `outline`. Document that "
                    "`pdf-preview.default.sidebar` (boolean) still "
                    "controls open-by-default, while sidebarPanel "
                    "controls which panel shows."
                ),
                priority=2,
            ),
            Task(
                title="Extend view-state schema with active panel field",
                description=(
                    "Persist the active sidebar panel as part of view-"
                    "state restore. Maintain backwards compatibility "
                    "for previously stored states without the field "
                    "(default to `outline`)."
                ),
                priority=2,
            ),
            Task(
                title="Add keyboard navigation for thumbnails",
                description=(
                    "Up/Down moves between thumbnails, Enter jumps to "
                    "the selected page. Make sure these don't conflict "
                    "with the existing find-bar/toolbar shortcuts."
                ),
                priority=3,
            ),
            Task(
                title="Add multi-page navigation runtime test (if feasible)",
                description=(
                    "If feasible at runtime, add a fixture-based test "
                    "that verifies multi-page navigation via "
                    "thumbnails. Otherwise document the manual matrix."
                ),
                type="test",
                priority=2,
            ),
            Task(
                title="Update README and CHANGELOG for 1.9.0",
                description=(
                    "Document thumbnails behavior, new sidebarPanel "
                    "setting, sidebar precedence rules, and view-state "
                    "extension."
                ),
                priority=3,
            ),
            Task(
                title="Static gate for 1.9.0",
                description=(
                    "format:check, lint, typecheck, test, package, "
                    "package:scan -- pdf-preview-next-1.9.0.vsix."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Manual install-and-open thumbnail verification (incl. 100-page fixture)",
                description=(
                    "Full uninstall + rm -rf cached + quit + reinstall "
                    "sequence. Open the multi-page outline fixture and "
                    "a large fixture (~100 pages). Confirm:\n"
                    "- thumbnail panel renders,\n"
                    "- click navigation works,\n"
                    "- memory does not balloon (no thumbnail-rendering "
                    "pathway holds more than a small bounded number "
                    "of canvases at once),\n"
                    "- VSIX size stays inside the current budget,\n"
                    "- view-state restore preserves page, scale, "
                    "scroll, sidebar visibility, and the active panel."
                ),
                type="test",
                priority=0,
            ),
        ],
    ),
    Version(
        key="v1.10.0",
        epic_priority=3,
        epic_title="v1.10.0 Build And Release Automation",
        epic_description=(
            "Improve build output and release automation without "
            "changing viewer behavior.\n\n"
            "Bundling changes the runtime entrypoint shape and should "
            "not collide with viewer feature work in the same release "
            "-- that is why bundling is gated behind v1.9.0 (or "
            "explicit deferral of thumbnails).\n\n"
            "Design decision: choose one bundler (esbuild vs tsup). "
            "Default recommendation is esbuild because:\n"
            "- already listed in the existing modernization plan,\n"
            "- simple and fast,\n"
            "- minimal dependency surface.\n"
            "tsup wraps esbuild and adds another layer; "
            "mathematic-inc/vscode-pdf uses tsup but we do not need "
            "that extra abstraction.\n\n"
            "Non-goals: no viewer feature work, no registry "
            "publishing (-> v2.0.0), no migration from npm to pnpm in "
            "this version."
        ),
        tasks=[
            Task(
                title="Confirm current VSIX contents and size baseline",
                description=(
                    "Capture the pre-bundling VSIX size and contents "
                    "as the baseline. Track this in CHANGELOG so "
                    "future bundle regressions are visible."
                ),
                priority=2,
            ),
            Task(
                title="Add esbuild dependency and config",
                description=(
                    "Add esbuild and create esbuild.config.mjs. "
                    "Confirm `external: ['vscode']` so vscode is not "
                    "bundled into the host output. Bundled output "
                    "target is the extension host entrypoint; webview "
                    "runtime stays separate unless bundling it clearly "
                    "helps."
                ),
                priority=1,
            ),
            Task(
                title="Switch package.json:main to bundled output",
                description=(
                    "Change `package.json:main` from `./out/src/"
                    "extension` to bundled output (e.g. "
                    "`./dist/extension.js`)."
                ),
                priority=1,
            ),
            Task(
                title="Update npm scripts: compile, typecheck, bundle, watch, vscode:prepublish",
                description=(
                    "Update the script set so that:\n"
                    "- compile remains a TS pass for type checking,\n"
                    "- bundle runs esbuild,\n"
                    "- watch covers both,\n"
                    "- vscode:prepublish triggers bundle, not bare "
                    "compile,\n"
                    "- typecheck stays separate from bundle."
                ),
                priority=2,
            ),
            Task(
                title="Update .vscodeignore for bundled output",
                description=(
                    "Source and build internals should be excluded; "
                    "the bundled entrypoint and runtime assets remain "
                    "included. Verify no `src/`, no `out/src/test`, "
                    "no source maps unless intentionally retained, and "
                    "lib/ runtime assets stay shipped."
                ),
                priority=1,
            ),
            Task(
                title="Add manual approval guard / release environment for v* tags",
                description=(
                    "Ensure `v*` tags cannot publish to Marketplace/"
                    "Open VSX just because secrets are configured. Use "
                    "GitHub environments or manual approval gates."
                ),
                priority=1,
            ),
            Task(
                title="Pin GitHub Actions by SHA",
                description=(
                    "Replace mutable @vN refs in workflows with full "
                    "SHA pins. Add a comment with the upstream version "
                    "to make future bumps traceable."
                ),
                priority=2,
            ),
            Task(
                title="Add workflow concurrency groups",
                description=(
                    "Prevent overlapping CI/release runs on the same "
                    "branch via `concurrency:` groups in the workflow "
                    "files."
                ),
                priority=2,
            ),
            Task(
                title="Ensure CI runs tests against bundled output",
                description=(
                    "CI must exercise the bundled entrypoint, not "
                    "stale `out/` code. A passing bundle build that "
                    "is silently re-tested against pre-bundle output "
                    "is a footgun."
                ),
                priority=1,
            ),
            Task(
                title="Strengthen scan_vsix.mjs for maps/tests/plans/scratch/source TS",
                description=(
                    "Verify package scan catches source maps, test "
                    "fixtures, plan files, scratch files, and source "
                    "TS. .vscodeignore mistakes can omit required "
                    "PDF.js runtime files; the scanner is the safety "
                    "net."
                ),
                priority=1,
            ),
            Task(
                title="Update README and CHANGELOG for 1.10.0",
                description=(
                    "Document the bundling change, the size baseline, "
                    "the SHA-pinned actions, and the manual approval "
                    "guard for releases."
                ),
                priority=3,
            ),
            Task(
                title="Static gate for 1.10.0 (incl. bundle hygiene)",
                description=(
                    "npm ci, format:check, lint, typecheck, test, "
                    "audit, package, package:scan -- pdf-preview-next-"
                    "1.10.0.vsix.\n\n"
                    "Bundle hygiene checks:\n"
                    "- esbuild config has external: ['vscode'].\n"
                    "- dist/extension.js does NOT contain @vscode/vsce "
                    "types or runtime references.\n"
                    "- bundled output stays inside the agreed size "
                    "budget.\n\n"
                    "VSIX inspection:\n"
                    "- no src/,\n"
                    "- no out/src/test,\n"
                    "- no source maps unless intentional,\n"
                    "- includes bundled extension entrypoint,\n"
                    "- includes lib/ runtime assets."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Manual install-and-open verification for bundled 1.10.0",
                description=(
                    "Full uninstall + rm -rf cached + quit + reinstall "
                    "sequence. Open at least one fixture PDF and "
                    "confirm extension activation runs from the "
                    "bundled entrypoint without behavior regressions."
                ),
                type="test",
                priority=0,
            ),
        ],
    ),
    Version(
        key="v2.0.0",
        epic_priority=3,
        epic_title="v2.0.0 Public Release",
        epic_description=(
            "Make the extension ready for users beyond the local "
            "workflow: clear public docs, current security posture, "
            "reproducible packages, and Marketplace/Open VSX "
            "publishing.\n\n"
            "Public release work depends on a bundled, tested "
            "extension entrypoint and on the guarded release workflow "
            "being in place (-> v1.10.0).\n\n"
            "Public positioning (use restrained claims):\n"
            "- Lightweight PDF preview for VS Code.\n"
            "- Modern PDF.js runtime.\n"
            "- Reliable refresh for TeX/Typst/build workflows.\n"
            "- Secure webview defaults.\n"
            "- Practical controls: outline, find, refresh, print, "
            "source, keyboard navigation.\n\n"
            "Avoid overclaiming: do NOT claim complete PDF editor "
            "functionality, do NOT claim fastest without benchmark "
            "evidence, do NOT claim full parity with Firefox PDF.js "
            "viewer.\n\n"
            "Non-goals: no new viewer features, no telemetry, no "
            "broad API, no hidden dependency on another PDF "
            "extension."
        ),
        tasks=[
            Task(
                title="Re-check version and changelog consistency",
                description=(
                    "Cross-check that package.json, package-lock.json, "
                    "CHANGELOG, README, and any tagged release "
                    "metadata all agree on `2.0.0`."
                ),
                priority=2,
            ),
            Task(
                title="Run a fresh package scan for 2.0.0",
                description=(
                    "Run `npm run package:scan -- pdf-preview-next-"
                    "2.0.0.vsix`. No plan files, tests, source maps, "
                    "scratch directories, or runtime-local state may "
                    "be in the release package."
                ),
                priority=1,
            ),
            Task(
                title="Local install of 2.0.0 VSIX",
                description=(
                    "`code --install-extension pdf-preview-next-"
                    "2.0.0.vsix --force` after the full uninstall + "
                    "rm -rf cached extension + quit + relaunch "
                    "sequence."
                ),
                priority=1,
            ),
            Task(
                title="Walk through representative PDF set for 2.0.0",
                description=(
                    "Open: normal PDF, outline PDF, password PDF, "
                    "PDF regenerated by a build process, inter-PDF "
                    "link fixture (if v1.7.0 landed). Confirm "
                    "activation works on a clean VS Code install at "
                    "the declared engines.vscode minimum, not just on "
                    "the developer's local install."
                ),
                type="test",
                priority=0,
            ),
            Task(
                title="Capture current-UI screenshots and short GIF",
                description=(
                    "Capture release screenshots / short GIF from the "
                    "current UI for the README and Marketplace "
                    "listing. Include normal, dark-pages, outline, "
                    "and (if landed) thumbnails."
                ),
                priority=2,
            ),
            Task(
                title="Refresh README for public users",
                description=(
                    "README must cover:\n"
                    "- install from VSIX,\n"
                    "- install from Marketplace/Open VSX once "
                    "published,\n"
                    "- settings table,\n"
                    "- commands table,\n"
                    "- security model,\n"
                    "- build from source,\n"
                    "- known non-goals."
                ),
                priority=2,
            ),
            Task(
                title="Update SECURITY audit history if a new audit ran",
                description=(
                    "If a SECURITY audit was performed for the public "
                    "release, append the audit entry to SECURITY.md. "
                    "Do not silently rewrite history."
                ),
                priority=2,
            ),
            Task(
                title="Confirm package metadata for the registries",
                description=(
                    "Verify display name, description, keywords, "
                    "categories, icon, repository URL, bugs URL, and "
                    "icon.png in package.json. Marketplace search/"
                    "discoverability depends heavily on these."
                ),
                priority=1,
            ),
            Task(
                title="Verify engines.vscode matches the lowest VS Code version actually tested",
                description=(
                    "If only newer VS Code releases have been tested, "
                    "RAISE the engines.vscode floor rather than "
                    "claiming compatibility that has not been verified."
                ),
                priority=1,
            ),
            Task(
                title="Dry-run the guarded release workflow",
                description=(
                    "Run the release workflow in dry-run / staging "
                    "mode. Confirm Marketplace and Open VSX publishing "
                    "secrets are configured, OR that the workflow "
                    "clearly skips publishing when they are not."
                ),
                priority=1,
            ),
            Task(
                title="Ask for explicit approval before publishing",
                description=(
                    "Publishing is irreversible enough that version "
                    "metadata should be checked twice. Do not "
                    "auto-publish on tag push -- require an explicit "
                    "human approval step."
                ),
                priority=0,
            ),
            Task(
                title="Static gate for 2.0.0",
                description=(
                    "npm ci, format:check, lint, typecheck, test, "
                    "audit, package, package:scan -- pdf-preview-next-"
                    "2.0.0.vsix."
                ),
                type="test",
                priority=1,
            ),
            Task(
                title="Manual install-and-open verification for 2.0.0",
                description=(
                    "Full uninstall + rm -rf cached + quit + reinstall "
                    "sequence on the developer machine. Then walk "
                    "through the representative PDF set above. Confirm "
                    "no startup error appears in the toolbar status."
                ),
                type="test",
                priority=0,
            ),
        ],
    ),
]


# ---------------------------------------------------------------------------
# Migration driver
# ---------------------------------------------------------------------------


def br(*args: str, capture: bool = True) -> str:
    """Run a `br` command and return stdout (or raise on non-zero exit)."""
    cmd = ["br", *args]
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        capture_output=capture,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        sys.stderr.write(f"br {' '.join(args)} failed (exit {result.returncode})\n")
        if result.stdout:
            sys.stderr.write(f"stdout:\n{result.stdout}\n")
        if result.stderr:
            sys.stderr.write(f"stderr:\n{result.stderr}\n")
        sys.exit(1)
    return result.stdout.strip()


_GATE_TITLE_PREFIXES = (
    "Static gate",
    "Manual ",
    "Walk through",
    "Phase 7:",
)


def map_type(custom_type: str, title: str) -> str:
    """Translate semantic types to br's accepted set.

    br accepts: task, bug, feature, epic, chore.
    We use `test` in the source spec for readability and split it into:
    - `chore` for verification gates (static gate runs, manual install-and-
      open, fixture walk-throughs)
    - `task` for everything else that writes test code.
    """
    if custom_type != "test":
        return custom_type
    if title.startswith(_GATE_TITLE_PREFIXES):
        return "chore"
    return "task"


def create_issue(
    title: str,
    description: str,
    issue_type: str,
    priority: int,
    parent: str | None = None,
    labels: list[str] | None = None,
) -> str:
    """Create an issue and return its ID."""
    args = [
        "create",
        title,
        "-t",
        map_type(issue_type, title),
        "-p",
        str(priority),
        "-d",
        description,
        "--silent",
    ]
    if parent:
        args.extend(["--parent", parent])
    if labels:
        args.extend(["-l", ",".join(labels)])
    return br(*args)


def add_dep(child: str, parent: str) -> None:
    """Mark `child` as depending on `parent` (child blocked by parent)."""
    br("dep", "add", child, parent)


def main() -> None:
    if shutil.which("br") is None:
        sys.exit("br not on PATH; install beads_rust before running this")

    if not os.path.isdir(os.path.join(REPO_ROOT, ".beads")):
        sys.exit(".beads/ workspace missing; run `br init` first")

    # Safety net: if any bead with `migrated-from-plan` label exists, abort.
    existing = json.loads(
        br("list", "--json")
        or "[]"
    )
    if any(
        "migrated-from-plan" in (issue.get("labels") or [])
        for issue in existing
    ):
        sys.exit(
            "beads with `migrated-from-plan` label already exist -- "
            "delete them first or back up `.beads/` before re-running"
        )

    label_common = ["migrated-from-plan"]

    print("Creating roadmap epic...")
    roadmap_id = create_issue(
        title=ROADMAP.epic_title,
        description=ROADMAP.epic_description,
        issue_type="epic",
        priority=ROADMAP.epic_priority,
        labels=label_common,
    )
    print(f"  -> {roadmap_id}")

    prior_epic_id: str | None = None

    for version in VERSIONS:
        # Label values can only contain alphanumeric, hyphen, underscore, colon.
        # Replace `.` (e.g. `v1.4.6`) with `-` for label use.
        version_label = f"version:{version.key.replace('.', '-')}"
        labels = [*label_common, version_label]

        print(f"Creating {version.key} epic...")
        epic_id = create_issue(
            title=version.epic_title,
            description=version.epic_description,
            issue_type="epic",
            priority=version.epic_priority,
            parent=roadmap_id,
            labels=labels,
        )
        print(f"  -> {epic_id}")

        prior_task_id: str | None = None
        first_task_id: str | None = None

        for task in version.tasks:
            task_id = create_issue(
                title=task.title,
                description=task.description,
                issue_type=task.type,
                priority=task.priority,
                parent=epic_id,
                labels=labels,
            )
            if first_task_id is None:
                first_task_id = task_id
            if prior_task_id:
                # task_id depends on prior_task_id (sequential chain inside version)
                add_dep(task_id, prior_task_id)
            prior_task_id = task_id

        # Cross-version chain: this version's first task waits on prior
        # version's epic. (Closing the prior epic must be a deliberate ack
        # that the version actually shipped, not just a side effect of the
        # last task closing.)
        if prior_epic_id and first_task_id:
            add_dep(first_task_id, prior_epic_id)

        # NOTE: Do NOT add `epic depends on last_task` -- `--parent` already
        # creates a `parent-child` link, and beads tracks epic close-
        # eligibility through that link without it counting as a blocker
        # in `br ready`. Adding the reverse dep would create a cycle with
        # the parent-child link. Use `br epic close-eligible` to surface
        # epics whose children are all closed.

        # Mark v1.4.6 epic in_progress (per user direction).
        if version.epic_initial_status:
            br("update", epic_id, "--status", version.epic_initial_status)

        prior_epic_id = epic_id
        print(f"  {version.key}: {len(version.tasks)} tasks created")

    print("\nValidating dependency graph...")
    cycles_raw = br("dep", "cycles", "--json") or "{}"
    parsed = json.loads(cycles_raw)
    cycles = parsed.get("cycles") if isinstance(parsed, dict) else parsed
    if cycles:
        sys.stderr.write(
            f"FAIL: dependency cycles detected:\n{json.dumps(parsed, indent=2)}\n"
        )
        sys.exit(1)
    print("  no cycles")

    counts = br("count", "--json")
    print(f"\nFinal counts: {counts}")
    print("\nMigration complete. Next: `br sync --flush-only` and review .beads/.")


if __name__ == "__main__":
    main()
