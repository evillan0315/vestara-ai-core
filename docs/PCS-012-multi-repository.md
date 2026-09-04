---
title: PCS-012 — Multi-Repository Intelligence
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---


# PCS-012 — Multi-Repository Intelligence

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-012 |
| Name | Multi-Repository Intelligence |
| Version | 1.0 |
| Status | Implemented (v1.3) |

---

## Goal

Extend the knowledge graph and workspace model beyond a single repository to support organization-wide intelligence. An Organization owns multiple repositories, each with its own `RepositoryWorkspace` and `KnowledgeGraph`, with cross-linking for dependency discovery, pattern matching, and impact analysis.

## Artifact Model

```typescript
interface Organization {
  id: string;
  name: string;
  description: string;
  repositories: OrganizationRepository[];
  createdAt: string;
}

interface OrganizationRepository {
  id: string;
  path: string;
  name: string;
  lastIndexed: string | null;
}
```

## Capabilities

| Capability | Description |
|-----------|-------------|
| Cross-repo search | Search all indexed repositories simultaneously |
| Organization graph | View relationships across repositories |
| Impact analysis | Determine which repos are affected by a change |

## Commands

| Command | Description |
|---------|-------------|
| `org init <name>` | Create a new organization |
| `org add-repo <path>` | Add a repository to the organization |
| `org list-repos` | List all repositories |
| `org search <query>` | Search across all repositories |
| `org graph` | Show the organization knowledge graph |
| `org impact <repo>` | Show which repos depend on a given repo |

## Related Documents

- PCS-008: `docs/PCS-008-memory.md` (Knowledge Graph basis)
- PCS-009: `docs/PCS-009-engineering-session.md`
