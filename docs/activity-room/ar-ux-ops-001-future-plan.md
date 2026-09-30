---
title: AR-UX-OPS-001 — Shared Tool Detail, Runtime Controls & Planning Surface
version: 0.1.0
status: planned-future
owner: vestara
last-reviewed: 2026-09-27
next-review: 2026-10-27
---

# AR-UX-OPS-001 — Shared Tool Detail, Runtime Controls & Planning Surface

> **STATUS: PLANNED / FUTURE — NOT IMPLEMENTATION-AUTHORIZED.**
> Planning / design-lineage capture only. No implementation, mutation, UI change,
> restart, codegen, or delegation is authorized by this record.
> Activation requires explicit authorization by Eddie.

## A. Milestone identity and status

- **ID:** AR-UX-OPS-001
- **Title:** Activity Room Shared Tool Detail, Runtime Controls & Planning Surface
- **Status:** PLANNED / FUTURE (roadmap-governance stage: Proposed — problem identified, not reviewed)
- **Type:** Future Activity Room UX/operations milestone (design-lineage, not current-system)
- **Workstreams:**
  1. Shared tool-call detail presentation
  2. Governed runtime/service controls (replacing duplicate Activity Metrics)
  3. Plans / Milestones / Tasks right-panel surface (replacing Recent Operations)
- **Sequencing invariant:** AR-UX-OPS-001 MUST NOT interrupt the active Engineering Graph
  sequence: AR-INVENTORY-002A → 002G-EVIDENCE-01 + 002G-DESIGN → 002G-CONTRACT →
  002G implementation/tests → reconciliation gate → 002B materialization.
  This milestone remains future work until explicitly activated.

## B. Motivation / current observations

- The Assistant surface presents tool calls (e.g. `Read observer.ts`,
  `packages/observer/src/observer.ts`, Lines 1–314) as collapsible detail with
  inline content when expanded. This interaction is useful and a candidate
  reusable presentation primitive.
- The Activity Room right panel currently carries **Activity Metrics**
  (total events, participants, active agents) that substantially duplicate the
  header/status, participant surfaces, and activity/event counts.
- The right panel also carries a **Recent Operations** list duplicating execution/
  activity information already represented elsewhere in the room.
- Right-panel space may provide more value as (a) an operational control surface
  and (b) a future-oriented planning projection — reducing duplication while
  improving operational usefulness.

## C. Workstream 1 — Shared Tool Detail

- **Target principle:** one tool observation, one reusable presentation contract,
  multiple presentation surfaces.
- **Direction:** Authoritative Tool Observation → Shared Tool Detail Model →
  Assistant + Activity Room presentations.
- On activation: audit Assistant tool-call implementation (components, props/
  contracts, observation source, expand/collapse state, Read/Edit/Write/Shell
  rendering, file/path handling, Open/View actions, runtime assumptions, AR
  dependencies); audit Activity Room tool-operation presentation end-to-end
  (observation → projection → grouping → renderer → actions); then determine
  whether the surfaces can share the same component, lower-level primitives,
  or only a common tool-detail contract.
- **Constraint:** reuse must be established by audit, not assumed from visual
  similarity. Read, Edit/diff, Write, Shell/terminal, and artifact tool types
  must be evaluated separately — one generic visual may not fit all semantics.

## D. Workstream 2 — Governed Runtime Controls

- **Target:** replace the duplicate Activity Metrics panel with a governed
  runtime/service control surface (illustrative names only, pending audit):
  Vestara API / OpenCode / Codex — each with status (Running/Stopped) and
  Start / Stop / Restart actions.
- **Architecture (mandatory on activation):** UI Control → Governed System
  Action → Permission/Authority Check → Service-Control Capability →
  Runtime/systemd Adapter → Result → Activity/Evidence/Verification.
- Raw shell/systemctl buttons in UI are forbidden.
- **Boundary:** Confirmation ≠ Permission ≠ Authority. Confirmation protects
  human intent; it does not grant system authority.

## E. Workstream 3 — Plans / Milestones / Tasks Surface

- **Concept (illustrative, model NOT frozen):** PLANS & MILESTONES panel with
  expandable milestones revealing tasks, e.g. Engineering Graph AR-INVENTORY-002G
  (In progress), Activity Room UX AR-UX-OPS-001 (Planned), Standalone Packaging
  (Planned), Observer Runtime Integration (Future).
- The panel must project canonical planning state; it must NOT become its own
  planning authority (Plans panel ≠ Plan authority).
- Before any design freeze: audit existing Plan/Milestone/Task contracts, roadmap
  structures, Workflow planning state, DevelopmentPlan, persistence authorities,
  APIs, projections, Graph representations, and existing UI surfaces; classify
  reuse before proposing anything new. No hard-coded milestone lists as
  authoritative product state.

## F. File Browser / editor integration intent

- For file-backed operations (Read/Edit/Write), investigate Tool Detail →
  Open/View → File Browser Drawer → select file → existing Editor.
- No Activity-Room-specific file viewer unless an audit proves the existing
  File Browser/editor cannot satisfy the requirement.
- Preserve the drawer principle: opening a drawer reveals more of the room,
  not a navigation away.

## G. Confirmation / governance boundary

- Every mutating service action requires an explicit reusable confirmation
  interaction (e.g. "Restart Vestara API? … [Cancel] [Restart]").
- The confirmation primitive should be shared across API/OpenCode/Codex, and the
  future audit must establish whether an existing confirmation/decision/
  interaction primitive can be reused.
