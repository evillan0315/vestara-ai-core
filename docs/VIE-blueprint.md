---
title: VIE — Vestara Intent & Evidence Intelligence
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# VIE — Vestara Intent & Evidence Intelligence

> **Status**: PROPOSED BLUEPRINT — Documentation Only  
> **Authored by**: Director  
> **Date**: 2026-08-30  
> **Frozen baselines**: AR-REC-A at `355922b`, AR-REC-B at `5dc54ba`, AR-REC-C1 at `fc30f8b`, AR-REC-C2-D1 at `83e68cc`, AR-REC-C2-I1 at `4418709`, AR-REC-C2-I2-C1 at `a8cc2e3`, AR-REC-C2-I2-I1 at `f83e1a4`, C2-I3-PREFLIGHT at `e2b6164`, C2-I3-D1 at `6f89e8d`, C2-I3-D2 at `5ead7a6`  
> **Mutation scope**: Documentation only. No production code, no new module, no Workflow/Harness/Agent changes, no Activity Room changes, no orchestration changes.  
> **Implementation authorization**: NOT AUTHORIZED. This is a proposed blueprint direction with phased research gates, not an ADR, production contract, or implementation authorization.

---

## Central Hypothesis

> **A human should be able to express concise natural intent while Vestara resolves the context, evidence, ambiguity, authority, capabilities, task structure, and verification requirements necessary to turn that intent into precise and governable work.**

This is not merely prompt generation.

```
Human Intent
     ↓
Intent Resolution
     ↓
Context Resolution
     ↓
Evidence Acquisition
     ↓
Ambiguity Resolution
     ↓
Authority Resolution
     ↓
Task Specification
     ↓
Capability / Delegation Resolution
     ↓
Minimum-Sufficient Context Compilation
     ↓
Runtime / Agent
     ↓
Execution
     ↓
Verification
     ↓
Evidence
     ↓
Grounded Result
```

## Two Complementary Directions

### Execution Intelligence

> "Improve the UI/UX of the Activity Room."

Vestara determines what information and process are required to safely accomplish that request.

### Evidence Intelligence

> "Tell me about a difficult architecture problem I solved involving AI."

Vestara retrieves actual engineering history and constructs an evidence-supported answer appropriate to the user's purpose.

They share context/evidence infrastructure, but we should not assume they eventually become one subsystem.

---

## Invariant

> **VIE exists to reduce the amount of specification humans must manually provide without reducing the evidence, precision, governance, or verification required before Vestara acts.**

---

## Emerging Principles

These are observations and hypotheses, not frozen implementation contracts.

```
Human intent ≠ execution specification.

Long prompts are currently a serialization
of information the system may eventually resolve itself.

Context should be retrieved rather than repeatedly regenerated.

Evidence should constrain claims.

Uncertainty should trigger investigation or clarification,
not silent invention.

Models may reason probabilistically while authority remains deterministic.

Delegate evidence acquisition when uncertainty is separable.

The owning agent retains synthesis responsibility.

Events accelerate continuation;
durable state guarantees recoverability.

Recommendation ≠ decision.
Decision ≠ authorization.
Authorization ≠ execution.
Execution ≠ verification.
```

---

## Milestone Structure

```
VIE-A — FOUNDATION RESEARCH
VIE-0  Preserve Discovery
VIE-1  Intent Resolution
VIE-2  Context Authority
VIE-3  Evidence Retrieval
VIE-4  Ambiguity & Clarification

VIE-B — TASK INTELLIGENCE
VIE-5  Task Topology
VIE-6  Capability & Delegation
VIE-7  Execution Specification
VIE-8  Context Compilation
VIE-9  Governance Boundary

VIE-C — EVIDENCE INTELLIGENCE
VIE-10 Evidence-Grounded Synthesis
VIE-11 Contextual Projection

VIE-D — PRODUCT & ECONOMICS
VIE-12 Activity Room Experience
VIE-13 Resource / Model Intelligence

VIE-E — VALIDATION
VIE-14 Controlled Experiment
VIE-15 Architecture Decision
VIE-16 Productionization
```

There should be a hard gate between each batch.

---

## Phase VIE-0 — Preserve the Discovery

**Status: DOCUMENTATION ONLY**

