---
title: "VES-TG-001 — Telegram Interaction Platform Freeze"
version: 1.0.0
status: complete
owner: vestara
last-reviewed: 2026-09-16
next-review: 2026-10-16
milestone: VES-TG-001
phase: TG-029
---

# VES-TG-001 — Telegram Interaction Platform Freeze

## Purpose

This document freezes the Telegram Interaction Platform boundary after phases
TG-001 through TG-029. It records the contracts that may no longer change
without a new milestone, the invariants that must hold across every future
channel, and the extension points that remain open.

Telegram is a channel into Vestara. It is not a second Global Assistant, a
second Activity Room, or a second execution system.

---

## Frozen Contracts

| Contract | Location | Frozen surface |
|----------|----------|----------------|
| Canonical channel types | `packages/channel-types` | `ChannelMessage`, `ChannelAction`, `ChannelDelivery`, `ChannelEvent`, envelope guards |
| Channel runtime | `packages/channel-runtime` | `ChannelAdapter`, `ChannelGateway` routing |
| Telegram adapter | `packages/telegram-integration/src/index.ts` | `TelegramAdapter` implements `ChannelAdapter`; `processMessage` / `processAction` / `sendDelivery` |
| Webhook normalization | `telegram-types.ts`, `webhook.ts` | Raw Telegram types never leak above the adapter |
| Identity / workspace / conversation binding | `pairing.ts`, `workspace-binding.ts`, `conversation-binding.ts` | Explicit binding only; no implicit access |
| Delivery queue | `delivery-queue.ts` | At-least-once, bounded retries, dead-letter |
| Notification policy | `notifications.ts` | `NotificationPreferences` shape and `NotificationDecisionReason` values |
| Deep links | `deep-links.ts` | HMAC-SHA256 payload canonicalization and `DeepLinkAction` set |
| Attachment policy | `attachments.ts` | `AttachmentPolicy` fields and `AttachmentReason` values |
| Reliability | `reliability.ts` | `DeliveryFailureKind` values and coalescer semantics |
| Telemetry | `telemetry.ts` | `TelegramTelemetryEvent` names and `CorrelationContext` fields |
| Security guard | `security.ts` | `SecurityReason` values; every check is fail-closed |
| Webhook tunnel | `tunnel.ts` | `TunnelProvider`/`TelegramWebhookRegistrar` interfaces, `TunnelState` statuses, public-URL validation |

The persisted schema (`migrations.ts`) is frozen at `telegram.baseline`,
`telegram.delivery-queue`, `telegram.settings`. Future changes are additive
migrations only.

---

## Invariants (must never regress)

