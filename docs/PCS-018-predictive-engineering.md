---
title: PCS-018 — Predictive Engineering
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-018 — Predictive Engineering

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-018 |
| Name | Predictive Engineering |
| Command | `vestara predict <target>` |
| Version | 1.0 |
| Status | Implemented (v2.4) |

---

## Goal

Turn repository understanding into actionable engineering insight. Before implementing a change, help developers understand its likely consequences through deterministic impact analysis.

## Artifact

```typescript
interface ImpactAssessment {
  id: string;
  target: string;
  scope: string[];
  affectedPackages: number;
  affectedFiles: number;
  estimatedRisk: 'low' | 'medium' | 'high';
  estimatedEffort: string;
  predictedHealthDelta: number;
  confidence: 'low' | 'medium' | 'high';
  concerns: string[];
  recommendation: string;
  aiNarrative: string | null;
  createdAt: string;
  workspaceId: string;
}
```

## Deterministic Analysis

Always available, no AI required:
- Files likely to change
- Packages affected (dependency radius)
- Risk (based on health score and complexity)
- Predicted health score delta
- Concerns (missing tests, circular deps, shared modules)

## AI Narrative

Optional enrichment when provider is available.

## Commands

| Command | Description |
|---------|-------------|
| `predict <goal>` | Predict impact of a change goal |
| `predict plan <id>` | Predict impact of an existing plan |
| `predict history` | Show past predictions |

## Related Documents

- PCS-001: RepositoryWorkspace
- PCS-003: Planning
- PRODUCT-PRINCIPLES.md
