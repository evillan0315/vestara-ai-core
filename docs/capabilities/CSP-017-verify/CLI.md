---
title: CLI Contract
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# CLI Contract

## Commands

| Command | Description |
|---------|-------------|
| `verify <cs-id>` | Verify a Change Set (5 standard checks) |
| `verify plan <id>` | Validate plan completion against linked ChangeSets |
| `verify workspace` | Overall workspace health and outcome validation |
| `verify show <vr-id>` | Display a stored VerificationReport |
| `verify trends` | Show verification pass/fail trends over time |
| `verify accuracy` | Show prediction accuracy summary |

## Output Format

### verify <cs-id>

```
Verification Report VR-1
──────────────────────────────────────
Change Set: CS-1
Plan: P-1
Status: ✓ PASSED
Checks:
  ✓ filesystem
  ✓ artifact-consistency
  ✓ typecheck (12450ms)
  ✓ test (8432ms)
  ✓ build (3211ms)
```

### verify plan <id>

```
Plan Validation: P-1
Tasks: 4 total
ChangeSets: 2 linked
Files covered: 6/6
✓ All plan files changed
```

### verify workspace

```
Workspace Verification
──────────────────────────────────────
Health Score: 5.2 / 10
Status: Fair
  Code Quality:       4.1 / 10
  Test Coverage:      3.5 / 10
  Dependency Health:  6.2 / 10
  Documentation:      7.0 / 10
Total ChangeSets: 12
Applied: 8
Files changed: 143
Prediction Accuracy: 4 records, avg error 0.35
```
