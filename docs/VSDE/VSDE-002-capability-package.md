---
title: VSDE-002 — Capability Specification Package
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VSDE-002 — Capability Specification Package

## Required Documents

Every CSP at `docs/capabilities/CSP-XXX-name/` must contain:

| # | Document | Answers | Required |
|---|----------|---------|----------|
| 1 | `README.md` | What is this capability? | Yes |
| 2 | `01-overview.md` | Why are we building it? | Yes |
| 3 | `02-product.md` | What does the user gain? | Yes |
| 4 | `03-user-experience.md` | What does it feel like? | Yes |
| 5 | `04-domain-model.md` | What new artifacts exist? | Yes |
| 6 | `05-architecture.md` | Which components are reused or created? | Yes |
| 7 | `06-storage.md` | Where is data persisted? | Conditional |
| 8 | `07-cli.md` | What are the exact commands? | Yes |
| 9 | `08-api.md` | Future interface contracts? | No |
| 10 | `09-security.md` | What permissions/audit are needed? | Conditional |
| 11 | `10-performance.md` | Timing and resource targets? | Yes |
| 12 | `11-testing.md` | How is it validated? | Yes |
| 13 | `12-rollout.md` | How is it introduced? | Conditional |
| 14 | `13-decisions.md` | What tradeoffs were made? | Yes |
| 15 | `14-checklist.md` | Is everything approved? | Yes |

## Metadata Header

Every CSP README begins with:

```yaml
Capability: <name>
Version: <semver>
Status: <proposed | specified | approved | implemented | verified | measured | released>
Depends On: <list of artifact IDs>
Produces Artifact: <artifact ID>
Consumes Artifacts: <list of artifact IDs>
Performance Target: <time>
Acceptance Target: <pass/fail criteria>
```

## Checklist

```
□ Product approved (aligned with PRODUCT-PRINCIPLES.md)
□ UX approved (interaction design complete)
□ Architecture approved (no contract violations)
□ Domain model approved (types defined)
□ Storage approved (schema defined)
□ CLI defined (commands and arguments)
□ ATS complete (acceptance criteria)
□ Performance targets defined
□ Security reviewed
□ Rollout documented
□ Decisions documented
```
