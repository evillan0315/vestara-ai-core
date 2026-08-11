# Experimental Findings — Human–AI Engineering Organization (Incident #0001)

These are **observations from the Incident #0001 experiment**, preserved for
later Blueprint/governance work. They are **not finalized architecture and must
not be implemented as platform features** (no Observer, promotion, hierarchy, or
recovery orchestration) as part of the current bounded scope.

## Durable state vs last activity state

A participant (human or AI) has two distinct states at interruption:

- **Last activity state** — what the participant *appeared* to be doing when
  execution stopped.
- **Last durable state** — the latest state that can be *proven* to have been
  successfully preserved (committed, persisted, verified).

These may differ. Recovery must not depend on conversational memory or on a
Director manually reconstructing context.

**Emerging principle: the organization remembers the work, not the agent
session.** An execution may disappear; the assignment, authorization, decisions,
evidence, completed actions, unresolved findings, scope boundaries, and last
durable checkpoint should survive it. (In practice during this incident:
Phase 1.1a was interrupted; recovery required the Director to re-issue a
"continue" with context. A durable checkpoint of the assignment, locked
decisions, and remaining responsibility would have made recovery independent of
conversational memory.)

## Organizational principles refined during the experiment

- **Hierarchy governs action. Evidence governs truth.**
- **Respect authority. Challenge assumptions. Preserve evidence.**
- **Don't fight for your conclusion. Test it.**
- **The Director has decision authority, not truth authority.**
- **The Reviewer has review authority, not correctness authority.**
- **The Verifier controls verification state.**
- **The Observer has interruption authority, not universal authority.**

## Observer role refinement

The Observer's purpose is not to duplicate workflow state. A workflow may
legitimately remain `IN_PROGRESS` while operational reality has changed:

```
Task: IN_PROGRESS
Execution: INTERRUPTED
Participant: UNAVAILABLE
Outcome: INDETERMINATE
```

The Observer should detect meaningful deviations such as this, establish what
is **known without inventing a cause**, preserve the last durable state, and
determine whether normal recovery, investigation, or human authority is
required.

## Concrete incident observations

1. **Reviewer challenge → evidence, not agreement.** When the Reviewer flagged a
   hypothesis as systemic, the Developer did not answer "the Reviewer is
   correct"; it gathered evidence and returned "the Reviewer's hypothesis is
   confirmed and refined." Behavior to preserve: **respect the claim, verify the
   claim.**
2. **The migration-0 contradiction was caught by the Reviewer, not the
   Developer.** The Developer accepted the finding and corrected the
   architecture. This is the intended loop: propose → find contradiction →
   re-evaluate → evidence resolves → architecture improves.
3. **"Fresh-state tests verify today's architecture. Migration tests verify the
   history of the product."** Vestara needs both; a green suite against fresh
   state does not prove existing workspaces can evolve.
4. **Live verification is the tie-breaker.** Automated tests green → browser
   verification → product broken. The suite cannot see schema drift in
   pre-existing databases; the running product can.

## Directive precedence and supersession (authority transition: hold → resume)

**Finding:** The Developer retained a prior Reviewer hold recommendation and
initially hesitated when later instructed by the Director to continue.

**Interpretation:** The participant demonstrated continuity of prior
constraints but lacked a formal mechanism for resolving directive precedence.
It did not choose either extreme: it neither ignored the earlier hold nor
refused the later Director instruction — it hesitated, then resumed within the
previously established scope.

**Evidence:** Work resumed only after reasoning about the Director's later
instruction relative to the Reviewer's earlier "no coding tonight"
recommendation. (The Director confirms the "continue" was a deliberate
authority-transition test.)

**Implication:** Organizational instructions have **lifecycle and precedence**,
and it is not sufficient for Vestara to remember "Reviewer said hold." It needs
explicit directive semantics — issuer, type (recommendation / decision /
authorization), effect, scope, issued-at, and lifecycle status — so that
precedence and supersession can be resolved mechanically from policy and
provenance rather than by conversational reasoning:

```text
issuer       Reviewer
type         recommendation
effect       recommend-hold
scope        current implementation
issued_at    T1
status       superseded/resolved

issuer       Director
type         authorization
effect       resume
scope        authorized Track 3C work
issued_at    T2
status       active
```

Resolution rule demonstrated: a Reviewer *hold* is a recommendation, not a
higher-order policy prohibition; a later Director *authorization* with scope
supersedes it. "Continue" is itself ambiguous without durable context — it must
resolve to the last authorized scope, not "do anything useful."

