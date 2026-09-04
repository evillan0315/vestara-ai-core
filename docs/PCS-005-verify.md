---
title: PCS-005 — Verification
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-005 — Verification

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-005 |
| Name | Verification |
| Command | `vestara verify <change-set-id>` |
| Version | 1.0 |
| Status | Implemented (v0.6) |
| Prerequisite | A `ChangeSet` in the workspace |

---

## Goal

Transform implementation outcomes into verifiable engineering evidence. The question changes from "Did the AI modify the repository?" to "Can Vestara prove that the intended change was successfully completed?"

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<change-set-id>` | Yes | — | ID of a change set (e.g., `CS-1`) |

## Outputs

| Artifact | Description |
|----------|-------------|
| `VerificationReport` | Persistent artifact describing the verification lifecycle of a Change Set |

## Verification Pipeline

```
vestara verify <changeset-id>
        │
        ▼
Load ChangeSet
        │
        ▼
Load Associated Plan
        │
        ▼
Analyze Repository
        │
        ├── TypeScript typecheck
        ├── Test execution
        ├── Build validation
        ├── File integrity validation
        └── Change consistency validation
        │
        ▼
Generate VerificationReport
        │
        ▼
Persist SQLite artifact
```

## Verification Types

| Type | Description |
|------|-------------|
| `typecheck` | TypeScript `tsc --noEmit` |
| `test` | `pnpm test` or equivalent |
| `build` | `pnpm build` or equivalent |
| `lint` | Linter check |
| `filesystem` | Verify all expected files exist and have content |
| `artifact-consistency` | Change Set files match filesystem |

## Artifact Model

```typescript
type VerificationStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

interface VerificationCheck {
  id: string;
  type: VerificationType;
  status: VerificationStatus;
  command?: string;
  output?: string;
  startedAt: string;
  completedAt?: string;
  durationMs: number;
}

interface VerificationReport {
  id: string;
  workspaceId: string;
  planId: string;
  changeSetId: string;
  status: VerificationStatus;
  checks: VerificationCheck[];
  summary: { total: number; passed: number; failed: number; skipped: number };
  createdAt: string;
  completedAt: string | null;
}
```

## User Experience

```
vestara-ai-core > verify CS-1

  Verification started for Change Set CS-1
  Plan: P-1 (Add input validation to provider-runtime)

  ✓ Filesystem integrity
  ✓ Change Set consistency
  ✓ TypeScript compilation
  ✓ Unit tests
  ✗ Production build

  Verification Report VR-1
  ──────────────────────────────────────────────
  Status: FAILED

  Passed: 4
  Failed: 1

  Failure:
    build | pnpm build
    Error: Cannot resolve module "./UserService"

vestara-ai-core >
```

## Verification Results Interpretation

Verification is deterministic — the AI never decides pass/fail.

```
Bad:
  AI: "The implementation looks correct."

Good:
  Compiler: PASS
  Tests:    PASS
  Build:    PASS
  AI: "Evidence indicates the Change Set fulfilled the Plan."
```

## Success Metrics

| Metric | Target |
|--------|--------|
| Verification report created | Always |
| File integrity check | Always |
| TypeScript typecheck | When available |
| Test execution | When available |
| Build validation | When available |
| No AI-decided pass/fail | Always |

## Related Documents

- PCS-004: `docs/PCS-004-implement.md` (Change Set consumed by verify)
- Verification types: `packages/workspace/src/types.ts`
- VerificationStorage: `packages/workspace/src/verification-storage.ts`
- VerificationService: `packages/workspace/src/verification-service.ts`
