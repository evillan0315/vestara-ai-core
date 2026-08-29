# ARX-015 — Activity Room Production UX Milestone

**Date:** 2026-08-29
**Status:** Approved — Planning Complete
**Architecture Review:** `docs/activity-room/arx-015-architecture-review.md` (Revision 2, frozen)
**Authoritative Repository:** `vestara-ai-core`
**Blueprint:** `vestara-blueprint/06-workspace/activity-room-production-ux-milestone.md`
**Scope:** Dedicated Activity Room Production UX milestone, explicitly separate from AR-P2 and constrained so none of the work changes Harness, Workflow, Orchestration, Agent execution, routing, or runtime semantics.

---

## Production Boundary (Frozen Invariant)

> **Activity Room may read authoritative Vestara state, compose presentation/read models, invoke already-supported configuration mutations, and submit messages through existing ingress.**
>
> **Activity Room MUST NOT change or reproduce Harness, Workflow, Orchestration, Agent execution, routing, runtime/session, governance, or authorization semantics.**
>
> **Missing backend capability is reported as a dependency or adjacent finding — not invented inside the UI.**

---

## Objective

Deliver a production-ready Activity Room experience that turns `/activity-v2` into a production collaboration surface where the user can see the real team, understand current activity, inspect/configure participants through existing authorities, choose a conversational target, and send messages into the existing Vestara execution path.

The architectural rule: **Activity Room observes and presents existing Vestara capabilities. It does not redefine how they execute.**

- No Harness behavior changes.
- No Workflow behavior changes.
- No Orchestration changes.
- No Agent execution changes.
- No runtime/session changes.
- No routing intelligence changes.
- No AR-P2 work.

---

## Capabilities

Authoritative Team grouping · Authoritative Agent/Human roster · Model/name-first conversational identity · Runtime status visualization · Active work counters · Latest activity previews · Participant tooltips · Reusable detailed participant Drawer · Supported Agent configuration editing · Provider -> Model dependent selection · Execution/task/activity inspection · Team/participant targeting in the composer · Responsive/realtime updates · Reconnect/resync correctness · Production performance and UX verification.

---

## Phases

| Phase | ID Range | Title | Batch |
|-------|----------|-------|-------|
| 0 | AR-UX-000..003 | Contract & Authority Audit | AR-UI-A |
| 1 | AR-UX-010..014 | Team Roster Read Model | AR-UI-A |
| 2 | AR-UX-020..025 | Production Team Rail | AR-UI-A |
| 3 | AR-UX-030..034 | Operational Status & Presence | AR-UI-B |
| 4 | AR-UX-040..043 | Active Work Counters | AR-UI-B |
| 5 | AR-UX-050..054 | Last Activity Preview | AR-UI-B |
| 6 | AR-UX-060..062 | Participant Hover Experience | AR-UI-B |
| 7 | AR-UX-070..072 | Reusable Participant Drawer | AR-UI-C |
| 8 | AR-UX-080..085 | Agent Overview & Editing | AR-UI-C |
| 9 | AR-UX-090..094 | Provider -> Model Relationship | AR-UI-C |
| 10 | AR-UX-100..103 | Work Tab | AR-UI-C |
| 11 | AR-UX-110..113 | Access Tab | AR-UI-C |
| 12 | AR-UX-120..123 | Activity Tab | AR-UI-C |
| 13 | AR-UX-130..132 | Human Participant Drawer | AR-UI-C |
| 14 | AR-UX-140..146 | Composer Targeting | AR-UI-D |
| 15 | AR-UX-150..155 | Realtime Roster Synchronization | AR-UI-D |
| 16 | AR-UX-160..163 | Activity Stream Integration | AR-UI-D |
| 17 | AR-UX-170..175 | Responsive & Interaction Polish | AR-UI-E |
| 18 | AR-UX-180..185 | Performance Hardening | AR-UI-E |
| 19 | AR-UX-190..199 | Production Verification | AR-UI-E |
| 20 | — | Production Certification | AR-UI-E |

---

## Implementation Batches

