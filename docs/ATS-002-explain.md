---
title: ATS-002 — Repository Explanation
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ATS-002 — Repository Explanation

**Acceptance Test Specification**

| Field | Value |
|-------|-------|
| ID | ATS-002 |
| Capability | `vestara explain` |
| Status | Draft |

---

## Golden Scenario

### Prerequisites

- `vestara open .` has been run successfully in `vestara-ai-core/`
- The REPL prompt `vestara-ai-core >` is visible

### Scenario

1. User types `explain architecture`
2. System returns a multi-paragraph explanation of the repository's architecture
3. Output references actual packages and patterns from the workspace analysis
4. Output does not include JSON or raw data — it is a human-readable explanation
5. Prompt returns to `vestara-ai-core >`

---

## Acceptance Tests

### Test 1: Architecture explanation

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | `vestara open .` | Workspace opens successfully |
| 2 | `explain architecture` | Multi-line explanation of architecture appears |
| 3 | | Output references real packages (kernel, workspace, cli, etc.) |
| 4 | | Prompt returns within 10 seconds |

### Test 2: Module explanation

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | `vestara open .` | Workspace opens successfully |
| 2 | `explain packages/workspace` | Module-level explanation appears |
| 3 | | Output includes path, files, dependencies |
| 4 | | Prompt returns within 5 seconds |

### Test 3: Package explanation

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | `vestara open .` | Workspace opens successfully |
| 2 | `explain @vestara/workspace` | Package-level explanation appears |
| 3 | | Output includes role, dependencies, dependents |

### Test 4: Unknown target

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | `vestara open .` | Workspace opens successfully |
| 2 | `explain packages/nonexistent` | `Target not found: "packages/nonexistent"` |
| 3 | | Available targets listed |

### Test 5: No active workspace

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | Run `vestara explain architecture` without opening | `Error: No active workspace.` |

### Test 6: Provider unavailable (deterministic fallback)

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | `vestara open .` | Workspace opens successfully |
| 2 | Simulate provider unavailability | |
| 3 | `explain packages/workspace` | Deterministic explanation appears (no AI narrative) |
| 4 | Output includes path, files, dependencies | |

### Test 7: No reindexing

| Step | Action | Expected result |
|------|--------|-----------------|
| 1 | `vestara open .` | Workspace opens successfully |
| 2 | `explain architecture` | No file indexing occurs |
| 3 | | Only workspace analysis + knowledge are used |

---

## Performance Targets

| Test | Target | Notes |
|------|--------|-------|
| Deterministic explanation | <1 second | Pure lookup in workspace analysis |
| Knowledge-augmented explanation | <3 seconds | Includes FTS search |
| AI-synthesized explanation | <10 seconds | Includes provider call |
| Memory enrichment | <100ms | Append to existing memory store |

---

## Regression Tests

- [ ] `vestara open .` still works after explain is implemented
- [ ] `help` still lists all commands including `explain`
- [ ] General conversation still works after an explain command
- [ ] `.vestara/` content is unchanged by explain (no reindexing)
- [ ] Stage timings in open pipeline are unaffected
- [ ] Memory consolidation still works after explain stores explanations
