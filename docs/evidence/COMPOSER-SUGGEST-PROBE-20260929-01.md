# COMPOSER-SUGGEST-PROBE-20260929-01 — Suggest-path telemetry probe (audit response)

## 1. Probe identity

- Probe ID: `composer-probe-20260929-01`
- Upstream session: `ses_f16ead593ffeZpBei98RV1jV26` (single-use suggest session)
- Route: isolated `/suggest` (non-docs mode) via `ComposerSuggestionService` → `ProviderExecutor.complete({ suggestionOnly: true })`
- Observed upstream event: `message.part.updated part.type:tool` despite `tools:{}` envelope
- Service outcome: `status:no_match`, `structuredOutputSource:none`, `termination:failed` (fail-closed on forbidden operation event)
- Wall time: ~8.54s isolated (`6755ms` adapter turn + `8493ms` service duration), 0 tokens reported

## 2. Telemetry correlation (survives)

- `composer.suggestion.started` carries `{ requestId, mode, assistantRuntime, suggestionOnly:true }`
- `assistant.turn.started/ended` carry `{ suggestionRequestId: requestId, conversationId, sessionId }`
- `assistant.turn.abortSession` (warn) precedes `abortSession` with `{ reason: termination }`
- `composer.suggestion.completed` carries `{ providerUsed, providerModel, structuredOutputSource, candidateCount, activityRoomMirroring:'suppressed', resultStatus }`
- Journal filter for verification: `requestId=<requestId>` over `composer.suggestion.*` + `suggestionRequestId=<requestId>` over `assistant.turn.*`
- UNKNOWN retained: bounded-log grep was asserted, not pasted with the requestId filter. Paste the filtered lines before closing logger-plumbing.

## 3. Activity Room suppression (consistent)

- Cursor baseline: `15447→15447`, entities `40→40` across the probe window
- `mirrorToolEvent` early-returns for `suggestionOnly`; no `opencode.message.part.updated` mirrored
- Durable `tool.called/succeeded/failed` unchanged for the suggest session (suppression holds even though upstream emitted a tool part)

## 4. Safety boundary (correct for the observed event)

- `isSuggestionOnlyForbiddenEvent` covers `session.next.tool.*`, `session.next.shell.*`, `permission.*`, `question.*`, `todo.updated`, `file.edited`, and `message.part.updated part.type:tool`
- Forbidden check runs before `toolCallCount++` and before `mirrorToolEvent`
- `requiresAbort(failed)=true` → `abortSession` (cancel-safety)

## 5. Non-viability findings (accepted from audit)

- Empty `tools:{}` is not a tool-free guarantee: upstream still emitted a tool part. Fixed: suggestion-only turns now omit the `tools` key entirely (fail-closed check remains authoritative).
- Single isolated `/suggest` cost a full session creation + agent turn (~8.5s, `no_match`, 0 tokens). Stateless/schema-constrained inference acceptance is not met; per-keystroke use would be latency + cost prohibitive.
- Suggest sessions bypass the registry (`resolveSession` returns `undefined` for `suggestionOnly` → `runAssistantOpenCodeTurn` creates a fresh session). Fixed: suggestion-only turns now always abort (`aborting = requiresAbort(termination) || suggestionOnly`), bounding retention even on `completed`.
- Production adapter retained `OPENCODE-INGRESS-003` filesystem trace (`/tmp/opencode-ingress-003-trace.ndjson` via `fs.appendFileSync`) and `console.error` in `verifySession`. Fixed: trace + marker + helpers removed; `verifySession` failure now logs `assistant.session.verifyFailed` via the injected logger; `assistant.turn.started/ended/abortSession` carry `suggestionOnly` for journal filtering.
- Replacement of the agent-turn suggest path with a stateless path is recommended but NOT executed here (out of authorized mutation scope; recorded as ADJACENT/BLOCKER for follow-up authorization).

## 6. Files changed in the initial probe response (historical)

This list records the initial probe response only; it is not the bounded
cutoff-slice file list. The current slice is enumerated in §11.

- `apps/api/src/assistant-opencode-adapter.ts`
- `apps/api/src/workspace-context.ts`
- `apps/api/__tests__/ar-tools-001.test.ts`
- `packages/providers/opencode/__tests__/suggestion-stateless-path.test.ts`
- `docs/evidence/COMPOSER-SUGGEST-PROBE-20260929-01.md`

## 7. Worktree hygiene (acknowledged)

- At the time of the initial response, `git status --porcelain` showed ~119 modified + ~80 untracked spanning `apps/workspace`, `packages/*`, `docs/MILESTONES.md`, `pnpm-lock.yaml`. These are point-in-time dirty-counts, not current totals. The probe cannot be attributed to a telemetry slice alone; unrelated files are not attributed to this probe and must not be committed under this probe ID. This response mutates only the five files listed in §6.

## 8. Verification recorded for the initial probe response