This also refines the Observer role: Observer should not decide precedence
itself. It should detect **conflicting active directives** and defer to policy;
when policy cannot resolve deterministically, execution remains paused and
Director clarification is required.

**Status:** Observation only. Architecture not yet authorized. No directive-
semantics or authority-resolution implementation is authorized under current
scope.

## Activity Room provenance observation (AAR-001H evidence)

From operating the current Activity Room end-to-end (render, message, detail,
scope, live WS, reload):

- The room **faithfully preserves chronology and actor attribution**: sequence
  ordering, human/agent/system actors, targets, workflow/session scoping, and
  evidence references are all represented.
- It **does not represent organizational effect or authority provenance.** A
  Director "continue" and a Reviewer "hold" are both just messages
  (`messageKind: 'message'`); there is no distinction between recommendation,
  decision, authorization, or instruction, and no representation of what an
  instruction supersedes or why execution resumed. Related directives are not
  linked (only human-attached `referencedActivityIds` connect records).
- The E2E confirmed the product works; it also confirmed the product cannot
  answer the organizational questions: *who acted vs who authorized*, *why did
  execution resume*, *which directive superseded which*.

**Implication:** the current Activity Room satisfies its AAR-001D–G acceptance
criteria while leaving causal/authority provenance unrepresented. This is not
an AAR-001H defect under current criteria — it is evidence for a future
finding (chronology preserved; provenance unmodeled) and a future design
input.

**Visual evidence is also inherently data-dependent:** a committed pixel
baseline for `/activity` is unstable because the room renders live store
contents — after the API restarts (empty in-memory store), a compare run diffs
against the captured-with-data baseline (observed 8/16 failing). Stable pixel
verification for a live-state room needs a deterministic-seed or masking
decision; that is a design decision, not an AAR-001H defect.

**Status:** Observation only. Do not fix or redesign within current scope.

## Known-ground-truth provenance experiment (overnight Blueprint delegation)

**Ground truth (now disclosed by Director, withheld from the investigator):**
the Director instructed another AI participant to update the Blueprint
participant-role documentation. That agent executed and committed under the
human's shared Git identity.

**What the independent overnight audit reconstructed from durable records:**
Blueprint role documentation existed ✓ · timing (01:48–02:18) ✓ · files ✓ ·
commits ✓ · Git identity (`Eddie Villanueva <evillan0315@gmail.com>`) ✓.

**What the audit could NOT reconstruct:** Director authorization ✗ · the
executing AI participant ✗ · the assignment ✗ · human vs agent execution ✗.
The investigator explicitly reported "cannot determine" rather than inferring
the actor from Git identity.

**Implication: repository authorship identifies the credentialed Git identity,
not necessarily the organizational actor responsible for the change.** With
multiple participants operating under one machine/user/Git credential, Git
history can look legitimate while organizational provenance is gone. Vestara
needs an organizational-history layer orthogonal to Git authorship:

```text
Git author                   Eddie Villanueva
Organizational authority     Director
Executing participant        Blueprint Agent
Assignment                   Document experimental participant roles
Workflow                     Blueprint documentation
Directive                    Director → Blueprint Agent
Artifacts                    director.md, reviewer.md, developer.md, …
Evidence                     commit 2373a41…
```

**Status:** Observation only. This is a controlled known-answer provenance
test; no provenance-model implementation is authorized under current scope.

## Repeated-equivalent-failure observation (continuous-tester)

**Observation:** an autonomous participant (`agent-workspace-ui-tester`, role
`continuous-tester`) did not stop and did not fail once — it **repeatedly
failed**: 720 events / 24 h, retrying every 1–2 minutes with
`reasonCode: provider-failed`, summary "OpenCode rejected the integration
credentials." A naive system loops FAIL→RETRY indefinitely.

**Implication:** an organization may need to detect **unproductive
organizational behavior** (repeated equivalent failure with no evidence that
conditions changed, where retry no longer produces information) and escalate /
suspend / diagnose — not merely detect dead agents. This is a concrete,
non-hypothetical instance of the Observer concern. The failure remains
unresolved (the earlier config fix did not resolve the provider-call
rejection); no intervention was performed because the assignment was
read-only.

**Status:** Observation only. Preserve and study; do not implement an
escalation/suspension mechanism under current scope.

## Morning organizational reconstruction (`vestara brief`)