- Implementation (when authorized) must use the canonical design system:
  `@vestara/ui-tokens`, `@vestara/ui-theme`, existing reusable primitives,
  Tailwind v4 only through Vestara tokens, MUI/Material Icons and Framer Motion
  where appropriate. No inline CSS, no hardcoded arbitrary colors, no competing
  design-system classes. (Per `docs/governance/UI-UX-GOVERNANCE.md`.)

## H. Plan-authority boundary

- Activity Room projects authoritative state rather than inventing it.
- Missing backend capability is reported as a dependency/adjacent finding,
  never invented inside the UI (ARX-015 production boundary precedent).
- Current UI behavior ≠ canonical architecture.

## I. Candidate tasks (not authorized)

01. Audit Assistant tool-detail implementation.
02. Audit Activity Room tool-detail implementation.
03. Determine canonical reusable component boundary.
04. Connect eligible file-backed tool actions to File Browser drawer/editor.
05. Audit duplicate Activity Metrics and existing information ownership.
06. Audit runtime/service-control capabilities and authority boundaries.
07. Design governed Vestara API/OpenCode/Codex controls.
08. Audit/reuse canonical confirmation interaction.
09. Replace duplicate Activity Metrics with approved operational controls.
10. Audit Plan/Milestone/Task authorities across Vestara.
11. Design Plans/Milestones/Tasks projection for Activity Room.
12. Replace Recent Operations with planning projection.
13. Verify responsive behavior and drawer/right-panel composition.
14. Verify canonical Vestara design-token compliance.
15. Dogfood shared tool details.
16. Dogfood service-control confirmations.
17. Dogfood planning projection.
18. Collect evidence and perform final UX/architecture verification.

## J. Architectural invariants

- Interaction ≠ Presentation surface.
- One authoritative observation may have multiple presentation surfaces.
- Shared presentation ≠ shared authority.
- Opening a drawer reveals more of the room; never navigates away.
- Confirmation ≠ Permission ≠ Authority.
- Plans panel ≠ Plan authority.
- Activity Room projects authoritative state rather than inventing it.
- Current UI behavior ≠ canonical architecture.
- Reuse by audit, not by visual similarity.
- No inference/fallback may fabricate missing tool/file/plan/runtime identity.
- Activity Room Core stays domain-neutral/runtime-neutral where appropriate.
- Generality test: a future Core contract should still make sense if nobody in
  the room were writing software; otherwise it belongs in an extension or
  domain-specific presentation.

## K. Required future audits (activation gate)

1. Assistant tool-detail audit (§C-A).
2. Activity Room tool-operation presentation audit (§C-B).
3. Reusable-boundary determination with per-tool-type evaluation.
4. File Browser/editor capability audit (no parallel viewer without proof).
5. Activity Metrics duplication/ownership audit.
6. Runtime/service-control capability + permission/authority audit.
7. Confirmation/decision primitive reuse audit.
8. Plan/Milestone/Task authority audit across Vestara (contracts, persistence,
   APIs, projections, Graph, UI).
9. Design-token compliance verification (`pnpm vds:validate` + reviewer
   HARDCODE gate per UI-UX governance).
10. Responsive/drawer-composition verification.

## L. Explicit non-goals

- No implementation, UI change, service restart, or codegen under this record.
- No change to Activity Room current behavior.
- No change to the Engineering Graph sequence or its priorities.
- No new file viewer, no raw shell/systemctl buttons, no hard-coded milestone
  lists, no frozen Plan/Milestone/Task domain model.
- No generic `confidence >= threshold → eligible` workflow rule (per
  AR-INVENTORY-002G-CONTRACT §J boundary).
- No promotion of this design-lineage into current-system claims.

## M. Dependencies / sequencing

- **Blocked behind (must complete first):** AR-INVENTORY-002A → 002G chain →
  reconciliation gate → 002B materialization, unless Eddie explicitly reorders.
- **Consumes (read-only, when available):** canonical tool observation contracts,
  governed service-control capability, canonical planning projections, File
  Browser/editor, confirmation primitive, design tokens.
- **Produces:** no durable artifact until activated; on activation it must follow
  roadmap governance (PCS → UX → ATS before implementation).

## N. Acceptance criteria for eventually activating the milestone

- Eddie explicitly activates AR-UX-OPS-001.
- Engineering Graph sequence gate (§M) satisfied or explicitly waived.
- §K audits produced as evidence with reuse classifications.
- PCS/UX/ATS documents written and accepted per `docs/ROADMAP-GOVERNANCE.md`.
- Governed-action chain (§D) and authority boundaries (§G–H) approved.
- Exit criteria defined measurably before any development begins.

## O. Open questions / UNKNOWNs

- Actual runtime/service capabilities and authority model (names/actions in §D
  are illustrative).
- Whether Assistant and Activity Room share a component, primitives, or only a
  contract (§C-C outcome unknown until audit).
- Whether the existing File Browser/editor satisfies all file-backed tool types.
- Whether an existing confirmation primitive is reusable.
- Canonical Plan/Milestone/Task authorities and their projection shapes.
- Responsive/right-panel composition constraints with the new surfaces.
- Dogfood scope and evidence requirements for final verification.

---

## Information architecture intent (preserved)

```text
ACTIVITY ROOM
Header ............ current operational summary
Conversation/Activity  what is happening
Tool Details ...... what exactly happened
Drawers ........... deeper context (files, artifacts, execution details)
Right Panel
  Runtime Controls  what can I control?
  Plans/Milestones  what comes next?
```

*Captured 2026-09-27 as design-lineage. Current engineering priority unchanged.*
