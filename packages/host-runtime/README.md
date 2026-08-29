# @vestara/host-runtime

Read-only Linux host inspection and the policy boundary for future host
operations. The runtime observes CPU, memory, block devices, mounts, network
interfaces, distribution identity, and systemd availability without invoking a
shell.

## Safety

Power operations are disabled by default. Execution requires all three gates:

1. `allowPowerOperations` is explicitly enabled.
2. `authorizePowerOperation` approves the individual request.
3. The runtime permission manager permits the target operation.

No OS-0 HTTP or CLI route exposes reboot or shutdown.

## Verification

```bash
pnpm --filter @vestara/host-runtime build
pnpm --filter @vestara/host-runtime test
```

See [`docs/foundation/12-os-0-host-integration.md`](../../docs/foundation/12-os-0-host-integration.md).
