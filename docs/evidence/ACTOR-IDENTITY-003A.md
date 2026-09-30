# ACTOR-IDENTITY-003A — Canonical Human ExecutionActor Propagation

Status: implemented and locally verified; systemd was not restarted.

## Corrected propagation path

The prior loss boundary was:

```text
Conversation.userId
  → DefaultContextAssembler.buildContext()
  → CompletionRequest without actor
```

The corrected path is:

```text
resolveTelegramIdentity()
  → canonicalBinding.principalId
  → GlobalAssistantTextRouter
  → ExecutionActor { kind: 'human', id: canonicalPrincipalId }
  → ExecutionBackend options
  → ConversationService SendOptions.actor
  → ContextOptions.actor
  → CompletionRequest.actor
  → Assistant OpenCode/Codex provider executor request
```

For the live enrolled subject, the structured value is:

```ts
{ kind: 'human', id: 'hp-524fd68846015a0b' }
```

The existing `Conversation.userId` remains the persisted conversation author
reference and is not replaced by the Telegram pairing ID.

## Files changed

- `packages/shared/package.json`
- `packages/shared/src/provider.ts`
- `packages/context/package.json`
- `packages/context/src/index.ts`
- `packages/conversation/package.json`
- `packages/conversation/src/index.ts`
- `packages/telegram-integration/package.json`
- `packages/telegram-integration/src/global-assistant.ts`
- `apps/api/src/routes/telegram.ts`
- `pnpm-lock.yaml`
- Focused tests in `packages/context`, `packages/conversation`,
  `packages/telegram-integration`, and `apps/api`.

The implementation reuses `ExecutionActor` from
`@vestara/execution-types`; no new identity abstraction was introduced.

## Workspace reread correction

After a canonical workspace bind, `apps/api/src/routes/telegram.ts` now
rereads with `canonicalPrincipalId`. It no longer rereads with the legacy
`identity.principalId` value such as `tg-principal-8531736505`. The legacy
Telegram pairing remains persisted and unchanged.

## UNKNOWN and fail-closed behavior

The router constructs an actor only from its resolved canonical principal ID.
The context assembler omits `CompletionRequest.actor` when no actor is passed.
Existing `resolveTelegramIdentity()` behavior remains unchanged: missing,
unpaired, unknown, inactive, or conflicting identities remain unresolved and
cannot enter Telegram execution.

No display name, Telegram `principalName`, Git identity, OS identity, email,
repository ownership, or `tg-principal-*` value is used as a canonical actor.

## Authority and presentation separation

`ExecutionActor` carries only `kind` and `id`. The propagation does not add or
derive:

- roles or permissions;
- workspace membership;
- credentials or admin state;
- execution or agent authority;
- provider/model selection;
- Telegram display metadata.

Telegram presentation remains in `ChannelIdentity` and
`TelegramIdentityBinding`. It is not copied into `ExecutionActor`.

## Verification

Focused verification passed:

```text
6 test files passed
29 tests passed
```

Coverage includes:

- canonical actor propagation through context assembly;
- actor survival on the provider request boundary;
- no role, display-name, or permission fields on the actor;
- omitted actor for unresolved/unknown context;
- Telegram router propagation of canonical human actor;
- legacy Telegram model/provider fields remain excluded;
- canonical workspace reread rather than legacy pairing reread;
- existing Telegram identity resolution and routing regressions;
- existing conversation runtime attribution compatibility.

Also passed:

- `pnpm dependencies:check`;
- `pnpm build`;
- targeted Biome checks for all changed source and test files.

## Remaining assistant-intelligence boundary

Structured actor identity now reaches the provider-neutral
`CompletionRequest` consumed by the OpenCode and Codex executor adapters. The
current provider prompt serializer does not turn `CompletionRequest.actor` into
natural-language prompt text. That is intentional: no ad-hoc prompt workaround
was added. A future milestone must explicitly define a bounded assistant
context presentation if the model should reason about the actor; it must keep
identity separate from authority and preserve UNKNOWN.

No principal, enrollment, persistence architecture, Activity Room,
authorization semantics, or systemd service was changed by this milestone.
