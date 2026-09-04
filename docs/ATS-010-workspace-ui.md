---
title: ATS-010 — Workspace UI
version: 1.0.0
status: approved
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# ATS-010 — Workspace UI

**Acceptance Test Specification**

| Field | Value |
|-------|-------|
| ID | ATS-010 |
| Capability | Workspace UI |
| Status | Draft — M1 |

---

## Prerequisites

```bash
cd vestara-ai-core
pnpm install
bash build-order.sh
# terminal A
pnpm --filter @vestara/api dev
# terminal B
pnpm --filter @vestara/workspace-ui dev
```

Optional engine data: `pnpm vestara open .` then create a session via CLI.

---

## M1 — Workspace Shell

| # | Action | Expected |
|---|--------|----------|
| 1 | Open `http://localhost:5173` | Shell loads; sidebar + top bar visible |
| 2 | API running | API pill green; `GET /api/health` returns ok |
| 3 | WS connected | WS pill green within 3s |
| 4 | Stop API | Pills go red/amber; UI does not crash |
| 5 | Restart API | Pills recover without full page reload (or after soft reconnect) |
| 6 | Visit `/login`, set name | Header shows chosen actor |
| 7 | Navigate all routes | Routes resolve; no white screen |
| 8 | CLI `pnpm vestara doctor` | Still healthy (UI does not break engine) |

## Notification presentation

| # | Action | Expected |
|---|--------|----------|
| 9 | Emit several distinct notification events in one burst | One toast is visible; remaining notifications are queued in arrival order |
| 10 | Emit the same type/message repeatedly within three seconds | One toast remains and its repetition count increases |
| 11 | Queue an error behind an active informational toast | Active toast is not interrupted; error becomes the next visible toast |
| 12 | Allow the active toast to expire or dismiss it | Exactly one queued toast advances and receives a full five-second display window |
| 13 | Queue more than five transient notifications | Queue remains bounded to five entries and the UI does not stack or overflow |

Automated policy coverage lives in
`apps/workspace/__tests__/toast-queue.test.ts`. Vitest excludes only the
Playwright entrypoint (`tests/visual/visual.spec.ts`); visual-framework unit
tests remain part of the workspace test command.

## M2+ (deferred)

| # | Action | Expected |
|---|--------|----------|
| 14 | Create session via API or CLI | Appears on Dashboard / Sessions |
| 15 | Open `/sessions/:id` | Timeline + participants from engine data |
| 16 | Approve via UI | Collaboration record updates; event on WS |
| 17 | Full lifecycle without CLI | Meets PCS-010 success criterion |

## Non-goals for M1

- Real OAuth / SSO
- Graph visualization
- Editing files in the browser
- Replacing the CLI
