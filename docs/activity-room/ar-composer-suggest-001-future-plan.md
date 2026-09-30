---
title: AR-COMPOSER-SUGGEST-001 — Context-Aware Composer Intelligence
version: 0.1.0
status: planned-future
owner: vestara
last-reviewed: 2026-09-28
next-review: 2026-10-28
---

# AR-COMPOSER-SUGGEST-001 — Context-Aware Composer Intelligence

> **STATUS: PLANNED / FUTURE — NOT IMPLEMENTATION-AUTHORIZED.**
> Planning / design-lineage capture only. No implementation, mutation, UI change,
> restart, codegen, or delegation is authorized by this record.
> Activation requires explicit authorization by Eddie.

## A. Milestone identity and status

- **ID:** AR-COMPOSER-SUGGEST-001
- **Title:** Context-Aware Composer Intelligence
- **Status:** PLANNED / FUTURE (roadmap-governance stage: Proposed — problem identified, not reviewed)
- **Type:** First-class Assistant / Activity Room capability (design-lineage, not current-system)
- **Priority:** HIGH — bounded detour before returning to the current roadmap
- **Initial command:** `/suggest`
- **Purpose:** Help a human turn an incomplete thought into a clear, context-aware
  instruction without taking authority away from the human.
- **Sequencing invariant:** AR-COMPOSER-SUGGEST-001 MUST NOT replace the existing
  Assistant contextual-recommendation system. It investigates that system and expands
  the same contextual intelligence down into the composer.

## B. Motivation / current observations (preserved)

The Assistant already understands the current surface:

```text
CURRENT CONTEXT
SETTINGS · RUNTIME
Runtime
/settings/runtime
```

and already derives contextual actions:

```text
SUGGESTED FOR THIS PAGE
Explain these settings
Review configuration
Recommend improvements
Check related issues

UI/UX RECOMMENDATIONS
Review token usage
Check contrast & spacing

QUICK ACTIONS
Inspect repository
Check project status
Explain architecture
Find recent changes
```

This system MUST NOT be replaced. The detour investigates it and expands the same
contextual intelligence down into the composer. The important evolution is:

```text
Current
Context → Suggested actions

Expanded
Context + Draft → Suggested intent/instruction
```

That is a very natural next step.

## C. Core experience

The core experience is extremely simple. A user starts naturally:

```text
I want documentation here
```

Then types:

```text
/suggest
```

Vestara considers the draft plus permitted current context and presents candidates
such as:

```text
Clarify intent
────────────────────────────────────────
Add contextual documentation to the Settings → Runtime → Codex
panel. A documentation action should open a right-side drawer...

Prototype
────────────────────────────────────────
Build a bounded contextual-documentation prototype for the
Settings → Runtime → Codex panel using existing Vestara UI
primitives...

Audit first
────────────────────────────────────────
Inspect the current Codex Settings panel, relevant documentation,
configuration ownership, reusable drawer components, and source
implementation before making changes...

Implement
────────────────────────────────────────
Add contextual documentation to the Settings → Runtime → Codex
panel. Use existing Vestara documentation and repository evidence...

Verify
────────────────────────────────────────
Verify the Codex contextual-documentation implementation against
the current Settings configuration, repository sources, existing
documentation, and UI behavior.
```

Selecting one places the proposed instruction into the composer. It does
**not send it**. The human can modify it and then explicitly send it.

## D. Fundamental lifecycle (frozen intent)

```text
Human draft
     │
     ├──────────────┐
     │              │
     ▼              ▼
 /suggest      Context Resolver
     │              │
     └──────┬───────┘
            ▼
   Suggestion Intelligence
            │
            ▼
    Candidate Suggestions
            │
            ▼
       Human selects
            │
            ▼
      Composer updated
            │
            ▼
       Human edits
            │
            ▼
       Human sends
```

Authority invariant: suggestion updates the composer; only the human sends.

## E. Context envelope (target, not frozen)

The context envelope should eventually support:

```text
ComposerSuggestionContext

Draft
  current text
  slash command
  @mentions
  attachments
  selected artifacts

Surface
  application
  route
  page
  panel/component
  selected UI object

Workspace
  workspace
  repository
  project
  working directory
  selected file(s)
  repository state

Session
  conversation
  participants
  recent messages
  active executions
  unresolved questions
  recent decisions

Continuity
  related previous conversations
  previous decisions
  previous work
  relevant artifacts
  relevant evidence

Capabilities
  available runtimes
  available tools
  participant capabilities
  permitted operations
```

