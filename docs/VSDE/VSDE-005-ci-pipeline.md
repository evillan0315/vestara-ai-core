---
title: VSDE-005 — CI Pipeline
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VSDE-005 — CI Pipeline

## Specification Gate (future)

```
Validate Markdown structure
Validate metadata headers
Validate cross-references
Validate artifact references
Validate ATS completeness
→ If incomplete: BUILD FAILED — Specification incomplete
→ If complete: proceed to implementation
```

## Compilation Gate

```
bash build-order.sh
→ If fails: BUILD FAILED — Compilation error
```

## Test Gate

```
vitest run
→ If fails: BUILD FAILED — Test failure
```

Test runners must have explicit ownership boundaries. Vitest runs unit,
integration, and component suites. Playwright specifications run through the
dedicated visual/end-to-end command and must not be collected by Vitest.
Framework unit tests that support Playwright remain in Vitest unless they invoke
the Playwright test API directly.

## Verification Gate

```
vestara doctor
vestara demo golden-path
→ If fails: BUILD FAILED — Verification failure
```

## Release Gate

```
All previous gates pass
Specification is current with implementation
Documentation updated
→ Release
```
