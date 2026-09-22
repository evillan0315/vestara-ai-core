---
title: VESTARA-CHECKPOINT-001 — Activity Room Operations and Attention Convergence Evidence
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-22
next-review: 2026-10-22
---

# VESTARA-CHECKPOINT-001 — Activity Room Operations and Attention Convergence Evidence

**Checkpoint theme**: Activity Room operational control surface and attention convergence
**Date**: 2026-09-22
**Branch**: `main` → `origin/main`

---

## 1. Canonical Activity Path (convergence decision)

```
Provider/runtime
    -> normalized lifecycle/event
    -> EventBus
    -> Activity projection (M9 durable -> M10/M11A/M11B)
    -> Needs Attention / Activity UI
```

OpenCode and Codex converge into canonical Activity semantics
(`message.part.updated` with `part.type=tool`) rather than requiring
provider-specific Activity Room rendering. The Codex assistant adapter
mirrors `command_execution` start/completion/failure as
`codex.message.part.updated` tool-part events onto the kernel EventBus
(fire-and-forget; mirror failures never break a Codex turn), and the M9
ingestion bridge ingests both `opencode.message.part.updated` and
`codex.message.part.updated` through the same `fromToolEvent` adapter with
callID/operation-id correlation. No execution semantics changed —
observation only.

Wiring: `apps/api/src/assistant-codex-adapter.ts`
(`createCodexToolPartEvent`, `eventBus` option) →
`apps/api/src/workspace-context.ts` (`eventBus: kernel.eventBus`) →
`packages/activity-room/src/m9-ingestion-bridge.ts`.

## 2. Needs Attention Is a Derived Current-State Read Model

Needs Attention is **not** a second issue tracker and **not** the authority
for diagnostics. It is a derived, current-state read model projected from:

```
Activity lifecycle
System diagnostics
Repository verification
        ↓
Attention projection
        ↓
Needs Attention
```

Principle: **historical failure != currently unresolved attention.**
Recovery / superseding authoritative state resolves attention where the
owning lifecycle supports it:

- Diagnostics: latest snapshot per source wins; a healthy snapshot
  supersedes earlier degraded/unhealthy ones (resolution by omission).
- Repository verification: a failed check resolves only when the **same
  change set + check** later passes; unrelated passing checks do not clear
  open items.
- New `AttentionEntry` fields carry the derivation honestly:
  `sourceRef` (generalized non-Activity source identity),
  `scope`, `sourceFindingId`, `resolutionReason`,
  `firstObservedAt` / `lastObservedAt`, plus new categories
  (`system`, `repository`, `configuration`, `integration`, `security`).

The M11A attention endpoint merges projection attention + legacy attention
+ system diagnostic attention (15s cache) + repository verification
attention, dedupes by canonical key (`sourceRef.kind:id` for
non-Activity sources), and serves open entries sorted by severity/recency.

## 3. Reference Handoff

```
Attention/reference selection
    -> composer structured reference
    -> durable message reference identity
    -> turn surface context
    -> provider/runtime context
```

User message text remains unchanged. `referencedActivityIds` now transports
reference namespaces beyond literal Activity IDs
(`diagnostic:*`, `finding:*`, `verification:*`), resolved to labeled turn
surface references without an Activity lookup, and accepted by
`referenceExists` without weakening Activity validation.

**Contract debt (recorded, not refactored here)**:
`referencedActivityIds` semantically overloads "Activity ID" with generic
reference namespaces. It should eventually evolve toward a typed generic
reference contract.

## 4. Activity Room Capability Status (implemented + test-verified)

- Live Activity stream (M9 → M10 → M11A snapshot/history → M11B realtime)
- Participants and agent targeting
- Needs Attention queue with system + repository convergence and rich
  attention-to-composer detail (`attentionDetailContent`)
- Detail drawer (keyboard-accessible) with Tool Result details
- Reference-to-composer (Activity + diagnostic/finding/verification
  namespaces) with durable message reference identity
- Multiline composer with staged file attachments
- Dockable/resizable utility surfaces: Terminal, Files/editor, Settings,
  Browser (left/right/bottom dock edges, persisted sizes)
- Terminal crash fix: optional `onData` chaining in `TerminalPane`
- Screenshot preview/reference/share/save flow (attach saved screenshot as
  composer file reference)
- Browser / agent-browser live dashboard embedding (`ActivityBrowserPanel`
  iframe; Vestara owns only the dock shell + availability boundary —
  agent-browser remains authoritative for sessions/streaming/automation;
  dashboard URL via `VESTARA_AGENT_BROWSER_DASHBOARD_URL` /
  `VITE_AGENT_BROWSER_DASHBOARD_URL`, surfaced through
  `/api/runtime/status` as `browserDashboardUrl`)
- Operation Controls, density/theme token integration (Vestara tokens only)

Architectural rule preserved: **Activity Room is a control/projection
surface. It does not become the authority for every subsystem it
observes.**

## 5. Milestone Reconciliation

