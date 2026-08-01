# @vestara/boot-runtime

Durable, strictly ordered boot-stage coordination for Vestara OS-0. State is
atomically persisted so boot evidence survives API or machine restarts.

## Lifecycle

```text
firmware-complete -> host-started -> storage-mounted -> identity-loaded
  -> services-started -> runtime-composed -> health-verified
  -> workspace-ready
```

Skipped and backward transitions are rejected. Recovery and failure preserve
the transition history and failure reason.

## Verification

```bash
pnpm --filter @vestara/boot-runtime build
pnpm --filter @vestara/boot-runtime test
```

See [`docs/foundation/12-os-0-host-integration.md`](../../docs/foundation/12-os-0-host-integration.md).
