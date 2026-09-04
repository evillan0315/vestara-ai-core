---
title: "CAP-001 Validation: Workspace Orientation"
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# CAP-001 Validation: Workspace Orientation

## Experiment

> Can Vestara shorten the path from "I opened this repository" to "I know what I should do next"?

## Method

1. Developer opens an unfamiliar workspace without Vestara — measure baseline
2. Developer opens the same workspace with Vestara orientation — measure delta
3. Compare confidence, time, and decision quality

## Success Criteria

- ≥ 50% reduction in orientation time
- ≥ +2 confidence improvement
- Zero critical trust failures

## Reports

Each validation run produces a markdown report in this directory:

- `run-001.md`
- `run-002.md`
- `findings.md` (aggregated patterns after multiple runs)
