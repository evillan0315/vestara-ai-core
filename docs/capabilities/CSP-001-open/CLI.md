---
title: CLI Contract
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# CLI Contract

## Command

`vestara open <path>` (default: `.`)

## Output

```
Opening repository...
✓ Repository discovered    341 files
✓ Repository identified    my-project
✓ Repository analyzed      typescript (88 entry points, 4 risks)
✓ Workspace created
✓ Knowledge indexed        285 documents
✓ Repository understood

Repository Summary
────────────────────────────────────
  Language:       typescript
  Health Score:   ⚠ 3.6 / 10.0
  Files:          341
  Packages:       31

vestara-ai-core >
```
