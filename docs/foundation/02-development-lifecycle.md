# Development Lifecycle

> Agents don't perform work. They participate in a software development lifecycle.

## Philosophy

The Vestara development lifecycle treats AI agents as specialized participants in a software engineering organization, not as isolated code generators. Each agent has a single, well-defined responsibility. No agent crosses role boundaries.

## The Lifecycle

```
Morning Briefing ──► Context Discovery ──► Planning ──► Human Approval ──► Engineering ──► Review ──► Verification ──► Evening Summary
```

## Participants

| Agent | Role | Responsibility |
|-------|------|----------------|
| Context | Discover | Answer: "What world am I entering?" |
| Planner | Recommend | Answer: "What should happen next?" |
| Engineer | Implement | Execute approved work, nothing else |
| Reviewer | Inspect | Find regressions, complexity, violations |
| Verifier | Prove | Produce evidence via builds, tests, lint |

## Rules

1. A participant in one role may not act in another during the same session
2. No agent may approve its own output
3. Human approval gates the transition from planning to implementation
4. Every change must produce evidence before merging

## Commands

| Command | Workflow |
|---------|----------|
| `/init` | Full repository onboarding (Context) |
| `/morning` | Daily briefing (Context → Planner → human) |
| `/work` | Execute approved task (Engineer) |
| `/review` | Inspect implementation (Reviewer) |
| `/verify` | Prove correctness (Verifier) |
| `/evening` | Capture engineering memory (Context + Planner) |

## Engineering Memory

Every session ends with knowledge capture to `.vestara/engineering-memory/`. This ensures that lessons learned, architecture decisions, and patterns discovered persist beyond the current session.
