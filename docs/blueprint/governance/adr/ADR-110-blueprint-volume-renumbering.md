---
id: "adr-110"
adr: "ADR-110"
title: "Blueprint Volume Renumbering"
category: "standard"
version: 1.0
date: "2026-08-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@documentation-engineer"]
informed: ["@team"]
tags: ["blueprint", "volumes", "navigation"]
referenced_by:
  - type: "blueprint"
    target: "99-appendix/implementation-alignment.md"
---

## Context

The Blueprint uses duplicate volume numbers: `13-design-system` and
`13-user-experience` both use `13`; `14-conversation` and `14-engineering`
both use `14`. Duplicate volume identifiers break navigation and validation.

## Decision

Renumber the duplicate volumes to free identifiers, performed atomically by a
migration script:

- `13-user-experience` → `22-user-experience`
- `14-conversation` → `23-conversation`

`13-design-system` and `14-engineering` keep their numbers. All `volume:`
frontmatter values and all internal links referencing the old paths are
rewritten in the same migration; the README structure is updated. A validation
run confirms no duplicate volume numbers or broken links remain.

## Consequences

### Positive
- Unique volume identifiers; validation passes; navigation is unambiguous.

### Negative
- External links to old volume paths break (mitigation: record the migration in
  this ADR; old paths are searchable).

### Risks
- Missed references (risk; mitigation: validator checks all links).

## Alternatives Considered
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Leave duplicates | no churn | broken validation | rejected |
| Merge small volumes | fewer dirs | content decisions | rejected (lossless rename) |

## Implementation Notes
- Migration required? Yes (script-driven).
- Breaking changes? Internal only; documented.
