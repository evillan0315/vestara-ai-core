# UX-010 — Workspace UI

**User Experience Specification**

| Field | Value |
|-------|-------|
| ID | UX-010 |
| Capability | Workspace UI (PCS-010) |
| Status | Draft — M1 |

---

## Principles

1. **Engine is source of truth** — UI never fabricates sessions, agents, or approvals.
2. **Connection is visible** — always show API + WebSocket status.
3. **CLI parity** — same artifact language as the workspace REPL (session, plan, change set, verification).
4. **Dark operational chrome** — Vestara gold accent on near-black surfaces.

## Shell (M1)

```
┌──────────────────────────────────────────────────────────┐
│ Vestara Workspace          [API ●] [WS ●]   [User ▾]    │
├──────────┬───────────────────────────────────────────────┤
│ Dashboard│                                               │
│ Sessions │              Main content                     │
│ Artifacts│                                               │
│ Agents   │                                               │
│ Memory   │                                               │
└──────────┴───────────────────────────────────────────────┘
```

- Sidebar navigation for all core routes
- Top bar: product name, connection pills, auth placeholder
- Offline: amber/red pills; content shows “Connect the API gateway” empty state

## Auth placeholder (M1)

- Default identity: `local-operator` / role `owner`
- Login route accepts display name only (no real IdP)
- No secrets stored; token is a local stub header `X-Vestara-Actor`

## Connection states

| State | API pill | WS pill |
|-------|----------|---------|
| Connected | green | green |
| Degraded (API ok, WS down) | green | amber |
| Offline | red | red |

## Screen copy (empty)

- Dashboard: “No active sessions. Create one from Sessions or the CLI (`workspace create`).”
- Agents: “No agent telemetry yet.”
- Memory: “Index memory from the CLI (`memory index`) or wait for API data.”

## Errors

- Toast or inline alert on failed mutations
- Never block navigation on a single failed fetch
- 401/403 → return to auth placeholder with message

## Accessibility (baseline)

- Keyboard-reachable nav links
- Contrast on gold/green status against dark bg
- Focus rings on interactive controls
