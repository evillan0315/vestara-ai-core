# Vestara Language

> **Precision in language creates precision in thought.**

This document defines the precise meaning of words and phrases used throughout Vestara. Every participant — human or artificial — uses these terms consistently.

Ambiguity is the enemy of collaboration. When five agents use the same word to mean different things, they cannot work together. This document prevents that.

---

## Authority Levels

### NATURAL LAW

An immutable truth. Cannot be violated by any framework, constitution, decision, or evolution.

```
Example:
"Intelligence exists in many forms."

This means:
• No framework can assume intelligence is only human or only AI
• This is not a rule — it is a truth
• It cannot be amended, overridden, or exceptions granted
• It exists above all documents
```

**Natural Laws:**
1. Intelligence exists in many forms.
2. Identity precedes responsibility.
3. Knowledge must outlive its creator.
4. Trust is earned, never assumed.
5. Evolution must preserve purpose.
6. No participant succeeds alone. Intelligence grows through relationships.

### MUST

A constitutional requirement.

Cannot be overridden except by changing the Constitution. Violations are absolute prohibitions.

```
Example:
"Every participant MUST have an identity."

This means:
• No participant can exist without identity
• No exception is permitted
• No workaround is acceptable
• The only way to change this is to amend the Constitution
```

### SHOULD

Strong recommendation.

Exceptions require explicit justification. The justification must be documented and approved.

```
Example:
"Decisions SHOULD be recorded before implementation."

This means:
• Record decisions by default
• If you skip recording, you must explain why
• The explanation must be approved
• The default is to record
```

### MAY

Optional behavior.

No justification required. But the choice should be deliberate.

```
Example:
"Frameworks MAY use event-driven architecture."

This means:
• You can choose event-driven or not
• No approval needed either way
• But choose consciously, not by accident
```

### NEVER

An absolute prohibition. Equivalent to MUST NOT.

```
Example:
"Code MUST NEVER use the `any` type."

This means:
• No exceptions
• No workarounds
• No "just this once"
• The linter enforces this
```

---

## Domain Terms

### Participant

**Always means:** An entity capable of contributing knowledge, work, decisions, or collaboration.

**Never means:**
- Just a human
- Just an AI
- Just a user account
- Just a service

**Types:**
- Human
- AI
- Team
- Organization
- Framework
- Service
- Device

**Key insight:** An AI isn't an agent because it's an LLM. A human isn't an agent because they're a person. They're all Participants capable of acting. Any participant may temporarily act as an Agent. Agency is behavior, not identity.

---

### Identity

**Always means:** The immutable, persistent foundation of a participant.

**Never means:**
- A username
- A session
- A temporary state
- A role

**Characteristics:**
- Layer 0 — everything flows from identity
- Established once, persists across generations
- Cannot be changed, only archived

**Key insight:** Identity belongs to the participant. Agency belongs to the situation. Same identity, different context, produces different decisions. Identity never changes. Everything else does.

---

### Agent

**Always means:** A temporary behavior assumed by a participant.

**Never means:**
- A type of participant
- An AI-specific role
- A permanent state
- An identity

**Characteristics:**
- Any participant may act as an Agent
- Agency is behavior, not identity
- Context determines which behavior is appropriate
- Same participant, different context, different agent behavior

**Key insight:** Agent becomes simply one manifestation of a Participant. This removes AI bias from the entire platform.

---

### Signature

**Always means:** The accumulated evidence that says: "This participant behaves consistently."

**Never means:**
- A cryptographic signature
- A logo or brand
- A digital certificate
- A verification checkmark
- A name
- Trust itself

**Characteristics:**
- Earned through consistent behavior over time
- Cannot be forged
- Can be lost
- Represents continuity, not just identity
- Trust emerges from signature

**Key insight:** Your code is not your signature. Your GitHub account isn't your signature. Even your name isn't your signature. Your signature is the accumulated evidence that says you behave consistently.

---

### Context

**Always means:** A cross-cutting concern that determines how a participant acts.

**Never means:**
- A state
- A session
- A role
- An identity

**Characteristics:**
- Nobody acts in isolation
- Same participant, same identity, same capabilities, different context, produces different decisions
- Includes: project, urgency, environment, available knowledge, permissions, organization, current objective
- Without context, capabilities don't know when to be used

---

### Capability

**Always means:** A measurable ability possessed by a participant.

**Never means:**
- A role
- A permission
- A title
- An assumption

