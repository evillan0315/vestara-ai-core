---
id: "nla-001"
title: "NLA-001 — Natural-Language Authority Interpretation (initial observation)"
volume: "00-governance"
book: "Book 1: Governance"
version: "0.1.0"
status: "accepted"
architecture-status: "proposed"
implementation-status: "proposed"
verification-status: "unverified"
implementation-repository: "evillan0315/vestara-ai-core"
implementation-ref: "pending"
tags: ["experiment", "organization", "authority", "communication", "observation", "pre-orb", "both-protocol"]
---

# NLA-001 — Natural-Language Authority Interpretation

## Classification

**Initial observational evidence only.** An unplanned observation from ORB-VE-001
execution. Not a controlled benchmark, not part of ORB-VE-001 scoring, and not
a modification to the frozen ORB-VE-001 contract.

## What happened

During ORB-VE-001, while an explicit authorization decision remained pending
(organization-level activation), the Director introduced additional
conversational context containing humor, hypothetical actions, ambiguity, and
the phrase **"Both."**

The Developer:

- recognized the "Both" utterance as conversational/humorous rather than
  operative authorization;
- preserved the existing authority state (no authorization changed);
- performed no unauthorized action;
- correctly identified that the pending organization-level activation decision
  remained unresolved;
- preserved the additional conversation as provenance rather than pretending
  the product intent remained the only input received.

## Observed principle

> **Human utterance ≠ intent ≠ decision ≠ authorization.**

The transitions between these cannot safely be collapsed:

```text
UTTERANCE
What the human said
      ↓
INTERPRETATION
What it appears to mean
      ↓
INTENT
What outcome the human appears to want
      ↓
DECISION
What the human has decided
      ↓
AUTHORIZATION
What organizational action is permitted
```

An authority-bearing human's utterance is **not automatically** an
authorization. Authority-bearing humans joke, speculate, think aloud, use
sarcasm, change their minds, discuss hypothetical actions, and say "go ahead"
without meaning it. A trustworthy organization must interpret that
communication **and become conservative when interpretation affects
consequential authority**.

## Second finding: organizational state survived conversational noise

Developer consumed additional conversational exchanges and still reconstructed
exactly where the organization had stopped — intent recorded, organization
launched but idle, no activations, no conditions, authority unchanged, pending
decision identified. Responsibility state was not lost because the conversation
moved elsewhere.

Complementary to OSR-001:

```text
OSR-001
Execution/context discontinuity
        ↓
Can organizational state be recovered?
        (recovery after interruption)


NLA-001 (second finding)
Conversational expansion/noise
        ↓
Can organizational state remain stable?
        (state integrity during ongoing human interaction)
```

## Third embedded finding: interesting ≠ authorized ≠ current scope

The Developer recognized a potentially valuable future experiment (authority
interpretation under natural human communication) and correctly declined to
build it now:

> "The Both Protocol deserves its day — but its day is a designed adversarial
> benchmark, not this frozen run."

`interesting ≠ authorized ≠ current scope`.

## Future work — recorded only, do not run/build now

Design an adversarial authority-interpretation benchmark testing humor,
ambiguity, conversational references, contradictory statements, revocation,
indirect approval, and consequential actions. Working title: **The Both
Protocol.** Not implemented in any currently authorized scope.
