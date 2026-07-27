# PCS-006 — Collaboration

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-006 |
| Name | Collaboration |
| Command | `vestara collaborate <change-set-id>` |
| Version | 1.0 |
| Status | Implemented (v0.7) |
| Prerequisite | A verified `ChangeSet` in the workspace |

---

## Goal

Introduce the human coordination layer around engineering artifacts. The purpose is not chat — it is governance of change. The system records not only technical truth, but organizational truth.

## Core Invariant

```
AI may propose.
Humans approve.
System records.
```

The AI can: generate plans, generate changes, explain decisions, summarize reviews.
The AI cannot: approve its own changes, bypass review states, modify approval history.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<change-set-id>` | Yes | — | ID of a verified change set (e.g., `CS-1`) |

## Outputs

| Artifact | Description |
|----------|-------------|
| `CollaborationRecord` | Governance artifact tracking review lifecycle, approvals, comments, and ownership |

## Artifact Model

### ReviewStatus

```typescript
type ReviewStatus = 'draft' | 'submitted' | 'reviewing' | 'approved' | 'rejected' | 'completed';
```

### Approval

Immutable event — never overwrites previous decisions. History matters.

```typescript
interface Approval {
  id: string;
  reviewer: string;
  decision: 'approve' | 'reject';
  comment?: string;
  createdAt: string;
}
```

### CollaborationComment

Attaches to any artifact in the workspace.

```typescript
interface CollaborationComment {
  id: string;
  artifactType: 'plan' | 'changeset' | 'verification';
  artifactId: string;
  author: string;
  message: string;
  createdAt: string;
}
```

### Ownership

```typescript
interface Ownership {
  owner: string;
  contributors: string[];
  reviewers: string[];
}
```

### CollaborationRecord

```typescript
interface CollaborationRecord {
  id: string;
  workspaceId: string;
  changeSetId: string;
  planId: string;
  verificationId: string | null;
  status: ReviewStatus;
  approvals: Approval[];
  comments: CollaborationComment[];
  ownership: Ownership;
  createdAt: string;
  updatedAt: string;
}
```

## User Experience

### Submit for review

```
vestara-ai-core > collaborate submit CS-1

  Collaboration record CR-1 created for Change Set CS-1
  Status: submitted

  Pending reviewers: eddie

  Next: collaborate approve CR-1 or collaborate reject CR-1
```

### Approve

```
vestara-ai-core > collaborate approve CR-1

  Approval recorded.
  Reviewer: eddie
  Decision: approve

  Status: submitted → approved

  All approvals received. Change Set CS-1 is ready.
```

### Add a comment

```
vestara-ai-core > collaborate comment CR-1 "Needs documentation update"

  Comment added to CR-1.
```

### View status

```
vestara-ai-core > collaborate status CR-1

  Collaboration Record CR-1
  ──────────────────────────────────────
  Change Set: CS-1
  Plan: P-1
  Verification: VR-1
  Status: approved

  Approvals:
    ✓ eddie — approve (2026-07-23)

  Comments:
    • eddie: "Needs documentation update"

  Ownership:
    Owner: eddie
    Reviewers: eddie
```

## Architecture

### Storage

```
SQLite tables:
  collaboration_records  — main records with status
  approvals             — immutable approval events
  comments              — artifact-attached comments
```

### Safety

- Approvals are append-only — never overwrite previous decisions
- AI may never approve its own changes
- Review status transitions follow a state machine: `draft → submitted → reviewing → approved/rejected → completed`

## Related Documents

- PCS-005: `docs/PCS-005-verify.md`
- Collaboration types: `packages/workspace/src/types.ts`
- CollaborationStorage: `packages/workspace/src/collaboration-storage.ts`
- CollaborationService: `packages/workspace/src/collaboration-service.ts`
- REPL: `apps/cli/src/repl-workspace.ts`