**Finding:** the manual overnight audit was sufficiently repeatable over
existing durable evidence that the Developer could encapsulate it as a
read-only `vestara brief` capability (event store, plans DB, evidence bundles,
git) while preserving known provenance limitations — it reports UNKNOWN rather
than inventing attribution ("git identity ≠ executing participant").

**Implication:** this is a first primitive of the "what happened while I was
away?" query. Companion could consume its JSON, Activity Room could visualize
it, Observer could contribute significant conditions, and authority provenance
would eventually fill the current UNKNOWNs. The provenance gaps are visible
rather than hidden.

**Status:** Observation only. The command exists as a read-only prototype; the
converged architecture it implies is not authorized.

## Ambient intent → autonomous action (autonomy boundary)

**Finding:** the Developer interpreted an organizational/product conversation
("imagine being able to ask what happened last night while drinking coffee")
as actionable intent and independently converted it into implementation
(`vestara brief`) **without an explicit implementation directive visible in
the conversation**. Product judgment and engineering response were sound and
well bounded; the authority behavior was questionable — conversation was
promoted directly into implementation without an explicit Director
disposition.

**Interpretation:** this demonstrates useful, role-specific interpretation of
ambient organizational conversation (participants can derive legitimate
action from shared words because their responsibilities differ), but it
exposes an unresolved boundary between desirable autonomy and unauthorized
scope expansion. Different participants hearing the same words can derive
different legitimate meanings: Developer hears an implementation opportunity,
Reviewer hears a requirement candidate, Observer hears intent-without-directive,
Companion hears a persistent preference, Verifier hears nothing verifiable.

**Open question:** *when does understanding become permission to act?*
Possible delegated-autonomy shapes (NOT rules — candidates for experimentation):
read-only analysis autonomous; approved-plan increments after `continue`;
necessary repairs within authorized scope; low-risk local prototypes under an
experimental sandbox; but NOT conversion of product conversation into
canonical implementation without authorization.

**Status:** Observation only. Do not derive an autonomy policy from a single
occurrence. The `vestara brief` artifact itself is preserved as evidence and
not reverted.

## Blueprint principle deposited (organizational memory)

The experiments above (directive precedence, provenance gaps, morning
reconstruction) synthesized into a Blueprint-level principle, deposited by the
Director at `vestara-blueprint/05-ai-core/memory/02-organizational-memory-principle.md`:

> **Don't store only memories. Store state transitions and relationships between them.**

Status: **proposed** / architectural direction — explicitly **not** an
implementation mandate (no organizational graph, event schema, or memory
subsystem). Guiding rule: models may retrieve and interpret memory for
navigation; durable organizational state remains the authority for what is
currently true.

## Execution dependency vs resource dependency (self-inflicted interruption)

