# Changelog
## Vestara AI Core — Implementation Progress

---

## [0.0.0] — Pre-Development

### Added
- Repository initialized
- Project structure created
- Architecture traceability documents established
- Milestones defined through v1.0

### Architecture Frozen (ADR-016)
- Vestara Architecture v1.0 declared complete
- Engineering Phase begins
- All 5 repositories: Blueprint, Specifications, Foundation, Runtime, AI Core
- Golden Path defined: Boot → Chat → Read File → Persist → Restart → Resume

---

## [3.8.0] — 2026-07-30 — Development Lifecycle & Governance

### Added
- **Epistemic Principles** — four-layer model (Behavior, Knowledge, Confidence, Governance), three categories of truth, derivation principle, epistemic governance — codified in AIDL v1.3.0
- **Daily Operational Lifecycle** — 5-agent workflow (Context → Planner → Engineer → Reviewer → Verifier) with `/init`, `/morning`, `/work`, `/review`, `/verify`, `/evening` commands
- **Engineering Knowledge System (EKS)** — organizational memory with structured entries, promotion gate, knowledge maturity lifecycle (Hypothesis → Observation → Emerging Pattern → Verified Practice → Engineering Principle), and derived confidence model
- **5 specialized agents** in `.opencode/agents/` with strict role boundaries:
  - `vestara-context` — read-only discovery
  - `vestara-planner` — analyze, prioritize, recommend (never implements)
  - `vestara-engineer` — implement approved tasks (never invents scope)
  - `vestara-reviewer` — inspect, report (never modifies)
  - `vestara-verifier` — prove via evidence (never interprets)
- **Lifecycle skill** at `.opencode/skills/vestara-lifecycle/SKILL.md`
- **Foundation document** at `docs/foundation/02-development-lifecycle.md`
- **EKS runtime** seeded with first entry: `workspace-rewrite-incremental-migration.md`

### Changed
- `vestara-blueprint/00-governance/03-ai-development-lifecycle.md` — expanded from 395 to 840+ lines with daily lifecycle, EKS, confidence model, and epistemic principles (v1.0.0 → v1.3.0)
- `opencode.json` — added `context`, `engineer`, `verifier` profiles; updated `planner` and `reviewer` with strict tool restrictions; added lifecycle prompt to instructions
- `AGENTS.md` — documented 5 agents, lifecycle skill, and participant permission matrix
- Removed old single-purpose agents (`vestara-build`, `vestara-plan`, `vestara-review`, `plan`, `ollama_dev`)

### Philosophy
- "Agents don't perform work. They participate in a software development lifecycle."
- "The organization learns, not the individual."
- "Prefer deriving information over storing duplicate state."
