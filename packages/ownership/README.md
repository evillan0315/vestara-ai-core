# @vestara/ownership

Resource ownership and locking — write access control with timeout and deadlock prevention (ADR-027).

## Usage

Import via workspace reference:

```
pnpm --filter @vestara/ownership build
```

## API

- `OwnershipRegistry` — who owns which resource: `claim`, `ownerOf`, `isOwner`, `release`, `list`.
- `ResourceLockManager` — keyed write locks with per-resource timeout expiry (deadlock prevention), holder-checked release, reentrant acquisition, and expired-lock sweeping.

See [docs/](../../docs/) for capability specifications and architecture.