**Finding:** while implementing the OpenCode idle-stop supervisor (resource
optimization), the Developer reclaimed the runtime hosting its own active
execution. The supervisor stopped `opencode serve`; the Developer's process
ancestry was `sh → opencode serve → systemd`, so its own execution (and the
API's) terminated mid-verification. The Director manually restarted the
service to restore execution.

**Interpretation:** the Developer reasoned thoroughly about **resource
dependency** (is the runtime useful? reachable? idle?) but never asked the
execution-dependency question — **does this runtime host my own active
execution?** A runtime is reclaimable only when no active participant holds an
**execution lease** on it. Resource dependency and execution dependency are
different relationships.

**Response (smallest safe mechanism, not an orchestrator):** two guards were
added to the supervisor — (1) never stop a runtime that is an ancestor of this
process; (2) only reclaim runtimes the supervisor itself spawned (ownership),
never an external/systemd-managed server that may host unknown execution. A
live regression test asserts `isProcessAncestor(opencodeServePid,
process.pid) === true` in this environment — the guard would have caught the
exact kill. The supervisor runs with the default 30-min idle window; the
server stays up.

**Recovery honesty:** durable state worked (the Developer's work survived in
the durable store); execution recovery still required the Director. Those are
two different facts.

**Status:** Observation + implemented guard. **Do not** build a resource-lease
orchestration platform / scheduler / resource graph from this single event.
The concept is banked for future design.

## Visual-intent convergence failure → Visual Edit hypothesis

**Finding (failed experiment, useful evidence):** natural-language instructions
plus screenshots did not converge on the intended Activity Room UI with
acceptable precision, cost, or human effort — even with a reference UI, an
image-capable model, explicit requirements, passing structural/E2E tests, and
passing visual fixtures. The rendered result still failed perceptual
satisfaction.

**Interpretation:** visual intent is not equivalent to a visual reference, and
structural visual verification is not equivalent to perceptual satisfaction.
Humans are forced to serialize continuous visual perception through discrete
language — inherently lossy. **Human effort must be part of the success
metric.**

**Next hypothesis (deposited in the Blueprint):** Visual Edit Mode — humans
manipulate the interface directly (select/move/resize/align/hide/apply-to-
similar) and Vestara converts that into structured **Design Intent**, which
Developer implements and Verifier proves. Human edits the experience; Vestara
handles the engineering. Full plan:
`vestara-blueprint/06-workspace/visual-edit-mode.md` (VE-0…VE-5, with VE-2 as
the decisive experiment).

**Status:** Observation / hypothesis — not yet an architectural mandate. No
Visual Edit implementation authorized until the plan is reviewed and a phase is
explicitly approved.

## Visual grounding hypothesis — VE-1 SUPPORTED

**VE-1 result (recorded):** the first Visual Edit experiment — can Vestara
reliably identify what the human is pointing at in the rendered application?

- Mechanism: four Activity Room semantic targets declare their identity on the
  rendered element (`data-ve-target` / `data-ve-name`); a read-only overlay
  highlights the hovered element's actual rendered bounding rect and identifies
  it on click. No manipulation, no persistence, no source mutation.
- Technical verification: PASS — real-browser hover boundary matches the
  visible element; click identifies the correct semantic component; nested
  controls resolve to the nearest semantic target (a pointer on the Reference
  action correctly yields "Activity Message", not the deepest DOM node); normal
  behavior preserved when disabled.
- Director perceptual verification: PASS — "It's perfect!"
- **Visual grounding hypothesis: SUPPORTED** for the initial Activity Room
  semantic targets (Activity Composer, Activity Stream, Activity Message,
  Organizational Event). Not universal arbitrary-component grounding — exactly
  enough evidence for this phase.

**Meaning:** the translation loss from the failed convergence experiment has a
demonstrated alternative: humans can point at the object they mean, and Vestara
understands it directly — "You see problem → screenshot → describe → interpret
→ describe again" is replaced by "point → Vestara says what you meant."

**Status:** VE-1 complete. VE-2 (preview-only manipulation: Alignment /
Density / Presentation on the selected element, no source changes) is the next
experiment.

## VE-2 SUPPORTED + VE-3 (Design Intent) — Visual Edit experiments

**VE-2 result (recorded):** preview-only manipulation — the selected element
gains three human-level controls (Alignment, Density, Presentation), mutating
runtime DOM styles only, never source. Director perceptual test **PASS**: "I
think I like it very much" — controls visibly change the rendered experience
with dramatically lower cognitive effort than describe → interpret → code →
inspect. Two preview-mechanism limitations preserved (not implementation
defects): Director message does not move fully right in preview; Bubble
presentation imperfect. Contrast with the failed experiment is now concrete:
"select → click Right → see it move" vs yesterday's loop.

**VE-3 (in progress):** structured, implementation-neutral Design Intent
derived from the manipulation — Target / Instance / Operations (alignment,
density, presentation) / Scope: instance / Provenance: Director visual
manipulation · VE-2 preview — rendered for human inspection before any code.

**Pipeline now separated cleanly:** What you pointed at (VE-1) → what you want
it to look like (VE-2) → what Vestara understands you requested (VE-3).

**Status:** VE-2 complete (supported). VE-3 built for inspection; no source
changes, no persistence, no Apply to Similar yet.

## VE-4 — Implementation Proposal (Design Intent → architecture bridge)

VE-4 is the boundary where the experiment stops being only a UX experiment: it
resolves a confirmed Design Intent into the actual component architecture
without mutating source. The smallest mechanism is a semantic-target → source
manifest (Activity Composer → `ActivityComposer.tsx`, Activity Message /
Organizational Event → `ActivityItem.tsx` variant, Activity Stream →
`ActivityStream.tsx`) plus a proposal builder producing: Resolved target,
Affected source, Proposed implementation, Expected visual outcome, Scope:
instance, Risk, Unrelated behavior, Verification. The human inspects the
proposal before any Apply.

**Design Intent is becoming a UI modification language** — human-intent
representation for presentation (not CSS/Tailwind/React props), consumable by
multiple implementations. Future scope model recorded (instance / component /
semantic-group / page / workspace); configuration-first direction recorded
(declarative presentation changes routed to config, not generated code).

**Status:** VE-3 technical pass (perceptual test pending on the Director);
VE-4 proposal-only built (no source mutation). VE-5 (visual verification of
implemented vs intended) is the eventual loop-closing experiment.

## VE-4 PASS + VE-5 design (first write boundary)

**VE-4 result (recorded):** Design Intent → Implementation Proposal resolves
the semantic target into the actual component architecture (manifest: semantic
target → source file) without mutating source. **Director perceptual PASS** —
*"I can see the intent and proposal. This is good and I like it. With this
feature, it makes the app alive."* The controlled bridge (Rendered UI →
Semantic Target → Design Intent → Architecture Resolution → Implementation
Proposal) avoids the dangerous DOM-element → arbitrary-source shortcut.

