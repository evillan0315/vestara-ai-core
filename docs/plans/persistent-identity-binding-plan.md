---
title: Persistent Authenticated Identity Binding Plan
version: 1.0.0
status: proposed
owner: vestara
last-reviewed: 2026-09-19
next-review: 2026-10-19
---

# Persistent Authenticated Identity Binding Plan

## Objective

Allow Eddie Villanueva to be recognized consistently across Workspace UI,
Assistant conversations, CLI, and Telegram without treating a surface, email
address, or display name as identity authority.

The target relationship is:

```text
authenticated credential
        ↓ explicit, auditable binding
Vestara HumanPrincipal (eddie)
        ↓ scoped context projection
profile, workspace membership, conversation, surface
```

## Architectural constraints

- `HumanPrincipal` is the canonical human identity; biography and professional
  information remain in governed human-knowledge subdomains.
- A provider account is an external identity claim, not a Vestara principal.
- Authentication proves control of a credential; it does not grant membership,
  role, or permission.
- Surface identity is not authentication identity. Telegram, browser, CLI, and
  Workspace UI must resolve through the same principal boundary.
- Matching by name, email, username, Git author, or Telegram ID alone is
  forbidden. Ambiguous matches fail closed.
- Linking, unlinking, recovery, revocation, and privileged profile changes are
  auditable and never silently merge principals.

## Recommended path

Implement a provider-neutral external-identity runtime first, then add one
authentication provider. Google OIDC or GitHub OAuth can be added through
adapters without changing the canonical principal model. Telegram remains an
explicitly paired participation surface, not an OAuth provider.

## Delivery phases

### Phase 0 — Ownership and threat-model audit

Inventory the existing authentication, session, account, Telegram pairing,
workspace membership, and assistant-context paths. Classify each as
KEEP/ADAPT/REBUILD/RETIRE and confirm the single writer for every identity
record. Produce a threat model covering account takeover, confused deputy,
provider revocation, duplicate accounts, replayed callbacks, and session theft.

**Gate:** ownership matrix approved; no competing identity authority introduced.

### Phase 1 — Canonical external-identity contracts

Define and persist a provider-neutral record:

```text
ExternalIdentity {
  provider: string
  subject: string              # stable provider subject, never email
  principalId: string
  status: active | revoked | unlinked
  linkedAt: timestamp
  revokedAt?: timestamp
  metadata: non-sensitive audit metadata
}
```

Enforce a unique `(provider, subject)` constraint. Permit many external
identities for one principal, but never one external identity for many
principals. Keep the existing `HumanPrincipal` identity-only boundary intact.

**Gate:** storage, collision, ownership, and round-trip tests pass.

### Phase 2 — Authentication adapter and session establishment

Add one provider adapter at the API boundary. Validate issuer, audience,
signature, nonce/state, redirect URI, expiry, and stable subject. Resolve the
validated subject to an `ExternalIdentity`, then establish a Vestara session
containing:

```text
principalId + sessionId + authenticationTime + provider + assurance metadata
```

Do not place biography, roles, or permissions in the authentication token.

**Gate:** unauthenticated requests fail closed; authenticated requests resolve
the correct principal; tokens and provider secrets never reach clients or logs.

### Phase 3 — Explicit account linking and recovery

Provide a signed-in, re-authenticated linking flow. Linking a provider to Eddie
requires proof from the already-authenticated Eddie session plus proof from the
new provider. Same-email accounts never auto-merge. Conflicts require an
explicit recovery or administrator workflow with audit records.

Support unlinking without deleting the principal or its profile. Provider
revocation marks trust revoked and triggers session invalidation according to
the approved recovery policy.

**Gate:** link, unlink, collision, revocation, recovery, and replay tests pass.

### Phase 4 — Surface convergence

Make each surface resolve the authenticated session to the principal:

- Workspace UI: session-backed principal context.
- Assistant: principal/workspace/surface context, with no authority inference.
- CLI: device or browser login flow; no identity from local Git config.
- Telegram: explicit pairing to the principal; raw Telegram IDs remain surface
  data.

Project Eddie’s existing biography only after principal resolution. The profile
seed remains `SELF_DESCRIBED`, `PUBLIC`, and `agentReadable=true`; those fields
do not bypass retrieval or authorization policy.

**Gate:** one Eddie principal is projected consistently across all surfaces;
two principals remain distinguishable.

### Phase 5 — Authorization, observability, and rollout

Connect resolved principal context to the existing membership and authorization
path. Never infer roles from provider claims. Add audit events for login,
link, unlink, revocation, recovery, session creation, and privileged profile
changes. Roll out behind a feature flag with a read-only identity diagnostic
before enabling mutations.

**Gate:** authorization tests, audit completeness, migration rollback, and
dogfood scenarios pass.

## Acceptance scenarios

1. Eddie signs in and is resolved to exactly one active `HumanPrincipal`.
2. A returning session recognizes Eddie without relying on display name or
   email matching.
3. Eddie can link a second provider to the same principal with explicit proof.
4. Same-email accounts from different providers do not auto-merge.
5. An external identity cannot be linked to two principals.
6. Unlinking an identity preserves Eddie’s principal and biography.
7. Provider revocation withdraws trust without deleting Eddie’s profile.
8. Telegram and Workspace UI project the same principal with truthful surface
   provenance.
9. Assistant context identifies Eddie but grants no authority by itself.
10. Suspended or deleted principals cannot establish new sessions, while prior
    records remain attributable.
11. Ambiguous or failed resolution is represented as `UNKNOWN`, never guessed.
12. Every privileged identity mutation has an auditable actor, timestamp,
    target, reason, and result.

## Explicit non-goals

- No automatic recognition from the text “I am Eddie.”
- No identity inference from Git commits, host usernames, email domains, or
  browser/device fingerprints.
- No role or permission assignment from Google, GitHub, or Telegram claims.
- No implementation of OAuth callbacks, schema migrations, or UI in this plan
  document; those require phase-specific authorization.

## Related authority

- `docs/IDENTITY-OWNERSHIP.md`
- `packages/workspace/src/human-principal.ts`
- `packages/workspace/src/human-knowledge.ts`
- `docs/MILESTONES.md` — UIM-001 through UIM-011
- `docs/blueprint/VES-TG-001-channel-architecture.md`
