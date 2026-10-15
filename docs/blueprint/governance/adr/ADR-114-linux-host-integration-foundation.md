---
id: "adr-114"
adr: "ADR-114"
title: "Linux Host Integration Foundation Before Bootable Distribution"
category: "operating-system"
version: 1.0
date: "2026-08-01"
status: "accepted"
author: "@chief-architect"
deciders: ["@chief-architect"]
consulted: ["@platform-engineer", "@devops-engineer", "@security-engineer"]
informed: ["@team"]
tags: ["os-0", "linux", "host-runtime", "boot-runtime", "systemd"]
depends_on: ["adr-104", "adr-107", "adr-111"]
referenced_by:
  - type: "blueprint"
    target: "07-operating-system/os-0-host-integration.md"
  - type: "blueprint"
    target: "07-operating-system/README.md"
---

## Context

Vestara's engineering platform had a substantial user-space control plane but
no verified machine-plane boundary. Earlier OS material described an immutable,
portable distribution as though its bootloader, image, storage, update, and
recovery layers already existed. The implementation had none of those layers.

The first OS milestone must prove that Vestara can observe a Linux host, join
the kernel service graph, record durable boot progress, expose status through
shared clients, and run under systemd without making disk or power changes.

## Decision

OS-0 SHALL use the Linux kernel and systemd. Vestara SHALL remain the product
control plane and SHALL NOT attempt to implement a custom kernel.

Only Host Runtime and Boot Runtime graduate to first-class runtimes in OS-0:

- Host Runtime owns typed, read-only host observation and the policy boundary
  for future host mutation.
- Boot Runtime owns strictly ordered, durable Vestara boot-stage evidence and
  recovery state after Linux has started.

Storage, device, network, identity, service, update, and recovery concerns
remain services or adapters until they demonstrate independent lifecycle,
state, recovery, isolation, concurrency, and resource ownership under ADR-111.

Host power operations are deny-by-default. Configuration alone cannot enable
them: an individual authorization decision and runtime policy permission are
also required. OS-0 exposes no reboot or shutdown API or CLI command.

Systemd units are explicit deployment artifacts. They start the existing
kernel/API composition and verify workspace readiness; they do not create a
second Vestara lifecycle system. Installation remains an administrator action.

ISO generation, bootloader installation, initramfs construction, partitioning,
encryption provisioning, A/B updates, Secure Boot, and automatic recovery are
outside OS-0 and must not be represented as implemented.

## Consequences

- Vestara can run as a managed Linux host environment before image work begins.
- Boot progress is attributable, persisted atomically, and available to API,
  CLI, TUI, and future boot UI clients.
- Agents inspect the host through typed runtime data instead of discovery shell
  commands.
- The portable SSD and immutable image milestones now have a verified lower
  integration boundary to build upon.
- OS documentation must distinguish host integration from a bootable Vestara
  distribution.

## Implementation evidence

- Repository: `evillan0315/vestara-ai-core`
- Implementation reference: `579df3f`
- `packages/host-runtime`
- `packages/boot-runtime`
- `apps/api/src/routes/host.ts`
- `apps/cli/src/commands/host.ts`
- `os/systemd`
- `docs/foundation/12-os-0-host-integration.md`
