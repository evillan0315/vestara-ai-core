---
title: Verification evidence manifests
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Verification evidence manifests

Immutable verification manifests belong in this directory. Each manifest must
contain `runId`, `repository`, an immutable `commit` SHA, an ISO timestamp,
the commands executed, and explicit limitations. Validate them with:

```bash
pnpm docs:evidence
```
