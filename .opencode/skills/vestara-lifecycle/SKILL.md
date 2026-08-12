# Vestara Development Lifecycle

A daily engineering workflow where agents participate in a software development lifecycle rather than performing isolated tasks.

## Philosophy

> Agents don't perform work. They participate in a software development lifecycle.

Each agent has a single responsibility. No agent crosses boundaries. The workflow is sequential and gated by human approval at key junctures.

## Workflow

```
Morning Briefing ──► Context Discovery ──► Planning ──► Human Approval ──► Engineering ──► Review ──► Verification ──► Evening Summary
```

## Commands

### `/init` — New Repository Onboarding
**Agent: Context**

Onboard onto a new repository for the first time.

1. Read AGENTS.md, README.md, all docs
2. Map project structure and package organization
3. Identify architecture patterns and conventions
4. Check build tooling and test framework
5. Identify entrypoints and key modules
6. Store findings as repository context

Output: Full repository map with architecture notes, conventions, and risk areas.

---

### `/morning` — Daily Engineering Briefing
**Agents: Context → Planner**

Start the day with a full context refresh and prioritized plan.

**Phase 1 — Context Agent:**
1. Read AGENTS.md, README.md, project docs
2. Scan project tree and architecture
3. Review recent commits (last 10)
4. Check branch and active work
5. Run build check (bash build-order.sh --dry-run or check dist/)
6. Scan for TODO/FIXME/HACK comments
7. Check for stale `.js`/`.d.ts` artifacts
8. Read active Engineering Knowledge entries from `.vestara/knowledge/`

Output: Context Report including relevant knowledge from past sessions

**Phase 2 — Planner Agent:**
1. Receive Context Report
2. Apply the Daily Engineering Planner framework (`vestara-ai-core/daily-engineering-planner-prompt.md`)
3. Generate prioritized task list across 8 categories
4. Recommend top 3 tasks for today
5. Identify one technical debt item, one UI/UX improvement, one AI improvement, one documentation improvement

Output: Prioritized Plan

**Phase 3 — Present to human for approval.**

---

### `/work` — Execute Approved Task
**Agent: Engineer**

1. Receive approved task from human
2. Re-read context docs if needed
3. Implement with minimal scope
4. Preserve existing conventions
5. Write tests
6. Remove stale artifacts
7. Report changes

The Engineer does not question scope, redesign architecture, or add features beyond the approved task.

---

### `/review` — Architecture & Quality Review
**Agent: Reviewer**

1. Receive Engineer's implementation report
2. Inspect all changed files
3. Evaluate against 6 dimensions: architecture, conventions, correctness, complexity, completeness, risk
4. Report issues with file:line references

The Reviewer does not modify files.

---

### `/verify` — Evidence Collection
**Agent: Verifier**

1. Receive implementation and review report
2. Run `bash build-order.sh` from `vestara-ai-core/`
3. Run `pnpm lint`
4. Run `pnpm format`
5. Run `pnpm test`
6. Check for stale `.js`/`.d.ts` alongside `.ts`
7. Check docs referenced in change exist

Output: Pass/fail evidence report. No interpretation, no commentary.

---

### `/evening` — Engineering Knowledge Capture
**Agent: Context + Planner**

End the session by capturing observations that may become permanent Engineering Knowledge.

**Phase 1 — Session Log (Context):**
1. Document what was accomplished this session
2. Record problems encountered and how they were solved
3. Note unfinished work and blockers
4. Save to `.vestara/sessions/YYYY-MM-DD.md`

**Phase 2 — Observations (Planner):**
1. Draft observations in `.vestara/knowledge/lessons/draft-YYYY-MM-DD.md`
2. Each observation must answer: *What happened? Why? What should we do next time?*
3. Do not promote to permanent knowledge — that requires human review

**Phase 3 — Metrics Update (Verifier):**
1. Update `.vestara/metrics/planner.json` with session counts
2. Update `.vestara/metrics/reviewer.json` with review results
3. Update `.vestara/metrics/verifier.json` with verification outcomes

## Agent Responsibilities

| Agent | Role | Can Edit? | Can Plan? | Can Decide Scope? |
|-------|------|-----------|-----------|-------------------|
| Context | Discover | No | No | No |
| Planner | Recommend | No | Yes | No |
| Engineer | Implement | Yes | No | No |
| Reviewer | Inspect | No | No | No |
| Verifier | Prove | No | No | No |
| Human | Approve | Yes | Yes | Yes |

## Daily Checklist

Every agent must run this checklist before accepting work:

```
□ Read AGENTS.md
□ Read project documentation
□ Understand architecture
□ Detect current milestone
□ Identify active branch
□ Review recent changes
□ Read Engineering Knowledge (.vestara/knowledge/)
□ Identify today's priorities
□ Check for unfinished work
□ Generate recommendations (if applicable)
□ Wait for approval
```

## Engineering Knowledge System (EKS)

See `vestara-blueprint/00-governance/03-ai-development-lifecycle.md` for the full EKS specification.

### Structure

```
.vestara/
  knowledge/
    architecture/     ← Permanent architectural decisions and patterns
    workflows/        ← Verified workflow improvements
    lessons/          ← Verified lessons learned
    decisions/        ← Engineering decisions (ADR-derived)
  sessions/           ← Daily session logs (90-day retention)
  metrics/            ← Objective agent performance data
```

### Knowledge Promotion

Observations from `/evening` are drafts. They become permanent only after human review:

```
Session Log → Draft Observation → Human Review → Approved → Permanent Knowledge
```
