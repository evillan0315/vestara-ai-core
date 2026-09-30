# AR-SNAPSHOT-002A — Independent Acceptance Review (Muse)

Status: AUDIT ONLY. Zero production mutation. No source, test, database,
service, browser, or OpenCode state modified. No API restart, no stream
reconnect, no reload/refresh, no staging/commit/push. Read-only inspection +
bounded non-mutating verification (build, vitest, biome, dependencies:check,
git diff --check) only.

Auditor: Muse Spark. Date: 2026-09-26 (UTC).

## 1. Executive verdict

**ACCEPT_FOR_DEPLOYMENT**

All three blockers from `docs/audits/AR-SNAPSHOT-002-CODEX-REVIEW.md`
(B1 operation ownership, B2 completeness transport, B3 page-boundary
completeness) are independently verified as closed, within the frozen
ownership contract of `docs/audits/AR-SNAPSHOT-001B-OWNERSHIP.md`
(M9 persistence / M10 material / M11A SnapshotProjector membership +
cardinality + attachment + ordering + frontier + completeness / M11C
presentation only).

**MANUAL API RELOAD REQUIRED** — not performed by this review:

```text
pnpm build
sudo systemctl restart vestara-api.service
```

## 2. Exact diff / scope

Worktree is dirty from earlier programs (unrelated identity/auth/UI/M9
changes present); there is no clean commit boundary. 002A-relevant scope,
separated by inspection:

- A. Inherited AR-SNAPSHOT-002: `packages/activity-room/src/m10-projection-runtime.ts`
  (`projectRecord()` additive exposure — hunk itself unchanged/acceptable),
  base projector + route wiring.
- B. Codex 002A changes (this milestone):
  - NEW untracked `packages/activity-room/src/snapshot-projector.ts`
    (entity + operation contract, exact attachment, conservative completeness).
  - `packages/activity-room/src/index.ts` (contract exports).
  - `apps/api/src/routes/activity-room-m11a.ts` (transports `entities`,
    `complete`, `entityCount`; sanitizers `sanitizeSnapshotEntity`).
  - `apps/workspace/src/lib/m11a-api.ts` (client `M11ASnapshot` + entity types).
  - `apps/workspace/src/hooks/useM11CActivityRoom.ts` (entity adaptation,
    `snapshotComplete` state, incomplete message, `hasMoreHistory`).
  - `apps/workspace/src/pages/activity/correlated-session.ts` (+`mergeSessions`,
    preserves server sessions).
  - NEW untracked `packages/activity-room/__tests__/snapshot-projector.test.ts`.
  - NEW untracked `apps/workspace/src/hooks/m11c-snapshot-contract.test.ts`.
- C. Unrelated dirty-worktree changes: broad modifications (M9 stores,
  activity-room attention/stream, UI shell, telegram, docs, lockfile) preserved
  and not claimed as 002A. Note: `m10-projection-runtime.ts` contains unrelated
  hunks alongside the in-scope `projectRecord()`; deployment from this tree
  carries that pre-existing scope risk. 002A itself did not expand the
  milestone: no M9 schema change, no AR-HISTORY-002 rewrite, no budget change.

`git diff --check` on 002A files: PASS.

## 3. B1 — Operation ownership: CLOSED

M11A now establishes `parent → authoritative operations` before M11C:

- `snapshot-projector.ts:144-196` `attachOperations()` builds
  `SnapshotActivityEntity { parent, lineageKey, operations }` server-side via
  exact lineage + callID, with lifecycle merge by highest sequence.
- Route `activity-room-m11a.ts:869-887` returns `entities` (sanitized) +
  `entityCount` + `complete`; legacy flat `stream` retained for compatibility.
- Client `useM11CActivityRoom.ts:225-259` `streamItemFromSnapshotEntity()` only
  renders the established relationship into the existing `session` shape; it
  performs no lineage/callID inference. `snapshotStreamItems()` prefers
  `entities` and falls back to `stream` only when entities are absent (old
  server compat).