## F. Context pipeline (mandatory on activation)

Retrievable context MUST NOT all become model context. The pipeline is:

```text
Available Context
       ↓
Context Discovery
       ↓
Relevance Selection
       ↓
Policy / Permission
       ↓
Freshness / Authority
       ↓
Bounded Context Envelope
       ↓
Suggestion Intelligence
```

This keeps `/suggest` from becoming a giant "send everything we know to the model"
feature.

## G. Relationship to existing recommendations (boundary)

Preserve what already exists on the Assistant home screen. Those recommendations answer:

> **"What could I do here?"**

Composer suggestions answer:

> **"Given what I'm trying to say, how could I express the intent more effectively?"**

Those are related but not identical:

```text
Context Recommendations
        │
        │  "What can I do?"
        ▼
Suggested actions

Composer Suggestions
        │
        │  "What am I trying to ask?"
        ▼
Suggested instructions
```

They should probably share context infrastructure and potentially suggestion
intelligence, but remain different interaction surfaces.

## H. `/suggest` behavior

A small vocabulary from the beginning:

```text
/suggest
/suggest clarify
/suggest expand
/suggest audit
/suggest prototype
/suggest implement
/suggest verify
```

Plain `/suggest` asks Vestara to decide which useful candidate classes apply.
The specialized forms constrain it. Example:

```text
I want documentation here

/suggest audit
```

could generate:

```text
Audit the current Settings → Runtime → Codex panel and determine
the existing documentation, configuration authority, runtime
implementation, reusable UI primitives, source locations, and
tests relevant to contextual documentation.

Do not modify implementation. Preserve unknown or conflicting
evidence rather than inferring missing facts.
```

That is already approaching the quality of the bounded prompts manually given
to Codex.

## I. Suggestions are operations, not merely strings

Avoid a contract that only contains:

```ts
{ text: string }
```

Required semantics (illustrative, NOT frozen pending audit):

```ts
type ComposerSuggestionKind =
  | 'clarify'
  | 'expand'
  | 'investigate'
  | 'audit'
  | 'prototype'
  | 'implement'
  | 'verify';

type ComposerSuggestionOperation =
  | 'replace'
  | 'append'
  | 'refine';

interface ComposerSuggestion {
  id: string;
  kind: ComposerSuggestionKind;
  label: string;
  preview: string;
  proposedText: string;
  operation: ComposerSuggestionOperation;

  rationale?: string;
  contextRefs?: ComposerContextRef[];
}
```

`contextRefs` becomes particularly useful. A suggestion could visibly explain:

```text
Based on

Current route       /settings/runtime
Current surface     Settings → Runtime
Current panel       Codex
Workspace           vestara-ai-core
Current directory   apps/workspace
Recent topic        Contextual documentation
Previous decision   Codex transport binding lifecycle
```

That makes the intelligence inspectable. The user should eventually be able to
remove something:

```text
Previous conversation    [×]
Current directory        [×]
Attached image           [×]
```

and regenerate suggestions. Principle:

> **Context awareness ≠ hidden context.**

## J. Negative intelligence (acceptance criterion)

If the user already types:

```text
Audit the Settings → Runtime → Codex panel for the source of the
runtime transport configuration. Do not modify anything. Report
the configuration contract, persistence authority, API path,
runtime consumer, and tests. Preserve UNKNOWN where ownership
cannot be established.
```

then `/suggest` MUST NOT manufacture three paragraphs of additional prompt
engineering. One candidate should be:

```text
Ready to send

Your instruction already establishes the target, operation,
scope, required evidence, mutation boundary, and uncertainty
handling.
```

That demonstrates actual judgment.

## K. First implementation stays bounded (when activated)

Explicitly NOT in the first slice: previous-conversation semantic retrieval,
repository-wide RAG, graph knowledge, automated Workflow generation, or autonomous
suggestion execution.

First vertical slice:

```text
Assistant composer
       +
existing current-page context
       +
current conversation
       +
draft message
       ↓
/suggest
       ↓
3–5 suggestions
       ↓
select
       ↓
composer updated
       ↓
user sends manually
```

