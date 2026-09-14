---
title: "VES-TG-001 — Channel Architecture"
version: 1.0.0
status: complete
owner: vestara
last-reviewed: 2026-09-14
next-review: 2026-10-14
milestone: VES-TG-001
phase: TG-002
---

# VES-TG-001 — Channel Architecture

## Overview

This document defines the channel abstraction boundaries, dependency direction, authority ownership, and security invariants for Vestara interaction channels. Telegram is the first channel; the architecture is designed for Slack, Discord, Mobile, CLI, and future channels.

**Central Invariant:** Telegram is a channel into Vestara. It is not a second Global Assistant, second Activity Room, or second execution system.

---

## 1. Boundary Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        VESTARA CORE                                  │
│                                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │  Conversation │  │   Execution  │  │  Permission  │              │
│  │   Authority   │  │   Authority  │  │   Authority  │              │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘              │
│         │                 │                  │                       │
│         └────────┬────────┴──────────────────┘                      │
│                  │                                                    │
│         ┌───────▼───────┐                                           │
│         │  Global        │                                           │
│         │  Assistant     │                                           │
│         │  (OpenCode)    │                                           │
│         └───────┬───────┘                                           │
│                  │                                                    │
│         ┌───────▼───────┐                                           │
│         │  Execution     │                                           │
│         │  Projection    │                                           │
│         └───────┬───────┘                                           │
│                  │                                                    │
└──────────────────┼──────────────────────────────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   Channel Gateway   │
        │   (Route & Deliver) │
        └──────────┬──────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
┌───▼───┐    ┌────▼────┐   ┌────▼────┐
│Telegram│    │  Slack  │   │ Discord │   ...
│Adapter │    │ Adapter │   │ Adapter │
└───┬───┘    └────┬────┘   └────┬────┘
    │              │              │
    │   Adapter-specific         │
    │   boundary (below this     │
    │   line, Telegram types     │
    │   are permitted)           │
    │              │              │
┌───▼──────────────▼──────────────▼───┐
│        Channel-Specific APIs        │
│  Telegram Bot API / Slack API / ... │
└─────────────────────────────────────┘
```

### Responsibility Map

| Layer | Responsibility | Authority |
|-------|---------------|-----------|
| **Vestara Core** | Conversation lifecycle, execution, permissions, workspace state | Canonical — owns all business logic |
| **Global Assistant** | Turn execution, provider/model resolution, tool budget | Canonical — the single execution path |
| **Execution Projection** | Maps execution events to channel-agnostic delivery requests | Canonical — determines what to send |
| **Channel Gateway** | Routes deliveries to correct adapter, manages delivery queue | Canonical — channel-agnostic routing |
| **Channel Adapter** | Translates canonical types to/from channel-specific API | Adapter-specific — owns translation only |
| **Channel-Specific API** | Telegram Bot API, Slack API, etc. | External — never owned by Vestara |

---

## 2. Dependency Direction

```text
@vestara/channel-types          (canonical contracts — no dependencies)
         │
         ▼
@vestara/channel-runtime        (gateway, adapter interface, delivery queue)
         │
         ▼
@vestara/telegram-integration   (Telegram-specific implementation)
         │
         ▼