- Focused contract tests: `ar-tools-001.test.ts` (suggestion-only fail-closed + no mirror + no `tools` key), `composer-suggestion-service.test.ts`
- `pnpm lint:check` on touched files; full `pnpm build && pnpm test` was deferred at that point because of unrelated dirty-worktree churn. Current bounded verification is recorded in §11.

## 9. Stateless replacement (executed 2026-09-29, authorized)

Agent-turn suggest is no longer reachable from the product path:

- `apps/api/src/workspace-context.ts`: `ComposerSuggestionService` now receives
  `composerSuggestionExecutor` — an `OpenCodeRuntimeProvider` bound to the
  shared `ocClient` with tight suggestion bounds (`streamIdleTimeoutMs: 20s`,
  `streamMaxDurationMs: 60s`). It sends native `format: json_schema`, no `tools`
  key, no persona/capability policy, no permission/question handling, and no
  Activity Room mirror. Ephemeral sessions abort in `finally` (bounded by
  construction). Transport-unavailable fail-closes with a clear error.
- The fail-closed guards in `assistant-opencode-adapter.ts` (omit `tools`,
  forbidden-event abort, always-abort suggest sessions) and the Codex
  `suggestionOnly` rejection remain as defense-in-depth for any future caller
  that routes `suggestionOnly` through an agent-turn executor.
- New contract tests `packages/providers/opencode/__tests__/suggestion-stateless-path.test.ts`:
  native `json_schema` format + no `tools` key + `structuredOutput` flow-through;
  ephemeral session aborted exactly once (no leak).

## 10. Live verification (2026-09-29, running build)

- Artifacts (`01:26:15/16 +0800`) predate restart (`01:27:30 PST`) by ~75s; therefore the loaded build was current.

- `POST /api/composer/suggestions` `{mode:docs, draft:"I want documentation here"}` →
  `status:candidates` with grounded repository references
  (`docs/SettingsFramework/01-Overview.md`, ADR, activity-room plans), no
  provider call, no session created.
- Activity Room cursor `242→242` across the live probe (suppression holds on
  the running build; no `tool.called/succeeded/failed` facts emitted).