The purpose is to prevent today's discoveries from disappearing while making zero architectural commitment.

Record the observations we've made while working with Activity Room, AR-REC, MiMo and our own manual instruction construction.

Capture the emerging principles listed above.

Also explicitly record:

> **These are observations and hypotheses, not frozen implementation contracts.**

No production code. No new module. No Workflow/Harness/Agent changes. No Activity Room changes. No orchestration changes.

**Exit:** blueprint entry and future milestone exist.

---

## Phase VIE-1 — Intent Resolution Research

Question:

> What information is actually contained in a short human request, and what information must Vestara resolve before acting?

Use representative requests:

```
"Make the participant names larger."

"Improve the UI/UX of Activity Room."

"Make Activity Room production ready."

"Build a dashboard."

"Fix the API performance problem."

"Explain why we rejected the central bridge."
```

Study dimensions such as:

```
objective
target
scope
ambiguity
risk
authority required
existing context
evidence requirements
subjectivity
verification requirements
```

A key output should be an **intent sufficiency model**.

Conceptually:

```
Intent
  │
  ├── sufficient
  │      ↓
  │   execute bounded task
  │
  └── insufficient
         ↓
     Can Vestara resolve it?
        /       \
      yes        no
       ↓          ↓
    retrieve    ask human
```

The important research question is not:

> "How do we make prompts longer?"

It is:

> **"How does Vestara determine what is missing?"**

**Exit:** documented model of sufficient versus insufficient execution intent.

---

## Phase VIE-2 — Context Authority Model

Determine where resolved information should come from.

Potential authoritative sources already exist conceptually throughout Vestara:

```
Repository state
Architecture documents
Blueprint
Frozen decisions
Milestones
Workflow state
Agent configuration
Team configuration
Provider/model configuration
Verification evidence
Git history
Runtime state
Activity history
Human conversation
```

But they do not all have equal authority.

We need to distinguish:

```
Authoritative
Derived
Historical
Advisory
Ephemeral
User-provided
Model-generated
Verified
Unverified
```

For example:

Conversation memory saying something was implemented must never outrank repository and verification evidence showing otherwise.

**Exit:** context-source and authority taxonomy.

---

## Phase VIE-3 — Evidence Retrieval Model

This will eventually intersect with the planned RAG/retrieval work, which is another reason **not to implement VIE now**.

Research how Vestara could answer:

> "What do we already know that is relevant to this task?"

Potential retrieval targets:

```
Accepted architecture
Previous audits
Rejected alternatives
Implementation commits
Tests
Verification reports
Milestone freezes
Known failures
Performance measurements
Relevant files
Prior human decisions
```

The result shouldn't be a massive context dump.

It should be **task-relevant evidence**.

```
Available project knowledge
           ↓
       Retrieval
           ↓
      Relevance
           ↓
      Authority
           ↓
      Freshness
           ↓
   Minimum evidence set
```

**Exit:** evidence retrieval requirements suitable for later RAG work.

---

## Phase VIE-4 — Ambiguity & Clarification Intelligence

This is critical to the Activity Room experience.

Vestara should distinguish between information it can discover and information only the human can decide.

For:

> "Improve Activity Room UI/UX."

Vestara can discover:

```
existing components
responsive problems
accessibility issues
API capabilities
design tokens
current architecture
performance problems
```

But it may need the human for:

```
preferred direction
business priority
acceptable redesign scope
subjective visual preference
product trade-offs
```

The goal is:

> **Ask the minimum number of questions necessary to safely resolve material ambiguity.**

Not:

```
Human gives short prompt
      ↓
Vestara responds with 27 questions
```

That would simply move prompt engineering into a questionnaire.

**Exit:** clarification policy research.

---

## Phase VIE-5 — Task Topology Research

This phase captures what caught our attention while observing MiMo.

Study how task characteristics influence execution topology.

Possible dimensions:

```
Breadth
Knowledge gap
Independence
Mutation risk
Specialization
Evidence requirement
Context cost
Coordination cost
Verification cost
```

Examples:

```
"Increase participant font size"

Direct task
     ↓
Developer
```

versus:

```
"Improve Activity Room UI/UX"

Investigation
     ↓
Findings
     ↓
Scope resolution
     ↓
Plan
     ↓
Bounded implementation
     ↓
Verification
```

