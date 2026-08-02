# @vestara/external-runtime

## Overview

External coding-agent runtime observability — generic adapter protocol, registry, redaction, correlation, and runtime intelligence capture.

Provides the integration layer for external AI coding agents (OpenCode, Claude Code, OpenAI Codex). The core never imports adapter-specific details; adapters implement the generic protocol and are registered by the wiring layer.

## Responsibilities

- Adapter Protocol — Generic interface for external runtime adapters
- Registry — Discover and manage external runtime instances
- Redaction — Centralized credential and sensitive data redaction
- Correlation — Map external events to internal engineering events
- Intelligence — Capture runtime intelligence (tools, permissions, modes)

## Public API

```typescript
// Adapter protocol
export type { ExternalAgentRuntimeAdapter, ExternalRuntimeIntelligenceAdapter };

// Registry
export { ExternalRuntimeRegistry };

// Redaction
export { redact, redactCredential, redactEnvironment, redactValue, wasRedacted };

// Correlation
export { buildCorrelation, isConfirmed, mergeCorrelations, methodConfidence };
```

## Usage

```typescript
import { ExternalRuntimeRegistry } from '@vestara/external-runtime';

const registry = new ExternalRuntimeRegistry();
// Register an adapter, discover runtimes, capture intelligence
```
