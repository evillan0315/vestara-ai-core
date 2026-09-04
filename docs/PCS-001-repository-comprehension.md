---
title: PCS-001 — Repository Comprehension
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-001 — Repository Comprehension

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-001 |
| Name | Repository Comprehension |
| Command | `vestara open <path>` |
| Version | 1.0 |
| Status | Implemented (v0.3.0) |
| Epic | EPIC-001 |

---

## Goal

Transform an unfamiliar repository into an understandable, queryable workspace within seconds. The user should never think about "Brains" or "runtimes" — they should experience that the tool understands their project.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<path>` | No | `.` | Path to a local repository directory |

## Outputs

| Artifact | Description |
|----------|-------------|
| `RepositoryWorkspace` | Canonical domain object enriched by every pipeline stage |
| `WorkspaceSession` | Active context with knowledge, memory, conversation engines |
| `.vestara/` | On-disk cache directory with manifest, knowledge DB, memory DB |

## Pipeline

```
WorkspaceRuntime.open(path)
  ├── Discover       Walk files, skip ignored directories
  ├── Fingerprint    Git identity + content hash
  ├── Analyze        Language, framework, entry points, risks, package map
  ├── Manifest       Create .vestara/ + workspace.json
  ├── Index          Parse documents, chunk, store in SQLite
  ├── Present        Deterministic facts + AI narrative (best-effort)
  └── Session        Initialize engines, return WorkspaceSession
```

## User Experience

### Successful first run

```
$ vestara open .

Opening repository...

✓ Repository discovered    194 files
✓ Repository identified    vestara-ai-core
✓ Repository analyzed      typescript
✓ Workspace created
✓ Knowledge indexed        157 documents
✓ Repository understood

Repository Summary
────────────────────────────────────
  Language:       typescript
  Packages:       pnpm
  Files:          194
  Entry Points:
    • apps/cli/src/index.ts
    • packages/kernel/src/index.ts
  Detected Risks:
    • todo-hotspot: 11 markers
    · missing-tests: no test files found

Ready in 2.1s

vestara-ai-core > help
  exit/quit         Close the workspace
  health/status     Show runtime health
  history           Show conversation history
  search <term>     Search the knowledge index
  risks             Show detected risks
  summary           Show repository summary
  <anything else>   Ask a question in workspace context

vestara-ai-core > explain architecture
```

### Reopen (cached)

```
$ vestara open .

Opening repository...

✓ Repository identified    vestara-ai-core
✓ Workspace restored
✓ Knowledge up to date

Ready in 0.3s

vestara-ai-core >
```

## Success Metrics

| Metric | Target |
|--------|--------|
| Repository identity established | Always |
| Entry points detected | Always (may be empty) |
| Risks detected | Always (may be empty) |
| Knowledge indexed | Always (may be 0 for unsupported files) |
| Session created | Always |
| Time to Ready (cold, <10k files) | <10 seconds |
| Time to Ready (warm, cached) | <1 second |
| AI narrative generated | Best-effort, degrades gracefully |
| Offline operation | Full functionality without internet |

## Acceptance Criteria

- [x] `vestara open .` completes without crashing
- [x] `.vestara/` directory created with `workspace.json`
- [x] Workspace identity established (git-aware, non-git fallback)
- [x] Repository analysis produces language, framework, entry points, risks
- [x] Knowledge index built and persisted to SQLite
- [x] AI narrative attempted, degrades gracefully when unavailable
- [x] Workspace session created with knowledge, memory, conversation engines
- [x] REPL prompt changes to `{repo-name} >`
- [x] Built-in commands work: `help`, `health`, `history`, `search`, `risks`, `summary`
- [x] Stage timings captured in structured log
- [x] No architectural contracts violated
- [x] No required cloud dependency

## Architecture Traceability

```
CLI (thin adapter)
  ↓
WorkspaceRuntime
  ├── RepositoryDiscovery
  ├── RepositoryFingerprint
  ├── RepositoryIntelligence
  ├── WorkspaceManifest
  ├── KnowledgeEngine (from @vestara/knowledge)
  ├── RepositoryPresenter
  └── WorkspaceSession
        ├── KnowledgeEngine
        ├── MemoryRuntime
        └── ConversationService
```

## Performance Baselines (v0.3.0)

Measured on `vestara-ai-core/` (194 files, 28 packages):

| Stage | Time | Notes |
|-------|------|-------|
| Discover | 15ms | File walk with stat |
| Fingerprint | 34ms | Git commands + content hash |
| Analyze | 32ms | Deterministic, entry points + risks |
| Index | 413ms | Read + parse + chunk + write (157 docs) |
| Present | 410ms | AI provider call (dominates when available) |
| Session | 17ms | Engine initialization |
| **Pipeline** | **924ms** | Sum of stages |
| **Total** | **2142ms** | Includes kernel boot (~1200ms) |

## Future Extensions

| Extension | Phase | Description |
|-----------|-------|-------------|
| Incremental indexing | v0.3.2 | Only reindex changed files |
| Background indexing | v0.3.2 | Workspace ready before index completes |
| File watching | v0.3.2 | inotify/fsevents for live updates |
| AI result caching | v0.3.2 | Cache narrative summaries |
| Dependency graph | v0.3.1 | Full import graph resolution |
| Circular dependency detection | v0.3.1 | Cycle reporting |
| Architecture pattern detection | v0.3.1 | Layered, event-driven, plugin, etc. |
| Test coverage mapping | v0.3.1 | Per-package test coverage |
| `vestara explain` | v0.3.3 | Explain architecture, symbols, data flow |

## Related Documents

- EPIC-001: `thoughts/plans/epic-001-repository-comprehension.md`
- Blueprint: `vestara-blueprint/05-ai-core/BRAIN-ARCHITECTURE.md`
- Object Model: `vestara-foundation/object-model/VESTARA-OBJECT-MODEL.md`
- Runtime: `vestara-runtime/kernel/VESTARA-KERNEL.md`
- Knowledge: `packages/knowledge/src/index.ts`
- Memory: `packages/memory/src/index.ts`
- Reasoning: `packages/reasoning/src/index.ts`
