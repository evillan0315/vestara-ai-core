---
title: SETTINGS-ENV-E2 — Writable Environment With Per-Env Targeting
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-10-16
next-review: 2026-11-16
---

# SETTINGS-ENV-E2 — Writable Environment With Per-Env Targeting

**Milestone:** SETTINGS-ENV-E2 (follows E1 read-only registry, `GET /api/system/environment`).
**Scope:** Add governed mutation authority over dotenv files so Vestara Settings can add/update
environment variables per environment (dev `.env`, prod `.env.production`).
**Authority reminder:** Settings is a projection/control surface, not execution authority.
Dotenv files are the persistence authority for process boot; `process.env` remains boot-loaded
and is never mutated at runtime.

## 1. Objective

Enable an operator (admin only) to add or update a curated environment variable for a chosen
environment (dev or prod) from Vestara Settings (API + UI), with:

- registry-gated writes (only names in the E1 `REGISTRY` are writable; unknown host/session
  variables stay invisible **and** unwriteable),
- secrets that are write-only (accepted, never serialized back),
- atomic, comment-preserving dotenv edits with backups,
- honest restart signalling (`restartRequired` computed from persisted ≠ boot snapshot),
- a full audit trail.

## 2. Non-goals

- No new unknown-variable discovery: E2 does not enumerate `process.env` and does not allow
  writing arbitrary names. The registry remains the allowlist (E1 invariant preserved).
- No hot-reload of `process.env`: the API process keeps boot-loaded env. E2 reports drift;
  it does not apply it.
- No SettingsStore overlap: module settings (SQLite) stay separate from process env (dotenv).
  E2 does not merge the two authorities.
- No per-variable rollback UI in v1 (backups exist on disk; restore is manual or a later E3).

## 3. Current state (E1, verified)

- `apps/api/src/routes/system-environment.ts` — curated `REGISTRY`, `projectEntry()` attribution
  across environment/config/default layers, `editable: false` and `restartRequired: false` always.
- `GET /api/system/environment` — local-session read, no role gate; secrets presence-only via
  `isSensitiveKey()` (`packages/external-runtime/src/redact.ts`).
- UI `apps/workspace/src/pages/Settings/EnvironmentVariables.tsx` — read-only projection.
- Env files: `.env` (base, dev, `VESTARA_API_PORT=3001`) + `.env.production` (prod overrides,
  `VESTARA_API_PORT=3000`), loaded via repeated `node --env-file` (later wins). Both gitignored.
- Config layers (`packages/configuration/src/workspace-settings.ts`): default < user < workspace
  < session < command, with the environment overlay winning (matches `projectEntry()`).
- Auth: fail-closed Bearer (`apps/api/src/auth.ts`); admin gate via `requireRole(req, ctx, 'admin', res)`.

## 4. Authority model

1. **Registry is the allowlist.** `PUT` accepts only `name ∈ REGISTRY`. Anything else → `400`
   (`unknown-variable`). This preserves E1's "unknown host variables stay invisible" guarantee
   in the write direction.
2. **Target selects the file, never the layer.** `target: 'dev' | 'prod'` maps to `.env` /
   `.env.production` respectively. There is no "effective layer" write and no precedence
   invention: the file written is exactly the file named.
3. **Layered read-back stays truthful.** After a prod write, `GET` still resolves effective
   values with the existing overlay order (prod file wins when the API runs with it layered).
   The response reports which file holds the persisted value (`sourcePath`) separately from
   the effective value.
4. **Admin-only mutation.** Both read (unchanged, open) and write (new, `requireRole admin`).
   Read stays open so the UI can render state; every write is authenticated + audited.
5. **Secrets are write-only.** Request carries the value; responses (write ack, subsequent GETs)
   carry presence-only (`hasValue`, `masked: true`), exactly as E1. Values never touch logs,
   audit payloads, or error messages (reuse `redactValue()` defensively at every boundary).

## 5. API contract (proposed)

### `PUT /api/system/environment/:name`

Admin only. Body:

```json
{ "value": "3000", "target": "prod" }
```

Behavior:

1. `name` must be in `REGISTRY` → else `400 unknown-variable`.
2. `target` must be `dev` | `prod` → else `400 unknown-target`. (`dev` → `<repo>/.env`,
   `prod` → `<repo>/.env.production`. The repo root resolves exactly as the boot path does;
   never a caller-supplied path.)
3. Validate `value` (see §7) → `400 invalid-value` with a non-echoing reason.
4. Parse-preserving upsert into the target file (see §6), atomic write + backup.
5. Respond **without the value**:
   `200 { name, target, sourcePath, hasValue: true, sensitive, masked, restartRequired }`.
6. `restartRequired` is computed per §8.

Secrets: identical flow, except `value` is accepted and immediately dropped from all
subsequent handling (no echo, no diff, no backup-content logging — backups contain the value
by necessity, see §9).

### `DELETE /api/system/environment/:name?target=prod` (proposed, needs decision D2)

Removes the name from the target file only (comment-preserving). Effective value then falls
through to the remaining layers. Secrets: deletion is acknowledged presence-only.

## 6. Dotenv mechanics

- **Parse-preserving edit.** Keep comments, blank lines, ordering, quoting style, and
  `export ` prefixes. Upsert = replace the last active assignment of `name`, else append.
  Commented-out (`#NAME=`) lines are never treated as assignments.
- **Quoting/escaping.** Values containing `#`, spaces, quotes, or newlines are double-quoted
  with `\"` and `\\` escaped. Literal newlines in values are rejected (`400 invalid-value`:
  multiline secrets belong in files mounted as volumes, not dotenv).