versus:

```
"Make Activity Room production ready"

Audit
 ├── reliability
 ├── performance
 ├── UX
 ├── accessibility
 └── realtime behavior
        ↓
Synthesis
        ↓
Milestone plan
        ↓
Multiple bounded implementations
```

This phase studies TODO decomposition, dependency reasoning and delegation separately.

Do **not** assume MiMo's implementation is Vestara's desired implementation.

**Exit:** task-topology decision model.

---

## Phase VIE-6 — Capability & Delegation Intelligence

Now investigate:

> Who or what should perform each part of the resolved task?

Potential capabilities:

```
Owning agent
Explore agent
Developer
Planner
Reviewer
Verifier
Deterministic tool
Repository search
Runtime
Human
External integration
```

Important invariant:

> **Capability selection does not confer authority.**

And:

> **Child work must not automatically inherit every capability or permission of its parent.**

This is where the observations from MiMo become useful evidence.

We should study:

```
when delegation helps
when it wastes context
what context children need
what permissions children receive
how results return
how failures propagate
how lineage is preserved
how budgets constrain delegation
```

**Exit:** provider/runtime-neutral delegation requirements.

---

## Phase VIE-7 — Execution Specification Contract Research

Only after the previous research should we ask whether Vestara needs a formal structured artifact.

Conceptually it might contain:

```
ExecutionSpecification


objective
target
scope


resolvedContext
evidence


knowns
unknowns


constraints
authorization


taskTopology
capabilities


acceptanceCriteria
verificationRequirements


budget
provenance


stopCondition
```

But those fields are **illustrative**, not a contract today.

The key question:

> What is the minimum durable structure required to reproduce a governed task without depending on one giant prompt?

**Exit:** candidate contract or explicit finding that existing Vestara contracts are sufficient.

---

## Phase VIE-8 — Minimum-Sufficient Context Compilation

This is where the "dynamic long prompt" idea becomes concrete.

Vestara should not blindly generate giant prompts.

Instead:

```
Resolved Task
     ↓
Runtime requirements
     ↓
Existing runtime context
     ↓
Missing relevant context
     ↓
Minimum sufficient package
     ↓
Runtime-specific serialization
```

MiMo might need one representation.

DeepSeek another.

Codex another.

A local model might receive much smaller bounded tasks.

This creates an important optimization objective:

> **Maximum task sufficiency with minimum unnecessary context.**

Potential measurements later:

```
tokens transferred
cache reuse
retrieval size
first-pass acceptance
retry count
verification success
execution cost
context duplication
```

**Exit:** context compilation model.

---

## Phase VIE-9 — Governed Execution Boundary

Now connect the specification to Vestara's existing governance architecture.

The compiled instruction must never become authority itself.

```
ExecutionSpecification
          ↓
      Agent reasoning
          ↓
      Proposed work
          ↓
Existing Vestara authorization
          ↓
Existing execution authority
          ↓
Verification
```

The model cannot create authority by generating:

```
authorization: "approved"
```

Authority must come from its actual owner.

This phase should prove that intent compilation does not create another orchestration/governance system.

**Exit:** architecture boundary review.

---

## Phase VIE-10 — Evidence-Grounded Synthesis

Now introduce the second major use case.

Example:

> "Tell me about a difficult architecture problem I solved involving AI."

Vestara resolves:

```
Purpose:
Interview preparation

Relevant project:
Vestara

Relevant evidence:
AR-REC

Need:
architecture problem
personal contribution
technical difficulty
decision
implementation
outcome
```

Then retrieve evidence.

Crucially, claims should reflect evidence state:

| Evidence state | Permitted wording |
|---------------|-------------------|
| Proposed | "I explored…" |
| Audited | "I investigated…" |
| Designed/accepted | "I designed…" |
| Implemented | "I implemented…" |
| Verified | "I implemented and verified…" |
| Rejected | "I evaluated and rejected…" |

This is a potentially powerful anti-hallucination mechanism.

**Exit:** evidence-to-claim model.

---

## Phase VIE-11 — Contextual Projection

The same evidence can produce different outputs.

