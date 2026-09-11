---
title: "GA-PROVIDER-001 — Provider & Model Configuration Convergence"
version: 1.0.0
status: active
owner: vestara
recorded: 2026-09-11
last-reviewed: 2026-09-11
---

# GA-PROVIDER-001 — Provider & Model Configuration Convergence

**Goal:** Make provider/model configuration simple, fast, and usable in Vestara by consuming OpenCode's effective provider/model state while keeping provider/model selection directly available in Global/Floating Assistant.

**Status:** ACTIVE — Phase 0 (Audit) COMPLETE. Phase 1 begins.

---

## Phase 0 — Audit Results

### OpenCode HTTP endpoints consumed

| Endpoint | Vestara consumer | Returns |
|----------|-----------------|---------|
| `GET /provider` | `OpenCodeHttpClient.listProviders()` | Provider IDs, names, sources, model IDs (as map keys) |
| `GET /global/health` | `OpenCodeHttpClient.getHealth()` | Health status, version |

### What OpenCode exposes vs. what Vestara manages

| Attribute | OpenCode authority? | Vestara authority? |
|-----------|--------------------|--------------------|
| Provider ID / name | ✅ Source of truth | Normalized copy |
| Model IDs per provider | ✅ Source of truth | Normalized copy |
| Provider source (opencode, opencode-go, etc.) | ✅ Source of truth | Normalized copy |
| Connected/authenticated state | ❌ Not exposed | ✅ `provider-credentials.json` |
| Enabled/disabled models | ❌ Not exposed | ✅ `ModelConfig.enabled` in workspace.json |
| Default model | ❌ Not exposed | ✅ Multiple fallback layers |
| Model metadata (context window, capabilities, pricing) | ❌ Not in GET /provider | ✅ Hardcoded defaults in `runtimeProviderConfigs()` |
| Provider credentials (API keys) | ❌ Not stored by OpenCode | ✅ `provider-credentials.json` (chmod 0o600) |

### Authority boundary

```text
OpenCode Runtime
  │
  │ GET /provider → { id, name, source, models: { "model-id": {...} } }
  │ (providers, model IDs, source — that's all)
  │
  ▼
Vestara OpenCode Adapter
  │
  │ normalizeProviders() → OpenCodeProviderSummary[]
  │ runtimeProviderConfigs() → ProviderConfig[] (with hardcoded model defaults)
  │
  ├──────────────► ProviderConfig persistence (workspace.json)
  │                Model enablement (Vestara-managed)
  │                Credentials (Vestara-managed)
  │
  ├──────────────► Settings (Vestara UI)
  │                CONFIGURE
  │
  └──────────────► Global Assistant (Vestara UI)
                   SELECT
                        │
                        ▼
                     AssistantBindingResolver
                     (validates against OpenCode runtime)
                        │
                        ▼
                     EXECUTE
```

### Classification of current Vestara code

| Component | Classification | Rationale |
|-----------|---------------|-----------|
| `OpenCodeHttpClient.listProviders()` | **KEEP** | Correctly consumes `GET /provider` |
| `normalizeProviders()` | **ADAPT** | Discards model metadata; may need extension |
| `runtimeProviderConfigs()` | **ADAPT** | Hardcoded model defaults need replacement with effective state |
| `publicProvider()` | **KEEP** | Correctly adds Vestara-managed signals (builtIn, credential, status) |
| `ProviderManager` | **KEEP** | Canonical runtime provider registry |
| `AssistantBindingResolver` | **KEEP** | Server-authoritative validation of browser selection |
| `useProviderSettings` | **KEEP** | Browser-side selection (request only, not authority) |
| `ProviderModelSelector` | **ADAPT** | Will consume effective working set instead of broad catalog |
| `rankProviders()` (PERF-001A) | **DEPRECATE** | Arbitrary ranking replaced by effective state |
| `buildInitialSet()` (PERF-001A) | **ADAPT** | Bounded transport infrastructure kept; ranking logic replaced |
| `searchModels()` (PERF-001A) | **KEEP** | Global search limit remains useful |
| Provider credential storage | **KEEP** | Vestara legitimately owns this |
| Routing store | **KEEP** | Role-level provider/model mapping |

### Key architectural decisions

1. **OpenCode is NOT the universal provider authority** — it is authoritative only for OpenCode-specific provider/model availability
2. **Vestara owns credentials** — AI provider API keys are never sent to the OpenCode headless server
3. **Vestara owns model enablement** — OpenCode does not expose enabled/disabled state
4. **The "effective working set"** = OpenCode's provider/model list ∩ Vestara's credential/configured state
5. **PERF-001A bounded transport infrastructure is preserved** — only the ranking logic is replaced

