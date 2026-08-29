# ORB-VE-001 — Director Observation Protocol

Operating instrument for the human Director during the ORB-VE-001 autonomous
benchmark run. This is an observer instrument, not a design document and not an
Activity Room feature. It must not modify Activity Room, the benchmark spec, or
any runtime state during the run.

## Method

Use the room naturally. Do **not** hunt for specific UI elements ("there should
be a Planner card here"). Let the room show what it shows.

Keep the five questions in mind while observing:

- What is happening?
- Who is responsible?
- Why?
- What changed?
- What remains unresolved?
- Does the organization need me?

## The Director observation log

Keep a tiny time-stamped log during the run. Every line is either an
*understandable* moment or a *gap*.

```
14:08 — I understand why Developer started.
14:14 — Test failure visible, but unclear whether anyone owns it.
14:17 — Responsibility transfer became apparent.
14:25 — GitHub commit happened; Activity Room did/didn't explain its meaning.
14:31 — I felt the need to leave Activity Room to understand the organization.
```

### Gold category — "I wish Activity Room could tell me this"

Every time you think this, record it verbatim, plus context:

- What did you want to know?
- Where in the flow did the gap appear?
- What would have been sufficient to answer it?

### Observability gap signal

Every time you *leave Activity Room* (terminal, GitHub, agent logs, manual
questions) to understand the organization, that is a potential observability
gap. Record the trigger.

## Watch-list (from recorded findings — not manufactured for the benchmark)

- **Responsibility exists but progress does not.** Can Vestara recognize a
  `STALLED` condition, or does the room keep saying `IN PROGRESS`?
- **Two distinct event meanings:** "Developer is working because Developer has
  responsibility" vs "GitHub rejected an operation because organizational
  authority wasn't satisfied." Does the room make them distinguishable?
- **GitHub commits becoming organizational events** — or remaining silent Git
  noise.
- **Technical failure vs organizational deadlock vs normal long-running work.**
  Do they look different, or all like the same spinning indicator?
- **Reopening / verification / responsibility-transfer transitions** — visible
  and attributed, or not?
- **"Does the organization need me?"** — when the Director is required, is that
  clear?

## Rules

- **Absence is evidence.** Do not fix gaps during ORB. Record them.
- Do not restart, redirect, or rescue agents mid-run (per the frozen contract:
  no helping mid-run; only safety/integrity interventions).
- Do not modify Activity Room, the benchmark, or runtime state.

## End-of-run verdict

After the run, answer:

> Did we need terminal logs, private agent reasoning, GitHub inspection, or
> manual questions to understand what happened?

If the answer is **no**, the Activity Room hypothesis survived a stronger test.
If **yes**, each instance is a recorded, evidenced gap — a stronger basis for
design than imagination.
