# @vestara/marketplace

Catalog, discovery, search, resolution, update projections, and install orchestration for the
Vestara Marketplace (Engineering Exchange).

The package owns catalog and discovery concerns, not installation mechanics. Installation,
activation, rollback, and uninstall are delegated to `@vestara/extension-runtime`
(`LocalExtensionManager`), which remains the authority for integrity verification,
permissions, and Engineering Graph recording.

See [docs/marketplace/MARKETPLACE-PLAN.md](../../docs/marketplace/MARKETPLACE-PLAN.md) for the
grounded implementation plan.

## Usage

Import via workspace reference:

```
pnpm --filter @vestara/marketplace build
```

## Dependencies

`@vestara/extension-contracts` `@vestara/extension-runtime`

See [docs/](../../docs/) for capability specifications and architecture.
