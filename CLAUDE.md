# Vestara — Claude Instructions

Load in order:

1. `AGENTS.md` — single source for setup, boundaries, guardrails, execution governance.
2. `docs/governance/UI-UX-GOVERNANCE.md` — **ENFORCED UI/UX governance for all agents (including Claude)** — strict, violation = BLOCKER.
3. `.opencode/skills/vestara-ui-ux/SKILL.md` — UI checklist (load on any UI task).

Repo is `vestara-ai-core`, pnpm workspaces (`pnpm-workspace.yaml` is authority), Node 22+, `bash build-order.sh` before test, `pnpm lint:check && pnpm build && pnpm test`.

UI rules (summary): tokens mandatory (`packages/ui-tokens/src/tokens.ts` → `var(--vestara-*)`), no hardcode, Tailwind v4 governed via `vestara-*`, MUI v9 optional (verify via webfetch), mock server :3002 → else local fixtures. Full spec in `docs/governance/UI-UX-GOVERNANCE.md`.

*This file mirrors `INSTRUCTIONS.md` + `AGENTS.md` for Claude runtime.*
