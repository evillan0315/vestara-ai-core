---
title: "VES-TG-001 — Telegram Interaction Platform"
version: 1.0.0
status: proposed
owner: vestara
created: 2026-09-09
last-reviewed: 2026-09-09
next-review: 2026-10-09
program: VES-TG
---

# VES-TG-001 — Telegram Interaction Platform

> **Telegram is a channel into Vestara. It is not a second Global Assistant, second Activity Room, or second execution system.**

---

## Executive Summary

Telegram should be treated as a **Vestara interaction channel**, not as another AI/runtime integration. Telegram should never own conversations, agents, executions, permissions, or workflow state—it transports human input into Vestara and projects selected Vestara output back to the user.

This lets the same architecture later support Discord, Slack, Messenger, mobile push, CLI, or other channels without rebuilding orchestration.

---

## Architecture

```text
Telegram
   │
   │ Telegram Bot API / Webhook
   ▼
Telegram Adapter
   │
   ▼
Channel Gateway
   │
   ▼
Identity + Workspace Resolution
   │
   ▼
Conversation / Intent / Command Layer
   │
   ├──────────────► Global Assistant
   │                    │
   │                    ▼
   │                 Execution
   │                    │
   │                    ▼
   │              Runtime Binding
   │                    │
   │                    ▼
   │              Runtime Adapter
   │
   └──────────────► Activity Room queries/actions

Vestara canonical events
   │
   ├────────► Global Assistant
   ├────────► Activity Room
   ├────────► Floating Assistant
   └────────► Telegram Projection
```

### Central Invariant

> **Telegram is a channel into Vestara. It is not a second Global Assistant, second Activity Room, or second execution system.**

---

## Package Architecture

```text
packages/
├── channel-types/
│   └── @vestara/channel-types
│
├── channel-runtime/
│   └── @vestara/channel-runtime
│
└── telegram-integration/
    └── @vestara/telegram-integration
```

### Dependency Direction

```text
@vestara/channel-types
          │
          ▼
@vestara/channel-runtime
          │
          ▼
@vestara/telegram-integration
```

Telegram-specific concepts must not leak upward.

### Canonical Channel Concepts

```ts
ChannelMessage
ChannelIdentity
ChannelConversationRef
ChannelAttachment
ChannelAction
ChannelDelivery
```

NOT:

```ts
TelegramUpdate
TelegramChat
TelegramCallbackQuery
```

outside the adapter.

---

## Implementation Phases

### Batch 1: Foundation (TG-001 to TG-006)

| Phase | Title | Description | Risk |
|-------|-------|-------------|------|
| **TG-001** | Integration Audit | Audit existing conversation/execution infrastructure | Low |
| **TG-002** | Channel Architecture | Define channel abstraction and boundaries | Low |
| **TG-003** | @vestara/channel-types | Canonical channel contracts | Low |
| **TG-004** | Channel Runtime | Gateway and routing | Medium |
| **TG-005** | Telegram Adapter | Telegram Bot API integration | Medium |
| **TG-006** | Webhook + Deduplication | Idempotent webhook processing | Medium |

### Batch 2: Identity & Binding (TG-007 to TG-010)

| Phase | Title | Description | Risk |
|-------|-------|-------------|------|
| **TG-007** | Identity Pairing | Telegram ↔ Vestara principal binding | High |
| **TG-008** | Workspace Binding | Multi-workspace support | Medium |
| **TG-009** | Conversation Binding | Telegram chat ↔ Vestara conversation | Medium |
| **TG-010** | Global Assistant Text | Natural language interaction | Medium |

### Batch 3: Core Integration (TG-011 to TG-016)

| Phase | Title | Description | Risk |
|-------|-------|-------------|------|
| **TG-011** | Outbound Delivery Queue | Async delivery with retry | Medium |
| **TG-012** | Basic Commands | /status, /workspace, /conversations | Low |
| **TG-013** | Execution Projection | Execution status in Telegram | Medium |
| **TG-014** | Activity Room Projection | Activity events in Telegram | Medium |
| **TG-015** | Floating Assistant Continuity | Cross-surface conversation | Medium |
| **TG-016** | Permission Requests | Approval flow via Telegram | High |

### Batch 4: Security & Polish (TG-017 to TG-022)

| Phase | Title | Description | Risk |
|-------|-------|-------------|------|
| **TG-017** | Secure Approvals | Risk-level based approval | High |
| **TG-018** | Notifications | User-configurable notifications | Low |
| **TG-019** | Rich Execution Cards | Visual execution status | Low |
| **TG-020** | Deep Links | Links back into Vestara | Low |
| **TG-021** | Attachments | File/image support | Medium |
| **TG-022** | Reliability | Retry, rate limits, coalescing | Medium |

### Batch 5: Production (TG-023 to TG-029)

| Phase | Title | Description | Risk |
|-------|-------|-------------|------|
| **TG-023** | Integration Settings UI | Settings page for Telegram | Low |
| **TG-024** | Telemetry | Observability and correlation | Low |
| **TG-025** | Security Hardening | Adversarial testing | High |
| **TG-026** | Production Verification | End-to-end testing | Medium |
| **TG-027** | Dogfood | Internal testing | Low |
| **TG-028** | Evidence | Test evidence collection | Low |
| **TG-029** | Freeze | Architecture freeze | Low |

