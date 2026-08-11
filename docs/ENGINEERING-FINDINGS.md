---
title: Engineering Findings
version: 1
status: living
owner: vestara
last-reviewed: 2026-08-05
next-review: 2026-09-05
---

# Engineering Findings

> **Every finding is an invitation to be challenged.**
> If new evidence improves a finding, the organization becomes wiser.
> The goal is not to preserve conclusions.
> The goal is to preserve the path by which better conclusions are reached.

## Purpose

Capture engineering lessons discovered during implementation, verification,
debugging, benchmarking, and operation.

Unlike **Evidence**, which records observable behavior, Engineering Findings
capture the engineering knowledge that emerged from that evidence.

> A finding should answer: *"What will make the next engineer better?"*

Findings are not a changelog, not documentation, and not verification output.
They are the accumulated wisdom that survives individual milestones. Milestones
come and go; findings accumulate. Before writing code, search this document —
not for an answer, but for understanding.

---

## Taxonomy

The four knowledge artifacts answer different questions:

| Artifact | Answers | Examples |
|----------|---------|----------|
| Documentation | What is the system? | Architecture, UX, API, design |
| Evidence | What have we observed? | GOV-001, GOV-002, Learning Log |
| Milestone Reports | What changed? | MK-2, PCS, API hardening |
| Engineering Findings | What did we learn? | ENG-001… (this document) |

---

## Index

| # | Finding | Confidence | Related Evidence | Related Milestone |
|---|---------|------------|------------------|-------------------|
| ENG-001 | Sequential dispatch is the compatibility contract, not prefix ownership | Verified | API hardening test suite | API observability milestone |
| ENG-002 | Removing `any` turns the compiler into a reviewer | Verified | TypeError surfaced during `any` removal | API observability milestone |
| ENG-003 | Test doubles reveal hidden runtime assumptions | Verified | Route test suites (fake req/res) | API observability milestone |
| ENG-004 | Behavioral compatibility is a public contract | Verified | Dispatcher regression (27 failures) | API observability milestone |
| ENG-005 | Metrics based only on Content-Length blind spot streamed responses | Observed | `responseBytes: 0` on streamed endpoints | API observability milestone |
| ENG-007 | Tool risk and information risk are independent | Verified | Browser tool governance metadata tests | Browser / computer-use tool providers (PCS-026) |
| ENG-008 | Computer use should produce evidence through existing protocols | Verified | Browser tools emit harness evidence artifacts | Browser / computer-use tool providers (PCS-026) |
| ENG-009 | Executor state must be scoped to the actor/task boundary | Verified | Session-isolation test (per agent:task pages) | Browser information stewardship enforcement (PCS-026) |

---

## ENG-001 — Sequential dispatch preserves compatibility better than prefix ownership

### Title

Route dispatch order is the contract; prefix ownership is an index.

### Problem

Replacing a linear `if (await handler(...)) return;` chain with a
prefix-filtered dispatcher silently re-ordered which handler won a request.

### Observation

`POST /api/agents/:id/runs` is owned by the agent-harness handler, but the
agents group owns the `/api/agents` prefix. Prefix dispatch sent the request
only to the agents group (which returned `false`), producing a 404. The
original sequential chain reached the harness handler and handled it.

### Finding

Routing **order** — not prefix ownership — is the observable contract of the
server. Prefixes are a useful documentation index but a dangerous dispatch
mechanism when handlers own paths outside their "natural" prefix.

### Engineering Principle

When replacing a dispatch mechanism, the dispatch *order* must be preserved and
locked with a behavioral test that exercises overlapping-prefix paths.

### Recommendation

Treat router dispatch order as a compatibility guarantee. Any future
dispatcher (trie, radix, generated) must run handlers in the exact original
sequence and stop at the first handler that claims the request.

### Related Evidence

- API hardening test suite: `apps/api/__tests__/http.test.ts` (router
  sequential-chain tests)
- 27 test failures across 8 files exposed the regression before commit

### Related Milestone

API observability milestone (commit `72f1849`)

### Confidence

Verified

---

## ENG-002 — Removing `any` exposes latent domain inconsistencies

### Title

The compiler is a reviewer; `any` silences it.

### Problem

The "no explicit `any`" constraint was treated as a style rule.

### Observation

Removing `any` casts from REPL callbacks immediately surfaced a real defect:
`CollaborationRecord` has no `title` field. The REPL `collab list` command had
been rendering `c.title` — which cannot exist — behind an untyped callback.

### Finding

Every `any` is a place the compiler could be reviewing code but is not. The
value of removing `any` is not aesthetic; it is letting the type checker
become a reviewer that finds defects the runtime tolerates and tests miss.

### Engineering Principle

Explicit `any` should be treated as a debt item, not a convenience. Removing it
is a verification activity, not a formatting activity.