- **Atomic write.** Write temp file in the same directory + `fsync` + `rename`. Never
  truncate-in-place.
- **Backup.** Before each write, copy target to `<file>.bak.<UTC-timestamp>` (same directory,
  gitignored via `.env.*`). Cap retention (e.g. keep last 10 per file, prune oldest) — see D3.
- **Concurrency.** Single-writer discipline: brief exclusive lock file (`<file>.lock` with
  PID + timestamp, stale after 30s) around read-modify-write. Concurrent API instances
  (dev + prod against one repo) must not interleave edits. Lock contention → `409 locked`,
  client retries.
- **No runtime application.** The running process never re-reads the file. Drift is reported,
  not applied (§8).

## 7. Validation

- Base: `ValidationEngine` (`packages/settings-framework/src/validation-engine.ts`) + registry
  per-entry validators.
- Minimum per-entry rules at ship: `VESTARA_API_PORT`/`PORT` ∈ 1–65535 integer (and warn on
  well-known collisions); `*_URL` must parse as URL with http/https scheme; `*_TIMEOUT_MS`
  non-negative integer; secrets minimum length (e.g. ≥16 chars) without echoing the value.
- Unknown-to-registry writes are rejected before validation (allowlist first).
- Error shape: `{ error: 'invalid-value', reason: '<non-echoing human reason>' }` — the reason
  must never contain the submitted value or any secret.

## 8. Restart semantics

- At boot, the API snapshots the resolved values of all registry names
  (`{ name → effectiveValue | <sensitive:presence> }`, in-memory only).
- After each write, recompute: `restartRequired = persisted file value ≠ boot snapshot`
  (for secrets: `presence/persisted-changed` rather than value comparison — a secret write
  always marks restart required since content cannot be compared).
- `GET /api/system/environment` returns the computed flag per variable (replacing E1's
  constant `false`) plus a file-level indicator when dev/prod file mtime postdates boot.
- UI renders a restart banner ("2 variables changed — restart the API to apply") with per-env
  scope (dev restart vs prod restart are different processes).

## 9. Threat model

| Threat | Mitigation |
|---|---|
| Secret exfiltration via API/UI/logs | Write-only secrets; presence-only responses; `redactValue()` at log/audit/error boundaries; UI masked inputs with no read-back |
| Privilege escalation (non-admin writes env) | `requireRole admin` on all mutation routes; read stays open |
| Dotenv injection (`\n`, `export`, `$(...)` smuggling) | Multiline rejected; quoting/escaping on write; values are data — the API never `eval`s dotenv (only `node --env-file` parses at boot) |
| Clobbered concurrent edits (dev+prod processes, two operators) | Atomic rename + lock file + `409` on contention; backups retained |
| Prod foot-gun (wrong port/URL kills prod) | Target is explicit in request + response; UI requires typing/selecting env per edit with prod styled as danger; backups enable manual restore |
| Backup files leaking secrets | Same directory (no new locations), gitignored (`.env.*` already ignored), restrictive mode `0600`, retention cap |
| Audit evasion | Every mutation logs actor + name + target + result (never the value) via the existing audit store |

## 10. UI changes (`apps/workspace`)

- `EnvironmentVariables.tsx`: per-row Edit (non-sensitive, prefilled) / Set-or-rotate
  (sensitive, empty write-only input); env target selector (dev/prod) per edit; `editable`
  comes from the API (registry-gated) rather than being assumed.
- Restart banner component when any `restartRequired` is true, scoped per env.
- Token governance: Tailwind maps to `var(--vestara-*)`; no hardcoded values; validate with
  `pnpm vds:validate`. Prod-danger styling uses status tokens, not hex.
- Data: API first; no new fixtures beyond empty-state copy.

## 11. Verification plan

- Unit: dotenv round-trip (comments/order/quoting preserved), validator matrix incl.
  rejection of multiline + echo-free errors, lock contention → `409`.
- Integration (temp repo, never `.vestara/` of the real tree): write dev → file content exact;
  write prod → only prod file changes; GET reflects `sourcePath` + `restartRequired`; secret
  write → GET shows presence-only; restart with layered files → effective values correct.
- Secret-leak scan: run the `secret-exposure` documentation rule's regex class plus a
  response-body grep over write-ack and GET payloads in tests — must be value-free.
- Gates: `pnpm lint:check && pnpm build && pnpm test`, `pnpm docs:govern`,
  `documentation:check` (new route references must resolve), `pnpm vds:validate` for UI.

## 12. Rollout

1. **Phase 1 (this design):** reviewed design doc only, no code.
2. **Phase 2:** API write path + tests + registry `editable` computation (E1 `false` constants
   become computed; GET shape otherwise unchanged).
3. **Phase 3:** UI edit flows + restart banner + `vds:validate`.
4. **Phase 4:** Baseline refresh (`documentation:baseline`) + changelog/milestone updates.

## 13. Decisions needed (Director)

- **D1.** Ship `PUT` only, or `PUT` + `DELETE` (unset) in v1?
- **D2.** Prod-write safeguard: explicit per-edit confirmation, or role-gate is enough?
- **D3.** Backup retention: keep-last-10 per file, or different policy?
- **D4.** Should `VESTARA_API_PORT` changes be blocked while the target env's API is running
  (refuse with `409`), or allowed with restart-required signalling?
- **D5.** Scope: Settings env only, or also surface `WorkspaceConfigurationService` user/
  workspace layers for `configKey`-mapped entries in the same UI?
