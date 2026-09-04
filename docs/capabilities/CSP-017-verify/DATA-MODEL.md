---
title: Data Model
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Data Model

## VerificationReport

```typescript
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

## VerificationCheck

```typescript
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
```

## VerificationStatus

```typescript
type VerificationStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';
```

## VerificationType

```typescript
type VerificationType = 'typecheck' | 'test' | 'build' | 'lint' | 'filesystem' | 'artifact-consistency';
```

## PredictionAccuracy

```typescript
interface PredictionAccuracy {
  id: string;
  assessmentId: string;
  changeSetId: string;
  verificationId: string;
  predictedHealthDelta: number;
  actualHealthDelta: number;
  error: number;
  absoluteError: number;
  recordedAt: string;
}
```

## Persistence

Stored in `.vestara/plans/plans.db` (shared database):
- `verification_reports` table
- `prediction_accuracy` table