### Gate: Authority boundary confirmed

No material architectural conflicts discovered. The proposed ownership model aligns with existing code. Phase 1 may proceed.

---

## Frozen Ownership Model

```text
OpenCode Runtime
     │
     │ provider/model runtime state
     ▼
Vestara OpenCode Adapter
     │
     ├──────────────► Settings
     │                CONFIGURE
     │
     └──────────────► Global Assistant
                      SELECT
                           │
                           ▼
                        EXECUTE
```

### Invariants

| Invariant | Meaning |
|-----------|---------|
| CATALOG ≠ CONFIGURED | All available providers ≠ user-configured providers |
| CONFIGURED ≠ ENABLED | User-configured ≠ turned on |
| ENABLED ≠ SELECTED | Turned on ≠ currently chosen for execution |
| SETTINGS CONFIGURES | Settings is the configuration surface |
| ASSISTANT SELECTS | Assistant is the selection surface |
| RUNTIME EXECUTES | Runtime is the execution authority |

OpenCode is authoritative for OpenCode-specific provider/model availability and configuration. Do not make OpenCode the universal provider authority for Vestara.

---

## Phase 0 — Ownership & API Audit

**Gate:** Establish exact authority and API paths before mutation.

### Audit scope

Inspect:

- Existing Vestara provider/model contracts
- ProviderManager / provider runtime
- Routing contracts
- Global Assistant provider/model selection
- PERF-001A implementation
- OpenCode adapter / client
- OpenCode provider/model endpoints already consumed
- OpenCode connected-provider state
- OpenCode model enablement state
- Current provider credentials
- Vestara Configuration / SecretReference / credential infrastructure
- Agent/Workflow dependencies on provider/model contracts

### Determine exactly which OpenCode HTTP/SDK contracts provide

| Contract | OpenCode endpoint | Vestara consumption |
|----------|------------------|-------------------|
| Providers | `GET /provider` | `OpenCodeRuntime.listProviders()` |
| Connected providers | TBD | TBD |
| Configured providers | TBD | TBD |
| Models/provider | TBD | TBD |
| Enabled models | TBD | TBD |
| Disabled models | TBD | TBD |
| Default model | TBD | TBD |
| Provider connection | TBD | TBD |
| Provider authentication | TBD | TBD |
| Model configuration | TBD | TBD |

### Classify current Vestara code

| Classification | Meaning |
|---------------|---------|
| **KEEP** | Existing code is correct and authoritative |
| **ADAPT** | Existing code needs extension, not replacement |
| **DEPRECATE** | Existing code will be replaced by new authority |
| **REMOVE** | Existing code is no longer needed |
| **UNKNOWN** | Requires further investigation |

### Deliverable

Authority boundary document with exact API paths before any mutation.

---

## Phase 1 — Effective OpenCode Working Set

**First implementation phase.** Replace the Global Assistant's dependence on the broad OpenCode catalog with an effective provider/model projection.

### Requirements

Initially surface providers such as:

- OpenCode Zen
- OpenCode Go

where OpenCode reports them connected/configured. **Do not hardcode their availability.**

For each provider, expose only models that OpenCode considers appropriate for effective selection according to audited configuration.

### Example

```text
OpenCode Zen
├── MiMo V2.5 Free
├── Nemotron ...
└── ...

OpenCode Go
├── MiMo V2.5
└── ...
```

### Constraints

- Preserve PERF-001A bounded transport/caching infrastructure where still useful
- Remove unnecessary global-ranking complexity from the ordinary Assistant path
- Runtime Gate: STOP and demonstrate working before Phase 2

---

## Phase 2 — Settings: AI / Providers & Models

Add or adapt the appropriate Vestara Settings surface.

### Target UX

```text
Settings
└── AI
    └── Providers & Models

CONNECTED

OpenCode Zen
Connected
4 enabled models
                        Manage

OpenCode Go
Connected
2 enabled models
                        Manage

AVAILABLE PROVIDERS

OpenAI
                        Connect

Anthropic
                        Connect

Google
                        Connect

...
```

### Provider details

Selecting a provider exposes meaningful authoritative state:

```text
OpenCode Zen

Status       Connected
Models       4 enabled

Models
✓ MiMo V2.5 Free
✓ MiniMax M2.5
○ MiniMax M2.7
✓ MiniMax M3
```

Only expose enable/disable controls if the audited OpenCode API supports the mutation safely. Otherwise initially present read-only.

