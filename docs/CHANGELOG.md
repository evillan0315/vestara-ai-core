# Changelog
## Vestara AI Core — Implementation Progress

---

## [3.9.1] — 2026-08-01 — Workspace Notification Queue Reliability

### Changed

- Workspace toasts now display one at a time through a bounded five-entry queue.
- Identical type/message notifications received within three seconds collapse into one toast with a repetition count.
- Waiting errors are prioritized without interrupting the currently visible toast.
- Each toast receives a full five-second display window; manual dismissal advances the queue.
- Vitest and Playwright collection boundaries are explicit: only the Playwright visual entrypoint is excluded from Vitest.

### Verification

- Added deterministic queue tests for duplicate collapse, window expiry, error priority, FIFO ordering, and queue limits.
- Declared `jsdom` and Testing Library as workspace test dependencies.
- Workspace Vitest suite and production build pass.

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

---

## [3.9.0] — 2026-07-31 — Agent Filesystem Capabilities & Multi-Agent Workflow Design

### Added
- **FilesystemRuntime hardening** (`packages/filesystem-runtime`) — path traversal + absolute-path containment, deny list (`.env`, `credentials.json`, …), `update` (patch-based), `stat`, `copy`, dry-run mode, bounded operation history with `onOperation` audit hook, structured `FsObservation` results
- **AgentCapabilityManager** (`packages/workspace`) — capability boundary between agents and the filesystem; 12 `filesystem.*` capabilities (`read`, `write`, `update`, `delete`, `create`, `rename`, `copy`, `list`, `stat`, `exists`, `search`, `references`) gated by `(resource, action)` permissions; mutations require a reason
- **AgentRuntime.executeCapability()** — permission-gated capability execution with observation feedback into session memory; developer agent parses LLM JSON operations or Claude-style `<invoke>` tool calls and executes them
- **Capability tools** — `filesystem.*` exposed as ActionRuntime tools via `createFilesystemCapabilityTools()`
- **API** — `POST /api/agents/:id/capabilities` route; `ImplementationService.apply()` routed through the capability manager
- **Specs** — `docs/PCS-024-agent-filesystem-capabilities.md`, `docs/PCS-025-multi-agent-project-management.md`
- **Repository distribution** — `vestara-blueprint`, `vestara-foundation`, `vestara-labs`, `vestara-reference`, `vestara-runtime`, `vestara-specifications` published as standalone public repos under `github.com/evillan0315`

### Changed
- `packages/workspace` now depends on `@vestara/filesystem-runtime`
- `AGENTS.md` — repo layout updated for published documentation repos

### Security
- Agents never touch the filesystem directly — all access flows through `AgentCapabilityManager` → `FilesystemRuntime`
- Delete and high-risk operations require explicit approval; workspace-root escape and deny-list paths are rejected
