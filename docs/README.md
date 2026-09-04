---
title: Vestara Documentation
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-04
next-review: 2026-10-04
---

# Vestara Documentation

Use these guides to install Vestara, start its clients, and understand the
runtime and product capabilities.

## Start Here

- [Getting started](GETTING_STARTED.md): install, build, open a repository, and
  run the CLI, API, and Workspace UI.
- [Configuration guide](CONFIGURATION.md): configure API ports, repository
  selection, browser deployment, and remote desktop connections.
- [Workspace desktop guide](../apps/workspace/docs/DESKTOP.md): run and package
  the Tauri desktop client, configure a remote API, and troubleshoot connection
  issues.
- [CLI reference](CLI.md): find the complete command and workflow reference.

## User Workflows

- [Visual regression setup](../apps/workspace/tests/visual/docs/SETUP.md): run,
  compare, and update Workspace UI screenshots.
- [Capability registry](CAPABILITY-REGISTRY.md): browse the available product
  capabilities and their specifications.
- [Changelog](CHANGELOG.md): review released and in-progress changes.

## Engineering Reference

- [Generated package API reference](api/index.html): browse the TypeDoc
  reference and [package catalog](api/PACKAGE_CATALOG.md). Regenerate with
  `pnpm generate-docs`.
- [AI-OS architecture](AI-OS-ARCHITECTURE.md)
- [Architecture traceability](ARCHITECTURE_TRACEABILITY.md)
- [Implementation status](IMPLEMENTATION_STATUS.md)
- [Milestones](MILESTONES.md)
- [Documentation automation](DOCUMENTATION-AUTOMATION.md)
- Generated API reference: run `pnpm generate-docs` to build TypeDoc API
  documentation for the current package sources under `docs/api/`.

Generated reports are written under `docs/generated/` when documentation
automation commands run. They are local reports and are not part of the source
documentation set.