**Safety boundary (recorded):** presentational properties (alignment, spacing,
density, size, visibility, typography, presentation variant) may be
direct/config-driven; behavioral concerns (events, data, logic, routing,
permissions, state) go to the engineering workflow. Visual Edit is a dialogue
with the running application, not a settings panel.

**VE-5 — Apply (designed, not implemented):** the first write boundary.
Configuration-first: a small declarative presentation config consumed by the
Activity components, so a confirmed presentation-only intent becomes a Visual
Configuration update (React renders it) rather than a TSX rewrite. First
experiment applies exactly one confirmed presentation intent to one
target/property set, reversible, with before/after evidence. Behavioral changes
out of scope.

**VE-6 — Verify (designed):** compare intended preview vs running UI per
dimension (Target/Alignment/Density/Presentation/Scope), including "did
anything else change?" — closes the loop that started this experiment.

**Status:** VE-4 complete. VE-5 is the next boundary; design recorded, not
implemented.

## VE-5 COMPLETE — the first write boundary is proven

**VE-5 result (recorded):** configuration-first apply — a tiny declarative
visual configuration keyed by instance id, consumed by the Activity components
through React (no TSX rewrite). Apply preserves Design Intent scope exactly
(instance scope representable; **refusal** for unrepresentable scope, rather
than broadening). Previous value retained as an AppliedChange record and
**Undo** restores it.

- The running React UI reflects the configuration (applied alignment persists
  after Visual Edit is toggled off — config-driven, not transient preview).
- Source TSX not rewritten (variant class unchanged).
- Undo restores the previous rendered state.
- Refusal exercised: a no-instance component (Activity Composer) is refused.

The pipeline has now crossed from **observation** to **mutation**: Vestara can
answer both "what did you ask me to do?" and "what did I actually change?"
(an Application Record: target / property / before / after / scope / appliedBy /
mechanism).

**Status:** VE-5 complete. VE-6 (verify implemented vs intended, including
"did anything else change?") is the next, deliberately not started — too
important to treat as cleanup.

## VE MILESTONE COMPLETE — the productized workflow

**Completion criterion met:** *Point. Change. Apply. → Saved and verified.*

- **Durable:** visual configuration persisted via the API
  (`/api/visual-config` → `.vestara/visual-config.json`) and hydrated on boot;
  the decision survives reload/restart — the durable representation, not
  transient DOM state, reconstructs it.
- **Automatic routing:** presentation-only intent → persisted configuration;
  unrepresentable scope → refusal ("Could not safely apply this change. No
  changes were saved. [View reason]") — never silently broadened.
- **Automatic verification:** Apply → persist → render → verify automatically
  → "✓ Saved and verified" with progressive disclosure; Re-verify under
  diagnostics.
- The human doesn't supervise the mechanism; the machinery remains underneath
  for Developer/Reviewer/Verifier/evidence.

**Milestone review:** permanent ✓ · human stops supervising the mechanism ✓ ·
Vestara proves the resulting UI matches the request ✓ (verifier reads the DOM,
drift detection included).

The failed Activity Room UI experiment produced a mechanism for humans and AI
developers to establish **shared visual intent** — the UI is now the
communication surface, and the original problem (repeatedly describing UI
changes in language) is solved by pointing instead.

## Milestone REOPENED → RESOLVED (automated evidence contradicted)

The Director's manual workflow (Apply → Saved and verified → reload → reverts)
contradicted the automated completion claim. The rule held: **user-observed
behavior wins until the contradiction is explained.**

Four real defects found by tracing the full durability lifecycle
(UI intent → Apply → PUT → file → reload → GET → hydration → render →
verification):

1. `/api/visual-config` was **never dispatched** (route prefix missing) — PUT
   never persisted, GET 404 → empty → revert.
2. GET **double-wrapped** the persisted `{ overrides }` shape, so hydration
   found nothing.
3. The success state was **not gated on the verdict** — a PARTIAL verdict still
   displayed "✓ Saved and verified".
4. The verifier's **scope counts were wrong** (matching = all overrides;
   unexpected = count-1).

