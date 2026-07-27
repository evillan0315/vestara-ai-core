# PCS-008 — Memory & Knowledge Graph

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-008 |
| Name | Memory & Knowledge Graph |
| Command | `vestara memory <subcommand>` |
| Version | 1.0 |
| Status | Implemented (v0.9) |

---

## Goal

Introduce persistent organizational memory. Build a connected knowledge layer across repositories, artifacts, decisions, agents, failures, and architectural evolution. Vestara learns from its own history.

## Core Invariant

```
Memory may inform decisions.
Memory may not silently change decisions.
```

Every learned fact must have provenance. No hidden learning, no undocumented changes, no automatic architectural override.

## Knowledge Sources

The initial version indexes existing artifacts within the workspace:
- RepositoryWorkspace
- Explanations
- Plans
- Change Sets
- Verification Reports
- Collaboration Records
- Agent Executions

## Artifact Model

### KnowledgeNode

```typescript
type KnowledgeNodeType = 'repository' | 'module' | 'component' | 'decision' | 'pattern' | 'incident' | 'agent' | 'artifact';

interface KnowledgeNode {
  id: string;
  type: KnowledgeNodeType;
  name: string;
  description: string;
  sourceArtifacts: string[];
  createdAt: string;
  updatedAt: string;
}
```

### KnowledgeRelation

```typescript
type KnowledgeRelationType = 'depends-on' | 'implemented-by' | 'verified-by' | 'approved-by' | 'derived-from' | 'replaced-by';

interface KnowledgeRelation {
  id: string;
  sourceId: string;
  targetId: string;
  type: KnowledgeRelationType;
  createdAt: string;
}
```

## Commands

| Command | Description |
|---------|-------------|
| `memory index` | Index all workspace artifacts into the knowledge graph |
| `memory search <query>` | Search the knowledge graph |
| `memory explain <concept>` | Show the history and context around a concept |
| `memory graph` | Show the relationship graph |

## User Experience

### Index

```
vestara-ai-core > memory index

  Indexing workspace artifacts...
  ✓ Repository profile indexed
  ✓ Plans indexed (3)
  ✓ Change Sets indexed (2)
  ✓ Verification Reports indexed (2)
  ✓ Collaboration records indexed (1)
  ✓ Agent executions indexed (4)

  Knowledge graph ready: 12 nodes, 8 relations
```

### Search

```
vestara-ai-core > memory search provider-runtime

  Found 3 nodes:

  • Module: provider-runtime (package)
    Latest: Implemented input validation (CS-1)

  • Decision: Added validation schema (P-1)
    Verified: VR-1 — passed

  • Agent: Developer agent modified types.ts
    Execution: exec-...
```

### Explain

```
vestara-ai-core > memory explain provider-runtime

  provider-runtime
  ──────────────────────────────────────
  Type: module
  Plans: P-1 (Add input validation), P-3 (Refactor config)
  Change Sets: CS-1, CS-3
  Verifications: VR-1 (passed), VR-3 (failed → fixed)
  Approved by: eddie (CR-1)
```

## Related Documents

- PCS-001 through PCS-007: Artifacts that feed into the knowledge graph
- Types: `packages/workspace/src/types.ts`
- MemoryService: `packages/workspace/src/memory-service.ts`
- Knowledge storage: `packages/workspace/src/knowledge-graph-storage.ts`
