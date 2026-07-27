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
pnpm --filter @vestara/api start
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

## M2+ (deferred)

| # | Action | Expected |
|---|--------|----------|
| 9 | Create session via API or CLI | Appears on Dashboard / Sessions |
| 10 | Open `/sessions/:id` | Timeline + participants from engine data |
| 11 | Approve via UI | Collaboration record updates; event on WS |
| 12 | Full lifecycle without CLI | Meets PCS-010 success criterion |

## Non-goals for M1

- Real OAuth / SSO
- Graph visualization
- Editing files in the browser
- Replacing the CLI
