---
title: ImpactAssessment Contract
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ImpactAssessment Contract

**Version 1.0**

## Identity

- ID format: `IA-{timestamp}-{N}` (e.g., `IA-1784856022809-1`)
- Namespace: per-workspace

## Lifecycle

Single assessment — created and persisted. No state transitions.

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier |
| `target` | string | The goal or change being assessed |
| `scope` | ScopeAnalysis | Packages, modules, files affected |
| `risk` | RiskAssessment | Risk level, increase, reduction |
| `effort` | EffortEstimate | Level, description, files affected |
| `health` | HealthPrediction | Current, predicted, delta |

## Sub-objects

- `ScopeAnalysis`: packages[], modules[], entryPoints[], files
- `RiskAssessment`: level (low/medium/high), increase[], reduction[]
- `EffortEstimate`: level (small/medium/large), description, filesAffected, dependencyRadius
- `HealthPrediction`: current (number), predicted (number), delta (number)

## Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `narrative` | string | AI-synthesized explanation |
| `planId` | string | Link to originating Plan |
| `recommendations` | Recommendation[] | Suggested actions |

## Relationships

- Referenced by Decision via `assessmentId`
- Referenced by PredictionAccuracy via `assessmentId`
- Linked to Plan via `planId`

## Persistence

- SQLite table: `impact_assessments` in `.vestara/plans/plans.db`
