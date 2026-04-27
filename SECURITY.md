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

Findings are tracked in [PLAN.md](./PLAN.md) (Phase 1).

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

- **Critical** — Vendored PDF.js `3.1.81` is affected by **CVE-2024-4367**
  (arbitrary JavaScript execution via crafted PDF, fixed in 4.2.67).
  Immediate mitigation landed by disabling PDF.js eval support; full remediation
  is tracked in PLAN.md Phase 1 as the PDF.js 5 migration.
- **High** — Webview CSP used `script-src 'unsafe-inline'`, which
  defeats CSP's protection against script injection in the viewer.
  Remediated with a per-load script nonce. Tracked in PLAN.md Phase 1.
- **Medium** — `localResourceRoots` needed tighter bounds. Remediated in
  Phase 1 by limiting roots to the extension directory and the opened PDF's
  containing directory, which is the directory-style boundary VS Code webviews
  support for local resources.
- **Medium** — CSP omitted `worker-src`; PDF.js spawns a Web Worker.
  Remediated in Phase 1.

**Verified clean.**

- No shell-execution or dynamic code evaluation in repository-authored
  code (only inside vendored `lib/build/pdf.js`).
- No unsafe HTML sinks in `src/`.
- `npm audit --omit=dev` reports 0 vulnerabilities.
- `npm audit --audit-level=high` reports 0 high or critical vulnerabilities;
  the remaining dev-only advisories are moderate findings in `@vscode/vsce`'s
  Azure auth dependency chain.
- No secrets, tokens, or API keys in source.
- No GitHub Actions workflows present, so no workflow-injection surface.

**Status.** Phase 1 webview hardening has landed on `main`. Rendering
untrusted PDFs should still wait for the full PDF.js upgrade tracked in
[PLAN.md](./PLAN.md).
