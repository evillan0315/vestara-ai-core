---
title: Data Model
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Data Model

## ExplainResult

```typescript
interface ExplainResult {
  target: string;
  content: string;
  source: 'deterministic' | 'knowledge' | 'ai';
  duration: number;
}
```

## Supported Targets

| Target | Example | What it explains |
|--------|---------|-----------------|
| `architecture` | `explain architecture` | Language, framework, packages, entry points, risks |
| `<module-path>` | `explain packages/kernel` | Module purpose, entry points, containing package |
| `<package-name>` | `explain @vestara/workspace` | Dependencies, dependents, metadata |
| `dependencies` | `explain dependencies` | All packages with dependency counts |
| `risks` | `explain risks` | All detected risks with severity |
