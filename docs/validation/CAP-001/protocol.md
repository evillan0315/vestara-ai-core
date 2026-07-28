# CAP-001 Observation Protocol

## Principle

Observe behavior. Capture evidence. Diagnose the gap. Change one source. No improvements are made during the session. The developer is not guided toward the "correct" usage pattern.

---

## Phase 1 — Arrival

```yaml
initial_uncertainty:
  confidence_before:
  first_questions:
    - What do I need to understand?
    - What would prevent me from making a safe change?
    - What information do I need before touching code?
```

---

## Phase 2 — First Contact

```yaml
first_interaction:
first_understood_concept:
first_confusion:
```

---

## Phase 3 — Understanding Transfer

```yaml
before:
  mental_model:
    architecture:
    risks:
    priorities:

after:
  mental_model:
    architecture:
    risks:
    priorities:
    next_action:
```

---

## Phase 4 — Decision Test

Scenario: "You need to make your first change in this workspace. Where would you start and why?"

```yaml
decision:
  action:
  reason:
  evidence_used:
  confidence:
```

---

## Phase 5 — Trust Evaluation

```yaml
trust_score:
  score:
  why_trust:
  why_hesitate:
  what_to_verify:
```

---

## Finding Categories

| Category | Signal | Owner |
|----------|--------|-------|
| Reality gap | "The framework detection was wrong." | UnderstandingProducer |
| Meaning gap | "I know this exists, but not why it matters." | Understanding model |
| Presentation gap | "The information was there, but I did not know where to look." | Experience layer |
| Context gap | "I understand the code, but not the decisions behind it." | Memory / History |
| Goal gap | "I understand the workspace, but not the best next step." | Intent |

---

## Outcome

After each session, produce one sentence:

> "The largest remaining cognitive gap is ______ because the evidence shows ______."