**Characteristics:**
- Independent of roles
- Measurable (can be tested, observed, validated)
- Accumulates over time
- Can be possessed by many participants

---

### Role

**Always means:** A temporary assignment of responsibility to a participant.

**Never means:**
- A capability
- An identity
- A permanent state
- A permission

**Characteristics:**
- Contextual (changes based on situation)
- Temporary (can be reassigned)
- Multiple roles per participant allowed
- Roles change; capabilities persist

---

### Knowledge

**Always means:** Information with owner, version, trust, references, and history.

**Never means:**
- Raw data
- A database row
- A file on disk
- A cache entry

**Characteristics:**
- Has identity (is a participant itself)
- Can be created, modified, passed between participants
- Carries trust and provenance
- Evolves over time

---

### Memory

**Always means:** The accumulation of knowledge over time.

**Never means:**
- A cache
- A log file
- A session store
- A database backup

**Characteristics:**
- Continuity of understanding across sessions
- Learning from the past
- Applying that learning to the future

---

### Organization

**Always means:** A relationship among participants.

**Never means:**
- A hierarchy
- A chain of command
- A reporting structure
- A department

**Characteristics:**
- Graph-based, not tree-based
- Relationships, not authority
- Evolves as participants collaborate

---

### Framework

**Always means:** A reusable platform capability.

**Never means:**
- An application
- A library
- A utility
- A tool

**Characteristics:**
- Provides common functionality to multiple applications
- Built on top of lower-level capabilities
- Persists while applications are rewritten

---

### Application

**Always means:** A user-facing experience.

**Never means:**
- A framework
- A service
- A library
- A platform

**Characteristics:**
- Built on top of frameworks
- The visible layer — what users interact with
- Can be rewritten; frameworks persist

---

### Decision

**Always means:** An organizational reasoning that explains why an architectural choice was made.

**Never means:**
- A code change
- A pull request
- A commit message
- An ADR (Architecture Decision Record)

**Characteristics:**
- Explains organizational reasoning, not just architecture
- Records WHY, not just WHAT
- Includes alternatives considered and rejected
- Produces knowledge that improves the system

---

### Blueprint

**Always means:** The architectural documentation that guides implementation.

**Never means:**
- A wireframe
- A mockup
- A design file
- A specification

**Characteristics:**
- Source of truth for architecture
- Code never overrides Blueprint
- Evolves through ADRs

---

### Constitution

**Always means:** The non-negotiable principles, rights, responsibilities, and boundaries of Vestara.

**Never means:**
- A law
- A policy
- A guideline
- A suggestion

**Characteristics:**
- Subordinate to The Vestara Principle
- Can be amended through proper process
- Defines how decisions are made

---

### Companion

**Always means:** A persistent AI presence that陪伴 a participant across time.

**Never means:**
- A chatbot
- A virtual assistant
- A search engine
- A tool

**Characteristics:**
- Remembers, learns, evolves with the participant
- Carries knowledge across sessions
- Preserves context across projects
- Builds trust over generations
- Seeks to amplify, never to replace

---

### The Companion Principle

**Always means:** A participant should never seek to replace another participant. It should seek to amplify them.

**Never means:**
- AI replacing developers
- AI replacing architects
- AI replacing organizations
- Competition between participants

**Characteristics:**
- Every participant exists to amplify the others
- Not to replace them
- Not to compete with them
- To make them more capable, more informed, more effective

---

### Generation

**Always means:** A major version of Vestara.

**Never means:**
- A release
- A deploy
- A sprint
- A feature

**Characteristics:**
- Each generation builds on the previous
- Code from earlier generations runs on later generations
- APIs are additive
- Data formats are backward compatible

---

## Relationship Terms

### Contains

A participant contains another.

```
Example:
"A Module contains Sections."

This means:
• The Module is the parent
• The Section is the child
• The Section cannot exist without the Module
• Deleting the Module deletes the Section
```

### Provides

A participant provides a capability.

```
Example:
"A Module provides a Setting."

This means:
• The Module is the source
• The Setting is the capability
• The Setting is accessed through the Module
• The Setting cannot exist without the Module
```

### Requires

A participant requires a capability.

```
Example:
"A Module requires a Skill."

This means:
• The Module needs this Skill to function
• The Skill must be provided by another participant
• If the Skill is unavailable, the Module cannot operate
```

### Belongs-to

A participant belongs to a group.

```
Example:
"A User belongs-to a Role."

This means:
• The User is assigned to the Role
• The Role is the group
• The User inherits the Role's permissions
• The assignment can be revoked
```