```
                  Engineering Evidence
                          │
          ┌───────────────┼────────────────┐
          ↓               ↓                ↓
       Interview       Client          Developer
          ↓               ↓                ↓
      STAR answer     Product story    Technical detail


          ↓               ↓                ↓
       Investor        New team          Personal
          ↓               ↓                ↓
     Value story     Onboarding       Project recap
```

Example requests:

```
"Give me the 60-second version."

"Explain it to a client."

"Give me the architecture deep dive."

"Show the evidence."

"Turn this into a portfolio case study."

"What mistakes did we make?"

"What did we learn?"
```

One evidence base, different contextual projections.

**Exit:** audience/purpose projection model.

---

## Phase VIE-12 — Activity Room Experience

Only here do we seriously design the user experience.

By this point, Activity Room itself should already be production ready.

The desired interaction remains extremely simple:

```
Eddie:
Improve the UI/UX of Activity Room.

Vestara:
I found three areas that appear worth addressing...

[ Proceed ]
[ Show findings ]
[ Change scope ]
```

Or perhaps no clarification is necessary:

```
Eddie:
Fix the participant name overflow.

Vestara:
Working on it.
```

Complexity remains behind the conversational interface.

Activity Room must remain the **human interaction surface**, not become the orchestration engine.

**Exit:** validated UX design.

---

## Phase VIE-13 — Resource & Model Intelligence

Then investigate one of the ideas I think could become particularly valuable for Vestara:

> Can better task resolution allow cheaper models to produce stronger engineering outcomes?

Compare:

```
Large expensive model
+ huge ambiguous problem
```

against:

```
Smaller/cheaper model
+ bounded task
+ authoritative context
+ relevant evidence
+ clear acceptance criteria
+ focused verification
```

Measure actual outcomes rather than model prestige.

Possible metric:

> **Accepted verified capability delivered per unit compute.**

This would connect naturally with future provider/model analytics without coupling VIE to them prematurely.

**Exit:** measurable model/task-routing hypothesis.

---

## Phase VIE-14 — Production Experiment

Only after all of that would I authorize an implementation experiment.

And it should be deliberately small.

Candidate future scenario:

> **"Improve the UI/UX of the Activity Room."**

Not because Activity Room still needs improvement at that point, but because we'll have extensive evidence about the domain.

Compare:

**Control:** direct short prompt → model.

**Experiment:** short prompt → Vestara resolution → compiled task → same model.

Measure:

```
context accuracy
questions asked
unnecessary exploration
scope violations
first-pass acceptance
verification success
token usage
execution time
retries
human corrections
```

That would actually test the hypothesis.

**Exit:** evidence that context compilation improves outcomes—or evidence that it doesn't.

---

## Phase VIE-15 — Architecture Decision

Only after the experiment do we decide whether this becomes:

```
a new Vestara subsystem
existing Workflow capability
Agent capability
Context capability
RAG capability
Activity capability
combination of existing capabilities
or something we haven't identified yet
```

This is deliberately late.

We should **not design the module first and then try to prove why it should exist.**

Evidence first.

Architecture second.

**Exit:** ADR or rejection.

---

## Phase VIE-16 — Productionization

Only if VIE-15 accepts the architecture:

```
contracts
persistence
APIs
governance
runtime adapters
observability
failure recovery
budgets
security
verification
Activity Room integration
documentation
```

Then normal Vestara milestone discipline takes over:

```
Audit
  ↓
Design
  ↓
Review
  ↓
Authorize
  ↓
One bounded implementation
  ↓
Verify
  ↓
Evidence
  ↓
Freeze
```

---

## Sequencing

```
                NOW
                 │
                 ▼
        Record VIE Blueprint
                 │
                 ▼
          Freeze VIE-0
                 │
                 X
          NO IMPLEMENTATION
                 │
                 │
                 ▼
       RETURN TO ARX-015 / AR-REC
                 │
                 ▼
      Activity Room Production Ready
                 │
                 ▼
            RAG / Retrieval
                 │
                 ▼
       Re-evaluate VIE research
```

RAG/retrieval is deliberately placed before serious VIE implementation because a large part of what we're imagining depends on retrieving authoritative evidence efficiently. Building VIE first could cause us to reinvent retrieval inside it.

---

## The Simplest Product Test