| Batch | Phases | Goal | Checkpoint |
|-------|--------|------|------------|
| **AR-UI-A** | 0–2 | Authoritative Team roster | Team roster is data-driven, survives restart, no hardcoded names |
| **AR-UI-B** | 3–6 | Presence, work counters, activity, tooltip | Status/counters/activity accurate, tooltip accessible |
| **AR-UI-C** | 7–13 | Reusable Participant Drawer | Drawer opens for any participant, Agent edit persists, Work/Access/Activity tabs functional |
| **AR-UI-D** | 14–16 | Composer targeting + realtime integration | Target selector works, messages enter existing ingress, reconnect/resync correct |
| **AR-UI-E** | 17–20 | UX polish, performance, verification, certification | Production-ready: correct, resilient, performant, architecturally clean, usable |

Each batch must be implemented, evidenced, reviewed and frozen before the next authorization.

---

## Authority Map

| Data | Authority | Read/Write |
|------|-----------|------------|
| Teams | Team service / `/api/teams` | Read |
| Team membership | Team authority | Read |
| Agent configuration | Agent service / `/api/agents` | Read + Config mutation via existing API |
| Agent role | Agent configuration | Read |
| Agent color | Agent configuration | Read + Config mutation via existing API |
| Provider | Provider authority | Read |
| Model | Model authority | Read |
| Runtime status | Existing Harness/execution state | Read |
| Active executions | Existing execution capability | Read |
| Activity history | Activity Room/M9/M10/current activity authority | Read |
| Human identity | Existing conversation/user identity | Read |
| Message ingress | Existing Activity Room/conversation ingress | Write (via existing ingress only) |

---

## Identity Contract

```text
participantId    — unique participant in the room
agentId          — which agent (canonical ID from agent registry)
humanId          — which human (canonical ID from user store)
teamId           — which team (canonical ID from team service)
role             — semantic data (developer, planner, reviewer, verifier)
displayName      — human-readable name
modelId          — resolved model identifier
modelDisplayName — human-readable model name
providerId       — resolved provider identifier
runtime status   — existing execution state (working, available, failed, offline)
executionId      — which execution (canonical unit of work)
```

Invariant: `role ≠ color ≠ model ≠ participant identity`

---

## Backend Dependencies

| Backend Milestone | UX Dependency |
|-------------------|---------------|
| M1 (Identity) | AR-UX-002 identity contract |
| M2 (Event Contract) | AR-UX-030 status derivation |
| M3 (Execution Policy) | AR-UX-110 Access tab |
| M4 (AI Binding) | AR-UX-090 Provider/Model |
| M5 (Repository) | AR-UX-100 Work tab |
| M6 (OpenCode Client) | AR-UX-080 Agent overview |
| M7 (Session Continuity) | AR-UX-150 Realtime sync |
| M8 (Workflow Run) | AR-UX-040 Work counters |
| M9 (Durable Activity Room) | AR-UX-120 Activity tab |
| M10 (Projection & Attention) | AR-UX-050 Last activity |
| M11 (Activity Room API) | AR-UX-140 Composer targeting |

---

## Exit Criteria

| Dimension | Requirement |
|-----------|-------------|
| **Correctness** | Team, Agent, execution and activity information correspond to authoritative sources |
| **Resilience** | Refresh, restart, reconnect, empty state, partial API failure and stale data handled |
| **Performance** | Bounded startup/render/event/memory behavior has evidence |
| **Architecture** | Zero hardcoded domain config, zero modifications to Harness/Workflow/Orchestration/Agent execution semantics |
| **Human usability** | Can sit in Activity Room and operate Vestara without developer tools |

---

## Final Human Acceptance Scenario

```text
Open Vestara
     ↓
Activity Room
     ↓
See Engineering Team
     ↓
See Mimo working
     ↓
Hover Mimo
     ↓
Inspect Mimo
     ↓
See current work
     ↓
Close Drawer
     ↓
To: Engineering Team
     ↓
"Install agent control"
     ↓
Send
     ↓
Existing Vestara execution path takes over
```

If that works reliably, we've crossed an important threshold.

---

## Relationship to Backend ARX-015

This UX milestone consumes APIs produced by ARX-015 backend milestones (M1–M11). It does not depend on M12–M16 (Contextual Assistant, Analytics, Native Agent distinction, Telegram, Browser). The UX milestone is deliberately sequenced after M11 (Activity Room API & UI) and operates within the read/write boundary established by those backend milestones.

---

## What's Next

After this milestone passes production certification:

- Stop calling Activity Room "M11C" — it becomes simply **Activity Room**
- Production Deployment & Monitoring (observability, error tracking, user analytics)
- Community Feedback Integration (usage patterns, pain points, feature requests)
- Performance Optimization at Scale (large team sizes, high-frequency events)