- Historical agent-turn probe journal lines (`composer.suggestion.*` with
  `requestId`, `assistant.turn.*` with `suggestionRequestId` for
  `ses_f16ead593ffeZpBei98RV1jV26`) remain unretrievable in this environment:
  the API's stdout is an unobservable socket (`/proc/408048/fd/1 →
  socket:[2722775]`, process not owned by this session) and no file sink is
  configured. Journal filter for the owning session:
  `requestId=<requestId>` over `composer.suggestion.*` +
  `suggestionRequestId=<requestId>` over `assistant.turn.*`. Recorded as
  UNKNOWN, not inferred.

## 11. Bounded cutoff-slice follow-up (2026-09-30)

### Scope boundary

The claimed cutoff slice is five files:

- `apps/api/src/composer-suggestion-service.ts`
- `apps/api/__tests__/composer-suggestion-service.test.ts`
- `apps/api/src/routes/composer-suggestions.ts`
- `packages/shared/src/composer-suggestions.ts`
- `apps/api/src/workspace-context.ts`

The worktree contains substantial unrelated modified and untracked content.
That content is not attributed to this slice and is not changed or committed
under this probe ID. In particular, `workspace-context.ts` and the adapter
also contain unrelated work from other slices; guard survival does not mean
those files were otherwise untouched.

### Cutoff guards

- Empty draft: returns `status:no_match` with `providerUsed:none` before any
  provider invocation.
- Suggestion transport unavailable: returns `status:no_match` with
  `providerUsed:unavailable` and does not call `complete()`.
- The service routes through the dedicated `composerSuggestionExecutor` with
  native `json_schema` and `suggestionOnly:true`; it does not route through
  `conversationProviderExecutor` or an agent-turn adapter.

### Static verification status

The focused composer service contract suite had already passed independently:
**6/6**. Current bounded verification is also green:

- `pnpm build`: passed, exit 0.
- Biome on the five slice files: passed, 5 files checked, no fixes applied.
- Requested focused suites (`composer-suggestion-service.test.ts`,
  `suggestion-stateless-path.test.ts`, and `ar-tools-001.test.ts`): passed,
  **3 files / 16 tests**.

### Live-proof boundary

The build verification timestamp (`13:17:54`) is later than the running
process start (`13:12:30 PST`), so the running process was stale for live
proof. Restart failed with `Interactive authentication required`.
No request was sent to that stale process. Restart authorization is
unavailable in this session, so live proof is **BLOCKED at restart auth** and
live viability is **UNKNOWN**. Agent-turn cutoff is **NOT PROVEN**. A live
probe must not be represented as successful without an authorized restart,
fresh-process request probes, and journal correlation.

### §11 addendum — authorized static re-check (2026-09-30)

- Biome on the five slice files: passed; 5 files checked, no fixes applied.
- Focused Vitest suites (`composer-suggestion-service.test.ts`,
  `suggestion-stateless-path.test.ts`, and `ar-tools-001.test.ts`): passed;
  3 files, 16/16 tests.
- Build: prior reported exit 0 at `13:17:54`; not re-run for this addendum.
- Live: **BLOCKED at restart auth / UNKNOWN**. Agent-turn cutoff: **NOT
  PROVEN**.

Fresh authorized restart, fresh-process probes, and journal correlation
(`requestId` over `composer.suggestion.*` plus `suggestionRequestId` over
`assistant.turn.*`) remain out of scope until separately authorized.

### §11 execution update — restart authority blocked (2026-09-30)

The targeted restart was not performed. `sudo -n systemctl restart
vestara-api.service` failed before execution with:

`sudo: /etc/sudo.conf is owned by uid 65534, should be 0`

`sudo: The "no new privileges" flag is set, which prevents sudo from running
as root.`

No live request was sent to the still-running process. Live remains
**BLOCKED at restart auth / UNKNOWN**; agent-turn cutoff remains **NOT
PROVEN**.

### §11 execution update — fresh-process probes (2026-09-30)

Director restart provenance was confirmed before probing:

- `vestara-api.service`: `active/running`, `MainPID=489296`.
- `ActiveEnterTimestamp`: `2026-09-30 13:37:37 PST`.
- API artifact `apps/api/dist/index.js`: `2026-09-30 13:17:54.836 +0800`.
- The process start therefore postdates the recorded build artifact.

Fresh docs probe:

- Request: `POST /api/composer/suggestions` with
  `{mode:docs,draft:"I want documentation here"}`.
- HTTP `200`; `X-Request-Id:
  bc65f5e6-56ee-42f2-84f5-0261e6dab32b`.
- Result: `status:candidates`, 5 repository-documentation candidates,
  `providerUsed:repository-documentation`, no inference call.
- Journal correlation: `composer.suggestion.started` →
  `composer.suggestion.completed` → HTTP 200; `activityRoomMirroring:none`.

Fresh plain-suggest probe:

- Request: `POST /api/composer/suggestions` with
  `{mode:suggest,draft:"Help me make this request clearer"}`.
- HTTP `500`; `X-Request-Id:
  1092613c-0d50-4d7d-af90-7a6b323fe27b`.
- Response: `{"error":"OpenCode returned an unexpected error."}`.
- Journal correlation: `composer.suggestion.started` at 13:42:16.472 →
  `composer.suggestion.failed` at 13:42:21.365 with
  `activityRoomMirroring:suppressed` → HTTP 500.
- Filtered journal lines:

  ```text
  2026-09-30T05:42:16.472Z composer.suggestion.started requestId=1092613c-0d50-4d7d-af90-7a6b323fe27b mode=suggest suggestionOnly=true
  2026-09-30T05:42:21.365Z composer.suggestion.failed requestId=1092613c-0d50-4d7d-af90-7a6b323fe27b error="OpenCode returned an unexpected error." activityRoomMirroring=suppressed
  2026-09-30T05:42:21.368Z http.request.failed requestId=1092613c-0d50-4d7d-af90-7a6b323fe27b path=/api/composer/suggestions statusCode=500
  ```
- No matching `assistant.turn.*`, tool, permission, or question events were
  found for this request. The request reached the dedicated suggestion path,
  but inference failed before a successful candidate response.

Live status: docs-path proof is **GREEN**; plain-suggest live viability is
**FAILED at provider completion**; agent-turn cutoff remains **NOT PROVEN**.
The failure requires a separate, authorized product investigation; no product
source or test files were changed under this follow-up.

### §11 implementation update — model binding fix (2026-09-30)

The plain-suggest failure was traced to stale model selection and incomplete
provider binding:

- The service defaulted to the legacy `deepseek-v4-flash-free` model id.
- The live configured catalog exposes current models under providers such as
  `opencode-go`; the legacy id was not present in the projected configured
  catalog.
- `OpenCodeRuntimeProvider` accepted `request.provider` but did not use it
  when resolving the upstream provider.

Implemented narrowly:

- Composer OpenCode suggestions now use the `opencode-runtime` sentinel when
  no model is explicitly selected, allowing the runtime's configured default
  to apply.
- OpenCode runtime provider resolution now honors a discovered server-resolved
  `request.provider` and reports `reason:requested` in completion provenance.
- Added focused coverage for the runtime sentinel and explicit provider/model
  binding.

Verification:

- `pnpm build`: passed, exit 0.
- Focused suites: 3 files, **17/17 tests passed**.
- Biome on the implementation/test files: passed, no fixes applied.

Fresh live verification of this fix is pending. The targeted
`vestara-api.service` restart failed with `Interactive authentication
required`; no probe was sent to the stale API process. Live plain-suggest
viability and agent-turn cutoff remain **UNKNOWN / NOT PROVEN** until an
authorized restart loads the rebuilt artifacts.
