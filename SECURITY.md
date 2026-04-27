# Security

## Reporting a Vulnerability

Please report security issues privately to the repository owner via GitHub
Security Advisories on
<https://github.com/ricardofrantz/pdf-preview-next/security/advisories/new>,
or by opening a minimal public issue asking for a private contact channel.

Do not include exploit details in public issues.

## Audit History

| Date       | Auditor              | Scope                                        | Result                          |
|------------|----------------------|----------------------------------------------|---------------------------------|
| 2026-04-27 | Claude Opus 4.7      | `src/`, CSP, vendored PDF.js, npm advisories | 1 critical, 1 high, 2 medium    |

The 2026-04-27 findings are remediated across `1.3.0` and `1.4.0`.

### 2026-04-27 — Claude Opus 4.7

**Scope.** Static review of `src/extension.ts`, `src/pdfProvider.ts`,
`src/pdfPreview.ts`, the webview Content-Security-Policy, the vendored
PDF.js version under `lib/`, `npm audit --omit=dev`, and the
`.github/workflows/` directory.

**Method.** Pattern scan for shell-execution APIs, dynamic code
evaluation, browser XSS sinks (innerHTML assignment, document write,
React unsafe HTML props), Python risky APIs (n/a — Node project),
GitHub Actions injection (n/a — no workflows), and a manual review of
the webview HTML construction and message channel.

**Findings.**

- **Critical** — Vendored PDF.js `3.1.81` was affected by **CVE-2024-4367**
  (arbitrary JavaScript execution via crafted PDF, fixed in 4.2.67).
  Remediated in `1.4.0` by migrating the vendored runtime to
  `pdfjs-dist@5.6.205`; PDF.js eval support remains disabled.
- **High** — Webview CSP used `script-src 'unsafe-inline'`, which
  defeats CSP's protection against script injection in the viewer.
  Remediated in `1.3.0` with a per-load script nonce.
- **Medium** — `localResourceRoots` needed tighter bounds. Remediated in
  `1.3.0` by limiting roots to the extension directory and the opened PDF's
  containing directory, which is the directory-style boundary VS Code webviews
  support for local resources.
- **Medium** — CSP omitted `worker-src`; PDF.js spawns a Web Worker.
  Remediated in `1.3.0`.

**Verified clean.**

- No shell-execution or dynamic code evaluation in repository-authored code.
- No unsafe HTML sinks in `src/`.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- `npm audit --audit-level=high` reports 0 high or critical vulnerabilities;
  the remaining dev-only advisories are moderate findings in `@vscode/vsce`'s
  Azure auth dependency chain.
- No secrets, tokens, or API keys in source.
- No GitHub Actions workflows present, so no workflow-injection surface.

**Status.** Webview hardening and the PDF.js 5 runtime migration have landed.
The v1.4 webview CSP now avoids inline styles and WebAssembly execution
permission; PDF.js runs with JavaScript evaluation and WASM disabled.
