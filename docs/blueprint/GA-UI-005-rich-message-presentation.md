# GA-UI-005 — Rich Assistant Message Presentation

**Date**: 2026-09-04
**Status**: COMPLETE — deterministic tests green, stopping for visual review
**Prerequisites**: GA-UI-004 (accepted pending visual), GA-UI-003 (preserved)
**Out of scope (untouched)**: transport, OpenCode execution, SSE semantics,
provider/model resolution, permission policy, session continuity,
Conversation authority, Activity Room orchestration, AR-009.

---

## 1. Rendering-Path Audit (reuse, not a new stack)

The Workspace already owns a shared Markdown path, reused by the Floating
Assistant (`ConversationPanel` → `MarkdownRenderer`), workspace chat
(`AssistantMessage`, `MessageList`), `InteractionCard`,
`ExecutionDetailModal`, and activity surfaces. Evidence it is sufficient:

| Concern | Finding | Decision |
|---|---|---|
| Parser | `react-markdown@10` + `remark-gfm@4` (GFM: tables, lists, strikethrough, task lists) | Reuse |
| Highlighting | `rehype-highlight@7` over lowlight common subset + `highlight.js@11` CSS theme | Reuse; zero new bundle |
| Base styling | `.markdown` rules in `apps/workspace/src/styles/index.css` (paragraphs, headings, lists, inline code, pre, blockquote, hr, tables, links) | Reuse; one scoped addition (§7) |
| Raw HTML | No `rehype-raw` / `allowDangerousHtml` anywhere in the repo (verified by grep) — model HTML is escaped as text by construction | No change needed; proven by test |
| Links | No `a` override — default same-tab `<a href>` (navigation-hijack gap) | Added `SafeLink` (§5) |
| Code surface | `CodeBlock`/`Table` overrides in `chat/CodeBlock.tsx` | Hardened in place (§§3–4) |
| Languages | lowlight/common registers typescript, javascript, json, bash, **shell**, yaml, markdown, sql, css, xml (+ others); verified against the installed bundle | Zero-bundle `aliases` for the gaps (§4) |

No new Markdown dependency was introduced.

---

## 2. Preserved Turn Lifecycle (GA-UI-004 intact)

```
Human → optimistic message → Thinking… → operational status
      → progressively rendered response → completed rich response
      → Copy | Share
```

`ConversationPanel` required **no structural changes**: the single
`ActiveTurn` surface re-renders `MarkdownRenderer` on the accumulated text
per delta (parse-per-frame, never buffer-until-done). Incremental delivery
is proven pre-`done` by test (§8).

---

## 3. Code Blocks

Dedicated presentation (unchanged shape, hardened behavior):

```
┌─────────────────────────────────────────┐
│ TypeScript                        Copy  │
├─────────────────────────────────────────┤
│ const provider = resolveProvider();     │
│                                         │
│ await provider.execute();               │
└─────────────────────────────────────────┘
```

- Language label (original fence tag preserved: `tsx` shows `tsx`).
- Monospace, preserved whitespace, horizontal overflow inside the block
  (`overflow-x-auto`; panel bounds never widen).
- **Copy code** (`aria-label="Copy code"`, keyboard-focusable native
  button) copies only the block contents — `extractText` over highlighted
  spans yields raw code, never markup. Distinct from GA-UI-003's Copy
  Response (proven: different buttons, different clipboard payloads).
- Drag safety: `stopPropagation` on pointer/mousedown, same contract as
  GA-UI-003 actions.
- Clipboard failure now surfaces `Copy failed` instead of hanging on `Copy`.
- **Removed the fake "Run" button**: it copied bash to the clipboard while
  labelled "Run" — a false execution affordance. Presentation never
  executes; recorded here, not replaced.
- **Preview iframe hardened**: `sandbox="allow-scripts"` → `sandbox=""`.
  Model-generated HTML previews as static content; scripts in model output
  never execute. Markup rendering is preserved.
- **Latent bug fixed**: with `rehype-highlight`, code `className` arrives
  as `"hljs language-x"`, so the old `startsWith('language-')` check missed
  it and single-line fences degraded to inline code (no label, no Copy).
  Detection now matches `/language-([\w+-]+)/` anywhere. Unknown tags
  still render as plain code (label shown, highlighting absent, Copy kept).

---

## 4. Syntax Highlighting (no new bundle)

`rehype-highlight` option `aliases` (passed to `lowlight.registerAlias`;
verified against the installed v7 `Options` type) covers the priority list
with grammars already shipped:

| Wanted | Source | Mechanism |
|---|---|---|
| TypeScript, JavaScript, JSON, Bash, YAML, Markdown, SQL, CSS | lowlight/common | direct (already registered) |
| TSX / JSX | — | alias → `typescript` / `javascript` |
| `sh`, `zsh`, `terminal`, `shell` | `shell` registered; rest aliased | alias → `bash` |
| HTML (`html`, `htm`) | `xml` registered | alias → `xml` |
| `yml`, `md` | `yaml`, `markdown` registered | alias |
| Unknown (e.g. `foobar`) | — | plain code, never a crash (`detect` stays `false`: no guessing cost) |

---

## 5. Links

New `SafeLink` override in the shared renderer (same semantics as the
existing `DocMarkdown` convention):

- External (`https?`/`mailto:`/`tel:`) → `target="_blank"`
  `rel="noopener noreferrer"`, visible accent underline (existing CSS).
- Fragment (`#…`) → plain in-place anchor.
- Everything else (relative paths, repo references) → also
  `target="_blank" rel="noopener noreferrer"`: model output can never
  hijack Workspace routing, and opening a URL is navigation only — never
  Assistant tool authorization, never privileged execution.