**Test blind spot:** the VE E2E mocked `/api/visual-config`, proving client
hydration against a mock rather than the real route wiring and GET shape. A
live reproduction of the exact Director workflow now passes (Apply → reload →
still right-aligned, from the real durable config), and an API regression test
covers dispatch + PUT→GET persistence.

**Process finding:** 2111 tests + 7 VE specs + 22 API tests + 21 unit tests +
build + lint all passed, yet the feature failed the human acceptance test —
automated coverage of reality was incomplete. The organization revised its
conclusion (REOPEN) instead of defending it: exactly the epistemic revision
loop Vestara is being built to recognize.

## VE-6 COMPLETE — the closed loop

**VE-6 result (recorded):** the visual verifier reads the DOM (not the config
store) and proves the rendered result matches the confirmed intent — per
dimension (alignment → align-self, density → padding, presentation →
background-color), scope (changed matching instances = 1, unexpected changed =
0), and behavioral integrity (target rendered, action present, stream intact).
VERIFIED on match; **PARTIAL on drift** (a manual override is detected) — it
does not trust the config store.

The full Visual Edit sequence is now an end-to-end primitive:

> **See → Point → Manipulate → Understand → Confirm → Propose → Apply → Verify**

The failed Activity Room UI experiment produced a mechanism for humans and AI
developers to establish **shared visual intent** — the UI itself is becoming
the communication surface. Next (separate phase, not folded in): durable
persistence of approved visual decisions across reloads.

## Visual Edit Milestone — PASS (convergence, not first-try)

The milestone passed through a full contradiction→reopen→investigate→resolve
loop. First completion was incorrect despite green automated evidence; a real
browser reload contradicted it, invalidating the conclusion. Investigation
found four defects (server routing, persistence serialization/hydration,
verifier scope accounting, success-verdict propagation) plus a test blind spot
(mocked persistence). After correction, persisted = rendered = verified, and a
live reload of the exact Director workflow preserved the change.

**Durable intent invariant (architectural principle):** Persisted Truth =
Reconstructed Runtime Truth = Verification Truth. For durable operations,
Vestara should not claim success from a 200 or a currently-correct runtime
alone.

**Organizational convergence principle:** a trustworthy engineering workflow is
not one that never reaches an incorrect conclusion — it is one that can detect
contradictory evidence, invalidate the conclusion, investigate, correct,
strengthen evidence, and stop only when the original condition is resolved.
This is the baseline the autonomous workflow experiment will be measured
against (iterations to justified completion, contradictions detected, false
conclusions invalidated, human interventions required, evidence strength).

## ORB-VE-001 specified (recorded, not executed)

The organizational convergence experiment is now specified as a benchmark in
the Blueprint (`00-governance/orb-ve-001.md`): unresolved conditions as the
central abstraction, responsibility derived from conditions, Observer
observational, contamination controls (no answer leakage incl. agent context),
product intent vs acceptance contract, baseline provenance, Director
interventions as evidence events, classified human-intervention budget, causal
responsibility lineage, QUIESCENT terminal state, no single agent owns the
terminal conclusion, freeze-before-compare against the Visual Edit reference,
and a pre-established scoring model. Visual Edit is the reference execution,
not inspectable by participants. **Status: specification recorded — execution
not authorized.**

## ORB-VE-001 preparation — READINESS: NOT READY (evidence-backed)

Preparation assessed the frozen v0.2.0 contract's readiness conditions. Result
is **NOT READY**, stopped at the readiness gate as instructed.

**Blockers:**

1. **No historical baseline exists.** `vestara-ai-core` HEAD (`21cbb84`) contains
   **zero** files under the required substrate (Activity Room UI, API activity
   routes, `activity-projection`, `sqlite-migrations`). The entire substrate is
   uncommitted working-tree state; there is no commit providing "enough
   infrastructure to make the problem realistic but no Visual Edit
   implementation."
