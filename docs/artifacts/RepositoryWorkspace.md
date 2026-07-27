# RepositoryWorkspace Contract

**Version 1.0**

## Identity

- ID format: derived from `sha256(canonicalPath)` first 16 hex chars
- Namespace: none (single workspace per process)

## Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `identity` | RepositoryFingerprint | Git metadata + content hash |
| `analysis` | RepositoryProfile | Language, packages, entry points, risks, health score |

## Lifecycle

```
Idle → Discovering → Fingerprinting → Analyzing → Indexing → Presenting → Ready
```

## Persistence

- SQLite via sql.js (WASM)
- Path: `.vestara/knowledge/chunks.db`
- Manifest: `.vestara/workspace.json`