---

## 6. Tables

GFM tables render via the existing `Table` override (`overflow-x-auto`
wrapper + bordered compact styling). Wide tables scroll internally; the
FloatingPanel never widens. Proven with an 8-column table asserting the
`table → div.overflow-x-auto` containment.

---

## 7. Repository References & Long Content

- Audit: **no canonical "open file in Workspace" contract exists**
  (no `openFile`/editor route/file-preview mechanism found). Per the
  milestone, no second navigation system was built: paths render as
  text/inline-code with zero navigation affordance (proven: no `a`/`button`
  for bare paths). Recorded as adjacent opportunity below.
- One scoped CSS addition (existing tokens only): `overflow-wrap:
  anywhere` for `.markdown p, li, td, th, blockquote, a` — long URLs,
  hashes, and repo-relative paths wrap instead of breaking narrow panels.
  `pre`/`code` blocks are deliberately excluded so code keeps scrolling
  internally.
- Canonical message content is never truncated for presentation; response
  actions stay below the completed response (reachable); GA-UI-004
  user-controlled scrolling is untouched.

---

## 8. Streaming Behavior (incremental, measured by test)

No buffering: each SSE `delta` commits `streamingText` and the active turn
re-parses the accumulated markdown in place. remark/lowlight parse partial
syntax gracefully (unclosed fence → code block; unclosed emphasis/table/
link → literal text), proven by degradation tests. The multi-delta
integration test proves visibility ordering:

```
delta("# Vestara") → <h1> in DOM while streaming, actions absent
delta(list)        → same turn grows <li>, still one active turn
delta(unclosed ```ts) → code text visible, no crash
delta(close + table)  → Copy-code button + <table> pre-done
done → completed rich message + Copy/Share on raw markdown text
```

Per-frame parse cost is linear in message length at panel scale; no
memoization/buffering layer was added (deliberately — it would risk
staleness of the live turn).

---

## 9. Response Actions (GA-UI-003 preserved)

- Copy Response / Share operate on the `content` prop (raw user-visible
  markdown text), never rendered HTML — proven by clicking Copy on a
  completed markdown response and asserting the exact raw string.
- Code-block Copy is a separate control with a separate payload.
- No actions render on the active streaming turn (asserted mid-stream with
  markdown content present).

---

## 10. Deterministic Tests (no localhost/OpenCode)

`apps/workspace/__tests__/ga-ui-005-rich-message.test.tsx` — **23 tests**:

paragraph, heading, emphasis, ordered list, unordered list, blockquote+hr,
inline code, fenced code, language-label fidelity, Copy-code payload,
Copy-code keyboard/drag safety, unknown language, highlighting incl.
tsx/sh aliases, safe external links, relative-link containment, raw-HTML
escaping, table, wide-table containment, long URL/path containment,
incomplete fence, partial emphasis/table/list/link, multi-delta
pre-done growth, Copy/Share raw-text preservation, repo-path
presentation-only.

Results: **23/23 pass**. Combined Assistant lane
(ga-ui-005 + assistant-response-actions + ga-ui-004 + use-assistant-conversation):
**68/68 pass**. Changed files typecheck clean.

---

## 11. Test Hygiene Investigation (narrowly attributed + fixed)

Reported: `assistant-response-actions` isolated 10/10 vs combined 8/10.

- Measured here: isolated **2/10** (first two tests pass on an empty
  document; every later `getByRole`/`queryByRole` throws **"Found multiple
  elements"**). Combined showed the same signature.
- Root cause: the file never unmounts between tests — no `cleanup` import
  and no global `afterEach` (vitest `globals` is off repo-wide), so rendered
  panels accumulate in `document.body` and queries match across tests.
  Identical mechanism to the GA-UI-004 adjacent finding; nothing to do with
  GA-UI-004/005 rendering changes.
- Fix (shared hygiene, 2 lines — import + call in the existing
  `afterEach`; no test rewritten): `cleanup()` before `vi.restoreAllMocks()`.
- After fix: isolated **10/10**, combined lane **68/68**.

Recorded as adjacent (explicitly not fixed): `conversation-panel.test.tsx`
(12 failed / 4 passed at baseline — same missing-cleanup pattern plus stale
assertions) and the ThemeBuilder `ThemePreview.test.tsx` TS parse error
(`'}' expected`, fails `tsc --noEmit` at baseline).

---

## 12. Adjacent Opportunities (not built)

1. Canonical "open file in Workspace" navigation: no contract exists;
   if one appears, repo-path presentation could link to it without a
   second authority model.
2. Server-side idempotency on `clientMessageId` (from GA-UI-004).
3. `conversation-panel.test.tsx` + ThemeBuilder failures (§11).

---

## 13. Manual Acceptance Prompt (for Director review — not run here)

```
Explain the main architecture of Vestara using:
- a short heading
- a numbered list
- a small TypeScript example
- a table
- one inline code reference
```

Verify: response visibly grows while streaming and settles into correctly
rendered Markdown; human prompt remains visible; Thinking/status works;
Markdown appears progressively; code block remains within panel; Copy code
works; table remains within panel; Copy response works; Share works;
manual scroll remains respected.

---

## Verdict (deterministic portion)

| Criterion | Result |
|---|---|
| Markdown | PASS |
| Streaming Markdown | PASS |
| Code blocks | PASS |
| Copy code | PASS |
| Tables | PASS |
| Links | PASS |
| Overflow containment | PASS |
| GA-UI-003 actions preserved | PASS |
| Test isolation | PASS (68/68 combined) |

**READY FOR VISUAL TEST.** Stopping for review — no AR-009 work.