Telegram Bot API                (external API — never imported as types)
```

### Rules

1. **@vestara/channel-types** depends on nothing. It defines `ChannelMessage`, `ChannelIdentity`, `ChannelConversationRef`, `ChannelDelivery`, `ChannelAction`, `ChannelEvent`, `ChannelAdapter`, `ChannelGateway`.

2. **@vestara/channel-runtime** depends only on `@vestara/channel-types`. It provides `ChannelGateway`, `ChannelAdapter` interface, `DeliveryQueue`.

3. **@vestara/telegram-integration** depends on `@vestara/channel-types` and `@vestara/channel-runtime`. It implements `ChannelAdapter` for Telegram. It may import Telegram-specific types (`TelegramUpdate`, `TelegramChat`, etc.) only within its own boundary.

4. **No upward dependencies.** Telegram types must never leak into `channel-types` or `channel-runtime`. The generic packages must remain channel-agnostic.

5. **No cross-channel dependencies.** Telegram integration must not depend on Slack, Discord, or any other channel integration.

---

## 3. Authority Ownership

| Authority | Owner | Telegram's Role |
|-----------|-------|-----------------|
| **Conversation Authority** | Vestara Core (`ConversationService`) | Telegram creates/uses conversations via binding; never owns conversation state |
| **Execution Authority** | Vestara Core (`ProviderExecutor`) | Telegram triggers execution via `ExecutionBackend`; never owns execution state |
| **Permission Authority** | Vestara Core (`AssistantCapabilityPolicy`) | Telegram projects permission requests as inline keyboards; never bypasses policy |
| **Identity Authority** | Vestara Core (principal system) | Telegram maps external IDs to principals via explicit pairing; never trusts raw Telegram IDs |
| **Workspace Authority** | Vestara Core (workspace registry) | Telegram binds conversations to workspaces; never owns workspace state |
| **Delivery Authority** | Channel Gateway + Adapter | Telegram adapter owns message formatting and API calls; Gateway owns routing and retry |

---

## 4. Security Invariants (TG-S1 through TG-S8)

| ID | Invariant | Component | Enforcement |
|----|-----------|-----------|-------------|
| **TG-S1** | Telegram never owns conversations | `TelegramConversationBindingService` | Creates bindings, never conversation objects; `ConversationService` is the sole conversation authority |
| **TG-S2** | Telegram never owns executions | `GlobalAssistantTextRouter` | Delegates to `ExecutionBackend`; never stores execution state |
| **TG-S3** | Telegram never owns permissions | `TelegramAdapter` | Projects permission requests; decisions go through `AssistantInteractionBroker` |
| **TG-S4** | Telegram identity requires explicit binding | `TelegramPairingService` | One-time token flow; unpaired users get `unpaired` error |
| **TG-S5** | Telegram approval follows risk policy | `AssistantCapabilityPolicy` | `ASK` decisions require inline keyboard approval; high-risk actions require Vestara UI |
| **TG-S6** | Telegram events are canonical | `TelegramWebhookHandler` | Normalizes raw Telegram updates to `ChannelMessage`/`ChannelAction`; raw types never leak |
| **TG-S7** | Telegram secrets use Vestara secret store | API route | `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` from environment; never hardcoded |
| **TG-S8** | Telegram webhook processing is idempotent | `TelegramWebhookHandler` | 10K dedup cache with 24h TTL; duplicate updates return `duplicate: true` |

---

## 5. Data Flow

### Inbound (Telegram → Vestara)

```text
Telegram Update
    │
    ▼
Webhook Endpoint (POST /api/telegram/webhook)
    │
    ▼
TelegramWebhookHandler.handleWebhook()
    │  - Validate secret token
    │  - Parse JSON
    │  - Deduplication check
    │  - Normalize to ChannelMessage / ChannelAction
    ▼
processTelegramMessage()
    │  - Resolve identity binding (Telegram user → Vestara principal)
    │  - Resolve workspace binding (principal → workspace)
    │  - Resolve/create conversation binding (chat → Vestara conversation)
    ▼
GlobalAssistantTextRouter.routeMessage()
    │  - Rate limit check
    │  - Concurrent execution limit check
    │  - Build ExecutionRequest
    ▼
ExecutionBackend.sendMessage()
    │  - ConversationService.sendMessage()
    │  - ProviderExecutor.complete()
    │  - Return ExecutionResult
    ▼
Telegram Adapter → Telegram Bot API (sendMessage)
```

### Outbound (Vestara → Telegram)

```text
Execution Event (conversation:response.completed)
    │
    ▼
Execution Projection
    │  - Map event to ChannelDelivery
    │  - Set content, priority, editMessageId
    ▼
Channel Gateway.sendDelivery()
    │  - Route to TelegramAdapter
    ▼
TelegramAdapter.sendDelivery()
    │  - Build Telegram API payload
    │  - Call sendMessage / editMessageText
    ▼