---

## Phase 3 — Provider Connection

Implement the provider connection workflow supported by the audited OpenCode API.

### Security requirements

Before implementing persistence, determine whether OpenCode itself should own these OpenCode provider credentials.

Reuse existing Vestara credential/secret infrastructure only where Vestara is legitimately the authority.

**Do NOT:**

- create plaintext provider-key files
- duplicate secrets unnecessarily
- return stored secrets through GET APIs
- expose keys to Activity Room
- include keys in logs
- include keys in telemetry
- persist keys in browser storage

The UI may submit a credential through an authorized configuration operation; it must not become credential storage.

---

## Phase 4 — Model Management

Bring OpenCode's effective model configuration into Vestara Settings.

### Target

```text
OpenCode Zen

Search models...

ENABLED

[✓] MiMo V2.5 Free
[✓] MiniMax M2.5
[✓] MiniMax M3

DISABLED

[ ] MiniMax M2.7
```

### Constraints

- The complete 7,602-model catalog must never be rendered simultaneously
- Preserve bounded transport, bounded DOM, server-side search, stale-request cancellation, caching
- PERF-001A machinery remains valuable here

---

## Phase 5 — Assistant Selector Convergence

Polish the Assistant execution-selection experience after Settings becomes authoritative.

### Target

```text
┌─────────────────────────────┐
│ Ask Vestara...              │
│                             │
├─────────────────────────────┤
│ ⋮  OpenCode Zen / MiMo  ↑   │
└─────────────────────────────┘
```

Opening it:

```text
PROVIDER
OpenCode Zen

MODEL
Search models...

✓ MiMo V2.5 Free
  Nemotron ...
  ...

─────────────────
Manage Providers & Models
```

### Constraints

- Searching searches the selected provider's effective usable models, not the global catalog
- "Manage Providers & Models" opens Settings
- Preserve selected provider/model continuity

---

## Phase 6 — Configuration → Execution Integration

Prove the complete vertical slice:

```text
Settings
   │
   │ configure provider
   │ enable model
   ▼
Effective OpenCode State
   │
   ▼
Vestara Projection
   │
   ▼
Global Assistant
   │
   │ select provider/model
   ▼
Execution
   │
   ▼
Result + provenance
```

### Invariants

- Execution provenance must retain the actual provider/model used
- Changing Settings must not silently rewrite an already-running execution

---

## Phase 7 — PERF-001A Cleanup

Only after the new vertical slice works, review PERF-001A implementation.

### Likely KEEP

- Bounded responses
- Bounded rendering
- AbortController
- Cache
- Selected-model continuity
- On-demand catalog search

### Likely candidates for simplification

- Global Assistant catalog ranking
- Arbitrary provider working-set ranking
- Alphabetical relevance behavior
- Global 50-model Assistant search

Actual decisions must follow source/runtime evidence.

---

## Phase 8 — Production Verification

Verify on the current low-resource Vestara dogfood machine.

### Acceptance requirements

- [ ] Settings reflects actual OpenCode state
- [ ] Connected providers correctly represented
- [ ] Enabled/disabled model state truthful
- [ ] Provider connection works where supported
- [ ] Credentials never exposed after submission
- [ ] Assistant only loads effective working set
- [ ] Provider selection is immediate
- [ ] Model selection is immediate
- [ ] Model search is smooth
- [ ] Selected model survives reopen
- [ ] Floating Assistant works
- [ ] Full Assistant works
- [ ] Execution uses selected provider/model
- [ ] Execution provenance records actual target
- [ ] No Agent/Workflow provider regression
- [ ] No large initial provider/model payload
- [ ] No large model DOM
- [ ] No Activity Room changes

Build and relevant tests must pass. Perform real browser verification.

---

## Scope exclusions

Do not touch:

- Activity Room convergence
- AR-GA-006/007/008
- RAG
- Conversation pagination
- Execution continuity
- Developer Console
- Terminal
- Service lifecycle
- Marketplace
- Workflow orchestration
- Unrelated Settings redesign

---

## Delivery strategy

Do not implement all eight phases and then show the Director.

Deliver visible runtime checkpoints:

| Phase | Gate |
|-------|------|
| Phase 0 | Authority boundary documented |
| Phase 1 | **SHOW IT WORKING** |
| Phase 2 | **SHOW SETTINGS** |
| Phase 3/4 | **SHOW CONFIGURATION** |
| Phase 5/6 | **SHOW COMPLETE FLOW** |
| Phase 7/8 | **CLEAN + FREEZE** |
