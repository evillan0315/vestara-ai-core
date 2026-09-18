---
title: RAG Dogfood Baseline — Personal Data Q&A (Pre-RAG)
version: 0.1.0
status: draft
owner: vestara
last-reviewed: 2026-09-17
next-review: 2026-10-17
---

# RAG Dogfood Baseline Case 001 — "What personal data does Vestara process?"

| Field | Value |
|---|---|
| Status | DRAFT (evaluation fixture, not policy) |
| Version | 0.1 |
| Product | Vestara |
| Last Updated | 2026-09-17 |
| Review Required | Legal (before any publication beyond engineering use) |
| Answering system | Pre-RAG assistant (repository search + LEGAL-TRUST-001 corpus), model on record in session |
| Purpose | Baseline test case for the future RAG milestone: ask exactly the same question after RAG is implemented and compare |

## The exact question (frozen — do not rephrase in reruns)

> What personal data does the current version of Vestara process, where is it
> stored, and which data may leave the local machine? Show authoritative
> evidence and distinguish CURRENT, PLANNED and UNKNOWN.

## Baseline answer (verbatim, 2026-09-17)

> # Personal data in Vestara — CURRENT vs PLANNED vs UNKNOWN
>
> Grounded in the LEGAL-TRUST-001 audit (`docs/legal/PRIVACY-POLICY.md`,
> `AI-PROVIDER-DISCLOSURE.md`, `DATA-RETENTION-DELETION-POLICY.md`). Full
> detail lives there; this is the summary.
>
> ## What personal data Vestara processes (CURRENT, evidenced)
>
> | Category | Evidence |
> |---|---|
> | Conversations + messages (incl. transcripts, audio timelines) | SQLite-backed stores: `packages/conversation-runtime/src/conversation-store.ts` (`conversations/…conversations.db`), `session-store.ts` (`conversation_sessions`, `session_transcripts`, `session_audio_timeline`), `packages/interaction-persistence/src/sqlite-store.ts` |
> | User profile (name, latest-profile row) | `user-profile-store.ts` (`user_profiles` table) |
> | Identity/account rows (`user_id` on conversations) | `conversation-store.ts` `INSERT INTO conversations (…, user_id, …)`; canonical registry `docs/IDENTITY-OWNERSHIP.md` |
> | Workspace/repository/file content scanned for context | `VESTARA_REPO` binding, change-event bridge `apps/api/src/bridges/change-event-bridge.ts`, diagnostics workspace scan |
> | Host/system info (CPU, memory, disks, network, GPU, Docker, processes) | `apps/api/src/diagnostics/collect.ts`; `@vestara/host-runtime` (OS-0, read-only) |
> | Provider/model metadata + credentials | OpenCode config projections (keys stripped, `apps/api/src/workspace-context.ts`); live credentials in gitignored `.env` (`AGENTS.md`) |
> | Telemetry/logs/diagnostics, evidence bundles, captures/artifacts | `@vestara/telemetry`, evidence pipeline, `@vestara/screen-capture` (portal-mediated, opaque tokens) |
>
> ## Where it is stored (CURRENT)
>
> **On the local host.** File-backed SQLite databases (exported via `db.export()`
> to `dbPath`, e.g. under `conversations/`), local logs, local telemetry sinks,
> local evidence stores. No off-machine persistence evidenced. Default API bind
> is loopback `127.0.0.1:3001`.
>
> ## What may leave the local machine (CURRENT — this is the critical part)
>
> 1. **AI provider transmission.** Assistant turns flow `apps/api` → OpenCode
> adapter → `127.0.0.1:4096` (`workspace-context.ts:836`,
> `assistant-opencode-adapter.ts:287,337`, `opencode-supervisor.ts:17`) →
> configured external provider/model. Prompts, context, file excerpts, and tool
> results sent to an external model **leave the machine by design**. Do not
> assume locality when an external model is selected.
> 2. **OAuth/integration flows.** OpenCode OAuth routes
> (`/provider/{id}/oauth/*`, `/api/integration/…/connect/oauth`) exchange tokens
> with third parties.
> 3. **Operator-initiated egress.** websearch/webfetch, browser services, and any
> logs the operator manually attaches to bug reports.
>
> **NOT evidenced leaving:** telemetry has no off-machine endpoint found —
> local-only is an evidence statement, not a guarantee.
>
> ## PLANNED (not current)
>
> Vestara-native Google/GitHub login, public Marketplace registries,
> cloud/headless workers (future cloud processing has **no** evidenced handling
> — `PRIVACY-POLICY.md` §3 holds this as LEGAL REVIEW REQUIRED).
>
> ## UNKNOWN (deliberately unstated)
>
> Controller identity/contact; retention periods and deletion SLAs; data-subject
> rights procedure; provider retention/training-use terms; international
> transfers. One precision since the audit: `session-store.ts`/
> `user-profile-store.ts` contain **per-record** `DELETE` statements in store
> internals — but no user-facing erasure or export API was evidenced, so the
> UNKNOWN on deletion/export rights stands.
>
> **Bottom line:** today Vestara is a local-first system whose one routine
> external data path is the AI provider you configure — everything you send to
> an external model, plus OAuth token exchanges, leaves the machine; everything
> else stays in local SQLite/logs/evidence.

## Rerun protocol (future RAG milestone)

1. Ask the frozen question verbatim against the RAG-enabled Assistant.
2. Score the RAG answer against the baseline on the four dimensions below.
3. Record the rerun (date, corpus version, retrieval config, scores) in a new
   dated section of this file or a companion `*-rerun-*.md`.

## Scoring dimensions (0–2 each)

| Dimension | 0 (regression) | 1 (parity) | 2 (improvement) |
|---|---|---|---|
| Provenance | Fewer or vaguer citations than baseline | Same file/line-level citations | Citations resolve to pinned corpus versions with chunk IDs |
| Precision | Invents behavior or drops categories | Matches baseline categories, no invention | Adds evidenced categories the baseline missed, still no invention |
| Contradiction handling | Contradicts corpus (e.g. claims compliance, guarantees locality) | No contradictions | Detects and flags corpus-internal tensions explicitly |
| CURRENT/PLANNED/UNKNOWN classification | Collapses or omits the tags | Tags every material claim as baseline does | Correctly reclassifies items whose status changed (with evidence of the change) |

## Corpus snapshot for this baseline

- `docs/legal/` v0.1 (14 files, DRAFT, LEGAL-TRUST-001 closeout 2026-09-17).
- `docs/architecture/VES-BASELINE-001-*.md` v0.1.0.
- Code evidence: `apps/api/src/workspace-context.ts`,
  `assistant-opencode-adapter.ts`, `opencode-supervisor.ts`,
  `packages/conversation-runtime/src/*-store.ts`,
  `packages/interaction-persistence/src/sqlite-store.ts`,
  `packages/external-runtime/src/redact.ts`, `apps/api/src/diagnostics/collect.ts`.

## Reruns

_None yet — RAG is future work (DO NOT IMPLEMENT under this fixture)._
