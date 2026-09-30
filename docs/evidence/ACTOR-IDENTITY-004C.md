# ACTOR-IDENTITY-004C — Provider-Neutral Assistant Context Evidence

Status: complete locally; not deployed.

## Corrected path

```text
API principal-scoped resolver
  → AssistantIdentityContext { preferredName }
  → Conversation SendOptions
  → ContextOptions
  → DefaultContextAssembler system message
  → CompletionRequest.messages + CompletionRequest.actor
  → OpenCode/Codex serializers
```

The shared contract is `AssistantIdentityContext` in
`packages/shared/src/provider.ts`. `SendOptions` and `ContextOptions` carry
the same bounded shape. `DefaultContextAssembler` adds a bounded system
context block only when the projection exists:

```text
Current human identity context:
Preferred name: <governed value>
```

This is identity context, not an instruction granting authority. The opaque
principal ID remains in `CompletionRequest.actor` for internal attribution and
is not rendered as conversational identity.

The API conversation and Telegram paths resolve the projection before calling
the conversation service. OpenCode and Codex adapters do not resolve
HumanPrincipal semantics; they consume the prepared provider-neutral messages.

## Provider consistency

Both runtimes receive the same assembled message semantics. No Telegram-
specific, OpenCode-specific, or Codex-specific identity prompt was added.

## Verification

`packages/context/__tests__/surface-context.test.ts` verifies:

- preferred name is rendered when an explicit projection is supplied;
- opaque principal ID is not rendered;
- authority fields are not rendered;
- absent projection produces no invented identity.

Workspace, context, conversation, and API package builds completed for the
changed boundaries. No systemd restart was performed.

## Remaining limitation

The live systemd API must be rebuilt/restarted before this source change is
available in production. No real HumanPrincipal representation was provisioned
as part of this work program.

