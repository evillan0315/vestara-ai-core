# Independent Review — ACTOR-IDENTITY-004A / 004B / 004C

Status: REVIEW ONLY. No production code, tests, evidence, or audits were modified.
Only this review artifact was created. Nothing staged, committed, pushed,
deployed, or restarted. No live identity state mutated.

Reviewer: Vestara Assistant (independent review of Codex's uncommitted worktree).
Date: 2026-09-25 (UTC).

---

## 1. Reviewed commit / worktree state

- HEAD: `541b797 fix Activity Room global surfaces and stream loading`
- Worktree: dirty. 79 tracked files modified (`git diff --stat`: 3327 insertions,
  567 deletions) plus ~45 untracked files. The worktree interleaves MANY programs
  (M11C Activity Room UI/stream, runtime-question 003A-series, telegram 002-series,
  persistence hardening, diagnostics) with the claimed 004A/004B/004C work.
- The 004-attributable implementation files are all NEW (untracked, absent from HEAD):
  - `packages/workspace/src/human-identity-representation.ts`
  - `packages/workspace/src/human-identity-representation-migrations.ts`
  - `packages/workspace/src/human-identity-representation-storage.ts`
  - `apps/api/src/assistant-identity.ts`
  - `packages/workspace/__tests__/human-identity-representation.test.ts`
  - `apps/api/__tests__/human-principal-provisioning.test.ts` (also covers 002D provisioning)
  - `docs/evidence/ACTOR-IDENTITY-004A.md`, `004B.md`, `004C.md`
- 004-attributable tracked-file modifications: `packages/workspace/src/agent-migrations.ts`
  (1 line), `packages/workspace/src/index.ts` (exports), `packages/shared/src/provider.ts`
  (`AssistantIdentityContext`), `packages/shared/src/assistant-execution.ts`,
  `packages/shared/src/conversation-types.ts`, `packages/context/src/index.ts`
  (assembler rendering), `packages/conversation/src/index.ts` (`SendOptions`),
  `apps/api/src/routes/auth.ts` (representation endpoints + 002D provisioning),
  `apps/api/src/routes/conversations.ts` (2 call sites), `apps/api/src/routes/telegram.ts`
  (2 call sites), `apps/api/src/workspace-context.ts` (composition),
  `apps/api/src/audit-log.ts` (2 audit actions).
- Live service `vestara-api.service` is `active`, but the implementation is
  uncommitted source; deployment requires operator rebuild + restart, which has
  not occurred. Live behavior is therefore unaffected by this diff.
- Full gates (build, lint, test, dependency check) were NOT re-run by this reviewer;
  Codex's reported gate results are taken as reported, not verified, except for
  static test counts (Section 10) and the mechanism-level checks below.

---

## 2. Changed-file inventory (004 scope)

| File | Class | Verdict |
|---|---|---|
| `packages/workspace/src/human-identity-representation.ts` | contract | clean, bounded |
| `packages/workspace/src/human-identity-representation-migrations.ts` | persistence/migration | content clean; ORDERING defect (F-02) |
| `packages/workspace/src/human-identity-representation-storage.ts` | storage | clean logic; error-code mapping gap (F-04) |
| `packages/workspace/src/agent-migrations.ts` | persistence/migration | 1-line wiring; ordering defect lives here |
| `packages/workspace/src/index.ts` | contract | export-only, fine |
| `packages/shared/src/provider.ts` | contract | `AssistantIdentityContext { preferredName }` only — clean |
| `packages/shared/src/assistant-execution.ts`, `conversation-types.ts` | contract | identity-only carries, no authority fields observed |
| `packages/context/src/index.ts` | context/projection | renders identity block; never forwarded (F-03) |
| `packages/conversation/src/index.ts` | context/projection | `SendOptions.assistantIdentity` passthrough — clean |
| `apps/api/src/assistant-identity.ts` | context/projection | clean, fail-closed (16 lines, quoted §6) |
| `apps/api/src/routes/auth.ts` | API | POST/PUT guarded; GET auth gap (F-01); error mapping gap (F-04) |
| `apps/api/src/routes/conversations.ts` | provider/runtime | resolves before service call — clean wiring |
| `apps/api/src/routes/telegram.ts` | provider/runtime | same resolver, no Telegram fallback — clean |
| `apps/api/src/workspace-context.ts` | storage/composition | single-writer compatible; digest-guard hardening present |
| `apps/api/src/audit-log.ts` | audit | 2 new actions, consistent with existing boundary |
| `packages/workspace/__tests__/human-identity-representation.test.ts` | test | 2 tests |
| `apps/api/__tests__/human-principal-provisioning.test.ts` | test | 3 tests |
| `packages/context/__tests__/surface-context.test.ts` | test | 7 tests (4 new; 3 pre-existing) |
| `docs/evidence/ACTOR-IDENTITY-004{ABC}.md` | evidence | see §11; two claims contradicted |

Scope notes:

- S-01 (NOTE): the worktree contains far more than 004A/B/C (Activity Room M11C,
  003A runtime questions, telegram pairing, diagnostics). That material is NOT
  attributed to 004 and was not reviewed; its presence interleaved in one dirty
  worktree prevents attributing "the complete diff" to Codex-004 alone.
- S-02 (NOTE): `POST /api/admin/human-principals` (principal provisioning, 002D)
  ships in the same `auth.ts` hunk as the representation endpoints. It is narrow,
  guarded (explicit 401 + admin), and tested — recorded as adjacent scope, not a defect.
- HumanPrincipal itself is untouched: `git diff` for `human-principal.ts`,
  `human-principal-storage.ts`, `human-principal-migrations.ts`,
  `human-knowledge.ts` is EMPTY. Identity-only invariant at the principal layer holds.
- No Telegram-specific semantics (usernames, display names, subjects) appear in
  canonical representation contracts; no provider IDs in representation or context.
  No live identity records modified (file-state review; live DB not touched).

---

## 3. Architecture trace (as implemented)

```text
HumanPrincipal (identity-only, unchanged)
→ HumanIdentityRepresentation { principalId, preferredName, status, source:'explicit', createdAt, updatedAt }
→ HumanIdentityRepresentationStorage (API-owned plans.db, one row per principal)
→ POST|PUT|GET /api/admin/human-principals/:principalId/representation (admin)
→ resolveAssistantIdentity(ctx, actor) → AssistantIdentityContext { preferredName } | undefined
→ SendOptions → ContextOptions → DefaultContextAssembler system block
→ CompletionRequest.messages[0] (+ CompletionRequest.actor / .assistantIdentity)
→ OpenCode adapter:  parts=[userText], system=buildSurfaceSystem(surfaceContext)   ← identity block DROPPED (F-03)
→ Codex adapter:    thread.runStreamed(lastUserText(messages))                      ← identity block DROPPED (F-03)
```

Identity is resolved before provider adapters (adapters never query
`HumanPrincipal` storage and never interpret Telegram identity) — that half of
the neutrality claim holds. What does NOT hold is that either provider receives
the assembled identity semantics.

---

## 4. Persistence verdict — HOLD (F-02)

Verified by inspection:

1. Migration is a single `CREATE TABLE IF NOT EXISTS` step; non-destructive. PASS.
2. No existing table/data rewritten by the step itself. PASS.
3. Migration numbering/order: **FAIL (F-02)** — the new group is inserted BEFORE
   `ORCHESTRATION_DECISION_WAIT_MIGRATIONS`, which already occupied the trailing
   position at HEAD. The file's own rule states new steps MUST be appended as a
   trailing group. The runner is positional (`manifest.steps[row.version - 1]`,
   `verifyAppliedLog` in `packages/sqlite-migrations/src/runner.ts` throws
   `SchemaMetadataInconsistentError` on name/version mismatch). Any database that
   already recorded decision-wait versions fails closed at next migrate.
   Fail-closed, no corruption — but deployment-breaking as shipped.
4. Schema metadata compatible (same manifest/fingerprint mechanism). PASS.
5. FK: `REFERENCES human_principals(id)` is declarative only (SQLite FK
   unenforced by default); enforcement is application-level via
   `principals.require/get`. Acceptable, matches existing storage style. PASS with note.
6. Principal deletion: no row-delete path exists in `HumanPrincipalStorage`
   (lifecycle is status-based incl. `deleted`). Representation `get()` returns the
   row even for inactive principals while the resolver independently requires
   active principal + active representation. Minor read/projection asymmetry. NOTE (F-06).
7. Duplicate representation: deterministic throw (`already exists`). PASS
   (storage-level; HTTP mapping gap is F-04).
8. API/workspace-owned DB authority: storage constructed in
   `createWorkspaceContext` against the single `plans.db` handle; writes go through
   `prepare/bind/step/free`, and the `prepare` wrapper in `openSqlDb` persists on
   `free()` for write SQL (`INSERT`/`UPDATE` match `isWriteSql`). PASS.
9. No second writer: no new DB open, no parallel store, no CLI mutation path. PASS.
10. Stale-snapshot behavior: the worktree's `openSqlDb` carries the
    PERSISTENCE-SINGLE-WRITER-001 digest guard (refuses persistence when the disk
    digest moved under the writer). Representation writes participate in it via
    the same wrapped handle. PASS by inspection (guard itself not re-tested here).
11. Generation/write guard participation: same handle, same wrappers. PASS by inspection.
12. No external CLI/direct DB mutation required. PASS.

Unproven (marked UNKNOWN, not PASS): end-to-end reopen durability of a
representation row through `openSqlDb` + `PLANS_MANIFEST` + file export
(the provisioning test asserts file durability for principals only, not for
representations; the storage test uses an in-memory DB with a hand-built manifest).

---

## 5. API-boundary verdict — HOLD (F-01, F-04)

- POST/PUT reuse the explicit bearer-token check (401 when absent) plus
  `requireRole(..., 'admin')`, accept only `{preferredName, status}`, reject
  provider-shaped fields with 400 (`Unsupported representation field`), validate
  `preferredName` non-empty and `status ∈ {active, unavailable}`. Representation
  cannot create a principal (`require` first), cannot link external identities,
  cannot grant roles/permissions/memberships (no such fields or code paths). PASS.
- **F-01 (HIGH): GET lacks the explicit 401 guard.** POST/PUT check the bearer
  token directly, but GET relies solely on `requireRole`, and `authenticate()`
  (`apps/api/src/auth.ts`) falls back to a `local-operator` user with role
  `admin` when no token is present. Consequence: GET
  `/api/admin/human-principals/:id/representation` is anonymously readable
  (preferredName + principal-existence oracle) by anyone reaching the API port.
  Unintentional asymmetry with its sibling methods.
- **F-04 (MEDIUM): storage errors surface as HTTP 500.** Missing principal,
  inactive principal, duplicate POST, and PUT-without-existing all throw plain
  `Error`, which the route does not map (no try/catch → generic 500 via server
  error handling). Fail-closed (no mutation occurs) but wrong semantics: expected
  404 / 403 / 409 / 404 respectively. Tests assert none of these codes.
- POST vs PUT semantics are intentional and coherent (POST=create-only,
  PUT=update-only, both fail closed otherwise) but the conflict/not-found paths
  are tested only at storage level, never at HTTP level.
- GET returns `{representation: null}` for both "principal missing" and
  "representation absent" — conflated but UNKNOWN-preserving. NOTE.

---

## 6. Projection verdict (004B) — PASS with gaps

`apps/api/src/assistant-identity.ts` in full:

```ts
export async function resolveAssistantIdentity(
  ctx: Pick<WorkspaceContext, 'humanPrincipals' | 'humanIdentityRepresentations'>,
  actor: ExecutionActor | undefined,
): Promise<AssistantIdentityContext | undefined> {
  if (!actor || actor.kind !== 'human') return undefined;
  const principal = await ctx.humanPrincipals.get(actor.id);
  if (!principal || principal.status !== 'active') return undefined;
  const representation = await ctx.humanIdentityRepresentations.get(actor.id);
  if (!representation || representation.status !== 'active') return undefined;
  return { preferredName: representation.preferredName };
}
```

- Fail-closed for: absent actor, non-human actor, missing principal, inactive
  principal, missing representation, inactive representation. PASS by inspection.
- No Telegram/display-name fallback, no username/OS/Git fallback, no global
  current user, no hardcoded name, no cross-principal cache (keyed lookup per
  actor id; table PK is `principal_id`). PASS by inspection.
- The resolver itself has ZERO direct unit tests (coverage is indirect via
  storage + assembler suites). Multi-principal isolation is partially exercised
  (second principal reads null in the same DB) but unavailable-representation
  and non-human-actor projection paths are untested. Test gaps, not code defects —
  see §10.

---

## 7. AssistantIdentityContext serialization verdict — PASS (security) / FAIL (delivery)

- Contract: `AssistantIdentityContext { readonly preferredName: string }`
  (`packages/shared/src/provider.ts`). Carried identically through `SendOptions`
  and `ContextOptions`; opaque principal ID stays in `CompletionRequest.actor`
  and is asserted absent from rendered text by test. PASS.
- Exact model-visible rendering (assembled in memory by `DefaultContextAssembler`):

```text
Current human identity context:
Preferred name: <governed value>
```

appended to the system message. The wording is identity-descriptive only. It does
NOT say or imply speaking-for, acting-on-behalf-of, authorization, ownership,
administratorship, or any authority. No authority-bearing string exists anywhere
on this path. PASS.
- Prompt-injection boundary: `preferredName` is interpolated raw into one system
  string. A hostile value (`Ignore previous instructions`, embedded newlines,
  `</identity>`-style escapes) cannot escape the single system-message structure
  (roles are structural, not textual), but CAN inject instruction-like text inside
  the system block. Mitigations present: admin-only write boundary, trim,
  200-char cap. Residual risk is LOW and requires admin compromise; no sanitizer
  demanded (structured boundary already contains the structural risk). NOTE (F-05):
  consider newline-collapsing + a hostile-value test to lock the boundary.
- **Delivery caveat (links to F-03): the rendered block is inert.** It is built
  into `CompletionRequest.messages[0]` but no executor forwards that element
  (see §8). Security verdict is PASS precisely because nothing authority-bearing
  can reach the model; functional delivery is the failed half.

---

## 8. Provider-neutrality verdict — HOLD (F-03)

- Identity resolution happens before adapters; neither adapter queries principal
  storage or interprets Telegram identity. That direction holds. PASS.
- **F-03 (HIGH, functional; fail-safe direction): the assembled identity block
  reaches NEITHER provider.**
  - OpenCode (`assistant-opencode-adapter.ts`): submits
    `parts: [{type:'text', text: userText}]` with `system: buildSurfaceSystem(...)`
    — the `system` field carries ONLY surface context. `messages[0]` (the identity
    block) is never read (`lastUserText` extracts only the last user message).
  - Codex (`assistant-codex-adapter.ts:212,239`): `thread.runStreamed(prompt)` with
    `prompt = lastUserText(request.messages)`; thread options carry no system
    instructions. History and system content are dropped by pre-existing design
    (Codex threads own continuity).
  - Net: OpenCode and Codex receive "equivalent" identity data only degenerately
    (both receive nothing). Evidence 004C §"Provider consistency" ("both runtimes
    receive the same assembled message semantics") is CONTRADICTED at the transport
    layer. No provider receives broader data than the other, so there is no
    confidentiality/authority asymmetry — but the claimed feature does not function
    end-to-end on either path.
- Byte-identity was never required; semantic delivery is what fails.

---

## 9. UNKNOWN / fail-closed verdict — PASS

- Absent representation ⇒ resolver returns `undefined` ⇒ assembler omits both the
  `assistantIdentity` key and the rendered block (asserted by test:
  `not.toHaveProperty('assistantIdentity')`, no `Preferred name:` text). Existing
  requests without governed representation continue unchanged. PASS.
- Non-human actors ⇒ `undefined`, no fallback, no rejection of the turn itself. PASS.
- No inference from Telegram/username/OS/Git/conversation text exists on this path
  (resolver reads exactly two stores by actor id). PASS.

---

## 10. Test adequacy verdict — ADEQUATE COUNT, GAPPED COVERAGE

Claimed "3 files / 12 tests" — confirmed statically: 2 (`human-identity-
representation.test.ts`) + 3 (`human-principal-provisioning.test.ts`) + 7
(`surface-context.test.ts`, of which 4 are new: actor-carry, actor-omit,
preferred-name render, absent-UNKNOWN). Full-suite re-execution was out of scope
for this review (build-gated); counts and assertions verified by reading.

Proven by tests: principal scoping + isolation (basic), create/update/duplicate
(storage level), absent representation, missing + inactive principal (create
path), provider-field rejection (API 400 + storage `@ts-expect-error`),
no-authority side effects (external identities remain empty), assembler
rendering + principal-ID non-render + absent-UNKNOWN, request compatibility.

Missing (test gaps, NOT implementation defects except where noted):

- T-01: resolver direct unit tests (all seven fail-closed branches).
- T-02: HTTP codes for duplicate (409), missing principal (404), inactive
  principal, PUT-without-existing (links F-04).
- T-03: unavailable-representation projection; GET-authentication (links F-01).
- T-04: representation file-reopen durability via `openSqlDb` + `PLANS_MANIFEST`.
- T-05: migration upgrade test (old-manifest DB → new manifest; links F-02).
- T-06: adapter-level proof of what each provider transport carries
  (OpenCode `system`/parts, Codex prompt) incl. identity (links F-03).
- T-07: hostile `preferredName` serialization boundary (links F-05).
- T-08: two-active-principals with distinct representations projecting
  independently end-to-end (only partially covered at storage level).

---

## 11. Evidence-quality verdict

- 004A: claims (contract shape, owner files, table, admin boundary, fail-closed
  behaviors, "9 tests passed", unrelated Playwright mismatch, no live restart)
  are directly proven or indirectly supported, EXCEPT the migration-order
  implication: "appended to PLANS_MANIFEST after existing human-principal and
  knowledge migrations" is true but incomplete — it is NOT after ALL existing
  groups (decision-wait trails it). ASSERTED-BUT-UNPROVEN as stated; contradicted
  in effect by F-02.
- 004B: projection path, fail-closed enumeration, no-cache, UNKNOWN semantics —
  directly proven against `assistant-identity.ts`. SUPPORTED. (Testing described
  as "covered indirectly" — accurate; see T-01.)
- 004C: assembler rendering, contract ownership, adapter non-resolution —
  supported. **"Both runtimes receive the same assembled message semantics" —
  CONTRADICTED** (F-03: neither runtime's transport carries the block).
  "→ CompletionRequest.messages + CompletionRequest.actor → OpenCode/Codex
  serializers" misdescribes the serializers, which read `lastUserText`/`surfaceContext`,
  not `messages[0]`.

---

## 12. Baseline-failure assessment (both SUPPORTED as pre-existing/unrelated)

1. Vitest/Playwright discovery mismatch: mechanism confirmed. `vitest.config.ts`
   excludes only `apps/workspace/tests/visual/**/*.spec.ts`, but the directory
   contains compiled `visual.spec.js` (+`.d.ts`,`.js.map`, `config.js`,
   `engine.js`, … — gitignored via `apps/workspace/.gitignore: *.js`, hence
   invisible to `git status`). Repo-wide vitest discovers the stray `.spec.js`,
   whose Playwright `test()` calls produce exactly the reported error. None of
   these files are in the 004 diff. Pre-existing, unrelated. (Separately: the
   committed-or-ignored compiled artifacts under `tests/visual/` are a hygiene
   issue for whoever owns that directory, not for 004.)
2. Standalone `@vestara/telegram-integration` sql.js visibility: confirmed
   structurally. `src/migrations.ts` does `import type { Database } from 'sql.js'`
   while the package manifest declares no `sql.js` dependency or devDependency
   (only channel/execution/sqlite-migrations packages + typescript/vitest).
   Standalone `tsc` therefore lacks declaration visibility. That source file is
   untouched by the 004 diff. Pre-existing, unrelated.

---

## 13. Security invariant assessment

`Identity ≠ Relationship ≠ Permission ≠ Disclosure ≠ Authority ≠ Context ≠ Intelligence`

- Representation is principal-scoped data (`preferredName`, `status`,
  `source:'explicit'`, timestamps) with no roles, permissions, memberships,
  credentials, execution/agent authority, provider IDs, Telegram/OS/Git/location/
  relationship fields — verified at type, storage-input, and API-field levels. PASS.
- `HumanPrincipal` remains identity-only (zero diff). PASS.
- Knowing "Eddie" confers nothing: the projection carries a display string only;
  no code path on this diff reads it as permission, membership, role, credential,
  or execution authority; audit actions record administration, not grants. PASS.
- The serialization that WOULD reach a model is authority-free (§7). PASS.
- Residual exposures are F-01 (anonymous read of the governed name + existence
  oracle) and F-05 (admin-controllable system-text injection, structurally
  contained). Neither confers authority, but F-01 is a genuine confidentiality/
  boundary defect.

---

## 14. Findings

| ID | Severity | Title | Detail |
|---|---|---|---|
| F-01 | HIGH | GET representation lacks the explicit bearer-token guard | POST/PUT return 401 without a token; GET relies on `requireRole` alone, and `authenticate()` grants anonymous `local-operator` the `admin` role. Anonymous read of `preferredName` + principal-existence oracle. Fix: same explicit 401 block as POST/PUT. Add auth tests (anon GET ⇒ 401; wrong-role ⇒ 403). |
| F-02 | HIGH | Migration group inserted before trailing decision-wait group | `HUMAN_IDENTITY_REPRESENTATION_MIGRATIONS` sits before `ORCHESTRATION_DECISION_WAIT_MIGRATIONS`, violating the file's append-only rule; `verifyAppliedLog` is positional and throws `SchemaMetadataInconsistentError` on existing DBs. Fix: move group to true trailing position; add upgrade test (DB migrated under old manifest → migrate under new). |
| F-03 | HIGH | Assembled identity block reaches neither provider transport | OpenCode submits `parts=[userText]` + surface-only `system`; Codex runs `lastUserText` only. 004C delivery claim contradicted (fail-safe direction: no leak, no authority). Fix (bounded): forward the bounded identity block via OpenCode `system` (compose with surface block) and Codex thread instructions; add adapter-level transport tests proving equivalence of semantics. Alternatively narrow the architecture claim — but silent no-op delivery must not ship as "complete". |
| F-04 | MEDIUM | Storage conflicts surface as HTTP 500 | Missing/inactive principal, duplicate POST, PUT-without-existing → unmapped 500. Fail-closed but wrong codes; untested. Fix: map to 404/403/409/404 with tests (T-02). |
| F-05 | LOW | Raw `preferredName` interpolation into system text | Structurally contained (single system message) + admin-only writes + 200-char cap; hostile values can still inject instruction-like text inside the system block. Fix (bounded): collapse whitespace/newlines at validation, add hostile-value test (T-07). No heavy sanitizer. |
| F-06 | NOTE | `get()` returns rows for inactive principals; GET conflates missing-principal with absent-representation | Resolver independently enforces active/active, so no projection impact. Consider aligning read semantics or documenting intentionality. |
| F-07 | NOTE | Length cap (200) enforced at storage, not API | Over-long names fail as 500s (links F-04); validate length at the boundary when fixing F-04. |
| T-gaps | NOTE (tests) | T-01…T-08 enumerated in §10 | Missing tests are recorded separately from defects; T-02/T-03/T-05/T-06 gate the fixes above. |
| S-01/S-02 | NOTE (scope) | Interleaved worktree; 002D provisioning ships alongside | No action required beyond keeping 004's deployment reverifiable independently. |

Minimum bounded corrections required before deployment: F-01, F-02, F-03
(incl. T-02/T-03/T-05/T-06 proof), plus F-04 mapping for the touched endpoints.
F-05/F-06/F-07 may ride along or be tracked as follow-ups; they are not
deployment blockers.

---

## Deployment recommendation

**HOLD_FOR_FIXES**

The identity/context boundary itself is sound — representation is genuinely
principal-scoped and authority-free, the resolver is strictly fail-closed, and
the model-visible wording (`Current human identity context: Preferred name: …`)
describes identity only and confers no permission, membership, role, credential,
disclosure, or execution authority. The HOLD is not for an authority leak (none
was found). It is for three bounded defects: an anonymously readable admin GET
(F-01), a migration ordering violation that fails closed against existing
databases (F-02), and an end-to-end delivery break in which the assembled
identity context reaches neither provider transport, contradicting the 004C
provider-neutrality claim (F-03) — plus unmapped HTTP error semantics (F-04).
Fix F-01/F-02/F-03/F-04 with their linked tests, then re-review narrowly.
