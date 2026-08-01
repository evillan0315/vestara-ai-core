# OS-0 Host Integration Foundation

Vestara OS-0 introduces the machine-plane boundary beneath the existing agent
and workspace control plane. It deliberately stops short of ISO generation,
disk mutation, bootloader management, and unattended installation.

## Ownership

`@vestara/host-runtime` owns typed, read-only observation of the Linux host:
platform identity, CPU and memory, block-device names, mounts, interfaces, and
systemd availability. Agents consume this data through runtime surfaces rather
than executing discovery commands directly.

Power operations are deny-by-default. Enabling configuration alone is
insufficient: an authorization callback and policy permission must also approve
each request. OS-0 does not expose power mutation through HTTP or CLI.

`@vestara/boot-runtime` owns the durable boot lifecycle:

```text
firmware-complete -> host-started -> storage-mounted -> identity-loaded
  -> services-started -> runtime-composed -> health-verified
  -> workspace-ready
```

Transitions are strictly ordered, timestamped, evented, and atomically
persisted. Failure or recovery preserves the preceding transition evidence.

## Composition

The API gateway supplies Host and Boot Runtime adapters to the kernel service
graph. The Host Runtime starts before the Boot Runtime. After kernel service
startup, the API advances boot evidence while it composes and verifies the
workspace. Both runtimes stop through the kernel's reverse dependency order.

Read-only API routes expose normalized state at `/api/host` and `/api/boot`.
The CLI prefers those shared runtime endpoints and uses local read-only
inspection only when the API is unavailable.

Systemd templates live under `os/systemd/`. They are deployment artifacts, not
a competing lifecycle implementation. The kernel remains the owner of Vestara
services after `vestara-api.service` starts.
