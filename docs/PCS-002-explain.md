---
title: PCS-002 — Repository Explanation
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-002 — Repository Explanation

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-002 |
| Name | Repository Explanation |
| Command | `vestara explain <target>` |
| Version | 1.0 |
| Status | Implemented (v0.3.3) |
| Prerequisite | `vestara open` (PCS-001) |

---

## Goal

Enable a developer working within an opened workspace to ask *why* the repository is structured the way it is and receive contextual, accurate explanations grounded in the existing `RepositoryWorkspace` — without rediscovering or reindexing the repository.

## Inputs

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `<target>` | Yes | — | What to explain: `architecture`, a module path, a symbol name, a package |

The command is always issued within an active workspace session created by `vestara open .`. It does not open or index the repository — it explains what is already understood.

## Outputs

| Artifact | Description |
|----------|-------------|
| Formatted explanation | Text displayed in the terminal |
| Memory enrichment | The explanation is stored in the workspace's memory for future reference |

## Explanation Targets

| Target | Example | What it explains |
|--------|---------|-----------------|
| `architecture` | `explain architecture` | Overall architectural style, layering, patterns |
| `<module-path>` | `explain packages/kernel` | Module purpose, dependencies, entry points, exports |
| `<package-name>` | `explain @vestara/workspace` | Package role in the system, its dependencies and dependents |
| `dependencies` | `explain dependencies` | Dependency graph, relationships, circular deps |
| `data-flow` | `explain data-flow` | How data moves through the system |

## Pipeline

```
User: explain <target>
         │
         ▼
ExplainService.explain(target, RepositoryWorkspace)
         │
         ├── Deterministic: Look up target in workspace analysis
         │     (entry points, package map, risks, file list)
         │
         ├── Knowledge: Search indexed documents for target context
         │
         ├── Memory: Retrieve prior explanations or related context
         │
         ├── Executive: Synthesize explanation via provider (best-effort)
         │     System prompt includes target data + workspace context
         │     Returns structured explanation
         │
         └── Output: Rendered explanation + memory enrichment
```

## User Experience

### Explain architecture

```
vestara-ai-core > explain architecture

  Vestara appears to follow a layered architecture with five
  distinct layers:

  Layer                   Key Packages
  ─────────────────────────────────────────────────
  Core Runtime            kernel, event-bus, logger, metrics
  Platform Services       knowledge, memory, reasoning, conversation
  Orchestration           workspace
  Application             cli
  Architecture Docs       blueprint/, specifications/, foundation/

  The dependency direction is strictly downward: each layer
  imports only from layers below it. This is enforced by the
  build order (build-order.sh).

  Key Patterns:
  • Event-driven communication via EventBus
  • Strategy pattern in ReasoningRuntime (8 strategies)
  • Pipeline pattern in WorkspaceRuntime (7 stages)

  Risks:
  • 5 tool packages are stubs (shell, memory, knowledge, project)
  • 7 package directories have no package.json
```

### Explain a module

```
vestara-ai-core > explain packages/workspace

  @vestara/workspace (v0.3.0)
  Role: Pipeline orchestrator for repository comprehension

  Imports from:
    knowledge, memory, reasoning, conversation, shared

  Used by:
    cli (apps/cli)

  Exports:
    WorkspaceRuntime.open(path)     — Main entry point
    WorkspaceSession                — Active workspace context
    RepositoryWorkspace             — Canonical domain object
    RepositoryPresenter             — CLI/JSON rendering

  Description:
    The WorkspaceRuntime is a state machine that sequences
    the open pipeline: Discover → Fingerprint → Analyze →
    Manifest → Index → Present → Session. Each stage
    enriches the RepositoryWorkspace domain object.

  Files:              11 source files
  Entry Points:       src/index.ts
  Tests:              None detected
```

### Explain with no workspace

```
$ vestara explain architecture

  Error: No active workspace. Run `vestara open .` first.
```

## Success Metrics

| Metric | Target |
|--------|--------|
| Explanation generated for known target | Always |
| Explanation generated for unknown target | Graceful message, not crash |
| Response time (cached workspace) | <3 seconds |
| Response time (with AI provider) | <10 seconds |
| No rediscovery of repository | Always — uses existing workspace |
| Offline operation | Deterministic explanations always work |

## Acceptance Criteria

- [ ] `vestara explain` without an active workspace returns a clear error
- [ ] `explain architecture` produces a coherent architectural description
- [ ] `explain packages/workspace` produces a module-level explanation
- [ ] Explanation uses indexed knowledge + workspace analysis (no reindexing)
- [ ] Explanation is stored in workspace memory
- [ ] AI provider available → enriched explanation
- [ ] AI provider unavailable → deterministic explanation with available data
- [ ] Unknown target returns a clear "target not found" message
- [ ] No architectural contracts violated
- [ ] No required cloud dependency for deterministic output

## Architecture Traceability

```
CLI (thin adapter)
  ↓
WorkspaceSession
  ├── WorkspaceRuntime.getSession()
  ├── WorkspaceSession.search()
  ├── WorkspaceSession.getContextMemories()
  └── ConversationService (fallback for open-ended questions)
```

The explain command does not open or index. It consumes the workspace that `vestara open` created.

## Implementation Strategy

The explain capability will be implemented as:

1. A new `ExplainService` in the workspace package — orchestrates deterministic lookup + optional AI synthesis
2. A `explain` handler in the workspace REPL — parses the target, delegates to ExplainService, renders output
3. Integration with the existing `ConversationService` as fallback for targets the service cannot resolve deterministically

The service has three tiers:

| Tier | Method | Always works? | Provider needed? |
|------|--------|---------------|------------------|
| Deterministic | Lookup in `RepositoryProfile` entry points, packages, risks | Yes | No |
| Knowledge-augmented | Search indexed documents for the target | Yes | No |
| AI-synthesized | Provider call with target data + workspace context | No | Yes |

Each tier enriches the previous. If AI is unavailable, the developer still gets a useful explanation.

## Related Documents

- PCS-001: `docs/PCS-001-repository-comprehension.md`
- Product Principles: `docs/PRODUCT-PRINCIPLES.md`
- WorkspaceRuntime: `packages/workspace/src/workspace-runtime.ts`
- WorkspaceSession: `packages/workspace/src/workspace-session.ts`
- Workspace REPL: `apps/cli/src/repl-workspace.ts`