### Grants

A participant grants permission.

```
Example:
"A Role grants Permission."

This means:
• The Role is the authority
• The Permission is the capability
• Users with the Role get the Permission
• The Permission cannot exist without the Role
```

### Extends

A participant extends another.

```
Example:
"A Plugin extends a Module."

This means:
• The Plugin adds functionality to the Module
• The Module is the base
• The Plugin is the extension
• The Module works without the Plugin
• The Plugin cannot work without the Module
```

### Depends-on

A participant depends on another.

```
Example:
"A Module depends-on another Module."

This means:
• The first Module needs the second to function
• The second Module is independent
• If the second Module is unavailable, the first cannot operate
```

### Managed-by

A participant is managed by another.

```
Example:
"A Module is managed-by a User."

This means:
• The User has authority over the Module
• The User can configure, enable, or disable the Module
• The Module cannot manage itself
• The User is responsible for the Module
```

### Knows

A participant knows knowledge.

```
Example:
"A User knows a Preference."

This means:
• The User has access to the Preference
• The Preference is stored in the User's memory
• The Preference can be recalled and applied
• The Preference can be forgotten
```

### Trusts

A participant trusts another.

```
Example:
"An Organization trusts a Provider."

This means:
• The Organization relies on the Provider
• The Provider's work is accepted without review
• The trust can be revoked
• Trust is earned through consistent behavior
```

---

## Quantifiers

### All

Every participant without exception.

```
Example:
"All participants MUST have identity."

This means:
• No participant can exist without identity
• There are no exceptions
• This applies everywhere, always
```

### Some

A subset of participants.

```
Example:
"Some participants MAY have roles."

This means:
• Not every participant needs a role
• Roles are optional for some participants
• The subset is not fixed
```

### None

No participants without exception.

```
Example:
"No participant MAY bypass validation."

This means:
• Every participant must be validated
• There are no exceptions
• This applies everywhere, always
```

---

## Temporal Terms

### Always

In every case, without exception.

```
Example:
"Validation MUST always occur at boundaries."

This means:
• Every boundary must validate
• There are no exceptions
• This applies now and in the future
```

### Never

In no case, without exception.

```
Example:
"Code MUST NEVER use `any`."

This means:
• No code can use `any`
• There are no exceptions
• This applies now and in the future
```

### May

At the discretion of the participant.

```
Example:
"Frameworks MAY use event-driven architecture."

This means:
• The choice is optional
• No approval needed
• But choose consciously
```

### Should

Expected behavior, with documented exceptions.

```
Example:
"Decisions SHOULD be recorded before implementation."

This means:
• Record by default
• If you skip, document why
• The exception must be approved
```

---

## Usage Guidelines

### When Writing Code

- Use MUST for absolute requirements (validation, security, types)
- Use SHOULD for strong recommendations (documentation, testing)
- Use MAY for optional patterns (architecture choices)
- Use NEVER for prohibitions (`any`, raw SQL, hardcoded secrets)

### When Writing Documentation

- Use domain terms precisely (see Domain Terms section)
- Don't redefine terms
- Don't use synonyms interchangeably
- Reference this glossary when in doubt

### When Making Decisions

- Record WHY, not just WHAT
- Include alternatives considered
- Explain rejections
- Produce knowledge that improves the system

---

## Structural Requirements

### Five Questions

Every concept in Vestara — every framework, every system, every participant — must answer five questions:

```
What am I?
Why do I exist?
Who owns me?
What do I depend on?
What do I produce?
```

These questions are not optional. They are the minimum viable documentation for any concept that claims a place in the architecture.

If a concept cannot answer all five questions, it does not yet earn its place.

### The Promise

> **From this point forward, every new concept must eliminate complexity somewhere else.**

If a new layer, framework, rule, or document doesn't simplify the overall system, it probably doesn't belong.

This constraint protects the architecture from growing in the wrong direction. The challenge isn't making Vestara bigger. It's keeping it elegant while it grows.

### Engineering Law

> **Every layer exists to serve the layer above it and inform the layer below it.**

No layer exists for itself. Authority flows downward. Feedback flows upward. Every layer has exactly one responsibility.

- Frameworks serve Standards.
- Applications serve Frameworks.
- Observation informs Experience.
- Experience informs Reflection.
- Reflection informs Knowledge.
- Knowledge informs Decisions.
- Decisions improve Standards.
