---
title: VSDE-006 — Capability States
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VSDE-006 — Capability States

## State Machine

```
Proposed → Specified → Approved → Implemented → Verified → Measured → Released
```

| State | Meaning |
|-------|---------|
| Proposed | Problem identified, not yet specified |
| Specified | CSP exists and is complete |
| Approved | Review gates 1-3 passed |
| Implemented | Code exists and compiles |
| Verified | ATS passes, tests pass |
| Measured | Metrics collected and reviewed |
| Released | Shipped as part of a version |

## Maturity Tracking

Every capability tracks maturity across dimensions:

```
Specification:    0-100%
Architecture:     0-100%
Implementation:   0-100%
Verification:     0-100%
Documentation:    0-100%
```

## State Enforcement

- No capability can be "Verified" without passing ATS
- No capability can be "Released" without metrics
- No capability can skip states