Telegram Bot API
```

---

## 6. Package Responsibilities

### @vestara/channel-types

| Type | Purpose |
|------|---------|
| `ChannelKind` | Enum of supported channels |
| `ChannelIdentity` | Sender identity (channel-external) |
| `ChannelConversationRef` | Conversation reference (channel-external) |
| `ChannelMessage` | Canonical inbound message |
| `ChannelAttachment` | File/media attachment |
| `ChannelAction` | Button click, command, callback |
| `ChannelDelivery` | Outbound delivery request |
| `ChannelDeliveryContent` | Text, inline keyboard, attachments |
| `ChannelButton` | Inline keyboard button |
| `ChannelDeliveryResult` | Delivery outcome |
| `ChannelConfig` | Channel integration configuration |
| `ChannelEvent` | Channel lifecycle event |
| `ChannelEventType` | Event type enum |

### @vestara/channel-runtime

| Component | Purpose |
|-----------|---------|
| `ChannelAdapter` | Interface: processMessage, processAction, sendDelivery |
| `ChannelGateway` | Routes messages/actions/deliveries to adapters |
| `ChannelEventHandlers` | Event hooks for message, action, delivery, event |
| `DeliveryQueue` | Retry-aware queue with dead-letter support |

### @vestara/telegram-integration

| Component | Purpose |
|-----------|---------|
| `TelegramAdapter` | Implements `ChannelAdapter` for Telegram Bot API |
| `TelegramWebhookHandler` | Webhook normalization with deduplication |
| `TelegramPairingService` | One-time token identity pairing |
| `TelegramWorkspaceBindingService` | Principal → workspace binding |
| `TelegramConversationBindingService` | Chat+Principal → Vestara conversation binding |
| `TelegramPersistentStore` | SQLite persistence for all bindings |
| `GlobalAssistantTextRouter` | Rate limiting, concurrency, execution delegation |
| `TelegramExecutionProjection` | Execution status → Telegram message |
| `TelegramDeliveryQueue` | Priority queue with backoff |
| `TelegramCommandRegistry` | Slash command handling |
| `TelegramInlineKeyboard` | Keyboard builder for common actions |
| `TelegramGroupChatHandler` | Group chat participant tracking |
| `TelegramVoiceHandler` | Voice message processing (stub) |
| `TelegramFileHandler` | File upload/download (stub) |

---

## 7. Telegram-Specific Boundary

Within `@vestara/telegram-integration`, Telegram-specific types are permitted:

- `TelegramUpdate`, `TelegramMessage`, `TelegramCallbackQuery`
- Telegram Bot API method names (`sendMessage`, `editMessageText`, etc.)
- Telegram-specific numeric IDs, chat types, user statuses

**Above the adapter boundary**, only canonical types from `@vestara/channel-types` are used. The rest of Vestara never sees Telegram-specific types.

---

## 8. Delivery Policy

| Policy | Behavior |
|--------|----------|
| `origin-only` | Reply to originating channel (default for conversational responses) |
| `active-surfaces` | All currently active Vestara surfaces |
| `all-linked` | All linked channels |
| `notification-only` | Notifications only, no conversation mirroring |
| `silent` | No delivery |

---

## 9. Observability

### Telemetry Events

```text
channel.message.received      (canonical)
channel.action.received       (canonical)
channel.delivery.requested    (canonical)
channel.delivery.completed    (canonical)
channel.delivery.failed       (canonical)

telegram.webhook.received     (Telegram-specific)
telegram.update.duplicate     (Telegram-specific)
telegram.message.normalized   (Telegram-specific)
telegram.identity.resolved    (Telegram-specific)
```

### Correlation Fields

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

## 10. Future Channel Adaptation

To add a new channel (e.g., Slack):

1. Create `@vestara/slack-integration` package
2. Implement `ChannelAdapter` for Slack API
3. Implement binding services (identity, workspace, conversation)
4. Register adapter with `ChannelGateway`
5. No changes to `channel-types` or `channel-runtime`

The generic infrastructure remains unchanged. Only the adapter and binding layers are channel-specific.

---

## Verification

- **Boundary diagram**: All layers documented with clear responsibilities
- **Dependency direction**: Verified — no upward or cross-channel dependencies
- **Authority ownership**: All 6 authorities mapped to components
- **Security invariants**: TG-S1 through TG-S8 mapped to enforcement components
- **Acceptance criteria**: All 3 criteria met

---

*This document was created as part of VES-TG-001 Phase TG-002 — Define Channel Architecture.*