Progressive context thereafter:

```text
001A  Draft + current Assistant context
001B  Current conversation/session
001C  Workspace + route + directory
001D  Attachments/selections
001E  Related previous conversations
001F  Knowledge/evidence/decisions
```

Each additional context source must measurably improve suggestions rather than
assuming more context is always better.

## L. Acceptance fixture (empirical, not synthetic)

This conversation itself is the fixture:

```text
Draft:
"I want documentation here"

Context:
workspace = vestara-ai-core
route = /settings/runtime
surface = Settings → Runtime → Codex
topic = contextual documentation
```

A high-quality result should be comparable to:

```text
Add contextual documentation to the Settings → Runtime → Codex
panel. A documentation action should open a right-side drawer
explaining the panel using relevant existing Vestara documentation
and repository evidence. Include Overview, Current configuration,
Configuration, How to, Architecture, Source, and Related
documentation. Reuse existing Vestara UI primitives. Do not invent
implementation facts.
```

There is empirical evidence that this prompt was sufficient for Codex to produce
a surprisingly close implementation. So the test is not merely:

```text
Did /suggest generate nice prose?
```

It becomes:

```text
Did the generated suggestion preserve the human's intent?
Did it use relevant context correctly?
Did it avoid unsupported assumptions?
Was it concise enough to remain useful?
Did the receiving engineering agent understand it?
Did that agent discover the required repository evidence?
Did the resulting implementation match the intended product behavior?
```

The chain under test:

```text
Human thought
     ↓
Composer intelligence
     ↓
Executable intent
     ↓
Engineering agent
     ↓
Repository discovery
     ↓
Implementation
     ↓
Verification
```

## M. Required first task on activation (read-only audit)

Before any implementation, the first task is a **read-only audit of the
recommendation/suggestion machinery**: identify what already generates
"Suggested for this page", UI/UX Recommendations, Quick Actions,
current-context resolution, composer state, route/workspace context, and the
relevant contracts. Then expand what Vestara already knows rather than
accidentally creating a parallel intelligence system.

## N. Explicit non-goals

- No implementation, UI change, composer mutation, or runtime change under this record.
- No replacement of the existing Suggested-actions / Quick-actions system.
- No repository-wide RAG, semantic previous-conversation retrieval, graph knowledge,
  Workflow generation, or autonomous suggestion execution in the first slice.
- No sending of suggestions on behalf of the human; selection updates the composer only.
- No "send everything we know to the model" context behavior.
- No change to the current roadmap priority until Eddie explicitly activates this detour.

## O. Dependencies / sequencing

- **Consumes (read-only):** existing Assistant current-page context, composer state,
  route/workspace context, current conversation/session.
- **Produces:** no durable artifact until activated; on activation it must follow
  roadmap governance (PCS → UX → ATS before implementation).
- **Priority note:** recorded as a HIGH priority bounded detour, but remains
  PLANNED / FUTURE until explicitly activated.

## P. Acceptance criteria for eventually activating the milestone

- Eddie explicitly activates AR-COMPOSER-SUGGEST-001.
- §M read-only audit produced as evidence with reuse classifications (no parallel
  intelligence system).
- PCS/UX/ATS documents written and accepted per `docs/ROADMAP-GOVERNANCE.md`.
- Bounded context envelope (§F) and authority boundary (suggest ≠ send) approved.
- Negative-intelligence criterion (§J) defined measurably before any development begins.
- Acceptance fixture (§L) with the executable-intent → engineering-agent →
  implementation → verification chain defined as exit evidence.

## Q. Open questions / UNKNOWNs

- Actual current-context resolver and suggestion-machinery implementation locations.
- Whether recommendations and composer suggestions share infrastructure, intelligence,
  or only context contracts.
- Canonical `ComposerSuggestionContext` / `ComposerContextRef` shapes.
- Policy/permission and freshness/authority rules for the bounded envelope.
- Whether per-kind `/suggest` verbs beyond §H are needed.
- How context-ref removal + regeneration composes with composer state.

---

*Captured 2026-09-28 as design-lineage from the Director's AR-COMPOSER-SUGGEST-001
proposal. Current engineering priority unchanged. No implementation authorized.*
