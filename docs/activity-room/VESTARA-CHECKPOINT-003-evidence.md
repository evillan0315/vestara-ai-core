---
title: VESTARA-CHECKPOINT-003 - Activity Room Coordination and Edit Inspection
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-24
next-review: 2026-10-24
---

# VESTARA-CHECKPOINT-003 - Activity Room Coordination and Edit Inspection

**Scope**: AR-COORD-001 through AR-COORD-002, AR-COORD-HUMAN-WAIT-001,
AR-TOOL-STATUS-002, and AR-TOOL-EDIT-001 through AR-TOOL-EDIT-001E.

## Delivered authority and correlation

Activity Room remains a projection/control surface. Execution, workflow,
routing, Conversation Runtime, interaction persistence, agent registry, and
Evidence retain their respective authority. No second event bus or parallel
tool-observation store was introduced.

The edit inspection path is:

```text
OpenCode message.part.updated
  -> part.callID = call-330d56ae-70b2-4179-8af2-d79c8f33567d
  -> state.input.filePath + same-part state.metadata.filediff.patch
  -> assistant.execution.v1 EditExecutionDetail
  -> Conversation ToolObservation (observationKind: edit)
  -> M9/M10/M11 correlated operation
  -> Activity Files drawer
```

The Activity resolver requires the authoritative `conversationId` and exact
operation `callID`. It does not match by timing, display text, path,
proximity, or actor name. Missing authoritative diff data keeps the file
action available but does not fabricate a diff.

## Delivered UI behavior

- Correlated routine tool operations remain grouped beneath the parent
  Activity message.
- An edit with authoritative diff data exposes one `Inspect edit` action.
- Inspecting opens the persistent Activity Files drawer with separate
  `Edit diff - read-only` and `Current file` views.
- The historical diff is observational only; it has no Save, Revert, Apply,
  or execution action.
- An edit without authoritative diff data exposes `Open file` only.
- Structured human-decision waits remain first-class and retain their shared
  interaction identity through projection and replay.

## Verification evidence

Automated evidence for this checkpoint includes focused API, Conversation,
Activity projection, workflow interaction, correlation, edit-resolution, and
workspace UI tests, plus the targeted workspace Vite build. `git diff --check`
was clean at checkpoint preparation.

Live dogfood reported by Eddie after a full Activity Room page refresh:

1. Existing Activity edit still offered `Inspect edit`.
2. The Files drawer opened while Activity Room remained visible.
3. The historical read-only diff and current README were separate views.
4. The behavior survived the full-page refresh.

The screenshot/live UI observation proves reload and presentation behavior. A
service label such as port `3000` is not treated as proof of isolated
production code, production data, or production deployment. Runtime claims
remain scoped to the observed local dogfood environment.

## Remaining gaps

- Participant status vocabulary remains derived presentation, not a new
  canonical runtime lifecycle.
- Composer agent-selector and Composer Event Inspector milestones remain
  later work.
- Execution page and live-browser integration remain later work.
- Historical records lacking safe lineage remain ungrouped/uncorrelated.
- Provider/model execution provenance is only claimed where authoritative
  runtime identifiers are present.