- `deriveCorrelatedSessions` still runs as `presentedStream` over the held
  stream, but snapshot items arrive as parents-with-sessions and no tool rows
  (tools travel inside `operations`, not as stream items), so there is nothing
  to recompute. Its 002A `mergeSessions` change merges later live/history
  evidence into the already-established session without replacing known
  operations. That is presentation adaptation for non-snapshot material, not
  snapshot membership authority.

Rendering an established relationship vs computing it is cleanly separated.
M11C no longer decides which operation belongs to which snapshot Activity
entity. **B1 closed.**

## 4. Correlation authority: EXACT, CLOSED

- Keys: `execution:<id>` / `session:<binding>` / `conversation:<origin>`
  from authoritative M10 fields (`executionId`, `runtimeSessionBindingId`,
  `originConversationId`), themselves derived from durable record fields +
  `extractOriginProvenance(payload)` (`m10-projection-runtime.ts:317-335`).
- Tool identity: `payload.data.callID` + `toolName` required; status from
  canonical M9 type (`tool.called→started`, `tool.succeeded→completed`,
  `tool.failed→failed`). No display text, timestamp, position, participant,
  model, or heuristic fallback anywhere in the attachment path.
- `chooseParent()` requires a shared exact key; tools with no matching
  selected parent are skipped (no fabricated relationship).
- Execution/session/conversation boundaries: keys are namespaced; test C plus
  the split-page lineage test prove `conv-a`/`conv-b` isolation (3 vs 4 ops,
  `call-a` vs `call-b` never cross). Sharing any one lineage key is legitimate
  per the frozen contract.

## 5. Logical operation cardinality: PROVEN (with shape note)

Test B (`snapshot-projector.test.ts:103-116`): `execution(1,'conv-big',200)`
builds 200 pairs = 400 lifecycle rows with 200 distinct callIDs
(asserted `new Set(callID).size === 200`), expects the `conv-big` entity to
carry exactly 200 operations. This genuinely corrects the earlier
200-rows/100-ops collapse — fixture is 200 logical operations, not 200
observations. Tool rows consume zero entity slots (`entityCount === 2`,
`items === 2 + 400`).

Shape note (not a blocker): the helper also emits a lineage-less
`agent.started`, so total `entityCount` is 2 rather than the literal
"parent + 200 ops = 1 entity". The `conv-big` parent itself holds all 200 ops
in one entity, which is the required proof. Zero-op (J), 1-op (split test),
multi-op (A: 60 ops) cases also pass.

## 6. Lifecycle ordering: CORRECT (test gap noted)

`attachOperations` processes tools newest-first (backward traversal order) and
keeps the entry with the highest `sequenceNumber`
(`isNewerLifecycle = tool.sequenceNumber >= priorSequence`, max tracked per
callID). A newer `tool.succeeded` therefore cannot be overwritten by an older
`tool.called`. Proven by the split-page test (`call-a` called seq 2 +
succeeded seq 4 → `completed`, 2 activityIds).

Gap (observation, not blocker): no explicit `tool.failed` reverse-traversal
assertion exists in the projector tests. The resolution logic is
status-agnostic (sequence comparison only) and M10 maps `tool.failed→failed`,
so `called→failed` resolves identically by inspection. Recommend adding a
failed-case assertion in a future milestone; not a deployment blocker.

## 7. B3 — Page-boundary completeness: CLOSED

Genuinely covered with `pageSize: 3` splits and multi-page fixtures over an
AR-HISTORY-002-compatible fake source (exclusive `beforeSequence`, ascending
return):

- A (parent/ops on different pages): split test + test B spanning ~9 pages.
- B (operation before parent in backward traversal): inherent — traversal is
  newest-first and attachment is post-selection; split test has tools at seq
  2-4 with parents at 5-6.
- C (multiple ops across pages): tests A (120 rows), B (400 rows), C (14 rows,
  two lineages).