### Recommendation

When a "no `any`" pass is done, treat every newly surfaced type error as
suspicious: it may be a latent domain-model bug rather than a typing nuisance.

### Related Evidence

`CollaborationRecord` type error surfaced during `any` removal (commit `72f1849`)

### Related Milestone

API observability milestone (commit `72f1849`)

### Confidence

Verified

---

## ENG-003 — Test doubles reveal hidden runtime assumptions

### Title

The runtime tolerates what unit doubles do not.

### Problem

Route handlers are tested directly with `EventEmitter`-based fake `req`/`res`
objects instead of a live server.

### Observation

The hardened body reader called `req.pause()`, and the response writer checked
`res.headersSent === false`. Real Node streams always have `pause()` and
`headersSent`; the fakes lacked both, so every direct-handler test failed.

### Finding

Node's runtime hides defensive assumptions (`pause()`, `headersSent`,
`writableEnded`, `req.headers` always present). Test doubles do not. A failure
across the entire direct-handler suite is frequently a signal that new code
assumes runtime guarantees that fakes — and therefore other environments — do
not provide.

### Engineering Principle

Write server code that is safe against the *absence* of runtime conveniences,
not just the presence of them. Defensive code is more testable code.

### Recommendation

When a code change breaks all direct-handler tests at once, audit the new code
for implicit assumptions about the real `http` runtime before assuming the
tests are wrong.

### Related Evidence

Route test suites using `EventEmitter` fakes (`apps/api/__tests__/*.test.ts`)

### Related Milestone

API observability milestone (commit `72f1849`)

### Confidence

Verified

---

## ENG-004 — Behavioral compatibility should be treated as a public contract

### Title

Architectural cleanups must prove behavioral equivalence, not just compile.

### Problem

A cleaner implementation replaced working behavior.

### Observation

The prefix-dispatcher regression produced 27 failing tests across 8 files
before it was caught. None of the failures were in the new code — they were in
existing route behavior that the refactor silently changed.

### Finding

A refactor's success metric is not "the new code is cleaner" but "the
observable behavior is identical." Regression suites are the only evidence that
equivalence holds; they must be run and green before a refactor is called done.

### Engineering Principle

Behavioral compatibility is a public contract. When prose conflicts with
executable behavior, the executable files win.

### Recommendation

Treat router equivalence (and any refactor equivalence) as a contract. Before
merging a refactor, run the full suite on both the old and new code paths where
feasible, and document the overlap in the milestone report.

### Related Evidence

27 failures across agent-harness, conversations, evidence, marketplace,
orchestration, and worker-socket tests

### Related Milestone

API observability milestone (commit `72f1849`)

### Confidence

Verified

---

## ENG-005 — Content-Length-based metrics blind spot streamed responses

### Title

Instrumentation must be per-write, not per-header.

### Problem

Request metrics record response byte counts by reading the `Content-Length`
header on `finish`.

### Observation

Streaming and `Transfer-Encoding: chunked` responses do not set
`Content-Length`, so their `responseBytes` metric reads `0` — an accurate
representation of nothing.

### Finding

Header-based measurement works only for fixed-length responses. Any
instrumentation that depends on `Content-Length` silently loses data for the
very responses (long streams) where byte accounting matters most.

### Engineering Principle

Measure at the point where data moves, not where metadata is declared.

### Recommendation

For streamed responses, count bytes in the `data` event (or wrap `res.write`)
instead of reading `Content-Length` at `finish`.

### Related Evidence

`responseBytes: 0` observed for streamed endpoints in request logs and
`/api/telemetry/http`

### Related Milestone

API observability milestone (commit `72f1849`)

### Confidence

Observed

---

## ENG-007 — Tool risk and information risk are independent

### Title

A browser action may be operationally read-only while retrieving or persisting
confidential information.

### Problem

Browser tools were classified by *mutation* risk alone. `browser.snapshot` and
`browser.screenshot` are low-risk from the browser's perspective — they change
nothing — yet they can capture and persist sensitive business information
(personal data, billing pages, restricted routes).

### Observation

During the browser / computer-use provider milestone, the six-tool surface split
cleanly into read-only actions (navigate/snapshot/screenshot) and interactions
(click/type). But "read-only" only described what the *browser* observed. The
evidence artifact produced by a screenshot carries the same retention weight as
a file or command artifact, so an operationally benign capture could become a
stewardship liability. Governance metadata — origin, route, classification,
derived information risk, redaction status, retention policy, and requesting
agent — was added to every browser evidence artifact so the information axis is
recorded even when the mutation axis is empty.

### Finding

Low mutation risk does not imply low information risk. Risk must be evaluated
along two axes:

```text
Action risk        observe / interact / mutate
Information risk   public / internal / confidential / restricted / regulated
```

