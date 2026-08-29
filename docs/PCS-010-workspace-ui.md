# PCS-010 — Workspace UI

**Product Capability Specification**

| Field | Value |
|-------|-------|
| ID | PCS-010 |
| Name | Workspace UI |
| Application | `apps/workspace` (+ `apps/api` gateway) |
| Version | 1.1 |
| Status | In progress — Milestone 1 (Workspace Shell) |

---

## Goal

First graphical client for the Vestara Engineering Workspace. Expose the v1.0 operating model through a controlled, observable, human-centered interface — without adding intelligence to the UI layer.

## Core invariant

```
Workspace UI consumes Vestara.
Workspace UI does not become Vestara.
```

No business logic in the UI. Reasoning, planning, execution, and governance stay in the engine. The CLI remains a first-class client.

## Target architecture

```
                    Users
                      |
        +-------------+-------------+
        |                           |
        v                           v
   apps/cli                    apps/workspace
   CLI Client                  Web Client
        |                           |
        +-------------+-------------+
                      |
                      v
              apps/api  (HTTP + WebSocket)
                      |
                      v
            Workspace Runtime / storages
                      |
        +-------------+-------------+
        |             |             |
   Artifacts      Agents       Events
        |
        v
   SQLite / Knowledge Graph (.vestara/)
```

## Consumes

| Surface | Source |
|---------|--------|
| WorkspaceRuntime | `@vestara/workspace` via API |
| Workspace events | `@vestara/events` over WebSocket |
| Artifact APIs | REST `/api/artifacts`, `/api/sessions/:id` |
| Agent APIs | REST `/api/agents` |
| Memory APIs | REST `/api/memory` |
| Collaboration APIs | REST `/api/approvals`, collab routes |

## Produces

- Human interactions (navigate, query, command)
- Approvals and review decisions
- Session create / run requests
- Live observation of agent and artifact state

## Transient notification policy

The UI may derive transient toast presentation from workspace events, but it
must not create a second notification domain or persistence model. The toast
host displays one item at a time, bounds its queue to five, preserves the active
item, prioritizes waiting errors, and collapses identical type/message events
received within three seconds. Persistent history, read state, categories, and
pagination remain owned by the notification service and API.

## Technology

| Layer | Choice |
|-------|--------|
| UI app | React 19, Vite 6, TypeScript, MUI v6+, Tailwind CSS v4, React Router 7 |
| Event contract | `packages/events` (`@vestara/events`) |
| Gateway | `apps/api` — HTTP REST + WebSocket on port 3001 |
| Engine | Unchanged packages under `packages/workspace` |

## Screens

| Route | Screen | Milestone |
|-------|--------|-----------|
| `/` → `/dashboard` | Engineering Dashboard | M2 |
| `/sessions` | Session list | M2 |
| `/sessions/:id` | Session workspace (primary surface) | M2 |
| `/artifacts` | Artifact explorer / chain | M2 |
| `/agents` | Agent monitor | M4 |
| `/memory` | Knowledge graph (list/search first) | M2 |
| `/login` | Auth placeholder | M1 |

## Event architecture

Contract: `@vestara/events` → `WorkspaceEvent`.

Wire flow:

```
Agent / Session services → EventBus → apps/api WebSocket gateway → React client
```

Canonical types (non-exhaustive):

```
session.created | session.updated
agent.started | agent.completed
changeset.created
verification.completed
approval.requested | approval.granted
artifact.created
```

## Milestones

### M1 — Workspace Shell (current)

- React app scaffold, routing, Vestara theme (MUI + Tailwind)
- Auth placeholder
- API client + WebSocket client with connection status
- `apps/api` gateway boot + health + event fan-out
- Navigation shell; screens may show empty/loading until M2 data wiring

### M2 — Artifact visualization

- Dashboard, session list/detail, artifact timeline
- Change set + verification viewers

### M3 — Human governance

- Approval UI, comments, review status, collab history

### M4 — Agent operations

- Agent dashboard, task monitoring, execution logs, permissions

## Success criterion

A human completes the full lifecycle without the CLI:

```
Create Session → Review Plan → Approve Execution →
Monitor Agent → Review Verification → Approve Completion
```

while `pnpm vestara` CLI paths continue to work unchanged.

## Failure modes

| Failure | UI behavior |
|---------|-------------|
| API down | Connection badge offline; pages show retry, no invented engine state |
| WS drop | Auto-reconnect; last REST snapshot remains until refresh |
| Auth missing | Placeholder identity; no silent privilege escalation |
| Empty workspace | Empty states, not mock business data presented as live |

## Related

- PCS-009 engineering session
- UX-010, ATS-010
- Engine: `packages/workspace/src/index.ts`
- Events: `packages/events`
- Gateway: `apps/api`
