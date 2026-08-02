---
id: "adr-010"
adr: "ADR-010"
title: "Dashboard Runtime as a Client of Kernel"
category: "implementation"
version: 1.0
date: "2026-08-03"
status: "accepted"
owner: "@chief-architect"
last-reviewed: "2026-08-03"
next-review: "2026-11-03"
author: "@chief-architect"
deciders: ["@chief-architect", "@engineering-manager"]
tags: ["dashboard", "widgets", "kernel", "composition", "boot", "ui"]
referenced_by:
  - type: "blueprint"
    target: "00-governance/04-decision-log.md (ADR-021 Widget Manifest System & Dashboard Runtime, ADR-030 Kernel Architecture)"
  - type: "runtime"
    target: "@vestara/widget-runtime"
  - type: "runtime"
    target: "@vestara/kernel"
influences:
  - "Frontend Engineer"
---

# ADR-010 — Dashboard Runtime as a Client of Kernel

## Context

The Blueprint decision ADR-021 defines the Widget Manifest System and a
Dashboard Runtime that interprets manifests, manages layout state, and provides
lifecycle hooks. ADR-030 defines the Kernel as the composition root that owns
lifecycle, shared infrastructure (EventBus, logging, metrics, health), and the
service dependency graph.

`@vestara/widget-runtime` shipped `DashboardRuntime` and
`WidgetLifecycleManager` as a standalone, self-contained package: callers had to
construct it and pass an `eventBus`/`logger`/`lifecycleManager` manually. It was
not a client of the Kernel — it did not consume the kernel's shared
infrastructure or participate in the boot composition.

## Decision

Compose the Dashboard Runtime into the Kernel so the dashboard is a **client of
the Kernel** rather than a standalone service:

- The kernel exposes `dashboardRuntime: DashboardRuntime` on the
  `VestaraKernel` interface, constructed at boot (Step 12g) from the kernel's
  own `EventBus` and `Logger` — the same shared infrastructure every other
  composed service uses.
- Widget manifests are supplied via `BootOptions.widgets` and registered into
  the dashboard client during boot (Step 13b), honoring per-widget priority and
  location ordering.
- The kernel owns the `WidgetLifecycleManager`; lifecycle state transitions
  emit `widget:lifecycle` events on the kernel event bus, making dashboard
  activity observable to the same consumers (health, metrics, engineering
  events) as every other subsystem.

Embedding hosts (the Workspace UI, desktop shell) mount widgets into their
containers via the kernel's `dashboardRuntime`; the kernel remains the
composition root and does not itself mount DOM.

## Alternatives Considered

- **Keep DashboardRuntime standalone** — rejected: it duplicates the
  event-bus/logger wiring every other composed service uses and bypasses the
  kernel as the single composition root (ADR-030).
- **Rebuild DashboardRuntime with new features (persistence, role-based
  layouts, data-source wiring)** — deferred: v9.0's scope is *composition*
  ("Dashboard as a client of Kernel"); feature work belongs to a later
  iteration.

## Trade-offs

- The kernel now composes one more client, slightly increasing boot surface.
- Widget *mounting* still requires a host with DOM access; the kernel exposes
  the runtime but does not render.
- Layout is in-memory for this slice; persisted layouts remain future work.

## Consequences

- Dashboard hosts consume a single, kernel-owned `dashboardRuntime` built from
  shared infrastructure.
- Widget manifests participate in the boot composition and are observable via
  `widget:lifecycle` events.
- `@vestara/widget-runtime` remains the implementation; the kernel is now its
  canonical consumer.

---

- Supersedes: none
- Dependencies: `@vestara/widget-runtime`
- Implements (blueprint): ADR-021, ADR-030, `00-governance/07-ai-operating-system-architecture.md`