A screenshot can be operationally read-only while still being high-risk
information access.

### Engineering Principle

Evaluate browser tools through both capability policy (what the agent may do)
and information stewardship policy (what the agent may capture and retain).

### Recommendation

Carry information classification on the session (per-origin policies as the next
step) and persist it on every evidence artifact so downstream retention,
redaction, and access decisions have the context they need without re-deriving
it from content.

### Related Evidence

`packages/tools/browser/src/session.ts` — `EvidenceGovernance` + classification
→ information-risk derivation; `governance` block on every browser tool evidence
artifact; governance metadata assertions in
`packages/tools/browser/__tests__/browser.test.ts`

### Related Milestone

Browser / computer-use tool providers (PCS-026, 2026-08-05)

### Confidence

Verified

---

## ENG-008 — Computer use should produce evidence through existing protocols

### Title

Browser interaction remains governable when screenshots and observations flow
into the same evidence pipeline as filesystem, command, and verification
artifacts.

### Problem

A new execution surface (browser automation) risks inventing a parallel audit
path — its own storage, its own review surface, its own governance vocabulary.

### Observation

Adding browser tools as Tool Runtime providers meant they were governed by the
same approval policy as shell and filesystem tools, and their outputs became
`EvidenceArtifact`s (`screenshot`, `custom`) consumed by the harness alongside
command, test, and filesystem evidence. Screenshots from `browser.screenshot`
enter the existing content-addressed evidence pipeline instead of a separate
browser-specific store.

### Finding

Browser/computer-use behavior is only trustworthy when its observations are
indistinguishable in *accountability* from any other tool's output — same
contract, same governance metadata, same retention.

### Engineering Principle

New execution providers should extend shared evidence contracts rather than
introduce isolated audit paths.

### Recommendation

Keep browser actions as `VestaraTool` providers emitting harness `EvidenceArtifact`s
with per-artifact governance metadata. Only extend the shared evidence protocol
when a genuinely new evidence kind (e.g., interaction replay) is required — and
define it in the evidence contracts, not in the provider.

### Related Evidence

`packages/tools/browser/src/tools.ts` — six `VestaraTool`s emitting harness
evidence; registration in `apps/api/src/workspace-context.ts` `createAgentTools`;
evidence pipeline integration (PCS-026)

### Related Milestone

Browser / computer-use tool providers (PCS-026, 2026-08-05)

### Confidence

Verified

---

## ENG-009 — Executor state must be scoped to the actor/task boundary

### Title

Shared execution surfaces leak state across actors unless isolation is explicit.

### Problem

The browser session was created once per ToolRuntime instance and shared by
every agent thread; a single page carried navigation, cookies, and form state
across concurrent agents and tasks.

### Observation

During the session-isolation pass, a session key (`agentId:taskId`) was threaded
through driver → session → tools, so each agent:task owned an isolated page.
`browser.close` then released only the calling agent's page, and the browser
process shut down when the last page closed — releasing exactly the caller's
scope, never a shared one.

### Finding

A shared executor is shared mutable state. Any provider that holds runtime state
(browser session, shell, database connection, cloud client) must scope that
state to the actor and task that created it, or the first agent's session leaks
into the second agent's work — including its governance metadata.

### Engineering Principle

Executor state is scoped to the requesting actor and task. Cross-actor reuse is
explicit and opt-in, never implicit.

### Recommendation

Key persistent provider state by an isolation key derived from the harness
context (`agentId`, `taskId`), and expose a release action that closes only the
caller's scope. Treat "no state shared between tasks" as the default contract
for every future provider.

### Related Evidence

`packages/tools/browser/src/session.ts` — `sessionKey`, page-per-key map in
`PlaywrightBrowserDriver`, scoped `close(key)`; session-isolation test in
`packages/tools/browser/__tests__/browser.test.ts`

### Related Milestone

Browser information stewardship enforcement (PCS-026, 2026-08-05)

### Confidence

Verified

---

## Adding a Finding

To record a new finding:

1. Assign the next `ENG-###` identifier.
2. Fill in every section. If a section has no content, write "Not yet
   determined" rather than deleting it — the absence is itself information.
3. Link at least one **Related Evidence** entry. A finding with no evidence is
   an opinion.
4. Set **Confidence** to one of: `Verified`, `Observed`, `Hypothesized`.
   Upgrade confidence only when new evidence supports it.
5. Keep **Finding** (the lesson) distinct from **Observation** (what
   happened). The distinction is the entire point of this document.

---

*This is not a changelog. It is the accumulated engineering knowledge that
makes the next engineer start smarter than the last one.*

---

> **Every conclusion belongs to the present.**
>
> **Every path belongs to the future.**
>
> Preserve the path.
