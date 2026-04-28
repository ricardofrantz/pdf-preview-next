# v1.10.0 Plan — Build And Release Automation

Status: `[ ]` todo

## Prerequisite

`v1.9.0` (thumbnails) must be shipped and verified, or explicitly deferred,
before bundling work. Bundling changes the runtime entrypoint shape and
should not collide with viewer feature work in the same release.

## Goal

Improve build output and release automation without changing viewer behavior.

## Scope

- Bundle the extension host entrypoint.
- Keep the webview runtime separate unless bundling it clearly helps.
- Pin GitHub Actions by SHA.
- Add release automation guardrails before any registry publish path can run.
- Keep package scanning mandatory.

## Non-Goals

- No viewer feature work.
- No registry publishing unless `v2.0.0` readiness is complete and explicit
  approval is given.
- No migration from npm to pnpm in this version.

## Likely Files

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `esbuild.config.mjs` or `tsup.config.ts`
- `.vscodeignore`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `tools/scan_vsix.mjs`
- `README.md`
- `CHANGELOG.md`

## Design Decision To Make First

Choose one bundler:

1. `esbuild`
   - already listed in the existing modernization plan
   - simple and fast
   - minimal dependency surface

2. `tsup`
   - used by `mathematic-inc/vscode-pdf`
   - convenient TypeScript config and CJS output
   - wraps esbuild and adds another layer

Default recommendation: `esbuild`, because this repo already planned it and the
extension host bundle is straightforward.

## Implementation Steps

1. Confirm current VSIX contents and size.
2. Add bundler dependency and config.
3. Change `package.json:main` from `./out/src/extension` to bundled output.
4. Update scripts:
   - `compile`
   - `typecheck`
   - `bundle`
   - `watch`
   - `vscode:prepublish`
5. Update `.vscodeignore` so source and build internals are excluded while the
   bundled entrypoint and runtime assets remain included.
6. Add a manual approval guard or release environment so `v*` tags cannot
   publish to Marketplace/Open VSX just because secrets are configured.
7. Pin GitHub Actions by SHA.
8. Add workflow concurrency groups.
9. Ensure CI still runs tests against compiled/bundled output.
10. Verify package scan catches maps, tests, plans, scratch files, and source TS.
11. Update README and CHANGELOG.

## Tests

- `npm ci`
- `npm run format:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm audit --omit=dev --audit-level=high`
- `npm run package`
- `npm run package:scan -- pdf-preview-next-1.10.0.vsix`
- Inspect VSIX:
  - no `src/`
  - no `out/src/test`
  - no source maps unless intentionally retained
  - includes bundled extension entrypoint
  - includes `lib/` runtime assets
- Bundle hygiene:
  - confirm esbuild config has `external: ['vscode']` so `vscode` is not
    bundled into the host output
  - confirm `dist/extension.js` does not contain `@vscode/vsce` types or
    runtime references
  - confirm bundled output stays inside the agreed size budget (track it in
    CHANGELOG so future regressions are visible)
- Install-and-open gate (mandatory):
  - `code --uninstall-extension ricardofrantz.pdf-preview-next`
  - `rm -rf ~/.vscode/extensions/ricardofrantz.pdf-preview-next-*`
  - Fully quit VS Code, then relaunch.
  - `code --install-extension pdf-preview-next-1.10.0.vsix --force`
  - Open at least one fixture PDF and confirm extension activation runs from
    the bundled entrypoint without behavior regressions.

## Acceptance Criteria

- Extension activates from bundled `dist/extension.js`.
- Local VS Code install from the built VSIX works.
- CI and release workflows use pinned action SHAs.
- Registry publishing requires an explicit approval path.
- VSIX size does not grow.
- No runtime behavior changes are introduced.

## Risks

- Tests may accidentally run stale `out/` code instead of bundled output.
- `.vscodeignore` mistakes can omit required PDF.js runtime files.
- Source maps can leak into packages unless scan rules catch them.