---

## Key Design Decisions

### 1. Telegram as Channel (TG-002)

Telegram is a channel, not an authority. All business logic lives in Vestara. Telegram adapts, translates, and projects.

### 2. Identity Binding (TG-007)

A random Telegram account must never gain access merely because it knows the bot username. Explicit pairing required.

### 3. Conversation Binding (TG-009)

Telegram chats do NOT equal Vestara conversations. Explicit binding preserves the Conversation → Execution → Runtime hierarchy.

### 4. Natural Language First (TG-012)

Commands are convenience, not requirement. Natural language messages enter the same Global Assistant path.

### 5. Permission Enforcement (TG-014)

Telegram must never bypass Vestara's permission system. All approvals go through canonical authorization.

### 6. Delivery Coalescing (TG-016)

Don't send one Telegram message for every execution event. Edit/update messages for progressive status.

### 7. Channel Abstraction (TG-003)

Generic channel contracts enable future Slack, Discord, mobile, CLI support without rebuilding.

---

## Security Invariants

| ID | Invariant | Rationale |
|----|-----------|-----------|
| **TG-S1** | Telegram never owns conversations | Vestara Conversation Authority owns state |
| **TG-S2** | Telegram never owns executions | Vestara Execution Authority owns execution |
| **TG-S3** | Telegram never owns permissions | Vestara Policy Authority owns authorization |
| **TG-S4** | Telegram identity requires explicit binding | No implicit access from bot knowledge |
| **TG-S5** | Telegram approval follows risk policy | High-risk actions require Vestara UI |
| **TG-S6** | Telegram events are canonical | Raw Telegram updates are not exposed |
| **TG-S7** | Telegram secrets use Vestara secret store | No hardcoded tokens |
| **TG-S8** | Telegram webhook processing is idempotent | Telegram may retry updates |

---

## Test Matrix

### Minimum Test Coverage

```text
Webhook authentication
Update parsing
Duplicate update handling
Identity binding
Unknown identity
Workspace resolution
Conversation binding
Natural language message
Command
Callback button
Approval
Denied approval
Execution creation
Execution progress
Execution completion
Execution failure
Message editing
Rate limiting
Delivery retry
Telegram unavailable
Attachment
Invalid attachment
Unauthorized action
Revoked account
Cross-workspace isolation
```

### Security Test Cases

```text
spoofed Telegram identity
replayed callback
expired pairing token
duplicate update
tampered deep link
cross-workspace request
stale approval
approval for completed execution
revoked principal
disabled integration
deleted workspace
malformed attachment
oversized attachment
command injection
runtime-native permission mismatch
```

---

## Delivery Queue States

```text
pending → delivering → delivered
                    ↘ retrying → pending
                    ↘ failed → dead-letter
```

---

## Notification Policy

User-configurable:

```text
Execution completed       ✓
Execution failed          ✓
Approval required         ✓
Agent needs input         ✓
Workflow completed        ✓
Build failed              ✓
Tests failed              ✓
Marketplace updates       ○
General activity          ○
```

Plus:

```text
Minimum severity
Workspace filters
Project filters
Agent filters
Quiet hours
```

---

## Delivery Policy

```text
DeliveryPolicy

origin-only        → Reply to originating channel
active-surfaces    → All currently active Vestara surfaces
all-linked          → All linked channels
notification-only   → Notifications only, no conversation mirroring
silent              → No delivery
```

Default conversational responses: `origin-only`

---

## Observability

### Telemetry Events

```text
telegram.webhook.received
telegram.update.duplicate
telegram.message.normalized
telegram.identity.resolved
telegram.delivery.queued
telegram.delivery.sent
telegram.delivery.failed

channel.message.received
channel.action.received
channel.delivery.requested
channel.delivery.completed
```

### Correlation

```text
correlationId
principalId
workspaceId
conversationId
executionId
channel
externalMessageId
```

---

## Production Deployment

### Webhook Architecture

```text
Telegram
    │ HTTPS
    ▼
Webhook Endpoint
    │
    ▼
Ingress validation
    │
    ▼
Telegram Adapter
```

Production uses webhooks, not long polling.

---

## Vertical Slice Proof

The most important first production proof:

```text
Telegram
   │
   │ "Run affected tests"
   ▼
Authenticated Vestara Principal
   ▼
Bound Workspace
   ▼
Global Assistant Conversation
   ▼
Execution
   ▼
RuntimeExecutionPort
   ▼
Fake/OpenCode Runtime
   ▼
Canonical observations/events
   ├────────► Activity Room
   ├────────► Floating Assistant
   └────────► Telegram
                │
                ▼
       "✓ 48 tests passed"
```

If this one vertical slice works with:
- One Conversation
- One Execution identity
- Canonical permission enforcement
- Activity Room visibility
- Cross-surface continuity
- No Telegram/OpenCode authority leakage

Then the architecture is sound.

---

## Future Extensions (Deferred)

- Voice messages
- Images/screenshots
- Broad file transfer
- Group-chat collaboration
- Slack integration
- Discord integration
- Mobile channel
- CLI channel

These are layered onto the same channel boundary after the basic Telegram path is proven.

---

*This plan document was created as part of the Vestara Intelligence Platform. All decisions are based on the Vestara Intelligence Architecture Review and source inspection of vestara-ai-core.*