- D (parent outside M10 working set, inside durable budget): projector uses
  injected durable `fetchPage` + stateless `projectRecord`, never
  `getRawStream()`; full-budget test recovers distant parents. Route injects
  `room.store.query` (durable), so composition holds.
- E (parent outside total budget): dedicated test (`maxPages: 2`, parent at
  seq 1 under 80 tool rows) → `entityCount 0`, `entities []`,
  `complete=false`. Fails closed; no invented membership, no false
  completeness. **B3 closed.**

## 8. Total reconstruction bound: PRESERVED

`SNAPSHOT_SCAN_PAGE_SIZE = 50`, `MAX_SNAPSHOT_SCAN_PAGES = 20` → max 1,000
durable records. Verified in code: lazy `fetchPage(cursor, pageSize)` loop,
`cursor = page[0].sequenceNumber` strictly decreases while pages are
non-empty (monotonic progress), `pages >= maxPages` or empty page terminates
(deterministic), no recursion/retry, no secondary scan. Notably the 002-era
"quiet trailing page" early-stop is gone — the projector now always scans to
budget or exhaustion, which is what makes `complete=true` provable. Budget
constants unchanged. **Bound preserved.**

## 9. B2 — Completeness transport: CLOSED

End-to-end trace: `selection.complete/entityCount/entities` → route JSON
(`complete`, `entityCount`, `entities`, sanitized) → `M11ASnapshot`
(`complete: boolean` required, `entityCount`, optional `entities`) →
`snapshotStreamItems()` → `snapshotComplete` state/ref + `hasMoreHistory =
items.length > 0 || !complete` → `snapshotCompletionMessage()` →
`"Activity snapshot incomplete; load older history to continue."` via `error`
on initial fetch and resync. Missing `complete` (old server, `undefined`) is
falsy → incomplete path, so the client cannot silently interpret
missing/false as complete. `complete=false` is never discarded. **B2 closed.**

## 10. Completeness semantics: CONSERVATIVE, CLOSED

`complete = exhausted` only (empty page within budget). Reaching capacity 50
alone never sets `complete=true` — the loop continues scanning; a page-budget
stop returns `complete=false`. This is logically sound and fail-closed:
`complete=true` proves durable-history exhaustion within budget (operation
closure proven to the scan limit); `complete=false` admits unproven closure.
Consistent with membership (entities selected newest-first regardless),
operation closure (attachment over all scanned tools), history loading
(`hasMoreHistory` forced true when incomplete), and reconnect/catch-up
(sequence-based M11B unchanged; snapshot seeds, catch-up reconciles races).
**Semantics accepted.**

## 11. Incomplete-snapshot consumer behavior: VERIFIED

`snapshotComplete=false` exposed on the hook; partial entities preserved
(`setStream(items)` still applies); Load Older History kept available
(`hasMoreHistory` true); explicit message
`"Activity snapshot incomplete; load older history to continue."` set as
`error` on both initial snapshot and resync paths. Live browser showing that
string is consistent with but not used as proof — source/tests establish the
contract (`m11c-snapshot-contract.test.ts` asserts both the entity adaptation
and the message). No browser interaction performed.

## 12. Frontier: INDEPENDENT, CLOSED

Route: `startBefore = projection.room.cursor.sequenceNumber + 1`; response
`cursor = projection.room.cursor` untouched. Entity count, operation count,
pages scanned, oldest inspected record, and complete/incomplete state never
feed the cursor. Backward scan cannot move the live frontier. Frontier test
(`startBefore: 13` vs `100000` identical selection) passes.

## 13. Ordering: VERIFIED

Newest-first selection, final `items` sorted ascending by unique sequence;
`expectAscending` asserted across tests; operation attachment maps over
`entities` without reordering parents; lifecycle uses sequence (not arrival
order). No parent reorder, no chronology inversion.

## 14. AR-HISTORY-002 compatibility: PRESERVED

