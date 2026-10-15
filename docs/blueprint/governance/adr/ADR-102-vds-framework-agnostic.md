---
id: "adr-102"
adr: "ADR-102"
title: "Framework-Agnostic Design System (VDS)"
category: "foundation"
version: 1.0
date: "2025-07-30"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@frontend-engineer", "@ai-engineer"]
informed: ["@team"]
tags: ["vds", "design-system", "architecture", "frontend"]
depends_on: []
referenced_by:
  - type: "blueprint"
    target: "13-design-system/README.md"
  - type: "blueprint"
    target: "13-design-system/14-design-tokens.md"
influences:
  - "Frontend Engineer"
  - "UI Designer"
  - "Workspace UI"
  - "Mobile Engineer"
---

## Context

Design systems in most projects are coupled to a specific UI framework (React components, SwiftUI views, Compose functions). This creates a problem as the platform expands: every new surface requires reimplementing the design system in a new framework, and the visual contract is implicit in code rather than explicit in a specification.

Vestara targets multiple surfaces now (React workspace, CLI TUI) and may target more in the future (native desktop, mobile, automotive, web components). A framework-coupled design system would fragment the visual language across implementations.

## Decision

Define the Vestara Design System (VDS) as a **framework-agnostic specification** — not a React component library. VDS specifies:

- Visual tokens (color, type, spacing, motion) as platform-independent values
- Component anatomy and behavior without implementation code
- Layout and grid rules without assuming a rendering engine
- Accessibility requirements as pass/fail criteria, not library features

Each platform implements VDS independently using its native framework. The specification is the source of truth; no implementation owns the design system.

## Consequences

### Positive

- Every surface inherits the same visual language without code sharing
- New platform targets implement VDS from the spec, not by porting React code
- Design decisions are documented explicitly, not hidden in component implementations
- The design system survives framework migrations (React → Solid, MUI → Radix, etc.)
- Multiple implementations can diverge where appropriate while maintaining visual consistency

### Negative

- No single shared component implementation — each platform builds its own
- Spec-driven design requires discipline to keep the spec in sync with implementations
- Initial development is slower than using a framework-specific design system

### Risks

- Spec and implementations may drift (mitigation: automated token comparison between spec values and platform CSS custom properties)
- Platform teams may interpret the spec differently (mitigation: VDS conformance tests per platform)

## Alternatives Considered

| Alternative | Pros | Cons | Why Rejected |
|-------------|------|------|--------------|
| React component library (MUI theme) | Fast initial build | Coupled to React; every new surface re-implements from scratch; design decisions hidden in JSX | Violates multi-surface requirement |
| CSS custom properties only | Framework-agnostic tokens | No component anatomy spec; no behavior specification | Tokens alone are insufficient |
| Copy-paste between frameworks | No upfront cost | Guaranteed drift; no single source of truth | Unsustainable at platform scale |

## Implementation Notes

- Migration required? No — VDS is new
- Breaking changes? N/A
- Timeline: VDS volume created in Blueprint 2.0; platform implementations follow

## Related

- `13-design-system/README.md` — VDS volume overview
- `13-design-system/14-design-tokens.md` — Token taxonomy and distribution
- Blueprint volume: `13-design-system/`
