# PDF Preview Next Version Roadmap

Goal: turn the comparison with `mathematic-inc/vscode-pdf` into small,
release-sized implementation slices. Each version is coded, tested, packaged,
**locally installed in VS Code, and visually verified** before starting the
next one.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Current Baseline

- Active plan: `plan_v1.4.6_loader_correctness.md`. The prior `1.4.x`
  releases all shipped a blank-PDF regression that static checks did not
  catch. `v1.4.6` fixes the actual root cause (top-level `await` → late
  `DOMContentLoaded` listener) and lands the first runtime render-regression
  test.
- Do not start any later version until `v1.4.6` is shipped *and* manually
  verified by installing the produced VSIX and opening a real PDF.
- Baseline strengths to preserve:
  - PDF.js `5.6.205`
  - nonce-based webview scripts
  - scoped `localResourceRoots`
  - typed and validated webview messages
  - eval/WASM disabled in PDF.js loading
  - reliable refresh for temporary delete/recreate workflows
  - per-PDF view-state restore

## Version Files

1. [v1.4.6 Loader Correctness](plan_v1.4.6_loader_correctness.md)
   - Fix the `DOMContentLoaded` race that made every `1.4.x` ship a blank
     viewer.
   - Add an always-visible error banner that is not hidden by toolbar
     overflow.
   - Add the first runtime render regression test (page count > 0).

2. [v1.5.0 Dark PDF Rendering](plan_v1.5.0_dark_pages.md)
   - Add `dark-pages` backed by PDF.js `pageColors`.
   - Keep `inverted` as the fallback for scanned or image-heavy PDFs.
   - Preserve `auto` as the unchanged default.

3. [v1.6.0 Foundation And Settings](plan_v1.6.0_foundation_settings.md)
   - Expand fixture/test matrix: outline, password, broken, large.
   - Make settings resource-scoped where appropriate.
   - Add a reset-view-state command so defaults can be reapplied cleanly.

4. [v1.7.0 Inter-PDF Links](plan_v1.7.0_inter_pdf_links.md)
   - Add safe internal handling for links from one local PDF to another.
   - Preserve fragments such as `#page=3`.
   - Avoid patching vendored PDF.js.

5. [v1.8.0 Focus Preservation](plan_v1.8.0_viewer_ux_parity.md)
   - Stop file-watcher reload from stealing focus from the source editor.
   - Toolbar polish only where it does not destabilize layout.
   - Thumbnails are explicitly out of scope for this release.

6. [v1.9.0 Thumbnail Navigation](plan_v1.9.0_thumbnails.md)
   - Add a thumbnail panel built on PDF.js primitives without importing the
     full upstream viewer shell.
   - Bound memory and rendering cost.
   - Extend sidebar persistence to the active panel.

7. [v1.10.0 Build And Release Automation](plan_v1.10.0_build_release.md)
   - Bundle the extension entrypoint with esbuild.
   - Pin GitHub Actions by SHA.
   - Strengthen guarded release and package scanning workflows.

8. [v2.0.0 Public Release](plan_v2.0.0_public_release.md)
   - Finish Marketplace/Open VSX readiness.
   - Refresh public docs, screenshots, and security notes.
   - Publish only after local VSIX verification, registry token checks, and
     `engines.vscode` matching the lowest version actually tested.

## Execution Rules

- Work one version file at a time.
- Before coding a version, update its status section from `[ ]` to `[~]`.
- Keep unrelated changes out of the version branch/commit.
- Add or update tests before behavior changes when the version contains a bug
  fix or externally visible behavior.
- Verify each version with the static gate:
  - `npm run format:check`
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
  - `npm audit --omit=dev --audit-level=high`
  - `npm run package`
  - `npm run package:scan -- <built-vsix>`
- And then with the **mandatory install-and-open gate**:
  - `code --uninstall-extension ricardofrantz.pdf-preview-next`
  - `rm -rf ~/.vscode/extensions/ricardofrantz.pdf-preview-next-*`
    (older cached versions otherwise mask new builds)
  - Fully quit VS Code (Cmd+Q on macOS), then relaunch.
  - `code --install-extension <built-vsix> --force`
  - Open at least one fixture PDF and confirm:
    - viewer shows a non-zero page count
    - scrolling, find, refresh, and source open work
    - any error banner is empty on success
- Do not weaken CSP, message validation, resource roots, or PDF.js execution
  restrictions to gain feature parity.
- Do not ship a version whose only verification is the static gate. Every
  release in `1.4.0`–`1.4.5` passed static checks while the viewer was blank.

## Deferred Ideas

- Persistent PDF editing and annotations.
- Delete-pages support.
- Public cross-extension PDF.js API.
- Full upstream PDF.js viewer shell import.
- Telemetry.
