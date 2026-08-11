# Phase 1 — Agent Control CRUD Test Foundation (report)

Scope per the phased plan: loading, list/detail views, create, read, update,
delete, validation, duplicate protection, empty/loading/error states, refresh
persistence, API contract, and persistence through the API + registry + audit.

## Files changed (this phase)

| Path | Change |
|---|---|
| `apps/api/src/routes/agents.ts` | **Reconciled Phase 1 WIP**: kept duplicate-id 409, `id`/`name` trim, PUT/DELETE `requireRole('editor')`, `AGENT_UPDATE`/`AGENT_DELETE` audit; **reverted held domain rules** (name uniqueness, name ≤ 200, id ≤ 100, create-time `status`); removed unused `actorOf` import |
| `apps/api/src/audit-log.ts` | `AGENT_UPDATE` / `AGENT_DELETE` actions (kept) |
| `apps/workspace/src/pages/Agents.tsx` | **Fix**: `saveAgent`/`toggleAgentStatus`/`deleteAgent` now route through `apiFetch` (checks `res.ok`) instead of raw `fetch` — previously a failed mutation showed a success toast (false-success bug) |
| `apps/api/__tests__/agent-crud-routes.test.ts` | New — 9 API contract tests |
| `apps/workspace/__tests__/agent-control-page.test.tsx` | New — 5 page component tests |
| `apps/workspace/docs/agent-control-testing/GAP-ANALYSIS.md` | Updated (AC-TST-002 status) |

## Tests added

**API contract** (`agent-crud-routes.test.ts`, real `AgentStorage` on in-memory sql.js):
1. create → persists → list/detail reflect → `agent.create` audit
2. name required (400), whitespace trimmed
3. duplicate id → 409, original not overwritten (data integrity)
4. duplicate names currently allowed (documents HELD rule, not final)
5. update → persisted + `agent.update` audit
6. empty-name update 400; missing agent 404
7. delete → catalog reflects + `agent.delete` audit
8. missing detail → 404
9. role matrix: viewer denied mutations (403), reads allowed; editor allowed

**Component** (`agent-control-page.test.tsx`, jsdom + RTL):
1. catalog renders registered agents in role slots
2. empty state via non-matching search
3. create posts the registry payload + success toast
4. persisted agent renders on a fresh load (refresh persistence)
5. failed save surfaces an error toast

Result: **9 + 5 = 14 tests, all passing.**

## Production gaps discovered + fixed

1. **False-success on failed mutations** (page `saveAgent`/`toggleAgentStatus`/`deleteAgent`
   ignored `res.ok`) — a 500 create showed a "registered" success toast and
   reloaded. Fixed by routing through `apiFetch` (throws on non-OK). This was
   demonstrably incorrect (a failed save was reported as success), so the fix is
   justified per the implementation rules.
2. **Duplicate agent id silently overwrote** (`INSERT OR REPLACE`) — 409 now.
3. **PUT/DELETE had no role guard** (inconsistent with POST) — `requireRole` added.
4. **No update/delete audit** — `AGENT_UPDATE`/`AGENT_DELETE` added.

## Held (NOT finalized)

- Globally-unique agent names, name ≤ 200, id ≤ 100, create-time
  enabled/disabled policy — reverted from the WIP; documented as open domain
  decisions. Duplicate-name behavior (allowed) is tested as *current behavior*,
  not a rule.

## Verification

- `pnpm build` — 95 projects ✓
- `pnpm dependencies:check` ✓
- `pnpm docs:validate` — exit 0 ✓
- `pnpm lint:check` — changed paths clean; baseline findings in pre-existing
  files (`runtime-provider.ts`, `agent-storage.ts`, marketplace/workflow tests,
  docs proposal) — earlier reports undercounted these due to biome's
  max-diagnostics truncation
- `pnpm test` — 2020 passed / 3 failed. Failures are environmental/pre-existing:
  - 2 `opencode-runtime` config tests (OPENCODE_SERVER_* set in this shell)
  - 1 `onboarding-lab` "module loads" — passes in isolation; fails only in the
    full run (test-pollution flakiness, unrelated to this phase)

## Remaining risks

- **In-place list refresh after create** is not observable in jsdom (the
  registry modal stays open after save; the slot list update is masked by the
  overlay/portal). The refresh contract is instead proven via the API tests
  (create → GET reflects) and a fresh-load component test. Worth a manual
  check in the running app.
- `apps/workspace/__tests__/agent-registry-modal.test.tsx` (user's untracked
  WIP) has 1 pre-existing failing test ("sources workspace-agent providers and
  models from the OpenCode runtime") — fails in isolation, untouched by this
  phase.
- Authz fix verified under the local-auth model (unauthenticated → admin); the
  viewer-denied path is proven via Bearer tokens. The unauthenticated-admin
  default itself is deliberate local behavior and unchanged.