| ID | Invariant | Enforcement |
|----|-----------|-------------|
| TG-S1 | Telegram never owns conversations | Binding services only reference Vestara conversation IDs |
| TG-S2 | Telegram never owns executions | Execution projection is a read-only cache; router delegates to the execution backend |
| TG-S3 | Telegram never owns permissions | Approvals route through the canonical policy; the guard never grants authority |
| TG-S4 | Identity requires explicit binding | `TelegramPairingService` one-time token flow |
| TG-S5 | Approval follows risk policy | `TelegramSecurityGuard.checkApproval` rejects stale and post-terminal approvals |
| TG-S6 | Telegram events are canonical | Raw Telegram types stay inside the package |
| TG-S7 | Secrets come from the environment | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_WEBHOOK_SECRET`; telemetry redacts secret-shaped keys |
| TG-S8 | Webhook processing is idempotent | Dedup cache with 24h TTL; duplicate updates return `duplicate: true` |

---

## Phase Completion

| Batch | Phases | Status |
|-------|--------|--------|
| 1 — Foundation | TG-001 – TG-006 | Complete |
| 2 — Identity & Binding | TG-007 – TG-010 | Complete |
| 3 — Core Integration | TG-011 – TG-016 | Complete |
| 4 — Security & Polish | TG-017 – TG-022 | Complete |
| 5 — Production | TG-023 – TG-029 | Complete |

Phase artifacts introduced in batches 4–5:

- **TG-018** `notifications.ts` — notification policy, filters, quiet hours.
- **TG-019** `rich-cards.ts` — progressively-editable execution cards.
- **TG-020** `deep-links.ts` — signed, expiring deep links.
- **TG-021** `attachments.ts` — attachment policy and filename sanitization.
- **TG-022** `reliability.ts` — failure classification, backoff, rate limiting, coalescing.
- **TG-023** `apps/workspace/src/pages/Settings/TelegramSettings.tsx` + `/api/telegram/settings`.
- **TG-024** `telemetry.ts` — canonical events and correlation.
- **TG-025** `security.ts` — fail-closed security guard.
- **TG-026** `__tests__/production-verification.test.ts` — production gate.
- **TG-027** `resolveTelegramActivation` — single profile-activation authority.
- **TG-028** `docs/evidence/VES-TG-001-production-verification.json`.
- **TG-029** this document.
- **TG-030** (extension) `tunnel.ts` — webhook tunnel lifecycle, `/api/telegram/tunnel`, Settings → Telegram "Webhook Tunnel" panel.

---

## Webhook Tunnel (TG-030)

Telegram delivers updates to a public HTTPS URL, while the API binds to
loopback. The tunnel service exposes the local webhook endpoint and registers
the resulting URL with Telegram.

Design constraints:

- **Explicit enable only.** Persisted configuration never spawns a process; a
  tunnel starts only on an explicit `enable` request.
- **Runtime state is not persisted.** Only `provider`, `publicUrl`, and
  `localPort` persist (under `telegram_settings` key `tunnel:default`).
- **No request-driven execution.** The process command and arguments come from
  environment configuration; a request can select only a known provider kind.
- **Fail-closed validation.** `validatePublicUrl` rejects non-HTTPS, loopback,
  and private addresses, and provider-returned URLs are re-validated.
- **Actionable failures.** A missing provider binary raises
  `TunnelProviderUnavailableError` (not a raw `spawn … ENOENT`), and
  `isCommandAvailable` backs a Settings availability probe so the UI reports
  "not installed" instead of failing at enable time.
- **Output parsing is host-restricted.** `extractTunnelUrl` accepts only known
  tunnel hosts (`trycloudflare.com`, `ngrok*`) and strips trailing sentence
  punctuation, so a provider banner's terms-of-service link can never be
  mistaken for the tunnel URL.
- **DNS-readiness gate before registration.** `waitForHostResolution` must
  observe the tunnel hostname before `setWebhook` is attempted. Telegram
  negative-caches an NXDOMAIN it sees during DNS propagation, and a poisoned
  hostname never recovers — a fresh hostname is required. Registration is
  retried, and `enable()` on an already-active tunnel re-attempts a pending
  registration (Settings exposes this as "Retry registration").

Configuration:

| Variable | Purpose |
|----------|---------|
| `VESTARA_TELEGRAM_TUNNEL_COMMAND` | Override the tunnel executable (default: `cloudflared` / `ngrok`) |
| `VESTARA_TELEGRAM_TUNNEL_ARGS` | Override the argument list; `{{url}}` is replaced with the local target |
| `TELEGRAM_BOT_TOKEN` | Required to register the webhook with Telegram |
| `TELEGRAM_WEBHOOK_SECRET` | Sent as `secret_token` on `setWebhook` |

The tunnel behaves as an `origin-only` delivery concern: it changes where
Telegram *reaches* Vestara, never what Vestara is allowed to do.

---

## Open Extension Points

The following remain deliberately unfrozen and may be extended without a new
milestone:

- Additional channel adapters (Slack, Discord, mobile, CLI) layered over the
  same canonical contracts.
- New `NotificationEventType` values (additive to the catalog).
- New `DeepLinkAction` values (must be added to `DEEP_LINK_ACTIONS` and signed).
- Attachment policy tuning per deployment.
- Voice, video, and group-chat handlers (currently stubs/basic).

Any change that alters the frozen contracts above, the persisted schema
non-additively, or an invariant in the table requires a successor milestone.

---

*Freeze recorded 2026-09-16 — Manila (Asia/Manila). Verification manifest:
`docs/evidence/VES-TG-001-production-verification.json`.*
