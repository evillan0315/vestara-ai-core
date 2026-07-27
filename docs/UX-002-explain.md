# UX-002 — Repository Explanation

**User Experience Specification**

| Field | Value |
|-------|-------|
| ID | UX-002 |
| Capability | `vestara explain` |
| Status | Draft |

---

## Terminal Interaction

### Successful architecture explanation

```
vestara-ai-core > explain architecture

  Vestara appears to follow a layered architecture with five
  distinct layers...

  Key Patterns:
  • Event-driven communication via EventBus
  • Strategy pattern in ReasoningRuntime (8 strategies)
  • Pipeline pattern in WorkspaceRuntime (7 stages)

vestara-ai-core >
```

The explanation appears inline, below the command. The prompt returns on completion. No scrolling pager needed for typical output under 40 lines.

### Successful module explanation

```
vestara-ai-core > explain packages/workspace

  @vestara/workspace (v0.3.0)
  Role: Pipeline orchestrator for repository comprehension
  Files: 11 source files
  Entry Points: src/index.ts

  Imports from: knowledge, memory, reasoning, conversation, shared
  Used by: cli

vestara-ai-core >
```

### Target not found

```
vestara-ai-core > explain packages/nonexistent

  Target not found: "packages/nonexistent"

  Available targets:
    architecture         — Overall architecture
    <module-path>        — Any directory under the repository root
    <package-name>       — Any package in the workspace

vestara-ai-core >
```

### No active workspace

```
$ vestara explain architecture

  Error: No active workspace. Run `vestara open .` first.
```

### Provider unavailable (deterministic fallback)

```
vestara-ai-core > explain packages/workspace

  @vestara/workspace
  ────────────────────────────────────
  Path:       packages/workspace/src
  Files:      11
  Entry:      src/index.ts
  Language:   typescript
  Depends on: knowledge, memory, reasoning, conversation, shared
  Used by:    cli

vestara-ai-core >
```

No mention of AI. Just the facts available from the workspace analysis.

## Progress Indicators

The explain command is fast (<1s for deterministic lookups). No progress bar needed. If the AI provider is invoked, show:

```
vestara-ai-core > explain architecture

  Consulting knowledge base...
  Synthesizing explanation...
```

Each status line is overwritten on completion.

## Error Messages

| Condition | Message |
|-----------|---------|
| No active workspace | `Error: No active workspace. Run \`vestara open .\` first.` |
| Target not found | `Target not found: "<target>".` followed by available targets |
| Provider error | Silently falls back to deterministic output — no error shown |

## Output Format

Explanations follow a consistent structure:

1. **Header** — target name in bold (if applicable)
2. **Body** — paragraphs of explanation text
3. **Patterns/Key facts** — bullet list (if applicable)
4. **Trailing blank line** — separates from next prompt

No markdown formatting in terminal output. Only plain text, indentation, and dashes for lists.
