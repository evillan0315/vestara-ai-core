# Contributing to Vestara AI Core

## Getting Started

```bash
git clone <repo>
cd vestara-ai-core
pnpm install
bash build-order.sh
pnpm vestara doctor
```

## Development

- All code in `packages/*` and `apps/*`
- TypeScript, ES2022 target, `nodenext` module resolution
- Run `pnpm lint` before committing (Biome)
- Pre-commit hooks installed via `.githooks/pre-commit`

## Testing

```bash
pnpm test                 # run all tests
pnpm test -- --reporter verbose  # detailed output
pnpm benchmark            # pipeline timing benchmarks
```

## Documentation

```bash
pnpm ensure-docs          # fill missing README.md + descriptions
pnpm generate-docs        # generate API docs to docs/api/
```

## Milestones

See `docs/MILESTONES.md` for the current focus area.