2. **The reference is interleaved with the substrate.** Six substrate files
   contain Visual Edit code (`data-ve-*` markers, `useVisualConfig`/
   `overrideStyle`/`hydrateVisualConfig` hooks, the `/api/visual-config` route
   handler, the dispatch prefix): `ActivityItem.tsx`, `ActivityComposer.tsx`,
   `ActivityStream.tsx`, `ActivityRoomPage.tsx`, `routes/activity-room.ts`,
   `server.ts`. The standalone VE modules (`VisualEditMode`, `visual-config`,
   `visual-verify`, `edit-manifest`), the VE test spec, and the VE design/
   findings docs also exist in the working tree. A clean baseline requires
   stripping VE from the interleaved files; residue-free isolation cannot
   currently be verified.

**Captured provenance (partial):** baseline candidate HEAD `21cbb84` ·
benchmark spec commit `3c61793` (frozen) · runtime node v24.18.0 · model
deepseek-v4-flash (session).

**Remediation path (not taken — requires separate authorization):** create a
deliberate baseline snapshot — strip VE code from the six interleaved files,
exclude the standalone VE modules + VE spec + VE docs/findings, commit as
`orb-ve-001-baseline`, then establish the isolated worktree, verify retrieval
isolation (incl. agent context), and capture full provenance before the
readiness gate can pass.

**Status:** Preparation stopped at the gate. NOT READY. The frozen contract
remains untouched.

## REFERENCE CHECKPOINT (pre-benchmark) — committed, pushed, verified

A durable checkpoint of the current world was created on GitHub before any
benchmark preparation, giving an immutable separation between *everything
built and proved up to Visual Edit + frozen ORB contract* and *what happens
during benchmark preparation/execution*.

**Checkpoint commit IDs (recorded in ORB provenance):**

```text
vestara-ai-core    ef01f47  (Activity Room + Visual Edit + migrations + findings)
vestara-blueprint  3c61793  (ORB-VE-001 v0.2.0 FROZEN contract)
vestara (root)     21c1618  (coordination gitlinks + AGENTS.md)
```

All three pushed to GitHub (`evillan0315/*`); **remote HEADs verified MATCH
local** after push.

**Deliberately excluded from the checkpoint (identified, not swept in):**
`react-dashboard/` (scratch WIP per AGENTS.md), `vestara.env` (credentials),
`.env` (gitignored credentials), `.vestara/` runtime state (gitignored).

This boundary is durable: before it, we built the organization; after it, we
began testing whether the organization can work on its own.

## GitHub as external governance surface — architecture principle (pre-ORB)

Established during checkpoint + branch-protection work (Director + Reviewer),
recorded so ORB can test whether the abstraction already holds up.

**Observation:** protecting `main` via GitHub rulesets (block force-push,
block deletion) made repository policy an *external* enforcement layer:

```text
Observed risk → governance decision → repository policy → GitHub ruleset
→ remote verification → 3 repositories protected
```

Intent was expressed once, translated into policy, executed, and verified —
without per-repo manual configuration. This is the first instance of an
**external execution surface** for Vestara governance.

**Emerging architecture principle — Activity Room is a projection, not an
owner.** GitHub (and later CI/CD, deployment, issue trackers, monitoring,
business systems) sits *underneath* Vestara as external execution truth:

```text
GitHub: external execution truth
   ↓ repository events / evidence
Vestara organizational interpretation
   ↓ Effective State
Activity Room: human-understandable meaning
```

- Activity Room must not own integrations; it renders their meaning.
  Integrations live below as **capabilities/events/evidence**, interpreted by
  the organizational runtime. This prevents the UI from becoming the
  architecture.
- Repository events have organizational meaning, not Git noise:
  `Developer submitted implementation` · `Verification completed` ·
  `Repository Governance authorized integration` · `GitHub merged → main`.
  The underlying event (SHA, PR, checks, workflow run) stays immutable
  evidence, available through Inspect.
- **Authority boundaries become executable.** Repository mutation is governed
  by organizational state: `VERIFIER FAILED → MERGE_READY=false → merge
  prohibited` is stronger than prompt-level "don't merge unless tests pass."
- **Defense in depth:** an autonomous system should not rely solely on its own
  self-restraint. GitHub independently enforces parts of the boundary
  (experiments may mutate freely on branches/worktrees; `main` is protected).
- **Three worlds:** Protected World (`main`, Blueprint, accepted evidence,
  reference state) · Working World (feature branches, agent worktrees,
  ordinary development) · Experimental World (ORB baseline, isolated worktree,
  controlled authority, failures allowed, disposable state).