If Vestara can eventually take that ordinary human sentence, determine what it needs to know, retrieve what it already knows, ask only what it cannot resolve, construct the appropriate work, use its available intelligence intelligently, remain inside its authority, and return a verified result—then we've accomplished something considerably more useful than generating a longer prompt.

> **"Improve the UI/UX of the Activity Room."**

---

## Appendix: Future Capability-Request UX Scenario

> **FUTURE ENHANCEMENT — DESIGN TARGET ONLY. No implementation authorization. Activity Room production readiness remains the prerequisite.**

This is a concrete future Activity Room capability-request UX scenario derived from actual Vestara development experience. It fits what we've learned without needing to implement it now.

The important part is that this is not merely a prettier version of OpenCode's permission dialog. Vestara has enough context to make the approval meaningful.

### Example Interaction

> **MiMo — Capability request**
> I need temporary write access to `vestara-blueprint/21-research/**` to record the VIE research blueprint.
>
> Scope: VIE documentation task only
> Requested capability: filesystem read/write
> Requested by: MiMo / Developer
> Runtime: OpenCode
>
> **[ Allow once ] [ Allow for task ] [ Reject ]**

### Architecture

```
Agent encounters protected operation
              ↓
     Capability request
              ↓
      Vestara Governance
              ↓
  Evaluate current policy/context
              ↓
           ASK
              ↓
        Activity Room
              ↓
        Human Decision
       /       |       \
 Allow once  For task   Reject
      ↓         ↓          ↓
      └──── Authorization ─┘
                ↓
      Scoped Capability Grant
                ↓
        Runtime Adapter
                ↓
   OpenCode / Codex / Claude Code
                ↓
       Runtime Enforcement
                ↓
       Bounded Operation
                ↓
       Audit / Evidence
                ↓
       Grant expiration
```

### Invariants

These invariants prevent this future feature from becoming a dangerous generic "yes button":

1. **The human approves a specific capability against a specific resource and scope**, not the model's arbitrary future actions.
2. **The Activity Room records the decision but does not grant filesystem permissions itself.** Vestara's authorization/governance authority creates the grant.
3. **A runtime adapter translates that grant** into whatever the selected runtime can enforce.
4. **If the runtime cannot enforce the requested scope, Vestara must not pretend that it can.**
5. **Grants should expire** according to their declared lifetime rather than silently becoming permanent.

### Button Semantics

```
ALLOW ONCE
────────────────────────
Agent:      MiMo
Capability: filesystem.write
Resource:   specific requested resource
Use:        one authorized operation
Expiry:     consumed / timeout

ALLOW FOR TASK
────────────────────────
Agent:      MiMo
Capability: filesystem.write
Resource:   approved task scope
Task:       VIE documentation
Expiry:     task completion / cancellation / timeout

REJECT
────────────────────────
No grant produced.
Task remains blocked or must find
an authorized alternative.
```

**Allow always** should be approached with much more caution. OpenCode can offer that because it owns its own runtime permission experience. Vestara has broader agents, workflows, repositories and runtimes. Persistent grants deserve a separate permission-management decision rather than being the convenient third button beside a temporary request.

### Connection to AR-REC

```
MiMo recommends/request access
             ≠
MiMo receives access

Human selects "Allow for task"
             ≠
filesystem operation executes

Human decision
             ↓
authorization validation
             ↓
scoped grant
             ↓
runtime enforcement
             ↓
operation
             ↓
verification/evidence
```

Our current AR-REC work is already teaching us how the **human-decision portion** of this future experience should behave without Activity Room becoming the permission authority.

### Runtime-Neutral Grants

```
                   Vestara Grant
                        │
             filesystem.write
             resource: X
             scope: task Y
                        │
          ┌─────────────┼─────────────┐
          ↓             ↓             ↓
      OpenCode       Codex       Claude Code
       adapter       adapter        adapter
          ↓             ↓             ↓
       native        native         native
     enforcement   enforcement    enforcement
```

### Acceptance Scenario

> **An agent needs access outside its current execution boundary. It explains why. Vestara asks the human in Activity Room. The human grants narrowly scoped authority. Vestara translates that authority into a runtime-enforceable capability. The agent continues without restarting its work, and the grant expires automatically.**

---

*End of VIE blueprint. Documentation only. No implementation authorized.*
