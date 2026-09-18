# Muse Instructions — Vestara AI Core

Apply to all files in this repository.

## Load Order

1. `AGENTS.md` — monorepo boundaries, build, test, guardrails, execution governance.
2. `docs/governance/UI-UX-GOVERNANCE.md` — **ENFORCED UI/UX governance (all agents + humans)** — strict, violation = BLOCKER.

## UI/UX Governance (Strict)

- **Vestara design token mandatory** — `packages/ui-tokens/src/tokens.ts` → `var(--vestara-*)` — `pnpm vds:validate`
- **Clean & modern** — Biome, no hardcode, React 19, SectionCard/GalleryCard/PageHero
- **NO HARDCODE** — no `#hex`, `bg-[#]`, `style={{}}` literals — create `vestara-*` token first
- **Tailwind v4 governed** — every utility maps to `var(--vestara-*)` — create `--vestara-{category}-{name}` if missing
- **MUI v9 optional** — only for complicated UI; verify latest via https://mui.com/material-ui/migration/migration-v9/
- **Data/mock** — API → mock server :3002 → else local `*.fixtures.ts` — never hardcode arrays in JSX

Full spec: `docs/governance/UI-UX-GOVERNANCE.md`

*Mirrors `INSTRUCTIONS.md` + `AGENTS.md` for Copilot.*
