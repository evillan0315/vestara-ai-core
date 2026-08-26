# Documentation automation

Vestara documentation is governed by metadata, immutable implementation
references, and generated status reports. The automation is intentionally
advisory until legacy documents are migrated; use `--strict` in CI gates.

## Commands

```bash
pnpm docs:validate       # frontmatter and status-dependent metadata
pnpm docs:status         # generated document/status projection
pnpm docs:review-due     # overdue review report
pnpm docs:links          # relative Markdown link validation
pnpm docs:drift          # package/documentation drift report
pnpm docs:evidence       # evidence manifest validation
pnpm docs:impact ADR-001 # references and impact report
pnpm docs:govern         # strict validation, links, and evidence
pnpm generate-docs       # TypeDoc API reference and package catalog
```

Reports are written to `docs/generated/` and are ignored from source control.
The source contracts live in `docs/schemas/`.

## API reference

`pnpm generate-docs` discovers every package entrypoint at
`packages/**/src/index.ts`, generates the TypeDoc site in `docs/api/`, and
writes the package dependency catalog to `docs/api/PACKAGE_CATALOG.md`. The
output is intentionally ignored because it is generated from source; run the
command after changing a public package export and serve `docs/api/index.html`
locally to review the result.

## Verification metadata

Documents marked `implemented` or `verified` must identify an immutable Git
commit. Verified documents should additionally link an evidence manifest:

```yaml
implementation-repository: evillan0315/vestara-ai-core
implementation-commit: 0123456789abcdef0123456789abcdef01234567
verification-run-id: verify-2026-08-02-001
evidence-manifest: docs/evidence/verify-2026-08-02-001.json
```

Never use `main`, `HEAD`, `latest`, or `local main` as implementation evidence.
