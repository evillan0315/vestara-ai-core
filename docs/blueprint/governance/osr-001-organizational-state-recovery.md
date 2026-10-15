---
id: "osr-001"
title: "OSR-001 — Organizational State Recovery Experiment (unplanned pre-ORB observation)"
volume: "00-governance"
book: "Book 1: Governance"
version: "0.1.0"
status: "accepted"
architecture-status: "proposed"
implementation-status: "proposed"
verification-status: "unverified"
implementation-repository: "evillan0315/vestara-ai-core"
implementation-ref: "pending"
tags: ["experiment", "organization", "recovery", "memory", "authority", "pre-orb"]
---

# OSR-001 — Organizational State Recovery

## Classification

**Unplanned pre-ORB experiment.** Not engineered, not a controlled benchmark —
an accidental observation that arose when the Developer role stalled and was
then resumed with only the last two conversations of context. Its unplanned
nature is what makes the observation valuable.

**Result: PASS — initial observational evidence.**

"Initial observational evidence" is deliberate: this is one occurrence, not a
repeated controlled benchmark. The hypothesis holds observationally; it is not
claimed as universal architecture.

## Hypothesis

> A participant whose prior execution context is interrupted can reconstruct
> sufficient organizational state from limited conversational context plus
> durable evidence to recover current state, authority boundaries, unresolved
> work, and the next justified action — without relying on persistent model
> memory.

## Observed sequence

```text
Developer execution
      ↓
STALL
      ↓
Prior reasoning/session continuity lost
      ↓
Only limited recent context supplied
      ↓
Developer recognizes recovery condition
      ↓
Consults durable organizational record
      ↓
Verifies commits / contract / findings / worktree
      ↓
Reconstructs:
  state
  authority
  prohibitions
  pending action
      ↓
Refuses unauthorized baseline construction
      ↓
Waits for Director authorization
```

## Evidence

- Developer explicitly identified the recovery criteria as **state recovery,
  boundary recovery, and next-action recovery**.
- Instead of trusting conversational recollection, Developer deliberately
  chose to **verify against durable state** — checking the repository rather
  than relying on the supplied context.
- Verified evidence: observation protocol commit `3f03188`; stall/liveness
  finding `e04e1c7`; GitHub governance finding `db45b4d`; clean
  `vestara-ai-core` worktree (0 uncommitted); frozen ORB-VE-001 contract at
  `3c61793`.
- Reconstructed both prohibitions and the pending action correctly, including
  the critical fact that baseline construction still required explicit
  Director authorization — the Reviewer recommending authorization was not
  treated as the Director granting it.

## Architectural findings

> **Organizational continuity must not depend on model continuity.**

Three things are distinct and must not be conflated:

```text
Model Memory
"What does this model/session remember?"

Conversation Memory
"What context was supplied?"

Organizational Memory
"What does Vestara durably know happened,
what remains true, who has authority,
and what remains unresolved?"
```

Organizational memory is the one that matters:

```text
Model memory ≠ Organizational memory

Organizational memory =
    durable facts
  + effective state
  + responsibility
  + authority
  + unresolved conditions
  + provenance
```

> **Recovery is not complete when an agent remembers what to do. Recovery is
> complete when it also remembers what it is not authorized to do.**

A system that recovers "I need to construct the baseline" but forgets "I need
Director authorization before constructing it" has not actually recovered
organizational state. Memory of tasks without memory of authority is
dangerous.

## Evaluation dimensions (OSR eventually evaluates four)

```text
State Recovery
What has already happened?

Responsibility Recovery
What remains unresolved and who owns it?

Authority Recovery
What may and may not be done?

Continuation Recovery
What is the next justified action?
```

## Future work — recorded only, do not run

**OSR-002 (planned, not authorized):** deliberately terminate Developer
mid-work, start a completely fresh Developer/model context with minimal
bootstrap information, and observe whether it reconstructs the organization
solely from Vestara's durable state. Eventually, swap the underlying model:

```text
DeepSeek Developer
      ↓
execution disappears
      ↓
durable organizational state
      ↓
different model / fresh Developer
      ↓
state reconstructed
      ↓
work continues correctly
```

If that succeeds someday, it demonstrates:

> The identity and continuity of a Vestara role belong to the organization,
> not to the model instance currently occupying that role.

Recorded as future work only. **Do not implement anything for OSR-002 now.**
This document does not change the frozen ORB-VE-001 contract; it is a
separate pre-ORB finding/experiment.
