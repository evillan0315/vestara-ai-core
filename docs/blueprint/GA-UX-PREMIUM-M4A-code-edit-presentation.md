# GA-UX-PREMIUM M4A — Authoritative Code Edit Presentation

**Status:** IMPLEMENTED (deterministic presentation acceptance)
**Baseline:** M3.2 commit `c04acc2` frozen (`assistant.execution.v1` with `patch` / `hunks` / `diffRepresentation`)
**Live diff acceptance:** explicitly deferred to **M4B** (`M4 DATA CONTRACT READY YES`, `M4 LIVE DIFF EVIDENCE READY NO`)
**Scope:** `AssistantCodeEdit` presentation only — no OpenCode snapshot/diff changes, no fabricated live evidence, no M5/M6/M7/GA-CAP-002/AR-009.

---

## 1. Component

`apps/workspace/src/components/assistant/AssistantCodeEdit.tsx` — a presentation-only
surface consuming the typed `EditExecutionDetail` contract. It never discovers
edit evidence from status prose, Assistant response text, tool output, repository
rereads, git diff, or browser state.

| Representation | Behavior |
|---|---|
| `diffRepresentation = 'patch'` | Renders the runtime patch string directly. Diff lines are visually classified by prefix (`+` / `-` / `@@`) **for presentation only** — the authoritative object stays the runtime patch string; never converted into `AssistantEditHunk`, never claimed as structured-hunk line metadata. |
| `diffRepresentation = 'hunks'` | Renders runtime structured hunks; optional line metadata (`oldStart`/`oldLines`/`newStart`/`newLines`) preserved exactly; missing fields stay absent (never manufactured, no `0`/`prev+1`/index). |
| `diffRepresentation = 'unavailable'` | Restrained `✓ Modified ConversationPanel.tsx / Diff unavailable` — no empty diff box, no implication that no change occurred. Edit lifecycle (`completed`) and diff evidence (`unavailable`) are visually distinct. |

Header grammar (per spec): operation label (`Added`/`Modified`/`Deleted` from the
authoritative `operation` field — never inferred from empty content), **filename
primary** (stronger hierarchy), repository-relative path secondary (truncated with
`title` tooltip; unrestricted absolute paths never exposed), `+N -N` counts only
when the contract supplies them (absent stays absent, never defaulted to `0`),
lifecycle indicator (● running / ✓ completed / ✕ failed).

## 2. Data flow

- **Hook** (`useAssistantConversation`): new additive return `structuredEdits:
  StructuredEditOperation[]` (parallel to `toolOperations`; M2 shape unchanged).
  Collected from SSE `status` and `tool_result` events carrying an
  `assistant.execution.v1` detail of kind `edit`; deduped/upserted by
  `operationId` (later evidence replaces earlier — e.g. running `file.edited`
  → completed patch); cleared per turn. `supersedesOpId` resolves the matching
  generic M2 operation via the M3 operationId map.
- **Timeline** (`AssistantExecutionTimeline`): a structured edit with a matching
  `supersedesOpId` **supersedes** the generic M2 row (one operation, one
  presentation); unrelated M2 operations are preserved; standalone structured
  edits render too.
- Browser imports stay **type-only** from `@vestara/shared` (no runtime value
  import — the Vite `/@fs` linked-CJS constraint documented in M3).

## 3. Collapse / expand

Deterministic, bounded rule (`resolveDefaultExpanded`): changed lines =
`additions + deletions` (when present), else counted from patch/hunk lines; edits
with ≤ 12 changed lines (or unknown count) default **expanded**, larger default
**collapsed** (`▸ ConversationPanel.tsx +42 -18`). No viewport guessing.
User expansion state lives in component state keyed by a stable op id — an
unrelated streaming text delta re-renders the parent but does **not** reset it
(regression-tested).

## 4. Responsive containment

The diff body is `max-w-full overflow-x-auto` with `min-w-max` lines — long code
lines scroll **inside** the diff surface; the FloatingPanel is never widened.
Verified at 480px (narrow) and 1280px (expanded) viewports; `scrollWidth >
clientWidth` asserted for the long-line case.

## 5. Truncation

`patchTruncated = true` → visible `Diff preview truncated` badge (amber);
`hunksTruncated = true` → same. The user can never mistake bounded evidence for
the complete runtime diff. Truncation flags are derived by the M3.2 normalizer
and surfaced verbatim.

## 6. Actions

Only `Copy path`, `Copy diff` (patch string or hunks serialized as presentation
text), and expand/collapse. **No** Apply / Accept / Reject / Revert / Run —
M4A remains observational.

## 7. Tests

`apps/workspace/__tests__/ga-ux-premium-m4a-code-edit.test.tsx` (26 cases):
runtime patch renders; patch text preserved verbatim; patch line classification
(+/-/@@/context); structured hunks render; absent hunk line metadata stays
absent; unavailable produces no fake diff; completed+unavailable stays completed;
failed lifecycle visibly unsuccessful; Added/Modified/Deleted; counts present;
counts absent; patch truncation; hunk truncation; multiple edit operations;
same-name edits distinguished by operationId; matching generic M2 operation
superseded; unrelated M2 operation preserved; collapse/expand; expansion survives
streaming update; narrow containment; long-line internal overflow; Copy path;
Copy diff; no Apply/Accept/Reject/Revert; no repository reread (fetch never
called); no patch→hunk authority conversion; borderless final response +
Copy/Share preserved (M1/M2 lane). Hook-level: `structuredEdits` collection,
dedupe by operationId, supersession correlation.

**Combined Assistant lane: 379/379** (26 files: M4A + M3.2 + M3.1 + M3 + M2 + M1 +
GA-UI-004/005/006 + shared + api + opencode-runtime + tui-protocol).

## 8. CONTRACT-FIXTURE VISUAL ACCEPTANCE

Deterministic fixture harness (not live runtime evidence) at `/m4a-demo`
(`apps/workspace/src/pages/M4aDemo.tsx`), permanently labeled
**CONTRACT-FIXTURE VISUAL ACCEPTANCE**. Fixtures cover: small patch (expanded),
large patch (collapsed), added file, deleted file, truncated patch, unavailable
diff, structured hunks, narrow containment (320px), expanded width. Evidence
screenshots captured via Playwright (`tests/visual/ga-ux-premium-m4a.spec.ts`)
under `apps/workspace/tests/visual/.artifacts/ga-ux-premium-m4a/` — evidence
only, `enabled: false` route, never a CI baseline gate.

## 9. M4B readiness note

The presentation layer is complete against the authoritative contract. Live
acceptance (M4B) requires the OpenCode session-diff mechanism to populate
(authorization + runtime/config work, out of scope here) so a real runtime patch
can be compared end-to-end. Nothing in M4A assumes live evidence.