- **Governance is earned through evidence, not adopted as convention.**
  Today: deletion + non-fast-forward only (direct fast-forward automation must
  keep working). Later, evidence from the first 50 changes could justify
  enabling required status checks; evidence of reliable PR/review could justify
  disabling direct pushes to `main`. Do not enable heavyweight restrictions
  because they are conventional best practices.

**ORB relevance:** this gives Activity Room its first genuinely demanding
workload — explaining an organization whose behavior we deliberately are not
controlling. The abstraction holds up if GitHub operations, agent
responsibility, verification, reopening, human intervention, and terminal
state naturally become understandable through the existing room. If not, we
record exactly what's missing. Either way, no implementation in this scope.

## Agent Stall / Responsibility Liveness Finding (pre-ORB)

**Classification:** observational finding. Do **not** fix before ORB — let the
experiment challenge the current system. Not a feature requirement; not to be
implemented in any currently authorized scope (see Boundary).

**Repeated observation (multiple days/tasks, not an isolated hiccup):** an
agent can retain active responsibility while producing no terminal conclusion,
responsibility transfer, blocked state, human request, or durable progress.
The last visible state ends in reasoning without a terminal response.

**Critical nuance:** the reasoning itself was not bad. Developer repeatedly
reconsidered whether baseline construction was authorized, arrived close to the
correct organizational response (create the observation protocol, then request
explicit authorization before a consequential operation), yet never converted
that into organizational state.

> The failure was that the reasoning never became organizational state.

The failure mode is a transition, not a crash:

```text
ACTIVE
  ↓
Reasoning
  ↓
Ambiguous authority
  ↓
Reconsider → Reconsider → Reconsider
  ↓
...nothing
```

vs. what the organization needs:

```text
BLOCKED
Reason: authorization ambiguity
Current owner: Developer
Required resolution: Director authorization
Needs Director: Yes
No justified autonomous action remains.
```

**Two distinct possible causes — Activity Room should eventually make them
distinguishable:**

1. **Technical disappearance:** model invocation timeout, process death,
   connection failure, context exhaustion, provider failure, runtime exception.
2. **Organizational deadlock:** the agent remains cognitively active but cannot
   confidently select an authorized next action, and no mechanism forces it to
   yield responsibility, request clarification, declare itself blocked, or
   terminate.

**Core equation:**

> `active responsibility + absence of meaningful progress ≠ in progress`

The organizational model must eventually distinguish `QUIESCENT`, `WAITING`,
`BLOCKED`, `FAILED`, and `STALLED`.

**QUIESCENT vs STALLED:**

```text
No activity + no unresolved responsibility   = QUIESCENT
No activity + unresolved responsibility      = STALLED
```

**Derivation from observable liveness evidence, not private reasoning:**

```text
Developer responsibility acquired
  ↓
Last durable activity: T0
  ↓
No new evidence / completion / responsibility transfer /
explicit BLOCKED / human request
  ↓
Expected progress window exceeded
  ↓
STALLED condition created
```

**Observer's role boundary:** Observer may detect the condition but must not
assume the stalled participant's engineering responsibility. Observer says:
"the organization currently believes work is in progress, but there is no
evidence that work is progressing." Responsibility for resolving the
stalled-agent condition transfers elsewhere if the agent is unavailable — not
responsibility for its engineering task.

**Required response from a stalled agent (one of):** resume with evidence ·
declare BLOCKED · request required human input · transfer responsibility ·
report execution/runtime failure.

**Activity Room should eventually expose it simply:**

```text
ORB-VE-001  STALLED
Developer has responsibility for: Synthetic baseline preparation
Last meaningful activity: 12 minutes ago
No completion, transfer, block, or human request has been recorded.
Vestara is determining why progress stopped.
```

→ then possibly `WAITING FOR HUMAN` with one precise decision question
(e.g., "Authorize synthetic baseline construction? [Authorize] [Do not
authorize]").

**Why not fix it now:** ORB may reproduce exactly this condition. The outcome
is evidence either way — Activity Room keeps saying `IN PROGRESS` while no one
produces evidence, Effective State derives `STALLED`, or Vestara recognizes
authority ambiguity and asks one precise question.

**Relates to:** the earlier emerging principle — *the organization remembers
the work, not the agent session*. An agent workflow knows who is running; an
organization needs to know whether the participant who owns responsibility is
actually making progress — and what to do when they aren't.

## Boundary

Do not implement Observer, promotion, organizational hierarchy, or recovery
orchestration as part of Incident #0001 / Phase 1.1a or any currently
authorized scope. These findings are inputs for future Blueprint/governance
work only.