| Item | State | Evidence class |
| ---- | ----- | -------------- |
| CODEX-OBS-001 (Codex tool lifecycle → EventBus → M9 bridge) | Implemented + focused-test verified | TEST VERIFIED; live Codex → Activity Room dogfood NOT YET RUNTIME VERIFIED (requires API restart/rebuild) |
| ATTENTION-INTELLIGENCE-001 (system/repository attention convergence) | Implemented + focused-test verified + live dogfood (diagnostic path) | Diagnostic attention: RUNTIME/DOGFOOD VERIFIED (live detection → Needs Attention appearance → automatic resolution on recovery; §6a). Repository verification attention: TEST VERIFIED only. Deferred authorities recorded below |
| AR-BROWSER-001 (direct agent-browser dashboard embedding) | Implemented + focused-test/build verified | TEST + BUILD VERIFIED; session invariance / WebSocket behavior per existing agent-browser guarantees; runtime/config caveats preserved (dashboard URL defaults to `http://localhost:4848`, availability boundary with retry) |
| Reference namespaces (`diagnostic:`/`finding:`/`verification:`) | Implemented + focused-test verified | TEST VERIFIED |
| Terminal `onData` hardening | Implemented | TEST VERIFIED (neighbor suites) |
| FILES-SEARCH-001 (deep recursive Files search) | Planned / pending | NOT IMPLEMENTED — not marked complete |
| RAG vertical slice | Next major planned capability | NOT IMPLEMENTED — no progress fabricated |
| Google Drive / Calendar integrations | Roadmap only | NOT IMPLEMENTED |
| Native Vestara calendar / scheduling, WebRTC conferencing | Later / planned where previously documented | NO NEW COMMITMENTS |

## 6. Verification Evidence (this checkpoint)

- `git diff --check`: clean.
- `packages/activity-room` focused suites: `attention-system`
  (diagnostic projection by source identity; latest-wins + resolve-by-omission;
  verification keep-unrelated-open + same-check-resolution),
  `activity-references` (system namespaces resolve without Activity lookup),
  `assistant-turn-references`, `projection-honesty` — green.
- `apps/api` focused suites: `assistant-codex-adapter`
  (canonical `codex.message.part.updated` tool-part shape), `surface-context`
  — green.
- Workspace UI production build (`pnpm --filter @vestara/workspace-ui build`):
  see checkpoint commit trailer / push verification.
- Classes distinguished: TEST VERIFIED vs BUILD VERIFIED vs
  RUNTIME VERIFIED vs NOT YET RUNTIME VERIFIED. No evidence class upgraded
  into another.

## 6a. Runtime Dogfood — Diagnostic Attention Resolution Lifecycle (2026-09-22)

**Scope**: diagnostic portion of ATTENTION-INTELLIGENCE-001 only
(repository verification attention remains TEST VERIFIED).

Observed live against a running API / Activity Room session (screenshot +
session observation):

1. **Detection** — live system diagnostic reported
   `SYSTEM — API Server Process`, process memory
   **94% heap used (68MB / 72MB)**, severity **Attention Required · High**.
2. **Projection + real-time appearance** — that condition appeared in
   Needs Attention without manual registration. Attention count moved
   **10 → 12** as additional live diagnostic conditions were detected.
3. **Authoritative recovery → automatic resolution** — when a later
   healthy diagnostic snapshot superseded the degraded one, the memory
   entry **disappeared from Needs Attention** with no manual acknowledge
   or delete action.

Observed lifecycle (matches §2 resolve-by-omission):

```text
Diagnostic snapshot
      ├── memory normal ──────────────┐
      └── memory 94% ──→ attention OPEN
                later healthy snapshot
                         ▼
                  attention RESOLVED
                         ▼
            removed from Needs Attention
```

**Evidence class upgrade (diagnostic path only):**

| Stage | Class |
| ----- | ----- |
| Detection (high-heap condition raised) | RUNTIME VERIFIED |
| Attention projection into Needs Attention | RUNTIME VERIFIED |
| Real-time appearance / count change (10 → 12) | RUNTIME VERIFIED |
| Authoritative recovery → automatic resolution/removal | RUNTIME VERIFIED |

**Doctrine confirmed at runtime**: Activity preserves history; Needs
Attention reflects what requires intervention *now*. Recovery of the
owning diagnostic authority clears the derived entry — Needs Attention
did not become a second tracker that required manual cleanup.

**Not claimed by this dogfood**: repository-verification attention
resolution, Observer finding lifecycle authority, governed worktree
attention, CODEX-OBS-001 live path, or any other deferred authority (§8).

## 7. Known Gaps / Next Work (repository-supported only)

1. Live CODEX-OBS-001 runtime dogfood after API restart/rebuild.
2. Codex/per-turn actor attribution convergence.
3. Governed worktree/repository attention authority.
4. Durable Observer finding lifecycle (projection exists via
   `projectObserverFindingAttentionEntries`; lifecycle authority deferred).
5. Deep recursive Files search (FILES-SEARCH-001) — still pending.
6. Generic typed reference contract replacing the semantic overload of
   `referencedActivityIds`.
7. RAG vertical slice — next major planned capability.
8. Google Drive / Calendar integrations (if already on roadmap).
9. Later native Vestara calendar / scheduling.
10. Later WebRTC conferencing / screen sharing (if already planned).

## 8. Deferred Authorities (explicit)

- Governed worktree state is **not** an attention authority in this
  checkpoint.
- Observer lifecycle is **not** the attention authority; only the finding
  projection exists.
- Agent-browser remains authoritative for browser sessions; the Activity
  Room embeds and observes only.
- Diagnostics and verification stores remain authoritative for their own
  state; Attention only derives.
