# PCS-017 — Async Execution Engine

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-017 |
| Name | Async Execution Engine |
| Version | 1.0 |
| Status | Implemented (v2.1) |

---

## Goal

Introduce a first-class async execution engine for all platform services. Jobs run in the background with streaming progress, cancellation, and persistent history. Verification, planning, and implementation become async operations.

## Architecture

```
ExecutionEngine
      |
      +── Job Queue (pending → running → completed/failed/cancelled)
      |
      +── Progress Stream (typed events per job)
      |
      +── Worker Pool (runs jobs asynchronously)
```

## Commands

| Command | Description |
|---------|-------------|
| `exec status <id>` | Show job status and streaming progress |
| `exec list` | List all execution jobs |
| `exec cancel <id>` | Cancel a running job |

## Related Documents

- PCS-005: Verification (now async)
- PCS-003: Planning (now async)
- PCS-004: Implementation (now async)
