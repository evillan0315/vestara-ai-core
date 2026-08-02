# @vestara/providers

## Overview

Provider implementations for external AI coding agents.

Each sub-directory contains an adapter for a specific external runtime (e.g., OpenCode). Adapters implement the generic protocol defined in `@vestara/external-runtime`.

## Responsibilities

- Implement adapter protocol for external runtimes
- Register with `@vestara/external-runtime` registry
- Provide runtime-specific tool and permission mappings

## Structure

```
providers/
  opencode/    # OpenCode adapter
```

## Usage

Provider adapters are registered through `@vestara/external-runtime` and are not imported directly.