`m9-native-sqlite-store` query semantics untouched by 002A
(`beforeSequence` exclusive, descending select, ascending return — confirmed
by inspection; the modified M9 files in the dirty tree are unrelated prior
work, not 002A). `m9-backward-pagination.test.ts` 8/8 PASS. Composition test
G proves snapshot + one history page union contiguous with no duplicate ids.
No duplicate/missing parents, no duplicate operations, no cursor misuse found.

## 15. M10 ownership: ACCEPTABLE, UNCHANGED

`projectRecord()` still a side-effect-free delegate to the existing private
mapping (verified `m10-projection-runtime.ts:304-306`). M10 owns no snapshot
membership, attachment, completeness, or entity cardinality. 002A did not
expand M10.

## 16. M11C ownership: PRESENTATION-ONLY FOR SNAPSHOT

Snapshot operation relationships are server-established; M11C adapts
(`streamItemFromSnapshotEntity`) and merges later live/history evidence
(`mergeSessions`). Generic `deriveCorrelatedSessions` remains for
non-authoritative material — explicitly allowed without unrelated
refactoring. Snapshot semantic ownership belongs to M11A.

## 17. Test quality: GENUINE (gaps noted)

Tests exercise production paths: real `ProjectionRuntime.projectRecord` +
AR-HISTORY-002-compatible fake paging + consumer adaptation. No mocks bypass
the defect; the 200-op fixture is genuine (400 rows / 200 callIDs asserted);
page-boundary simulation is real (pageSize 3, multi-page 400-row scan);
completeness crosses the API/client contract types (route sanitizers +
`M11ASnapshot` + hook state + message). Gaps (non-blocking): no explicit
failed-lifecycle projector assertion; no live HTTP route request (route is
compile-verified; live state out of scope); history composition asserts
sequence union, not cross-boundary operation merge (covered indirectly by
`mergeSessions` unit path + consumer test).

## 18. Independent verification results

- `pnpm build` — PASS (references generated, 119 projects boundaries valid).
- Focused: `snapshot-projector` + `m11c-snapshot-contract` +
  `m9-backward-pagination` — 3 files / 20 tests PASS.
- Activity-room corpus — 18 files / 133 tests PASS. (Codex reported 141; the
  delta is counting scope — workspace/API suites counted separately. All
  in-scope suites green here: + correlation/consumer/route-adjacent 4 files /
  15 tests PASS.)
- `pnpm dependencies:check` — PASS, 119 projects.
- Biome on 002A files — PASS, no fixes applied.
- `git diff --check` on 002A files — PASS.
- No service restarted, no production data mutated, no browser touched.

## 19. Out-of-scope items (untouched)

- Live `Activity Stream: OFFLINE` observation: recorded as separate observed
  condition only; not diagnosed, reconnected, or admitted as acceptance
  evidence.
- `AR-RESPONSE-PROJECTION-001` (missing live final agent-response text):
  not repaired.
- View-mode semantics (Summary/Operational/Raw): not modified; left for
  `AR-VIEW-MODES-001`.

## 20. Deployment blockers

None material to 002A. Residual notes (not blockers):

1. Dirty-worktree deployment risk: unrelated uncommitted changes
   (M9/attention/UI/telegram/lockfile, plus unrelated hunks in
   `m10-projection-runtime.ts`) ship with any deploy from this tree. 002A
   itself is clean; operator should deploy from a separated milestone diff or
   accept the bundled scope explicitly.
2. Suggested follow-up assertions (failed-lifecycle projector case, live route
   HTTP harness) — future milestones, not acceptance gates.

## 21. Final determination

**ACCEPT_FOR_DEPLOYMENT** — B1/B2/B3 closed; M11A owns authoritative
entity/operation relationships; M11C is presentation-only for snapshot;
exact authoritative correlation; 200 logical operations proven; lifecycle
sequence resolution correct; page boundaries preserve correlation;
20-page/1,000-record bound retained; incomplete fails closed; completeness
survives transport; `complete=true` conservative; frontier authoritative;
AR-HISTORY-002 compatible; tests genuine; build/verification passes; no
material 002A scope violation.

**MANUAL API RELOAD REQUIRED.** Not performed. Stop.
