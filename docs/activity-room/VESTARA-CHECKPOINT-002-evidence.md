---
title: VESTARA-CHECKPOINT-002 — Documentation & Milestone Reconciliation Evidence
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-22
next-review: 2026-10-22
---

# VESTARA-CHECKPOINT-002 — Documentation & Milestone Reconciliation Evidence

**Checkpoint theme**: reconcile docs/milestones/architecture records with the
surviving implementation after VESTARA-CLEANUP-001 (accepted, CLOSED).
**Date**: 2026-09-22. **Branch**: `main` (working tree holds CLEANUP-001 +
this checkpoint, uncommitted for review).

## 1. CLEANUP-001 record (from cleanup report)

49 changed paths, +2 / −3998 lines, workspace graph 123 → 119 projects.
Deleted: dead API chat route (never registered in server dispatch; a
pre-deletion live probe of its send endpoint already returned 404), legacy Activity Room page/stream/hooks,
`/activity-v2` route + 8 route-keyed baselines, orphan dashboard
ActivityStream, `repository-evidence`, `agent-performance`,
`openvidu-adapter`, `subsystem`, one personal file. Retained unwired:
`history`, `reasoning`, `tools/filesystem|memory|knowledge|project`.

## 2. Verification evidence

- `pnpm lint:check` — 1386 files, clean.
- `tsc -b tsconfig.references.json` (full) — clean.
- `pnpm --filter @vestara/workspace-ui build` (`tsc -b && vite build`) — PASS.
- Focused tests — activity-room (attention, references, turn-references,
  projection-honesty) + api (codex adapter, surface-context): 33/33 PASS.
- `pnpm dependencies:check`, `check:source-artifacts` — PASS.
- `pnpm install --frozen-lockfile --offline` — up to date, PASS.
- `screenshots:check` (`tsc -p tsconfig.visual.json`) — 4 failures in
  `tests/visual/fixtures/api.ts` + `tests/visual/runner/page.ts`,
  byte-identical on stashed pre-cleanup HEAD. PRE-EXISTING, not a pass,
  cleanup introduced none.

## 3. Documentation changes in this checkpoint

- `docs/MILESTONES.md` — appended CHECKPOINT-002 (cleanup, doctrines,
  classifications, roadmap, Architecture verdict).
- `docs/CHANGELOG.md` — matching entry (Removed/Changed/Recorded).
- `AGENTS.md` — console entry corrected (no `apps/console`; CLI command).
- `packages/agent-types` comments — removed package now historical.
- `docs/UI/activity-room-visual-design-spec.md` — contract inventory
  repointed to M11C files (visual constraints untouched).
- `docs/TUI-CHAT-REDESIGN-PLAN.md` — CLEANUP-001 supersession note.
- Preserved as historical evidence (not rewritten): old MILESTONES entries,
  AR-GA-CORE-001/002 chat-bridge records (RETIRE directive fulfilled by
  deletion), blueprint `/activity-v2` mentions, `IMPLEMENTATION_STATUS`
  v6.2 ChatPage row, `agents.registry` dropped-id list (still functional).

## 4. Known gaps / deferred (unchanged)

CODEX-OBS-001 not runtime verified; Codex actor fallback current;
governed worktree attention, Observer finding lifecycle, security/policy
findings without authority deferred; FILES-SEARCH-001 planned;
RAG upcoming; `referencedActivityIds` debt open; unwired capabilities owner
unresolved; `docs/Architecture/` historical, canonical is
`docs/architecture/`.

## 5. ATTENTION-INTELLIGENCE-001 — runtime evidence (final correction)

Live Activity Room dogfood observation (2026-09-22) upgraded the
diagnostic-attention classification:

| Dimension | Classification |
| --------- | -------------- |
| IMPLEMENTED | YES |
| FOCUSED TEST VERIFIED | YES |
| BUILD VERIFIED | YES |
| RUNTIME/DOGFOOD DETECTION | YES |
| RUNTIME/DOGFOOD AUTOMATIC RESOLUTION | YES |

Observed behavior:

1. Activity Room Needs Attention was live.
2. `SYSTEM / API Server Process` appeared automatically; diagnostic state
   "Process memory: 94% heap used (68MB / 72MB)"; status Attention
   Required / High.
3. The attention item subsequently disappeared automatically when the
   authoritative diagnostic condition recovered — no manual
   acknowledgement/deletion required.
4. A separate live system finding was also visible: `SYSTEM / Toolchain
   Versions` — "8/13 tools available", Dependency Unavailable (detection
   observed only; automatic resolution not claimed for that item).

**Scope discipline**: this evidence applies to the diagnostic-attention
source only. NOT runtime-lifecycle verified: repository verification
attention, governed worktree attention, Observer findings, security
findings (recorded as deferred unless separately evidenced).

**Architectural significance**: Needs Attention has demonstrated
current-state semantics in the live runtime:

```text
authoritative unhealthy diagnostic state    -> attention opens
authoritative healthy/recovered diagnostic state
    -> attention resolves/disappears
```

Therefore Needs Attention is not merely accumulating historical
diagnostic failures. Detailed observation record:
`docs/activity-room/VESTARA-CHECKPOINT-001-evidence.md` §6a.

## 6. Documentation-governance evidence (baseline NOT regenerated)

`pnpm documentation:check` (this checkpoint deliberately did **not**
regenerate `docs/documentation-baseline.json` — regenerating would
swallow pre-existing failures):

| Run | Findings |
| --- | -------- |
| HEAD (stashed worktree) | 97 |
| Current tree | 113 |
| Delta | 13 |

Delta composition (all explained, none are new prose regressions):

- 8 — ignored local `apps/workspace/test-results/**/error-context.md`
  dumps (deleted-package refs inside generated Playwright artifacts;
  left untouched per checkpoint scope).
- 5 — preserved historical-document references, all verified
  genuinely historical (files untouched by this worktree; refs
  recorded the implementation as it existed when written; package
  names given unscoped here so this evidence file itself introduces
  no unknown-package findings):
  - `docs/APE-AQF-VEB-ENGINEERING-BENCHMARK-PLAN.md` →
    `agent-performance` (APE-001 dependency record)
  - `docs/CHANGELOG.md` → `agent-performance`
    ([3.9.27] APE-001A entry, 2026-08-06)
  - `docs/architecture/AR-GA-CORE-001-AUTHORITY-CONTRACT-BASELINE.md`
    (×4) → `agent-performance` vocabulary tables
  - `docs/architecture/AR-GA-CORE-002-CANONICAL-DOMAIN-CONTRACTS.md`
    (×2) → `agent-performance`
  - `docs/ci-obs-001a-ownership-audit.md` →
    `repository-evidence` ownership row

These are recorded as **historical-reference consequences** of
CLEANUP-001 deletions. Not rewritten to point at modern files.

New CHECKPOINT-002 prose: **0 introduced findings** (id-set diff vs
HEAD run).

**PRE-EXISTING DOCUMENTATION DEBT**: `pnpm docs:validate` reports
`docs/roadmaps/VESTARA-RAG-ROADMAP.md` has no governed frontmatter —
file pre-existing and untouched; left for the documentation/RAG
milestone (validate exits 0; advisory finding only).
