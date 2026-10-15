---
id: "adr-108"
adr: "ADR-108"
title: "Visual Evidence and Screenshot Verification"
category: "implementation"
version: 1.0
date: "2026-08-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect", "@qa-engineer"]
consulted: ["@frontend-engineer", "@devops-engineer"]
informed: ["@team"]
tags: ["visual", "screenshot", "playwright", "verification"]
referenced_by:
  - type: "blueprint"
    target: "14-engineering/visual-verification.md"
  - type: "runtime"
    target: "VisualRegression"
---

## Context

UI changes regress silently without a committed baseline. The workspace needs
automated visual verification with approved baselines, diffs, and CI gating.

## Decision

Adopt Playwright-based screenshot regression as the Visual Evidence baseline:
route discovery from the app's single source of truth (`src/routes.ts`),
configurable viewport + theme matrices, baseline approval via
`screenshots:update`, pixel-level comparison (pixelmatch/pngjs), and HTML/JSON/
Markdown reports that gate CI. Broader Visual Evidence (interaction walkthrough,
console/network error capture, accessibility checks, video) is proposed.

## Consequences

### Positive
- Catches visual regressions; baselines are committed and auditable.
- Deterministic naming; route manifests auto-extend coverage.

### Negative
- Baselines drift across environments (fonts/OS).
- Network-idle is disabled by default (dev websockets/HMR).

### Risks
- Stale baselines (risk; mitigation: `screenshots:update` workflow).

## Alternatives Considered
| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| Cypress visual tests | mature | adds a second tool | rejected (Playwright only) |
| Storybook snapshots | component-scoped | not page-level | deferred |

## Implementation Notes
- Migration required? No.
- Implemented and verified (subset of routes × viewports × themes).
