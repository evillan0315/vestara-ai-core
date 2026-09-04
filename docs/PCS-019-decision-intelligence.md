---
title: PCS-019 — Decision Intelligence
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-019 — Decision Intelligence

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-019 |
| Name | Decision Intelligence |
| Command | `vestara recommend <target>` |
| Version | 1.0 |
| Status | Implemented (v2.5) |

---

## Goal

Given everything the workspace knows (health, plans, predictions, history), recommend the best course of action. The human remains the decision maker. Vestara recommends, never decides.

## Principle

> Recommend, never decide.

## Commands

| Command | Description |
|---------|-------------|
| `recommend` | Get a general workspace recommendation |
| `recommend plan <id>` | Get a recommendation for a specific plan |
| `recommend next` | Get a recommendation for what to do next |
| `recommend accept <id>` | Accept a recommendation |
| `recommend reject <id>` | Reject a recommendation |
| `recommend history` | List past recommendations |

## Artifact

```typescript
interface Decision {
  id: string;
  workspaceId: string;
  planId?: string;
  assessmentId?: string;
  createdAt: string;
  recommendation: string;
  alternatives: { label: string; description: string; risk: string }[];
  rationale: string;
  confidence: number;
  accepted: boolean;
  acceptedBy?: string;
  acceptedAt?: string;
  modelVersion: string;
}
```

## Related Documents

- PCS-018: Predictive Engineering
- PRODUCT-PRINCIPLES.md
