# Implementation Decisions
## Implementation-Specific Decisions That Don't Change the Frozen Architecture

> **This log records implementation decisions made during Phase 3 and Product Era development. If a decision affects the frozen architecture, it must go through the ADR process instead.**

---

## Decision Log

| Date | ID | Decision | Rationale | Impact |
|------|----|----------|-----------|--------|
| 2026-07-23 | D-001 | `WorkspaceRuntime` as new `@vestara/workspace` package | CLI must not import knowledge/memory/reasoning directly. All future consumers import the same runtime. | Created `packages/workspace/` with 11 modules |
| 2026-07-23 | D-002 | `RepositoryWorkspace` as progressively enriched domain object | Every pipeline stage enriches the same aggregate instead of passing unrelated DTOs. Enables deterministic testing, serialization, and replay. | Single canonical type across all stages |
| 2026-07-23 | D-003 | Repository fingerprint as a distinct pipeline stage | Everything downstream depends on repository identity (memory, knowledge, missions, agent state). Treating it as a first-class stage prevents identity drift. | `RepositoryFingerprint` module with git + content hash |
| 2026-07-23 | D-004 | `RepositoryPresenter` separates presentation from runtime | The runtime produces a semantic model; the presenter renders it. CLI, REST, desktop, IDE, and voice all consume the same model and render differently. | `RepositoryPresenter` with `renderCli()`, `renderJson()`, `renderMarkdown()` |
| 2026-07-23 | D-005 | AI narrative is best-effort, not required | Provider availability should never block the pipeline. Deterministic facts are the source of truth; AI enriches but is optional. | Pipeline completes without AI; graceful degradation |
| 2026-07-23 | D-006 | Stage timing instrumentation in `WorkspaceRuntime` | Performance optimization requires baseline data. Knowing that ~90% of time is in index + present phases informs Phase 2 priorities. | Stage timings logged per open |
| 2026-07-23 | D-007 | `build-order.sh` expanded to full dependency graph | The build script now serves as executable architecture documentation. A circular dependency breaks the build immediately. | 22 packages in dependency order |
| 2026-07-23 | D-008 | `moduleResolution` changed from `"node"` to `"nodenext"` | TypeScript 7.0 removed the deprecated `"node"` / `"node10"` resolution. Required for compilation to succeed. | Root `tsconfig.json` updated |

---

## How to Add a Decision

1. Is this an **architectural** decision (changes a frozen contract)? → **ADR process** in `vestara-blueprint/00-governance/04-decision-log.md`
2. Is this an **implementation** decision (within existing contracts)? → **Log it here**

---

## Product Era Discipline

For every new user-facing command, create these documents before implementation:

- **PCS-00X** — Product Capability Specification (user problem, command, inputs/outputs, success criteria, failure modes, telemetry, evolution)
- **UX-00X** — User Experience Specification (terminal interaction, progress output, error messages, recovery flow)
- **ATS-00X** — Acceptance Test Specification (golden scenarios, performance targets, regression cases)
