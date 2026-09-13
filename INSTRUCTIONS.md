# Vestara Instructions — All Runtimes

This file is the entry point for **every AI runtime** (OpenCode, Claude, Cursor, Copilot, Codex, Gemini). It delegates to the single sources of truth.

## Load Order (do not skip)

1. **`AGENTS.md`** — Monorepo boundaries, build, test, guardrails, execution governance, established principles. **MUST READ FIRST.**
2. **`docs/governance/UI-UX-GOVERNANCE.md`** — **ENFORCED for all UI/UX work** (all agents + humans). Violation = BLOCKER.
3. **`.opencode/skills/vestara-ui-ux/SKILL.md`** — Checklist to run on any UI task (trigger: `apps/workspace/**`, `packages/ui/**`, `packages/ui-tokens/**`).
4. **`opencode.json` → `instructions`** — Auto-loads the above into every OpenCode turn.
5. **`.opencode/agents/*.md`** — Generated from `packages/workspace/src/agents.registry.ts` (run `pnpm agents:sync` after editing registry). Each agent prompt already embeds the UI/UX governance footer.

## UI/UX Governance (Strict)

When adding/changing UI/UX, you **must**:

- **Vestara design token mandatory** — `packages/ui-tokens/src/tokens.ts` → `var(--vestara-*)` (`COLOR`, `SPACING`, `RADIUS`, `TYPOGRAPHY`, `ELEVATION`, `MOTION`, etc.) — validate via `pnpm vds:validate`.
- **Clean & modern** — Biome, no dead code/`console.log`/`TODO`, functional React 19, `SectionCard`/`GalleryCard`/`PageHero`.
- **NO HARDCODE** — no `#hex`, `bg-[#...]`, `style={{color:}}` literals, no arbitrary `text-[12px]` without token — create token via `vestara-*` pattern first.
- **Tailwind v4 governed** — every utility maps to `var(--vestara-*)`; if token missing, create `--vestara-{category}-{name}` in `packages/ui-tokens/src/tokens.ts` (category ∈ surface|text|border|accent|status|spacing|radius|elevation|motion|z-index|sizing|density|color).
- **MUI v9 optional** — only for complicated UI (grids/pickers/dialogs); verify latest via `ExternalScout`/`webfetch https://mui.com/material-ui/migration/migration-v9/` before use.
- **Data/mock** — API → check mock server `:3002` (`apps/workspace/src/mocks/server.ts`) → else local `*.fixtures.ts` (e.g., `overview.fixtures.ts`) — never hardcode arrays in JSX.

Full spec: `docs/governance/UI-UX-GOVERNANCE.md`

## Other Runtimes

- **Copilot:** See `.github/muse-instructions.md`
- **Claude:** See `CLAUDE.md`
- **Cursor:** See `.cursor/rules/vestara.mdc` (if present, mirrors this file)
- **OpenCode:** See `opencode.json` `instructions` + `.opencode/skills/vestara-ui-ux/SKILL.md`

*Last sync: 2026-09-13 — Manila — Director directive.*
