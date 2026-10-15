<!-- GENERATED — do not hand-edit. Source: packages/workspace/src/agents.registry.ts — run pnpm agents:sync -->

# Vestara — Claude Instructions

Load in order:

1. `AGENTS.md` — canonical repo instructions (single source of truth).
2. `docs/governance/UI-UX-GOVERNANCE.md` — canonical repo instructions (single source of truth).

Repo is `vestara-ai-core`, pnpm workspaces (`pnpm-workspace.yaml` is authority), Node 22+, `bash build-order.sh` before test, `pnpm lint:check && pnpm build && pnpm test`.

UI rules (summary): tokens mandatory (`packages/ui-tokens/src/tokens.ts` → `var(--vestara-*)`), no hardcode, Tailwind v4 governed via `vestara-*`, MUI v9 optional (verify via webfetch), mock server :3002 → else local fixtures. Full spec in `docs/governance/UI-UX-GOVERNANCE.md`.

## Canonical agents (managed by `pnpm agents:sync`)

- `vestara-context` — Discover repository state before planning begins.
- `vestara-developer` — Implement approved tasks — never invent scope.
- `vestara-planner` — Analyze, prioritize, recommend — never write code.
- `vestara-reviewer` — Review implementations — never modify code.
- `vestara-verifier` — Prove correctness via evidence — never think, never review.
- `vestara-assistant` — Global conversational assistant for Workspace users.
- `vestara-browser` — Interact with web applications through a governed browser session — observe, navigate, click, type, and collect evidence.
