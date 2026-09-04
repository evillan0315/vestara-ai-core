---
title: Vestara Specification-Driven Engineering (VSDE)
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# Vestara Specification-Driven Engineering (VSDE)

## Governing Principle

> Specifications are the primary engineering artifact. Source code is an implementation of those specifications. Verification demonstrates conformance. Metrics determine product success.

## The Engineering Lifecycle

```
Vision
  ↓
Governance
  ↓
Specification
  ↓
Architecture
  ↓
Implementation
  ↓
Verification
  ↓
Measurement
  ↓
Learning
  ↺
```

Every stage produces a durable artifact. No stage begins until the previous stage's artifact is approved.

## VSDE Workflow

```
1. Read Product Principles (docs/PRODUCT-PRINCIPLES.md)
2. Create Capability Specification Package (docs/capabilities/CSP-XXX/)
3. Complete all specification documents
4. Pass specification checklist
5. Implementation begins
6. Verification proves conformance
7. Metrics measure success
8. Documentation updated
```

## Specification Package Structure

Every capability produces a complete engineering package under `docs/capabilities/CSP-XXX-name/`:

| Document | Question Answered |
|----------|------------------|
| `README.md` | What is this capability? |
| `01-overview.md` | Why are we building it? |
| `02-product.md` | What does the user gain? |
| `03-user-experience.md` | What does it feel like? |
| `04-domain-model.md` | What new artifacts exist? |
| `05-architecture.md` | Which components are reused or created? |
| `06-storage.md` | Where is data persisted? |
| `07-cli.md` | What are the exact commands? |
| `08-api.md` | How will future interfaces consume it? |
| `09-security.md` | What permissions and audit are needed? |
| `10-performance.md` | What are the timing targets? |
| `11-testing.md` | How is it validated? |
| `12-rollout.md` | How is it introduced? |
| `13-decisions.md` | What tradeoffs were made? |
| `14-checklist.md` | Is everything approved? |

## Specification Checklist

No implementation begins until all items pass:

```
□ Product approved
□ UX approved
□ Architecture approved
□ Domain model approved
□ Storage approved
□ ATS complete
□ Performance targets defined
□ Security reviewed
□ Rollout documented
```

## Document → Code Mapping

```
docs/capabilities/CSP-XXX-name/
  ↓
packages/<owner>/<implementation>/
  ↓
apps/cli/src/repl-*.ts
  ↓
tests/
```

The documentation structure mirrors the code structure. Each CSP maps to one package area.

## Public Package Documentation Standard

Every non-private workspace package must provide `README.md`, `ARCHITECTURE.md`,
`TESTING.md`, and `API.md`. The README is the package entrypoint and must contain
governed metadata plus these sections:

```text
Overview
Responsibilities
Architecture
Public API
Lifecycle
Failure behavior
Health behavior
Security and permissions
Usage
Testing
Verification
Dependencies
Ownership
Related ADRs
Related documentation
```

Required README frontmatter is:

```yaml
---
id: DOC-PKG-<PACKAGE>-001
kind: readme
authority: implementation
status: current
owner: <team-or-service>
version: 1.0.0
last-reviewed: 2026-08-01
next-review: 2026-11-01
implementation-ref: packages/<package>/src/index.ts
verification-status: verified
---
```

`verification-status: verified` is valid only when the README links to real
test or verification evidence. Public API claims must map to the package barrel,
and architecture claims must identify their implementation references and
related ADRs. A package with no related ADR must say so instead of inventing one.

The executable source of this contract is
`packages/documentation/src/requirements.ts`. The verified reference
implementation is
[`packages/documentation/README.md`](../../packages/documentation/README.md).
Changes to either require corresponding tests.

### Semantic validation

Presence is necessary but insufficient. Executable documentation validation
must also prove:

- Every declared `implementation-ref` resolves to an existing path inside its configured repository.
- Every explicit `owner` matches `package.json.documentation.owner` or an entry in that repository's `docs/documentation-owners.json` registry.
- Package document versions match the package manifest version.
- `next-review` is valid, follows `last-reviewed`, and has not expired; expired current documents are projected as stale.
- `verification-status: verified` points to an existing test, evidence, or verification target.
- Package API documents name every symbol exported by the package barrel.
- Filtered pnpm commands name scripts declared by the selected package or application.
- Related ADR links resolve to decisions whose status is `accepted` or `current`.
- Declared document `kind` and `authority` agree with deterministic path and repository classification.

Semantic rules are deterministic and provider-neutral. Existing migration debt
may be recorded in the documentation baseline, but new violations fail the CI
gate. Mutation tests against `@vestara/settings-framework` deliberately corrupt
one claim at a time and must prove every rule detects the mismatch.

The approved-owner registry is attribution policy, not authentication. Changes
to it require review and must not be used to silently legitimize unknown owners.

## AI Integration

```
Capability Package
  ↓
AI reads specification
  ↓
AI implements documented behavior
  ↓
AI validates against ATS
  ↓
AI updates implementation status
  ↓
Human reviews
```

The AI never invents behavior — it implements documented behavior.

## CI Pipeline

```
Validate Markdown → Validate References → Validate Domain Models →
Validate ATS Completeness → Implementation Allowed → Compile →
Test → Verify → Release
```

Documentation quality is a build gate. A capability cannot be implemented until its specification is complete and approved.

## Capability Maturity

Every capability tracks maturity across dimensions:

```
Specification:    100%
Architecture:     100%
Implementation:   60%
Verification:     20%
Metrics:           0%
```

This is exposed via the capability registry and prevents partial implementations from being considered "complete."
